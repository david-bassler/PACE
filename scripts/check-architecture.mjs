import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function walk(relative) {
  const absolute = path.join(root, relative);
  const items = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) items.push(...walk(child));
    else items.push(child);
  }
  return items;
}

const html = read('index.html');
const sw = read('sw.js');
const jsFiles = walk('js').filter(file => file.endsWith('.js'));
const sources = new Map(jsFiles.map(file => [file, read(file)]));

// 1. DOM IDs stay unique.
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
const idSet = new Set(ids);
for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
  errors.push(`Duplicate DOM id: ${id}`);
}

// 2. Literal DOM references must point at existing markup.
for (const [file, source] of sources) {
  const refs = [
    ...source.matchAll(/(?<!\$)\$\(\s*["']([^"']+)["']\s*\)/g),
    ...source.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)
  ].map(match => match[1]);

  for (const id of new Set(refs)) {
    if (!idSet.has(id)) errors.push(`${file}: missing DOM id "${id}"`);
  }
}

// 3. Relative imports must resolve and the feature graph must stay acyclic.
const graph = new Map(jsFiles.map(file => [file, []]));

for (const [file, source] of sources) {
  const imports = [
    ...source.matchAll(/from\s+["']([^"']+)["']/g),
    ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)
  ].map(match => match[1]).filter(specifier => specifier.startsWith('.'));

  for (const specifier of imports) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    if (!sources.has(resolved)) {
      errors.push(`${file}: import does not resolve: ${specifier}`);
      continue;
    }
    graph.get(file).push(resolved);
  }
}

const visiting = new Set();
const visited = new Set();

function visit(file, stack = []) {
  if (visited.has(file)) return;
  if (visiting.has(file)) {
    const start = stack.indexOf(file);
    errors.push(`Import cycle: ${[...stack.slice(start), file].join(' -> ')}`);
    return;
  }

  visiting.add(file);
  for (const dependency of graph.get(file) || []) visit(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}

for (const file of jsFiles) visit(file);

// 4. Local persistence is centralised.
for (const [file, source] of sources) {
  if (file === 'js/core/storage.js') continue;
  if (/\blocalStorage\b/.test(source)) errors.push(`${file}: direct localStorage access; use core/storage.js`);
}

// 5. Domain modules are deliberately pure.
for (const [file, source] of sources) {
  if (!file.endsWith('-domain.js')) continue;
  if (/^\s*import\s/m.test(source)) errors.push(`${file}: domain modules must stay dependency-free`);
  if (/\bdocument\b|\bwindow\b|\blocalStorage\b|\bindexedDB\b/.test(source)) {
    errors.push(`${file}: domain module touches browser infrastructure`);
  }
}

// 6. Every runtime JS module is available offline.
const cached = new Set([...sw.matchAll(/["']\.\/(js\/[^"']+\.js)["']/g)].map(match => match[1]));
for (const file of jsFiles) {
  if (!cached.has(file)) errors.push(`sw.js does not cache runtime module: ${file}`);
}

// 7. Large files are warnings rather than failures: size is a design signal.
for (const [file, source] of sources) {
  const lines = source.split('\n').length;
  if (lines > 650) warnings.push(`${file}: ${lines} lines; consider another boundary before adding more behaviour`);
}
const htmlLines = html.split('\n').length;
if (htmlLines > 850) warnings.push(`index.html: ${htmlLines} lines; consider revisiting markup boundaries`);

for (const warning of warnings) console.warn(`WARN: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed: ${jsFiles.length} JS modules, ${ids.length} DOM ids.`);
}
