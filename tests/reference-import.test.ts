import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReferenceImport } from '../src/resume/referenceImport.ts';
import { textContent } from '../src/resume/model.ts';

function fixture(id = 'reference-a') {
  return {
    id,
    title: `Resume ${id}`,
    createdAt: '2024-01-02T03:04:05.000Z',
    updatedAt: '2025-02-03T04:05:06.000Z',
    templateId: 'classic',
    basic: {
      name: 'Ada',
      title: 'Engineer',
      email: 'ada@example.com',
      phone: '+1234',
      location: 'Shanghai',
      employementStatus: 'Available',
      birthDate: '1994/06/17',
      photo: 'data:image/png;base64,YQ==',
      emailUnderline: true,
      photoConfig: {
        width: 90,
        height: 120,
        aspectRatio: '3:4',
        borderRadius: 'medium',
        visible: false,
      },
      fieldOrder: [{ id: 'email', key: 'email', label: 'Contact', visible: false }],
      customFields: [
        {
          id: 'f1',
          label: 'Portfolio',
          value: 'example.com',
          visible: false,
          displayLabel: false,
          icon: 'AlienIcon',
        },
      ],
      icons: { email: 'Mail' },
      githubKey: 'private-key',
      githubUseName: 'ada',
      githubContributionsVisible: false,
    },
    education: [
      {
        id: 'e',
        school: 'University',
        major: 'CS',
        degree: 'MSc',
        gpa: '4.0',
        startDate: '2015-09',
        endDate: '2017-06',
        description: 'Study',
        visible: false,
        logo: 'data:image/png;base64,YQ==',
        logoConfig: {
          width: 32,
          height: 40,
          borderRadius: 'custom',
          customBorderRadius: 4,
          visible: true,
        },
      },
    ],
    experience: [
      {
        id: 'x',
        company: 'Company',
        position: 'Engineer',
        date: '2019.02 - present',
        details: 'Built systems',
        visible: true,
      },
    ],
    projects: [
      {
        id: 'p',
        name: 'Project',
        role: 'Lead',
        date: '2020.01 - 2021.06',
        description: 'Delivered',
        link: 'example.com/project',
        linkLabel: 'View',
        visible: true,
      },
    ],
    publications: [
      {
        id: 'paper',
        title: 'Paper',
        authors: 'Ada, Bob',
        highlightedAuthor: 'Ada',
        venue: 'Journal',
        date: '2024',
        status: 'accepted',
        link: '10.1234/paper',
        description: 'Abstract',
        visible: false,
      },
    ],
    certificates: [{ id: 'c', url: 'data:image/png;base64,YQ==', width: 50 }],
    customData: {
      awards: [
        {
          id: 'a',
          title: 'Award',
          subtitle: 'First',
          dateRange: '2024',
          description: 'Won',
          visible: true,
        },
      ],
    },
    skillContent: 'TypeScript',
    selfEvaluationContent: 'Curious',
    menuSections: [
      { id: 'awards', title: 'Awards', enabled: false, order: 1, icon: '🏆' },
      { id: 'education', title: 'Education', enabled: true, order: 2, icon: '🎓' },
      { id: 'basic', title: 'Profile', enabled: true, order: 0, icon: '👤' },
    ],
    globalSettings: {
      themeColor: '#112233',
      fontFamily: 'foreign-font',
      baseFontSize: 16,
      pagePadding: 32,
      lineHeight: 1.5,
      headerSize: 18,
      subheaderSize: 16,
      dateFormat: 'short-month',
      autoOnePage: true,
    },
    activeSection: 'education',
    draggingProjectId: null,
  };
}

test('raw reference data preserves profile, dates, sections, publication and embedded media', () => {
  const source = fixture();
  const result = parseReferenceImport(JSON.stringify(source));
  const candidate = result.candidates[0];
  assert.equal(candidate.error, undefined);
  const doc = candidate.document!;
  assert.notEqual(doc.id, source.id);
  assert.equal(doc.createdAt, source.createdAt);
  assert.equal(doc.updatedAt, source.updatedAt);
  assert.equal(doc.profile.name, 'Ada');
  assert.equal(doc.profile.headline, 'Engineer');
  assert.equal(doc.profile.birthday, '1994-06-17');
  assert.ok(doc.profile.hiddenFields?.includes('email'));
  assert.ok(doc.profile.hiddenFields?.includes('phone'));
  assert.equal(doc.profile.fieldLabels?.email, 'Contact');
  assert.equal(doc.profile.customFields?.[0].visible, false);
  assert.equal(doc.profile.customFields?.[0].showLabel, true);
  assert.equal(doc.profile.photo, source.basic.photo);
  assert.equal(doc.appearance.showPhoto, false);
  assert.equal(doc.appearance.photoWidth, 90);
  assert.ok(Math.abs(doc.appearance.pageMargin - (32 * 25.4) / 96) < 0.0001);
  assert.equal(doc.appearance.dateFormat, 'MMM YYYY');
  assert.equal(doc.appearance.accent, '#112233');
  assert.equal(doc.appearance.automaticOnePage, true);
  assert.equal(doc.sections[0].title, 'Awards');
  assert.equal(doc.sections[0].visible, false);
  const education = doc.sections.find((section) => section.type === 'education')!.items[0];
  assert.equal(education.title, 'University');
  assert.equal(education.degree, 'MSc');
  assert.equal(education.gpa, '4.0');
  assert.equal(education.logoWidth, 32);
  assert.equal(education.logoHeight, 40);
  assert.equal(education.logoRadius, 4);
  assert.equal(education.visible, false);
  const experience = doc.sections.find((section) => section.type === 'experience')!.items[0];
  assert.equal(experience.startDate, '2019.02');
  assert.equal(experience.endDate, 'present');
  assert.equal(experience.current, true);
  assert.equal(textContent(experience.description), 'Built systems');
  assert.equal(
    doc.sections.find((section) => section.type === 'publications')!.items[0].publication?.authors,
    'Ada, Bob',
  );
  assert.equal(
    doc.sections.find((section) => section.type === 'certifications')!.items[0].imageWidth,
    50,
  );
  assert.ok(candidate.notes.some((note) => note.code === 'template'));
  assert.ok(candidate.notes.some((note) => note.code === 'font'));
  assert.ok(candidate.notes.some((note) => note.path === 'basic.icons.email'));
  assert.ok(!JSON.stringify(result).includes('private-key'));
});

test('legacy state maps, arrays, raw batches and stringified storage records are converted independently', () => {
  for (const input of [
    [fixture('a'), fixture('b')],
    { state: { resumes: { a: fixture('a'), b: fixture('b') }, activeResumeId: 'b' }, version: 2 },
    { state: { resumes: [fixture('a'), fixture('b')], currentResumeId: 'a' } },
    {
      'resume-storage': JSON.stringify({
        state: { resumes: { a: fixture('a'), b: fixture('b') } },
        version: 0,
      }),
    },
  ]) {
    const result = parseReferenceImport(JSON.stringify(input));
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.every((candidate) => candidate.document));
    assert.notEqual(result.candidates[0].document!.id, result.candidates[1].document!.id);
  }
});

test('split records resolve index order, include unindexed records and report missing or invalid documents', () => {
  for (const input of [
    {
      'magic-resume-index': JSON.stringify({
        ids: ['b', 'a', 'missing', 'bad'],
        activeResumeId: 'b',
        version: 2,
      }),
      'magic-resume-doc:a': JSON.stringify(fixture('a')),
      'magic-resume-doc:b': fixture('b'),
      'magic-resume-doc:extra': fixture('extra'),
      'magic-resume-doc:bad': '{',
    },
    {
      index: { ids: ['b', 'a', 'missing', 'bad'] },
      documents: { a: fixture('a'), b: fixture('b'), extra: fixture('extra'), bad: '{' },
    },
  ]) {
    const result = parseReferenceImport(JSON.stringify(input));
    assert.equal(result.format, 'split');
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.sourceId),
      ['b', 'a', 'missing', 'bad', 'extra'],
    );
    assert.equal(result.candidates.filter((candidate) => candidate.document).length, 3);
    assert.match(result.candidates[2].error!, /missing/);
    assert.match(result.candidates[3].error!, /invalid JSON/);
    assert.ok(result.notes.some((note) => note.code === 'unknown'));
  }
});

test('bad data fails only the affected candidate and unknown values are explicitly reported', () => {
  const good = { ...fixture(), novelProperty: { keep: 'original value' } };
  const badName = fixture('bad-name');
  (badName.basic as unknown as Record<string, unknown>).name = 15;
  const badVisible = fixture('bad-visible');
  (badVisible.education[0] as unknown as Record<string, unknown>).visible = 'false';
  const result = parseReferenceImport(JSON.stringify([good, badName, badVisible]));
  assert.ok(result.candidates[0].document);
  assert.deepEqual(
    result.candidates[0].notes.find((note) => note.path === 'resume.novelProperty')?.value,
    { keep: 'original value' },
  );
  assert.match(result.candidates[1].error!, /basic.name/);
  assert.match(result.candidates[2].error!, /education\[0\].visible/);
  assert.throws(() => parseReferenceImport('{'), /JSON/);
  assert.throws(
    () => parseReferenceImport(JSON.stringify({ index: { ids: ['a', 'a'] }, documents: {} })),
    /unique/,
  );
});

test('unsafe links, external media and invalid birth dates remain visible in the review report', () => {
  const source = fixture();
  source.projects[0].link = 'javascript:alert(1)';
  source.basic.photo = 'https://remote.example/photo.png';
  source.basic.birthDate = 'spring 1994';
  source.certificates[0].url = 'data:image/svg+xml;base64,PHN2Zz4=';
  const candidate = parseReferenceImport(JSON.stringify(source)).candidates[0];
  assert.ok(candidate.document);
  assert.equal(candidate.document.profile.photo, '');
  assert.equal(
    candidate.document.sections.find((section) => section.type === 'projects')!.items[0].link,
    '',
  );
  assert.ok(
    candidate.document.profile.customFields?.some((field) => field.value === 'spring 1994'),
  );
  for (const path of ['projects[0].link', 'basic.photo', 'basic.birthDate', 'certificates[0].url'])
    assert.ok(candidate.notes.some((note) => note.path === path));
});

test('runtime report values redact contribution credentials recursively', () => {
  const result = parseReferenceImport(
    JSON.stringify({ state: { resumes: { a: fixture('a') }, currentResume: fixture('a') } }),
  );
  assert.ok(!JSON.stringify(result).includes('private-key'));
  const split = parseReferenceImport(
    JSON.stringify({
      index: { ids: ['a'] },
      documents: { a: JSON.stringify(fixture('a')), 'magic-resume-doc:a': fixture('a') },
    }),
  );
  assert.ok(!JSON.stringify(split).includes('private-key'));
});

test('reference label replacement fields remain links with the original label and value', () => {
  const source = fixture();
  source.basic.customFields[0].displayLabel = true;
  source.basic.customFields[0].visible = true;
  const doc = parseReferenceImport(JSON.stringify(source)).candidates[0].document!;
  const field = doc.profile.customFields![0];
  assert.equal(field.kind, 'link');
  assert.equal(field.linkLabel, 'Portfolio');
  assert.equal(field.value, 'example.com');
  assert.equal(field.showLabel, false);
});
