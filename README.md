# MiaoTiny²Engine · Mt²E

GitHub repository: `MiaoTiny2Engine`.

A lightweight TypeScript game framework. The old game, game assets and unfinished React frontend have been removed.
The current code provides a composable, testable single-process runtime, not a complete editor, server or finished platform engine.

Product direction and the first release threshold are defined in [Product](docs/Product.md) and [Version 0.1.0](docs/Version.md). Version 0.1.0 is planned and unverified: existing package metadata does not establish release readiness. A complete playable game and documented platform evidence are required.

## Usage

Requires Node.js 24+ and pnpm 10.11+.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:all
```

`test:all` runs dependency-boundary checks, all tests, strict type checking, distributable JS/declaration builds and the headless integration example.
`pnpm sample` runs `examples/headless.ts`: three ordered fixed steps, pause and disposal, without loading a browser or Pixi.
`pnpm build` writes `dist/`; it does not publish to npm or deploy anything.

## Entry points and boundaries

- Root entry: headless core namespaces, plus World, Schedule, defineComponent and Loop.
- `core/kernel`: events, ownership/lifetimes, fixed-step clock, input state and seeded RNG.
- `core/db`: validation, tables, indexes, snapshot migration and asynchronous storage adapters.
- `core/ecs`: generational entity handles, archetypes, queries, command queues, scheduling and entity scopes.
- `core/agent`: FSM and flow-field navigation.
- `engine/runtime`: headless composition root with ordered systems, commands and events.
- `engine/assets`, `engine/audio`, `engine/inputmap`, `engine/save`: optional adapters.
- `render`: optional Pixi helpers; textures, camera bounds, layers and manifests are injected by the caller, with no specific-game dependency.

The root entry does not import Pixi. The package is currently private; subpath exports point to built JS. Source examples use relative `.ts` imports.

## Important contracts

DB returns isolated copies and requires CRUD operations for changes. ECS get/query intentionally expose mutable hot paths; direct field assignments do not automatically emit events.
Clearing a World invalidates old entity handles, destroys scopes and clears resources, subscriptions and pending work. Disposal is terminal.
A runtime exception does not roll back systems already executed: the runtime becomes faulted, discards pending queues and requires reset plus world reinitialization.

See [Architecture](docs/ARCHITECTURE.md), [Contracts](docs/CONTRACTS.md) and [Extraction and fixes](docs/EXTRACTION.md).
