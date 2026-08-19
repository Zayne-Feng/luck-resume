export interface LayoutTarget {
  sectionId: string;
  entryId?: string;
}
export interface LayoutIssue {
  id: string;
  kind: 'small-text' | 'orphan-heading' | 'sparse-page';
  page: number;
  target?: LayoutTarget;
  value?: number;
}
export interface TextGeometry {
  fontSize: number;
  characters: number;
  body?: boolean;
  target?: LayoutTarget;
}
export interface HeadingGeometry {
  bottom: number;
  nextContentTop?: number;
  target?: LayoutTarget;
}
export interface PageGeometry {
  top: number;
  bottom: number;
  contentBottom?: number;
  scale: number;
  text: TextGeometry[];
  headings: HeadingGeometry[];
  manualBreakAfter?: boolean;
}
export interface LayoutQuality {
  scale: number;
  smallestTextPt?: number;
  issues: LayoutIssue[];
}

/** Geometry uses physical CSS pixels after automatic fitting, before preview scaling. */
export function analyzeLayoutGeometry(pages: PageGeometry[]): LayoutQuality {
  const issues: LayoutIssue[] = [];
  let smallestTextPt: number | undefined;
  pages.forEach((page, index) => {
    const meaningful = page.text.filter(
      (text) => text.fontSize > 0 && (text.characters >= 12 || (text.body && text.characters > 0)),
    );
    const smallest = meaningful.reduce<TextGeometry | undefined>(
      (current, text) => (!current || text.fontSize < current.fontSize ? text : current),
      undefined,
    );
    if (smallest) {
      const pt = smallest.fontSize * page.scale * 0.75;
      smallestTextPt = Math.min(smallestTextPt ?? Infinity, pt);
      if (pt < 9)
        issues.push({
          id: `small-text-${index}`,
          kind: 'small-text',
          page: index + 1,
          value: pt,
          target: smallest.target,
        });
    }
    const seen = new Set<string>();
    page.headings.forEach((heading) => {
      if (heading.nextContentTop !== undefined && heading.nextContentTop < page.bottom - 1) return;
      const key = heading.target?.sectionId ?? String(heading.bottom);
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({
        id: `orphan-heading-${index}-${key}`,
        kind: 'orphan-heading',
        page: index + 1,
        target: heading.target,
      });
    });
    if (
      index < pages.length - 1 &&
      !page.manualBreakAfter &&
      page.contentBottom !== undefined &&
      page.bottom > page.top
    ) {
      const unused = (page.bottom - page.contentBottom) / (page.bottom - page.top);
      if (unused > 0.35)
        issues.push({
          id: `sparse-page-${index}`,
          kind: 'sparse-page',
          page: index + 1,
          value: unused,
        });
    }
  });
  return { scale: Math.min(1, ...pages.map((page) => page.scale)), smallestTextPt, issues };
}

function targetFor(element: Element): LayoutTarget | undefined {
  const sectionId = element.closest<HTMLElement>('[data-section-id]')?.dataset.sectionId;
  if (!sectionId) return undefined;
  const entryId = element.closest<HTMLElement>('[data-entry-id]')?.dataset.entryId;
  return { sectionId, ...(entryId ? { entryId } : {}) };
}

/** Detached page copies retain the renderer's print metrics and never affect preview nodes. */
export function inspectLayoutQuality(pages: HTMLElement[]): LayoutQuality {
  if (!pages.length) return analyzeLayoutGeometry([]);
  const host = document.createElement('div');
  host.className = 'pagination-source';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  try {
    const copies = pages.map((page) => page.cloneNode(true) as HTMLElement);
    host.append(...copies);
    const geometries = copies.map((page, index): PageGeometry => {
      const rect = page.getBoundingClientRect();
      const style = getComputedStyle(page);
      const top = rect.top + parseFloat(style.paddingTop);
      const bottom = rect.bottom - parseFloat(style.paddingBottom);
      const rawScale = Number(page.dataset.onePageScale);
      const scale = Number.isFinite(rawScale) && rawScale >= 0.5 && rawScale <= 1 ? rawScale : 1;
      const text: TextGeometry[] = [];
      let contentBottom: number | undefined;
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const element = node.parentElement;
        if (
          !element ||
          !node.textContent?.trim() ||
          element.closest(
            'sup,sub,small,.resume-contacts,.resume-contributions,.resume-entry-meta,.resume-entry-date,.resume-entry-date-inline,.resume-name-label,.resume-empty',
          )
        )
          continue;
        const computed = getComputedStyle(element);
        if (computed.display === 'none') continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        contentBottom = Math.max(contentBottom ?? top, bounds.bottom);
        text.push({
          fontSize: parseFloat(computed.fontSize),
          characters: node.textContent.trim().length,
          body: Boolean(element.closest('.resume-rich')),
          target: targetFor(element),
        });
      }
      page.querySelectorAll('img').forEach((image) => {
        const bounds = image.getBoundingClientRect();
        if (bounds.height) contentBottom = Math.max(contentBottom ?? top, bounds.bottom);
      });
      const headings = Array.from(page.querySelectorAll<HTMLElement>('.resume-section > h2'))
        .filter((heading) => heading.getBoundingClientRect().height > 0)
        .map((heading) => {
          const section = heading.parentElement!;
          const entry = section.querySelector<HTMLElement>('.resume-entry');
          const bounds = entry?.getBoundingClientRect();
          return {
            bottom: heading.getBoundingClientRect().bottom,
            nextContentTop: bounds && bounds.height > 0 ? bounds.top : undefined,
            target: targetFor(heading),
          };
        });
      const nextSection = copies[index + 1]?.querySelector<HTMLElement>('.resume-section');
      const manualBreakAfter =
        nextSection?.dataset.breakBefore === 'true' &&
        !page.querySelector(
          `[data-section-id="${CSS.escape(nextSection.dataset.sectionId ?? '')}"]`,
        );
      return { top, bottom, contentBottom, scale, text, headings, manualBreakAfter };
    });
    return analyzeLayoutGeometry(geometries);
  } finally {
    host.remove();
  }
}
