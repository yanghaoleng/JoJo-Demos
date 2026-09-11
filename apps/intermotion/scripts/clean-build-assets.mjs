import { readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

// Run after a successful build; preserve hand-maintained models, media and icons.
export async function cleanBuildAssets(outDir, bundle) {
  const current = new Set(Object.keys(bundle));
  const directory = resolve(outDir, 'assets');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^intermotion-.*\.(?:js|css|map)$/.test(entry.name)) continue;
    if (!current.has(`assets/${entry.name}`)) await unlink(resolve(directory, entry.name));
  }
}
