import { useMemo } from 'react';
import { useI18n } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';
import { checkWriting } from '../resume/writing.ts';

const issueNames = {
  repeated: '重复用词',
  punctuation: '连续标点',
  vague: '表述可更具体',
  long: '长句',
};

export default function LocalWritingPanel({ document }: { document: ResumeDocument }) {
  const { t } = useI18n();
  const issues = useMemo(() => checkWriting(document), [document]);
  return (
    <section className="editor-form local-writing-panel" aria-label={t('本地写作检查')}>
      <div className="panel-heading">
        <h2>{t('本地写作检查')}</h2>
        <p>{t('按本地规则检查重复用词、标点、笼统表述和长句。建议供你逐项判断。')}</p>
      </div>
      <p role="status">
        {issues.length
          ? t('发现 {count} 处可检查的表述', { count: issues.length })
          : t('未发现规则覆盖的写作问题。')}
      </p>
      <ol className="review-issues">
        {issues.map((issue, index) => (
          <li key={`${issue.sectionId}-${issue.entryId ?? ''}-${index}`}>
            <strong>{t(issueNames[issue.kind])}</strong>
            <p>
              {[
                issue.systemSection ? t(issue.sectionTitle) : issue.sectionTitle,
                issue.entryTitle,
                issue.customField ? issue.field : t(issue.field),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <blockquote style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {issue.excerpt}
            </blockquote>
            <p>{t(issue.suggestion)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
