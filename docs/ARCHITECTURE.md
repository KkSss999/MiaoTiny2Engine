# Architecture Review

## Assessment

The direction is sound: a pure core, optional platform adapters and application-level composition can underpin lightweight 2D games. This revision prioritizes ownership, timing, event and data-change contracts over adding framework layers. It is a reusable foundation, not a completed platform engine. Product goals and release acceptance are defined in [Product](Product.md) and [Version](Version.md).

## Dependency direction

```text
consumer application
  ├─ render (optional Pixi presentation)
  ├─ engine (runtime + assets/audio/input/save adapters)
  └─ core
       ├─ kernel
       ├─ db → kernel
       ├─ ecs → db, kernel
       └─ agent → kernel
```

Core must not depend on third-party runtime packages, browser adapters or applications. The boundary checker uses the TypeScript AST and covers ordinary, side-effect and dynamic imports, re-exports and require; it rejects computed imports that cannot be checked statically. It checks module dependency direction, not behavioral read-only rendering, and does not require internal modules to import exclusively through barrels.

## Data and execution

- ECS holds frequently updated mutable simulation data. Structural operations and explicit set emit change notifications; direct get/query field writes are not tracked. Replay or network synchronization would need an explicit sampling/dirty-tracking strategy.
- DB holds lower-frequency validated content/persistent data. Values are cloned at read/write boundaries; CRUD maintains indexes. Imports validate every replacement table before committing all tables and notifying observers.
- Runtime orders each fixed step: Schedule → commands.flush → bus.drain. Commands created by events wait until the next step; asynchronous I/O is outside the simulation tick.
- Loop plans step counts; Runtime.frame/elapsed and system contexts describe completed simulation steps. Do not treat Loop.frame after a catch-up batch as the frame of every step in that batch.
- Lifetime/EntityScope manage ownership. Applications register systems, resources and subscriptions during initialization and reassemble the world after reset. Disposal is terminal.
- The renderer consumes state and produces presentation objects; it must not become gameplay truth. The framework does not automatically enforce read-only access.

## Preserve rather than expand

Keep the existing archetype ECS, schema/store/table, FSM, flow fields and deterministic RNG. No new backend, microservices, dependency-injection container, network protocol or general editor is introduced. Browser audio still needs a user gesture; images use Pixi's actual asynchronous loader, and callers manage texture ownership.

## Decisions needing real usage evidence

1. Use a minimal real application to examine API usability and rendering lifecycle before splitting packages. Current source boundaries are simpler than a premature monorepo. This intermediate check does not satisfy the complete-game release threshold in [Version](Version.md).
2. Archetype/SparseSet, indexing and cloning costs need benchmarks with representative entity counts; passing unit tests does not establish performance suitability.
3. The global named registry currently rejects different definitions under the same name. If plugins/HMR become requirements, introduce an explicit Registry rather than silently overwriting definitions.
4. The save format covers DB snapshots, not arbitrary ECS state, functions, browser handles or complete game restoration.
5. Replay/multiplayer synchronization requires explicit input recording, random streams, clocks and state serialization; current deterministic primitives are only foundations.
6. WebAudio/Pixi adapter unit tests do not replace real browser, GPU, audio-device or long-running QA.

First prove composition contracts with the headless example, then add capabilities required by applications. Do not turn old-game rules into a supposed general engine layer.
