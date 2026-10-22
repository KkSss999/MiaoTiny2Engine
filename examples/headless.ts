import assert from 'node:assert/strict';
import { World, Schedule, defineComponent } from '../src/core/ecs/index.ts';
import { Loop } from '../src/core/kernel/index.ts';
import { Runtime } from '../src/engine/runtime/index.ts';

// A bounded simulation, not a game: no window, renderer, assets or input device.
const Position = defineComponent('example.position', () => ({ x: 0 }));
const Velocity = defineComponent('example.velocity', () => ({ x: 2 }));
const world = new World();
const entity = world.spawn(Position, Velocity);
const observedFrames: number[] = [];
const schedule = new Schedule().add('integrate', (world, ctx) => {
  observedFrames.push(ctx.frame);
  world.query(Position, Velocity).forEach((_entity, position, velocity) => {
    position.x += velocity.x * ctx.dt; // Deliberately mutable ECS hot path.
  });
});
const runtime = new Runtime({ world, schedule, clock: new Loop(10, 10, 100) });
runtime.advance(30);
assert.deepEqual(observedFrames, [1, 2, 3]);
assert.ok(Math.abs(world.get(entity, Position)!.x - 0.06) < 1e-9);
runtime.pause();
runtime.advance(50);
assert.equal(runtime.frame, 3);
runtime.dispose();
console.log('Headless integration passed: 3 ordered fixed steps, pause and disposal.');
