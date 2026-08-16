import { useI18n, t } from '../i18n';
import { useEffect, useState } from 'react';
import {
  EditorContent,
  Extension,
  Mark,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import {
  Bold,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Outdent,
  Strikethrough,
  Underline,
  X,
} from 'lucide-react';
import { safeLink, type RichTextNode } from '../resume/model.ts';
import { richTextToMarkdown } from '../resume/richTextMarkdown.ts';
import { RichTextContent } from '../resume/ResumeDocument';
import FieldAssist from '../ai/FieldAssist';
import { applyRichSuggestion } from '../resume/polishPresentation.ts';
import {
  FONT_SIZES,
  highlightCssColor,
  normalizeTextColor,
  PARAGRAPH_INDENTS,
  PARAGRAPH_LINE_HEIGHTS,
  normalizeFontSize,
  normalizeTextAlign,
  normalizeParagraphIndent,
  normalizeParagraphLineHeight,
  normalizeHighlightColor,
  normalizeCodeLanguage,
} from '../resume/textFormatting.ts';

const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'superscript subscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: () => ['sup', {}, 0],
});
const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript subscript',
  parseHTML: () => [{ tag: 'sub' }],
  renderHTML: () => ['sub', {}, 0],
});
const CodeLanguage = Extension.create({
  name: 'codeLanguage',
  addGlobalAttributes() {
    return [
      {
        types: ['codeBlock'],
        attributes: {
          language: {
            default: null,
            parseHTML: (element) =>
              normalizeCodeLanguage(
                element.querySelector('code')?.className.replace(/^language-/, ''),
              ) ?? null,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },
});

const BlockFormatting = Extension.create({
  name: 'blockFormatting',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => normalizeTextAlign(element.style.textAlign) ?? null,
            renderHTML: (attributes) => {
              const alignment = normalizeTextAlign(attributes.textAlign);
              return alignment ? { style: `text-align: ${alignment}` } : {};
            },
          },
        },
      },
      {
        types: ['paragraph'],
        attributes: {
          paragraphIndent: {
            default: null,
            parseHTML: (element) => {
              const margin = element.style.marginLeft;
              return /^\d+em$/.test(margin)
                ? (normalizeParagraphIndent(Number.parseFloat(margin)) ?? null)
                : null;
            },
            renderHTML: (attributes) => {
              const indent = normalizeParagraphIndent(attributes.paragraphIndent);
              return indent === undefined ? {} : { style: `margin-left: ${indent}em` };
            },
          },
          lineHeight: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphLineHeight(Number(element.style.lineHeight)) ?? null,
            renderHTML: (attributes) => {
              const lineHeight = normalizeParagraphLineHeight(attributes.lineHeight);
              return lineHeight ? { style: `line-height: ${lineHeight}` } : {};
            },
          },
        },
      },
    ];
  },
});

const Highlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: 'butter',
        parseHTML: (element) =>
          normalizeHighlightColor(element.dataset.highlight) ??
          normalizeHighlightColor(element.style.backgroundColor) ??
          'butter',
        renderHTML: (attributes) => {
          const color = normalizeHighlightColor(attributes.color) ?? 'butter';
          return {
            'data-highlight': color,
            class: 'rich-highlight',
            style: `background-color: ${highlightCssColor(color)}; color: inherit`,
          };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0];
  },
});

const FontSize = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (element) => normalizeFontSize(element.style.fontSize) ?? null,
        renderHTML: (attributes) => {
          const fontSize = normalizeFontSize(attributes.fontSize);
          return fontSize ? { style: `font-size: ${fontSize}` } : {};
        },
      },
      color: {
        default: null,
        parseHTML: (element) =>
          normalizeTextColor(element.dataset.textColor) ??
          normalizeTextColor(element.style.color) ??
          null,
        renderHTML: (attributes) => {
          const color = normalizeTextColor(attributes.color);
          return color ? { 'data-text-color': color, style: `color: ${color}` } : {};
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (element) =>
          normalizeFontSize(element.style.fontSize) ||
          normalizeTextColor(element.dataset.textColor) ||
          normalizeTextColor(element.style.color)
            ? {}
            : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});

const SelectionSync = Extension.create({
  name: 'selectionSync',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-a': () => {
        this.editor.commands.selectAll();
        // Flush pending native mouse selection changes before another command runs.
        this.editor.view.focus();
        return true;
      },
    };
  },
});

function selectionFontSize(editor: Editor): string {
  if (editor.state.selection.empty)
    return normalizeFontSize(editor.getAttributes('textStyle').fontSize) ?? '';
  let size: string | undefined;
  let mixed = false;
  const { from, to } = editor.state.selection;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const next =
      normalizeFontSize(
        node.marks.find((mark) => mark.type.name === 'textStyle')?.attrs.fontSize,
      ) ?? '';
    if (size !== undefined && size !== next) mixed = true;
    size = next;
  });
  return mixed ? 'mixed' : (size ?? '');
}

function readToolbarState(editor: Editor | null) {
  return editor && !editor.isDestroyed
    ? {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        bulletList: editor.isActive('bulletList'),
        orderedList: editor.isActive('orderedList'),
        link: editor.isActive('link'),
        block: editor.isActive('codeBlock')
          ? 'codeBlock'
          : editor.isActive('heading')
            ? String(editor.getAttributes('heading').level)
            : 'paragraph',
        blockquote: editor.isActive('blockquote'),
        code: editor.isActive('code'),
        superscript: editor.isActive('superscript'),
        subscript: editor.isActive('subscript'),
        language: normalizeCodeLanguage(editor.getAttributes('codeBlock').language) ?? '',
        textAlign:
          normalizeTextAlign(
            editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph').textAlign,
          ) ?? 'left',
        fontSize: selectionFontSize(editor),
        color: normalizeTextColor(editor.getAttributes('textStyle').color) ?? '',
        paragraphIndent:
          normalizeParagraphIndent(editor.getAttributes('paragraph').paragraphIndent) ?? 0,
        lineHeight:
          normalizeParagraphLineHeight(editor.getAttributes('paragraph').lineHeight) ?? '',
        highlight: editor.isActive('highlight')
          ? (normalizeHighlightColor(editor.getAttributes('highlight').color) ?? '')
          : '',
        canIndentList: editor.can().sinkListItem('listItem'),
        canOutdentList: editor.can().liftListItem('listItem'),
        table: editor.isActive('table'),
        cellColor:
          normalizeTextColor(
            editor.getAttributes(editor.isActive('tableHeader') ? 'tableHeader' : 'tableCell')
              .backgroundColor,
          ) ?? '',
      }
    : null;
}

export default function RichEditor({
  value,
  onChange,
  onApply,
  label,
}: {
  value: RichTextNode;
  onChange: (value: RichTextNode) => void;
  onApply?: (value: RichTextNode) => void;
  label: string;
}) {
  useI18n();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');
  const [preservePresentation, setPreservePresentation] = useState(true);
  const [, refreshEditor] = useState(0);
  const editor = useEditor({
    extensions: [
      SelectionSync,
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        trailingNode: false,
        undoRedo: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
          isAllowedUri: (url) => Boolean(safeLink(url)),
        },
      }),
      BlockFormatting,
      FontSize,
      Highlight,
      Superscript,
      Subscript,
      CodeLanguage,
      TableKit.configure({ table: { resizable: true, cellMinWidth: 40 } }),
      Extension.create({
        name: 'cellAppearance',
        addGlobalAttributes: () => [
          {
            types: ['tableCell', 'tableHeader'],
            attributes: {
              backgroundColor: {
                default: null,
                parseHTML: (element) =>
                  normalizeTextColor(element.dataset.cellColor) ??
                  normalizeTextColor(element.style.backgroundColor) ??
                  null,
                renderHTML: (attributes) =>
                  normalizeTextColor(attributes.backgroundColor)
                    ? {
                        'data-cell-color': attributes.backgroundColor,
                        style: `background-color:${attributes.backgroundColor}`,
                      }
                    : {},
              },
            },
          },
        ],
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rich-input',
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
      },
    },
    onCreate: () => refreshEditor((generation) => generation + 1),
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichTextNode),
  });
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: observedEditor }) =>
      readToolbarState(observedEditor && !observedEditor.isDestroyed ? observedEditor : editor),
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const content = editor.schema.nodeFromJSON(value);
    if (!editor.state.doc.eq(content)) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return <div className="rich-loading">{t('正在准备编辑器…')}</div>;
  if (!toolbarState)
    return (
      <div className="rich-editor">
        <EditorContent editor={editor} />
      </div>
    );
  const controls = [
    {
      label: '加粗',
      icon: Bold,
      active: toolbarState.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: '斜体',
      icon: Italic,
      active: toolbarState.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: '下划线',
      icon: Underline,
      active: toolbarState.underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: '删除线',
      icon: Strikethrough,
      active: toolbarState.strike,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: '无序列表',
      icon: List,
      active: toolbarState.bulletList,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: '有序列表',
      icon: ListOrdered,
      active: toolbarState.orderedList,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];
  return (
    <div className="rich-editor">
      <div
        className="rich-toolbar"
        role="toolbar"
        aria-label={t('文字格式')}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) event.preventDefault();
        }}
      >
        {controls.map(({ label, icon: Icon, active, run }) => (
          <button
            key={label}
            type="button"
            aria-label={t(label)}
            title={t(label)}
            aria-pressed={active}
            onClick={() => {
              if (!editor.isDestroyed) run();
            }}
          >
            <Icon size={15} />
          </button>
        ))}
        <button
          type="button"
          aria-label={t('增加列表缩进')}
          title={t('增加列表缩进')}
          disabled={!toolbarState.canIndentList}
          onClick={() => {
            if (!editor.isDestroyed) editor.chain().focus().sinkListItem('listItem').run();
          }}
        >
          <Indent size={15} />
        </button>
        <button
          type="button"
          aria-label={t('减少列表缩进')}
          title={t('减少列表缩进')}
          disabled={!toolbarState.canOutdentList}
          onClick={() => {
            if (!editor.isDestroyed) editor.chain().focus().liftListItem('listItem').run();
          }}
        >
          <Outdent size={15} />
        </button>
        <button
          type="button"
          aria-label={t('编辑文字链接')}
          title={t('编辑文字链接')}
          aria-pressed={toolbarState.link}
          onClick={() => {
            if (editor.isDestroyed) return;
            setLinkValue(editor.getAttributes('link').href ?? '');
            setLinkError('');
            setLinkOpen(!linkOpen);
          }}
        >
          <Link2 size={15} />
        </button>
        <label>
          {t('字号')}
          <select
            aria-label={t('选区字号')}
            value={toolbarState.fontSize}
            onChange={(event) => {
              if (editor.isDestroyed) return;
              const fontSize = normalizeFontSize(event.target.value);
              if (fontSize) editor.chain().focus().setMark('textStyle', { fontSize }).run();
              else if (event.target.value !== 'mixed')
                editor
                  .chain()
                  .focus()
                  .setMark('textStyle', { fontSize: null })
                  .command(({ tr }) => {
                    const { from, to } = tr.selection;
                    tr.doc.nodesBetween(from, to, (node, position) => {
                      if (!node.isText) return;
                      const style = node.marks.find((mark) => mark.type.name === 'textStyle');
                      if (style && !style.attrs.fontSize && !style.attrs.color)
                        tr.removeMark(
                          Math.max(from, position),
                          Math.min(to, position + node.nodeSize),
                          style.type,
                        );
                    });
                    for (const mark of tr.storedMarks ?? [])
                      if (
                        mark.type.name === 'textStyle' &&
                        !mark.attrs.fontSize &&
                        !mark.attrs.color
                      )
                        tr.removeStoredMark(mark.type);
                    return true;
                  })
                  .run();
            }}
          >
            <option value="">{t('默认')}</option>
            {toolbarState.fontSize === 'mixed' && (
              <option value="mixed" disabled>
                {t('混合字号')}
              </option>
            )}
            {FONT_SIZES.map((size) => (
              <option key={size} value={`${size}px`}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('段落对齐')}
          <select
            aria-label={t('段落对齐')}
            value={toolbarState.textAlign}
            onChange={(event) => {
              if (editor.isDestroyed) return;
              const textAlign = normalizeTextAlign(event.target.value);
              if (textAlign)
                editor
                  .chain()
                  .focus()
                  .updateAttributes('paragraph', { textAlign })
                  .updateAttributes('heading', { textAlign })
                  .run();
            }}
          >
            <option value="left">{t('左对齐')}</option>
            <option value="center">{t('居中')}</option>
            <option value="right">{t('右对齐')}</option>
            <option value="justify">{t('两端对齐')}</option>
          </select>
        </label>
        <label>
          {t('缩进')}
          <select
            aria-label={t('段落缩进')}
            value={toolbarState.paragraphIndent}
            onChange={(event) => {
              if (editor.isDestroyed) return;
              const paragraphIndent = normalizeParagraphIndent(Number(event.target.value));
              if (paragraphIndent !== undefined)
                editor.chain().focus().updateAttributes('paragraph', { paragraphIndent }).run();
            }}
          >
            {PARAGRAPH_INDENTS.map((indent) => (
              <option key={indent} value={indent}>
                {indent} em
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('行距')}
          <select
            aria-label={t('段落行距')}
            value={toolbarState.lineHeight}
            onChange={(event) => {
              if (editor.isDestroyed) return;
              const lineHeight = normalizeParagraphLineHeight(Number(event.target.value)) ?? null;
              editor.chain().focus().updateAttributes('paragraph', { lineHeight }).run();
            }}
          >
            <option value="">{t('默认')}</option>
            {PARAGRAPH_LINE_HEIGHTS.map((height) => (
              <option key={height} value={height}>
                {height}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('高亮')}
          <select
            aria-label={t('文字高亮')}
            value={toolbarState.highlight}
            onChange={(event) => {
              if (editor.isDestroyed) return;
              const color = normalizeHighlightColor(event.target.value);
              if (color) editor.chain().focus().setMark('highlight', { color }).run();
              else editor.chain().focus().unsetMark('highlight').run();
            }}
          >
            <option value="">{t('无')}</option>
            <option value="mint">{t('薄荷绿')}</option>
            <option value="blue">{t('雾蓝')}</option>
            <option value="pink">{t('浅粉')}</option>
            <option value="lilac">{t('丁香紫')}</option>
            <option value="butter">{t('奶油黄')}</option>
            {toolbarState.highlight.startsWith('#') && (
              <option value={toolbarState.highlight}>{t('自定义颜色')}</option>
            )}
          </select>
        </label>
        <label>
          {t('文字颜色')}
          <input
            type="color"
            aria-label={t('文字颜色')}
            value={toolbarState.color || '#303830'}
            onChange={(event) => {
              if (!editor.isDestroyed)
                editor.chain().focus().setMark('textStyle', { color: event.target.value }).run();
            }}
          />
        </label>
        <button
          type="button"
          aria-label={t('重置文字颜色')}
          title={t('重置文字颜色')}
          onClick={() => {
            if (editor.isDestroyed) return;
            if (toolbarState.fontSize)
              editor.chain().focus().setMark('textStyle', { color: null }).run();
            else editor.chain().focus().unsetMark('textStyle').run();
          }}
        >
          {t('默认字色')}
        </button>
        <label>
          {t('背景颜色')}
          <input
            type="color"
            aria-label={t('背景颜色')}
            value={highlightCssColor(toolbarState.highlight) || '#f5edcf'}
            onChange={(event) => {
              if (!editor.isDestroyed)
                editor.chain().focus().setMark('highlight', { color: event.target.value }).run();
            }}
          />
        </label>
        <button
          type="button"
          aria-label={t('重置背景颜色')}
          title={t('重置背景颜色')}
          onClick={() => {
            if (!editor.isDestroyed) editor.chain().focus().unsetMark('highlight').run();
          }}
        >
          {t('无背景')}
        </button>
        <button
          type="button"
          aria-label={t('清除格式')}
          title={t('清除格式')}
          onClick={() => {
            if (editor.isDestroyed) return;
            editor
              .chain()
              .focus()
              .clearNodes()
              .unsetAllMarks()
              .resetAttributes('paragraph', ['textAlign', 'paragraphIndent', 'lineHeight'])
              .run();
          }}
        >
          <RemoveFormatting size={15} />
        </button>
      </div>
      <details className="rich-advanced">
        <summary>{t('高级格式')}</summary>
        <div
          className="rich-toolbar"
          role="toolbar"
          aria-label={t('高级格式')}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) event.preventDefault();
          }}
        >
          <label>
            {t('文本结构')}
            <select
              aria-label={t('文本结构')}
              value={toolbarState.block}
              onChange={(event) => {
                if (editor.isDestroyed) return;
                const value = event.target.value;
                if (value === 'paragraph') editor.chain().focus().setParagraph().run();
                else if (value === 'codeBlock') editor.chain().focus().setCodeBlock().run();
                else
                  editor
                    .chain()
                    .focus()
                    .setHeading({ level: Number(value) as 1 | 2 | 3 | 4 })
                    .run();
              }}
            >
              <option value="paragraph">{t('正文段落')}</option>
              {[1, 2, 3, 4].map((level) => (
                <option key={level} value={level}>
                  {t('标题')} {level}
                </option>
              ))}
              <option value="codeBlock">{t('代码块')}</option>
            </select>
          </label>
          <button
            type="button"
            aria-label={t('引用块')}
            aria-pressed={toolbarState.blockquote}
            onClick={() => {
              if (!editor.isDestroyed) editor.chain().focus().toggleBlockquote().run();
            }}
          >
            {t('引用块')}
          </button>
          <button
            type="button"
            aria-label={t('行内代码')}
            aria-pressed={toolbarState.code}
            onClick={() => {
              if (!editor.isDestroyed) editor.chain().focus().toggleCode().run();
            }}
          >
            {t('行内代码')}
          </button>
          <button
            type="button"
            aria-label={t('分隔线')}
            onClick={() => {
              if (!editor.isDestroyed) editor.chain().focus().setHorizontalRule().run();
            }}
          >
            {t('分隔线')}
          </button>
          {(['superscript', 'subscript'] as const).map((mark) => (
            <button
              key={mark}
              type="button"
              aria-label={t(mark === 'superscript' ? '上标' : '下标')}
              aria-pressed={toolbarState[mark]}
              onClick={() => {
                if (!editor.isDestroyed) editor.chain().focus().toggleMark(mark).run();
              }}
            >
              {t(mark === 'superscript' ? '上标' : '下标')}
            </button>
          ))}
          {toolbarState.block === 'codeBlock' && (
            <label>
              {t('代码语言')}
              <input
                aria-label={t('代码语言')}
                placeholder="typescript"
                value={toolbarState.language}
                maxLength={40}
                onChange={(event) => {
                  if (editor.isDestroyed) return;
                  const language = event.target.value;
                  if (!language || normalizeCodeLanguage(language))
                    editor.commands.updateAttributes('codeBlock', { language: language || null });
                }}
              />
            </label>
          )}
        </div>
      </details>
      <details className="rich-advanced">
        <summary>{t('表格编辑')}</summary>
        <div
          className="rich-toolbar"
          role="toolbar"
          aria-label={t('表格编辑')}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) event.preventDefault();
          }}
        >
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
            }
          >
            {t('插入表格')}
          </button>
          {(
            [
              'addRowBefore',
              'addRowAfter',
              'deleteRow',
              'addColumnBefore',
              'addColumnAfter',
              'deleteColumn',
              'mergeCells',
              'splitCell',
              'toggleHeaderRow',
              'toggleHeaderColumn',
              'deleteTable',
            ] as const
          ).map((command, index) => (
            <button
              key={command}
              type="button"
              disabled={!toolbarState.table || !editor.can()[command]()}
              onClick={() => editor.chain().focus()[command]().run()}
            >
              {t(
                [
                  '上方插入行',
                  '下方插入行',
                  '删除行',
                  '左侧插入列',
                  '右侧插入列',
                  '删除列',
                  '合并单元格',
                  '拆分单元格',
                  '切换表头行',
                  '切换表头列',
                  '删除表格',
                ][index],
              )}
            </button>
          ))}
          <label>
            {t('单元格底色')}
            <select
              aria-label={t('单元格底色')}
              disabled={!toolbarState.table}
              value={toolbarState.cellColor}
              onChange={(event) =>
                editor
                  .chain()
                  .focus()
                  .setCellAttribute('backgroundColor', event.target.value || null)
                  .run()
              }
            >
              <option value="">{t('无')}</option>
              <option value="#deeee4">{t('薄荷绿')}</option>
              <option value="#e0eafa">{t('雾蓝')}</option>
              <option value="#f5e2e9">{t('浅粉')}</option>
              <option value="#ebe3f6">{t('丁香紫')}</option>
              <option value="#f5edcf">{t('奶油黄')}</option>
              {toolbarState.cellColor &&
                !['#deeee4', '#e0eafa', '#f5e2e9', '#ebe3f6', '#f5edcf'].includes(
                  toolbarState.cellColor,
                ) && <option value={toolbarState.cellColor}>{t('自定义颜色')}</option>}
            </select>
          </label>
        </div>
      </details>
      {linkOpen && (
        <div className="rich-link-form">
          <input
            type="url"
            aria-label={t('文字链接地址')}
            placeholder="https://example.com"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              if (editor.isDestroyed) return;
              if (linkValue && !safeLink(linkValue)) {
                setLinkError('请填写完整的安全链接。');
                return;
              }
              const chain = editor.chain().focus().extendMarkRange('link');
              if (linkValue) chain.setLink({ href: safeLink(linkValue)! }).run();
              else chain.unsetLink().run();
              setLinkOpen(false);
            }}
          >
            {t('应用')}
          </button>
          <button type="button" aria-label={t('关闭链接编辑')} onClick={() => setLinkOpen(false)}>
            <X size={14} />
          </button>
          {linkError && <p role="alert">{linkError}</p>}
        </div>
      )}
      <EditorContent editor={editor} />
      <FieldAssist
        label={label}
        value={richTextToMarkdown(value)}
        sourceKey={JSON.stringify(value)}
        renderSource={(identity) => (
          <RichTextContent value={JSON.parse(identity) as RichTextNode} />
        )}
        controls={
          <label>
            <input
              type="checkbox"
              checked={preservePresentation}
              onChange={(event) => setPreservePresentation(event.target.checked)}
            />
            {t('保留原文字体与段落样式')}
          </label>
        }
        renderPreview={(next, identity) => (
          <RichTextContent
            value={applyRichSuggestion(
              JSON.parse(identity) as RichTextNode,
              next,
              preservePresentation,
            )}
          />
        )}
        onApply={(next) =>
          (onApply ?? onChange)(applyRichSuggestion(value, next, preservePresentation))
        }
      />
    </div>
  );
}
