import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
fs.rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
// Smoke-test the built headless entrypoint, not just the source type graph.
await import('../dist/index.js');
