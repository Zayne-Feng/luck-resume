import { useI18n, t } from '../i18n';
import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import {
  createSection,
  sectionNames,
  type ResumeDocument,
  type SectionType,
} from '../resume/model.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { ProfileEditor, SectionEditor } from './EditorPanel';
import { Button, IconButton } from './ui';
import DragHandle, { acceptDrop, draggedId } from './DragHandle';
import { moveById } from '../resume/fields.ts';

const icons: Partial<Record<SectionType, typeof FileText>> = {
  summary: User,
  education: GraduationCap,
  experience: Briefcase,
  projects: FolderOpen,
  skills: Sparkles,
  custom: FileText,
};

export default function ContentEditor({
  document,
  onDeleteSection,
}: {
  document: ResumeDocument;
  onDeleteSection: (id: string) => void;
}) {
  useI18n();
  const update = useWorkspace((s) => s.update);
  const [adding, setAdding] = useState(false);
  const jump = (id: string) => {
    const node = window.document.getElementById(`module-${id}`) as HTMLDetailsElement | null;
    if (!node) return;
    node.open = true;
    node.scrollIntoView({ behavior: 'auto', block: 'start' });
  };
  const move = (index: number, delta: number) =>
    update((doc) => {
      [doc.sections[index], doc.sections[index + delta]] = [
        doc.sections[index + delta],
        doc.sections[index],
      ];
    });
  return (
    <div className="content-editor">
      <nav className="section-quicknav" aria-label={t('跳转到简历模块')}>
        <button type="button" onClick={() => jump('profile')}>
          {t('基本信息')}
        </button>
        {document.sections.map((section) => (
          <button type="button" key={section.id} onClick={() => jump(section.id)}>
            {section.title || t('未命名模块')}
          </button>
        ))}
      </nav>
      <details className="module-details profile-module" id="module-profile" open>
        <summary>
          <User size={17} />
          <span>{t('基本信息')}</span>
          <small>{t('从这里认识你')}</small>
          <ChevronDown size={16} />
        </summary>
        <ProfileEditor profile={document.profile} />
      </details>
      {document.sections.map((section, index) => {
        const Icon = icons[section.type] ?? FileText;
        return (
          <details
            className={`module-details ${section.visible ? '' : 'module-hidden'}`}
            onDragOver={acceptDrop}
            onDrop={(event) => {
              const id = draggedId(event, 'sections', useWorkspace.getState().activeId);
              if (!id) return;
              event.preventDefault();
              event.stopPropagation();
              update((doc) => {
                doc.sections = moveById(doc.sections, id, section.id);
              });
            }}
            id={`module-${section.id}`}
            key={section.id}
            open
          >
            <summary>
              <Icon size={17} />
              <span>{section.title || t('未命名模块')}</span>
              <small>
                {section.visible
                  ? t('{count} 条内容', { count: section.items.length })
                  : t('已隐藏')}
              </small>
              <ChevronDown size={16} />
            </summary>
            <div className="module-tools">
              <div className="module-order">
                <DragHandle
                  id={section.id}
                  scope="sections"
                  label={t('拖动{name}模块', { name: section.title })}
                />
                <IconButton
                  label={t('上移{name}', { name: section.title })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton
                  label={t('下移{name}', { name: section.title })}
                  disabled={index === document.sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton
                  label={t(section.visible ? '隐藏{name}' : '显示{name}', { name: section.title })}
                  onClick={() =>
                    update((doc) => {
                      doc.sections.find((s) => s.id === section.id)!.visible = !section.visible;
                    })
                  }
                >
                  {section.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </IconButton>
                <IconButton
                  label={t('删除{name}模块', { name: section.title })}
                  onClick={() => onDeleteSection(section.id)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <div
                className="module-columns"
                role="group"
                aria-label={t('{name}布局', { name: section.title })}
              >
                <button
                  type="button"
                  aria-pressed={section.columns === 1}
                  onClick={() =>
                    update((doc) => {
                      doc.sections.find((s) => s.id === section.id)!.columns = 1;
                    })
                  }
                >
                  {t('单列')}
                </button>
                <button
                  type="button"
                  aria-pressed={section.columns === 2}
                  onClick={() =>
                    update((doc) => {
                      doc.sections.find((s) => s.id === section.id)!.columns = 2;
                    })
                  }
                >
                  {t('双列')}
                </button>
              </div>
            </div>
            <SectionEditor section={section} />
          </details>
        );
      })}
      <div className="module-add-area">
        <Button
          className="add-entry"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
          disabled={document.sections.length >= 100}
        >
          <Plus size={16} />
          {t('添加你需要的模块')}
        </Button>
        {adding && (
          <div className="module-add-options">
            {(Object.keys(sectionNames) as SectionType[]).map((type) => (
              <button
                type="button"
                key={type}
                onClick={() => {
                  const section = createSection(type, document.appearance.language);
                  update((doc) => {
                    doc.sections.push(section);
                  });
                  setAdding(false);
                  requestAnimationFrame(() => jump(section.id));
                }}
              >
                {t(sectionNames[type])}
                <Plus size={13} />
              </button>
            ))}
            {[t('兴趣爱好'), t('个人宣言'), t('其他经历')].map((title) => (
              <button
                type="button"
                key={title}
                onClick={() => {
                  const section = createSection('custom');
                  section.title = title;
                  update((doc) => {
                    doc.sections.push(section);
                  });
                  setAdding(false);
                  requestAnimationFrame(() => jump(section.id));
                }}
              >
                {title}
                <Plus size={13} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
