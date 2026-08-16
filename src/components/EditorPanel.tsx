import { useI18n, t } from '../i18n';
import { lazy, Suspense, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, Trash2, X, Send } from 'lucide-react';
import {
  createEntry,
  cloneEntry,
  type Profile,
  type ResumeEntry,
  type ResumeSection,
} from '../resume/model.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { Button, Field, IconButton } from './ui';
import { type ProfileTextKey, moveById } from '../resume/fields.ts';
import { dateRangeError, toMonthValue } from '../resume/dates.ts';
import CustomFieldsEditor from './CustomFieldsEditor';
import BirthDateField from './BirthDateField';
import ProfileOptions from './ProfileOptions';
import EntryOptions from './EntryOptions';
import EntryTransferDialog from './EntryTransferDialog';
import LogoEditor from './LogoEditor';
import PublicationEditor from './PublicationEditor';
import ProfileContributionsEditor from './ProfileContributionsEditor';
import DragHandle, { acceptDrop, draggedId } from './DragHandle';
import { replaceAcquiredImage } from '../resume/acquiredImage.ts';
import ImageAcquisition from './ImageAcquisition';
import CertificateImageBatchPanel from './CertificateImageBatchPanel';
import { normalizeResumeLink } from '../resume/links.ts';
const RichEditor = lazy(() => import('./RichEditor'));

export function ProfileEditor({ profile }: { profile: Profile }) {
  useI18n();
  const update = useWorkspace((s) => s.update);
  const documentId = useWorkspace((state) => state.activeId);
  const onField = (key: ProfileTextKey | 'photo', value: string) =>
    update((doc) => {
      doc.profile[key] = value;
    }, `profile-${key}`);
  return (
    <div className="editor-form">
      <div className="panel-heading">
        <h2>{t('基本信息')}</h2>
        <span>{t('让彼此从这里认识')}</span>
      </div>
      <div className="photo-field">
        {profile.photo && (
          <img className="entry-image-thumbnail" src={profile.photo} alt={t('当前头像')} />
        )}
        <div>
          <strong>{t('一张得体的照片')}</strong>
          <p>{t('可选，支持 JPG、PNG、WebP')}</p>
          {profile.photo && <Button onClick={() => onField('photo', '')}>{t('移除')}</Button>}
        </div>
      </div>
      <ImageAcquisition
        label={t('上传照片')}
        contextKey={documentId}
        onImages={(images) => {
          if (documentId && images[0])
            update(
              (doc) => {
                if (!replaceAcquiredImage(doc, { kind: 'photo' }, profile.photo, images[0].data))
                  throw new Error('原图片已变化，请重新选择图片。');
              },
              'profile-photo',
              documentId,
            );
        }}
      />
      <div className="form-grid">
        <Field
          label={t('姓名')}
          name="profile-name"
          placeholder={t('你的姓名')}
          value={profile.name}
          maxLength={100}
          autoComplete="name"
          onChange={(e) => onField('name', e.target.value)}
        />
        {!profile.removedFields?.includes('location') && (
          <Field
            label={t('所在城市')}
            name="profile-location"
            placeholder={t('例如：杭州')}
            value={profile.location}
            maxLength={200}
            autoComplete="address-level2"
            onChange={(e) => onField('location', e.target.value)}
          />
        )}
      </div>
      <Field
        label={t('求职意向')}
        name="profile-headline"
        placeholder={t('例如：产品设计师 / 用户体验设计')}
        value={profile.headline}
        maxLength={300}
        onChange={(e) => onField('headline', e.target.value)}
      />
      <div className="form-grid">
        {!profile.removedFields?.includes('phone') && (
          <Field
            label={t('联系电话')}
            name="profile-phone"
            type="tel"
            placeholder={t('手机号码')}
            value={profile.phone}
            maxLength={100}
            autoComplete="tel"
            onChange={(e) => onField('phone', e.target.value)}
          />
        )}
        {!profile.removedFields?.includes('email') && (
          <Field
            label={t('电子邮箱')}
            name="profile-email"
            type="email"
            placeholder="hello@example.com"
            value={profile.email}
            maxLength={200}
            autoComplete="email"
            onChange={(e) => onField('email', e.target.value)}
          />
        )}
      </div>
      {!profile.removedFields?.includes('website') && (
        <Field
          label={t('个人网站 / 作品集')}
          name="profile-website"
          placeholder="https://example.com"
          value={profile.website}
          maxLength={2048}
          onChange={(e) => onField('website', e.target.value)}
          hint={
            profile.website && !normalizeResumeLink(profile.website)
              ? t('请输入网址、邮箱或 DOI。')
              : undefined
          }
        />
      )}
      <div className="form-grid">
        {!profile.removedFields?.includes('birthday') && (
          <BirthDateField
            key={documentId}
            name="profile-birthday"
            value={profile.birthday ?? ''}
            onChange={(value) => onField('birthday', value)}
          />
        )}
        {!profile.removedFields?.includes('employmentStatus') && (
          <label className="field">
            <span>{t('求职状态')}</span>
            <input
              aria-label={t('求职状态')}
              name="profile-employment-status"
              list="employment-status-presets"
              value={profile.employmentStatus ?? ''}
              maxLength={100}
              placeholder={t('选择建议或直接填写')}
              onChange={(event) => onField('employmentStatus', event.target.value)}
            />
            <datalist id="employment-status-presets">
              {[
                '在职，考虑机会',
                '离职，正在求职',
                '在校，寻找实习',
                '应届毕业生',
                '暂不考虑机会',
              ].map((status) => (
                <option key={status} value={t(status)} />
              ))}
            </datalist>
          </label>
        )}
      </div>
      <ProfileOptions profile={profile} />
      <ProfileContributionsEditor profile={profile} />
      <div className="writing-note">
        <span className="note-line" />
        <p>
          {t('不必面面俱到，')}
          <br />
          {t('先让最重要的信息被看见。')}
        </p>
      </div>
    </div>
  );
}

function EntryEditor({
  entry,
  section,
  index,
}: {
  entry: ResumeEntry;
  section: ResumeSection;
  index: number;
}) {
  useI18n();
  const update = useWorkspace((s) => s.update);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const simple = ['summary', 'skills', 'freeform'].includes(section.type);
  const education =
    section.type === 'education' || entry.degree !== undefined || entry.gpa !== undefined;
  const documentId = useWorkspace((state) => state.activeId);
  const patch = <K extends keyof ResumeEntry>(
    key: K,
    value: ResumeEntry[K],
    group = `entry-${entry.id}-${key}`,
  ) =>
    update(
      (doc) => {
        const item = doc.sections
          .find((s) => s.id === section.id)
          ?.items.find((e) => e.id === entry.id);
        if (item) item[key] = value;
      },
      group,
      documentId ?? undefined,
    );
  const move = (delta: number) =>
    update((doc) => {
      const items = doc.sections.find((s) => s.id === section.id)!.items;
      [items[index], items[index + delta]] = [items[index + delta], items[index]];
    });
  const labels =
    section.type === 'education'
      ? ['学校名称', '专业']
      : section.type === 'experience'
        ? ['公司名称', '职位名称']
        : section.type === 'projects'
          ? ['项目名称', '担任角色']
          : section.type === 'publications'
            ? ['论文标题', '研究方向']
            : section.type === 'certifications'
              ? ['证书名称', '资格类别']
              : section.type === 'awards'
                ? ['奖项名称', '获奖类别']
                : section.type === 'languages'
                  ? ['语言', '使用场景']
                  : section.type === 'volunteering'
                    ? ['活动名称', '担任角色']
                    : ['标题', '副标题'];
  return (
    <div
      className={`entry-editor ${entry.visible === false ? 'entry-hidden' : ''}`}
      id={`entry-${entry.id}`}
      onDragOver={acceptDrop}
      onDrop={(event) => {
        const id = draggedId(event, `entries-${section.id}`, documentId);
        if (!id) return;
        event.stopPropagation();
        event.preventDefault();
        update((doc) => {
          const s = doc.sections.find((s) => s.id === section.id);
          if (s) s.items = moveById(s.items, id, entry.id);
        });
      }}
    >
      <div className="entry-editor-heading">
        <span>
          {simple
            ? section.type === 'summary'
              ? t('介绍一下自己')
              : t('展示你的专长')
            : t('经历 {count}', { count: String(index + 1).padStart(2, '0') })}
        </span>
        <div className="entry-actions">
          <DragHandle
            id={entry.id}
            scope={`entries-${section.id}`}
            label={t('拖动条目 {count}', { count: index + 1 })}
          />
          <IconButton
            label={entry.visible === false ? t('显示条目') : t('隐藏条目')}
            onClick={() => patch('visible', entry.visible === false)}
          >
            {entry.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconButton>
          <IconButton
            label={t('复制条目')}
            disabled={section.items.length >= 500}
            onClick={() =>
              update((doc) => {
                const items = doc.sections.find((s) => s.id === section.id)!.items;
                items.splice(index + 1, 0, cloneEntry(entry));
              })
            }
          >
            <Copy size={14} />
          </IconButton>
          <IconButton label={t('上移条目')} disabled={index === 0} onClick={() => move(-1)}>
            <ArrowUp size={14} />
          </IconButton>
          <IconButton label={t('复制或移动条目')} onClick={() => setTransferOpen(true)}>
            <Send size={14} />
          </IconButton>
          <IconButton
            label={t('下移条目')}
            disabled={index === section.items.length - 1}
            onClick={() => move(1)}
          >
            <ArrowDown size={14} />
          </IconButton>
          <IconButton label={t('删除条目')} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      {transferOpen && documentId && (
        <EntryTransferDialog
          sourceDocumentId={documentId}
          sourceSectionId={section.id}
          entryId={entry.id}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {confirmDelete && (
        <div className="inline-confirm">
          <span>{t('删除这条内容？可通过撤销恢复。')}</span>
          <Button
            variant="danger"
            onClick={() =>
              update((doc) => {
                const s = doc.sections.find((s) => s.id === section.id)!;
                s.items = s.items.filter((e) => e.id !== entry.id);
              })
            }
          >
            {t('删除')}
          </Button>
          <IconButton label={t('取消删除')} onClick={() => setConfirmDelete(false)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <details className="entry-metadata" open={!simple || Boolean(entry.title || entry.subtitle)}>
        <summary>{t('条目标题、日期与地点（可选）')}</summary>
        <Field
          label={entry.fieldLabels?.title || t(labels[0])}
          name="entry-title"
          value={entry.title}
          maxLength={300}
          placeholder={t('填写{name}', { name: t(labels[0]) })}
          onChange={(e) => patch('title', e.target.value)}
        />
        <Field
          label={entry.fieldLabels?.subtitle || t(labels[1])}
          name="entry-subtitle"
          value={entry.subtitle}
          maxLength={300}
          placeholder={t('填写{name}', { name: t(labels[1]) })}
          onChange={(e) => patch('subtitle', e.target.value)}
        />
        {education && (
          <div className="form-grid">
            <Field
              label={entry.fieldLabels?.degree || t('学历 / 学位')}
              name="entry-degree"
              value={entry.degree ?? ''}
              maxLength={300}
              placeholder={t('例如：本科 / 理学硕士')}
              onChange={(event) => patch('degree', event.target.value)}
            />
            <Field
              label={entry.fieldLabels?.gpa || 'GPA'}
              name="entry-gpa"
              value={entry.gpa ?? ''}
              maxLength={100}
              placeholder="3.8 / 4.0"
              onChange={(event) => patch('gpa', event.target.value)}
            />
          </div>
        )}
        <label className="field">
          <span>{t('日期输入方式')}</span>
          <select
            aria-label={t('日期输入方式')}
            value={entry.dateInput ?? 'text'}
            onChange={(event) => patch('dateInput', event.target.value as 'text' | 'month')}
          >
            <option value="text">{t('自由输入')}</option>
            <option value="month">{t('选择年月')}</option>
          </select>
        </label>
        {entry.dateInput === 'month' &&
          ((entry.startDate && !toMonthValue(entry.startDate)) ||
            (entry.endDate && !entry.current && !toMonthValue(entry.endDate))) && (
            <p className="field-hint">{t('自由输入的原日期仍保留，选择年月后才会替换。')}</p>
          )}
        <div className="form-grid">
          <Field
            label={t('开始时间')}
            type={entry.dateInput === 'month' ? 'month' : 'text'}
            value={entry.dateInput === 'month' ? toMonthValue(entry.startDate) : entry.startDate}
            maxLength={30}
            placeholder="2024.09"
            onChange={(e) => patch('startDate', e.target.value)}
          />
          <Field
            label={t('结束时间')}
            type={entry.dateInput === 'month' ? 'month' : 'text'}
            value={
              entry.dateInput === 'month'
                ? toMonthValue(entry.endDate)
                : entry.current
                  ? '至今'
                  : entry.endDate
            }
            maxLength={30}
            placeholder="2025.06"
            disabled={entry.current}
            onChange={(e) => patch('endDate', e.target.value)}
          />
        </div>
        {dateRangeError(entry.startDate, entry.endDate, entry.current) && (
          <p className="inline-error" role="status">
            {t(dateRangeError(entry.startDate, entry.endDate, entry.current))}
          </p>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={entry.current}
            onChange={(e) => patch('current', e.target.checked)}
          />
          {t('目前仍在这里')}
        </label>
        {
          <Field
            label={t('相关链接（可选）')}
            value={entry.link}
            maxLength={2048}
            placeholder="https://example.com"
            onChange={(e) => patch('link', e.target.value)}
          />
        }
        <Field
          label={t('链接显示文字（可选）')}
          value={entry.linkLabel ?? ''}
          maxLength={300}
          placeholder={t('例如：项目主页 / 阅读论文')}
          onChange={(e) => patch('linkLabel', e.target.value)}
        />
        <Field
          label={t('地点（可选）')}
          value={entry.location}
          maxLength={200}
          placeholder={t('例如：杭州 / 远程')}
          onChange={(e) => patch('location', e.target.value)}
        />
      </details>
      {section.type === 'publications' && (
        <PublicationEditor entry={entry} index={index} patch={patch} />
      )}
      <div className="field">
        <label>{simple ? t('内容') : t('经历描述')}</label>
        <Suspense fallback={<div className="rich-loading">{t('正在准备编辑器…')}</div>}>
          <RichEditor
            value={entry.description}
            onChange={(value) => patch('description', value)}
            onApply={(value) => patch('description', value, '')}
            label={t('{name}描述 {count}', { name: section.title, count: index + 1 })}
          />
        </Suspense>
      </div>
      <CustomFieldsEditor
        fields={entry.customFields ?? []}
        onChange={(fields, group) =>
          update((doc) => {
            const item = doc.sections
              .find((s) => s.id === section.id)
              ?.items.find((e) => e.id === entry.id);
            if (item) item.customFields = fields;
          }, group)
        }
      />
      <EntryOptions
        education={education}
        contextKey={`${documentId}:${entry.id}`}
        entry={entry}
        patch={patch}
        onImage={(image) => {
          if (documentId)
            update(
              (doc) => {
                if (
                  !replaceAcquiredImage(
                    doc,
                    { kind: 'image', sectionId: section.id, entryId: entry.id },
                    entry.image,
                    image,
                  )
                )
                  throw new Error('原图片已变化，请重新选择图片。');
              },
              'entry-image',
              documentId,
            );
        }}
      />
      <LogoEditor
        contextKey={`${documentId}:${entry.id}`}
        onDimensions={({ width, height, ratio }) =>
          update((doc) => {
            const item = doc.sections
              .find((item) => item.id === section.id)
              ?.items.find((item) => item.id === entry.id);
            if (!item) return;
            item.logoWidth = width;
            item.logoHeight = height;
            if (ratio === undefined) delete item.logoRatio;
            else item.logoRatio = ratio;
          }, `entry-${entry.id}-logo-dimensions`)
        }
        entry={entry}
        patch={patch}
        onLogo={(image) => {
          if (documentId)
            update(
              (doc) => {
                if (
                  !replaceAcquiredImage(
                    doc,
                    { kind: 'logo', sectionId: section.id, entryId: entry.id },
                    entry.logo,
                    image,
                  )
                )
                  throw new Error('原图片已变化，请重新选择图片。');
              },
              `entry-${entry.id}-logo`,
              documentId,
            );
        }}
      />
    </div>
  );
}

export function SectionEditor({ section }: { section: ResumeSection }) {
  useI18n();
  const update = useWorkspace((s) => s.update);
  const documentId = useWorkspace((state) => state.activeId);
  const operationError = useWorkspace((state) => state.operationError);
  return (
    <div className="editor-form">
      {operationError && <p role="alert">{t(operationError)}</p>}
      <div className="panel-heading">
        <h2>{section.title}</h2>
        <span>{section.visible ? t('写下你的积累与闪光点') : t('此模块已在简历中隐藏')}</span>
      </div>
      <Field
        label={t('模块名称')}
        value={section.title}
        maxLength={100}
        onChange={(e) =>
          update((doc) => {
            doc.sections.find((s) => s.id === section.id)!.title = e.target.value;
          }, `section-title-${section.id}`)
        }
      />
      <div className="field-checks">
        <label>
          <input
            type="checkbox"
            checked={section.showTitle !== false}
            onChange={(event) =>
              update((doc) => {
                doc.sections.find((s) => s.id === section.id)!.showTitle = event.target.checked;
              })
            }
          />
          {t('显示模块标题')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={section.breakBefore ?? false}
            onChange={(event) =>
              update((doc) => {
                doc.sections.find((s) => s.id === section.id)!.breakBefore = event.target.checked;
              })
            }
          />
          {t('从新的一页开始')}
        </label>
      </div>
      <label className="field">
        <span>{t('模块在页面中的位置')}</span>
        <select
          aria-label={t('模块在页面中的位置')}
          value={section.placement ?? 'auto'}
          onChange={(event) =>
            update((doc) => {
              doc.sections.find((s) => s.id === section.id)!.placement = event.target
                .value as ResumeSection['placement'];
            })
          }
        >
          <option value="auto">{t('跟随模板')}</option>
          <option value="full">{t('占满整行')}</option>
          <option value="left">{t('左半栏')}</option>
          <option value="right">{t('右半栏')}</option>
        </select>
      </label>
      {section.type === 'certifications' && (
        <CertificateImageBatchPanel
          contextKey={`${documentId}:${section.id}`}
          onImages={(images) => {
            if (images.length + section.items.length > 500)
              throw new Error('每个模块最多保留 500 个条目。');
            if (documentId)
              update(
                (doc) => {
                  const target = doc.sections.find((item) => item.id === section.id);
                  if (!target) return;
                  if (images.length + target.items.length > 500)
                    throw new Error('每个模块最多保留 500 个条目。');
                  target.items.push(
                    ...images.map((image) => ({
                      ...createEntry('certifications'),
                      title: image.name,
                      image: image.data,
                    })),
                  );
                },
                undefined,
                documentId,
              );
          }}
        />
      )}
      {section.items.map((entry, i) => (
        <EntryEditor key={entry.id} entry={entry} section={section} index={i} />
      ))}
      <Button
        className="add-entry"
        onClick={() =>
          update((doc) => {
            doc.sections.find((s) => s.id === section.id)!.items.push(createEntry(section.type));
          })
        }
        disabled={section.items.length >= 500}
      >
        <Plus size={16} />
        {t('添加{name}', {
          name:
            section.type === 'education'
              ? t('教育经历')
              : section.type === 'projects'
                ? t('项目')
                : section.type === 'skills'
                  ? t('技能内容')
                  : t('一条内容'),
        })}
      </Button>
    </div>
  );
}
