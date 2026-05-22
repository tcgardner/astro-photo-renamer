import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RunLogger } from './logger.js';

describe('RunLogger', () => {
  function makeLogger() {
    const outputDir = mkdtempSync(join(tmpdir(), 'runlog-test-'));
    return { logger: new RunLogger(outputDir), outputDir };
  }

  test('flush creates run_log.json in the output dir', () => {
    const { logger, outputDir } = makeLogger();
    const logPath = logger.flush();
    assert.equal(logPath, join(outputDir, 'run_log.json'));
    assert.ok(existsSync(logPath));
  });

  test('flush writes valid JSON', () => {
    const { logger, outputDir } = makeLogger();
    logger.flush();
    const content = JSON.parse(readFileSync(join(outputDir, 'run_log.json'), 'utf8'));
    assert.ok(typeof content.run_at === 'string');
    assert.ok(typeof content.elapsed_seconds === 'number');
    assert.equal(content.total, 0);
    assert.equal(content.resolved, 0);
    assert.equal(content.unresolved, 0);
    assert.deepEqual(content.images, []);
  });

  test('record adds entries that appear in the flushed log', () => {
    const { logger, outputDir } = makeLogger();
    logger.record({ sourceFile: 'IMG_001.jpg', stage: 'exif', identifier: 'M31', commonName: 'Andromeda Galaxy', destFile: 'M31_Andromeda_Galaxy.jpg', success: true });
    logger.record({ sourceFile: 'IMG_002.jpg', stage: 'unresolved', identifier: null, commonName: null, destFile: 'IMG_002.jpg', success: false });
    logger.flush();

    const content = JSON.parse(readFileSync(join(outputDir, 'run_log.json'), 'utf8'));
    assert.equal(content.total, 2);
    assert.equal(content.resolved, 1);
    assert.equal(content.unresolved, 1);
    assert.equal(content.images[0].source, 'IMG_001.jpg');
    assert.equal(content.images[0].identifier, 'M31');
    assert.equal(content.images[0].common_name, 'Andromeda Galaxy');
    assert.equal(content.images[0].success, true);
    assert.equal(content.images[1].source, 'IMG_002.jpg');
    assert.equal(content.images[1].success, false);
  });

  test('notes defaults to empty string when not provided', () => {
    const { logger, outputDir } = makeLogger();
    logger.record({ sourceFile: 'a.jpg', stage: 'exif', identifier: 'M42', commonName: null, destFile: 'M42.jpg', success: true });
    logger.flush();
    const content = JSON.parse(readFileSync(join(outputDir, 'run_log.json'), 'utf8'));
    assert.equal(content.images[0].notes, '');
  });

  test('notes is stored when provided', () => {
    const { logger, outputDir } = makeLogger();
    logger.record({ sourceFile: 'a.jpg', stage: 'exif', identifier: 'M1', commonName: null, destFile: 'M1.jpg', success: true, notes: 'special case' });
    logger.flush();
    const content = JSON.parse(readFileSync(join(outputDir, 'run_log.json'), 'utf8'));
    assert.equal(content.images[0].notes, 'special case');
  });

  test('elapsed_seconds is a non-negative number', () => {
    const { logger, outputDir } = makeLogger();
    logger.flush();
    const content = JSON.parse(readFileSync(join(outputDir, 'run_log.json'), 'utf8'));
    assert.ok(content.elapsed_seconds >= 0);
  });

  test('run_at is an ISO 8601 date string', () => {
    const { logger, outputDir } = makeLogger();
    logger.flush();
    const content = JSON.parse(readFileSync(join(outputDir, 'run_log.json'), 'utf8'));
    assert.ok(!isNaN(Date.parse(content.run_at)));
  });

  test('flush creates output dir if it does not exist', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'runlog-nodir-'));
    const nonExistentDir = join(tmp, 'subdir', 'deep');
    const logger = new RunLogger(nonExistentDir);
    const logPath = logger.flush();
    assert.ok(existsSync(logPath));
  });
});
