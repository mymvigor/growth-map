import { describe, expect, it } from "vitest";
import {
  buildSearchDocuments,
  clearLibrarySearchFilters,
  createBestSnippet,
  createSearchContext,
  filterSearchResults,
  hasActiveLibrarySearchFilters,
  searchDocuments,
  splitHighlightedText
} from "../src/search";
import type { Capability, ContentItem } from "../src/types";

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

function content(input: Partial<ContentItem> & Pick<ContentItem, "id">): ContentItem {
  return {
    type: "knowledge",
    title: "",
    body: "",
    capabilityIds: [],
    status: "draft",
    confidence: "low",
    sourceType: "personal-observation",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    ...input
  };
}

const capabilities = [
  capability({ id: "CAP-WORK", name: "Work" }),
  capability({ id: "CAP-TRADING", name: "Trading", parentId: "CAP-WORK" }),
  capability({ id: "CAP-VOYAGE", name: "Voyage Economics", parentId: "CAP-TRADING" }),
  capability({ id: "CAP-COMMUNICATION", name: "Communication" })
];

describe("global knowledge search", () => {
  it("is case-insensitive", () => {
    const documents = buildSearchDocuments([content({ id: "CASE-1", body: "Panamax voyage" })], capabilities);
    expect(searchDocuments(documents, "PANAMAX").map((result) => result.document.id)).toEqual(["CASE-1"]);
    expect(searchDocuments(documents, "panamax").map((result) => result.document.id)).toEqual(["CASE-1"]);
    expect(searchDocuments(documents, "Panamax").map((result) => result.document.id)).toEqual(["CASE-1"]);
  });

  it("matches and prioritizes titles", () => {
    const documents = buildSearchDocuments([
      content({ id: "TITLE", title: "Panamax", body: "Review" }),
      content({ id: "BODY", title: "Voyage", body: "Panamax" })
    ], capabilities);
    const results = searchDocuments(documents, "panamax");
    expect(results.map((result) => result.document.id)).toEqual(["TITLE", "BODY"]);
    expect(results[0]?.source).toBe("title");
  });

  it("searches the complete body", () => {
    const documents = buildSearchDocuments([content({ id: "BODY", body: "Opening\n\nPanamax bunker consumption\n\nOutcome" })], capabilities);
    expect(searchDocuments(documents, "bunker")[0]?.document.id).toBe("BODY");
  });

  it("finds a match in a middle paragraph", () => {
    const body = `${"Beginning context ".repeat(20)}\n\nThe decisive Panamax ballast assumption changed the result.\n\n${"Ending context ".repeat(20)}`;
    const result = searchDocuments(buildSearchDocuments([content({ id: "MIDDLE", body })], capabilities), "panamax")[0];
    expect(result?.snippet).toContain("Panamax");
    expect(result?.snippet.startsWith("Beginning context")).toBe(false);
  });

  it("uses AND logic for multiple keywords", () => {
    const documents = buildSearchDocuments([
      content({ id: "BOTH", body: "Panamax voyage with a separate bunker review" }),
      content({ id: "ONE", body: "Panamax voyage only" })
    ], capabilities);
    expect(searchDocuments(documents, "  panamax   bunker  ").map((result) => result.document.id)).toEqual(["BOTH"]);
  });

  it("scores a continuous phrase above separated body tokens", () => {
    const documents = buildSearchDocuments([
      content({ id: "PHRASE", body: "Panamax bunker consumption matters" }),
      content({ id: "SEPARATED", body: `Panamax ${"voyage ".repeat(30)} bunker consumption matters` })
    ], capabilities);
    expect(searchDocuments(documents, "panamax bunker").map((result) => result.document.id)).toEqual(["PHRASE", "SEPARATED"]);
  });

  it("supports Chinese queries without whitespace", () => {
    const documents = buildSearchDocuments([content({ id: "CN", body: "巴拿马型船的吨税需要复核" })], capabilities);
    expect(searchDocuments(documents, "巴拿马")[0]?.document.id).toBe("CN");
  });

  it("supports mixed Chinese and English tokens", () => {
    const documents = buildSearchDocuments([content({ id: "MIXED", body: "Panamax 当前运费结构" })], capabilities);
    expect(searchDocuments(documents, "Panamax 运费")[0]?.document.id).toBe("MIXED");
  });

  it("searches capability names and complete paths", () => {
    const documents = buildSearchDocuments([content({ id: "CAP", capabilityIds: ["CAP-VOYAGE"] })], capabilities);
    const result = searchDocuments(documents, "trading voyage")[0];
    expect(result?.document.id).toBe("CAP");
    expect(result?.source).toBe("capability");
    expect(result?.snippet).toContain("Work / Trading / Voyage Economics");
  });

  it("searches attachment names without reading binary content", () => {
    const documents = buildSearchDocuments([content({
      id: "ATTACHMENT",
      attachments: [{
        path: "08 Attachments/Panamax Market Report.pdf",
        name: "Panamax Market Report.pdf",
        mimeType: "application/pdf",
        added: "2026-01-01T00:00:00.000Z"
      }]
    })], capabilities);
    const result = searchDocuments(documents, "market report")[0];
    expect(result?.source).toBe("attachment");
    expect(result?.snippet).toBe("Attachment: Panamax Market Report.pdf");
  });

  it("excludes archived content", () => {
    const documents = buildSearchDocuments([content({ id: "ARCHIVED", body: "Panamax", status: "archived" })], capabilities);
    expect(searchDocuments(documents, "panamax")).toEqual([]);
  });

  it("counts all actual token matches", () => {
    const documents = buildSearchDocuments([content({ id: "COUNT", body: "Panamax then PANAMAX and panamax" })], capabilities);
    expect(searchDocuments(documents, "panamax")[0]?.matchCount).toBe(3);
  });

  it("generates a clean bounded best-match snippet", () => {
    const snippet = createBestSnippet(`${"Before ".repeat(30)}## Panamax **bunker** review ${"After ".repeat(30)}`, ["panamax", "bunker"], "panamax bunker");
    expect(snippet.length).toBeLessThanOrEqual(202);
    expect(snippet).toContain("Panamax bunker review");
    expect(snippet).not.toContain("**");
  });

  it("centers the snippet around the actual match instead of the body opening", () => {
    const snippet = createBestSnippet(`${"Unrelated opening. ".repeat(30)}TARGET-CONTEXT${" ending. ".repeat(30)}`, ["target-context"]);
    expect(snippet).toContain("TARGET-CONTEXT");
    expect(snippet.startsWith("Unrelated opening")).toBe(false);
    expect(snippet.startsWith("…")).toBe(true);
  });

  it("applies filters after global search", () => {
    const documents = buildSearchDocuments([
      content({ id: "CASE", type: "case", body: "Panamax" }),
      content({ id: "LESSON", type: "lesson", body: "Panamax" })
    ], capabilities);
    const globalResults = searchDocuments(documents, "panamax");
    const filtered = filterSearchResults(globalResults, { ...clearLibrarySearchFilters(), type: "case" }, capabilities);
    expect(globalResults).toHaveLength(2);
    expect(filtered.map((result) => result.document.id)).toEqual(["CASE"]);
  });

  it("clears every filter explicitly", () => {
    const cleared = clearLibrarySearchFilters();
    expect(cleared).toEqual({ type: "all", area: "all", capability: "all", status: "all", confidence: "all" });
    expect(hasActiveLibrarySearchFilters(cleared)).toBe(false);
    expect(hasActiveLibrarySearchFilters({ ...cleared, capability: "CAP-VOYAGE" })).toBe(true);
  });

  it("creates lightweight runtime navigation context", () => {
    const context = createSearchContext(" Panamax 运费 ", "CASE-1", { source: "body", index: 42 });
    expect(context).toEqual({
      query: "Panamax 运费",
      tokens: ["panamax", "运费"],
      contentId: "CASE-1",
      preferredMatch: { source: "body", index: 42 }
    });
  });

  it("splits highlight text safely and case-insensitively", () => {
    const segments = splitHighlightedText("PANAMAX 与 bunker", ["panamax", "bunker"]);
    expect(segments.filter((segment) => segment.highlighted).map((segment) => segment.text)).toEqual(["PANAMAX", "bunker"]);
    expect(segments.map((segment) => segment.text).join("")).toBe("PANAMAX 与 bunker");
  });

  it("never mutates source Markdown or content metadata", () => {
    const item = content({ id: "SAFE", title: "Review", body: "# Panamax\n\nOriginal body", capabilityIds: ["CAP-VOYAGE"] });
    const before = JSON.parse(JSON.stringify(item)) as ContentItem;
    const documents = buildSearchDocuments([item], capabilities);
    searchDocuments(documents, "panamax voyage");
    expect(item).toEqual(before);
  });
});
