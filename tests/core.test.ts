import { describe, expect, it } from "vitest";
import { capabilityPath, descendantsOf, makeId, parseSimpleFrontmatter, progressFor, sanitizeFileName, stageProgress } from "../src/core";
import type { Capability } from "../src/types";

function capability(input: Partial<Capability> & Pick<Capability, "id" | "name">): Capability {
  return {
    parentId: null,
    stage: 0,
    weight: 1,
    order: 0,
    status: "active",
    focus: false,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    ...input
  };
}

describe("capability progress", () => {
  it("maps stages to fixed progress", () => {
    expect([0, 1, 2, 3, 4, 5].map(stageProgress)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("uses active leaf descendants and their weights", () => {
    const capabilities = [
      capability({ id: "ROOT", name: "Root", stage: 5 }),
      capability({ id: "A", name: "A", parentId: "ROOT", stage: 2, weight: 1 }),
      capability({ id: "B", name: "B", parentId: "ROOT", stage: 4, weight: 3 }),
      capability({ id: "OLD", name: "Old", parentId: "ROOT", stage: 5, weight: 100, status: "archived" })
    ];
    expect(progressFor("ROOT", capabilities)).toBe(70);
    expect(progressFor(null, capabilities)).toBe(70);
  });

  it("uses the capability stage when it is an active leaf", () => {
    expect(progressFor("ONLY", [capability({ id: "ONLY", name: "Only", stage: 3 })])).toBe(60);
  });
});

describe("capability navigation", () => {
  const capabilities = [
    capability({ id: "A", name: "Area" }),
    capability({ id: "B", name: "Branch", parentId: "A" }),
    capability({ id: "C", name: "Leaf", parentId: "B" })
  ];

  it("finds descendants", () => {
    expect([...descendantsOf("A", capabilities)]).toEqual(["B", "C"]);
  });

  it("builds breadcrumbs", () => {
    expect(capabilityPath("C", capabilities).map((item) => item.name)).toEqual(["Area", "Branch", "Leaf"]);
  });
});

describe("Markdown helpers", () => {
  it("parses the supported frontmatter values", () => {
    const parsed = parseSimpleFrontmatter("---\nid: \"CAP-123\"\nfocus: true\nweight: 2\ncapabilityIds: [\"A\",\"B\"]\nparentId: null\n---\n\nBody");
    expect(parsed.data).toEqual({ id: "CAP-123", focus: true, weight: 2, capabilityIds: ["A", "B"], parentId: null });
    expect(parsed.body).toBe("Body");
  });

  it("creates portable file names and stable-format IDs", () => {
    expect(sanitizeFileName("Risk / Reward: what?" )).toBe("Risk Reward what");
    expect(makeId("CAP", () => 0)).toBe("CAP-AAAAAAAA");
  });
});
