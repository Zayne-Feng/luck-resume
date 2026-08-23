import { t, useI18n } from '../i18n';
import ImageAcquisition from './ImageAcquisition';
import type { AcquiredImage } from '../resume/media.ts';

export default function CertificateImageBatchPanel({
  onImages,
  contextKey,
}: {
  onImages: (images: AcquiredImage[]) => void | Promise<void>;
  contextKey?: string | null;
}) {
  useI18n();
  return (
    <details className="entry-options certificate-image-batch">
      <summary>{t('批量添加证书图片')}</summary>
      <ImageAcquisition
        label={t('选择证书图片')}
        onImages={onImages}
        contextKey={contextKey}
        multiple
      />
    </details>
  );
}
