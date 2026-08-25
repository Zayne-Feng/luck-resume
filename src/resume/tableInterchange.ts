import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { safeLink, type RichTextNode } from './model.ts';
import {
  normalizeFontSize,
  normalizeHighlightColor,
  normalizeTextAlign,
  normalizeTextColor,
  normalizeParagraphIndent,
  normalizeParagraphLineHeight,
  normalizeCodeLanguage,
} from './textFormatting.ts';

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function richTableHtml(node: RichTextNode): string {
  if (node.type === 'text') {
    let value = escape(node.text ?? '');
    const tags: Record<string, string> = {
      bold: 'strong',
      italic: 'em',
      underline: 'u',
      strike: 's',
      code: 'code',
      superscript: 'sup',
      subscript: 'sub',
    };
    for (const mark of node.marks ?? []) {
      if (tags[mark.type]) value = `<${tags[mark.type]}>${value}</${tags[mark.type]}>`;
      else if (mark.type === 'link' && safeLink(mark.attrs?.href ?? ''))
        value = `<a href="${escape(safeLink(mark.attrs!.href!)!)}">${value}</a>`;
      else if (mark.type === 'textStyle')
        value = `<span style="${mark.attrs?.fontSize ? `font-size:${escape(mark.attrs.fontSize)};` : ''}${mark.attrs?.color ? `color:${escape(mark.attrs.color)}` : ''}">${value}</span>`;
      else if (mark.type === 'highlight')
        value = `<mark data-highlight="${escape(mark.attrs?.color ?? 'butter')}">${value}</mark>`;
    }
    return value;
  }
  const tags: Record<string, string> = {
    table: 'table',
    tableRow: 'tr',
    tableCell: 'td',
    tableHeader: 'th',
    paragraph: 'p',
    heading: `h${node.attrs?.level ?? 1}`,
    bulletList: 'ul',
    orderedList: 'ol',
    listItem: 'li',
    blockquote: 'blockquote',
    codeBlock: 'pre',
    hardBreak: 'br',
    horizontalRule: 'hr',
  };
  const tag = tags[node.type];
  if (!tag) return (node.content ?? []).map(richTableHtml).join('');
  let attrs = '';
  if (node.type === 'tableCell' || node.type === 'tableHeader') {
    if (node.attrs?.colspan) attrs += ` colspan="${node.attrs.colspan}"`;
    if (node.attrs?.rowspan) attrs += ` rowspan="${node.attrs.rowspan}"`;
    if (node.attrs?.colwidth) attrs += ` data-colwidth="${node.attrs.colwidth.join(',')}"`;
    if (node.attrs?.backgroundColor)
      attrs += ` style="background-color:${escape(node.attrs.backgroundColor)}"`;
  }
  if (node.type === 'orderedList' && node.attrs?.start !== undefined)
    attrs += ` start="${node.attrs.start}"`;
  if (node.type === 'codeBlock' && node.attrs?.language)
    attrs += ` data-language="${escape(node.attrs.language)}"`;
  if (node.type === 'paragraph' || node.type === 'heading') {
    const styles = [
      node.attrs?.textAlign ? `text-align:${node.attrs.textAlign}` : '',
      node.attrs?.paragraphIndent !== undefined
        ? `margin-left:${node.attrs.paragraphIndent}em`
        : '',
      node.attrs?.lineHeight ? `line-height:${node.attrs.lineHeight}` : '',
    ]
      .filter(Boolean)
      .join(';');
    if (styles) attrs += ` style="${styles}"`;
  }
  return `<${tag}${attrs}>${(node.content ?? []).map(richTableHtml).join('')}${tag === 'br' || tag === 'hr' ? '' : `</${tag}>`}`;
}

type HtmlNode = DefaultTreeAdapterTypes.ChildNode;
type Marks = NonNullable<RichTextNode['marks']>;
export function parseTableHtmlBlocks(html: string): { content: RichTextNode[]; length: number } {
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  const convert = (node: HtmlNode, marks: Marks = [], depth = 0): RichTextNode[] => {
    if (depth > 40) throw new Error('Table nesting exceeds the limit.');
    if (node.nodeName === '#text')
      return (node as DefaultTreeAdapterTypes.TextNode).value
        ? [
            {
              type: 'text',
              text: (node as DefaultTreeAdapterTypes.TextNode).value,
              ...(marks.length ? { marks } : {}),
            },
          ]
        : [];
    if (!('tagName' in node)) return [];
    const attr = (key: string) => node.attrs.find((attr) => attr.name === key)?.value;
    const style = Object.fromEntries(
      (attr('style') ?? '').split(';').map((part) => {
        const i = part.indexOf(':');
        return [part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()];
      }),
    );
    const child = (next = marks) =>
      node.childNodes.flatMap((child) => convert(child, next, depth + 1));
    const withMark = (type: string, attrs?: Marks[number]['attrs']): Marks => [
      ...marks.filter((mark) => mark.type !== type),
      { type, ...(attrs ? { attrs } : {}) },
    ];
    const marksByTag: Record<string, string> = {
      strong: 'bold',
      b: 'bold',
      em: 'italic',
      i: 'italic',
      u: 'underline',
      s: 'strike',
      del: 'strike',
      sup: 'superscript',
      sub: 'subscript',
      code: 'code',
    };
    const mark = marksByTag[node.tagName];
    if (mark) return child(withMark(mark));
    if (node.tagName === 'a') {
      const href = safeLink(attr('href') ?? '');
      return child(href ? withMark('link', { href }) : marks);
    }
    if (node.tagName === 'span') {
      const fontSize = normalizeFontSize(style['font-size']);
      const color = normalizeTextColor(style.color);
      return child(
        fontSize || color
          ? withMark('textStyle', {
              ...marks.find((mark) => mark.type === 'textStyle')?.attrs,
              ...(fontSize ? { fontSize } : {}),
              ...(color ? { color } : {}),
            })
          : marks,
      );
    }
    if (node.tagName === 'mark') {
      const color = normalizeHighlightColor(attr('data-highlight')) ?? 'butter';
      return child(withMark('highlight', { color }));
    }
    if (['script', 'style', 'iframe', 'object'].includes(node.tagName)) return [];
    if (node.tagName === 'pre') {
      const text = (part: HtmlNode, level = depth + 1): string => {
        if (level > 40) throw new Error('Table nesting exceeds the limit.');
        if (part.nodeName === '#text') return (part as DefaultTreeAdapterTypes.TextNode).value;
        if (!('tagName' in part) || ['script', 'style', 'iframe', 'object'].includes(part.tagName))
          return '';
        return part.childNodes.map((child) => text(child, level + 1)).join('');
      };
      const code = node.childNodes.find((part) => 'tagName' in part && part.tagName === 'code');
      const languageClass =
        code && 'attrs' in code
          ? code.attrs
              .find((attr) => attr.name === 'class')
              ?.value.split(/\s+/)
              .find((value) => value.startsWith('language-'))
              ?.slice(9)
          : undefined;
      const language =
        normalizeCodeLanguage(attr('data-language')) ?? normalizeCodeLanguage(languageClass);
      const value = node.childNodes.map((child) => text(child)).join('');
      return [
        {
          type: 'codeBlock',
          ...(language ? { attrs: { language } } : {}),
          content: value ? [{ type: 'text', text: value }] : [],
        },
      ];
    }
    const type = (
      {
        table: 'table',
        tr: 'tableRow',
        td: 'tableCell',
        th: 'tableHeader',
        p: 'paragraph',
        h1: 'heading',
        h2: 'heading',
        h3: 'heading',
        h4: 'heading',
        ul: 'bulletList',
        ol: 'orderedList',
        li: 'listItem',
        blockquote: 'blockquote',
        br: 'hardBreak',
        hr: 'horizontalRule',
      } as Record<string, string>
    )[node.tagName];
    if (!type) return child();
    const result: RichTextNode = { type };
    const attrs: NonNullable<RichTextNode['attrs']> = {};
    if (type === 'heading') attrs.level = Number(node.tagName[1]);
    if (type === 'orderedList' && attr('start')) attrs.start = Number(attr('start'));
    if (type === 'paragraph' || type === 'heading') {
      const textAlign = normalizeTextAlign(style['text-align']);
      const paragraphIndent = /^\d+em$/.test(style['margin-left'] ?? '')
        ? normalizeParagraphIndent(parseFloat(style['margin-left']))
        : undefined;
      const lineHeight = normalizeParagraphLineHeight(Number(style['line-height']));
      if (textAlign) attrs.textAlign = textAlign;
      if (paragraphIndent !== undefined) attrs.paragraphIndent = paragraphIndent;
      if (lineHeight) attrs.lineHeight = lineHeight;
    }
    if (type === 'tableCell' || type === 'tableHeader') {
      if (attr('colspan')) attrs.colspan = Number(attr('colspan'));
      if (attr('rowspan')) attrs.rowspan = Number(attr('rowspan'));
      if (attr('data-colwidth')) attrs.colwidth = attr('data-colwidth')!.split(',').map(Number);
      const backgroundColor = normalizeTextColor(style['background-color']);
      if (backgroundColor) attrs.backgroundColor = backgroundColor;
    }
    if (Object.keys(attrs).length) result.attrs = attrs;
    if (type !== 'hardBreak' && type !== 'horizontalRule') {
      let content = child();
      if (['table', 'tableRow'].includes(type))
        content = content.filter((n) => n.type !== 'text' || n.text?.trim());
      if (
        type === 'tableCell' ||
        type === 'tableHeader' ||
        type === 'listItem' ||
        type === 'blockquote'
      ) {
        const blocks: RichTextNode[] = [];
        let inline: RichTextNode[] = [];
        const flush = () => {
          if (inline.length) {
            blocks.push({ type: 'paragraph', content: inline });
            inline = [];
          }
        };
        for (const part of content) {
          if (part.type === 'text' || part.type === 'hardBreak') inline.push(part);
          else {
            flush();
            blocks.push(part);
          }
        }
        flush();
        content = blocks.length ? blocks : [{ type: 'paragraph' }];
        if (type === 'listItem' && content[0]?.type !== 'paragraph')
          content.unshift({ type: 'paragraph' });
      }
      result.content = content;
    }
    return [result];
  };
  const content: RichTextNode[] = [];
  let length = 0;
  const supported = ['table', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'pre', 'hr'];
  for (const node of fragment.childNodes) {
    if (node.nodeName === '#text' && !(node as DefaultTreeAdapterTypes.TextNode).value.trim())
      continue;
    if (node.nodeName === '#text') break;
    if (!('tagName' in node) || !supported.includes(node.tagName))
      throw new Error('Unsupported HTML block after a table.');
    const end = node.sourceCodeLocation?.endOffset;
    if (end === undefined) throw new Error('Invalid HTML block.');
    content.push(...convert(node));
    length = end;
  }
  if (content[0]?.type !== 'table') throw new Error('No table was found.');
  return { content, length };
}

export function parseTableHtml(html: string): RichTextNode {
  const { content, length } = parseTableHtmlBlocks(html);
  if (content.length !== 1 || html.slice(length).trim())
    throw new Error('Expected a single table.');
  return content[0];
}
