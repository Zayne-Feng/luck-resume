import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { MAX_IMPORT_FILE_BYTES } from '../resume/files.ts';
import {
  parseReferenceImport,
  type ReferenceImportNote,
  type ReferenceImportResult,
  type ReferenceNoteCode,
} from '../resume/referenceImport.ts';
import type { ResumeDocument } from '../resume/model.ts';
import { RichTextContent } from '../resume/ResumeDocument';
import { Button, Field } from './ui';

const messages: Record<ReferenceNoteCode, [string, string]> = {
  unknown: [
    '未映射字段，原值保留在转换报告中。',
    'Unmapped field; the original value is retained in the conversion report.',
  ],
  style: [
    '此样式没有直接对应项，已使用原生样式。',
    'This style has no direct equivalent; native styling is used.',
  ],
  template: ['已采用幸运简历原生模板。', 'A native Luck template is used.'],
  font: [
    '已采用本地默认字体，可在导入后调整。',
    'The local default font is used and can be changed after import.',
  ],
  identity: ['已生成新的文档和条目标识。', 'New document and entry identifiers were generated.'],
  runtime: ['编辑器状态不写入新简历。', 'Editor state is excluded from the new resume.'],
  link: [
    '无法安全转换此链接，原值保留在报告中。',
    'This link could not be converted safely; its original value remains in the report.',
  ],
  media: [
    '此图片不是内嵌 PNG、JPEG 或 WebP，原地址保留在报告中。',
    'This image is not an embedded PNG, JPEG or WebP; its original address remains in the report.',
  ],
  html: [
    'HTML 属性或元素已转换；图片另存为同模块中的独立条目。',
    'HTML attributes or elements were converted; images become separate entries in the same section.',
  ],
  table: [
    '表格已转为按行排列的文字，单元格以竖线分隔。',
    'The table was converted to rows of text with pipe separators between cells.',
  ],
  date: ['原日期作为自定义文本字段保留。', 'The original date is retained as a custom text field.'],
  dimension: [
    '尺寸已调整到编辑器支持的范围。',
    'The dimension was adjusted to the supported editor range.',
  ],
  github: [
    '动态贡献图未迁移；用户名保留为链接，凭据不写入简历或报告。',
    'Live contributions are not migrated; the username becomes a link, and credentials are excluded from the resume and report.',
  ],
  visibility: [
    '基本信息模块的隐藏状态已应用到各字段和头像。',
    'The hidden profile section is reflected in its fields and photo.',
  ],
};

export default function ReferenceImportPanel({
  onImport,
  onClose,
}: {
  onImport: (document: ResumeDocument) => void;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const copy = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReferenceImportResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const clear = () => {
    setResult(null);
    setSelected(new Set());
    setReviewed(false);
    setError('');
  };
  const renderNotes = (notes: ReferenceImportNote[]) =>
    notes.length > 0 && (
      <details>
        <summary>
          {copy('转换说明与原值', 'Conversion notes and original values')} ({notes.length})
        </summary>
        <ul className="transfer-warnings">
          {notes.map((note, index) => (
            <li key={index}>
              <code>{note.path}</code> · {messages[note.code][locale === 'en' ? 1 : 0]}
              {note.value !== undefined && (
                <details>
                  <summary>{copy('查看原值', 'View original value')}</summary>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      maxHeight: 220,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(note.value, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </details>
    );
  return (
    <section
      className="transfer-import"
      aria-label={copy('转换参考简历与浏览器草稿', 'Convert reference resumes and browser drafts')}
    >
      <h3>{copy('转换参考简历与浏览器草稿', 'Convert reference resumes and browser drafts')}</h3>
      <p>
        {copy(
          '上传或粘贴参考项目导出的原始 JSON、state.resumes 草稿，或包含 magic-resume-index 与 magic-resume-doc: 记录的 JSON。转换只读取你提供的内容，复核后创建新的本地简历。',
          'Upload or paste raw reference JSON, a state.resumes draft, or JSON containing magic-resume-index and magic-resume-doc: records. Conversion reads only the supplied content and creates new local resumes after review.',
        )}
      </p>
      <Field
        label={copy('选择参考 JSON 文件', 'Choose a reference JSON file')}
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          const current = ++version.current;
          clear();
          setText('');
          if (file.size > MAX_IMPORT_FILE_BYTES) {
            setError(
              copy(
                '文件超过 64 MB，请选择较小的文件。',
                'The file exceeds 64 MB. Choose a smaller file.',
              ),
            );
            return;
          }
          setBusy(true);
          try {
            const content = await file.text();
            if (current === version.current) setText(content);
          } catch (error) {
            if (current === version.current)
              setError(error instanceof Error ? error.message : String(error));
          } finally {
            if (current === version.current) setBusy(false);
          }
        }}
      />
      <label className="field transfer-text">
        <span>{copy('参考 JSON 内容', 'Reference JSON content')}</span>
        <textarea
          aria-label={copy('参考 JSON 内容', 'Reference JSON content')}
          rows={6}
          value={text}
          disabled={busy}
          onChange={(event) => {
            version.current++;
            setText(event.target.value);
            clear();
          }}
        />
      </label>
      <div className="transfer-actions">
        <Button
          disabled={busy || !text.trim()}
          onClick={() => {
            clear();
            try {
              const next = parseReferenceImport(text);
              setResult(next);
              setSelected(
                new Set(
                  next.candidates.flatMap((candidate, index) =>
                    candidate.document ? [index] : [],
                  ),
                ),
              );
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
            }
          }}
        >
          {copy('预览参考转换', 'Preview reference conversion')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="transfer-error">
          {copy('无法转换：', 'Conversion failed: ')}
          {error}
        </p>
      )}
      {result && (
        <div className="transfer-result">
          <p>
            {copy('可转换简历', 'Convertible resumes')}:{' '}
            {result.candidates.filter((candidate) => candidate.document).length} /{' '}
            {result.candidates.length}
          </p>
          {renderNotes(result.notes)}
          {result.candidates.map((candidate, index) => (
            <article key={index} className="transfer-preview">
              <label className="check-field">
                <input
                  type="checkbox"
                  disabled={!candidate.document}
                  checked={selected.has(index)}
                  onChange={(event) => {
                    setReviewed(false);
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(index);
                      else next.delete(index);
                      return next;
                    });
                  }}
                />
                {candidate.title}
              </label>
              {candidate.error && (
                <p role="alert" className="transfer-error">
                  {copy('此文档无法转换：', 'This document could not be converted: ')}
                  {candidate.error}
                </p>
              )}
              {candidate.document && (
                <>
                  <p>
                    {candidate.document.profile.name} · {candidate.document.profile.headline}
                  </p>
                  {renderNotes(candidate.notes)}
                  <details>
                    <summary>
                      {copy(
                        '查看转换内容（含隐藏字段）',
                        'Review converted content (including hidden fields)',
                      )}
                    </summary>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {JSON.stringify(
                        candidate.document.profile,
                        (key, value) => (key === 'photo' && value ? '[embedded image]' : value),
                        2,
                      )}
                    </pre>
                    {candidate.document.sections.map((section) => (
                      <div key={section.id}>
                        <h4>
                          {section.title}
                          {!section.visible && copy('（已隐藏）', ' (hidden)')}
                        </h4>
                        {section.items.map((entry) => (
                          <div key={entry.id}>
                            <strong>{entry.title}</strong> {entry.subtitle} {entry.degree}{' '}
                            {entry.gpa}
                            <p>
                              {entry.startDate} {entry.endDate}
                              {entry.visible === false && copy('（已隐藏）', ' (hidden)')}
                            </p>
                            {entry.link && <p>{entry.link}</p>}
                            {entry.publication && (
                              <p>
                                {entry.publication.authors} · {entry.publication.venue} ·{' '}
                                {entry.publication.status}
                              </p>
                            )}
                            <RichTextContent value={entry.description} />
                            {entry.customFields?.map((field) => (
                              <p key={field.id}>
                                {field.label}: {field.value}
                              </p>
                            ))}
                            {entry.logo && (
                              <img
                                src={entry.logo}
                                alt={copy('条目标志', 'Entry logo')}
                                style={{ maxWidth: 80, maxHeight: 80 }}
                              />
                            )}
                            {entry.image && (
                              <img
                                src={entry.image}
                                alt={copy('条目图片', 'Entry image')}
                                style={{ maxWidth: '100%', maxHeight: 180 }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </details>
                </>
              )}
            </article>
          ))}
          <div className="transfer-actions">
            <Button
              onClick={() => {
                const report = new Blob([JSON.stringify(result, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(report);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'reference-conversion-report.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {copy('下载转换报告', 'Download conversion report')}
            </Button>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            {copy(
              '已复核所选简历及转换说明',
              'I reviewed the selected resumes and conversion notes',
            )}
          </label>
          <div className="transfer-actions">
            <Button
              variant="primary"
              disabled={!reviewed || !selected.size || busy}
              onClick={() => {
                for (const index of selected) {
                  const document = result.candidates[index]?.document;
                  if (document) onImport(document);
                }
                onClose();
              }}
            >
              {copy('创建所选本地简历', 'Create selected local resumes')} ({selected.size})
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
