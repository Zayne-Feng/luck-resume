import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Button, Field } from '../components/ui';
import BirthDateField from '../components/BirthDateField';
import {
  richText,
  textContent,
  type ResumeDocument,
  type ResumeField,
  type Publication,
} from '../resume/model.ts';
import { generate } from './client.ts';
import { MAX_AI_PDF_BYTES, pdfAttachments } from './pdf.ts';
import { parseSemanticResume } from './results.ts';
import { taskConfig } from './settings.ts';
import { validateDocument } from '../resume/files.ts';

function CustomFieldsReview({
  fields,
  onChange,
}: {
  fields: ResumeField[];
  onChange: (fields: ResumeField[]) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {fields.map((field, index) => (
        <div className="transfer-actions" key={field.id}>
          <Field
            label={t('字段名称')}
            value={field.label}
            onChange={(e) =>
              onChange(
                fields.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, label: e.target.value } : item,
                ),
              )
            }
          />
          <label className="field">
            {t('字段内容')}
            <textarea
              aria-label={t('字段内容')}
              value={field.value}
              onChange={(e) =>
                onChange(
                  fields.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, value: e.target.value } : item,
                  ),
                )
              }
            />
          </label>
          {field.kind === 'link' && (
            <Field
              label={t('链接显示文字')}
              value={field.linkLabel ?? ''}
              maxLength={300}
              onChange={(event) =>
                onChange(
                  fields.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, linkLabel: event.target.value } : item,
                  ),
                )
              }
            />
          )}
          <Button onClick={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))}>
            {t('移除字段')}
          </Button>
        </div>
      ))}
    </>
  );
}

export default function SemanticImportPanel({
  onImport,
  onClose,
}: {
  onImport: (document: ResumeDocument) => void;
  onClose: () => void;
}) {
  const { t, errorText } = useI18n();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ResumeDocument | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const job = useRef<AbortController>();
  useEffect(() => () => job.current?.abort(), []);
  const reset = () => {
    job.current?.abort();
    setBusy(false);
    setPreview(null);
    setConfirmed(false);
    setError('');
  };
  const analyze = async () => {
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setError('');
    setPreview(null);
    setConfirmed(false);
    try {
      const config = taskConfig(file ? 'pdf' : 'text');
      if (file) {
        const model = config.models.find((model) => model.id === config.model);
        if (!model?.vision && !model?.verifiedVision)
          throw new Error('请先测试 PDF 模型的视觉能力。');
      }
      const attachments = file
        ? await pdfAttachments(file, config.protocol, controller.signal)
        : undefined;
      const result = await generate(
        config,
        'semantic',
        file ? 'Extract this complete resume. Merge entries across pages in reading order.' : text,
        { attachments, signal: controller.signal },
      );
      if (!controller.signal.aborted) setPreview(parseSemanticResume(result));
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (job.current === controller) setBusy(false);
    }
  };
  const change = (mutate: (document: ResumeDocument) => void) =>
    setPreview((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      mutate(next);
      return next;
    });
  return (
    <section className="editor-form" aria-label={t('AI 语义导入')}>
      <h3>{t('AI 语义导入')}</h3>
      <p>{t('将 PDF 或 Markdown 发送至所选模型，整理为可编辑字段。预览确认后创建新简历。')}</p>
      <label className="field">
        {t('Markdown 内容')}
        <textarea
          aria-label={t('Markdown 内容')}
          rows={6}
          value={text}
          disabled={!!file}
          maxLength={300000}
          onChange={(e) => {
            reset();
            setText(e.target.value);
          }}
        />
      </label>
      <label className="field">
        {t('选择 PDF 或 Markdown')}
        <input
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          onChange={async (e) => {
            reset();
            setFile(null);
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (!selected) return;
            if (selected.size > MAX_AI_PDF_BYTES) {
              setError(t('文件超过 AI 导入的 20 MiB 大小限制。'));
              return;
            }
            if (/\.pdf$/i.test(selected.name)) {
              setFile(selected);
              return;
            }
            const controller = new AbortController();
            job.current = controller;
            try {
              const content = await selected.text();
              if (!controller.signal.aborted) setText(content.slice(0, 300000));
            } catch (error) {
              setError(errorText(error));
            }
          }}
        />
      </label>
      {file && (
        <div className="transfer-actions">
          <span>{file.name}</span>
          <Button
            onClick={() => {
              reset();
              setFile(null);
            }}
          >
            {t('移除文件')}
          </Button>
        </div>
      )}
      <div className="transfer-actions">
        <Button disabled={busy || (!file && !text.trim())} onClick={analyze}>
          {t('分析并预览')}
        </Button>
        {busy && (
          <Button
            onClick={() => {
              job.current?.abort();
              setBusy(false);
            }}
          >
            {t('取消')}
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="editor-form">
          <h3>{t('确认导入内容')}</h3>
          <Field
            label={t('简历名称')}
            value={preview.title}
            onChange={(e) =>
              change((next) => {
                next.title = e.target.value;
              })
            }
          />
          {(['name', 'headline', 'email', 'phone', 'location', 'website'] as const).map((key) => (
            <Field
              key={key}
              label={t(
                {
                  name: '姓名',
                  headline: '求职意向',
                  email: '邮箱',
                  phone: '电话',
                  location: '所在地',
                  website: '网站',
                }[key],
              )}
              value={preview.profile[key]}
              onChange={(e) =>
                change((next) => {
                  next.profile[key] = e.target.value;
                })
              }
            />
          ))}
          <BirthDateField
            key={preview.id}
            value={preview.profile.birthday || ''}
            onChange={(value) =>
              change((next) => {
                next.profile.birthday = value;
              })
            }
          />
          <Field
            label={t('求职状态')}
            value={preview.profile.employmentStatus || ''}
            onChange={(e) =>
              change((next) => {
                next.profile.employmentStatus = e.target.value;
              })
            }
          />
          <CustomFieldsReview
            fields={preview.profile.customFields || []}
            onChange={(fields) =>
              change((next) => {
                next.profile.customFields = fields;
              })
            }
          />
          {preview.sections.map((section, sectionIndex) => (
            <fieldset key={section.id}>
              <legend>{section.title}</legend>
              <Field
                label={t('模块标题')}
                value={section.title}
                onChange={(e) =>
                  change((next) => {
                    next.sections[sectionIndex].title = e.target.value;
                  })
                }
              />
              {section.items.map((entry, entryIndex) => (
                <div key={entry.id} className="editor-form">
                  {(
                    [
                      'title',
                      'subtitle',
                      'startDate',
                      'endDate',
                      'location',
                      'link',
                      'linkLabel',
                    ] as const
                  ).map((key) => (
                    <Field
                      key={key}
                      label={t(
                        {
                          title: '标题',
                          subtitle: '副标题',
                          startDate: '开始日期',
                          endDate: '结束日期',
                          location: '所在地',
                          link: '链接',
                          linkLabel: '链接显示文字',
                        }[key],
                      )}
                      value={entry[key] ?? ''}
                      onChange={(e) =>
                        change((next) => {
                          next.sections[sectionIndex].items[entryIndex][key] = e.target.value;
                        })
                      }
                    />
                  ))}
                  {section.type === 'education' &&
                    (['degree', 'gpa'] as const).map((key) => (
                      <Field
                        key={key}
                        label={key === 'degree' ? t('学历 / 学位') : 'GPA'}
                        value={entry[key] ?? ''}
                        maxLength={key === 'degree' ? 300 : 100}
                        onChange={(event) =>
                          change((next) => {
                            next.sections[sectionIndex].items[entryIndex][key] = event.target.value;
                          })
                        }
                      />
                    ))}
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={entry.current}
                      onChange={(e) =>
                        change((next) => {
                          next.sections[sectionIndex].items[entryIndex].current = e.target.checked;
                        })
                      }
                    />
                    {t('至今')}
                  </label>
                  <label className="field">
                    {t('描述')}
                    <textarea
                      aria-label={t('描述')}
                      rows={4}
                      value={textContent(entry.description)}
                      onChange={(e) =>
                        change((next) => {
                          next.sections[sectionIndex].items[entryIndex].description = richText(
                            ...e.target.value.split('\n'),
                          );
                        })
                      }
                    />
                  </label>
                  <CustomFieldsReview
                    fields={entry.customFields || []}
                    onChange={(fields) =>
                      change((next) => {
                        next.sections[sectionIndex].items[entryIndex].customFields = fields;
                      })
                    }
                  />
                  {entry.publication && (
                    <fieldset>
                      <legend>{t('论文信息')}</legend>
                      {(['authors', 'highlightedAuthor', 'venue'] as const).map((key) => (
                        <Field
                          key={key}
                          label={t(
                            {
                              authors: '作者',
                              highlightedAuthor: '高亮作者',
                              venue: '期刊 / 会议',
                            }[key],
                          )}
                          value={entry.publication![key]}
                          onChange={(e) =>
                            change((next) => {
                              next.sections[sectionIndex].items[entryIndex].publication![key] =
                                e.target.value;
                            })
                          }
                        />
                      ))}
                      <label className="field">
                        {t('发表状态')}
                        <select
                          value={entry.publication.status}
                          onChange={(e) =>
                            change((next) => {
                              next.sections[sectionIndex].items[entryIndex].publication!.status = e
                                .target.value as Publication['status'];
                            })
                          }
                        >
                          {(
                            ['none', 'published', 'accepted', 'preprint', 'submitted'] as const
                          ).map((status) => (
                            <option key={status} value={status}>
                              {t(
                                {
                                  none: '未指定',
                                  published: '已发表',
                                  accepted: '已录用',
                                  preprint: '预印本',
                                  submitted: '已投稿',
                                }[status],
                              )}
                            </option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                  )}
                  <Button
                    onClick={() =>
                      change((next) => {
                        next.sections[sectionIndex].items.splice(entryIndex, 1);
                      })
                    }
                  >
                    {t('移除条目')}
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  change((next) => {
                    next.sections.splice(sectionIndex, 1);
                  })
                }
              >
                {t('移除模块')}
              </Button>
            </fieldset>
          ))}
          <label className="check-field">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t('已核对内容，创建为新简历')}
          </label>
          <Button
            variant="primary"
            disabled={!confirmed || busy}
            onClick={() => {
              try {
                const document = validateDocument(preview);
                onImport(document);
                onClose();
              } catch (error) {
                setError(errorText(error));
              }
            }}
          >
            {t('创建新简历')}
          </Button>
        </div>
      )}
    </section>
  );
}
