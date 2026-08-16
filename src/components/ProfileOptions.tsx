import { useI18n, t } from '../i18n';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  contactKeys,
  profileContacts,
  profileFieldNames,
  type ProfileTextKey,
} from '../resume/fields.ts';
import type { Profile } from '../resume/model.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { Button, Field, IconButton } from './ui';
import CustomFieldsEditor from './CustomFieldsEditor';
import IconPicker from './IconPicker';
import { defaultFieldIcons } from '../resume/icons.ts';

export default function ProfileOptions({ profile }: { profile: Profile }) {
  useI18n();
  const update = useWorkspace((state) => state.update);
  const contacts = profileContacts(profile);
  const hide = (key: string, hidden: boolean) =>
    update((doc) => {
      doc.profile.hiddenFields = hidden
        ? [...new Set([...(doc.profile.hiddenFields ?? []), key])]
        : (doc.profile.hiddenFields ?? []).filter((id) => id !== key);
    });
  const move = (index: number, delta: number) =>
    update((doc) => {
      const order = contacts.map((f) => f.id);
      [order[index], order[index + delta]] = [order[index + delta], order[index]];
      doc.profile.contactOrder = order;
    });
  return (
    <>
      <details className="profile-options">
        <summary>{t('信息显示、名称与顺序')}</summary>
        {(Object.keys(profileFieldNames) as ProfileTextKey[]).map((key) => (
          <div className="builtin-field-option" key={key}>
            <label>
              <input
                type="checkbox"
                checked={!profile.hiddenFields?.includes(key)}
                onChange={(event) => hide(key, !event.target.checked)}
              />
              {t('显示{name}', { name: t(profileFieldNames[key]) })}
            </label>
            <Field
              label={t('{name}显示名称', { name: t(profileFieldNames[key]) })}
              value={profile.fieldLabels?.[key] ?? ''}
              maxLength={100}
              placeholder={t(profileFieldNames[key])}
              onChange={(event) =>
                update((doc) => {
                  doc.profile.fieldLabels = {
                    ...doc.profile.fieldLabels,
                    [key]: event.target.value,
                  };
                }, `profile-label-${key}`)
              }
            />
            <IconPicker
              label={t('{name}图标', { name: t(profileFieldNames[key]) })}
              value={profile.fieldIcons?.[key] ?? defaultFieldIcons[key]}
              onChange={(icon) =>
                update((doc) => {
                  doc.profile.fieldIcons = { ...doc.profile.fieldIcons, [key]: icon };
                })
              }
            />
            {(contactKeys as readonly string[]).includes(key) && (
              <Button
                onClick={() =>
                  update((doc) => {
                    doc.profile.removedFields = profile.removedFields?.includes(key)
                      ? (doc.profile.removedFields ?? []).filter((id) => id !== key)
                      : [...new Set([...(doc.profile.removedFields ?? []), key])];
                  })
                }
              >
                {profile.removedFields?.includes(key) ? t('恢复编辑字段') : t('移除编辑字段')}
              </Button>
            )}
          </div>
        ))}
        <p className="field-hint">{t('移除编辑字段会保留已填内容，恢复后可继续编辑。')}</p>
        <label className="check-field">
          <input
            type="checkbox"
            checked={profile.emailUnderline ?? false}
            onChange={(event) =>
              update((doc) => {
                doc.profile.emailUnderline = event.target.checked;
              })
            }
          />
          {t('邮箱显示下划线')}
        </label>
        <p className="field-hint">{t('联系方式的显示顺序，包括你添加的字段。')}</p>
        <ol className="contact-order">
          {contacts.map((field, index) => (
            <li key={field.id}>
              <span>
                {Object.hasOwn(profileFieldNames, field.id) &&
                profile.fieldLabels?.[field.id as ProfileTextKey] === undefined
                  ? t(profileFieldNames[field.id as ProfileTextKey])
                  : field.label || t('未命名字段')}
              </span>
              <IconButton
                label={t('上移联系信息 {count}', { count: index + 1 })}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={13} />
              </IconButton>
              <IconButton
                label={t('下移联系信息 {count}', { count: index + 1 })}
                disabled={index === contacts.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={13} />
              </IconButton>
            </li>
          ))}
        </ol>
      </details>
      <CustomFieldsEditor
        fields={profile.customFields ?? []}
        allowReorder={false}
        onChange={(fields, group) =>
          update((doc) => {
            doc.profile.customFields = fields;
          }, group)
        }
      />
    </>
  );
}
