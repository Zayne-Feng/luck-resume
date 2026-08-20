export const RESUME_FONT_FAMILIES = {
  sans: 'Luck Sans',
  serif: 'Luck Serif',
  wenkai: 'Luck WenKai',
  xiaowei: 'Luck XiaoWei',
} as const;
export type ResumeFont = keyof typeof RESUME_FONT_FAMILIES;
export const fontIds = Object.keys(RESUME_FONT_FAMILIES) as ResumeFont[];
export function fontAssetPath(font: ResumeFont): string {
  if (!Object.hasOwn(RESUME_FONT_FAMILIES, font)) throw new Error('Unknown resume font.');
  return `/fonts/luck-${font}.woff2`;
}

export async function ensureResumeFont(font: ResumeFont): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) {
    throw new Error('The Font Loading API is unavailable.');
  }

  const family = RESUME_FONT_FAMILIES[font];
  const faces = await Promise.all(
    [400, 600].map((weight) => document.fonts.load(`${weight} 16px "${family}"`, '中文Aa0123')),
  );
  if (faces.some((matching) => matching.length === 0)) {
    throw new Error(`The resume font "${family}" is not registered.`);
  }
  await document.fonts.ready;
}
