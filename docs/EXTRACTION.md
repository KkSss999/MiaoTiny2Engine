# Extraction and Fixes

Based on main commit 52ed569b784c9f50bf32092c06d05f7b1697eb32. Work was confined to a new branch/draft PR, without modifying main or rewriting history. Deleted content below can be recovered from that baseline commit.

## Cleanup boundaries

Removed old gameplay/rules, game JSON, the old application composition entry, React menus/HUD/content editor, the Vite frontend and old screenshot/stress/dev API scripts. No PNG/audio or similar binary assets were found tracked at that baseline; resources were mainly JSON manifests and procedurally drawn placeholders. Missing asset files are not claimed as deleted.

Preserved all core/kernel/db/ecs/agent modules and general audio, input mapping, storage and asset-manifest adapters. Extracted camera, layers, particles, tweens, real asynchronous texture loading and atlas slicing. Although gameplay-adjacent, DamageNumbers is a pooled text effect without game dependencies and remains an optional render helper, outside the headless core. The old Renderer/entity-view bindings were not retained because they depended on the old game's components and rules.

## Audit fixes

- P1: query caches preserve column order; stale has/set and lifetime access validate generations; clear does not reuse old IDs and cancels old scopes/queues/subscriptions; DB import checks all rows and duplicate primary keys before committing.
- Added regression tests for terminal lifecycle states, remaining event/command items after exceptions and reentrant cleanup.
- DB isolated copies preserve index contracts; ECS retains mutable hot paths with explicit event coverage.
- Added headless Runtime with fixed-step frame/time, pause/reset, systems → commands → events ordering and a faulted-state contract.
- Added manifest validation/injection, actual image loading, asynchronous SavePort/StorageAdapter compatibility and observable save errors.
- Reject different schema/component definitions under the same name to prevent unsafe generic aliases.
- Primary-key tampering/concurrent-write issues in the dev API disappeared with removal of the unfinished game editor; no server endpoint remains to patch.
- AST dependency checks, strict type checking, builds, the headless example and GitHub Actions form the full check pipeline.

## Historical validation

Under Node 24.19.0 / TypeScript 5.9.3 / Pixi 8.22.0, pnpm test:all passed: dependency boundaries, 175 tests, typecheck, JS/declaration builds and the headless example. Built package self-reference entries cbb, cbb/render and cbb/engine/runtime were also checked for loading. git diff --check passed.

The first build failed because non-relative #core/*.ts imports could not be safely emitted. These were changed to relative source imports and the full pipeline subsequently passed. A complete clean-baseline run before those changes was not captured; this record does not claim every original-branch test passed.

Tests include headless Pixi objects/texture ownership and a mocked loader. Real browser/GPU/audio output, performance and long-running stress were not exercised. New CI results required remote confirmation; local success alone could not establish CI success. This is a historical record, not a current release gate pass; see [Version](Version.md).

## Deleted paths (84)

- `content/actions.json`
- `content/affixes.json`
- `content/animations.json`
- `content/enemies.json`
- `content/manifest.json`
- `content/statuses.json`
- `content/weapons.json`
- `index.html`
- `scripts/capture.mjs`
- `scripts/dev-api.mjs`
- `scripts/shot.mjs`
- `scripts/soak.mjs`
- `src/App.tsx`
- `src/app/game.ts`
- `src/content/index.ts`
- `src/content/schema.ts`
- `src/content/templates.ts`
- `src/game/affixes.ts`
- `src/game/ai/attacks.ts`
- `src/game/ai/enemyAi.ts`
- `src/game/ai/perception.ts`
- `src/game/ai/playerAi.ts`
- `src/game/ai/steering.ts`
- `src/game/api.ts`
- `src/game/audioBridge.ts`
- `src/game/combat.ts`
- `src/game/components.ts`
- `src/game/damage.ts`
- `src/game/debug.ts`
- `src/game/devChannel.ts`
- `src/game/effects.ts`
- `src/game/entities/factory.ts`
- `src/game/events.ts`
- `src/game/gen/boundary.ts`
- `src/game/gen/floor.ts`
- `src/game/gen/templates.ts`
- `src/game/implants.ts`
- `src/game/input.ts`
- `src/game/layers.ts`
- `src/game/query.ts`
- `src/game/resources.ts`
- `src/game/rewards.ts`
- `src/game/rooms.ts`
- `src/game/settings.ts`
- `src/game/skills.ts`
- `src/game/status.ts`
- `src/game/store.ts`
- `src/game/systems/animation.ts`
- `src/game/systems/enemies.ts`
- `src/game/systems/hudSync.ts`
- `src/game/systems/nav.ts`
- `src/game/systems/playerControl.ts`
- `src/game/systems/projectiles.ts`
- `src/game/systems/roomFlow.ts`
- `src/game/systems/skills.ts`
- `src/game/systems/status.ts`
- `src/game/systems/totems.ts`
- `src/game/systems/weapons.ts`
- `src/game/test/damage.test.ts`
- `src/game/test/harness.ts`
- `src/game/test/rewards.test.ts`
- `src/game/weapons.ts`
- `src/game/world/WorldManager.ts`
- `src/main.tsx`
- `src/render/Renderer.ts`
- `src/render/bossBar.ts`
- `src/render/fx.ts`
- `src/render/nameplates.ts`
- `src/render/placeholders.ts`
- `src/render/playerWeapon.ts`
- `src/render/roomView.ts`
- `src/render/viewRegistry.ts`
- `src/styles.css`
- `src/ui/AssetBrowser.tsx`
- `src/ui/ContentEditor.tsx`
- `src/ui/Hud.tsx`
- `src/ui/MapDebug.tsx`
- `src/ui/Menu.tsx`
- `src/ui/RewardPanel.tsx`
- `src/ui/SpriteGallery.tsx`
- `src/ui/UiShell.tsx`
- `src/ui/useUiScale.ts`
- `src/vite-env.d.ts`
- `vite.config.ts`
