import { beforeEach, describe, expect, it } from "vitest";
import { TFile as RuntimeTFile, type App, type TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../src/types";

class FakeVault {
  readonly files = new Map<string, { file: TFile; content: string }>();
  readonly folders = new Set<string>();

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  getAbstractFileByPath(path: string): TFile | { path: string } | null {
    return this.files.get(path)?.file ?? (this.folders.has(path) ? { path } : null);
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.values()].map((entry) => entry.file);
  }

  async create(path: string, content: string): Promise<TFile> {
    const FileConstructor = RuntimeTFile as unknown as new (filePath: string) => TFile;
    const file = new FileConstructor(path);
    this.files.set(path, { file, content });
    return file;
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.files.get(file.path)?.content ?? "";
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
