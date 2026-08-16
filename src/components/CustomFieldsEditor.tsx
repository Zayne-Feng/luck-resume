import { useI18n, t } from '../i18n';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { createField, type ResumeField } from '../resume/model.ts';
import { Button, Field, IconButton } from './ui';
import IconPicker from './IconPicker';

export default function CustomFieldsEditor({
  fields,
  onChange,
  allowReorder = true,
}: {
  fields: ResumeField[];
  onChange: (fields: ResumeField[], group?: string) => void;
  allowReorder?: boolean;
}) {
  useI18n();
  const patch = (id: string, change: Partial<ResumeField>, group = '') =>
    onChange(
      fields.map((field) => (field.id === id ? { ...field, ...change } : field)),
      group,
    );
  const move = (index: number, delta: number) => {
    const next = [...fields];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  return (
    <details className="custom-fields-editor" open={fields.length > 0}>
      <summary>
        {t('自定义字段 ·')}
        {fields.length}
      </summary>
      <p className="field-hint">{t('字段名称和内容都由你决定，也可以只显示内容。')}</p>
      {fields.map((field, index) => (
        <div className="custom-field-card" key={field.id}>
          <div className="custom-field-tools">
            <span>{t('字段 {count}', { count: index + 1 })}</span>
            {allowReorder && (
              <>
                <IconButton
                  label={t('上移自定义字段 {count}', { count: index + 1 })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton
                  label={t('下移自定义字段 {count}', { count: index + 1 })}
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={13} />
                </IconButton>
              </>
            )}
            <IconButton
              label={t('复制自定义字段 {count}', { count: index + 1 })}
              disabled={fields.length >= 50}
              onClick={() =>
                onChange([
                  ...fields.slice(0, index + 1),
                  { ...field, id: crypto.randomUUID() },
                  ...fields.slice(index + 1),
                ])
              }
            >
              <Copy size={13} />
            </IconButton>
            <IconButton
              label={t('删除自定义字段 {count}', { count: index + 1 })}
              onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
          <div className="form-grid">
            <Field
              label={t('字段名称 {count}', { count: index + 1 })}
              maxLength={100}
              value={field.label}
              placeholder={t('例如：GitHub / 服务时长')}
              onChange={(event) =>
                patch(field.id, { label: event.target.value }, `field-${field.id}-label`)
              }
            />
            <label className="field">
              <span>{t('字段类型 {count}', { count: index + 1 })}</span>
              <select
                aria-label={t('字段类型 {count}', { count: index + 1 })}
                value={field.kind}
                onChange={(event) =>
                  patch(field.id, { kind: event.target.value as ResumeField['kind'] })
                }
              >
                <option value="text">{t('文本')}</option>
                <option value="link">{t('链接')}</option>
                <option value="multiline">{t('多行文本')}</option>
              </select>
            </label>
            <IconPicker
              label={t('字段图标 {count}', { count: index + 1 })}
              value={field.icon}
              onChange={(icon) => patch(field.id, { icon })}
            />
          </div>
          {field.kind === 'multiline' ? (
            <label className="field">
              <span>{t('字段内容 {count}', { count: index + 1 })}</span>
              <textarea
                aria-label={t('字段内容 {count}', { count: index + 1 })}
                value={field.value}
                maxLength={20000}
                rows={3}
                onChange={(event) =>
                  patch(field.id, { value: event.target.value }, `field-${field.id}-value`)
                }
              />
            </label>
          ) : (
            <Field
              label={t(field.kind === 'link' ? '链接地址 {count}' : '字段内容 {count}', {
                count: index + 1,
              })}
              maxLength={field.kind === 'link' ? 2048 : 20000}
              value={field.value}
              placeholder={field.kind === 'link' ? 'https://example.com' : t('填写你想展示的内容')}
              onChange={(event) =>
                patch(field.id, { value: event.target.value }, `field-${field.id}-value`)
              }
            />
          )}
          {field.kind === 'link' && (
            <Field
              label={t('链接显示文字 {count}', { count: index + 1 })}
              value={field.linkLabel ?? ''}
              maxLength={300}
              placeholder={t('留空显示地址，也可只填文字')}
              onChange={(event) =>
                patch(field.id, { linkLabel: event.target.value }, `field-${field.id}-link-label`)
              }
              hint={t('支持网址、邮箱与 DOI；没有地址时显示为普通文字。')}
            />
          )}
          <div className="field-checks">
            <label>
              <input
                type="checkbox"
                checked={field.visible}
                onChange={(event) => patch(field.id, { visible: event.target.checked })}
              />
              {t('显示此字段')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={field.showLabel}
                onChange={(event) => patch(field.id, { showLabel: event.target.checked })}
              />
              {t('显示字段名称')}
            </label>
          </div>
        </div>
      ))}
      <Button disabled={fields.length >= 50} onClick={() => onChange([...fields, createField()])}>
        <Plus size={14} />
        {t('添加自定义字段')}
      </Button>
    </details>
  );
}
