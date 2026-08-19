import { automaticOnePage, type OnePageStatus } from './automaticOnePage.ts';

export const PAGE_WIDTH = (210 / 25.4) * 96;
export const PAGE_HEIGHT = (297 / 25.4) * 96;
export const PAGE_GAP = 28;

/** Measures trusted renderer output at its unscaled A4 width. */
export function paginateResume(source: HTMLElement, host: HTMLElement): HTMLElement[] {
  let onePageStatus: OnePageStatus | undefined;
  if (source.dataset.automaticOnePage === 'true') {
    const fitted = automaticOnePage(source, host);
    if (fitted.page) return [fitted.page];
    onePageStatus = fitted.status;
  }
  const pages: HTMLElement[] = [];
  const bodySource = source.querySelector<HTMLElement>('.resume-body')!;
  let page!: HTMLElement;
  let body!: HTMLElement;
  let containers = new Map<Node, HTMLElement>();

  const createPage = (first: boolean) => {
    const paper = source.cloneNode(false) as HTMLElement;
    paper.classList.add('resume-page');
    if (first) {
      const header = source.querySelector('.resume-header');
      if (header) paper.append(header.cloneNode(true));
    }
    const content = bodySource.cloneNode(false) as HTMLElement;
    paper.append(content);
    host.append(paper);
    return { paper, content };
  };
  const nextPage = () => {
    if (page) {
      for (const clone of Array.from(containers.values()).reverse()) {
        if (clone !== body && !clone.textContent && !clone.querySelector('img,br,hr'))
          clone.remove();
      }
      for (const section of page.querySelectorAll('.resume-section')) {
        if (!section.querySelector('.resume-entry')) section.remove();
      }
    }
    const next = createPage(pages.length === 0);
    page = next.paper;
    body = next.content;
    pages.push(page);
    containers = new Map([[bodySource, body]]);
  };
  const fits = (paper = page) => {
    const bottom =
      paper.getBoundingClientRect().bottom - parseFloat(getComputedStyle(paper).paddingBottom);
    return Array.from(paper.children).every(
      (child) =>
        child.getBoundingClientRect().bottom <= bottom + 0.1 &&
        child.scrollWidth <= child.clientWidth + 1,
    );
  };
  const ensurePath = (path: HTMLElement[], leaf?: Node) => {
    let parent = body;
    path.forEach((template, index) => {
      let clone = containers.get(template);
      if (!clone) {
        clone = template.cloneNode(false) as HTMLElement;
        if (template.matches('.resume-section') && template.querySelector(':scope > h2'))
          clone.append(template.querySelector(':scope > h2')!.cloneNode(true));
        if (template.tagName === 'OL') {
          const item = path[index + 1] ?? leaf;
          const offset = Array.from(template.children).indexOf(item as Element);
          clone.setAttribute(
            'start',
            String(Number(template.getAttribute('start') ?? 1) + Math.max(0, offset)),
          );
        }
        parent.append(clone);
        containers.set(template, clone);
      }
      parent = clone;
    });
    return parent;
  };
  const appendNode = (node: Node, path: HTMLElement[]) => {
    let parent = ensurePath(path, node);
    const clone = node.cloneNode(true);
    parent.append(clone);
    if (fits()) return;
    parent.removeChild(clone);

    if (node instanceof HTMLElement && node.tagName === 'TABLE') {
      const tableBody = node.querySelector<HTMLElement>(':scope > tbody') ?? node;
      const rows = Array.from(tableBody.children) as HTMLTableRowElement[];
      const tablePath = [...path, node, ...(tableBody === node ? [] : [tableBody])];
      for (let index = 0; index < rows.length; ) {
        let end = index + 1;
        for (let row = index; row < end; row++)
          for (const cell of Array.from(rows[row].cells))
            end = Math.max(end, Math.min(rows.length, row + cell.rowSpan));
        const group = rows.slice(index, end).map((row) => row.cloneNode(true));
        const append = () => {
          const container = ensurePath(tablePath);
          for (const row of group) container.append(row);
        };
        append();
        if (!fits()) {
          group.forEach((row) => row.parentNode?.removeChild(row));
          nextPage();
          append();
          if (!fits()) throw new Error('表格单行或跨行合并内容超出一页，请拆分单元格或减小字号。');
        }
        index = end;
      }
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const characters = Array.from(node.textContent ?? '');
      let offset = 0;
      while (offset < characters.length) {
        parent = ensurePath(path, node);
        const text = document.createTextNode('');
        parent.append(text);
        let low = 0;
        let high = characters.length - offset;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          text.data = characters.slice(offset, offset + middle).join('');
          if (fits()) low = middle;
          else high = middle - 1;
        }
        text.data = characters.slice(offset, offset + low).join('');
        offset += low;
        if (offset < characters.length) {
          if (!low) text.remove();
          nextPage();
          if (!low) {
            const probe = document.createTextNode(characters[offset]);
            ensurePath(path, node).append(probe);
            const canFit = fits();
            probe.remove();
            if (!canFit) throw new Error('当前排版无法容纳文字，请增大模块宽度或减小字号。');
          }
        }
      }
      return;
    }
    if (node instanceof HTMLElement && node.childNodes.length) {
      for (const child of node.childNodes) appendNode(child, [...path, node]);
      return;
    }
    nextPage();
    ensurePath(path, node).append(clone);
    if (!fits()) throw new Error('当前内容超出纸张范围，请调整排版。');
  };

  nextPage();
  if (!fits()) throw new Error('个人信息超出一页，请精简抬头内容或减小字号。');
  for (const section of bodySource.children) {
    if (
      (section as HTMLElement).dataset.breakBefore === 'true' &&
      (body.children.length > 0 || page.querySelector('.resume-header')?.textContent?.trim())
    )
      nextPage();
    const whole = section.cloneNode(true) as HTMLElement;
    body.append(whole);
    if (fits()) continue;
    whole.remove();
    const sectionBody = section.querySelector<HTMLElement>('.resume-section-body')!;
    const path = [section as HTMLElement, sectionBody];
    for (const entry of sectionBody.children) {
      const parent = ensurePath(path, entry);
      const entryClone = entry.cloneNode(true) as HTMLElement;
      parent.append(entryClone);
      if (fits()) continue;
      entryClone.remove();

      // Move intact entries when they fit on a fresh page; split only oversized entries.
      const probe = createPage(false);
      const probeSection = section.cloneNode(false) as HTMLElement;
      if (section.querySelector(':scope > h2'))
        probeSection.append(section.querySelector(':scope > h2')!.cloneNode(true));
      const probeBody = sectionBody.cloneNode(false) as HTMLElement;
      probeBody.append(entry.cloneNode(true));
      probeSection.append(probeBody);
      probe.content.append(probeSection);
      const fitsFreshPage = fits(probe.paper);
      probe.paper.remove();
      if (fitsFreshPage) {
        nextPage();
        ensurePath(path, entry).append(entryClone);
      } else {
        appendNode(entry, path);
      }
    }
  }
  if (!bodySource.children.length) {
    const empty = source.querySelector('.resume-empty');
    if (empty) body.append(empty.cloneNode(true));
  }
  pages.forEach((paper, index) => {
    if (onePageStatus) paper.dataset.onePageFit = onePageStatus;
    paper.setAttribute('aria-label', `简历第 ${index + 1} 页`);
    paper.dataset.pageNumber = String(index + 1);
    paper.remove();
  });
  return pages;
}
