import { describe, expect, it } from "vitest";
import { calculateModalViewport, observeModalViewport, type ModalViewportEventTarget } from "../src/mobile-modal";

class FakeEventTarget implements ModalViewportEventTarget {
  private listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

describe("keyboard-aware modal viewport", () => {
  it("uses the visual viewport height and offset when available", () => {
    expect(calculateModalViewport({ height: 844, offsetTop: 0 }, 844)).toEqual({
      visibleHeight: 844,
      offsetTop: 0,
      maxModalHeight: 820
    });
  });

  it("shrinks the modal to the keyboard-visible area", () => {
    expect(calculateModalViewport({ height: 356, offsetTop: 18 }, 844)).toEqual({
      visibleHeight: 356,
      offsetTop: 18,
      maxModalHeight: 332
    });
  });

  it("removes every viewport listener during cleanup", () => {
    const viewport = new FakeEventTarget();
    const windowTarget = new FakeEventTarget();
    let updates = 0;
    const listener: EventListener = () => { updates += 1; };
    const cleanup = observeModalViewport(viewport, windowTarget, listener);

    expect(viewport.count("resize")).toBe(1);
    expect(viewport.count("scroll")).toBe(1);
    expect(windowTarget.count("resize")).toBe(1);
    viewport.emit("resize");
    expect(updates).toBe(1);

    cleanup();
    expect(viewport.count("resize")).toBe(0);
    expect(viewport.count("scroll")).toBe(0);
    expect(windowTarget.count("resize")).toBe(0);
    viewport.emit("resize");
    windowTarget.emit("resize");
    expect(updates).toBe(1);
  });
});
