import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyVisualLock } from './verify-seabreeze-phase-1-visual-gate.mjs';

const approvedHashes = {
  'home.png': '035fc2df5243ce72c866cf577f330d673c7fcfd434512b9e5c5be89bb2850fca',
  'login.png': '5bed4ece305186b9190bf831a6cc3961f4b6771f7d77de270b8f8ee87cdfe2c0',
};

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'seabreeze-visual-gate-'));
  const snapshotDir = join(root, 'snapshots');
  const lockPath = join(root, 'lock.json');
  await mkdir(snapshotDir);
  await Promise.all([
    writeFile(join(snapshotDir, 'home.png'), 'approved-home'),
    writeFile(join(snapshotDir, 'login.png'), 'approved-login'),
    writeFile(lockPath, JSON.stringify({
      schemaVersion: 1,
      capturedAt: '2026-07-26',
      approvalState: 'locked-before-phase-1-candidates',
      files: approvedHashes,
    })),
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { lockPath, snapshotDir };
}

test('accepts an unchanged official snapshot inventory', async (t) => {
  const fixture = await createFixture(t);

  await assert.doesNotReject(() => verifyVisualLock(fixture));
});

test('rejects a changed official snapshot', async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.snapshotDir, 'home.png'), 'changed-home');

  await assert.rejects(
    () => verifyVisualLock(fixture),
    /official snapshot hash mismatch: home\.png/i,
  );
});

test('rejects an added official snapshot', async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.snapshotDir, 'extra.png'), 'extra');

  await assert.rejects(
    () => verifyVisualLock(fixture),
    /official snapshot inventory mismatch/i,
  );
});

test('rejects a missing official snapshot', async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.snapshotDir, 'home.png'));

  await assert.rejects(
    () => verifyVisualLock(fixture),
    /official snapshot inventory mismatch/i,
  );
});
