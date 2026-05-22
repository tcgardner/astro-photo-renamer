import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse } from './aiVision.js';

const LOW = { messier: null, caldwell: null, ngc: null, ic: null, commonName: null, confidence: 'low' as const };

describe('parseResponse', () => {
  test('parses a complete valid response', () => {
    const json = JSON.stringify({
      messier: 'M31',
      caldwell: null,
      ngc: 'NGC 224',
      ic: null,
      common_name: 'Andromeda Galaxy',
      confidence: 'high',
    });
    const r = parseResponse(json);
    assert.equal(r.messier, 'M31');
    assert.equal(r.ngc, 'NGC 224');
    assert.equal(r.commonName, 'Andromeda Galaxy');
    assert.equal(r.confidence, 'high');
  });

  test('extracts JSON embedded in prose', () => {
    const text = `Sure, here's the object:\n{ "messier": "M42", "caldwell": null, "ngc": null, "ic": null, "common_name": "Orion Nebula", "confidence": "medium" }`;
    const r = parseResponse(text);
    assert.equal(r.messier, 'M42');
    assert.equal(r.confidence, 'medium');
    assert.equal(r.commonName, 'Orion Nebula');
  });

  test('returns low confidence on invalid JSON', () => {
    assert.deepEqual(parseResponse('not json at all'), LOW);
  });

  test('returns low confidence when no JSON object is present', () => {
    assert.deepEqual(parseResponse(''), LOW);
  });

  test('returns low confidence on malformed JSON object', () => {
    assert.deepEqual(parseResponse('{ "messier": "M31", bad json'), LOW);
  });

  test('unknown confidence value defaults to low', () => {
    const json = JSON.stringify({ messier: 'M31', caldwell: null, ngc: null, ic: null, common_name: null, confidence: 'very_high' });
    assert.equal(parseResponse(json).confidence, 'low');
  });

  test('missing confidence defaults to low', () => {
    const json = JSON.stringify({ messier: 'M31', caldwell: null, ngc: null, ic: null, common_name: null });
    assert.equal(parseResponse(json).confidence, 'low');
  });

  test('high confidence is preserved', () => {
    const json = JSON.stringify({ messier: 'M1', caldwell: null, ngc: null, ic: null, common_name: null, confidence: 'high' });
    assert.equal(parseResponse(json).confidence, 'high');
  });

  test('invalid catalog ID (free text) is filtered to null', () => {
    const json = JSON.stringify({ messier: 'Andromeda Galaxy', caldwell: null, ngc: null, ic: null, common_name: null, confidence: 'high' });
    assert.equal(parseResponse(json).messier, null);
  });

  test('valid Messier ID passes validation', () => {
    const json = JSON.stringify({ messier: 'M99', caldwell: null, ngc: null, ic: null, common_name: null, confidence: 'high' });
    assert.equal(parseResponse(json).messier, 'M99');
  });

  test('valid NGC ID passes validation', () => {
    const json = JSON.stringify({ messier: null, caldwell: null, ngc: 'NGC 7000', ic: null, common_name: null, confidence: 'medium' });
    assert.equal(parseResponse(json).ngc, 'NGC 7000');
  });

  test('valid IC ID passes validation', () => {
    const json = JSON.stringify({ messier: null, caldwell: null, ngc: null, ic: 'IC 434', common_name: null, confidence: 'medium' });
    assert.equal(parseResponse(json).ic, 'IC 434');
  });

  test('null identifier fields stay null', () => {
    const json = JSON.stringify({ messier: null, caldwell: null, ngc: null, ic: null, common_name: 'Unknown', confidence: 'low' });
    const r = parseResponse(json);
    assert.equal(r.messier, null);
    assert.equal(r.caldwell, null);
    assert.equal(r.ngc, null);
    assert.equal(r.ic, null);
  });

  test('empty common_name coerces to null', () => {
    const json = JSON.stringify({ messier: 'M31', caldwell: null, ngc: null, ic: null, common_name: '', confidence: 'high' });
    assert.equal(parseResponse(json).commonName, null);
  });

  test('common_name with surrounding whitespace is trimmed', () => {
    const json = JSON.stringify({ messier: 'M31', caldwell: null, ngc: null, ic: null, common_name: '  Andromeda Galaxy  ', confidence: 'high' });
    assert.equal(parseResponse(json).commonName, 'Andromeda Galaxy');
  });
});
