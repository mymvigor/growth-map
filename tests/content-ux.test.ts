import { describe, expect, it } from "vitest";
import {
  initialRelatedCapabilityIds,
  parseContentBlocks,
  pendingAttachmentMarker,
  searchCapabilities,
  serializeContentBlocks,
  suggestedCapabilities,
  updateRecentCapabilityIds
} from "../src/content-ux";
import type { AttachmentRef, Capability } from "../src/types";

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

const attachment: AttachmentRef = {
  path: "08 Attachments/evidence.png",
  name: "evidence.png",
  mimeType: "image/png",
  added: "2026-01-01T00:00:00.000Z"
};

describe("content-first editor blocks", () => {
  it("round-trips text and an inline attachment without exposing or losing Markdown", () => {
    const body = "Before\n\n![[08 Attachments/evidence.png]]\n\nAfter";
    const blocks = parseContentBlocks(body, [attachment]);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "attachment", "text"]);
    expect(serializeContentBlocks(blocks)).toBe(body);
  });

  it("keeps v1.1 attachment metadata that did not yet have an inline embed", () => {
    const blocks = parseContentBlocks("Legacy body", [attachment]);
    expect(serializeContentBlocks(blocks)).toBe("Legacy body\n\n![[08 Attachments/evidence.png]]");
  });

  it("serializes a newly inserted file at its text position for later Vault materialization", () => {
    const token = "pending-attachment";
    const body = serializeContentBlocks([
      { id: "before", kind: "text", value: "Before\n\n" },
      { id: "attachment", kind: "attachment", pending: { token, file: { name: "report.pdf" } as File } },
      { id: "after", kind: "text", value: "\n\nAfter" }
    ]);
    expect(body).toBe(`Before\n\n${pendingAttachmentMarker(token)}\n\nAfter`);
  });
});

describe("Related to suggestions", () => {
  const capabilities = [
    capability({ id: "CAP-WORK", name: "Work" }),
    capability({ id: "CAP-TRADING", name: "Trading", parentId: "CAP-WORK" }),
    capability({ id: "CAP-OPTIONALITY", name: "Optionality", parentId: "CAP-TRADING" }),
    capability({ id: "CAP-NEGOTIATION", name: "Negotiation", parentId: "CAP-TRADING" }),
    capability({ id: "CAP-COMMUNICATION", name: "Communication" })
  ];

  it("supports empty relations and automatically includes the current context", () => {
    expect(initialRelatedCapabilityIds([], undefined)).toEqual([]);
    expect(initialRelatedCapabilityIds(["CAP-WORK"], "CAP-OPTIONALITY")).toEqual(["CAP-WORK", "CAP-OPTIONALITY"]);
  });

  it("searches by the full capability path", () => {
    expect(searchCapabilities(capabilities, "work / trading / opt").map((item) => item.id)).toEqual(["CAP-OPTIONALITY"]);
    expect(searchCapabilities(capabilities, "negotiation").map((item) => item.id)).toEqual(["CAP-NEGOTIATION"]);
  });

  it("keeps recent capabilities stable and offers unselected siblings", () => {
    expect(updateRecentCapabilityIds(["CAP-WORK", "CAP-TRADING"], ["CAP-OPTIONALITY", "CAP-WORK"])).toEqual([
      "CAP-OPTIONALITY",
      "CAP-WORK",
      "CAP-TRADING"
    ]);
    expect(suggestedCapabilities(capabilities, "CAP-OPTIONALITY", ["CAP-OPTIONALITY"]).map((item) => item.id)).toEqual([
      "CAP-NEGOTIATION"
    ]);
  });
});
