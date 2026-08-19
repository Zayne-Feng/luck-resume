import { useEffect, useState } from 'react';
import { t, useI18n } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';
import {
  inspectLayoutQuality,
  type LayoutQuality,
  type LayoutTarget,
} from '../resume/layoutQuality.ts';

export default function LayoutQualityPanel({
  document,
  pages,
  onLocate,
  onAppearance,
}: {
  document: ResumeDocument;
  pages: HTMLElement[];
  onLocate: (target?: LayoutTarget) => void;
  onAppearance: () => void;
}) {
  useI18n();
  const [quality, setQuality] = useState<LayoutQuality>({ scale: 1, issues: [] });
  useEffect(() => {
    setQuality(inspectLayoutQuality(pages));
  }, [document, pages]);
  return (
    <section className="layout-quality-panel" aria-label={t('打印版式检查')}>
      <h3>{t('打印版式检查')}</h3>
      {!pages.length ? (
        <p>{t('生成预览后检查打印版式。')}</p>
      ) : (
        <>
          <p>
            {t('实际打印比例：{scale}%', { scale: Math.round(quality.scale * 100) })}
            {quality.smallestTextPt !== undefined && (
              <> · {t('正文最小字号：{size} pt', { size: quality.smallestTextPt.toFixed(1) })}</>
            )}
          </p>
          {quality.issues.length === 0 ? (
            <p>{t('当前分页未发现字号、孤立标题或大面积留白问题。')}</p>
          ) : (
            <ul>
              {quality.issues.map((issue) => (
                <li key={issue.id}>
                  <p>
                    {t('第 {page} 页', { page: issue.page })} ·{' '}
                    {t(
                      issue.kind === 'small-text'
                        ? '部分正文打印后小于 9 pt，可调整字号或自动压缩比例。'
                        : issue.kind === 'orphan-heading'
                          ? '章节标题后缺少同页内容，可检查章节和分页设置。'
                          : '本页留白超过 35%，可检查分页、间距和条目长度。',
                    )}
                  </p>
                  {issue.target && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => onLocate(issue.target)}
                    >
                      {t('定位内容')}
                    </button>
                  )}
                  <button type="button" className="button button-secondary" onClick={onAppearance}>
                    {t('调整版式')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p>
            {t('检查基于当前分页。手动分页产生的留白不计入提示；修改内容和一页优化建议仍需确认。')}
          </p>
        </>
      )}
    </section>
  );
}
