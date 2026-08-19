import type { Appearance } from './model.ts';
import { PAGE_HEIGHT } from './pagination.ts';

export function fitCandidates(appearance: Appearance): Appearance[] {
  const candidates = [{ ...appearance }];
  const minimum = Math.min(11, appearance.fontSize);
  for (let font = appearance.fontSize; font >= minimum; font -= 0.5) {
    for (let level = 1; level <= 4; level++)
      candidates.push({
        ...appearance,
        fontSize: font,
        lineHeight: Math.max(
          1.25,
          Math.min(appearance.lineHeight, appearance.lineHeight - level * 0.1),
        ),
        pageMargin: Math.max(10, appearance.pageMargin - level * 2),
        sectionGap: Math.max(8, appearance.sectionGap - level * 3),
        entryGap: Math.max(4, (appearance.entryGap ?? 16) - level * 3),
        paragraphGap: Math.max(0, (appearance.paragraphGap ?? 4) - level),
      });
  }
  return candidates;
}

export interface FitResult {
  status: 'already-fit' | 'suggestion' | 'cannot-fit' | 'manual-breaks';
  appearance?: Appearance;
}
export function suggestOnePage(source: HTMLElement, appearance: Appearance): FitResult {
  if (source.querySelector('[data-break-before="true"]')) return { status: 'manual-breaks' };
  const clone = source.cloneNode(true) as HTMLElement;
  source.parentElement!.append(clone);
  try {
    for (const [index, candidate] of fitCandidates(appearance).entries()) {
      for (const [key, value] of Object.entries({
        '--resume-font-size': `${candidate.fontSize}px`,
        '--resume-line-height': String(candidate.lineHeight),
        '--resume-margin': `${candidate.pageMargin}mm`,
        '--resume-section-gap': `${candidate.sectionGap}px`,
        '--resume-entry-gap': candidate.entryGap === undefined ? null : `${candidate.entryGap}px`,
        '--resume-paragraph-gap':
          candidate.paragraphGap === undefined ? null : `${candidate.paragraphGap}px`,
      })) {
        if (value === null) clone.style.removeProperty(key);
        else clone.style.setProperty(key, value);
      }
      const rect = clone.getBoundingClientRect();
      const limit = rect.top + PAGE_HEIGHT - parseFloat(getComputedStyle(clone).paddingBottom);
      if (
        Array.from(clone.children).every(
          (child) =>
            child.getBoundingClientRect().bottom <= limit + 0.1 &&
            child.scrollWidth <= child.clientWidth + 1,
        )
      )
        return { status: index === 0 ? 'already-fit' : 'suggestion', appearance: candidate };
    }
    return { status: 'cannot-fit' };
  } finally {
    clone.remove();
  }
}
