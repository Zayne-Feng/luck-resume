import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLogoAsset } from '../src/storage/logoAssets.ts';

const asset = {
  id: 'logo-1',
  name: 'Acme',
  image: 'data:image/png;base64,aGVsbG8=',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

test('valid logo assets are normalized without retaining extra fields', () => {
  assert.deepEqual(validateLogoAsset({ ...asset, name: ' Acme ', extra: true }), asset);
  const image = 'data:image/png;base64,' + 'a'.repeat(4 * 1024 * 1024 - 24);
  assert.equal(validateLogoAsset({ ...asset, image }).image, image);
});

test('logo assets reject unsafe images and malformed metadata', () => {
  for (const image of [
    'https://example.com/logo.png',
    'data:image/svg+xml;base64,aGVsbG8=',
    'data:image/png;base64,@@@@',
    'data:image/png;base64,a',
    '',
    'data:image/png;base64,' + 'a'.repeat(4 * 1024 * 1024),
  ]) {
    assert.throws(() => validateLogoAsset({ ...asset, image }));
  }
  for (const value of [
    null,
    {},
    { ...asset, name: ' ' },
    { ...asset, name: 'a'.repeat(101) },
    { ...asset, id: '' },
    { ...asset, updatedAt: 'bad' },
    { ...asset, updatedAt: '2026-02-30T00:00:00.000Z' },
  ]) {
    assert.throws(() => validateLogoAsset(value));
  }
});
