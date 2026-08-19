import type { Appearance } from './model.ts';

export function currentPhotoDimensions(appearance: Appearance): { width: number; height: number } {
  const width = appearance.photoWidth ?? appearance.photoSize;
  return {
    width,
    height:
      appearance.photoHeight ??
      (appearance.photoShape === 'circle' ? width : appearance.photoSize * 1.28),
  };
}

export function resizeDimensions(
  dimensions: { width: number; height: number },
  axis: 'width' | 'height',
  value: number,
  ratio?: number,
  bounds = { minWidth: 20, maxWidth: 200, minHeight: 20, maxHeight: 220 },
): { width: number; height: number } {
  const clamp = (input: number, min: number, max: number) => Math.min(max, Math.max(min, input));
  if (!Number.isFinite(value)) return dimensions;
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0)
    return {
      width: axis === 'width' ? clamp(value, bounds.minWidth, bounds.maxWidth) : dimensions.width,
      height:
        axis === 'height' ? clamp(value, bounds.minHeight, bounds.maxHeight) : dimensions.height,
    };
  const width = clamp(
    axis === 'width' ? value : value * ratio,
    Math.max(bounds.minWidth, bounds.minHeight * ratio),
    Math.min(bounds.maxWidth, bounds.maxHeight * ratio),
  );
  return { width, height: width / ratio };
}
