import type { RichTextNode } from './model.ts';
import { validateRichText } from './files.ts';
import { richTextToMarkdown, markdownToRichText } from './richTextMarkdown.ts';

type Marks = NonNullable<RichTextNode['marks']>;
const visualTypes = new Set(['underline', 'textStyle', 'highlight']);
const visualMarks = (node: RichTextNode): Marks =>
  (node.marks ?? []).filter((mark) => visualTypes.has(mark.type));
const inlineText = (node: RichTextNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(inlineText).join('');

function restoreInline(source: RichTextNode, target: RichTextNode): void {
  const original = source.content ?? [];
  const leaves = original.filter((node) => node.type === 'text');
  if (!leaves.length) return;
  const uniform = visualMarks(leaves[0]);
  const isUniform = leaves.every(
    (node) => JSON.stringify(visualMarks(node)) === JSON.stringify(uniform),
  );
  const previousText = inlineText(source);
  const nextText = inlineText(target);
  const ranges: { start: number; end: number; marks: Marks }[] = [];
  if (!isUniform) {
    let previousOffset = 0;
    let nextOffset = 0;
    for (const leaf of original) {
      const text = leaf.text ?? '';
      if (leaf.type === 'text' && text) {
        const start =
          previousText === nextText ? previousOffset : nextText.indexOf(text, nextOffset);
        if (start >= 0) {
          ranges.push({ start, end: start + text.length, marks: visualMarks(leaf) });
          nextOffset = start + text.length;
        }
      }
      previousOffset += text.length;
    }
  }
  let offset = 0;
  target.content = (target.content ?? []).flatMap((node) => {
    if (node.type !== 'text') return [node];
    const text = node.text ?? '';
    const start = offset;
    offset += text.length;
    const cuts = [
      ...new Set([
        start,
        offset,
        ...ranges
          .flatMap((range) => [range.start, range.end])
          .filter((n) => n > start && n < offset),
      ]),
    ].sort((a, b) => a - b);
    return cuts.slice(0, -1).map((from, index) => {
      const inherited = isUniform
        ? uniform
        : (ranges.find((range) => from >= range.start && from < range.end)?.marks ?? []);
      const marks = [
        ...(node.marks ?? []).filter((mark) => !visualTypes.has(mark.type)),
        ...structuredClone(inherited),
      ];
      return {
        type: 'text',
        text: text.slice(from - start, cuts[index + 1] - start),
        ...(marks.length ? { marks } : {}),
      };
    });
  });
}

export function applyRichSuggestion(
  source: RichTextNode,
  markdown: string,
  preserve = true,
): RichTextNode {
  if (preserve && markdown === richTextToMarkdown(source)) return structuredClone(source);
  const target = markdownToRichText(markdown);
  if (!preserve) return target;
  const restore = (before: RichTextNode, after: RichTextNode) => {
    if (before.type !== after.type) return;
    if (after.type === 'paragraph' || after.type === 'heading') {
      const { textAlign, paragraphIndent, lineHeight } = before.attrs ?? {};
      const attrs = {
        ...after.attrs,
        ...(textAlign ? { textAlign } : {}),
        ...(paragraphIndent !== undefined ? { paragraphIndent } : {}),
        ...(lineHeight ? { lineHeight } : {}),
      };
      if (Object.keys(attrs).length) after.attrs = attrs;
      restoreInline(before, after);
    } else {
      const previous = before.content ?? [];
      const next = after.content ?? [];
      const identities = new Map<string, number[]>();
      previous.forEach((child, index) => {
        const key = `${child.type}:${inlineText(child)}`;
        identities.set(key, [...(identities.get(key) ?? []), index]);
      });
      const matches = new Map<number, number>();
      const used = new Set<number>();
      next.forEach((child, index) => {
        const match = identities.get(`${child.type}:${inlineText(child)}`)?.shift();
        if (match !== undefined) {
          matches.set(index, match);
          used.add(match);
        }
      });
      next.forEach((child, index) => {
        const match = matches.get(index);
        if (match !== undefined) restore(previous[match], child);
        else if (previous.length === next.length && previous[index] && !used.has(index))
          restore(previous[index], child);
      });
    }
  };
  restore(source, target);
  return validateRichText(target);
}
