import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTsv } from './catalogLookup.js';

describe('parseTsv', () => {
  test('parses a well-formed TSV with header and one data row', () => {
    const tsv = 'M\tName\tRA\n---\t---\t---\n31\tAndromeda Galaxy\t10.68';
    const row = parseTsv(tsv);
    assert.ok(row !== null);
    assert.equal(row!['M'], '31');
    assert.equal(row!['Name'], 'Andromeda Galaxy');
    assert.equal(row!['RA'], '10.68');
  });

  test('ignores lines starting with #', () => {
    const tsv = '# comment line\nM\tName\n---\t---\n42\tOrion Nebula';
    const row = parseTsv(tsv);
    assert.ok(row !== null);
    assert.equal(row!['M'], '42');
  });

  test('returns null when only comment lines are present', () => {
    assert.equal(parseTsv('# only a comment\n# another comment'), null);
  });

  test('returns null for empty string', () => {
    assert.equal(parseTsv(''), null);
  });

  test('returns null when only header and separator are present (no data)', () => {
    const tsv = 'M\tName\n---\t---';
    assert.equal(parseTsv(tsv), null);
  });

  test('returns null when only a header line is present', () => {
    assert.equal(parseTsv('M\tName\tRA'), null);
  });

  test('returns first data row when multiple are present', () => {
    const tsv = 'M\tName\n---\t---\n31\tAndromeda\n42\tOrion';
    const row = parseTsv(tsv);
    assert.equal(row!['M'], '31');
  });

  test('handles tabs in values correctly', () => {
    const tsv = 'Col1\tCol2\n---\t---\nhello\tworld';
    const row = parseTsv(tsv);
    assert.equal(row!['Col1'], 'hello');
    assert.equal(row!['Col2'], 'world');
  });

  test('trims whitespace from headers and values', () => {
    const tsv = ' M \t Name \n---\t---\n 31 \t Andromeda ';
    const row = parseTsv(tsv);
    assert.ok(row !== null);
    assert.equal(row!['M'], '31');
    assert.equal(row!['Name'], 'Andromeda');
  });

  test('missing value for a column defaults to empty string', () => {
    const tsv = 'A\tB\tC\n---\t---\t---\nval1\tval2';
    const row = parseTsv(tsv);
    assert.equal(row!['A'], 'val1');
    assert.equal(row!['C'], '');
  });
});
