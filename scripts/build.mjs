import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { projects } from '../assets/projects.js';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
// Only remove this script's fixed output directory, never a caller-supplied path.
if (fileURLToPath(output) !== fileURLToPath(new URL('../dist/', import.meta.url))) {
    throw new Error('Unexpected output directory');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const entries = ['index.html', '404.html', '.nojekyll', 'assets', ...projects.map(p => p.folder)];
for (const entry of new Set(entries)) {
    await cp(new URL(entry, root), new URL(entry, output), { recursive: true });
}
console.log(`Built ${projects.length} projects in dist/`);
