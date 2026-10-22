import test from 'node:test';
import assert from 'node:assert/strict';
import { imports, checkSource } from './check-deps.mjs';
test('parser discovers static, side-effect, export and dynamic imports, not comments', () => {
 assert.deepEqual(imports(`import './a'; export * from './b'; import('./c'); // import './fake'`), ['./a','./b','./c']);
 assert.throws(() => imports('import(name)'), /computed imports/);
});
test('boundaries reject upward imports and runtime core dependencies', () => {
 assert.equal(checkSource('/src/core/kernel/a.ts', `import '../../engine/a.ts'`, '/src').length, 1);
 assert.equal(checkSource('/src/core/kernel/a.ts', `import '../ecs/a.ts'`, '/src').length, 1);
 assert.equal(checkSource('/src/core/kernel/a.ts', `import 'pixi.js'`, '/src').length, 1);
 assert.deepEqual(checkSource('/src/core/ecs/a.ts', `import '../kernel/index.ts'`, '/src'), []);
});
