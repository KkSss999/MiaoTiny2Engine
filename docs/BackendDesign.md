# Engine Internals Proposal

Date: 2026-10-23. **Status: architecture proposal; only the bounded first milestone has a local implementation (see its record below).** “Backend” here means the engine runtime behind game-facing TS APIs, not an online service. Source inspection baseline: main `5fedb24bb39e9bf18025c7c8d9c459610afa0711`.

[Product](Product.md) owns product direction; [Version](Version.md) owns release scope/gates; [Architecture](ARCHITECTURE.md) describes current boundaries; [Contracts](CONTRACTS.md) remains authoritative for existing behavior until an implementation change deliberately updates it. Interfaces in sections 1–11 remain illustrative TS design sketches, not exports or claims of available functionality. The implemented first milestone is distinguished in section 12 and documented in Contracts. Referenced existing types retain their current meanings; proposed types are explained locally.

## 1. Recommendation and limits

Keep the ECS and existing small primitives. Add a managed application driver, scene assembly, asset leases and a Pixi projection adapter around them. Preserve headless operation and existing low-level contracts rather than building a second engine hierarchy.

The initial users remain Kaiyi and Agent Kiki. Development simplicity is primary. Consumers author TS, never Rust; the engine maintains the Tauri 2 shell. 0.1.0 is macOS-only, with settings/best-score saving and no exact mid-run restoration. Windows comes later; 0.2.0 is tentative. The exact top-down proof game remains provisional. This proposal supplies engine boundaries; waves, weapons and scoring rules remain game code/data.

Recommended decisions:

| Decision | Reason | Alternative and tradeoff |
| --- | --- | --- |
| Keep Runtime fixed-step; add an application frame driver | Reuses current headless scheduling and isolates wall clock/host concerns | Expand Runtime into a DOM/Pixi application object: fewer objects but breaks separation |
| Retain one command flush then event drain per completed simulation step | Matches current ordering; avoids an unbounded “flush until settled” loop | Flush after every system/event: different visibility and reentrancy contracts |
| One World/Runtime per active gameplay scene initially | Makes preparation, restart and stale-reference boundaries easier to reason about | Multiple scenes sharing a World: lower migration cost for cross-scene entities but requires query/activation isolation |
| Begin with private scene-time construction and ordinary runtime factories | Reuses current World semantics without building a dynamic construction barrier | Atomic dynamic multi-entity publication needs a separate barrier and remains pending |
| Shared assets use leases; views own only their instances/subresources | Scene teardown cannot invalidate another consumer's texture | Unmanaged global cache or per-view unload: simpler until shared assets break |
| ECS transforms are authoritative; Pixi objects are projections | A single state source supports testing and predictable collisions | Use sprite coordinates as game state: convenient but couples rules to rendering |
| Keep existing StorageAdapter; add a validated profile layer and maintained platform implementation | Settings/scores do not require whole-world serialization | Generic automatic ECS persistence: larger scope and fragile lifecycle semantics |

Do not introduce a server, multiplayer, a general rigidbody solver, a large editor, a custom GPU backend or complete deterministic replay. Borrow Godot-inspired separation of scene facade/backend, phase synchronization, staged construction, input consumption and distinct ownership roles as design principles, not a source-code port. Pixi remains responsible for batching; there is no per-sprite Tauri IPC.

## 2. Current-code assessment

Paths below identify inspected code; the coverage column describes existing tests, not evidence that the proposed behavior works.

| Area | Existing source and behavior | Gap / relevant coverage |
| --- | --- | --- |
| Runtime | [Runtime](../src/engine/runtime/index.ts), [Loop](../src/core/kernel/time/Loop.ts), [Schedule](../src/core/ecs/schedule.ts): supplied delta, fixed steps, ordered systems, commands then events, fault/reset | No input/frame/render driver or safe scene-transition boundary. [Runtime tests](../src/engine/test/contracts.test.ts) cover frame/time, ordering, pause/reset and some reentrancy; [clock tests](../src/core/kernel/time/Loop.test.ts) cover accumulator limits/remainders |
| Queues | [Commands](../src/core/ecs/commands.ts) snapshots one batch; commands enqueued during flush wait. [EventBus](../src/core/kernel/event/bus.ts) drains FIFO batches for at most 32 passes by default; remaining events can survive a successful return | Runtime currently does not fault merely because drain leaves a backlog. Nested emit is possible; nested drain/flush is rejected. [Event regressions](../src/core/kernel/event/test/regressions.test.ts), [ECS regressions](../src/core/ecs/test/regressions.test.ts) cover failures/cancellation, not complete frame policy |
| World | [World](../src/core/ecs/world.ts), [allocator](../src/core/ecs/entity.ts), [scope](../src/core/ecs/scope.ts): generational numeric handles, mutable components, synchronous change callbacks, terminal disposal | Raw numbers do not encode World identity; coincident handles from different Worlds cannot be detected by generation checks alone. Scope adoption tracks membership but does not enforce exclusive ownership. No private prefab activation barrier |
| Scene/content | EntityScope and [Lifetime](../src/core/kernel/event/lifecycle.ts) provide grouping/cascades; [schema definitions](../src/core/db/schemaDef.ts) validate shapes | No scene manager, prefab registry, symbolic entity-reference resolution or atomic visibility contract. Existing World.spawn activates/emits during construction; it cannot be relabeled as staged instantiation |
| Assets/audio | [manifest](../src/engine/assets/manifest.ts) validates plain data; [image loader](../src/render/assets.ts) delegates to Pixi Assets; [WebAudioPlayer](../src/engine/audio/webAudio.ts) has per-id pending/cache/broken maps and disposal checks | No engine-wide lease/refcount, load cancellation or explicit retry policy. WebAudio load failures log/return null; play/unlock are void and there is no suspend/resume port. [Pixi tests](../src/render/test/pixi.test.ts) use mocked image loading/headless objects, not actual GPU/audio |
| Input/render | [InputState](../src/core/kernel/input/index.ts), [InputActions](../src/engine/inputmap/index.ts), [camera](../src/render/camera.ts), [layers](../src/render/layerContainers.ts), [sheets](../src/render/sheets.ts), [tweens](../src/render/tweens.ts) | No platform binding, event routing, fixed-tick edge latch, entity/view binding or full animation composition. Existing clearFrame would lose edges if called after a render frame with no fixed step |
| Saving/host | [SavePort](../src/engine/save/index.ts), [StorageAdapter](../src/core/db/adapters.ts), [Database](../src/core/db/database.ts) provide asynchronous JSON/storage and versioned table snapshots | SavePort.read<T> parses but does not validate T. No settings/score schema, serialized profile writes, Tauri shell or close handshake. [DB tests](../src/core/db/test/db.test.ts) and runtime tests cover many data/error primitives, not native persistence |

The 175-test baseline is useful regression evidence only. None of the new managed interfaces, phase restrictions, cross-World checks, staging, leases or packaged behavior below has passed acceptance.

## 3. Runtime, clock and phase boundaries

### Responsibility and minimal interface

Runtime remains the authority for completed fixed simulation steps and faulted simulation state. Loop plans steps from an injected delta; it does not read time. An application driver owns host time, input routing, presentation scheduling and safe lifecycle boundaries.

```ts
// Proposed, illustrative. Runtime, InputTick and Projection are separate collaborators.
interface AppDriver {
  frame(deltaMs: number): void;
  requestPause(paused: boolean): void;
  requestScene(sceneId: string): void;
  shutdown(): Promise<void>;
}
interface FrameView {
  readonly dt: number;       // Clamped presentation seconds, not simulation dt.
  readonly alpha: number;    // Fixed-step interpolation remainder.
  readonly simulationFrame: number;
}
```

Use separate ordered fixed-system and presentation-update lists. Keep Schedule's numeric phase/insertion ordering inside the fixed list; do not reinterpret existing phase numbers as the new application phases. Presentation callbacks receive a narrow read/projection view, not World mutation authority. Keep asynchronous loading/saving outside frame callbacks; callbacks are synchronous, and development checks reject returned thenables rather than silently await them mid-tick.

### Exact frame data flow

| Order | Phase | Authority and work |
| --- | --- | --- |
| 0 | Host ingress | DOM/native handlers record raw input and lifecycle messages; audio unlock is invoked directly in a genuine gesture. Async completions queue results tagged with an owner generation. No World mutation from these callbacks |
| 1 | Input/control boundary | Apply focus/visibility state; freeze raw input; route overlay/menu actions first. Apply pending pause requests from outside the previous batch. Clear gameplay edges when pausing, changing focus or switching scenes |
| 2 | Fixed batch | If running, call Runtime.advance(deltaMs) once. Loop plans bounded steps; for each step latch InputTick, run fixed systems in phase/insertion order, then the commit and events subphases below. Never use a second clock to predict steps |
| 2a | Commit per step | Exactly one CommandBuffer.flush snapshot after all fixed systems. Includes commands left by earlier events plus this step's systems. No recursive flush. Structural despawns and their synchronous lifetime cleanup happen here |
| 2b | Events per step | Call EventBus.drain with an explicit pass cap; events posted by handlers enter its later passes. Commands posted by handlers remain for the next simulation step, including a later step in the same catch-up batch. No post-event command flush |
| 3 | Presentation update | Once per display frame, after all completed fixed steps; read state, calculate camera/interpolation, advance visual-only effects. Still runs while paused/zero-step for menus; gameplay animation pause policy is explicit |
| 4 | Projection/render | Sync Pixi views, transforms and content changes; render once using the chosen renderer loop. Disable a second autonomous Pixi simulation/render ticker |
| 5 | Lifecycle/destruction boundary | Apply one selected reset/transition/stop request outside Runtime.advance, including paused/zero-step frames. Stop takes priority over reset, then scene transition; repeated equivalent requests coalesce. Detach views before releasing assets. Drain a snapshot of presentation cleanup work, not gameplay commands/events |

InputTick setup/finish belongs inside each fixed step, not merely around Runtime.advance. This requires a small Runtime step hook or equivalent ordered adapter integration, tested before release. External code must not read Loop.frame as the completed frame of every catch-up step.

### Queue, pause and reentrancy contract

- Preserve standalone CommandBuffer failure behavior: the failed operation is consumed, untouched old operations precede new operations, clear cancels the detached remainder. Commands enqueued during a flush wait for the next flush; this includes commands enqueued by synchronous DataChanged callbacks during commit.
- Example: an event in step N queues a despawn. Step N+1 systems still see that entity; the despawn applies at step N+1 commit, and the following render omits it. If N+1 is another catch-up step in the same display frame, it can disappear before that frame renders. Without another fixed step it remains pending until a later step or cancellation on scene teardown.
- Preserve standalone EventBus.drain behavior, including bounded passes and retained backlog. **Proposed managed policy:** if a Runtime step exhausts the configured drain cap with events still pending, fault that step, clear pending events/commands and report the cap/backlog. This is an additive managed behavior change requiring Contracts/test updates; do not silently alter EventBus globally.
- Increment Runtime.frame only after fixed systems, commit and events succeed. No rollback of prior state/observer side effects. Loop's already planned count can exceed completed Runtime.frame after failure; diagnostics must distinguish them.
- A pause requested during a fixed batch takes effect after that whole batch, preserving the current contract. A control-boundary pause prevents the next batch. On resume, reset the host timestamp and discard paused time; retain Loop's existing fractional remainder unless resetting the scene. Presentation time is separately clamped.
- Reject nested driver.frame, Runtime.advance, command flush or event drain, including calls from presentation, notifications and cleanup. Check the Runtime advancing guard before the paused early return; current source does not enforce that ordering in every paused/reentrant combination. Synchronous EventBus.emit remains reentrant at the low level, but managed listeners must not use it to trigger another simulation/frame or immediate structural mutation.
- World.clear/Runtime.reset and terminal disposal run only outside a tick. Callbacks request transitions rather than invoke them immediately. Register/remove systems only at a safe boundary; changes cannot alter the currently executing fixed batch unexpectedly. These are managed-layer restrictions: standalone low-level emit/reset/World operations keep their existing semantics until deliberately changed.
- A reset requested during a fixed batch completes that batch under the existing pause policy, suppresses its outgoing presentation, then runs Runtime.reset at phase 5; it clears input and pending gameplay work. Initialization is explicit application work after reset, not a hidden flush. A stop request similarly completes an already running batch, suppresses subsequent presentation, and disposes at phase 5. A request present before a frame skips the batch. This is cooperative control, not interruption of synchronous JS or rollback.
- Lifecycle requests made while idle are serviced outside frame callbacks without requiring another animation frame. During phase-5 cleanup, do not recursively execute another lifecycle operation: reset/transition requests from the retiring owner are discarded, and repeated stop returns the same completion. Stop is terminal and cannot leave work waiting for a future frame. Async shutdown cleanup is awaited outside the synchronous frame guard; no further frames run while stopping. These rules replace a blanket “wait until the next boundary” rule for terminal teardown.
- When paused or when Loop plans zero steps, do not flush gameplay commands/events just to make a UI action work. UI/profile commands belong to application control, not the simulation queues. A paused scene can therefore be closed without flushing stale gameplay commands.
- On simulation exception: fault Runtime, clear queues, skip projection of that partially completed frame, run safe teardown/control boundary, and display diagnostics through an independent shell/overlay. Presentation/renderer exceptions fault the driver, stop subsequent frames and preserve the last completed simulation counter; they do not fabricate a successful simulation rollback. Cleanup is attempted even after a failure.

### Migration and acceptance

Reuse Runtime/Loop/Schedule. Add the driver outside core; add only the per-step input hook and managed backlog policy proven necessary. Keep headless advance working without presentation. Existing pause/reentrancy/queue tests are reused; add trace tests for zero/one/multiple-step frames, event→command→next-step visibility, command-during-flush deferral, event cap exhaustion, pause-inside-batch, nested advance after pause, presentation failure and teardown requests. Repeat identical delta/input sequences for controlled-clock consistency; do not claim full deterministic replay.

## 4. World/ECS authority and disposal

### Responsibility and TS boundary

World owns entity allocation, components, queries and entity/component lifetimes. Fixed systems own in-place field writes during their ordered execution; all structural mutations in managed systems go through commands. Command callbacks may apply component/structural writes during commit; queued event listeners submit commands for later mutation instead of writing simulation state directly. Initialization inside a controlled construction/commit boundary may use immediate World operations.

```ts
// Proposed boundary reference. Entity remains the existing low-level numeric type.
type EntityRef = Readonly<{ world: symbol; value: Entity }>;
interface EntityAccess {
  alive(ref: EntityRef): boolean;
  get<T>(ref: EntityRef, type: ComponentType<T>): T | undefined;
  destroyLater(ref: EntityRef): void;
}
```

A scene creates its World identity token and produces these references; access validates token plus allocator generation. Type branding alone is not a runtime cross-World check. Keep raw Entity for World-local hot paths; do not persist it or accept it as an external/scene-crossing identifier. Symbolic content references resolve to local handles during construction. A foreign-world token is a programmer error; stale reads return absent and stale queued destruction is idempotent.

### Mutation, ownership and data flow

Fixed queries read/write components in-place. Later fixed systems see earlier field writes; structural additions/removals become visible at commit, not halfway through query traversal. Existing direct World methods remain low-level escape hatches, not automatically phase-safe APIs. Initially enforce managed restrictions with narrow contexts and development phase guards, not Proxies/deep copies of every component. A direct field write does not emit DataChanged; presentation samples components, with explicit content revision fields where needed.

Treat an entity reference as a borrowed handle, not ownership. A scene scope owns entity membership; an entity lifetime owns its component scopes. Shared asset leases are independent of that tree. Existing World.setResource clears stored references on reset but does not automatically dispose arbitrary values: register owned cleanup explicitly with an appropriate Lifetime or scene cleanup stack.

Destroy requests are ordered structural commands. At their commit, invalidate the handle and finish entity/component cleanup before deletion observers and subsequent rendering use it. Renderer detach notifications must release only presentation objects, never destroy shared textures. Direct Lifetime.dispose on an entity lifetime is not a recommended substitute for World.despawn: current code can leave an allocated entity whose lifetime has ended.

### Failure, lifecycle and migration

clear remains a reusable reset that invalidates handles/scopes, resources, subscriptions and pending work; dispose remains terminal. Retained component references must not be reused after clear. Keep generation retirement and query projection ordering. Do not introduce transactional rollback of arbitrary component writes or observer effects.

At scene shutdown, stop scheduling first, cancel owner-tagged async work, detach/destroy presentation, then dispose World/scopes and release remaining asset leases. Attempt all cleanup and collect errors; Lifetime currently logs callback errors, so a managed cleanup collector must record them without claiming existing Lifetime aggregates them. Cleanup callbacks cannot resurrect the disposed owner or mutate the World while it resets.

Migration: add EntityRef at scene/application boundaries without changing numeric allocator encoding; add exclusive owning-scope bookkeeping in the scene layer, not a second entity allocator. Reuse [ECS regressions](../src/core/ecs/test/regressions.test.ts) for stale handles, generation exhaustion, clear/dispose, cleanup under throwing listeners and scope edge cases. New tests cover coincident numeric handles in two Worlds, mutation phase guards, repeated queued destroy, resource cleanup ownership and absence of projection writeback. No existing test establishes cross-World safety.

## 5. Scene scopes and prefab construction

### Responsibility and illustrative interface

A scene is a TS composition facade over its own World/Runtime, entity scopes, systems, input route, views and asset leases. It is not an inherited Node tree. The application owns persistent profile state and the asset manager across scene changes. Initially allow one active gameplay scene plus application-owned menu/diagnostics; simultaneous gameplay scenes are deferred.

```ts
// Proposed; PrefabId and SceneId are catalog keys, not entity handles.
type PrefabId = string;
type SceneId = string;
interface Prefab<P> {
  readonly id: PrefabId;
  parse(raw: unknown): P; // Validate content/overrides at the boundary.
}
interface PreparedScene {
  readonly id: SceneId;
  dispose(): Promise<void>; // Also releases a prepared scene never activated.
}
interface SceneController {
  prepare(id: SceneId, signal?: AbortSignal): Promise<PreparedScene>;
  activateAtBoundary(scene: PreparedScene): void;
  instantiateAtCommit<P>(prefab: Prefab<P>, params: P): Promise<readonly EntityRef[]>;
  requestClose(): void;
}
```

**Recommended initial default:** assemble complex objects privately while preparing a scene, then use ordinary validated factories inside command commit for runtime spawning. Existing synchronous World notifications remain observable during those runtime factories; do not promise atomic multi-entity visibility or rollback. A factory failure after mutation follows Runtime's fault-and-reset contract.

The interface above is a possible later scene API, not the first milestone's API. In particular, instantiateAtCommit with all-or-nothing multi-entity publication is pending. If adopted later, its promise settles after publication or construction failure; never await it within a synchronous fixed system. A separate preparation step may load required assets first. Decode/validate parameters before queuing construction. Keep factories as typed TS functions plus validated data; avoid a general reflection/serialization language in 0.1.0.

### Scene-time allocation → population → resolution → activation

For the initial default, these stages run in a private World without external listeners or a running scheduler. Publication means installing that prepared scene at the application boundary. The per-commit batch visibility described below is a **conditional later extension** for dynamic multi-entity prefabs, not an initial guarantee.

1. **Prepare:** validate prefab id/parameters, component defaults and symbolic reference keys; acquire required asset leases outside the tick. Tag the request with scene generation.
2. **Allocate:** reserve the entities for the construction batch and create a local symbolic-key→handle map. They are not visible to ordinary systems, external observers or render bindings yet.
3. **Populate:** create per-instance component data and apply parameters without mutating shared definitions; no external activation effects or subscriptions.
4. **Resolve:** replace local symbolic references with handles, reject missing targets and forbidden cross-World links. Cyclic entity references are allowed if resolved from the preallocated map; ownership cycles are not.
5. **Activate:** at commit, attach owning scopes while still private, publish all members together, establish external bindings, then announce a completed instance. Systems begin observing it on the next fixed step; projection can show it after the current successful step. Activation callbacks queue subsequent structural changes.

**Required gap, not existing behavior:** World.spawn/add currently emit synchronously and expose queryable state during assembly. A private prepared World with no external listeners avoids exposure during initial scene creation, but cannot solve dynamic multi-entity prefabs in an already active World. Before that API ships, add an explicit construction barrier: reserved entities excluded from normal queries and change notifications held until publication, with scoped rollback of unpublished allocations. Direct low-level World behavior must remain documented separately. Do not claim that an Inactive tag alone guarantees isolation when existing queries do not filter it.

The barrier requires a separate implementation review/test gate and is not approved. The initial default is scene-time complex assembly plus simple validated commit factories. Revisit that default only if confirmed proof-game requirements demonstrate a need for atomic dynamic multi-entity spawning. Do not implement a universal prefab system in advance.

### Distinct ownership and lifecycle

Keep three concepts distinct: a grouping/transform relationship (optional data), the scope responsible for runtime destruction, and a content/serialization relationship describing which definitions belong to a prefab. They need not be the same tree. Neither a parent transform nor a serialized reference automatically owns a shared texture or another entity. Recommend one exclusive owning entity scope; other systems borrow references. Current EntityScope.adopt permits overlapping membership, so exclusivity is new scene-layer policy.

Preparation leaves the old scene running; failed preparation disposes the new prepared scene only. At the end-frame boundary, stop old input/scheduling and detach old views, install the fully prepared scene, then dispose the old scene and release leases after its views are detached. A replacement Runtime starts with fresh simulation time. There is no implicit cross-World migration of player entities; persistent profile data is passed explicitly.

Private scene-construction failure disposes that prepared World and its leases; the active scene is retained. For a future construction barrier, validation/resolution failure releases the batch's unpublished handles/leases and reports prefab/stage/key. Ordinary runtime factories have no such rollback guarantee. Once activation publishes and user callbacks run, arbitrary side effects cannot be rolled back. Such a callback failure faults the scene and requests safe teardown. Activation of a replacement scene failing after the old scene stopped enters an application error/menu state, not an undocumented restoration of the old scene. Dispose/cancel on a stale generation is idempotent and never activates a late result.

### Migration and acceptance

Compose scene ownership from EntityScope/Lifetime; add controller/registry only around public contracts. Preserve current immediate spawn semantics until the new managed barrier is explicitly implemented. Reuse scope/reset/cleanup tests. Add tests for valid cross-references, missing reference failure before publication, cyclic references without ownership cycles, per-instance data isolation, observer/query invisibility before activation, exclusive ownership, cancelled preparation, late results, dynamic construction failure and repeated scene replacement. A proof-game playthrough remains a later acceptance gate, not this document's result.

## 6. Asset identities, leases and loading

### Responsibility and minimal TS surface

AssetCatalog remains validated metadata. A separate app-owned manager controls loading, backend cache ownership and leases; loaders perform platform-specific decode/upload. Core sees asset keys/handles only, never Pixi Texture or AudioBuffer.

```ts
// Proposed; canonical key includes asset kind and normalized bundled URL/options.
type AssetKey = string;
interface AssetLease<T> {
  readonly key: AssetKey;
  readonly value: T; // Borrowed backend value; valid only while this lease is live.
  release(): void;  // Idempotent; never exposes Texture.destroy to game code.
}
interface AssetLoader<T> {
  load(key: AssetKey, signal: AbortSignal): Promise<T>;
  unload(value: T): void | Promise<void>;
}
interface AssetsPort<T> {
  acquire(key: AssetKey, options?: { signal?: AbortSignal; retry?: boolean }): Promise<AssetLease<T>>;
  dispose(): Promise<void>;
}
```

Prefer loader-specific typed managers/keys over one registry returning any. AssetHandle is the application-facing identity/lease concept, not an EntityId or PrefabId. Avoid serializing decoded backend objects or equating a URL with permission to destroy its cached texture.

### Data flow, sharing and cancellation

For each canonical key track loading/ready/failed/disposing state, pending waiters and live leases. Concurrent acquires share one load promise. Each successful noncancelled waiter receives its own lease and increments ownership exactly once. Failed/cancelled waiters do not retain a lease.

Caller cancellation cancels only that waiter, not other consumers. Abort the underlying load only when no waiters/leases remain and the loader supports it; decode/upload may not be abortable. If abandoned loading later succeeds, release its result once and never attach it to a dead scene. Use request generations to prevent an old completion/finally handler from deleting a newer retry entry.

The manager owns the cache entry. The last lease release schedules eviction after view detach/end-render, preventing unload during an in-flight projection. A new acquire before eviction cancels eviction and reuses the value; an acquire after unload starts waits for unload then starts a new generation. dispose rejects new acquires, cancels waiters, waits for cleanup and reports unload errors after attempting all entries. No reference-counted manager can protect clients that keep using a value after releasing its lease; development checks should detect stale access where practical.

**Shared versus owned:** views own Sprite/Container instances; atlas consumers own subtexture wrappers but not their source. The asset manager alone unloads a source it loaded/owns. Borrowed externally supplied textures never become manager-owned by implication; require an explicit borrowed registration path with a no-op source disposer. Avoid mixing direct Pixi Assets.unload calls with leased access to the same URL.

### Failure and migration

Required load failure rejects all current waiters with key/stage/cause; optional fallback must be explicit and diagnostic, not fake success. Retain a failed entry to prevent per-frame retries; ordinary acquire rejects with the cached failure. An explicit acquire with retry=true starts a new generation after a failure; concurrent retry callers join that generation. The renderer must not acquire every frame. Unsupported loader/capability is a reported error. Release failures do not resurrect leases and must remain observable; retry cleanup only through a controlled shutdown/eviction policy.

Reuse manifest validation, image loading and audio's dedupe idea, not a claim that they already share a lifetime policy. Wrap the Pixi cache as one ownership backend rather than introducing a competing texture cache. WebAudio currently hides decode failures and keeps broken ids; add observable load/playback diagnostics and a defined explicit retry/reset path before routing it through the proposed manager. Suspend/resume and active-voice cleanup also require adapter work; the existing void AudioPort is not proof of them.

Acceptance: two scenes acquire one key and trigger one load; releasing either does not break the other; last release unloads once; double release is harmless; caller cancellation does not abort another waiter; late success after all owners die is disposed; explicit retry cannot be overwritten by an older completion; unload/acquire races serialize; borrowed sources survive; failures report keys. Reuse current manifest/mock-loader/subtexture tests, add lease/concurrency/cancellation/voice tests, and defer real GPU/audio proof to native gates.

## 7. Input routing and Pixi projection

### Responsibility and minimal interfaces

The platform binder translates DOM/native events into neutral controls. The application routes menu/overlay consumption before gameplay. An action latch produces one logical tick input; the renderer consumes state but never decides simulation movement.

```ts
// Proposed: mouse buttons use the same logical action path as keyboard controls.
interface InputTick {
  down(action: string): boolean;
  takePress(action: string): boolean;
  readonly pointerView: Readonly<{ x: number; y: number }> | null;
}
interface Projection {
  update(view: FrameView): void;
  render(): void;
  viewToWorld(x: number, y: number): Readonly<{ x: number; y: number }>;
  dispose(): void;
}
```

Action names remain game configuration. No gamepad/mobile promise is implied. Bindings choose which physical controls map to an action; overlapping actions share the same consumable physical edge so an overlay cannot consume one alias and still fire gameplay through another. Consuming an action consumes all matching edges for that action in the current input snapshot, matching existing InputActions pressed behavior; it does not consume the held state.

### Input data flow and consumption

Raw OS repeat does not generate new presses. At the frame boundary, route overlays first in explicit priority/registration order; an accepted input edge cannot reach lower routes. Transfer unconsumed gameplay edges into a pending fixed-tick latch. If zero fixed steps run, retain those edges. On the next first fixed step, freeze the latch: takePress consumes once; discard unconsumed tick edges at that step's end. Further catch-up steps see held state but no repeated press edge. A brief press/release between ticks still produces one press with down=false. Multiple presses of the same action before a step coalesce for 0.1.0; high-rate timestamped input is deferred.

UI edges live only for the current routing frame; they are not preserved for later gameplay. While paused/hidden, discard gameplay edges and keep only active control routes. On blur, visibility loss, context menu or pointer cancellation, reset keys, mouse buttons, pressed/latch state and pointer capture. Refocus does not synthesize a press for a physically held key; require a fresh nonrepeat press. Pause/resume clears gameplay holds to prevent immediate firing; actual browser event behavior needs native evidence.

Reuse InputState's primitives and InputActions mapping behavior, but do not call clearFrame on pending zero-step gameplay input. Existing mouse.down has no consumable mouse edge; add that only in the adapter/latch contract with tests. Device coordinates are converted to canvas CSS view coordinates, accounting for canvas offset and CSS size separately from renderer pixel ratio. Snapshot pointerView with input; the fixed aiming system converts it using the last completed unshaken camera transform. Use that same documented transform for targeting; cosmetic shake never changes simulation aim. Coordinate conversion must use one recorded viewport/camera revision during resize, not a mixture of old and new dimensions.

### Projection authority and redraw

ECS position/orientation and applicable animation state are simulation authority. Projection reads previous/current simulation transforms and interpolates using alpha; camera follow and cosmetic shake remain presentation state, with separate RNG. Menus/effects can advance on display dt while paused only according to explicit policy. Visual tweens/particles must not modify collision or health.

Maintain a map keyed by World identity + Entity handle to owned Pixi views. Sync transforms every display frame; change textures/geometry/text only when the relevant content/animation revision changes. A transform change is not a request to redraw Graphics geometry or reload assets. Direct ECS writes do not reliably emit DataChanged, so do not build transform correctness around notifications alone. Remove stale/deactivated bindings before rendering and before releasing their leases. Camera transforms apply to a world layer; screen UI uses an independent layer.

Pixi owns batching and GPU objects. The application chooses one render loop; no Tauri IPC per entity/sprite. A missing required lease or renderer/context failure reports key/phase/renderer information and stops or enters a documented recovery state; do not continue simulating invisibly. Context-loss recovery policy needs a targeted technical test before claiming support.

### Migration and acceptance

Reuse camera/layer/atlas/tween helpers and InputState/Actions behind the new binder/latch/projection. Add a minimal typed view-factory mapping, not a reflection-based entity renderer. Reuse existing camera, tween and input tests. New tests cover zero-step retention, first-of-many-step edge consumption, alias/overlay consumption, rapid press/release, blur while held, pause/refocus, pointer cancel, resize/DPR and camera mapping, interpolation without ECS writes, texture reuse on transform-only changes and stale view removal. Native keyboard/pointer/WebGL checks remain unperformed and required later.

## 8. Platform shell and settings/best-score persistence

### Responsibility and TS ports

The maintained Tauri shell owns window/host lifecycle, app paths and packaging. The TS host adapter translates it into a small platform contract; core and game rules never import Tauri. Browser and memory implementations support portability/tests without implying a Web or Windows 0.1.0 release.

```ts
// Proposed; StorageAdapter is the existing asynchronous string port.
interface HostPort {
  readonly storage: StorageAdapter;
  onFocus(fn: (focused: boolean) => void): () => void;
  onCloseRequest(fn: () => Promise<boolean>): () => void;
  // true permits normal close after flush/cleanup; false keeps the window open.
}
interface ProfileData {
  version: 1;
  settings: Readonly<{ masterVolume: number }>;
  bestScore: number;
}
interface ProfilePort {
  load(): Promise<ProfileData>;
  setSettings(patch: Partial<ProfileData['settings']>): void;
  recordScore(score: number): void;
  flush(): Promise<void>;
}
```

ProfileData is a minimal illustrative schema, not an approved final settings list. Best-score rules belong to the game; validate finite/range values and reject invalid input. No entity handles, live run state or backend resource values are stored.

### Data authority, ordering and failure behavior

The app-scoped in-memory profile is authoritative while running; storage is its durable representation. Game/menu code submits changes through ProfilePort. Load before using persisted settings/scores; deserialize and validate the envelope, not just SavePort.read<T>. Missing save returns documented defaults; malformed/incompatible data reports a recovery choice and must not be silently overwritten during startup. Preserve the corrupt bytes where supported or leave the original untouched until the user chooses reset. The application can run in an explicitly reported temporary-defaults mode, but must not call that a successful load. Disable automatic profile writes in that mode until a recovery/reset decision authorizes replacing the original data.

Mark profile revisions dirty and serialize writes in revision order so an older completion cannot overwrite a newer score/settings snapshot. Flush acknowledges the revision requested at invocation; if more changes arrive during flush they remain dirty for the next write. Disk failure keeps dirty state and reports save status for retry. Settings changes and completed runs trigger saving without waiting for application quit; no per-frame IPC. Reopening after a successful flush must restore that data.

Recommend an engine-maintained native app-data file adapter with scoped keys, validated paths and write-to-temp/replace semantics, subject to actual platform implementation/permission review. Preserve StorageAdapter's string contract; do not expose arbitrary filesystem access to games. Temp/replace does not imply proven crash durability. Alternative: current WebView localStorage for a first integration spike, with simpler setup but origin/location/retention behavior requiring actual packaged tests; do not silently promise it as the final durable contract. A generic DB snapshot is unnecessary for two profile fields.

On close: host prevents the first close, disables new gameplay/profile mutations, resets input and pauses scheduling, flushes the frozen profile revision, attempts scene/audio/asset cleanup, unregisters host listeners, then permits close exactly once. Duplicate close requests share one task; callbacks cannot recursively restart it. If flush fails, keep the window in a recoverable paused state and offer retry or an explicit close-without-saving choice; do not destroy the scene before offering retry. A cleanup failure after a successful save is reported and does not label the save failed; attempt the remaining cleanup before an explicit close decision. Forced termination cannot await the handshake and is outside the exact-save guarantee.

The future application close coordinator pauses and flushes before requesting terminal driver stop. FrameDriver stop itself has no persistence responsibility; invoking it early would remove the recoverable scene needed for save retry. Async application shutdown and synchronous headless stop are separate layers.

Focus/visibility pause reasons are distinct from a player's manual pause: focus regain removes only the focus reason. Reset the host timestamp and gameplay input on resume; do not override a manual pause. Audio unlock occurs in an actual gesture before asynchronous control work; suspension/resumption must be ordered so rapid focus changes cannot leave a stale resume active. A failed native/audio operation remains observable. This needs a small audio lifecycle extension; current AudioPort has no suspend/resume guarantee.

### Migration and acceptance

Reuse SavePort/StorageAdapter and current validators; implement ProfilePort outside core. Add the Tauri adapter/shell only in a later authorized implementation gate. Consumers configure TS ids/resources/game entry; the maintained shell owns Rust glue and capabilities. Bundle runtime assets; do not require a dev server/CDN. Inspect prerequisites without automatic system installation, new agreements, credential creation or security changes.

Reuse JSON/storage/DB error tests. New tests cover validation/defaults/corruption/incompatible versions, no overwrite before recovery decision, serialized writes, dirty revisions, stale write completion, duplicate close, save failure retry, cleanup failures, pause reasons and rapid audio suspend/resume ordering. Later packaged acceptance verifies actual WKWebView resources, offline independence without disturbing the user, audible output, focus, profile reopen and clean shutdown. No native game validation was run for this proposal.

## 9. Bounded collision integration decision

Top-down movement/collision is required by the selected game but not supplied by the navigation flow field. Do not hide it inside rendering or host glue.

**Proposed minimum seam:** a pure fixed-step `move(body, desiredDelta, staticObstacles)` function returning resolved position and contact normals, plus an optional segment/sweep query for projectiles if the approved game requires it. Bodies/obstacles are plain world-space data; the fixed system writes the resulting ECS transform. The algorithm, supported shapes (candidate circle/AABB), sliding rules, contact order, initial overlap and fast-projectile handling remain an explicit integration decision.

Recommendation: pick the smallest bounded solver that covers the approved room/game rules, with finite-input checks and deterministic ordering for specified inputs. Alternative: integrate a physics library through an optional adapter if required interactions justify its complexity. Neither option implies general rigidbody dynamics. Test walls/corners, overlap, simultaneous contacts, zero/large movement and fast shots as applicable; tie performance decisions to measured representative load. Owner input is needed only if the required gameplay interactions change product scope; shape/algorithm choice is an engineering decision to propose with evidence.

## 10. Test disposition and implementation gates

No implementation is authorized by this document. Suggested future test filenames describe work to create, not tests already present. Labels: **reuse** existing contracts/tests unchanged; **modify** existing coverage deliberately alongside a contract change; **new** missing coverage; **defer** later native/product work. The list is not a new passing-test count.

| Area | Reuse | Modify / new | Defer |
| --- | --- | --- | --- |
| Clock/runtime | Loop.test.ts and engine/test/contracts.test.ts current fixed ordering/fault/reset | Modify Runtime reentrancy guard and managed drain-limit tests; new driver phase traces and per-step hooks | Full replay/rollback not planned |
| Queues/world | ECS/event regression tests for cancellation, failure remainder, stale handles and cleanup | New managed phase guards, foreign World refs, exclusive ownership and cleanup collector tests | Threaded ECS and generic transactions |
| Scene/prefab | scope.test.ts and scope/reset regressions | New scene/preparation/generation tests; construction barrier tests only if that design is adopted | Nested gameplay scene stacks and general serialized graph/editor |
| Assets/audio | Manifest validation, mocked load and shared-source Pixi tests | New leases, concurrent waiter/abort/retry/eviction and audio lifecycle/diagnostic tests | Real GPU/audio evidence until native gate |
| Input/projection | InputState tests, camera/tween/layer/atlas tests | New routing/latching/alias/mouse-edge, coordinate transforms, binding ownership and no-writeback tests | Gamepad/mobile; native device behavior until native gate |
| Profile/host | SavePort and DB validation/error tests | New profile revisions/recovery and mock close/focus/audio sequencing | Actual macOS package/reopen/clean-machine acceptance until authorized integration |
| Collision | Flow tests only for navigation, not collision | New bounded movement/query tests after requirements/algorithm decision | General physics solver |

Recommended dependency order, mapped to [Version](Version.md):

1. **D0 Review scope/seams (G0–G1):** accept or revise this proposal; confirm only gameplay interactions affecting collision, input and animation needs. Record API compatibility changes before implementation.
2. **D1 Preserve foundations (G1–G2):** retain existing regression baseline; implement guarded step hooks/driver and exact queue policies, with headless phase/failure traces. Update Contracts for actual changes.
3. **D2 Input/entity boundaries (G1/G3):** implement token-aware boundary references, input latch/routing, phase restrictions and scope ownership. Verify zero/multi-step behavior without Pixi/Tauri.
4. **D3 Assets/scene preparation (G4/G6):** implement lease ownership and private prepared-scene cleanup, initially using scene-time assembly plus ordinary runtime factories. A dynamic multi-entity barrier remains a separate pending scope decision.
5. **D4 Game-required projection/movement (G4–G6):** integrate a single Pixi render loop, camera/animation binding and the bounded collision seam; prove simulation authority and cleanup using mocks/headless objects first.
6. **D5 Profile and maintained host (G7–G8/G10–G12):** profile validation/writes first, then TS platform adapter and engine-maintained macOS Tauri shell, bundled resources and documented build prerequisites. Native acceptance is separate evidence.
7. **D6 Complete-game/reuse evidence (G9/G13–G14):** assemble the approved small complete game through supported APIs, perform adopted extensibility check, full regression and real native/clean-environment acceptance. An isolated diagnostic room is not a release gate pass.

Do not declare gates passed from this source review, code sketches or the previous 175 tests. A functional change to scheduling, staged visibility, saving or resources must update the matching contract and affected validation evidence.

## 11. Remaining owner questions

No additional owner answer is needed to draft the gameplay-independent first milestone below. Before later gameplay integration, resolve these scope questions:

1. Which minimal interactions must the complete proof game support: only player/static-wall collision and simple enemy movement, or additional projectile/body interactions? The arena/waves proposal remains tentative; the engineering team should recommend a feasible bounded loop before final approval.
2. Does the eventual game require atomic runtime spawning of multi-entity prefabs? Recommend scene-time complex assembly plus ordinary runtime factories initially; a construction barrier is pending, not approved or required by default.

Other choices here are engineering recommendations to review, not a request to reapprove confirmed TS-only consumers, macOS-only 0.1.0 or settings/best-score saving. No minimum OS, performance budget, date, commercial readiness or Windows support is inferred.

## 12. First implementation milestone: headless frame/input/lifecycle foundation

**Original bounded implementation plan; now implemented locally as recorded below.** Its purpose is to prove ordering and cleanup without choosing shooting, melee, collision, scene APIs or a native shell. It covers a small part of Version G1–G3, not a complete release gate.

### Files and compatibility

| Existing/proposed file | Bounded change to propose | Compatibility impact |
| --- | --- | --- |
| Existing `src/engine/runtime/index.ts` | Move the advancing guard before the paused early return. Add optional per-step hooks to `advance(deltaMs, hooks?)`, invoked inside the step error boundary: beforeStep → systems → commit → events → finishStep. finishStep runs once in finally for each entered step, including failures, and must not schedule work. Increment the completed frame only after all successful step work/cleanup | Existing constructor and `advance(deltaMs)` calls continue working. A nested advance after pause now throws instead of silently returning. Hook failures fault/reset like system failures; cleanup errors must not conceal the original error |
| Same Runtime file | Add optional `eventPassLimit` and `faultOnEventBacklog` constructor settings with read-only inspection. Preserve existing standalone defaults: 32 passes with backlog retained. The managed driver requires backlog faulting; it validates that the injected Runtime was configured accordingly rather than silently changing it | Direct EventBus/CommandBuffer behavior remains unchanged. Strict backlog failure is opt-in for direct Runtime users and required for the new driver |
| New `src/engine/runtime/driver.ts`; re-export through existing runtime index | Add only a headless FrameDriver with `frame(deltaMs)`, `requestReset()`, `requestStop()` and pause control. Inject Runtime, input latch and synchronous update/render test callbacks. No wall-clock reader, DOM, Pixi, assets or scene controller | Additive API; creating the driver transfers scheduling/reset/disposal ownership of the supplied Runtime to it. Consumers must not drive that Runtime concurrently. Stop disposes once; reset preserves systems and clears World/subscriptions exactly as today |
| New `src/engine/inputmap/latch.ts`; re-export through existing inputmap index | Add a small latch using InputState/ActionMap conventions: collect physical edges/held state, offer one control-consumption boundary, then retain gameplay edges until the first fixed step. Provide begin/finish-step and reset operations for the driver. No configurable route-stack framework | Existing InputState.clearFrame and InputActions.pressed retain their semantics. Retention belongs to the new latch; no silent reinterpretation of old frame APIs. Repeat ingress after reset cannot recreate a hold without a fresh nonrepeat press |
| Existing `docs/CONTRACTS.md` and API comments/examples | Document optional hooks, strict managed backlog behavior, ownership, stop/reset boundaries, zero-step retention and callback restrictions once implemented | Update only with actual implementation evidence; this proposal does not amend current contracts |

Do not modify allocator encoding, World mutation methods, CommandBuffer.flush, EventBus.emit/drain or Loop arithmetic for this milestone. Reuse their contracts. Do not add EntityRef, scope exclusivity, prefab registry/barrier, asset manager, profile storage, native binder or collision code yet. Reject promise-returning driver callbacks; finish-step cleanup must be synchronous and attempt input cleanup even if another hook fails.

### Required traces and exact new acceptance cases

Use Loop stepMs=10, injected deltas and a trace array. No browser timing or GPU. These test paths now exist in the local milestone; the table preserves the planned expectations.

| Proposed test path and exact case name | Expected assertion/trace |
| --- | --- |
| `src/engine/test/driver.test.ts` — `driver orders one fixed step before presentation` | For frame(10): `input, begin:1, system:1, command:1, event:1, finish:1, update, render, boundary`; Runtime.frame=1. Instrument commands/events through their existing public effects, not a second scheduler |
| Same — `event commands wait for the following step commit` | Event 1 enqueues removal. frame(20) contains `system:1, event:1, system:2:alive, remove:2, event:2`; projection sees absence. No extra flush between event:1 and system:2; queued removals survive zero-step frames until a fixed commit |
| Same — `pause requested in a batch applies after that batch` | Request pause in system 1 of frame(20); steps 1 and 2 finish. The next paused frame has only input/control, update, render, boundary and no simulation advance. A command queued before pause remains pending, never flushed by presentation |
| Same — `reset from a callback runs outside advance without flushing pending work` | Request reset in system 1 of frame(20): both steps finish, then reset at boundary; no outgoing update/render. Trace ends `finish:2, reset`; frame=0, old handles dead, queues/input empty, systems retained. Also request reset from update: render is skipped, reset follows. Paused/zero-step reset still executes |
| Same — `stop coalesces and completes without a future frame` | A stop requested in system 1 of frame(20) finishes both steps, skips presentation and disposes once at boundary. Idle stop disposes without frame(). Repeated stop/reset-from-disposal does not recurse or revive the owner. Subsequent frame() rejects; there is no pending future-frame cleanup |
| Same — `fault skips projection and still clears entered step input` | A system throws: finish:1 occurs once, frame stays 0, commands/events/input clear, no update/render, diagnostic/boundary path runs. A throwing update suppresses render and faults the driver while preserving the completed simulation count |
| Existing `src/engine/test/contracts.test.ts` — `nested advance rejects even after pause inside a tick` | A system calls pause then advance: reject reentrancy and fault; no paused early-return escape. Keep existing reset-during-tick test unchanged |
| Same — `managed event backlog faults without changing standalone drain` | A strict Runtime with pass limit 1 receives a self-posting event: after one pass, reject backlog, frame stays 0, queues empty. Separate EventBus.drain(1) still returns with one pending event; default nonstrict Runtime retains its previous behavior |
| New `src/engine/test/inputLatch.test.ts` — `zero-step frames retain one edge until the first fixed step` | Press, frame(4), frame(4), frame(2): update/render can occur each frame, but only the eventual step sees takePress=true once. For a later frame(20), neither step replays that edge |
| Same — `catch-up consumes edges once and preserves held state` | Press then frame(20): first step takePress calls return true then false; second step false; down=true in both. Unconsumed first-tick edges expire at finish rather than leaking into step 2 |
| Same — `control consumption and reset prevent ghost actions` | A control consumer takes a physical edge shared by two action aliases: neither gameplay alias sees it. Press/release before a tick gives one press with down=false. Reset after a no-step frame drops the latch and holds; repeat-only ingress does not restore them |

Also add direct assertions that a command queued during flush is deferred to the next commit, nested driver.frame is rejected, invalid callback thenables fail visibly, and hooks do not alter the existing Loop interpolation remainder. Reuse current clock/queue regression tests rather than replacing their expectations. These are required assertions within the listed test files, not justification for a new general diagnostics framework.

### Small completion gate and work order

1. Add the named failing headless cases first; preserve the baseline tests and record any contract incompatibility.
2. Implement only Runtime guard/hooks/strict option, then latch, then the driver using stub presentation callbacks. Keep one-step ordering explicit; do not implement a second Loop.
3. Demonstrate the trace table, test reset/stop both inside and outside frames, and update Contracts for behavior actually delivered.
4. Pass dependency-boundary checks, the full regression suite, typecheck, distributable build and headless sample. Verify existing `advance(deltaMs)`, raw input and queue tests still pass; import both new APIs through public entries.

Done means every listed case/assertion passes, trace results and commands are recorded against the implementation commit or, for an uncommitted local review, the baseline and working-tree diff, no dependency on DOM/Pixi/Tauri is introduced, and the diff stays inside these bounded files. No native validation or complete-game claim is needed for this milestone. It is not done merely because the historical 175 tests pass. Gameplay choice, dynamic prefab publication and collision design remain pending for later work; no answer to those questions is required to begin this foundation after implementation authorization.

### Local implementation record for the first milestone

Section 12's bounded foundation is now implemented locally on `feat/headless-foundation`; the broader sections remain proposals. Actual APIs/compatibility are documented in [Contracts](CONTRACTS.md). FrameDriver owns synchronous headless stop; no asynchronous app shutdown, host binding or scene transition API was added. InputLatch accepts neutral key/button codes; pointer projection is still future adapter work.

The named runtime/driver/latch acceptance cases were added before implementation. The normal `boundary` trace marker is observed when frame returns with idle state, not a new callback API. Additional cases cover control-boundary pause/reset/stop, cleanup failures, reset-triggered stop, presentation errors and paused-time input clearing. The final check results and limits are reported with this local change; historical release gates remain unverified. Isolated mutation checks confirmed that tests reject paused reentrancy, lost zero-step edges, a post-event command flush and idle-stop deferral. No gameplay, Tauri or dynamic prefab work was performed.

Final local validation against baseline `5fedb24bb39e9bf18025c7c8d9c459610afa0711` plus the uncommitted foundation diff: 41 targeted tests pass; `pnpm test:all` passes all 211 tests, dependency boundaries, typecheck, JS/declaration build and the original headless sample. Built public entries `cbb`, `cbb/engine/runtime` and `cbb/engine/inputmap` load; a public-entry action/stop exercise passes without a browser. Four isolated defect mutations were caught by targeted assertions. Documentation relative links, whitespace and English-prose checks pass. No remote CI, native rendering/audio or packaged application validation was run for this local milestone.

A focused independent local review reproduced and confirmed correction of simulation-requested pause being applied too late (after presentation). A separate pass reproduced and fixed custom thenable execution while rejecting an asynchronous callback. Regression tests failed before each fix and now pass. The reviewer reran all 41 targeted tests and found no further material issues within headless source/test scope. Native and long-running behavior remain unverified.
