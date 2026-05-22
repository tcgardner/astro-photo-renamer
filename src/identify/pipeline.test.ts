import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogNameToFields, mergeObjectsInField } from './pipeline.js';

describe('catalogNameToFields', () => {
  test('M42 → messier', () => {
    assert.deepEqual(catalogNameToFields('M42'), { messier: 'M42', caldwell: null, ngc: null, ic: null });
  });

  test('M 31 → messier (space normalized away)', () => {
    assert.deepEqual(catalogNameToFields('M 31'), { messier: 'M31', caldwell: null, ngc: null, ic: null });
  });

  test('m42 → messier (lowercased input)', () => {
    assert.deepEqual(catalogNameToFields('m42'), { messier: 'M42', caldwell: null, ngc: null, ic: null });
  });

  test('M1 → messier (single digit)', () => {
    assert.deepEqual(catalogNameToFields('M1'), { messier: 'M1', caldwell: null, ngc: null, ic: null });
  });

  test('M100 → messier (three digits)', () => {
    assert.deepEqual(catalogNameToFields('M100'), { messier: 'M100', caldwell: null, ngc: null, ic: null });
  });

  test('C14 → caldwell', () => {
    assert.deepEqual(catalogNameToFields('C14'), { messier: null, caldwell: 'C14', ngc: null, ic: null });
  });

  test('C 14 → caldwell (space normalized)', () => {
    assert.deepEqual(catalogNameToFields('C 14'), { messier: null, caldwell: 'C14', ngc: null, ic: null });
  });

  test('NGC 224 → ngc with preserved space', () => {
    assert.deepEqual(catalogNameToFields('NGC 224'), { messier: null, caldwell: null, ngc: 'NGC 224', ic: null });
  });

  test('NGC224 → ngc normalized to include space', () => {
    assert.deepEqual(catalogNameToFields('NGC224'), { messier: null, caldwell: null, ngc: 'NGC 224', ic: null });
  });

  test('ngc7000 → ngc (lowercase)', () => {
    assert.deepEqual(catalogNameToFields('ngc7000'), { messier: null, caldwell: null, ngc: 'NGC 7000', ic: null });
  });

  test('IC 1805 → ic', () => {
    assert.deepEqual(catalogNameToFields('IC 1805'), { messier: null, caldwell: null, ngc: null, ic: 'IC 1805' });
  });

  test('IC1805 → ic normalized to include space', () => {
    assert.deepEqual(catalogNameToFields('IC1805'), { messier: null, caldwell: null, ngc: null, ic: 'IC 1805' });
  });

  test('unrecognized name → all null', () => {
    assert.deepEqual(catalogNameToFields('Andromeda Galaxy'), { messier: null, caldwell: null, ngc: null, ic: null });
  });

  test('empty string → all null', () => {
    assert.deepEqual(catalogNameToFields(''), { messier: null, caldwell: null, ngc: null, ic: null });
  });

  test('partial match like "M" alone → all null', () => {
    assert.deepEqual(catalogNameToFields('M'), { messier: null, caldwell: null, ngc: null, ic: null });
  });

  test('leading/trailing whitespace is ignored', () => {
    assert.deepEqual(catalogNameToFields('  M42  '), { messier: 'M42', caldwell: null, ngc: null, ic: null });
  });
});

describe('mergeObjectsInField', () => {
  test('NGC before Messier in list → Messier wins (M3 / NGC 5272 case)', () => {
    const result = mergeObjectsInField(['NGC 5272', 'M 3']);
    assert.deepEqual(result, { messier: 'M3', caldwell: null, ngc: 'NGC 5272', ic: null });
  });

  test('Messier before NGC in list → Messier wins', () => {
    const result = mergeObjectsInField(['M31', 'NGC 224']);
    assert.deepEqual(result, { messier: 'M31', caldwell: null, ngc: 'NGC 224', ic: null });
  });

  test('only NGC → returns NGC', () => {
    assert.deepEqual(mergeObjectsInField(['NGC 7000']), { messier: null, caldwell: null, ngc: 'NGC 7000', ic: null });
  });

  test('empty list → null', () => {
    assert.equal(mergeObjectsInField([]), null);
  });

  test('all unrecognized → null', () => {
    assert.equal(mergeObjectsInField(['some nebula', 'unknown']), null);
  });
});
