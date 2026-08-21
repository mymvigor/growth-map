export interface BottomBarRect {
  top: number;
  bottom: number;
}

export function computeMobileBottomOffset(
  isMobile: boolean,
  viewportBottom: number,
  safeAreaInset: number,
  candidates: BottomBarRect[],
  gap = 8
): number {
  if (!isMobile) return 0;
  const nativeHeight = candidates.reduce((largest, rect) => {
    const distanceFromBottom = viewportBottom - rect.bottom;
    const visibleHeight = viewportBottom - rect.top;
    const isNearViewportBottom = distanceFromBottom >= -2 && distanceFromBottom <= Math.max(96, safeAreaInset + 16);
    if (!isNearViewportBottom || visibleHeight < 24 || visibleHeight > 180) return largest;
    return Math.max(largest, visibleHeight);
  }, 0);
  const safeInset = Math.max(0, safeAreaInset);
  return Math.ceil(nativeHeight > 0 ? Math.max(nativeHeight, safeInset) + gap : safeInset);
}
