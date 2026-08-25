import { safeLink, textContent, type RichTextNode } from './model.ts';
import { validateRichText } from './files.ts';
import { normalizeCodeLanguage } from './textFormatting.ts';
import { Marked, type Token, type TokenizerAndRendererExtension } from 'marked';
import { richTableHtml, parseTableHtmlBlocks } from './tableInterchange.ts';
import { parseFragment } from 'parse5';

export const MAX_RICH_MARKDOWN_BYTES = 2 * 1024 * 1024;

export function escapeMarkdown(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replace(/[\\`*_[\]#<>~^!|+-]/g, '\\$&')
    .replace(/^(\d+)\./gm, '$1\\.');
}

function destination(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replace(/[()<>\s\\]/g, (character) => encodeURIComponent(character));
}

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  // Markdown references require semicolons; attribute parsing keeps unknown names literal.
  const escaped = value
    .replace(/&(?!(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)/g, '&amp;')
    .replaceAll('"', '&#34;')
    .replaceAll('<', '&lt;');
  const node = parseFragment(`<a href="${escaped}"></a>`).childNodes[0];
  return node && 'attrs' in node
    ? (node.attrs.find((attr) => attr.name === 'href')?.value ?? value)
    : value;
}

function codeFence(text: string, minimum: number): string {
  let length = minimum;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  return '`'.repeat(length);
}

function serializeNode(node: RichTextNode): string {
  if (node.type === 'table') return richTableHtml(node);
  if (node.type === 'text') {
    const text = node.text ?? '';
    const code = node.marks?.some((mark) => mark.type === 'code');
    const ticks = code ? codeFence(text, 1) : '';
    let value = code
      ? `${ticks}${/^[` ]|[` ]$/.test(text) ? ' ' : ''}${text}${/^[` ]|[` ]$/.test(text) ? ' ' : ''}${ticks}`
      : escapeMarkdown(text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = `**${value}**`;
      if (mark.type === 'italic') value = `*${value}*`;
      if (mark.type === 'strike') value = `~~${value}~~`;
      if (mark.type === 'superscript') value = `^${value}^`;
      if (mark.type === 'subscript') value = `~${value}~`;
      if (mark.type === 'link') {
        const href = safeLink(mark.attrs?.href ?? '');
        if (href) value = `[${value}](${destination(href)})`;
      }
    }
    return value;
  }
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'horizontalRule') return '---';
  if (node.type === 'codeBlock') {
    const text = (node.content ?? []).map((child) => child.text ?? '').join('');
    const fence = codeFence(text, 3);
    return `${fence}${normalizeCodeLanguage(node.attrs?.language) ?? ''}\n${text}\n${fence}`;
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content ?? [])
      .map((item, index) => {
        const prefix = node.type === 'bulletList' ? '- ' : `${(node.attrs?.start ?? 1) + index}. `;
        return serializeNode(item)
          .split('\n')
          .map((line, lineIndex) =>
            lineIndex === 0 ? prefix + line : line ? ' '.repeat(prefix.length) + line : '',
          )
          .join('\n');
      })
      .join('\n');
  }
  const content =
    node.type === 'paragraph' || node.type === 'heading'
      ? serializeInline(node.content ?? [])
      : (node.content ?? [])
          .map(
            (child, index) =>
              (index
                ? node.type === 'listItem' && child.type !== 'paragraph'
                  ? '\n'
                  : '\n\n'
                : '') + serializeNode(child),
          )
          .join('');
  if (node.type === 'heading') return `${'#'.repeat(node.attrs?.level ?? 1)} ${content}`;
  if (node.type === 'blockquote')
    return content
      .split('\n')
      .map((line) => `>${line ? ' ' + line : ''}`)
      .join('\n');
  return content;
}

export function richTextToMarkdown(node: RichTextNode): string {
  return serializeNode(validateRichText(node));
}

type Marks = NonNullable<RichTextNode['marks']>;
const markOrder = ['link', 'bold', 'italic', 'strike', 'superscript', 'subscript', 'code'];

function serializeInline(nodes: RichTextNode[]): string {
  if (
    (nodes.length > 1 &&
      nodes.some((node) => node.marks?.some((mark) => markOrder.includes(mark.type)))) ||
    nodes.some(
      (node) =>
        (node.marks?.filter((mark) => markOrder.includes(mark.type)).length ?? 0) > 1 ||
        node.marks?.some((mark) => ['superscript', 'subscript'].includes(mark.type)),
    )
  ) {
    const tags: Record<string, string> = {
      bold: 'strong',
      italic: 'em',
      strike: 's',
      superscript: 'sup',
      subscript: 'sub',
    };
    return nodes
      .map((node) => {
        if (node.type !== 'text') return serializeNode(node);
        let value = serializeNode({
          ...node,
          marks: node.marks?.filter((mark) => mark.type === 'code'),
        });
        for (const mark of node.marks ?? []) {
          if (tags[mark.type]) value = `<${tags[mark.type]}>${value}</${tags[mark.type]}>`;
          else if (mark.type === 'link' && safeLink(mark.attrs?.href ?? ''))
            value = `[${value}](${destination(safeLink(mark.attrs!.href!)!)})`;
        }
        return value;
      })
      .join('');
  }
  let active: Marks = [];
  let output = '';
  const token = (mark: Marks[number], closing = false): string => {
    if (mark.type === 'link')
      return closing ? `](${destination(safeLink(mark.attrs?.href ?? '')!)})` : '[';
    return (
      (
        {
          bold: '**',
          italic: '*',
          strike: '~~',
          superscript: closing ? '</sup>' : '<sup>',
          subscript: closing ? '</sub>' : '<sub>',
        } as Record<string, string>
      )[mark.type] ?? ''
    );
  };
  const orderedMarks = (node: RichTextNode | undefined): Marks =>
    (node?.marks ?? [])
      .filter(
        (mark) =>
          markOrder.includes(mark.type) &&
          mark.type !== 'code' &&
          (mark.type !== 'link' || safeLink(mark.attrs?.href ?? '')),
      )
      .sort((a, b) => markOrder.indexOf(a.type) - markOrder.indexOf(b.type));
  const commonMarks = (left: Marks, right: Marks): Marks => {
    let shared = 0;
    while (
      shared < left.length &&
      shared < right.length &&
      JSON.stringify(left[shared]) === JSON.stringify(right[shared])
    )
      shared++;
    return left.slice(0, shared);
  };
  const segments = nodes.flatMap((node, index): RichTextNode[] => {
    if (node.type !== 'text' || node.marks?.some((mark) => mark.type === 'code')) return [node];
    const text = node.text ?? '';
    const leading = /^\s*/.exec(text)![0];
    const trailing = /\s*$/.exec(text)![0];
    const marks = orderedMarks(node);
    if (leading.length === text.length)
      return [
        {
          ...node,
          marks: commonMarks(
            commonMarks(marks, orderedMarks(nodes[index - 1])),
            orderedMarks(nodes[index + 1]),
          ),
        },
      ];
    return [
      ...(leading
        ? [
            {
              type: 'text',
              text: leading,
              marks: commonMarks(marks, orderedMarks(nodes[index - 1])),
            },
          ]
        : []),
      { ...node, text: text.slice(leading.length, text.length - trailing.length) },
      ...(trailing
        ? [
            {
              type: 'text',
              text: trailing,
              marks: commonMarks(marks, orderedMarks(nodes[index + 1])),
            },
          ]
        : []),
    ];
  });
  for (const node of [...segments, { type: 'end' }]) {
    const marks = (node.marks ?? [])
      .filter(
        (mark) =>
          markOrder.includes(mark.type) &&
          mark.type !== 'code' &&
          (mark.type !== 'link' || safeLink(mark.attrs?.href ?? '')),
      )
      .sort((a, b) => markOrder.indexOf(a.type) - markOrder.indexOf(b.type));
    let shared = 0;
    while (
      shared < active.length &&
      shared < marks.length &&
      JSON.stringify(active[shared]) === JSON.stringify(marks[shared])
    )
      shared++;
    output += active
      .slice(shared)
      .reverse()
      .map((mark) => token(mark, true))
      .join('');
    output += marks
      .slice(shared)
      .map((mark) => token(mark))
      .join('');
    active = marks;
    if (node.type !== 'end')
      output += serializeNode({
        ...node,
        marks: node.marks?.filter((mark) => mark.type === 'code'),
      });
  }
  return output;
}

function appendText(nodes: RichTextNode[], text: string, marks: Marks): void {
  if (!text) return;
  const last = nodes.at(-1);
  if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks))
    last.text += text;
  else nodes.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
}

function withMark(marks: Marks, type: string, attrs?: Marks[number]['attrs']): Marks {
  return [
    ...marks.filter((mark) => mark.type !== type),
    { type, ...(attrs ? { attrs } : {}) },
  ].sort((a, b) => markOrder.indexOf(a.type) - markOrder.indexOf(b.type));
}

function findClosing(text: string, token: string, start: number): number {
  let index = start;
  while ((index = text.indexOf(token, index)) !== -1) {
    let escapes = 0;
    for (let before = index - 1; before >= 0 && text[before] === '\\'; before--) escapes++;
    if (escapes % 2 === 0) return index;
    index += token.length;
  }
  return -1;
}

const scriptExtension: TokenizerAndRendererExtension = {
  name: 'script',
  level: 'inline',
  start: (source) => source.search(/[~^]/),
  tokenizer(source) {
    const delimiter = source[0];
    if ((delimiter !== '^' && delimiter !== '~') || source.startsWith('~~')) return;
    const close = findClosing(source, delimiter, 1);
    if (close <= 1 || /\s/.test(source.slice(1, close))) return;
    return {
      type: 'script',
      raw: source.slice(0, close + 1),
      text: source.slice(1, close),
      script: delimiter === '^' ? 'superscript' : 'subscript',
    };
  },
};

function parseInline(text: string, marks: Marks = [], depth = 0): RichTextNode[] {
  if (depth >= 20) return [{ type: 'text', text, ...(marks.length ? { marks } : {}) }];
  const nodes: RichTextNode[] = [];
  if (text.length > 20000 && !/(?:^|[^\\])[*_[~^<]/.test(text)) {
    const runs = new Map<number, number>();
    const previous = new Map<number, number>();
    for (const match of text.matchAll(/`+/g)) {
      const prior = previous.get(match[0].length);
      if (prior !== undefined) runs.set(prior, match.index);
      previous.set(match[0].length, match.index);
    }
    let cursor = 0;
    while (cursor < text.length) {
      if (text[cursor] === '\\' && /[\\`*_[\]#<>~^!|+\-.]/.test(text[cursor + 1] ?? '')) {
        appendText(nodes, text[cursor + 1], marks);
        cursor += 2;
        continue;
      }
      const run = text[cursor] === '`' ? /^`+/.exec(text.slice(cursor))![0] : '';
      const close = runs.get(cursor);
      if (run && close !== undefined) {
        let value = text.slice(cursor + run.length, close).replace(/\n/g, ' ');
        if (value.startsWith(' ') && value.endsWith(' ') && value.trim())
          value = value.slice(1, -1);
        appendText(nodes, value, withMark(marks, 'code'));
        cursor = close + run.length;
      } else if (run) {
        appendText(nodes, run, marks);
        cursor += run.length;
      } else {
        const start = cursor++;
        while (cursor < text.length && text[cursor] !== '`' && text[cursor] !== '\\') cursor++;
        appendText(nodes, decodeEntities(text.slice(start, cursor)), marks);
      }
    }
    return nodes;
  }
  const htmlMarks: string[] = [];
  const walk = (tokens: Token[], inherited: Marks, level: number) => {
    for (const token of tokens) {
      let active = inherited;
      for (const script of htmlMarks) active = withMark(active, script);
      if (level >= 20) {
        appendText(nodes, token.raw, active);
        continue;
      }
      if (token.type === 'strong' || token.type === 'em' || token.type === 'del')
        walk(
          token.tokens ?? [],
          withMark(
            active,
            token.type === 'strong' ? 'bold' : token.type === 'em' ? 'italic' : 'strike',
          ),
          level + 1,
        );
      else if (token.type === 'script')
        nodes.push(...parseInline(token.text, withMark(active, token.script), level + 1));
      else if (token.type === 'codespan') appendText(nodes, token.text, withMark(active, 'code'));
      else if (token.type === 'link') {
        const href = safeLink(decodeEntities(token.href));
        if (href) walk(token.tokens ?? [], withMark(active, 'link', { href }), level + 1);
        else appendText(nodes, token.raw, active);
      } else if (token.type === 'br') nodes.push({ type: 'hardBreak' });
      else if (token.type === 'html') {
        const tag = /^<(\/?)(sup|sub|strong|em|s)>$/.exec(token.raw);
        const type = tag
          ? (
              {
                sup: 'superscript',
                sub: 'subscript',
                strong: 'bold',
                em: 'italic',
                s: 'strike',
              } as Record<string, string>
            )[tag[2]]
          : '';
        if (tag && !tag[1]) htmlMarks.push(type);
        else if (tag && tag[1] && htmlMarks.at(-1) === type) htmlMarks.pop();
        else appendText(nodes, token.raw, active);
      } else if (token.type === 'text' && token.tokens) walk(token.tokens, active, level + 1);
      else
        appendText(
          nodes,
          token.type === 'text'
            ? decodeEntities(token.text)
            : token.type === 'escape'
              ? token.text
              : token.raw,
          active,
        );
    }
  };
  const parser = new Marked({ gfm: true, extensions: [scriptExtension] });
  walk(new parser.Lexer(parser.defaults).inlineTokens(text), marks, depth);
  return nodes;
}

function listMarker(line: string) {
  const match = /^([-+*] |(\d{1,16})[.)] )(.*)$/.exec(line);
  if (!match || (match[2] && !Number.isSafeInteger(Number(match[2])))) return undefined;
  return {
    type: match[2] ? 'orderedList' : 'bulletList',
    width: match[1].length,
    start: match[2] ? Number(match[2]) : undefined,
    text: match[3],
  };
}

function parseBlocks(lines: string[], depth = 0): RichTextNode[] {
  if (depth > 18)
    return [{ type: 'paragraph', content: [{ type: 'text', text: lines.join('\n') }] }];
  const content: RichTextNode[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const children: RichTextNode[] = [];
    paragraph.forEach((line, index) => {
      const hardBreak = index < paragraph.length - 1 && line.endsWith('  ');
      children.push(...parseInline(hardBreak ? line.slice(0, -2) : line));
      if (index < paragraph.length - 1)
        children.push(hardBreak ? { type: 'hardBreak' } : { type: 'text', text: '\n' });
    });
    content.push({ type: 'paragraph', content: children });
    paragraph = [];
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = /^ {0,3}(`{3,}|~{3,})([^\s]*)\s*$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const marker = listMarker(line);
    if (/^\s*<table(?:\s|>)/.test(line)) {
      flush();
      const source = lines.slice(index).join('\n');
      const blocks = parseTableHtmlBlocks(source);
      content.push(...blocks.content);
      lines = source.slice(blocks.length).split('\n');
      index = 0;
    } else if (
      index + 1 < lines.length &&
      line.includes('|') &&
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      flush();
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|'))
        tableLines.push(lines[index++]);
      const token = new Marked({ gfm: true }).lexer(tableLines.join('\n'))[0];
      if (token?.type !== 'table') throw new Error('Invalid Markdown table.');
      const rows = [token.header, ...token.rows] as {
        text: string;
        align?: 'left' | 'center' | 'right' | null;
      }[][];
      content.push({
        type: 'table',
        content: rows.map((row, index) => ({
          type: 'tableRow',
          content: row.map((cell) => ({
            type: index === 0 ? 'tableHeader' : 'tableCell',
            content: [
              {
                type: 'paragraph',
                ...(cell.align ? { attrs: { textAlign: cell.align } } : {}),
                content: parseInline(cell.text),
              },
            ],
          })),
        })),
      });
    } else if (fence) {
      flush();
      const code: string[] = [];
      index++;
      const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (index < lines.length && !closing.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      const language = normalizeCodeLanguage(fence[2]);
      content.push({
        type: 'codeBlock',
        ...(language ? { attrs: { language } } : {}),
        ...(code.length ? { content: [{ type: 'text', text: code.join('\n') }] } : {}),
      });
    } else if (heading) {
      flush();
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      index++;
    } else if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      content.push({ type: 'horizontalRule' });
      index++;
    } else if (/^ {0,3}>/.test(line)) {
      flush();
      const quote: string[] = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index]))
        quote.push(lines[index++].replace(/^ {0,3}> ?/, ''));
      content.push({ type: 'blockquote', content: parseBlocks(quote, depth + 1) });
    } else if (marker) {
      flush();
      const list: RichTextNode = {
        type: marker.type,
        ...(marker.start === undefined ? {} : { attrs: { start: marker.start } }),
        content: [],
      };
      while (index < lines.length) {
        const current = listMarker(lines[index]);
        if (!current || current.type !== marker.type) break;
        const itemLines = [current.text];
        const indent = ' '.repeat(current.width);
        index++;
        while (index < lines.length) {
          if (!lines[index].trim()) {
            let next = index + 1;
            while (next < lines.length && !lines[next].trim()) next++;
            if (next < lines.length && lines[next].startsWith(indent)) {
              itemLines.push('');
              index++;
              continue;
            }
            if (next < lines.length && listMarker(lines[next])?.type === marker.type) index = next;
            break;
          }
          if (!lines[index].startsWith(indent)) break;
          itemLines.push(lines[index++].slice(current.width));
        }
        const children = parseBlocks(itemLines, depth + 1);
        if (children[0]?.type !== 'paragraph') children.unshift({ type: 'paragraph' });
        list.content!.push({ type: 'listItem', content: children });
      }
      content.push(list);
    } else {
      if (line.trim()) paragraph.push(line);
      else flush();
      index++;
    }
  }
  flush();
  return content;
}

export function markdownInlineToText(text: string): string {
  return textContent({ type: 'paragraph', content: parseInline(text) });
}

export function markdownToRichText(text: string): RichTextNode {
  if (new TextEncoder().encode(text).length > MAX_RICH_MARKDOWN_BYTES)
    throw new Error('Markdown input exceeds the size limit.');
  const content = parseBlocks(text.replace(/\r\n?/g, '\n').split('\n'));
  return validateRichText({
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  });
}
