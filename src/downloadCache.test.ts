import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { load, save, has, add } from './downloadCache.js';
import type { DownloadCache } from './downloadCache.js';

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dl-cache-test-'));
  return join(dir, 'cache.json');
}

describe('downloadCache', () => {
  test('load returns empty object when file does not exist', () => {
    assert.deepEqual(load('/nonexistent/path/cache.json'), {});
  });

  test('load returns empty object when file contains invalid JSON', () => {
    const f = tempFile();
    writeFileSync(f, 'not json');
    assert.deepEqual(load(f), {});
  });

  test('load reads a valid cache file', () => {
    const f = tempFile();
    const data: DownloadCache = { abc123: { filename: 'foo.jpg', downloadedAt: '2026-05-22T00:00:00.000Z' } };
    writeFileSync(f, JSON.stringify(data));
    assert.deepEqual(load(f), data);
  });

  test('save writes JSON that load can round-trip', () => {
    const f = tempFile();
    const cache: DownloadCache = {};
    add(cache, 'id1', 'img1.jpg');
    save(f, cache);
    const reloaded = load(f);
    assert.equal(reloaded['id1'].filename, 'img1.jpg');
    assert.match(reloaded['id1'].downloadedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('has returns false for unknown id', () => {
    assert.equal(has({}, 'missing'), false);
  });

  test('has returns true for known id', () => {
    const cache: DownloadCache = { x: { filename: 'x.jpg', downloadedAt: '2026-01-01T00:00:00.000Z' } };
    assert.equal(has(cache, 'x'), true);
  });

  test('add inserts entry with ISO downloadedAt', () => {
    const cache: DownloadCache = {};
    add(cache, 'newid', 'photo.jpg');
    assert.equal(cache['newid'].filename, 'photo.jpg');
    assert.match(cache['newid'].downloadedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('add overwrites an existing entry', () => {
    const cache: DownloadCache = { id1: { filename: 'old.jpg', downloadedAt: '2020-01-01T00:00:00.000Z' } };
    add(cache, 'id1', 'new.jpg');
    assert.equal(cache['id1'].filename, 'new.jpg');
  });

  test('saved file contains pretty-printed JSON', () => {
    const f = tempFile();
    const cache: DownloadCache = {};
    add(cache, 'x', 'x.jpg');
    save(f, cache);
    const raw = readFileSync(f, 'utf8');
    assert.ok(raw.includes('\n'), 'expected newlines in pretty-printed output');
  });
});
