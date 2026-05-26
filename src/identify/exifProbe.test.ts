import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { probe } from './exifProbe.js';

const NULL_RESULT = { catalogName: null, ra: null, dec: null, capturedAt: null };

describe('probe', () => {
  test('returns null result for non-existent file', () => {
    assert.deepEqual(probe('/no/such/file.jpg'), NULL_RESULT);
  });

  test('returns null result for a file that is not a valid image', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'exif-test-'));
    const f = join(tmp, 'not-an-image.jpg');
    writeFileSync(f, 'this is not jpeg data');
    assert.deepEqual(probe(f), NULL_RESULT);
  });

  test('returns null result for an empty file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'exif-test-'));
    const f = join(tmp, 'empty.jpg');
    writeFileSync(f, '');
    assert.deepEqual(probe(f), NULL_RESULT);
  });

  test('returns null result for a JSON file (wrong format)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'exif-test-'));
    const f = join(tmp, 'data.jpg');
    writeFileSync(f, JSON.stringify({ foo: 'bar' }));
    assert.deepEqual(probe(f), NULL_RESULT);
  });
});
