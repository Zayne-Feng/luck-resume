import { useI18n, t } from '../i18n';
import { Check, Circle, FileCheck2 } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { ResumeDocument } from '../resume/model.ts';
import { reviewDocument, type ReviewTarget } from '../resume/review.ts';
import LocalWritingPanel from './LocalWritingPanel';
import ContextualGrammarPanel from '../ai/ContextualGrammarPanel';
const LayoutQualityPanel = lazy(() => import('./LayoutQualityPanel'));

export default function ReviewPanel({
  document,
  onEdit,
  pages,
  onAppearance,
}: {
  document: ResumeDocument;
  onEdit: (target?: ReviewTarget) => void;
  pages: HTMLElement[];
  onAppearance: () => void;
}) {
  useI18n();
  const checks = reviewDocument(document);
  return (
    <div className="editor-form review-panel">
      <div className="review-intro">
        <FileCheck2 size={28} />
        <h2>{t('出发前，再看一眼')}</h2>
        <p>{t('根据投递版本中的可见内容，帮你检查细节。')}</p>
      </div>
      <Suspense fallback={null}>
        <LayoutQualityPanel
          document={document}
          pages={pages}
          onLocate={onEdit}
          onAppearance={onAppearance}
        />
      </Suspense>
      <p className="review-count">
        {t('已完成 {done} / {total} 项', {
          done: checks.filter((c) => c.done).length,
          total: checks.length,
        })}
      </p>
      <div className="review-checks">
        {checks.map((check) => (
          <div className={check.done ? 'done' : ''} key={check.id} data-check-id={check.id}>
            {check.done ? <Check size={18} /> : <Circle size={17} />}
            <div>
              <h3>{t(check.title)}</h3>
              <p>{t(check.detail)}</p>
              {check.issues.length > 0 && (
                <ul className="review-issues">
                  {check.issues.map((issue, index) => (
                    <li key={`${issue.sectionId}-${issue.entryId ?? ''}-${index}`}>
                      <button type="button" onClick={() => onEdit(issue)}>
                        {issue.label}
                        <span aria-hidden="true"> →</span>
                      </button>
                      <small>{t(issue.detail)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="button button-secondary" onClick={() => onEdit()}>
        {t('回到内容，完善一下')}
      </button>
      <div className="review-last-note">
        <p>{t('投递之前，下载 JSON 原稿，再预览一次 PDF。')}</p>
        <span>{t('本地规则检查在设备完成；AI 检查仅在你主动开始后发送可见文字。')}</span>
      </div>
      <LocalWritingPanel document={document} />
      <ContextualGrammarPanel
        document={document}
        onLocate={(sectionId, entryId) => onEdit({ sectionId, entryId })}
      />
    </div>
  );
}
