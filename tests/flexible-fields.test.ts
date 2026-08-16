import assert from 'node:assert/strict';
import test from 'node:test';
import { safeLink, createField } from '../src/resume/model.ts';
import { fieldLink } from '../src/resume/fields.ts';
import { parseSemanticResume } from '../src/ai/results.ts';

test('resume links normalize common web, email and DOI shorthand', () => {
  for (const [input, expected] of [
    ['example.org/work?lang=en#top', 'https://example.org/work?lang=en#top'],
    ['//example.org/work', 'https://example.org/work'],
    ['  https://example.org/work  ', 'https://example.org/work'],
    ['person@example.org', 'mailto:person@example.org'],
    ['doi:10.1234/Example.5', 'https://doi.org/10.1234/Example.5'],
    ['10.1234/Example.5', 'https://doi.org/10.1234/Example.5'],
    ['tel:+86 138-0000-0000', 'tel:+86138-0000-0000'],
  ])
    assert.equal(safeLink(input), expected, input);
});

test('resume links reject unsafe schemes, concealed controls and ambiguous destinations', () => {
  for (const input of [
    'javascript:alert(1)',
    'data:text/html,test',
    'vbscript:msgbox(1)',
    '/relative',
    'notes/file',
    'https://user:secret@example.org/',
    'https://example.org\\@evil.org',
    'java\nscript:alert(1)',
    'https://example.org/\u0000x',
    'mailto:person@example.org?body=%0Aevil',
    'https://example.org/%0d%0aHeader:x',
    'person@example.org@evil.org',
    'doi:javascript:alert(1)',
    'https://example.org/' + 'a'.repeat(2048),
  ])
    assert.equal(safeLink(input), undefined, input);
  assert.equal(
    fieldLink({ ...createField('Email'), id: 'email', value: 'a@example.org\nBcc:x' }),
    undefined,
  );
});

test('semantic import keeps independent education fields and link display labels', () => {
  const result = parseSemanticResume(
    JSON.stringify({
      profile: {
        name: 'Student',
        employmentStatus: 'Open to research collaborations',
        customFields: [
          { label: 'Portfolio', value: 'example.org', kind: 'link', linkLabel: 'Selected work' },
          { label: 'Availability', value: '', kind: 'link', linkLabel: 'Contact for details' },
        ],
      },
      sections: [
        {
          type: 'education',
          items: [
            {
              title: 'University',
              subtitle: 'Computer Science',
              degree: 'MSc',
              gpa: '3.9 / 4.0',
              link: 'example.org/research',
              linkLabel: 'Research profile',
            },
          ],
        },
      ],
    }),
  );
  const entry = result.sections[0].items[0];
  assert.equal(entry.subtitle, 'Computer Science');
  assert.equal(entry.degree, 'MSc');
  assert.equal(entry.gpa, '3.9 / 4.0');
  assert.equal(entry.linkLabel, 'Research profile');
  assert.equal(result.profile.employmentStatus, 'Open to research collaborations');
  assert.equal(result.profile.customFields?.[0].linkLabel, 'Selected work');
  assert.equal(result.profile.customFields?.[1].linkLabel, 'Contact for details');
});
