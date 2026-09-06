import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5187';
let server;
try {
  await fetch(baseURL);
} catch {
  server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5187',
      '--strictPort',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(baseURL);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

const output = new URL('../.cache/word-export/', import.meta.url);
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL).origin)
      externalRequests.push(request.url());
  });
  await page.goto(`${baseURL}/#editor`);
  await page.waitForSelector('.pagination-source .resume-document', { state: 'attached' });
  try {
    await page.evaluate(async () => {
      await import('/src/resume/docxExport.ts');
    });
  } catch (error) {
    if (!error.message.includes('Execution context was destroyed')) throw error;
    await page.waitForLoadState();
    await page.waitForSelector('.pagination-source .resume-document', { state: 'attached' });
  }
  await page.evaluate(async () => {
    const { createDocument, createEntry, richText } = await import('/src/resume/model.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const doc = createDocument();
    doc.title = 'Word export validation';
    Object.assign(doc.profile, {
      name: 'Ada Lovelace 李',
      headline: 'Research engineer',
      email: 'ada@example.org',
      phone: '+86 13800000000',
      location: 'Shanghai',
      website: 'https://example.org',
      birthday: '1990-01',
      employmentStatus: 'Available',
    });
    Object.assign(doc.appearance, {
      fontSize: 14,
      pageMargin: 18,
      accent: '#bad4c6',
      headingStyle: 'highlight',
      paragraphGap: 5,
    });
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#79a2c9';
    context.fillRect(0, 0, 160, 80);
    context.fillStyle = '#183d52';
    context.font = '20px sans-serif';
    context.fillText('Local image', 20, 48);
    doc.profile.photo = canvas.toDataURL('image/png');
    const entry = createEntry();
    Object.assign(entry, {
      title: 'Editable engineering project',
      subtitle: 'Research team',
      startDate: '2024-01',
      endDate: '2025-04',
      degree: 'MSc',
      gpa: '4.0',
      location: 'Shanghai',
      link: 'https://example.org/project',
      linkLabel: 'Project details',
      logo: canvas.toDataURL('image/png'),
      image: canvas.toDataURL('image/webp'),
      imageWidth: 45,
      imageAlign: 'center',
    });
    entry.description = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Editable text with bold, color and a link. 中文可以直接编辑。',
              marks: [
                { type: 'bold' },
                { type: 'textStyle', attrs: { color: '#176b48' } },
                { type: 'link', attrs: { href: 'https://example.org/evidence' } },
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
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'First editable list item' }],
                },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Nested bullet evidence' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: {
                    colspan: 2,
                    rowspan: 2,
                    colwidth: [100, 150],
                    backgroundColor: '#dce9f0',
                  },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Merged editable header' }],
                    },
                  ],
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Result' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '95 percent' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: ['Skill', 'TypeScript', 'Advanced'].map((text) => ({
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
              })),
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const answer = 42;\nreturn answer;' }],
        },
      ],
    };
    const longEntry = {
      ...createEntry(),
      title: 'Extended experience',
      description: richText(
        ...Array.from(
          { length: 45 },
          (_, index) =>
            `Paragraph ${index + 1}. Editable long document content checks natural Word pagination and keeps the final content available. 中文多页内容。`,
        ),
      ),
    };
    longEntry.description.content.unshift({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: ['Record', 'Details', 'Value'].map((text) => ({
            type: 'tableHeader',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
        ...Array.from({ length: 48 }, (_, index) => ({
          type: 'tableRow',
          content: [`Data row ${index + 1}`, 'Editable table content 中文表格', `${index + 1}`].map(
            (text) => ({
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            }),
          ),
        })),
      ],
    });
    doc.sections = [
      {
        id: 'one',
        type: 'projects',
        title: 'Projects 项目',
        visible: true,
        columns: 2,
        items: [entry],
      },
      {
        id: 'two',
        type: 'experience',
        title: 'Experience 工作经历',
        visible: true,
        columns: 1,
        breakBefore: true,
        items: [longEntry],
      },
    ];
    useWorkspace.getState().add(doc);
  });
  const pending = page.waitForEvent('download');
  const button = page.getByRole('button', { name: '导出 Word', exact: true });
  await button.click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), 'Word export validation.docx');
  await download.saveAs(fileURLToPath(new URL('validation.docx', output)));
  const bytes = await readFile(new URL('validation.docx', output));
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.ok(bytes.length > 10000);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.ok(await button.isEnabled());
  console.log(
    'Word export browser download passed with local PNG/WebP media, rich text, merged tables and long content.',
  );
} finally {
  await browser?.close();
  server?.kill();
}
