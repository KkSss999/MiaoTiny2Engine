# MiaoTiny²Engine Product Definition

Date: 2026-10-23. Brand: **MiaoTiny²Engine**, abbreviated **Mt²E**. Repository: [MiaoTiny2Engine](https://github.com/KkSss999/MiaoTiny2Engine).

This document guides product scope and development decisions. **Confirmed** means a user decision. **Proposed / pending confirmation** means a reviewable recommendation, not an approved feature commitment. **Current baseline** describes existing code or historical evidence, not completed platform delivery. [Version 0.1.0 scope and gates](Version.md) defines the first release threshold. Detailed API and behavior belong in [Architecture](ARCHITECTURE.md) and [Contracts](CONTRACTS.md); existing evidence is recorded in [Extraction](EXTRACTION.md) and [README](../README.md).

## 1. Executive Summary

### Product definition and problem

**Confirmed:** Mt²E is a lightweight TypeScript game engine/framework initially serving Kaiyi and Agent Kiki. Its representative use case is a top-down action game. It provides a composable, testable pure core and optional adapters so that game development and application delivery have clear responsibilities.

Developers should not have to rebuild input, timing, resources, audio, saving and cleanup for each game, or maintain Rust merely to write TS gameplay. The intended workflow starts from a runnable project, supports changing and debugging a game, and ends with an installable application or Web build.

**Confirmed release principle:** a version must enable building a real game. The first version, 0.1.0, must demonstrate a complete small playable game through supported public APIs. Exposing modules or displaying a technical scene is insufficient. This does not imply commercial readiness or support for every game genre or scale.

### Delivery direction

**Confirmed:** this is not a browser-first product. Installable games are a primary goal, and Web is also a publication target. The official desktop path uses a WebView and **Tauri 2**, validating macOS before Windows. Consumers write TS and must not have to write Rust. Requiring build tools is acceptable; maintaining the Rust shell is the engine's responsibility. The core must not depend on Tauri. There is no mobile delivery milestone.

The desktop implementation has not started; the shell is not yet delivered. **Confirmed:** 0.1.0 ships on macOS only; Windows follows in a later version. Web remains a product target, without a promise that a Web release ships in 0.1.0.

### What lightweight means

The confirmed first priority is **a simple development process**, rather than the smallest package. The remaining rows are working principles for tradeoffs, not measured performance commitments.

| Priority | Meaning | Reviewable outcome |
| --- | --- | --- |
| First, confirmed | TS game development with maintained platform integration | Normal game changes and packaging do not require Rust edits |
| Supporting principle | Understandable, composable, debuggable code | Humans and agents can locate the entry point, contracts, failures and checks |
| Supporting principle | Manageable runtime and delivery costs | Measure on representative devices before choosing optimization budgets |
| Optimization | Package size | Do not damage the development workflow solely to reduce bytes |

### Success criteria

1. A complete small top-down action game is built using supported public APIs, with a clear entry flow, gameplay, feedback, a bounded completion condition, restart and pause/resume.
2. A documented TS workflow builds a macOS application that launches by double-clicking, loads bundled resources without a development server or CDN, and preserves settings and best scores across normal exit and reopen. Exact mid-run quit/resume is not required.
3. Actual packaged WKWebView acceptance covers rendering, resizing, input, focus loss, gesture-started audio, pause/resume, resources and cleanup; failed or untested items remain visible.
4. Core dependency boundaries, regression tests, type checking and builds pass, while the core remains usable without DOM, Pixi or Tauri.
5. The design preserves an independent Web path without making Web or Windows a 0.1.0 release target. Platform and performance claims are limited to recorded evidence. The detailed release gates are in [Version](Version.md).

## 2. User Experience and Functionality

### Initial users

| User | Work | Required support |
| --- | --- | --- |
| Kaiyi | Choose gameplay, edit content, play and judge delivery | Readable examples, explicit configuration, usable builds and runtime feedback |
| Agent Kiki | Read the project, implement TS, test, diagnose and explain changes | Public entry points, contracts, reproducible commands and observable failures |
| Engine maintainer, initially the same collaboration | Maintain core, adapters, Rust shell and toolchain integration | Platform boundaries, regression baselines and native acceptance evidence |

Agent Kiki is a development collaborator, not a requirement for runtime AI, cloud models or an external agent service. Broader audience and distribution commitments should follow evidence from the first game.

### Intended workflow

1. Read the project entry guide and check the existing Node/package-manager and platform tools. Report missing system tools precisely; do not automatically install them or accept new agreements.
2. Create a game project through the supported procedure, which may initially be a documented template/copy workflow rather than a generator. Locate the TS entry point, content definitions, resource manifest and platform configuration.
3. Change TS game rules/data, verify rules headlessly, then inspect interactive input, visuals and audio.
4. Diagnose failures with enough context to distinguish game rules, resources, persistence and host integration.
5. Build and launch the actual application. Record environment, renderer, steps and outcomes with the deliverable.
6. Restart scenes and the application, checking that old input, listeners, resources and asynchronous work do not contaminate the next run.

This is the target workflow; the current repository does not yet provide the full desktop experience.

### User stories and acceptance

| Story | Done means |
| --- | --- |
| As Kaiyi, I want to write TS gameplay so I can focus on the game | The reference game uses supported public APIs; routine changes require neither Rust edits nor core patches |
| As Kiki, I want rules isolated from platform behavior so I can reproduce failures | Rules have headless checks; native behavior has separate acceptance steps; errors identify the relevant boundary |
| As Kaiyi, I want to install and reopen a game so I can assess delivery | The application launches, resources load, declared saved data survives normal reopen, and save errors do not report success |
| As a player, I want focus changes and pause to preserve control | Held input clears on focus loss; resume causes no ghost actions or accumulated simulation burst |
| As a maintainer, I want replaceable adapters so I can support multiple targets | Core dependency checks pass; Tauri calls remain at the host boundary; the Web path remains independent |

### First release and non-goals

**Confirmed:** 0.1.0 must support producing a real small game, including the integration and lifecycle needed to deliver it. A minimal host scene is an intermediate diagnostic milestone, not release evidence by itself. See [Version](Version.md) for ordered foundational work and release blockers.

**Non-goals:** restoring the deleted game/UI; building a smaller Godot, a large general editor, a Node inheritance hierarchy, a general physics solver or a custom GPU backend; first-release mobile delivery. Networking, stores, notarization, business model and license changes are not default scope. There is no promised date, minimum OS, frame-rate target, package-size budget or broad commercial-readiness claim.

### Proposed reference game, pending confirmation

A compact single-player top-down action game is proposed as the reference. An arena shooter with movement, aiming, shooting, wall collision, pursuing enemies, damage, bounded waves, win/loss and restart is a candidate, not an approved feature list. Feasibility against current code must guide scope; this candidate is not finally approved. Exact rules, completion condition, content quantity and art remain pending owner confirmation. Settings and best-score persistence are confirmed; exact mid-run restoration is not required. A one-room design is acceptable only if it is a complete playable experience with entry, feedback, completion and restart, and demonstrates reusable engine integration; a moving sprite or technical sandbox alone does not qualify.

A proposed extensibility check adds an enemy or weapon through game code/data without core patches. A focused diagnostic overlay is proposed instead of a large editor. Neither the specific mechanics nor this check/overlay should be treated as individually approved simply because they appear here.

## 3. Agent Collaboration Requirements

No runtime AI system, model API or cloud control plane is required.

- **Readable:** entry points, public APIs, examples and module responsibilities agree. Product decisions live here, release criteria in Version, and detailed behavior in Architecture/Contracts. All project prose, including README, documentation, comments, diagnostics and test descriptions, uses English; proper names, identifiers and intentional localization fixtures may retain their original form.
- **Testable:** rules can run headlessly with specified time, input and initial state. Tests verify meaningful behavior and failures. Controlled-clock tests do not establish complete deterministic replay.
- **Debuggable:** errors identify phases, assets or data sufficiently to locate a fault. Missing assets and save failures are observable. Diagnostics do not become a second gameplay state authority.
- **Reviewable:** every delivery names the changed behavior, checks actually run, native evidence and uncovered items. An agent must not label unexecuted checks as passed.

A human or agent should be able to find the gameplay entry, make a TS change and reproduce its checks from the documentation. Exercise details follow the confirmed reference-game scope, not an invented editor or scripting language.

## 4. Technical Responsibilities and Data Boundaries

### Core, adapters and shell

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Pure core | Time, events, ownership, data, entities, scheduling and general behavior primitives | No DOM, Pixi, Tauri or specific-game dependency; usable headlessly |
| Optional adapters | Platform input, assets, rendering, audio and storage | Replaceable implementations with observable capability/failure; no game rules |
| Game application, TS | Rules, content, world assembly, presentation composition and saved-data scope | Uses public entry points; owns game state; no per-sprite Tauri IPC |
| Official desktop shell, engine-maintained | Tauri 2 window, host events, packaging and necessary native capabilities | Rust maintenance belongs to the engine; no per-frame gameplay; macOS first |
| Web entry | Browser composition and standalone Web delivery | Reuses core/adapters without requiring the desktop shell |

Fixed simulation, presentation updates, structural commits and teardown need explicit ordering. Product requirements do not prescribe every API, nor imply that existing adapters already resolve host differences.

### Content versus runtime state

Content describes what can be created: parameters, templates and asset manifests. Runtime state describes a particular run: entities, positions, health and temporary effects. Runtime mutation must not corrupt the source definitions.

Each state domain has one authority. Render objects, debug views and save copies must not hold competing gameplay truth. Saves cover explicitly declared data and versions, not arbitrary ECS objects, functions, textures or browser handles. Missing, corrupt, incompatible and failed writes need distinguishable handling.

Existing DB isolation and mutable ECS hot paths have different contracts. Follow [Contracts](CONTRACTS.md); do not infer that every direct component-field write automatically emits an event.

### Principles informed by static engine research

The following are design review principles inspired by static Godot architecture research, not implemented Mt²E features or claims about an unverified Godot version:

- Make fixed update, rendering, structural commit and destruction phases explicit.
- Distinguish entity identity (`EntityId`), content/template identity (`PrefabId`) and resource handles (`AssetHandle`). These names do not assert existing public APIs.
- Where cross-object references require it, evaluate allocation → component population → reference resolution → activation, avoiding exposure of half-initialized objects.
- Define shared-resource ownership so destroying one view does not destroy assets still used elsewhere.
- Define input state, action mapping and consumption boundaries, including focus loss and pause.
- Borrow separation of responsibilities and lifetime discipline without copying Node inheritance, large reflection/editor systems or GPU backends.

New abstractions should address demonstrated game-development problems. Detailed proposals belong in Architecture/Contracts after scope review.

### Resources, persistence and permissions

Game resources must accompany the built application. Runtime must not depend on a dev server or CDN. Static inspection alone is not proof of offline runtime. Document each target's save location and platform capabilities; do not silently report success on failures. There is no default requirement for accounts, cloud saves or networking, so permissions should follow actual scope.

## 5. Baseline, Risks and Roadmap

### Current capability and gaps

At preparation time, local HEAD and a read-only remote main query both resolved to `bc3ee08993c63f1c8bd74e11ba71aa75be7642ef`. Cleanup/fix PR1 has merged. The old game, resource definitions and unfinished UI are removed. Core kernel/db/ecs/agent and general rendering, audio, input mapping, resource manifests and saving remain.

| Area | Existing evidence | Missing evidence/work |
| --- | --- | --- |
| Core and optional adapters | Source, contracts and headless example | Complete real-game integration through supported APIs |
| Regression baseline | Historical 175 tests, type checking/build and CI passed | Candidate-specific execution and release evidence; test count does not pass release gates |
| Desktop preparation | Existing Node/Rust/Xcode checked; isolated clone and original locked dependencies present | No Tauri host implementation or `.app` |
| Native behavior | Known Apple M4 Mac mini environment | Actual WKWebView, GPU, audio, input and lifecycle acceptance |
| Performance/platforms | No measured product budgets; Windows follows macOS | Representative workload, Windows hardware and support decisions |
| Web delivery | Core boundaries permit independent composition | Complete interactive Web game/build workflow |

### Feasibility of the proposed proof game

The existing Runtime/Loop, ECS/commands/scopes, input state/action mapping, FSM/flow fields, optional Pixi camera/layers/texture helpers, WebAudio and SavePort are useful primitives. They do not yet form a complete supported game workflow. The cleaned baseline lacks the game entry/UI and rules, a current entity-to-view binding, a declared collision/movement layer, complete animation composition and a packaged desktop host. Existing navigation is not a collision solver; DB/SavePort do not define the game's settings/score schema or recovery UX.

The smallest credible proposal therefore reuses those primitives for one bounded arena and a short complete play loop, with only the movement/collision, animation/feedback and content needed by that loop. This reduces scope without pretending that all missing glue is already solved. First confirm feasible rules and interactions, then determine what belongs in engine adapters versus game code. The engine scope is reusable contracts, primitives and delivery support; waves, weapon balance and scoring rules belong to the reference game. No difficulty, content count or completion-time promise is made here.

### Delivery stages

Stages are evidence-driven, with no dates promised. Ordered release gates and current statuses live in [Version](Version.md), avoiding a second release checklist here.

1. Align product and confirm feasible reference-game scope; macOS-only 0.1.0 is already confirmed.
2. Establish contracts and foundations; validate a minimal macOS host as an intermediate milestone.
3. Produce a complete reference game, project workflow and macOS native acceptance evidence; preserve the independent Web boundary.
4. Evaluate the 0.1.0 release gates; publish nothing solely because modules or a demo run.
5. Validate Windows in a later version after macOS. Web remains a target with its own delivery scope to define.

### Risks and open decisions

| Risk | Response |
| --- | --- |
| WebView GPU, audio, focus and background differences | Test packaged apps and keep platform-specific results separate from headless checks |
| Incomplete resource/async-save lifecycle | Define ownership and normal-close paths; test restarts/errors; do not rely on unload callbacks for asynchronous saving |
| Premature framework/editor expansion | Drive abstractions from the selected game's requirements |
| Unsupported cross-platform claims | Require evidence per target; no mobile milestone |
| Rust/toolchain maintenance reaching TS consumers | Maintain shell and build instructions in the engine; document prerequisites and installation/agreement blockers |
| Optimization without measurements | Choose representative devices/load, then measure and decide budgets |

Open decisions include exact reference mechanics and completion condition; necessary rendering/animation and bounded collision capabilities; content/template conventions; settings/best-score schema/version/recovery UX; diagnostic overlay; performance budgets and minimum systems; later Windows milestone and Web support conditions; package/API stabilization; external distribution, license and business arrangements.

Update this document when product scope changes, Architecture/Contracts when public behavior changes, and Version when release criteria or evidence change. Capability claims must remain traceable to validation.
