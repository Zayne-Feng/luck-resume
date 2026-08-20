import { useI18n, t } from '../i18n';
import { lazy, Suspense, useState } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { accents, templates, dateFormats, type Appearance } from '../resume/model.ts';
import OnePageFit from './OnePageFit';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { Button } from './ui';
import { currentPhotoDimensions, resizeDimensions } from '../resume/dimensions.ts';
import SettingSearch from './SettingSearch';
const AppearancePresetsPanel = lazy(() => import('./AppearancePresetsPanel'));

const densities = [
  { label: '紧凑', fontSize: 12, lineHeight: 1.45, sectionGap: 14, pageMargin: 15 },
  { label: '适中', fontSize: 13, lineHeight: 1.65, sectionGap: 20, pageMargin: 18 },
  { label: '舒展', fontSize: 14, lineHeight: 1.8, sectionGap: 26, pageMargin: 21 },
];

export default function AppearancePanel({ appearance }: { appearance: Appearance }) {
  useI18n();
  const update = useWorkspace((s) => s.update);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    update((doc) => {
      doc.appearance[key] = value;
    }, `appearance-${key}`);
  const sliders = [
    { key: 'fontSize' as const, label: '正文字号', min: 9, max: 24, step: 0.5, unit: 'px' },
    { key: 'lineHeight' as const, label: '文字行高', min: 1, max: 2.5, step: 0.05, unit: '' },
    { key: 'pageMargin' as const, label: '页面边距', min: 0, max: 40, step: 1, unit: 'mm' },
    { key: 'sectionGap' as const, label: '模块间距', min: 0, max: 100, step: 1, unit: 'px' },
  ];
  return (
    <div className="editor-form appearance-panel">
      <div className="panel-heading">
        <h2>{t('把风格，也留给自己')}</h2>
        <span>{t('先选喜欢的，再慢慢微调。')}</span>
      </div>
      <SettingSearch />
      <details
        className="presets-disclosure"
        data-setting-search-ignore
        onToggle={(event) => setPresetsOpen(event.currentTarget.open)}
      >
        <summary>{t('我的样式预设')}</summary>
        {presetsOpen && (
          <Suspense fallback={<p>{t('正在读取样式…')}</p>}>
            <AppearancePresetsPanel
              appearance={appearance}
              onApply={(next) =>
                update((doc) => {
                  doc.appearance = structuredClone(next);
                })
              }
            />
          </Suspense>
        )}
      </details>
      <fieldset className="appearance-field">
        <legend>{t('从一张好纸开始')}</legend>
        <div className="template-options">
          {templates.map((template) => (
            <button
              type="button"
              key={template.id}
              className={appearance.template === template.id ? 'selected' : ''}
              aria-pressed={appearance.template === template.id}
              onClick={() => set('template', template.id)}
            >
              <span className={`template-glyph glyph-${template.id}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>{t(template.name)}</span>
              {appearance.template === template.id && <Check size={15} />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="appearance-field">
        <legend>{t('选一份马卡龙色')}</legend>
        <div className="color-options">
          {accents.map((accent, i) => (
            <button
              type="button"
              key={accent}
              style={{ '--swatch': accent } as React.CSSProperties}
              className={`color-option ${appearance.accent === accent ? 'selected' : ''}`}
              aria-label={
                [t('薄荷绿'), t('雾蓝'), t('浅樱粉'), t('薰衣草紫'), t('奶杏色'), t('海盐青')][i]
              }
              aria-pressed={appearance.accent === accent}
              onClick={() => set('accent', accent)}
            >
              {appearance.accent === accent && <Check size={17} />}
            </button>
          ))}
        </div>
        <label className="custom-color-label">
          {t('也可以自己调色')}
          <input
            type="color"
            aria-label={t('自定义模板颜色')}
            value={appearance.accent}
            onChange={(e) => set('accent', e.target.value)}
          />
          <span>{appearance.accent.toUpperCase()}</span>
        </label>
        <p className="field-hint">{t('背景和装饰随颜色变化，正文始终保持深色。')}</p>
      </fieldset>
      <fieldset className="appearance-field">
        <legend>{t('一键调整疏密')}</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={appearance.automaticOnePage ?? false}
            onChange={(event) => set('automaticOnePage', event.target.checked)}
          />
          {t('自动适配一页')}
        </label>
        <label className="range-field">
          <span>
            {t('自动一页最低比例')}{' '}
            <output>{Math.round((appearance.automaticOnePageMinScale ?? 0.5) * 100)}%</output>
          </span>
          <input
            type="range"
            aria-label={t('自动一页最低比例')}
            min="50"
            max="100"
            step="5"
            value={Math.round((appearance.automaticOnePageMinScale ?? 0.5) * 100)}
            onChange={(event) => set('automaticOnePageMinScale', Number(event.target.value) / 100)}
          />
        </label>
        <p className="field-hint">{t('随内容变化自动调整显示比例，保留原始字号与间距。')}</p>
        <OnePageFit />
        <div className="segmented">
          {densities.map((density) => (
            <button
              type="button"
              key={density.label}
              className={
                appearance.fontSize === density.fontSize &&
                appearance.lineHeight === density.lineHeight &&
                appearance.sectionGap === density.sectionGap &&
                appearance.pageMargin === density.pageMargin
                  ? 'active'
                  : ''
              }
              onClick={() =>
                update((doc) => {
                  const { label: _, ...settings } = density;
                  Object.assign(doc.appearance, settings);
                })
              }
            >
              {t(density.label)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="appearance-field">
        <legend>{t('字体的气质')}</legend>
        <div className="segmented">
          <button
            type="button"
            className={appearance.font === 'sans' ? 'active' : ''}
            aria-pressed={appearance.font === 'sans'}
            onClick={() => set('font', 'sans')}
          >
            {t('简洁黑体')}
          </button>
          <button
            type="button"
            className={appearance.font === 'serif' ? 'active' : ''}
            aria-pressed={appearance.font === 'serif'}
            onClick={() => set('font', 'serif')}
          >
            {t('雅致宋体')}
          </button>
          <button
            type="button"
            className={appearance.font === 'wenkai' ? 'active' : ''}
            aria-pressed={appearance.font === 'wenkai'}
            onClick={() => set('font', 'wenkai')}
          >
            {t('文楷')}
          </button>
          <button
            type="button"
            className={appearance.font === 'xiaowei' ? 'active' : ''}
            aria-pressed={appearance.font === 'xiaowei'}
            onClick={() => set('font', 'xiaowei')}
          >
            {t('小薇')}
          </button>
        </div>
      </fieldset>
      <fieldset className="appearance-field">
        <legend>{t('名字放在哪里')}</legend>
        <div className="segmented">
          <button
            type="button"
            className={appearance.headerAlign === 'left' ? 'active' : ''}
            aria-pressed={appearance.headerAlign === 'left'}
            onClick={() => set('headerAlign', 'left')}
          >
            {t('靠左，自然大方')}
          </button>
          <button
            type="button"
            className={appearance.headerAlign === 'center' ? 'active' : ''}
            aria-pressed={appearance.headerAlign === 'center'}
            onClick={() => set('headerAlign', 'center')}
          >
            {t('居中，正式一点')}
          </button>
          <button
            type="button"
            className={appearance.headerAlign === 'right' ? 'active' : ''}
            aria-pressed={appearance.headerAlign === 'right'}
            onClick={() => set('headerAlign', 'right')}
          >
            {t('靠右')}
          </button>
        </div>
      </fieldset>
      <fieldset className="appearance-field">
        <legend>{t('抬头布局')}</legend>
        <div className="segmented">
          {(
            [
              { value: 'standard', label: t('并排') },
              { value: 'stacked', label: t('上下排列') },
            ] as const
          ).map((option) => (
            <button
              type="button"
              key={option.value}
              className={(appearance.headerLayout ?? 'standard') === option.value ? 'active' : ''}
              aria-pressed={(appearance.headerLayout ?? 'standard') === option.value}
              onClick={() => set('headerLayout', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={appearance.contactIcons ?? false}
            onChange={(event) => set('contactIcons', event.target.checked)}
          />
          {t('显示字段图标')}
        </label>
      </fieldset>
      <fieldset className="appearance-field">
        <legend>{t('章节标题的样子')}</legend>
        <div className="segmented">
          {(
            [
              { value: 'plain', label: t('简约') },
              { value: 'highlight', label: t('色块') },
              { value: 'underline', label: t('细线') },
              { value: 'timeline', label: t('时间轴') },
            ] as const
          ).map((option) => (
            <button
              type="button"
              key={option.value}
              className={appearance.headingStyle === option.value ? 'active' : ''}
              aria-pressed={appearance.headingStyle === option.value}
              onClick={() => set('headingStyle', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="advanced-settings">
        <summary>
          {t('更多细节，交给你')}
          <ChevronDown size={16} />
        </summary>
        <div className="advanced-settings-body">
          <label className="field">
            <span>{t('条目标题布局')}</span>
            <select
              aria-label={t('条目标题布局')}
              value={appearance.entryHeadingLayout ?? 'split'}
              onChange={(event) =>
                set('entryHeadingLayout', event.target.value as Appearance['entryHeadingLayout'])
              }
            >
              <option value="split">{t('标题与日期分列')}</option>
              <option value="stacked">{t('标题与日期上下排列')}</option>
              <option value="inline">{t('标题与日期同行')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('副标题对齐')}</span>
            <select
              aria-label={t('副标题对齐')}
              value={appearance.subtitleAlign ?? 'left'}
              onChange={(event) =>
                set('subtitleAlign', event.target.value as Appearance['subtitleAlign'])
              }
            >
              <option value="left">{t('靠左')}</option>
              <option value="center">{t('居中')}</option>
              <option value="right">{t('靠右')}</option>
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={appearance.centerSubtitle ?? false}
              onChange={(event) => set('centerSubtitle', event.target.checked)}
            />
            {t('副标题与标题日期同行居中')}
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={appearance.flexibleHeaderLayout ?? false}
              onChange={(event) => set('flexibleHeaderLayout', event.target.checked)}
            />
            {t('标题行按内容灵活分配空间')}
          </label>
          <label className="field">
            <span>{t('日期显示格式')}</span>
            <select
              aria-label={t('日期显示格式')}
              value={appearance.dateFormat ?? 'original'}
              onChange={(event) =>
                set('dateFormat', event.target.value as Appearance['dateFormat'])
              }
            >
              {dateFormats.map((format) => (
                <option key={format} value={format}>
                  {format === 'original' ? t('保持输入格式') : format}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('文档语言')}</span>
            <select
              aria-label={t('文档语言')}
              value={appearance.language ?? 'zh'}
              onChange={(event) => set('language', event.target.value as 'zh' | 'en')}
            >
              <option value="zh">{t('中文')}</option>
              <option value="en">{t('English（Present 日期）')}</option>
            </select>
          </label>
          {sliders.map(({ key, label, min, max, step, unit }) => (
            <div className="range-field" key={key}>
              <label htmlFor={`range-${key}`}>
                {t(label)}
                <output>
                  {Number(appearance[key].toFixed(2))}
                  {unit && ` ${unit}`}
                </output>
              </label>
              <input
                id={`range-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={appearance[key]}
                onChange={(e) => set(key, Number(e.target.value))}
              />
            </div>
          ))}
          {(
            [
              ['nameSize', t('姓名字号'), 20, 52, 34],
              ['headingSize', t('章节标题字号'), 11, 24, 14],
              ['entryHeadingSize', t('条目标题字号'), 9, 32, appearance.fontSize],
              ['entryHeadingGap', t('标题行间隔'), 0, 64, 12],
              ['entryGap', t('条目间距'), 0, 100, 16],
              ['paragraphGap', t('段落间距'), 0, 50, 4],
              ['photoPositionX', t('照片横向取景'), 0, 100, 50],
              ['photoPositionY', t('照片纵向取景'), 0, 100, 50],
              [
                'columnRatio',
                t('双栏左栏占比（%）'),
                20,
                80,
                appearance.template === 'campus' ? 35 : 50,
              ],
              ['columnGap', t('双栏间距（px）'), 0, 64, 24],
            ] as const
          ).map(([key, label, min, max, fallback]) => (
            <div className="range-field" key={key}>
              <label htmlFor={`range-${key}`}>
                {label}
                <output>{appearance[key] ?? fallback}</output>
              </label>
              <input
                id={`range-${key}`}
                type="range"
                min={min}
                max={max}
                step={1}
                value={appearance[key] ?? fallback}
                onChange={(event) => set(key, Number(event.target.value))}
              />
            </div>
          ))}
          <p className="field-hint">
            {t('双栏设置用于左右分栏模块和模块内双列；窄栏中的双列会自动收紧栏距，保留文字空间。')}
          </p>
          <fieldset className="appearance-field">
            <legend>{t('照片的形状')}</legend>
            <div className="segmented">
              {(
                [
                  { value: 'square', label: t('方形') },
                  { value: 'rounded', label: t('圆角') },
                  { value: 'circle', label: t('圆形') },
                ] as const
              ).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={
                    appearance.photoShape === option.value && appearance.photoRadius === undefined
                      ? 'active'
                      : ''
                  }
                  aria-pressed={
                    appearance.photoShape === option.value && appearance.photoRadius === undefined
                  }
                  onClick={() =>
                    update((doc) => {
                      doc.appearance.photoShape = option.value;
                      delete doc.appearance.photoRadius;
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="range-field">
            <label htmlFor="photo-size">
              {t('照片大小')}
              <output>{appearance.photoSize} px</output>
            </label>
            <input
              id="photo-size"
              type="range"
              min="20"
              max="180"
              value={appearance.photoSize}
              onChange={(e) =>
                update((doc) => {
                  const size = Number(e.target.value);
                  doc.appearance.photoSize = size;
                  if (doc.appearance.photoAspectRatio) {
                    const dimensions = resizeDimensions(
                      currentPhotoDimensions(doc.appearance),
                      'width',
                      size,
                      doc.appearance.photoAspectRatio,
                    );
                    doc.appearance.photoWidth = dimensions.width;
                    doc.appearance.photoHeight = dimensions.height;
                  } else {
                    delete doc.appearance.photoWidth;
                    delete doc.appearance.photoHeight;
                  }
                }, 'appearance-photoSize')
              }
            />
          </div>
          <fieldset className="appearance-field">
            <legend>{t('照片比例')}</legend>
            <div className="segmented">
              {(
                [
                  [1, 1],
                  [3, 4],
                  [4, 3],
                  [16, 9],
                ] as const
              ).map(([width, height]) => {
                const currentWidth = appearance.photoWidth ?? appearance.photoSize;
                const currentHeight =
                  appearance.photoHeight ??
                  (appearance.photoShape === 'circle' ? currentWidth : appearance.photoSize * 1.28);
                const selected = Math.abs(currentWidth / currentHeight - width / height) < 0.001;
                return (
                  <button
                    key={`${width}:${height}`}
                    type="button"
                    className={selected ? 'active' : ''}
                    aria-pressed={selected}
                    onClick={() =>
                      update((doc) => {
                        const ratio = width / height;
                        const dimensions = resizeDimensions(
                          currentPhotoDimensions(doc.appearance),
                          'width',
                          currentWidth,
                          ratio,
                        );
                        doc.appearance.photoWidth = dimensions.width;
                        doc.appearance.photoHeight = dimensions.height;
                        if (doc.appearance.photoAspectRatio)
                          doc.appearance.photoAspectRatio = ratio;
                      })
                    }
                  >
                    {width}:{height}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="check-field">
            <input
              type="checkbox"
              checked={appearance.photoAspectRatio !== undefined}
              onChange={(event) =>
                update((doc) => {
                  const dimensions = currentPhotoDimensions(doc.appearance);
                  if (event.target.checked)
                    doc.appearance.photoAspectRatio = dimensions.width / dimensions.height;
                  else delete doc.appearance.photoAspectRatio;
                })
              }
            />
            {t('锁定照片比例')}
          </label>
          {(
            [
              ['photoWidth', t('照片宽度'), 20, 200, appearance.photoSize],
              [
                'photoHeight',
                t('照片高度'),
                20,
                220,
                appearance.photoShape === 'circle'
                  ? appearance.photoSize
                  : appearance.photoSize * 1.28,
              ],
              [
                'photoRadius',
                t('照片圆角'),
                0,
                110,
                appearance.photoShape === 'circle'
                  ? (appearance.photoWidth ?? appearance.photoSize) / 2
                  : appearance.photoShape === 'square'
                    ? 0
                    : 12,
              ],
            ] as const
          ).map(([key, label, min, max, fallback]) => (
            <div className="range-field" key={key}>
              <label htmlFor={`range-${key}`}>
                {label}
                <output>{appearance[key] ?? fallback} px</output>
              </label>
              <input
                id={`range-${key}`}
                type="range"
                min={min}
                max={max}
                value={appearance[key] ?? fallback}
                step={1}
                onChange={(event) => {
                  if (key === 'photoRadius') set(key, Number(event.target.value));
                  else
                    update((doc) => {
                      const dimensions = resizeDimensions(
                        currentPhotoDimensions(doc.appearance),
                        key === 'photoWidth' ? 'width' : 'height',
                        Number(event.target.value),
                        doc.appearance.photoAspectRatio,
                      );
                      doc.appearance.photoWidth = dimensions.width;
                      doc.appearance.photoHeight = dimensions.height;
                    }, `appearance-${key}`);
                }}
              />
            </div>
          ))}
          <p className="field-hint">{t('锁定比例后，调整宽度或高度会同步缩放照片。')}</p>
          <div className="form-grid">
            <label className="field">
              <span>{t('照片适配')}</span>
              <select
                aria-label={t('照片适配')}
                value={appearance.photoFit ?? 'cover'}
                onChange={(event) => set('photoFit', event.target.value as Appearance['photoFit'])}
              >
                <option value="cover">{t('填满并裁切')}</option>
                <option value="contain">{t('完整显示')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('照片位置')}</span>
              <select
                aria-label={t('照片位置')}
                value={appearance.photoSide ?? 'right'}
                onChange={(event) =>
                  set('photoSide', event.target.value as Appearance['photoSide'])
                }
              >
                <option value="left">{t('左侧')}</option>
                <option value="right">{t('右侧')}</option>
              </select>
            </label>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={appearance.showPhoto}
              onChange={(e) => set('showPhoto', e.target.checked)}
            />
            {t('在简历中显示照片')}
          </label>
        </div>
      </details>
      <Button
        onClick={() =>
          update((doc) => {
            for (const key of [
              'nameSize',
              'headingSize',
              'entryHeadingSize',
              'entryHeadingGap',
              'centerSubtitle',
              'flexibleHeaderLayout',
              'entryGap',
              'paragraphGap',
              'photoPositionX',
              'photoPositionY',
              'columnRatio',
              'columnGap',
              'photoWidth',
              'photoHeight',
              'photoAspectRatio',
              'photoRadius',
              'photoFit',
              'photoSide',
              'contactIcons',
              'headerLayout',
              'entryHeadingLayout',
              'subtitleAlign',
              'automaticOnePage',
              'automaticOnePageMinScale',
            ] as const)
              delete doc.appearance[key];
            Object.assign(doc.appearance, {
              fontSize: 13,
              lineHeight: 1.65,
              pageMargin: 18,
              sectionGap: 20,
              headerAlign: 'left',
              headingStyle: 'plain',
              photoSize: 78,
              photoShape: 'rounded',
              showPhoto: true,
            });
          })
        }
      >
        <RotateCcw size={15} />
        {t('恢复默认排版')}
      </Button>
    </div>
  );
}
