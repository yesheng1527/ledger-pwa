import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyVisualLock({ lockPath, snapshotDir }) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const actualNames = (await readdir(snapshotDir))
    .filter((name) => name.endsWith('.png'))
    .sort();
  const expectedNames = Object.keys(lock.files).sort();

  assert.deepEqual(
    actualNames,
    expectedNames,
    'official snapshot inventory mismatch',
  );

  for (const name of actualNames) {
    const actualHash = createHash('sha256')
      .update(await readFile(join(snapshotDir, name)))
      .digest('hex');
    assert.equal(
      actualHash,
      lock.files[name],
      `official snapshot hash mismatch: ${name}`,
    );
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedPath === import.meta.url) {
  await verifyVisualLock({
    lockPath: join(
      process.cwd(),
      'docs',
      'verification',
      'seabreeze-phase-1-visual-lock.json',
    ),
    snapshotDir: join(
      process.cwd(),
      'e2e',
      'snapshots',
      'visual.spec.ts',
    ),
  });
  process.stdout.write('Phase-one official visual snapshots are locked.\n');
}
