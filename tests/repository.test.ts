import { beforeEach, describe, expect, it } from "vitest";
import { TFile as RuntimeTFile, type App, type TFile } from "obsidian";
import { pendingAttachmentMarker } from "../src/content-ux";
import { DEFAULT_SETTINGS } from "../src/types";

class FakeVault {
  readonly files = new Map<string, { file: TFile; content: string | ArrayBuffer }>();
  readonly folders = new Set<string>();

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  getAbstractFileByPath(path: string): TFile | { path: string } | null {
    return this.files.get(path)?.file ?? (this.folders.has(path) ? { path } : null);
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.values()].map((entry) => entry.file).filter((file) => file.path.endsWith(".md"));
  }

  async create(path: string, content: string): Promise<TFile> {
    const FileConstructor = RuntimeTFile as unknown as new (filePath: string) => TFile;
    const file = new FileConstructor(path);
    this.files.set(path, { file, content });
    return file;
  }

  async createBinary(path: string, content: ArrayBuffer): Promise<TFile> {
    const FileConstructor = RuntimeTFile as unknown as new (filePath: string) => TFile;
    const file = new FileConstructor(path);
    this.files.set(path, { file, content });
    return file;
  }

  async cachedRead(file: TFile): Promise<string> {
    const content = this.files.get(file.path)?.content;
    return typeof content === "string" ? content : "";
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.files.set(file.path, { file, content });
  }

  async rename(file: TFile, target: string): Promise<void> {
    const entry = this.files.get(file.path);
    if (!entry) return;
    this.files.delete(file.path);
    Object.assign(file, { path: target, basename: target.split("/").pop()?.replace(/\.md$/, "") ?? target });
    this.files.set(target, entry);
  }
}

describe("GrowthRepository", () => {
  let vault: FakeVault;
  let repository: import("../src/repository").GrowthRepository;

  beforeEach(async () => {
    vault = new FakeVault();
    const app = {
      vault,
      metadataCache: { getFileCache: () => null }
    } as unknown as App;
    const { GrowthRepository } = await import("../src/repository");
    repository = new GrowthRepository(app, () => ({ ...DEFAULT_SETTINGS }), () => undefined);
  });

  it("initializes the complete editable capability tree as Markdown", async () => {
    expect(await repository.isInitialized()).toBe(false);
    await repository.initialize();
    expect(await repository.isInitialized()).toBe(true);
    for (const folder of ["00 System", "00 System/Checkpoints", "01 Capabilities", "07 Inbox", "99 Archive"]) {
      expect(vault.folders.has(folder)).toBe(true);
    }

    const capabilities = await repository.loadCapabilities(true);
    expect(capabilities).toHaveLength(29);
    expect(capabilities.filter((item) => item.parentId === null).map((item) => item.name)).toEqual(["Work", "Fitness", "English", "Communication"]);
    const operation = capabilities.find((item) => item.name === "Operation");
    const physicalTrading = capabilities.find((item) => item.name === "Trading" && item.parentId !== capabilities.find((entry) => entry.name === "FFA")?.id);
    const ffa = capabilities.find((item) => item.name === "FFA");
    expect(capabilities.filter((item) => item.parentId === operation?.id)).toHaveLength(7);
    expect(capabilities.filter((item) => item.parentId === physicalTrading?.id)).toHaveLength(7);
    expect(capabilities.filter((item) => item.parentId === ffa?.id)).toHaveLength(7);
    expect(vault.files.has("00 System/README.md")).toBe(true);
  });

  it("can resume initialization without duplicating existing capabilities", async () => {
    await repository.initialize();
    vault.files.delete("00 System/README.md");
    repository.invalidate();
    expect(await repository.isInitialized()).toBe(false);
    await repository.initialize();
    expect(await repository.loadCapabilities(true)).toHaveLength(29);
    expect(await repository.isInitialized()).toBe(true);
  });

  it("creates portable content Markdown with safe defaults", async () => {
    await repository.initialize();
    const item = await repository.createContent({ type: "hypothesis", title: "A test", body: "Uncertainty creates value" });
    expect(item.id).toMatch(/^HYP-[A-Z2-9]{8}$/);
    expect(item.status).toBe("validating");
    expect(item.confidence).toBe("low");
    expect(item.file.path.startsWith("04 Hypotheses/")).toBe(true);
    const markdown = await vault.cachedRead(item.file);
    expect(markdown).toContain("# What Would Falsify It");
    expect(markdown).toContain("sourceType: \"personal-observation\"");
  });

  it("reads old content Markdown without additive v1.1 fields", async () => {
    await repository.initialize();
    const file = await vault.create("02 Knowledge/KNOW-OLD00001 Legacy.md", `---
gmType: "content"
id: "KNOW-OLD00001"
type: "knowledge"
title: "Legacy note"
capabilityIds: []
status: "validated"
confidence: "high"
sourceType: "personal-observation"
created: "2025-01-01T00:00:00.000Z"
updated: "2025-01-01T00:00:00.000Z"
---

Legacy body`);
    repository.invalidate();
    const item = await repository.loadContent("KNOW-OLD00001");
    expect(item?.file).toBe(file);
    expect(item?.body).toBe("Legacy body");
    expect(item?.attachments).toEqual([]);
  });

  it("records explicit Growth Events for content creation and stage changes", async () => {
    await repository.initialize();
    const optionality = (await repository.loadCapabilities()).find((item) => item.name === "Optionality");
    expect(optionality).toBeDefined();
    const item = await repository.createContent({
      type: "case",
      title: "A real case",
      body: "A decision and result",
      capabilityIds: [optionality!.id]
    });
    optionality!.stage = 3;
    await repository.updateCapability(optionality!);
    const events = await repository.loadGrowthEvents(null, new Date(Date.now() + 1000), true);
    expect(events.find((event) => event.eventType === "content-created" && event.contentId === item.id)?.capabilityIds).toEqual([optionality!.id]);
    expect(events.find((event) => event.eventType === "capability-stage-changed")).toMatchObject({
      capabilityIds: [optionality!.id],
      fromStage: 0,
      toStage: 3
    });
  });

  it("derives explainable connections and persists an optional pin note", async () => {
    await repository.initialize();
    const capabilities = await repository.loadCapabilities();
    const communication = capabilities.find((item) => item.name === "Communication");
    const optionality = capabilities.find((item) => item.name === "Optionality");
    expect(communication).toBeDefined();
    expect(optionality).toBeDefined();
    await repository.createContent({
      type: "lesson",
      title: "Shared lesson",
      body: "One experience links both capabilities",
      capabilityIds: [communication!.id, optionality!.id]
    });
    const derived = await repository.loadConnections(true);
    expect(derived).toHaveLength(1);
    expect(derived[0]).toMatchObject({ strength: 1, counts: { lesson: 1 }, pinned: false });
    await repository.pinConnection(communication!.id, optionality!.id, true, "Negotiation creates optionality");
    const pinned = await repository.loadConnections(true);
    expect(pinned[0]).toMatchObject({ pinned: true, note: "Negotiation creates optionality", strength: 1 });
    expect([...vault.files.keys()].some((path) => path.startsWith("00 System/Connections/CONN-"))).toBe(true);
  });

  it("stores optional attachment metadata and resolves Vault-relative path conflicts", async () => {
    await repository.initialize();
    const attachment = (name: string): File => ({
      name,
      type: "image/png",
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    } as File);
    const first = await repository.createContent({ type: "inbox", body: "First", attachmentFiles: [attachment("evidence.png")] });
    const second = await repository.createContent({ type: "inbox", body: "Second", attachmentFiles: [attachment("evidence.png")] });
    expect(first.attachments).toHaveLength(1);
    expect(first.attachments?.[0]).toMatchObject({ path: "08 Attachments/evidence.png", name: "evidence.png", mimeType: "image/png" });
    expect(second.attachments?.[0].path).not.toBe(first.attachments?.[0].path);
    expect(second.attachments?.[0].path.startsWith("08 Attachments/evidence-")).toBe(true);
    expect(await vault.cachedRead(first.file)).toContain('attachments: [{"path":"08 Attachments/evidence.png"');
  });
  it("materializes editor attachment blocks inline and removes references without deleting binaries", async () => {
    await repository.initialize();
    const file = {
      name: "inline evidence.png",
      type: "image/png",
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    } as File;
    const token = "pending-inline";
    const item = await repository.createContent({
      type: "inbox",
      body: `Before\n\n${pendingAttachmentMarker(token)}\n\nAfter`,
      pendingAttachments: [{ token, file }]
    });
    const attachmentPath = item.attachments?.[0].path;
    expect(attachmentPath).toBe("08 Attachments/inline evidence.png");
    expect(item.body).toBe("Before\n\n![[08 Attachments/inline evidence.png]]\n\nAfter");
    expect(await vault.cachedRead(item.file)).not.toContain(pendingAttachmentMarker(token));

    item.body = "Before\n\nAfter";
    item.attachments = [];
    await repository.updateContent(item);
    expect(vault.files.has(attachmentPath as string)).toBe(true);
    expect(await vault.cachedRead(item.file)).not.toContain("08 Attachments/inline evidence.png");
  });

  it("preserves Inbox text, attachments, and relations when organizing content", async () => {
    await repository.initialize();
    const optionality = (await repository.loadCapabilities()).find((item) => item.name === "Optionality");
    const file = {
      name: "decision.pdf",
      type: "application/pdf",
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer
    } as File;
    const token = "pending-convert";
    const inbox = await repository.createContent({
      type: "inbox",
      title: "Original capture",
      body: `Original text\n\n${pendingAttachmentMarker(token)}`,
      capabilityIds: [optionality!.id],
      pendingAttachments: [{ token, file }]
    });
    const originalCreated = inbox.created;
    const converted = await repository.convertInbox(inbox, "lesson");
    expect(converted.type).toBe("lesson");
    expect(converted.created).toBe(originalCreated);
    expect(converted.capabilityIds).toEqual([optionality!.id]);
    expect(converted.attachments).toHaveLength(1);
    expect(converted.body).toContain("Original text");
    expect(converted.body).toContain("![[08 Attachments/decision.pdf]]");
    expect(converted.body).toContain("# When It Applies");
    const events = await repository.loadGrowthEvents(null, new Date(Date.now() + 1000), true);
    expect(events.find((event) => event.eventType === "content-converted" && event.contentId === converted.id)).toMatchObject({
      capabilityIds: [optionality!.id],
      metadata: { fromType: "inbox", toType: "lesson" }
    });
  });
  it("protects references, checkpoints archive, and restores the tree", async () => {
    await repository.initialize();
    const capabilities = await repository.loadCapabilities();
    const optionality = capabilities.find((item) => item.name === "Optionality");
    const fitness = capabilities.find((item) => item.name === "Fitness");
    expect(optionality).toBeDefined();
    expect(fitness).toBeDefined();
    const note = await repository.createContent({
      type: "lesson",
      title: "Keep options open",
      body: "Preserve choices under uncertainty",
      capabilityIds: [optionality!.id]
    });
    expect(await repository.referencedContent(optionality!.id)).toHaveLength(1);

    await repository.archiveCapability(optionality!.id, fitness!.id);
    expect((await repository.loadCapabilities()).find((item) => item.id === optionality!.id)?.status).toBe("archived");
    expect((await repository.loadContent(note.id))?.capabilityIds).toEqual([fitness!.id]);
    expect(await repository.listCheckpoints()).toHaveLength(1);

    await repository.restoreLastCheckpoint();
    expect((await repository.loadCapabilities()).find((item) => item.id === optionality!.id)?.status).toBe("active");
    expect(await repository.listCheckpoints()).toHaveLength(2);
  });
});
