import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from '../components/ui';
import type { ResumeDocument } from '../resume/model.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { generate } from './client.ts';
import { taskConfig } from './settings.ts';
import { applySuggestion, parseGrammar, type GrammarSuggestion } from './results.ts';
import {
  applyGrammar,
  grammarFields,
  grammarSource,
  suggestionField,
  sameGrammarField,
  type GrammarField,
} from './grammar.ts';

interface Review {
  suggestion: GrammarSuggestion;
  field: GrammarField;
  state: 'pending' | 'accepted' | 'ignored' | 'stale';
}
const reviewCache = new Map<string, { reviews: Review[]; checked: boolean }>();
export default function ContextualGrammarPanel({
  document,
  onLocate,
}: {
  document: ResumeDocument;
  onLocate?: (sectionId: string, entryId?: string) => void;
}) {
  const { t, errorText } = useI18n();
  const [reviews, setReviews] = useState<Review[]>(
    () => reviewCache.get(document.id)?.reviews || [],
  );
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(() => reviewCache.get(document.id)?.checked || false);
  const [error, setError] = useState('');
  const job = useRef<AbortController>();
  const [checkedId, setCheckedId] = useState(document.id);
  useEffect(() => {
    job.current?.abort();
    setBusy(false);
    if (checkedId !== document.id) {
      setReviews(reviewCache.get(document.id)?.reviews || []);
      setChecked(reviewCache.get(document.id)?.checked || false);
      setCheckedId(document.id);
    }
    return () => job.current?.abort();
  }, [document.id, checkedId]);
  useEffect(() => {
    if (checkedId === document.id) reviewCache.set(document.id, { reviews, checked });
  }, [document.id, checkedId, reviews, checked]);
  const run = async () => {
    const controller = new AbortController();
    job.current = controller;
    const fields = grammarFields(document, t);
    const source = grammarSource(fields);
    setBusy(true);
    setError('');
    setChecked(false);
    setReviews([]);
    setCheckedId(document.id);
    try {
      const result = await generate(taskConfig('text'), 'grammar', source, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setReviews(
        parseGrammar(result, source).flatMap((suggestion) => {
          const field = suggestionField(fields, suggestion);
          return field ? [{ suggestion, field, state: 'pending' as const }] : [];
        }),
      );
      setChecked(true);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (job.current === controller) setBusy(false);
    }
  };
  const accept = (review: Review) => {
    if (checkedId !== document.id) return;
    let applied = false;
    useWorkspace.getState().update(
      (next) => {
        applied = applyGrammar(next, review.field, review.suggestion);
      },
      undefined,
      document.id,
    );
    setReviews((previous) =>
      previous.map((item) => {
        if (item === review) return { ...item, state: applied ? 'accepted' : 'stale' };
        if (!applied || !sameGrammarField(item.field, review.field) || item.state !== 'pending')
          return item;
        const local = { ...review.suggestion, start: review.suggestion.start - review.field.start };
        const field = { ...item.field, text: applySuggestion(item.field.text, local) };
        const acceptedEnd = review.suggestion.start + review.suggestion.original.length;
        if (item.suggestion.start >= acceptedEnd)
          return {
            ...item,
            field,
            suggestion: {
              ...item.suggestion,
              start:
                item.suggestion.start +
                review.suggestion.replacement.length -
                review.suggestion.original.length,
            },
          };
        if (item.suggestion.start + item.suggestion.original.length <= review.suggestion.start)
          return { ...item, field };
        return { ...item, state: 'stale' };
      }),
    );
  };
  const locate = (review: Review) => {
    if (onLocate) {
      onLocate(review.field.sectionId, review.field.entryId);
      return;
    }
    const selector = review.field.entryId
      ? `[data-entry-id="${CSS.escape(review.field.entryId)}"]`
      : `[data-section-id="${CSS.escape(review.field.sectionId)}"]`;
    const element = window.document.querySelector<HTMLElement>(selector);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  };
  return (
    <section className="editor-form" aria-label={t('AI 语法检查')}>
      <h2>{t('AI 语法检查')}</h2>
      <p>{t('点击检查后，将可见文字发送至所选模型。逐条接受或忽略，修改可用编辑器撤销。')}</p>
      <div className="transfer-actions">
        <Button disabled={busy} onClick={run}>
          {t('开始语法检查')}
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
      {checked && !reviews.length && <p role="status">{t('未发现语法问题。')}</p>}
      <ol className="review-issues">
        {reviews.map((review) => (
          <li key={review.suggestion.id}>
            <strong>{review.field.label}</strong>
            <blockquote>{review.suggestion.original}</blockquote>
            <p>{review.suggestion.replacement}</p>
            <p>{review.suggestion.reason}</p>
            {review.state === 'pending' ? (
              <div className="transfer-actions">
                <Button onClick={() => locate(review)}>{t('定位原文')}</Button>
                <Button onClick={() => accept(review)}>{t('接受')}</Button>
                <Button
                  onClick={() =>
                    setReviews((previous) =>
                      previous.map((item) =>
                        item === review ? { ...item, state: 'ignored' } : item,
                      ),
                    )
                  }
                >
                  {t('忽略')}
                </Button>
              </div>
            ) : (
              <p>
                {t(
                  review.state === 'accepted'
                    ? '已接受'
                    : review.state === 'ignored'
                      ? '已忽略'
                      : '原文已变化，请重新检查。',
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
