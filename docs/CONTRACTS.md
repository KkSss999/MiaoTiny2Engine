# Core Contracts

## World / Entity

Entities are world-local generational integer handles and cannot cross Worlds. has/get on stale handles do not return a new entity's data; set and ownership access reject stale handles. clear does not reset generations; slots with exhausted generations retire so stale handles cannot revive.

query(A,B) and query(B,A) each preserve their column projection order, including chunks and exclusion queries. Use the command queue for structural changes during iteration.

clear is a reusable reset: entities, resources, query caches, event subscriptions, pending events/commands and old scopes are invalidated. dispose is terminal. Retained Query instances can see the current world; do not retain old component objects as the new world's state.

ECS values are mutable; get/query/snapshot are not read-only data barriers. DataChanged covers explicit structural/CRUD operations, not every field assignment. Synchronous notification errors can occur after an operation commits; callers must not assume rollback.

## Ownership and events

fork/adopt on a disposed Lifetime immediately dispose the child; EventScope cannot register live listeners after disposal. Ownership cycles are rejected. All cleanup callbacks are attempted; Lifetime cleanup errors are logged without preventing other cleanup.

EventBus.emit is synchronous and propagates exceptions. drain and command flush stop on failure, retaining unexecuted batch items without replaying the failed item. clear/reset cancel old batches. Runtime additionally discards pending work and becomes faulted after a failure.

## Time and Runtime

Each system step receives distinct frame/elapsed values. Pause does not accumulate simulation time; a pause inside a tick takes effect after the current catch-up batch. reset clears the clock, world and faulted state while retaining system registrations. Applications must recreate entities, resources and subscriptions.

The catch-up limit discards excess whole steps and preserves the fractional interpolation remainder; maxDeltaMs also clamps long real-time intervals. Runtime does not read a wall clock. System, command and event failures do not provide transaction rollback; reset is required before recovery.

## DB

Data must support structuredClone; reads, CRUD return values and event payloads are isolated copies. Mutating a copy does not update tables or indexes. update cannot change the primary key.

import validates snapshots, migration outputs, rows and duplicate keys before mutation. Failure leaves existing tables unchanged. Tables absent from a snapshot remain unchanged. All participating tables and indexes commit before observers run. Observer failures throw ImportNotificationError(committed=true); load returns ok:false, committed:true, which must not be mistaken for an uncommitted import.

Global schema/shape/component names must not bind to different definitions. Re-registration must reuse the original validator/factory identity; generic casts must not hide conflicts. Use namespace prefixes across modules.

## Persistence, resources and presentation

StorageAdapter provides asynchronous string read/write/delete; SavePort is a JSON convenience layer whose read/write/remove return Promises. Missing keys return null. Corrupt JSON, serialization, quota, I/O and unavailable localStorage fail observably; callers must handle them.

Manifests are validated and injected through parseManifest/createAssetCatalog; no default game content exists. loadImageTexture performs real asynchronous loading and rejects failures rather than reporting fake success. Individual presentation objects must not destroy textures shared through Pixi Assets. Consumers manage atlas subtextures, while callers retain ownership of source textures.

## Headless frame foundation

`Runtime` keeps its existing fixed order: systems → one command-flush snapshot → bounded event drain. A command posted by an event waits until the following fixed step's commit, after that step's systems; it may commit later in the same catch-up batch. Paused/zero-step frames do not flush gameplay work. CommandBuffer and EventBus standalone behavior is unchanged.

Runtime accepts optional positive-integer `eventPassLimit` (default 32) and `faultOnEventBacklog` (default false), available as read-only properties. Strict mode faults if events remain after the configured passes, clears pending commands/events and leaves the completed frame unchanged. Default nonstrict mode retains the previous bounded-backlog behavior.

`advance(deltaMs, hooks?)` optionally runs synchronous beforeStep and finishStep hooks with the system context. finishStep is attempted once in finally for every entered step, even when beforeStep fails. The completed frame advances only after successful simulation and cleanup. Primary and cleanup failures are retained in order in AggregateError when both occur. Thenable hook results are rejected without invoking custom then methods; native Promise rejections are observed to avoid unhandled rejection noise. Already-started async side effects cannot be cancelled or rolled back. Nested advance is rejected even if a callback has just paused Runtime. Direct reset/dispose during advance remains forbidden. Dispose attempts schedule cleanup even if World disposal throws.

`FrameDriver` is exported from `cbb/engine/runtime`; `InputLatch` from `cbb/engine/inputmap`. They require no DOM, Pixi, Tauri or wall clock. Constructing a driver transfers scheduling/reset/disposal ownership of the injected Runtime; do not drive that Runtime separately or share it between drivers. The driver requires a Runtime configured with strict backlog handling. Its state is idle, running, faulted or stopped.

Each driver frame freezes input, invokes the optional control callback, transfers unconsumed gameplay edges, applies control-boundary pause, and calls Runtime.advance once if running. Per-step hooks begin/finish input consumption. One optional update and render follow the whole successful batch. Update receives clamped presentation dt in seconds, interpolation alpha and the completed simulation frame. A paused frame still supports control/update/render and retains the last alpha. Callers supply deltas; a future host must reset its timestamp and discard paused intervals on resume. The driver does not infer time from a global clock.

Driver callbacks must be synchronous. Nested frame calls are rejected. Simulation faults skip presentation; control/update/render faults stop further frames, clear input and pause Runtime without rolling back completed simulation. Errors are thrown to the caller; multiple frame/cleanup errors are aggregated without hiding the first. A faulted driver requires requestReset before another frame, or requestStop for teardown. A reset already explicitly requested by a failing callback can recover at that frame's boundary, but the original failure is still thrown.

`setPaused` during control takes effect before the batch; during simulation it takes effect after the whole batch and before update/render. Requests from presentation apply at the end-frame boundary. Pause transitions clear pending/held input, retain the clock's fractional remainder and never flush commands. `requestReset` during a batch completes that batch, suppresses outgoing update/render and resets outside advance. A request from update suppresses render. Reset clears World/subscriptions/queues/input and time, preserves registered systems and resumes Runtime; application reinitialization is explicit. Idle requests execute immediately without needing another display frame.

`requestStop` is synchronous terminal headless disposal, not a native save/close handshake. It outranks reset, completes an already running batch, suppresses remaining presentation and disposes once at the safe boundary. Idle stop needs no future frame. Repeated stop and reset requests from retiring cleanup cannot recurse or revive the driver; a stop requested during reset is serviced after that reset. Input cleanup is attempted even if Runtime disposal fails; errors are surfaced and state remains stopped. Future frame calls reject. Lifetime callbacks still follow their existing logged-error policy; the driver cannot turn those already-swallowed errors into exceptions.

InputLatch maps neutral physical code strings to actions and clones the supplied bindings. `press` ignores OS repeat and duplicate held ingress; `release` clears raw holds. `beginFrame` snapshots held state and new edges; `takeControlPress` consumes physical edges shared by aliases. `finishFrame` preserves the remaining gameplay edges until `beginStep`, including across zero-step frames. A step consumes each edge once through takePress; finishStep discards unconsumed tick edges, so further catch-up steps see held state without replayed presses. Press/release between ticks yields a press with down=false; repeated presses before a step coalesce. `reset` clears raw, pending and in-flight state; repeat-only ingress cannot recreate a hold. The host is responsible for calling reset on focus loss/cancellation; no native binding is provided. Raw InputState.clearFrame and InputActions.pressed retain their original semantics.

Minimal headless usage (after building the package):

```ts
import { Runtime, FrameDriver } from 'cbb/engine/runtime';
import { InputLatch } from 'cbb/engine/inputmap';

const runtime = new Runtime({ faultOnEventBacklog: true });
const input = new InputLatch({ confirm: ['Enter'] });
const driver = new FrameDriver({ runtime, input });
runtime.schedule.add('confirm', () => {
  if (input.takePress('confirm')) { /* Application-owned action. */ }
});
input.press('Enter');
driver.frame(20);
driver.requestStop();
```

This foundation does not implement scenes, prefabs, asset leases, collision, a platform shell or persistent profiles. It is not evidence of GPU/audio/native behavior or a complete game.
