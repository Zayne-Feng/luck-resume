import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createDocument, createEntry, type RichTextNode } from '../src/resume/model.ts';
import { createDocxBlob } from '../src/resume/docxExport.ts';
import { serializeMarkdown } from '../src/resume/transfer.ts';

export async function unpackDocx(blob: Blob): Promise<Map<string, Buffer>> {
  const data = Buffer.from(await blob.arrayBuffer());
  const files = new Map<string, Buffer>();
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'The DOCX must contain a ZIP central directory.');
  let offset = data.readUInt32LE(end + 16);
  for (let index = 0; index < data.readUInt16LE(end + 10); index++) {
    assert.equal(data.readUInt32LE(offset), 0x02014b50);
    const compression = data.readUInt16LE(offset + 10);
    const length = data.readUInt32LE(offset + 20);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const localOffset = data.readUInt32LE(offset + 42);
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString();
    const start =
      localOffset + 30 + data.readUInt16LE(localOffset + 26) + data.readUInt16LE(localOffset + 28);
    const content = data.subarray(start, start + length);
    assert.ok(compression === 0 || compression === 8);
    files.set(name, compression === 8 ? inflateRawSync(content) : content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const paragraph = (text: string): RichTextNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

test('DOCX honors education labels, hidden metadata and duplicate degree suppression', async () => {
  const doc = createDocument();
  const entry = {
    ...createEntry(),
    title: 'University',
    degree: 'MSc',
    gpa: '3.9/4.0',
    fieldLabels: { degree: 'Qualification', gpa: 'Score' },
  };
  doc.sections[0].items = [entry];
  let xml = (await unpackDocx(await createDocxBlob(doc))).get('word/document.xml')!.toString();
  assert.ok(xml.includes('Qualification') && xml.includes('Score'));
  assert.ok(!xml.includes('GPA:'));
  entry.subtitle = 'MSc';
  xml = (await unpackDocx(await createDocxBlob(doc))).get('word/document.xml')!.toString();
  assert.ok(!xml.includes('Qualification'));
  entry.hiddenFields = ['degree', 'gpa'];
  xml = (await unpackDocx(await createDocxBlob(doc))).get('word/document.xml')!.toString();
  assert.ok(!xml.includes('Qualification') && !xml.includes('Score'));
});

test('education outputs trim custom labels and restore the GPA fallback when cleared', async () => {
  const doc = createDocument();
  const entry = {
    ...createEntry(),
    title: 'University',
    degree: 'MSc',
    gpa: ' 3.9 ',
    fieldLabels: { degree: '', gpa: '' },
  };
  doc.sections[0].items = [entry];
  for (const label of ['', '   ', '\t\n']) {
    entry.fieldLabels = { degree: label, gpa: label };
    const xml = (await unpackDocx(await createDocxBlob(doc))).get('word/document.xml')!.toString();
    assert.ok(xml.includes('MSc · GPA: 3.9'));
    const markdown = serializeMarkdown(doc, false);
    assert.ok(markdown.includes('\nMSc\n') && markdown.includes('\nGPA: 3.9\n'));
  }
  entry.fieldLabels = { degree: ' Qualification ', gpa: ' Score ' };
  const xml = (await unpackDocx(await createDocxBlob(doc))).get('word/document.xml')!.toString();
  assert.ok(xml.includes('Qualification: MSc · Score: 3.9'));
  const markdown = serializeMarkdown(doc, false);
  assert.ok(markdown.includes('\nQualification: MSc\n') && markdown.includes('\nScore: 3.9\n'));
});

test('DOCX preserves visible fields, ordering, dates, links, publications and page settings', async () => {
  const doc = createDocument();
  doc.profile = {
    ...doc.profile,
    name: 'Ada & 李',
    headline: 'Researcher',
    email: 'ada@example.org',
    phone: 'Hidden phone',
    hiddenFields: ['phone'],
    customFields: [
      {
        id: 'custom',
        label: 'Portfolio',
        value: 'example.org',
        linkLabel: 'Work',
        kind: 'link',
        visible: true,
        showLabel: true,
      },
    ],
  };
  doc.appearance.pageMargin = 22;
  doc.appearance.fontSize = 16;
  doc.appearance.dateFormat = 'YYYY/MM';
  const entry = createEntry();
  Object.assign(entry, {
    title: 'Visible title',
    subtitle: 'Hidden subtitle',
    hiddenFields: ['subtitle'],
    startDate: '2024-01',
    endDate: '2025-02',
    degree: 'PhD',
    gpa: '4.0',
    location: 'London',
    link: '10.1234/paper',
    linkLabel: 'Read paper',
    description: { type: 'doc', content: [paragraph('Editable text')] },
    publication: {
      authors: 'Ada; Grace',
      highlightedAuthor: 'Ada',
      venue: 'Journal',
      status: 'accepted',
      citationStyle: 'numbered',
    },
  });
  doc.sections = [
    {
      id: 'one',
      type: 'experience',
      title: 'Experience',
      visible: true,
      columns: 1,
      items: [entry, { ...createEntry(), title: 'Hidden entry', visible: false }],
    },
    {
      id: 'two',
      type: 'skills',
      title: 'Skills',
      visible: true,
      columns: 2,
      breakBefore: true,
      items: [
        { ...createEntry(), description: { type: 'doc', content: [paragraph('Second section')] } },
      ],
    },
    {
      id: 'three',
      type: 'custom',
      title: 'Hidden section',
      visible: false,
      columns: 1,
      items: [entry],
    },
  ];
  const blob = await createDocxBlob(doc);
  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const files = await unpackDocx(blob);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml'])
    assert.ok(files.has(name), name);
  const xml = files.get('word/document.xml')!.toString();
  for (const text of [
    'Ada &amp; 李',
    'Researcher',
    'Visible title',
    'PhD',
    '4.0',
    'London',
    'Read paper',
    'Editable text',
    'Experience',
    'Second section',
    'Ada',
    'Grace',
    'Journal',
    '已接收',
    '[1]',
    '2024/01',
    '2025/02',
    'Portfolio',
    'Work',
  ])
    assert.ok(xml.includes(text), text);
  for (const text of ['Hidden phone', 'Hidden subtitle', 'Hidden entry', 'Hidden section'])
    assert.ok(!xml.includes(text), text);
  assert.ok(xml.indexOf('Visible title') < xml.indexOf('Second section'));
  assert.match(xml, /w:pageBreakBefore/);
  assert.match(xml, /w:pgMar[^>]*w:top="1247"/);
  assert.match(xml, /w:lineRule="atLeast"/);
  const rels = files.get('word/_rels/document.xml.rels')!.toString();
  assert.match(rels, /https:\/\/doi.org\/10.1234\/paper/);
  assert.match(rels, /mailto:ada@example.org/);
});

test('DOCX preserves rich marks, nested lists, alignment, code and merged table cells', async () => {
  const doc = createDocument();
  const entry = createEntry();
  entry.description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'right', paragraphIndent: 2, lineHeight: 1.8 },
        content: [
          {
            type: 'text',
            text: 'Styled',
            marks: [
              ...['bold', 'italic', 'underline', 'strike', 'superscript'].map((type) => ({ type })),
              { type: 'textStyle', attrs: { color: '#123456', fontSize: '24px' } },
              { type: 'highlight', attrs: { color: 'mint' } },
              { type: 'link', attrs: { href: 'https://example.org/rich' } },
            ],
          },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          {
            type: 'listItem',
            content: [
              paragraph('Third item'),
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [paragraph('Nested item')] }],
              },
            ],
          },
        ],
      },
      { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;\nreturn x;' }] },
      { type: 'blockquote', content: [paragraph('Quoted')] },
      { type: 'horizontalRule' },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                attrs: { colspan: 2, rowspan: 2, colwidth: [100, 200] },
                content: [paragraph('Merged header')],
              },
              { type: 'tableCell', content: [paragraph('A')] },
            ],
          },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('B')] }] },
        ],
      },
    ],
  };
  doc.sections = [
    { id: 'rich', type: 'freeform', title: 'Rich', visible: true, columns: 1, items: [entry] },
  ];
  const files = await unpackDocx(await createDocxBlob(doc));
  const xml = files.get('word/document.xml')!.toString();
  for (const pattern of [
    /w:b[ />]/,
    /w:i[ />]/,
    /w:u /,
    /w:strike/,
    /w:vertAlign w:val="superscript"/,
    /w:color w:val="123456"/,
    /w:sz w:val="36"/,
    /w:jc w:val="right"/,
    /w:fill="deeee4"/i,
    /w:tbl[ >]/,
    /w:gridSpan w:val="2"/,
    /w:vMerge w:val="restart"/,
    /w:vMerge w:val="continue"/,
  ])
    assert.match(xml, pattern);
  for (const text of [
    'Third item',
    'Nested item',
    'const x = 1;',
    'return x;',
    'Quoted',
    'Merged header',
  ])
    assert.ok(xml.includes(text), text);
  assert.match(files.get('word/numbering.xml')!.toString(), /w:start w:val="3"/);
});

test('DOCX embeds local photos, logos and entry images without network requests', async () => {
  const doc = createDocument();
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  doc.profile.photo = image;
  const entry = { ...createEntry(), title: 'Media', logo: image, image };
  doc.sections = [
    {
      id: 'media',
      type: 'projects',
      title: 'Media section',
      visible: true,
      columns: 1,
      items: [entry],
    },
  ];
  const files = await unpackDocx(await createDocxBlob(doc));
  assert.ok(
    [...files.keys()].some((name) => name.startsWith('word/media/') && name.endsWith('.png')),
  );
  assert.equal(
    (
      files
        .get('word/document.xml')!
        .toString()
        .match(/<w:drawing>/g) ?? []
    ).length,
    3,
  );
  assert.match(files.get('word/_rels/document.xml.rels')!.toString(), /relationships\/image/);
});

test('DOCX preserves contribution data and excludes hidden rich text and media', async () => {
  const doc = createDocument();
  doc.profile.contributions = {
    title: 'Research activity',
    visible: true,
    year: 2026,
    days: [
      { date: '2026-01-01', count: 3 },
      { date: '2026-01-02', count: 5 },
    ],
  };
  doc.profile.photo = 'invalid hidden image';
  doc.appearance.showPhoto = false;
  const entry = {
    ...createEntry(),
    title: 'Visible',
    hiddenFields: ['description', 'image', 'logo'],
    description: { type: 'doc', content: [paragraph('Hidden description')] },
    image: 'invalid image',
    logo: 'invalid logo',
  };
  doc.sections = [
    { id: 'visible', type: 'custom', title: 'Details', visible: true, columns: 1, items: [entry] },
  ];
  const files = await unpackDocx(await createDocxBlob(doc));
  const xml = files.get('word/document.xml')!.toString();
  for (const text of ['Research activity', '2026', '8 次贡献', '2026-01-01: 3', '2026-01-02: 5'])
    assert.ok(xml.includes(text), text);
  assert.ok(!xml.includes('Hidden description'));
  assert.ok(![...files.keys()].some((name) => name.startsWith('word/media/')));
});

test('DOCX cleans XML control characters and leaves unsafe links as editable text', async () => {
  const doc = createDocument();
  doc.title = 'Resume\u0000 title';
  doc.profile.name = 'Ada\u0000\ud800';
  doc.sections = [
    {
      id: 'safe',
      type: 'freeform',
      title: 'Details',
      visible: true,
      columns: 1,
      items: [
        {
          ...createEntry(),
          description: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Keep this\u0001 text',
                    marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ];
  const files = await unpackDocx(await createDocxBlob(doc));
  const xml = files.get('word/document.xml')!.toString();
  assert.ok(xml.includes('Ada�'));
  assert.ok(xml.includes('Keep this text'));
  assert.ok(!xml.includes('\u0000') && !xml.includes('\u0001'));
  assert.ok(!files.get('word/_rels/document.xml.rels')!.toString().includes('javascript:'));
  assert.ok(!files.get('docProps/core.xml')!.toString().includes('\u0000'));
});
