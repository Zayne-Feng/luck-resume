import { useState } from 'react';
import { useI18n, t, errorText } from '../i18n';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { Button, Dialog } from './ui';

export default function EntryTransferDialog({
  sourceDocumentId,
  sourceSectionId,
  entryId,
  onClose,
}: {
  sourceDocumentId: string;
  sourceSectionId: string;
  entryId: string;
  onClose: () => void;
}) {
  useI18n();
  const documents = useWorkspace((state) => state.documents);
  const transferEntry = useWorkspace((state) => state.transferEntry);
  const [destinationId, setDestinationId] = useState(sourceDocumentId);
  const [sectionId, setSectionId] = useState(
    () =>
      documents[sourceDocumentId]?.sections.find((section) => section.id !== sourceSectionId)?.id ??
      sourceSectionId,
  );
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const destination = documents[destinationId];
  const section = destination?.sections.find((item) => item.id === sectionId);
  const invalidMove =
    mode === 'move' && destinationId === sourceDocumentId && sectionId === sourceSectionId;
  const full = Boolean(section && section.items.length >= 500);
  return (
    <Dialog
      title={t('复制或移动条目')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="editor-form">
        <label className="field">
          <span>{t('操作方式')}</span>
          <select
            aria-label={t('操作方式')}
            value={mode}
            disabled={busy}
            onChange={(event) => setMode(event.target.value as 'copy' | 'move')}
          >
            <option value="copy">{t('复制条目')}</option>
            <option value="move">{t('移动条目')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('目标简历')}</span>
          <select
            aria-label={t('目标简历')}
            value={destinationId}
            disabled={busy}
            onChange={(event) => {
              setDestinationId(event.target.value);
              setSectionId(documents[event.target.value]?.sections[0]?.id ?? '');
              setError('');
            }}
          >
            {Object.values(documents).map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('目标模块')}</span>
          <select
            aria-label={t('目标模块')}
            value={sectionId}
            disabled={busy}
            onChange={(event) => {
              setSectionId(event.target.value);
              setError('');
            }}
          >
            {!destination?.sections.length && <option value="">{t('此简历没有可用模块')}</option>}
            {destination?.sections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.items.length}/500)
              </option>
            ))}
          </select>
        </label>
        <p className="field-hint">{t('保留全部字段、图片与富文本格式，目标条目使用新的标识。')}</p>
        {(error || invalidMove || full) && (
          <p role="alert">
            {error || t(invalidMove ? '请选择不同的目标模块。' : '目标模块已达到 500 个条目上限。')}
          </p>
        )}
        <div className="dialog-actions">
          <Button disabled={busy} onClick={onClose}>
            {t('取消')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !section || invalidMove || full}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await transferEntry({
                  sourceDocumentId,
                  sourceSectionId,
                  entryId,
                  destinationDocumentId: destinationId,
                  destinationSectionId: sectionId,
                  mode,
                });
                onClose();
              } catch (failure) {
                setError(errorText(failure));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t('正在保存…') : t(mode === 'copy' ? '复制到目标' : '移动到目标')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
