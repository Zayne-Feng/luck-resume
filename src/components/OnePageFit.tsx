import { useI18n, t, errorText } from '../i18n';
import { useCallback, useState } from 'react';
import { Minimize2 } from 'lucide-react';
import { suggestOnePage, type FitResult } from '../resume/fit.ts';
import { ensureResumeFont } from '../resume/fonts.ts';
import type { ResumeDocument } from '../resume/model.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { Button, Dialog } from './ui';

const labels = {
  fontSize: '正文字号',
  lineHeight: '文字行高',
  pageMargin: '页面边距',
  sectionGap: '模块间距',
  entryGap: '条目间距',
  paragraphGap: '段落间距',
};
export default function OnePageFit() {
  useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(FitResult & { document: ResumeDocument }) | null>(null);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    setResult(null);
    setError('');
  }, []);
  return (
    <>
      <Button
        disabled={busy}
        onClick={async () => {
          const state = useWorkspace.getState(),
            doc = state.activeId ? state.documents[state.activeId] : undefined;
          if (!doc) return;
          setBusy(true);
          try {
            await ensureResumeFont(doc.appearance.font);
            await Promise.all(
              Array.from(
                document.querySelectorAll<HTMLImageElement>('.pagination-source img'),
                (img) => img.decode(),
              ),
            );
            if (
              useWorkspace.getState().documents[doc.id] !== doc ||
              useWorkspace.getState().activeId !== doc.id
            )
              throw new Error('简历内容已更新，请重新计算。');
            const source = document.querySelector<HTMLElement>(
              '.pagination-source .resume-document',
            );
            if (!source) throw new Error('请先打开一份简历。');
            setResult({ ...suggestOnePage(source, doc.appearance), document: doc });
          } catch (error) {
            setError(error instanceof Error ? error.message : '暂时无法计算，请重试。');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Minimize2 size={15} />
        {busy ? t('正在计算…') : t('一页适配建议')}
      </Button>
      {(result || error) && (
        <Dialog title={t('一页适配建议')} onClose={close}>
          {error ? (
            <p className="dialog-copy" role="alert">
              {errorText(error)}
            </p>
          ) : (
            <>
              <p className="dialog-copy">
                {result?.status === 'already-fit'
                  ? t('当前排版已经可以放进一页，无需调整。')
                  : result?.status === 'manual-breaks'
                    ? t('当前使用了手动分页。保留分页，或关闭模块的「从新的一页开始」后再计算。')
                    : result?.status === 'cannot-fit'
                      ? t(
                          '在建议字号与间距范围内无法放进一页。可以保留多页，或精简、隐藏部分内容后再试。',
                        )
                      : t('找到一组可以放进一页的设置。内容、字段和模板都会保留，应用后可以撤销。')}
              </p>
              {result?.status === 'suggestion' && (
                <dl className="fit-changes">
                  {Object.entries(labels).map(([key, label]) => {
                    const k = key as keyof typeof labels,
                      before = result.document.appearance[k],
                      after = result.appearance![k];
                    return before === after ? null : (
                      <div key={key}>
                        <dt>{t(label)}</dt>
                        <dd>
                          {before ?? t('默认')} →{' '}
                          {after === undefined ? t('默认') : Number(after.toFixed(2))}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </>
          )}
          <div className="dialog-actions">
            <Button onClick={close}>{t('关闭')}</Button>
            {result?.status === 'suggestion' && (
              <Button
                variant="primary"
                onClick={() => {
                  const state = useWorkspace.getState();
                  if (
                    state.activeId === result.document.id &&
                    state.documents[result.document.id] === result.document
                  )
                    state.update((doc) => {
                      doc.appearance = result.appearance!;
                    });
                  close();
                }}
              >
                {t('应用建议')}
              </Button>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
