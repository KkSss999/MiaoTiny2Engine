import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TOP = { core: [], engine: ['core'], render: ['core', 'engine'] };
const CORE = { kernel: [], db: ['kernel'], ecs: ['kernel', 'db'], agent: ['kernel'] };
export function imports(source, file = 'source.ts') {
  const specs = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const arg = node.arguments[0];
      if (!arg || !ts.isStringLiteral(arg)) throw new Error(`${file}: computed imports cannot be boundary-checked`);
      specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return specs;
}
export function checkSource(file, source, root) {
  const relative = path.relative(root, file).split(path.sep);
  const [from, sub] = relative;
  if (!(from in TOP)) return [];
  const violations = [];
  for (const spec of imports(source, file)) {
    const target = spec.startsWith('#core/') ? path.join(root, 'core', spec.slice(6)) : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
    if (!target) {
      if (from === 'core' && !file.endsWith('.test.ts')) violations.push(`core cannot import external dependency: ${spec}`);
      continue;
    }
    const [to, next] = path.relative(root, target).split(path.sep);
    if (!(to in TOP)) { violations.push(`unknown or out-of-source dependency: ${spec}`); continue; }
    if (to !== from && !TOP[from].includes(to)) violations.push(`${from} cannot import ${to}: ${spec}`);
    if (from === 'core' && to === 'core' && next !== sub && !CORE[sub]?.includes(next)) violations.push(`core/${sub} cannot import core/${next}: ${spec}`);
  }
  return violations;
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const violations = walk(root).flatMap(file => checkSource(file, fs.readFileSync(file, 'utf8'), root).map(v => `${path.relative(root, file)}: ${v}`));
  if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
  else console.log('Dependency boundaries passed: core <- engine <- render; kernel <- db <- ecs; agent -> kernel.');
}
