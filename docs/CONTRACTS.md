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
