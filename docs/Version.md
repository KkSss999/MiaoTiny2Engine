# Version 0.1.0 Scope and Release Gates

Date: 2026-10-23. Product: **MiaoTiny²Engine (Mt²E)**. Product direction: [Product](Product.md). Technical baseline: [Architecture](ARCHITECTURE.md), [Contracts](CONTRACTS.md), [Extraction](EXTRACTION.md).

**Status: planned / unverified. This is a release definition, not a release announcement.** No gate is marked passed by this document. Publishing this documentation does not implement features, change package versions, tag a version or release the engine.

## 1. Meaning of the first version

**Confirmed requirement:** a version must enable building a real game. 0.1.0 must demonstrate a complete small top-down action game built through supported public APIs, not merely expose modules or run a technical demo.

A qualifying game has a coherent entry/menu or equivalent start flow, playable rules, visible feedback, a win/loss or other bounded completion condition, restart, pause/resume, resource handling, audio and persistence appropriate to its declared scope. The player can understand how to start, act, reach an outcome and play again. Scope may be small; completeness and reusable integration are required. A one-room sample alone is insufficient unless it meets these conditions and demonstrates reuse.

This threshold proves a bounded use case, not commercial readiness, arbitrary game support, large-scale performance, a full editor or a stable forever API.

### Development builds versus released versions

A local build, development snapshot, packaged diagnostic scene or prerelease experiment is not an accepted 0.1.0 release. An existing `0.1.0` string in package metadata is not evidence that this threshold has been met. Do not bump metadata or tag until the eventual release procedure is separately authorized and all required gates have accepted evidence.

## 2. Scope, proposals and platform decisions

### Confirmed product constraints

- Initial developers: Kaiyi and Agent Kiki; gameplay and content authoring use TS. Consumers do not write Rust; the engine maintains the Tauri 2 shell. Build-tool prerequisites are acceptable.
- Pure core with optional adapters. Core stays independent of DOM, Pixi, Tauri and specific game rules.
- Installable applications and Web delivery; WebView/Tauri 2 for official desktop integration, macOS before Windows. **Confirmed: 0.1.0 is macOS-only; Windows follows later.** Web remains a product target, not a promised 0.1.0 release.
- All project prose is English, including documentation and comments; preserve proper names, identifiers and intentional localization fixtures.
- No mobile delivery milestone. No invented dates, minimum OS or performance/package-size promises.

### Proposed reference game, pending owner confirmation

A compact single-player top-down action game is proposed. An arena shooter with movement, aiming, shooting, wall collision, pursuing enemies, damage, bounded waves, win/loss and restart is a candidate. Scope must follow feasibility against actual code; these mechanics are not finally approved. Exact objective, rules, room count, enemy/weapon count and presentation require owner confirmation before implementation scope is locked.

**Confirmed persistence scope:** settings and best scores. Exact mid-run quit/resume is not required. Save schema, timing and error/recovery UX still need technical definition.

**Engine versus reference game:** reusable API/lifecycle, time/input, game-required presentation/collision composition, storage, diagnostics and delivery are engine scope. Waves, enemies, weapons, scoring, balance and win conditions are game features used as evidence, not mandatory built-in engine rules. See the current-code feasibility assessment in [Product](Product.md).

**Proposed extensibility acceptance:** add an enemy or weapon using supported game code/data, without changing core or engine adapters. Include a diff and a playable check demonstrating the extension. A small diagnostic overlay is also proposed. These details are recommendations, not individually approved user requirements.

### Platform gate membership

| Target | Ordering and status | Release treatment |
| --- | --- | --- |
| macOS Tauri 2 | First desktop target; planned/unverified | Required native acceptance path in this 0.1.0 draft |
| Web | Confirmed product target; planned/unverified | Preserve independent browser composition; full Web release, browser scope and acceptance belong to a separately confirmed milestone, not a 0.1.0 release promise |
| Windows | Confirmed later than 0.1.0; planned/unverified | Not a 0.1.0 blocker; a later version requires actual Windows evidence before support is claimed |
| Mobile | No delivery milestone | Outside 0.1.0 scope |

Release notes must state that 0.1.0 supports macOS only. Windows and a Web release require their own future scope and target-specific evidence; preserving portability is still required now.

### Recommended follow-up roadmap

Windows is definitively excluded from 0.1.0. The following version assignments are recommendations, not confirmed delivery commitments or dates:

| Version | Recommended focus | Acceptance boundary |
| --- | --- | --- |
| 0.1.0 | Complete small-game development and macOS delivery | The required gates in this document; no Windows support claim |
| 0.1.x | Bug fixes and workflow refinement from actual game development | Preserve the accepted game workflow and rerun affected regression/native checks; no automatic expansion of platform scope |
| 0.2.0, tentative | Windows delivery after macOS | The same complete game must pass actual Windows build, packaged launch, input/focus, rendering/resources, audio, storage/error handling and lifecycle acceptance before Windows is supported |

Design platform boundaries now so input, audio, storage and host lifecycle can be adapted without moving game rules into the shell or coupling the core to Tauri. These boundaries do not establish Windows support. Confirm the 0.2.0 scope after macOS evidence and an initial Windows feasibility assessment; no release number or schedule substitutes for native acceptance. Web remains a product target with its release milestone undecided.

## 3. Gate ordering and evidence policy

Proceed in the order below: scope → contracts/time → input/presentation/movement → composition/persistence/diagnostics → complete game → workflow/native validation → candidate regression → release decision. Independent foundational work may overlap, but dependent gates cannot pass before their prerequisites. Evidence must identify the exact candidate commit and environment.

Statuses are **planned**, **unverified**, **blocked**, **failed** or **passed**. Planned means work is scoped; unverified means evidence is absent or incomplete; passed requires recorded results reviewed against the gate. The current foundation exists in parts, but no release gate is passed from the historical 175 tests alone.

Suggested evidence locations below are **reserved future paths**, not files claimed to exist. Use `docs/validation/0.1.0/` for an evidence index and text records, with artifact paths/checksums or links for larger logs, screenshots and builds. Each record must distinguish observed facts, inference and untested cases. Never link to a nonexistent record as if it were proof.

## 4. Ordered foundational and delivery gates

| Gate / current status | Required work and acceptance | Evidence to collect |
| --- | --- | --- |
| G0 Scope — planned | Owner confirms reference-game rules and required capabilities. Settings/best-score persistence and macOS-only release scope are already confirmed; exact gameplay remains provisional. Required capabilities and exclusions are explicit | `scope.md`: decisions, owner review and final acceptance matrix |
| G1 Public API/lifecycle — unverified | Identify supported imports; complete-game code uses them without internal reach-through or core patches. Document initialization, reset/restart, fault handling and terminal disposal; resources/listeners/async tasks have owners | `contracts.md`: API map, examples, contract checks and lifecycle traces; synchronize Architecture/Contracts |
| G2 Time and scheduling — unverified | Define fixed simulation, variable/presentation update, rendering, structural commit and teardown order. Controlled-clock tests cover step counts, per-step frame/time, catch-up limits, pause/resume, reset and faults. Do not promise deterministic replay across all game/platform behavior | `time.md`: ordering contract, reproducible clock cases and outputs |
| G3 Input and focus — unverified | Keyboard/pointer state, coordinate mapping, action binding and consumption work in the selected game. Focus loss/cancellation clear held input; resume does not replay stale actions; document pause input behavior | `input.md`: automated state checks plus actual packaged macOS keyboard, pointer, focus and resize observations |
| G4 2D presentation/resources — unverified | Deliver rendering, camera, layers, asset loading and animation capabilities actually needed by the confirmed game. Verify viewport changes, missing-resource reporting and shared asset ownership. Do not generalize to an unbounded renderer or animation editor | `rendering.md`: chosen capability list, asset manifest/build inspection, real renderer identity and screenshots |
| G5 Movement/collision — planned | Define bounded movement and collision rules for the chosen game, including wall boundaries and applicable projectile/entity interactions. Test relevant corner/high-speed/overlap cases with explicit limitations. No general physics-solver promise | `movement.md`: supported shapes/rules, edge cases and known exclusions |
| G6 Gameplay composition/state — unverified | Complete state transitions from entry through play/outcome/restart. Separate content definitions, runtime authority and presentation. Establish reusable entity/prefab assembly and reference/activation rules where needed; repeat scene setup/teardown without stale entities/listeners | `composition.md`: state map, authority/ownership map and restart evidence; exact prefab API remains a design decision |
| G7 Persistence/errors — unverified | Declare settings/best-score fields/version and save timing; exact mid-run restore is out of scope. Verify normal reopen, missing save, corrupt JSON/data, incompatible version, unavailable storage/write failure and recovery UX. No false success; do not claim arbitrary ECS or crash-safe saving without proof | `persistence.md`: schema/version policy, test cases, target storage location and actual reopen results |
| G8 Audio/diagnostics — unverified | Audio required by the game loads, starts after a gesture and follows pause/resume/cleanup policy. Report errors with useful phase/asset/data context; expose enough state for humans/agents to diagnose the chosen game. Overlay implementation remains proposed | `diagnostics.md` and `audio.md`: failure cases, logs, real AudioContext/resource results and separately verified audible output |
| G9 Complete game/reuse — planned | Play the full confirmed loop, reach the declared outcome, restart and pause/resume; no placeholder transition or blocking workaround. Inspect imports and extension points. Proposed enemy/weapon addition check becomes mandatory only if adopted at G0 | `game.md`: reproducible playthrough, outcome/restart evidence, public-import audit and adopted reuse exercise diff/results |
| G10 Project workflow/portability — planned | Document project creation, prerequisites, dependency setup, build, run, tests, packaging and how to change gameplay/data without Rust. A fresh project created by that procedure reproduces the complete game integration. Keep core/game boundaries independent of Tauri and document the future Web entry boundary; do not report a Web release as delivered | `workflow.md`: commands, tool versions, outputs, walkthrough and dependency-boundary results; no undocumented global tool assumptions. Future Web acceptance needs its own record |
| G11 Packaged macOS — planned | Build a double-clickable `.app` with bundled resources and actual WKWebView acceptance described below. No dev-server/CDN runtime dependency; TS consumer flow needs no Rust edits | `macos.md`: artifact path/hash, build commands, system/chip/renderer, screenshots, lifecycle and native acceptance matrix |
| G12 Reproducibility — planned | Reproduce the documented project/build/run path on a clean machine or an explicitly described clean test environment. Declare Node/package-manager, Rust/Cargo, Xcode tools, target, agreement and dependency-download prerequisites; record steps without hidden caches/credentials | `reproducibility.md`: environment provenance, prerequisite list, exact commands and comparison with documented expectations |
| G13 Candidate regression — unverified | On the final candidate, pass dependency boundaries, full regression, typecheck, distributable build, sample and applicable game/host checks. Validate docs/links and English prose. Revalidate affected native paths after relevant changes | `regression.md`: candidate commit, commands, exit codes, logs and CI results if run; never infer remote CI from local success |
| G14 Release review — planned | Resolve blockers, review evidence and limitations, confirm platform list and publishable artifacts/instructions. The owner explicitly accepts the scoped release; tagging/publishing needs separate authorization | `release-review.md` and evidence index: gate decisions, reviewer, artifact identity, limitations and outstanding nonblocking issues |

The historical suite and existing APIs are useful starting points for G1–G8/G13, but current evidence does not establish a complete game, native delivery or clean-machine reproducibility. No gate requires a general framework abstraction when game-level composition can satisfy the approved scope.

## 5. Native macOS acceptance matrix

Test the actual packaged application, not a browser tab or development-server build. Record pass/fail/untested, steps, expected versus observed behavior, build identity and evidence for every row.

| Area | Required observation |
| --- | --- |
| Launch and resources | Double-click `.app`; complete game starts; bundled images/audio load; production configuration uses local bundled assets and no dev-server/CDN endpoint |
| Offline independence | Inspect build/resources and runtime requests; test with the development server absent. Verify offline operation in an isolated/non-disruptive environment. Source inspection alone is not an offline runtime pass |
| Renderer and resizing | Identify actual WebGL renderer in WKWebView; observe image/animation/camera behavior and viewport changes without broken input mapping |
| Input and focus | Keyboard and pointer actions work; focus loss clears held keys/buttons; refocus restores control without ghost actions |
| Audio | Gesture startup, asset load/decode, actual audible output, pause/resume policy and cleanup. A running AudioContext alone is not proof of sound |
| Pause/resume | Simulation and required presentation/audio follow policy; no accumulated catch-up burst or replayed input |
| Persistence | Save declared data, normal exit, reopen and inspect restored values; exercise declared corruption/error/recovery paths |
| Restart and exit | Complete/win/lose, restart repeatedly, close normally; verify listener/loop/resource cleanup using observable traces/counters and process state where available |
| Full playthrough | Finish the game's declared loop inside the packaged app without relying on dev-only controls |

Do not disable the user's network, put the machine to sleep or disturb unrelated work. If an acceptance item cannot be verified safely, record it as untested; a required item still needs an appropriate test environment before its gate passes. Sleep recovery, forced termination, device switching and long-running stress need explicit coverage decisions. Normal-close success does not prove crash recovery.

## 6. Reproducibility and evidence format

A clean environment must be described precisely: machine/OS/chip, installed prerequisites, tool versions, target architecture, dependency source/lockfiles, commands, artifact path/hash and known manual steps. A directory with warm caches is not a clean-machine result. A documented prerequisite list is necessary but not sufficient evidence of reproducibility.

Build-time dependency downloads are distinct from runtime offline operation. Consumers may install build tools, but system installations and new agreements require permission; an absent prerequisite is a precise blocker, not grounds to change security settings or claim a pass. Do not create/use signing credentials, notarize, publish to stores or incur charges under this documentation task.

Every gate record should state:

- Gate, status, exact commit and artifact identity.
- Preconditions, command/interaction, expected result and observed result.
- Automated logs and/or screenshots/native observations appropriate to the claim.
- Failure, untested scope and platform limitations; next action and owner for a blocker.
- Reviewer and review date when accepted. Do not record irrelevant device identity such as serial numbers.

## 7. Current blockers and non-goals

### Release blockers as of this document

- G0 scope decisions are pending for the exact feasible reference game; macOS-only and settings/best-score decisions are resolved.
- No complete reference game built against supported public APIs exists in the cleaned baseline.
- Public consumer workflow, required rendering/animation/collision/composition capabilities and lifecycle integration need validation and possibly foundational work.
- No Tauri host or `.app` exists; actual WKWebView/GPU/audio/focus/save/exit acceptance is unverified.
- Clean-environment reproduction is unverified. Web release evidence is deferred and must not be claimed for 0.1.0.
- Candidate-specific regression and release review evidence does not yet exist. Historical tests are not a substitute.

These are planning/verification blockers, not tool denials. Documentation can be published while implementation and release remain blocked by these gates.

### Outside the scoped first version

No old-game restoration, large editor, custom GPU backend, general physics solver, full deterministic replay/rollback networking, multiplayer/backend, mobile milestone, broad plugin ecosystem or claims of arbitrary scale. No automatic store submission, signing credentials, notarization, payment, license change or commercial-readiness promise. Specific additional features require scope approval.

## 8. Open decisions

1. Reference-game rules/content, completion condition and whether to adopt the proposed extension exercise and overlay.
2. Supported API surface, template/prefab assembly needs and settings/best-score schema/version/recovery UX (no exact mid-run restore).
3. Game-required rendering/camera/animation and collision/movement boundaries.
4. Later Windows milestone and Web release/browser scope; neither is a 0.1.0 release target.
5. Representative devices/load and measured performance budgets; minimum OS versions based on tools and actual testing, not invented targets.
6. Clean test environment access and safe offline/audio/native verification method.
7. Release artifact distribution, license/business arrangements and any later signing/notarization policy.

Resolve product scope in [Product](Product.md), technical semantics in [Architecture](ARCHITECTURE.md)/[Contracts](CONTRACTS.md), and gate status here. Keep development snapshots clearly separate from an accepted release.
