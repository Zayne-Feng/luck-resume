import { useI18n, t } from '../i18n';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { accents, createDocument, templates, type TemplateId } from '../resume/model.ts';
import { Thumbnail } from './PreviewPanel';
import { Button, Dialog } from './ui';
import './parity.css';

export default function Templates({
  selected,
  onChoose,
  onCreate,
}: {
  selected?: TemplateId;
  onChoose: (id: TemplateId, accent?: string) => void;
  onCreate: (id: TemplateId, accent?: string) => void;
}) {
  useI18n();
  const [accent, setAccent] = useState<string>(accents[0]);
  const [preview, setPreview] = useState<TemplateId | null>(null);
  const samples = useMemo(
    () =>
      templates.map((t) => {
        const doc = createDocument(t.id, true);
        doc.appearance.accent = accent;
        return doc;
      }),
    [accent],
  );
  return (
    <section className="full-page">
      <div className="page-heading">
        <div>
          <h1>{t('为你的故事，选一张好纸')}</h1>
          <p>{t('九种原创排版，给不同的经历留出合适的位置。所有模板都支持自定义内容。')}</p>
        </div>
      </div>
      <div className="gallery-colors" role="group" aria-label={t('预览配色')}>
        <span>{t('预览配色')}</span>
        {accents.map((color) => (
          <button
            key={color}
            type="button"
            style={{ backgroundColor: color }}
            aria-label={`${t('预览配色')} ${color}`}
            aria-pressed={accent === color}
            onClick={() => setAccent(color)}
          />
        ))}
        <input
          type="color"
          aria-label={t('自定义颜色')}
          value={accent}
          onChange={(event) => setAccent(event.target.value)}
        />
      </div>
      <div className="template-gallery">
        {templates.map((template, i) => (
          <article className={`template-card template-card-${i}`} key={template.id}>
            <button
              type="button"
              className="template-preview"
              aria-label={t('预览{name}模板', { name: t(template.name) })}
              onClick={() => setPreview(template.id)}
            >
              <Thumbnail document={samples[i]} />
            </button>
            <div className="template-card-info">
              <div>
                <h2>
                  {t(template.name)}
                  {selected === template.id && (
                    <span className="selected-template">
                      <Check size={13} />
                      {t('当前使用')}
                    </span>
                  )}
                </h2>
                <p>{t(template.description)}</p>
              </div>
              <div className="template-card-actions">
                <Button onClick={() => onChoose(template.id, accent)}>
                  {selected ? t('应用到当前简历') : t('使用模板')}
                </Button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onCreate(template.id, accent)}
                >
                  {t('新建简历')}
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <Dialog
          title={`${t('模板预览')} · ${t(templates.find((template) => template.id === preview)!.name)}`}
          onClose={() => setPreview(null)}
          wide
        >
          <p>{t('先查看排版，确认后再应用。')}</p>
          <div className="template-preview-paper">
            <Thumbnail
              document={samples.find((sample) => sample.appearance.template === preview)!}
            />
          </div>
          <div className="dialog-actions">
            <Button onClick={() => setPreview(null)}>{t('关闭')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                onChoose(preview, accent);
                setPreview(null);
              }}
            >
              {t('应用到当前简历')}
            </Button>
            <Button
              onClick={() => {
                onCreate(preview, accent);
                setPreview(null);
              }}
            >
              {t('新建简历')}
            </Button>
          </div>
        </Dialog>
      )}
      <div className="template-note">
        <p>{t('颜色可以柔和，表达始终清晰。')}</p>
        <span>{t('每个模板都支持更换配色、调整字体与间距。')}</span>
      </div>
    </section>
  );
}
