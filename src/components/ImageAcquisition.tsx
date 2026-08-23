import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { errorText, t, useI18n } from '../i18n';
import {
  fetchRemoteImage,
  imageFilesFromClipboard,
  readImageBatch,
  type AcquiredImage,
} from '../resume/media.ts';
import { Button, Field } from './ui';
import './media.css';

export interface ImageAcquisitionProps {
  label: string;
  onImages: (images: AcquiredImage[]) => void | Promise<void>;
  multiple?: boolean;
  allowUrl?: boolean;
  disabled?: boolean;
  contextKey?: string | null;
}

export default function ImageAcquisition({
  label,
  onImages,
  multiple = false,
  allowUrl = true,
  disabled = false,
  contextKey,
}: ImageAcquisitionProps) {
  useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setBusy(false);
    setError('');
    setUrl('');
    setDragging(false);
    return () => {
      generation.current += 1;
    };
  }, [contextKey]);
  const locked = busy || disabled;
  const perform = async (read: () => Promise<AcquiredImage[]>) => {
    if (disabled || pending.current) return;
    const apply = onImages;
    const version = generation.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await apply(await read());
    } catch (reason) {
      if (version === generation.current) setError(errorText(reason));
    } finally {
      if (version === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const acquire = (files: File[]) => {
    if (!files.length) return;
    void perform(() => readImageBatch(multiple ? files : files.slice(0, 1)));
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = imageFilesFromClipboard(event.clipboardData);
    if (files.length) {
      event.preventDefault();
      event.stopPropagation();
      acquire(files);
    }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    acquire(Array.from(event.dataTransfer.files));
  };
  return (
    <div
      className="image-acquisition"
      data-dragging={dragging || undefined}
      onPaste={paste}
      onDragOver={(event) => {
        event.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      role="group"
      aria-label={label}
      tabIndex={0}
    >
      <div className="field-checks">
        <Button disabled={locked} onClick={() => input.current?.click()}>
          {busy ? t('正在处理图片…') : label}
        </Button>
        <Button
          disabled={locked}
          onClick={() =>
            void perform(async () => {
              if (!navigator.clipboard?.read)
                throw new Error('请在图片区域按 Ctrl+V 或 ⌘V 粘贴图片。');
              const items = await navigator.clipboard.read();
              const files: File[] = [];
              for (const item of items) {
                const type = item.types.find((value) =>
                  ['image/png', 'image/jpeg', 'image/webp'].includes(value),
                );
                if (type)
                  files.push(
                    new File([await item.getType(type)], `clipboard-${files.length + 1}.png`, {
                      type,
                    }),
                  );
              }
              if (!files.length) throw new Error('剪贴板中没有可读取的图片。');
              return readImageBatch(multiple ? files : files.slice(0, 1));
            })
          }
        >
          {t('粘贴图片')}
        </Button>
      </div>
      <p className="field-hint">
        {multiple
          ? t('拖入或粘贴多张图片，每张图片生成一个条目。')
          : t('支持拖入图片，或在此区域按 Ctrl+V / ⌘V 粘贴。')}
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept="image/jpeg,image/png,image/webp"
        disabled={locked}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          acquire(files);
        }}
      />
      {allowUrl && (
        <details className="image-url-input">
          <summary>{t('从图片链接导入')}</summary>
          <Field
            label={t('图片链接')}
            type="url"
            maxLength={4096}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/image.png"
          />
          <Button
            disabled={locked || !url.trim()}
            onClick={() => {
              const source = url;
              void perform(async () => [{ name: 'image', data: await fetchRemoteImage(source) }]);
            }}
          >
            {t('读取图片链接')}
          </Button>
        </details>
      )}
      {busy && (
        <p className="field-hint" role="status">
          {t('正在处理图片…')}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
