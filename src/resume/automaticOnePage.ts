export type OnePageStatus = 'fitted' | 'cannot-fit' | 'manual-breaks';

export function minimumOnePageScale(value: unknown): number {
  const scale = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof scale === 'number' && Number.isFinite(scale) && scale >= 0.5 && scale <= 1
    ? scale
    : 0.5;
}

/** Measures a detached renderer copy without changing saved appearance values. */
export function automaticOnePage(
  source: HTMLElement,
  host: HTMLElement,
): { page?: HTMLElement; status: OnePageStatus } {
  if (source.querySelector('[data-break-before="true"]')) return { status: 'manual-breaks' };
  const page = source.cloneNode(false) as HTMLElement;
  page.classList.add('resume-page');
  for (const property of ['height', 'min-height', 'max-height'])
    page.style.removeProperty(property);
  const content = document.createElement('div');
  content.className = 'resume-one-page-content';
  content.style.display = 'flow-root';
  content.append(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
  page.append(content);
  host.append(page);
  try {
    const applyScale = (scale: number) => {
      content.style.setProperty('zoom', String(scale));
    };
    const fits = () => {
      const bounds = page.getBoundingClientRect();
      const padding = getComputedStyle(page);
      const availableBottom = bounds.bottom - parseFloat(padding.paddingBottom);
      const inner = content.getBoundingClientRect();
      return (
        inner.bottom <= availableBottom - 0.5 &&
        inner.left >= bounds.left + parseFloat(padding.paddingLeft) - 0.5 &&
        inner.right <= bounds.right - parseFloat(padding.paddingRight) + 0.5 &&
        Array.from(content.querySelectorAll<HTMLElement>('.resume-header,.resume-body')).every(
          (block) => block.scrollWidth <= block.clientWidth + 1,
        )
      );
    };
    let scale = 1;
    applyScale(scale);
    if (!fits()) {
      let low = minimumOnePageScale(source.dataset.automaticOnePageMinScale);
      let high = 1;
      applyScale(low);
      if (!fits()) return { status: 'cannot-fit' };
      for (let iteration = 0; iteration < 12; iteration++) {
        const candidate = (low + high) / 2;
        applyScale(candidate);
        if (fits()) low = candidate;
        else high = candidate;
      }
      scale = Math.floor(low * 10000) / 10000;
      applyScale(scale);
    }
    page.dataset.onePageFit = 'fitted';
    page.dataset.onePageScale = String(scale);
    page.dataset.pageNumber = '1';
    page.setAttribute('aria-label', 'Resume page 1');
    return { page, status: 'fitted' };
  } finally {
    page.remove();
  }
}
