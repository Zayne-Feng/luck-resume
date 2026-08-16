import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, type RichTextNode } from '../src/resume/model.ts';
import { parseResumeFile, serializeResume, validateRichText } from '../src/resume/files.ts';
import { profileContacts } from '../src/resume/fields.ts';
import { serializeMarkdown, parseTextImport } from '../src/resume/transfer.ts';
import { resizeDimensions } from '../src/resume/dimensions.ts';

test('locked resizing retains its ratio while bounding both dimensions', () => {
  assert.deepEqual(resizeDimensions({ width: 60, height: 80 }, 'width', 90, 0.75), {
    width: 90,
    height: 120,
  });
  assert.deepEqual(resizeDimensions({ width: 60, height: 80 }, 'height', 40, 0.75), {
    width: 30,
    height: 40,
  });
  assert.deepEqual(resizeDimensions({ width: 60, height: 80 }, 'width', 180, 0.5), {
    width: 110,
    height: 220,
  });
  assert.deepEqual(resizeDimensions({ width: 60, height: 80 }, 'width', 90), {
    width: 90,
    height: 80,
  });
});

test('selected foreground and arbitrary hex highlight colors survive portable archives', () => {
  const doc = createDocument();
  const description: RichTextNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Color',
            marks: [
              { type: 'textStyle', attrs: { color: '#176854', fontSize: '16px' } },
              { type: 'highlight', attrs: { color: '#ffeedd' } },
            ],
          },
        ],
      },
    ],
  };
  doc.sections[0].items[0].description = description;
  assert.deepEqual(
    parseResumeFile(serializeResume(doc)).sections[0].items[0].description,
    description,
  );
  assert.deepEqual(
    parseTextImport(serializeMarkdown(doc)).document.sections[0].items[0].description,
    description,
  );
  const colorOnly = structuredClone(description);
  delete colorOnly.content![0].content![0].marks![0].attrs!.fontSize;
  assert.deepEqual(validateRichText(colorOnly), colorOnly);
  for (const color of ['red', '#abc', '#123456;position:fixed', 'url(https://example.com)']) {
    const invalid = structuredClone(description);
    invalid.content![0].content![0].marks![0].attrs!.color = color as string;
    assert.throws(() => validateRichText(invalid));
  }
});

test('optional editor controls and expanded practical bounds round trip in version one', () => {
  const doc = createDocument('linen', true);
  Object.assign(doc.appearance, {
    fontSize: 24,
    lineHeight: 1,
    pageMargin: 0,
    sectionGap: 100,
    paragraphGap: 50,
    entryHeadingSize: 21,
    centerSubtitle: true,
    flexibleHeaderLayout: true,
    entryHeadingGap: 32,
    photoWidth: 20,
    photoHeight: 40,
    photoAspectRatio: 0.5,
    headingStyle: 'timeline',
  });
  Object.assign(doc.sections[0].items[0], {
    logoWidth: 120,
    logoHeight: 30,
    logoRatio: 4,
    imageWidth: 5,
  });
  Object.assign(doc.profile, {
    birthday: '2000-02-29',
    employmentStatus: 'Open to work',
    removedFields: ['phone'],
    emailUnderline: false,
  });
  const restored = parseResumeFile(serializeResume(doc));
  assert.deepEqual(restored.appearance, doc.appearance);
  assert.deepEqual(restored.profile, doc.profile);
  assert.equal(restored.sections[0].items[0].logoWidth, 120);
  assert.equal(restored.sections[0].items[0].imageWidth, 5);
  assert.ok(!profileContacts(restored.profile).find((field) => field.id === 'phone'));
  assert.equal(
    profileContacts(restored.profile).find((field) => field.id === 'birthday')?.value,
    '2000-02-29',
  );
  assert.ok(serializeMarkdown(doc, false).includes('Open to work'));
});

test('new controls reject malformed dates, ratio values and unsupported removed keys', () => {
  for (const patch of [
    { birthday: '2000-02-30' },
    { birthday: 'March 1' },
    { removedFields: ['injected'] },
    { emailUnderline: 'false' },
  ]) {
    const doc = createDocument();
    Object.assign(doc.profile, patch);
    assert.throws(() => parseResumeFile(serializeResume(doc)));
  }
  for (const patch of [
    { photoAspectRatio: 0 },
    { photoAspectRatio: Infinity },
    { entryHeadingSize: 100 },
    { entryHeadingGap: -1 },
    { centerSubtitle: 'yes' },
  ]) {
    const doc = createDocument();
    Object.assign(doc.appearance, patch);
    assert.throws(() => parseResumeFile(serializeResume(doc)));
  }
});

test('ratio locks preserve every supported rectangular image size', () => {
  for (const [width, height] of [
    [20, 220],
    [180, 20],
    [200, 20],
  ]) {
    const doc = createDocument();
    Object.assign(doc.appearance, {
      photoWidth: width,
      photoHeight: height,
      photoAspectRatio: width / height,
    });
    assert.equal(parseResumeFile(serializeResume(doc)).appearance.photoAspectRatio, width / height);
  }
  for (const [width, height] of [
    [8, 200],
    [200, 8],
  ]) {
    const doc = createDocument();
    Object.assign(doc.sections[0].items[0], {
      logoWidth: width,
      logoHeight: height,
      logoRatio: width / height,
    });
    assert.equal(
      parseResumeFile(serializeResume(doc)).sections[0].items[0].logoRatio,
      width / height,
    );
  }
});
