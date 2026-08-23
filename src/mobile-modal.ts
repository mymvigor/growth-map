export interface ModalViewportMetrics {
  visibleHeight: number;
  offsetTop: number;
  maxModalHeight: number;
}

export interface ModalViewportEventTarget {
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export function calculateModalViewport(
  viewport: Pick<VisualViewport, "height" | "offsetTop"> | null,
  innerHeight: number,
  modalGap = 24
): ModalViewportMetrics {
  const visibleHeight = Math.max(0, viewport?.height ?? innerHeight);
  const offsetTop = Math.max(0, viewport?.offsetTop ?? 0);
  return {
    visibleHeight,
    offsetTop,
    maxModalHeight: Math.max(0, visibleHeight - modalGap)
  };
}

export function observeModalViewport(
  viewport: ModalViewportEventTarget | null,
  windowTarget: ModalViewportEventTarget,
  listener: EventListener
): () => void {
  viewport?.addEventListener("resize", listener, { passive: true });
  viewport?.addEventListener("scroll", listener, { passive: true });
  windowTarget.addEventListener("resize", listener, { passive: true });
  return () => {
    viewport?.removeEventListener("resize", listener);
    viewport?.removeEventListener("scroll", listener);
    windowTarget.removeEventListener("resize", listener);
  };
}
