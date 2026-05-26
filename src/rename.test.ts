import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildBaseName, resolveDest, moveResolved, moveUnresolved } from './rename.js';
import type { IdentifyResult } from './identify/pipeline.js';

function result(overrides: Partial<IdentifyResult> = {}): IdentifyResult {
  return {
    messier: null, caldwell: null, ngc: null, ic: null,
    commonName: null, stage: 'exif', resolved: true, capturedAt: null,
    ...overrides,
  };
}

describe('buildBaseName', () => {
  test('messier with common name', () => {
    assert.equal(buildBaseName(result({ messier: 'M31', commonName: 'Andromeda Galaxy' })), 'M31_Andromeda_Galaxy');
  });

  test('messier without common name', () => {
    assert.equal(buildBaseName(result({ messier: 'M42' })), 'M42');
  });

  test('caldwell with common name', () => {
    assert.equal(buildBaseName(result({ caldwell: 'C14', commonName: 'Double Cluster' })), 'C14_Double_Cluster');
  });

  test('ngc replaces space with underscore in identifier', () => {
    assert.equal(buildBaseName(result({ ngc: 'NGC 224' })), 'NGC_224');
  });

  test('ngc with common name', () => {
    assert.equal(buildBaseName(result({ ngc: 'NGC 7000', commonName: 'North America Nebula' })), 'NGC_7000_North_America_Nebula');
  });

  test('ic catalog', () => {
    assert.equal(buildBaseName(result({ ic: 'IC 1805', commonName: 'Heart Nebula' })), 'IC_1805_Heart_Nebula');
  });

  test('messier takes priority over caldwell', () => {
    assert.equal(buildBaseName(result({ messier: 'M31', caldwell: 'C3' })), 'M31');
  });

  test('caldwell takes priority over ngc', () => {
    assert.equal(buildBaseName(result({ caldwell: 'C14', ngc: 'NGC 884' })), 'C14');
  });

  test('ngc takes priority over ic', () => {
    assert.equal(buildBaseName(result({ ngc: 'NGC 1499', ic: 'IC 405' })), 'NGC_1499');
  });

  test('throws when no identifier', () => {
    assert.throws(() => buildBaseName(result()), /no identifier/i);
  });

  test('sanitize strips special characters from common name', () => {
    assert.equal(buildBaseName(result({ messier: 'M1', commonName: "Crab's Nebula!" })), 'M1_Crabs_Nebula');
  });

  test('sanitize collapses multiple spaces to single underscore', () => {
    assert.equal(buildBaseName(result({ messier: 'M8', commonName: 'Lagoon  Nebula' })), 'M8_Lagoon_Nebula');
  });

  test('sanitize trims leading and trailing underscores from common name', () => {
    assert.equal(buildBaseName(result({ messier: 'M45', commonName: '  Pleiades  ' })), 'M45_Pleiades');
  });
});

describe('resolveDest', () => {
  test('first occurrence has no counter suffix', () => {
    const seen = new Map<string, number>();
    const dest = resolveDest('M31_Andromeda_Galaxy', '.jpg', '/out', seen);
    assert.equal(dest, join('/out', 'M31_Andromeda_Galaxy.jpg'));
    assert.equal(seen.get('M31_Andromeda_Galaxy'), 1);
  });

  test('second occurrence gets _02 suffix', () => {
    const seen = new Map([['M42', 1]]);
    assert.equal(resolveDest('M42', '.jpg', '/out', seen), join('/out', 'M42_02.jpg'));
    assert.equal(seen.get('M42'), 2);
  });

  test('tenth occurrence gets _10 suffix', () => {
    const seen = new Map([['M42', 9]]);
    assert.equal(resolveDest('M42', '.jpg', '/out', seen), join('/out', 'M42_10.jpg'));
  });

  test('single-digit counter is zero-padded', () => {
    const seen = new Map([['M42', 1]]);
    assert.equal(resolveDest('M42', '.jpg', '/out', seen), join('/out', 'M42_02.jpg'));
  });

  test('different basenames track separately', () => {
    const seen = new Map<string, number>();
    resolveDest('M31', '.jpg', '/out', seen);
    resolveDest('M42', '.jpg', '/out', seen);
    resolveDest('M31', '.jpg', '/out', seen);
    assert.equal(seen.get('M31'), 2);
    assert.equal(seen.get('M42'), 1);
  });

  test('preserves extension including uppercase', () => {
    const seen = new Map<string, number>();
    assert.match(resolveDest('M31', '.JPG', '/out', seen), /\.JPG$/);
  });
});

describe('moveResolved (dry run)', () => {
  test('returns correct dest path without touching the filesystem', () => {
    const seen = new Map<string, number>();
    const dest = moveResolved(
      join('/staging', 'IMG_001.jpg'),
      result({ messier: 'M31', commonName: 'Andromeda Galaxy' }),
      join('/output', 'resolved'),
      seen,
      true,
    );
    assert.equal(dest, join('/output', 'resolved', 'M31_Andromeda_Galaxy.jpg'));
    assert.ok(!existsSync(dest));
  });

  test('updates seen map even in dry run', () => {
    const seen = new Map<string, number>();
    moveResolved('/staging/a.jpg', result({ messier: 'M42' }), '/output/resolved', seen, true);
    moveResolved('/staging/b.jpg', result({ messier: 'M42' }), '/output/resolved', seen, true);
    assert.equal(seen.get('M42'), 2);
  });
});

describe('moveResolved (real move)', () => {
  test('moves file to resolved dir with correct name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rename-test-'));
    const src = join(tmp, 'test.jpg');
    writeFileSync(src, 'fake');
    const resolvedDir = join(tmp, 'resolved');
    const seen = new Map<string, number>();

    const dest = moveResolved(src, result({ messier: 'M31' }), resolvedDir, seen, false);

    assert.ok(existsSync(dest));
    assert.ok(!existsSync(src));
    assert.equal(dest, join(resolvedDir, 'M31.jpg'));
  });
});

describe('moveUnresolved', () => {
  test('dry run returns dest path without touching filesystem', () => {
    const dest = moveUnresolved(join('/staging', 'IMG_001.jpg'), join('/output', 'unresolved'), true);
    assert.equal(dest, join('/output', 'unresolved', 'IMG_001.jpg'));
    assert.ok(!existsSync(dest));
  });

  test('moves file to unresolved dir', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'unresolved-test-'));
    const src = join(tmp, 'IMG_002.jpg');
    writeFileSync(src, 'fake');
    const unresolvedDir = join(tmp, 'unresolved');
    mkdirSync(unresolvedDir, { recursive: true });

    const dest = moveUnresolved(src, unresolvedDir, false);

    assert.ok(existsSync(dest));
    assert.ok(!existsSync(src));
    assert.equal(dest, join(unresolvedDir, 'IMG_002.jpg'));
  });

  test('appends _02 suffix when destination already exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'unresolved-dup-'));
    const unresolvedDir = join(tmp, 'unresolved');
    mkdirSync(unresolvedDir, { recursive: true });

    const existing = join(unresolvedDir, 'IMG_003.jpg');
    writeFileSync(existing, 'existing');

    const src = join(tmp, 'IMG_003.jpg');
    writeFileSync(src, 'new');

    const dest = moveUnresolved(src, unresolvedDir, false);
    assert.equal(dest, join(unresolvedDir, 'IMG_003_02.jpg'));
    assert.ok(existsSync(existing));
  });
});
