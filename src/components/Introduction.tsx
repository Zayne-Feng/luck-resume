import { useI18n, t } from '../i18n';
import { useMemo } from 'react';
import {
  ArrowRight,
  Check,
  FileDown,
  Heart,
  LayoutTemplate,
  LockKeyhole,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { accents, createDocument, templates, type TemplateId } from '../resume/model.ts';
import { Thumbnail } from './PreviewPanel';
import { Button } from './ui';

const questions = [
  [
    '我的简历会上传到服务器吗？',
    '草稿保存在本地，无需注册。编辑和排版在浏览器完成；只有主动使用 AI 或直接下载分页 PDF 时，选定内容才会发送至对应服务进行临时处理。本站不保存云端简历。',
  ],
  [
    '下次打开还能继续编辑吗？',
    '草稿会自动保存在当前浏览器中。你也可以下载 JSON 原稿作为备份，之后导入即可继续编辑。清理浏览器数据前，请先保存原稿。',
  ],
  [
    '怎样得到可以投递的简历？',
    '在编辑器中点击“导出 PDF”，进入浏览器的打印窗口后选择“另存为 PDF”。预览使用 A4 分页，导出时保留你的内容与排版。',
  ],
  [
    '模板里的内容可以自由调整吗？',
    '可以。九种模板都使用同一份可编辑简历内容，你可以随时切换模板、调整颜色和字体，也可以增加模块、自定义字段与经历。',
  ],
  [
    '可以换一台设备继续吗？',
    '可以。把 JSON 原稿保存到你自己的设备或存储空间，在另一台设备打开幸运简历并导入。原稿保留可编辑内容和排版设置。',
  ],
];

export default function Introduction({
  onCreate,
  onEditor,
  onTemplates,
}: {
  onCreate: (id?: TemplateId) => void;
  onEditor: () => void;
  onTemplates: () => void;
}) {
  useI18n();
  const samples = useMemo(
    () =>
      templates.map((template, index) => {
        const document = createDocument(template.id, true);
        document.appearance.accent = accents[index % accents.length];
        return document;
      }),
    [],
  );
  return (
    <div className="introduction-page">
      <section className="introduction-hero" aria-labelledby="introduction-title">
        <div className="introduction-copy">
          <span className="introduction-eyebrow">
            <Sparkles size={15} />
            {t('一点认真，一点好运')}
          </span>
          <h1 id="introduction-title">
            {t('让每一段经历，')}
            <br />
            {t('都有')}
            <span>{t('恰好的位置。')}</span>
          </h1>
          <p>
            {t('把走过的路，写成下一站的开始。')}
            <br />
            {t('一张清楚、好看的简历，从这里慢慢成形。')}
          </p>
          <div className="introduction-actions">
            <Button variant="primary" onClick={() => onCreate()}>
              {t('开始写我的简历')}
              <ArrowRight size={16} />
            </Button>
            <button type="button" className="text-button" onClick={onEditor}>
              {t('继续编辑')}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="introduction-promises">
            <span>
              <Check size={14} />
              {t('无需注册')}
            </span>
            <span>
              <Check size={14} />
              {t('本地保存')}
            </span>
            <span>
              <Check size={14} />
              {t('自由排版')}
            </span>
          </div>
        </div>
        <div className="introduction-art" aria-hidden="true">
          <div className="introduction-orbit" />
          <div className="introduction-note">
            <Heart size={18} />
            <span>
              {t('每一步，')}
              <br />
              {t('都算数。')}
            </span>
          </div>
          <div className="introduction-hero-paper">
            <Thumbnail document={samples[0]} />
          </div>
          <div className="introduction-sticker">
            <Sparkles size={21} />
            <span>
              {t('下一站，')}
              <br />
              <strong>{t('好消息。')}</strong>
            </span>
          </div>
        </div>
      </section>
      <section className="introduction-features" aria-label={t('使用方式')}>
        {[
          {
            icon: LayoutTemplate,
            title: t('选一张合适的纸'),
            text: t('九种原创模板，让经历与表达各得其所。'),
          },
          {
            icon: SlidersHorizontal,
            title: t('写成自己的样子'),
            text: t('内容、配色与间距，一边调整，一边看见。'),
          },
          {
            icon: FileDown,
            title: t('带着认真出发'),
            text: t('导出 A4 PDF，也留下随时可编辑的原稿。'),
          },
        ].map(({ icon: Icon, title, text }, index) => (
          <article key={title}>
            <span className={`introduction-feature-icon introduction-feature-${index}`}>
              <Icon size={23} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="introduction-templates" aria-labelledby="introduction-templates-title">
        <div className="introduction-section-heading">
          <div>
            <span className="introduction-eyebrow">{t('九种表达，同样认真')}</span>
            <h2 id="introduction-templates-title">{t('你的故事，值得一张好纸。')}</h2>
          </div>
          <button type="button" className="text-button" onClick={onTemplates}>
            {t('去模板中心')}
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="introduction-template-grid">
          {templates.map((template, index) => (
            <button
              type="button"
              className={`introduction-template introduction-template-${index % 3}`}
              key={template.id}
              aria-label={t('从{name}模板新建简历', { name: t(template.name) })}
              onClick={() => onCreate(template.id)}
            >
              <div className="introduction-template-paper">
                <Thumbnail document={samples[index]} />
              </div>
              <div className="introduction-template-label">
                <strong>{t(template.name)}</strong>
                <span>{t(template.description)}</span>
                <ArrowRight size={15} />
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="introduction-privacy">
        <span className="introduction-privacy-icon">
          <LockKeyhole size={28} />
        </span>
        <div>
          <h2>{t('关于你的事，留在你的设备里。')}</h2>
          <p>
            {t('无需账号，草稿留在本地。AI 与服务端 PDF 由你主动使用。')}
            <br />
            {t('下载一份 JSON 原稿，把下一次修改也握在自己手里。')}
          </p>
        </div>
        <span className="introduction-privacy-seal">
          LOCAL
          <br />
          <strong>{t('只属于你')}</strong>
        </span>
      </section>
      <section className="introduction-faq" aria-labelledby="introduction-faq-title">
        <div>
          <span className="introduction-eyebrow">{t('开始之前的小问题')}</span>
          <h2 id="introduction-faq-title">{t('你也许想知道')}</h2>
          <p>
            {t('安心写下自己，')}
            <br />
            {t('其他的，从这里了解。')}
          </p>
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{t(question)}</summary>
              <p>{t(answer)}</p>
            </details>
          ))}
        </div>
      </section>
      <footer className="introduction-footer">
        <span>{t('幸运简历 · Luck Resume')}</span>
        <p>{t('把可能，留给下一次出发。')}</p>
        <Button onClick={onEditor}>
          {t('回到工作台')}
          <ArrowRight size={15} />
        </Button>
      </footer>
    </div>
  );
}
