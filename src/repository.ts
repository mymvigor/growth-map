import { normalizePath, TFile, type App } from "obsidian";
import { descendantsOf, makeId, parseSimpleFrontmatter, sanitizeFileName } from "./core";
import type {
  Capability,
  Confidence,
  ContentItem,
  ContentStatus,
  ContentType,
  GrowthMapSettings,
  LoadedContent,
  SourceType
} from "./types";

export const FOLDERS = [
  "00 System",
  "00 System/Checkpoints",
  "01 Capabilities",
  "02 Knowledge",
  "03 Cases",
  "04 Hypotheses",
  "05 Lessons",
  "06 Questions",
  "07 Inbox",
  "99 Archive"
] as const;

const CONTENT_FOLDERS: Record<ContentType, string> = {
  knowledge: "02 Knowledge",
  case: "03 Cases",
  hypothesis: "04 Hypotheses",
  lesson: "05 Lessons",
  question: "06 Questions",
  inbox: "07 Inbox"
};

const CONTENT_PREFIXES: Record<ContentType, string> = {
  knowledge: "KNOW",
  case: "CASE",
  lesson: "LESSON",
  hypothesis: "HYP",
  question: "Q",
  inbox: "INBOX"
};

const MANAGED_CONTENT_FOLDERS = Object.values(CONTENT_FOLDERS);

function nowIso(): string {
  return new Date().toISOString();
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function yamlLine(key: string, value: string | number | boolean | null | string[]): string {
  return `${key}: ${value === null ? "null" : typeof value === "string" || Array.isArray(value) ? JSON.stringify(value) : String(value)}`;
}

function capabilityMarkdown(capability: Capability, existingBody?: string): string {
  const body = existingBody
    ? existingBody.replace(/^# .+$/m, `# ${capability.name}`).trim()
    : [`# ${capability.name}`, "", "> Managed by Growth Map. You can add notes below; keep the frontmatter fields intact."].join("\n");
  return [
    "---",
    yamlLine("gmType", "capability"),
    yamlLine("id", capability.id),
    yamlLine("name", capability.name),
    yamlLine("parentId", capability.parentId),
    yamlLine("stage", capability.stage),
    yamlLine("weight", capability.weight),
    yamlLine("order", capability.order),
    yamlLine("status", capability.status),
    yamlLine("focus", capability.focus),
    yamlLine("created", capability.created),
    yamlLine("updated", capability.updated),
    "---",
    "",
    body,
    ""
  ].join("\n");
}

function contentMarkdown(item: ContentItem): string {
  const lines = [
    "---",
    yamlLine("gmType", "content"),
    yamlLine("id", item.id),
    yamlLine("type", item.type),
    yamlLine("title", item.title),
    yamlLine("capabilityIds", item.capabilityIds),
    yamlLine("status", item.status),
    yamlLine("confidence", item.confidence),
    yamlLine("sourceType", item.sourceType),
    yamlLine("created", item.created),
    yamlLine("updated", item.updated)
  ];
  if (item.previousStatus) lines.push(yamlLine("previousStatus", item.previousStatus));
  if (item.demo) lines.push(yamlLine("demo", true));
  lines.push("---", "", item.body.trim(), "");
  return lines.join("\n");
}

function parseCapability(markdown: string): Capability | null {
  const { data } = parseSimpleFrontmatter(markdown);
  if (data.gmType !== "capability" || typeof data.id !== "string") return null;
  return {
    id: data.id,
    name: stringValue(data.name, "Untitled capability"),
    parentId: typeof data.parentId === "string" ? data.parentId : null,
    stage: Math.max(0, Math.min(5, numberValue(data.stage, 0))),
    weight: Math.max(0, numberValue(data.weight, 1)),
    order: numberValue(data.order, 0),
    status: data.status === "archived" ? "archived" : "active",
    focus: boolValue(data.focus),
    created: stringValue(data.created, nowIso()),
    updated: stringValue(data.updated, nowIso())
  };
}

function contentFromData(data: Record<string, unknown>, body: string, file: TFile): LoadedContent | null {
  if (data.gmType !== "content" || typeof data.id !== "string") return null;
  const allowedTypes: ContentType[] = ["knowledge", "case", "lesson", "hypothesis", "question", "inbox"];
  const type = allowedTypes.includes(data.type as ContentType) ? (data.type as ContentType) : "inbox";
  const allowedStatuses: ContentStatus[] = ["draft", "validating", "validated", "outdated", "archived"];
  const allowedConfidence: Confidence[] = ["low", "medium", "high"];
  const allowedSources: SourceType[] = ["personal-observation", "colleague", "professional-source", "primary-source", "ai-generated", "mixed"];
  return {
    id: data.id,
    type,
    title: stringValue(data.title),
    capabilityIds: stringArray(data.capabilityIds),
    status: allowedStatuses.includes(data.status as ContentStatus) ? (data.status as ContentStatus) : "draft",
    confidence: allowedConfidence.includes(data.confidence as Confidence) ? (data.confidence as Confidence) : "low",
    sourceType: allowedSources.includes(data.sourceType as SourceType) ? (data.sourceType as SourceType) : "personal-observation",
    created: stringValue(data.created, nowIso()),
    updated: stringValue(data.updated, nowIso()),
    previousStatus: allowedStatuses.includes(data.previousStatus as ContentStatus) ? (data.previousStatus as ContentStatus) : undefined,
    demo: boolValue(data.demo),
    body,
    file
  };
}

function parseContent(markdown: string, file: TFile): LoadedContent | null {
  const { data, body } = parseSimpleFrontmatter(markdown);
  return contentFromData(data, body, file);
}

export function templateFor(type: ContentType, seed = ""): string {
  const value = seed.trim();
  if (type === "inbox") return value;
  if (type === "knowledge") return value ? `# Knowledge\n\n${value}` : "# Knowledge\n\n";
  if (type === "case") {
    return `# Context\n\n${value}\n\n# Options\n\n# Decision / Action\n\n# Why\n\n# Outcome\n\n# Lesson\n\n# Open Questions\n`;
  }
  if (type === "lesson") {
    return `# Lesson\n\n${value}\n\n# When It Applies\n\n# Why\n\n# Supporting Cases\n\n# Exceptions\n\n# Revision History\n`;
  }
  if (type === "hypothesis") {
    return `# Hypothesis\n\n${value}\n\n# Why I Think This\n\n# Supporting Evidence\n\n# Contradicting Evidence\n\n# What Would Falsify It\n\n# Revision History\n`;
  }
  return value ? `# Question\n\n${value}` : "# Question\n\n";
}

function vaultReadme(): string {
  return `---\ngmType: "growth-map-system"\ninitialized: true\n---\n\n# Growth Map\n\nGrowth Map stores every capability, case, lesson, hypothesis, question, and inbox capture as ordinary Markdown inside this Vault. The plugin interface is the primary way to browse it, but your data remains readable without the plugin.\n\n## Recovery\n\nEnable Obsidian's core **File recovery** plugin. Recommended settings:\n\n- Snapshot interval: 5 minutes\n- Retention: 30 days\n\nGrowth Map checkpoints protect capability-tree structure. File Recovery protects the Markdown content itself.\n\n## iCloud\n\nIf this Vault is stored in iCloud Drive, Obsidian and iCloud handle device migration. Growth Map has no account, server, or cloud database.\n`;
}

function protocolMarkdown(): string {
  return `# Knowledge Protocol\n\n## Object types\n\n- **Knowledge** — stable principles, methods, and explanations.\n- **Case** — something that happened and what you did.\n- **Lesson** — a reusable conclusion drawn from experience.\n- **Hypothesis** — a claim still being tested.\n- **Question** — an unresolved question worth returning to.\n- **Inbox** — a fast, unprocessed capture.\n\n## Reliability\n\nConfidence is \`low\`, \`medium\`, or \`high\`. Status is \`draft\`, \`validating\`, \`validated\`, \`outdated\`, or \`archived\`. AI-generated material must start as low-confidence and validating, and requires human confirmation before entering the library.\n`;
}

const INITIAL_TREE = [
  { key: "work", name: "Work", parentKey: null },
  { key: "dry-bulk", name: "Dry Bulk Commercial", parentKey: "work" },
  { key: "operation", name: "Operation", parentKey: "dry-bulk" },
  { key: "operation-vessel", name: "Vessel", parentKey: "operation" },
  { key: "operation-cargo", name: "Cargo", parentKey: "operation" },
  { key: "operation-port", name: "Port", parentKey: "operation" },
  { key: "operation-bunker", name: "Bunker", parentKey: "operation" },
  { key: "operation-voyage", name: "Voyage", parentKey: "operation" },
  { key: "operation-charter-party", name: "Charter Party", parentKey: "operation" },
  { key: "operation-risk", name: "Operational Risk", parentKey: "operation" },
  { key: "physical-trading", name: "Trading", parentKey: "dry-bulk" },
  { key: "trading-cargo", name: "Cargo", parentKey: "physical-trading" },
  { key: "trading-tonnage", name: "Tonnage", parentKey: "physical-trading" },
  { key: "trading-positioning", name: "Positioning", parentKey: "physical-trading" },
  { key: "trading-voyage-economics", name: "Voyage Economics", parentKey: "physical-trading" },
  { key: "trading-optionality", name: "Optionality", parentKey: "physical-trading" },
  { key: "trading-negotiation", name: "Negotiation", parentKey: "physical-trading" },
  { key: "trading-risk-reward", name: "Risk / Reward", parentKey: "physical-trading" },
  { key: "ffa", name: "FFA", parentKey: "dry-bulk" },
  { key: "ffa-market-curve", name: "Market & Curve", parentKey: "ffa" },
  { key: "ffa-physical-exposure", name: "Physical Exposure", parentKey: "ffa" },
  { key: "ffa-hedging", name: "Hedging", parentKey: "ffa" },
  { key: "ffa-position-management", name: "Position Management", parentKey: "ffa" },
  { key: "ffa-basis-risk", name: "Basis Risk", parentKey: "ffa" },
  { key: "ffa-trading", name: "Trading", parentKey: "ffa" },
  { key: "ffa-options", name: "Options", parentKey: "ffa" },
  { key: "fitness", name: "Fitness", parentKey: null },
  { key: "english", name: "English", parentKey: null },
  { key: "communication", name: "Communication", parentKey: null }
] as const;

export class GrowthRepository {
  private capabilityCache: Capability[] | null = null;
  private contentCache: LoadedContent[] | null = null;
  private contentMetadataCache: LoadedContent[] | null = null;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => GrowthMapSettings,
    private readonly log: (message: string) => void
  ) {}

  invalidate(path?: string): void {
    if (!path || path.startsWith("01 Capabilities/")) this.capabilityCache = null;
    if (!path || MANAGED_CONTENT_FOLDERS.some((folder) => path.startsWith(`${folder}/`))) {
      this.contentCache = null;
      this.contentMetadataCache = null;
    }
  }

  isManagedPath(path: string): boolean {
    return path.startsWith("01 Capabilities/") || MANAGED_CONTENT_FOLDERS.some((folder) => path.startsWith(`${folder}/`));
  }

  async isInitialized(): Promise<boolean> {
    if (this.app.vault.getAbstractFileByPath("00 System/Growth Map Initialized.md") instanceof TFile) return true;
    const readme = this.app.vault.getAbstractFileByPath("00 System/README.md");
    if (!(readme instanceof TFile)) return false;
    const { data } = parseSimpleFrontmatter(await this.app.vault.cachedRead(readme));
    return data.gmType === "growth-map-system" && data.initialized === true;
  }

  async initialize(): Promise<void> {
    for (const folder of FOLDERS) await this.ensureFolder(folder);
    await this.createIfMissing("00 System/Knowledge Protocol.md", protocolMarkdown());
    if (await this.isInitialized()) return;

    const created = nowIso();
    const existingCapabilities = await this.loadCapabilities(true);
    const idsByKey = new Map<string, string>();
    const orderByParent = new Map<string | null, number>();
    for (const item of INITIAL_TREE) {
      const parentId = item.parentKey ? idsByKey.get(item.parentKey) ?? null : null;
      const existing = existingCapabilities.find((capability) => capability.name === item.name && capability.parentId === parentId);
      if (existing) {
        idsByKey.set(item.key, existing.id);
        orderByParent.set(parentId, Math.max(orderByParent.get(parentId) ?? 0, existing.order + 1));
        continue;
      }
      const order = orderByParent.get(parentId) ?? 0;
      const capability: Capability = {
        id: makeId("CAP"),
        name: item.name,
        parentId,
        stage: 0,
        weight: 1,
        order,
        status: "active",
        focus: false,
        created,
        updated: created
      };
      orderByParent.set(parentId, order + 1);
      idsByKey.set(item.key, capability.id);
      await this.writeCapability(capability);
    }
    await this.createIfMissing("00 System/README.md", vaultReadme());
    if (!(await this.isInitialized())) {
      await this.createIfMissing("00 System/Growth Map Initialized.md", "---\ngmType: \"growth-map-system\"\ninitialized: true\n---\n\n# Growth Map Initialized\n");
    }
    this.invalidate();
  }

  async loadCapabilities(force = false): Promise<Capability[]> {
    if (this.capabilityCache && !force) return this.capabilityCache.map((item) => ({ ...item }));
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("01 Capabilities/"));
    const capabilities: Capability[] = [];
    for (const file of files) {
      const capability = parseCapability(await this.app.vault.cachedRead(file));
      if (capability) capabilities.push(capability);
    }
    this.capabilityCache = capabilities;
    return capabilities.map((item) => ({ ...item }));
  }

  async createCapability(name: string, parentId: string | null): Promise<Capability> {
    const capabilities = await this.loadCapabilities();
    const timestamp = nowIso();
    const capability: Capability = {
      id: makeId("CAP"),
      name: name.trim() || "Untitled capability",
      parentId,
      stage: 0,
      weight: 1,
      order: capabilities.filter((item) => item.parentId === parentId && item.status === "active").length,
      status: "active",
      focus: false,
      created: timestamp,
      updated: timestamp
    };
    await this.writeCapability(capability);
    this.invalidate();
    return capability;
  }

  async updateCapability(capability: Capability, structural = false, label = "Update capability"): Promise<void> {
    if (structural && this.getSettings().checkpointBeforeChanges) await this.createCheckpoint(label);
    capability.updated = nowIso();
    await this.writeCapability(capability);
    this.invalidate();
  }

  async moveCapability(id: string, parentId: string | null): Promise<void> {
    const capabilities = await this.loadCapabilities();
    const capability = capabilities.find((item) => item.id === id);
    if (!capability) throw new Error("Capability not found");
    if (parentId === id || descendantsOf(id, capabilities).has(parentId ?? "")) throw new Error("A capability cannot be moved inside itself");
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before move");
    capability.parentId = parentId;
    capability.order = capabilities.filter((item) => item.parentId === parentId && item.status === "active").length;
    capability.updated = nowIso();
    await this.writeCapability(capability);
    this.invalidate();
  }

  async reorderCapability(id: string, direction: -1 | 1): Promise<void> {
    const capabilities = await this.loadCapabilities();
    const capability = capabilities.find((item) => item.id === id);
    if (!capability) return;
    const siblings = capabilities
      .filter((item) => item.parentId === capability.parentId && item.status === "active")
      .sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((item) => item.id === id);
    const swap = siblings[index + direction];
    if (!swap) return;
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before reorder");
    const previousOrder = capability.order;
    capability.order = swap.order;
    swap.order = previousOrder;
    capability.updated = nowIso();
    swap.updated = capability.updated;
    await this.writeCapability(capability);
    await this.writeCapability(swap);
    this.invalidate();
  }

  async splitCapability(id: string, childNames: string[]): Promise<void> {
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before split");
    for (const name of childNames.map((item) => item.trim()).filter(Boolean)) await this.createCapability(name, id);
  }

  async referencedContent(id: string): Promise<LoadedContent[]> {
    const capabilities = await this.loadCapabilities();
    const ids = descendantsOf(id, capabilities);
    ids.add(id);
    return (await this.loadContentMetadata()).filter((item) => item.status !== "archived" && item.capabilityIds.some((capabilityId) => ids.has(capabilityId)));
  }

  async archiveCapability(id: string, moveReferencesTo?: string): Promise<void> {
    const capabilities = await this.loadCapabilities();
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before archive");
    const ids = descendantsOf(id, capabilities);
    ids.add(id);
    if (moveReferencesTo) await this.moveReferences([...ids], moveReferencesTo);
    for (const capability of capabilities.filter((item) => ids.has(item.id))) {
      capability.status = "archived";
      capability.focus = false;
      capability.updated = nowIso();
      await this.writeCapability(capability);
    }
    this.invalidate();
  }

  async restoreCapability(id: string): Promise<void> {
    const capabilities = await this.loadCapabilities();
    const current = capabilities.find((item) => item.id === id);
    if (!current) return;
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before restore");
    const ids = descendantsOf(id, capabilities);
    ids.add(id);
    let parentId = current.parentId;
    while (parentId) {
      ids.add(parentId);
      parentId = capabilities.find((item) => item.id === parentId)?.parentId ?? null;
    }
    for (const capability of capabilities.filter((item) => ids.has(item.id))) {
      capability.status = "active";
      capability.updated = nowIso();
      await this.writeCapability(capability);
    }
    this.invalidate();
  }

  async mergeCapability(sourceId: string, targetId: string): Promise<void> {
    if (sourceId === targetId) return;
    const capabilities = await this.loadCapabilities();
    const source = capabilities.find((item) => item.id === sourceId);
    if (!source || descendantsOf(sourceId, capabilities).has(targetId)) throw new Error("Choose a target outside the source branch");
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before merge");
    await this.moveReferences([sourceId], targetId);
    for (const child of capabilities.filter((item) => item.parentId === sourceId)) {
      child.parentId = targetId;
      child.updated = nowIso();
      await this.writeCapability(child);
    }
    source.status = "archived";
    source.focus = false;
    source.updated = nowIso();
    await this.writeCapability(source);
    this.invalidate();
  }

  async createCheckpoint(label = "Manual checkpoint"): Promise<string> {
    await this.ensureFolder("00 System/Checkpoints");
    const capabilities = (await this.loadCapabilities()).map(({ id, name, parentId, stage, weight, order, status, focus }) => ({
      id,
      name,
      parentId,
      stage,
      weight,
      order,
      status,
      focus
    }));
    const timestamp = nowIso();
    const fileStamp = timestamp.replace(/[:.]/g, "-");
    let path = normalizePath(`00 System/Checkpoints/${fileStamp}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`00 System/Checkpoints/${fileStamp}-${suffix}.md`);
      suffix += 1;
    }
    const markdown = [
      "---",
      yamlLine("gmType", "capability-checkpoint"),
      yamlLine("created", timestamp),
      yamlLine("label", label),
      "---",
      "",
      `# Capability Checkpoint — ${label}`,
      "",
      "```json",
      JSON.stringify(capabilities, null, 2),
      "```",
      ""
    ].join("\n");
    await this.app.vault.create(path, markdown);
    this.log(`Created checkpoint ${path}`);
    return path;
  }

  async listCheckpoints(): Promise<TFile[]> {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith("00 System/Checkpoints/"))
      .sort((a, b) => b.path.localeCompare(a.path));
  }

  async restoreLastCheckpoint(): Promise<string | null> {
    const checkpoint = (await this.listCheckpoints())[0];
    if (!checkpoint) return null;
    const markdown = await this.app.vault.cachedRead(checkpoint);
    const match = markdown.match(/```json\s*([\s\S]*?)```/);
    if (!match) throw new Error("Checkpoint data is invalid");
    const snapshot = JSON.parse(match[1]) as Array<Omit<Capability, "created" | "updated">>;
    await this.createCheckpoint("Before checkpoint restore");
    const current = await this.loadCapabilities();
    const timestamp = nowIso();
    const snapshotIds = new Set(snapshot.map((item) => item.id));
    for (const item of snapshot) {
      const existing = current.find((capability) => capability.id === item.id);
      await this.writeCapability({ ...item, created: existing?.created ?? timestamp, updated: timestamp });
    }
    for (const extra of current.filter((item) => !snapshotIds.has(item.id))) {
      extra.status = "archived";
      extra.focus = false;
      extra.updated = timestamp;
      await this.writeCapability(extra);
    }
    this.invalidate();
    return checkpoint.path;
  }

  async loadContents(force = false): Promise<LoadedContent[]> {
    if (this.contentCache && !force) return this.contentCache.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => MANAGED_CONTENT_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)));
    const contents: LoadedContent[] = [];
    for (const file of files) {
      const item = parseContent(await this.app.vault.cachedRead(file), file);
      if (item) contents.push(item);
    }
    this.contentCache = contents;
    return contents.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
  }

  async loadContentMetadata(force = false): Promise<LoadedContent[]> {
    if (this.contentMetadataCache && !force) return this.contentMetadataCache.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => MANAGED_CONTENT_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)));
    const contents: LoadedContent[] = [];
    for (const file of files) {
      const cached = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const item = cached
        ? contentFromData(cached as Record<string, unknown>, "", file)
        : parseContent(await this.app.vault.cachedRead(file), file);
      if (item) contents.push(item);
    }
    this.contentMetadataCache = contents;
    return contents.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
  }

  async loadContent(id: string): Promise<LoadedContent | null> {
    const metadata = (await this.loadContentMetadata()).find((item) => item.id === id);
    if (metadata) return parseContent(await this.app.vault.cachedRead(metadata.file), metadata.file);
    for (const file of this.app.vault.getMarkdownFiles().filter((candidate) => MANAGED_CONTENT_FOLDERS.some((folder) => candidate.path.startsWith(`${folder}/`)))) {
      const item = parseContent(await this.app.vault.cachedRead(file), file);
      if (item?.id === id) return item;
    }
    return null;
  }

  async createContent(input: {
    type: ContentType;
    title?: string;
    body: string;
    capabilityIds?: string[];
    confidence?: Confidence;
    status?: ContentStatus;
    sourceType?: SourceType;
  }): Promise<LoadedContent> {
    await this.ensureFolder(CONTENT_FOLDERS[input.type]);
    const timestamp = nowIso();
    const title = input.title?.trim() ?? "";
    const item: ContentItem = {
      id: makeId(CONTENT_PREFIXES[input.type]),
      type: input.type,
      title,
      body: input.type === "inbox" ? input.body.trim() : templateFor(input.type, input.body),
      capabilityIds: [...new Set(input.capabilityIds ?? [])],
      status: input.status ?? (input.type === "hypothesis" ? "validating" : "draft"),
      confidence: input.confidence ?? "low",
      sourceType: input.sourceType ?? "personal-observation",
      created: timestamp,
      updated: timestamp
    };
    const file = await this.app.vault.create(this.contentPath(item), contentMarkdown(item));
    this.invalidate(file.path);
    return { ...item, file };
  }

  async updateContent(item: LoadedContent): Promise<LoadedContent> {
    item.updated = nowIso();
    const targetPath = this.contentPath(item);
    if (item.file.path !== targetPath) {
      const existing = this.app.vault.getAbstractFileByPath(targetPath);
      if (existing) throw new Error("A file with the target name already exists");
      await this.app.vault.rename(item.file, targetPath);
    }
    await this.app.vault.modify(item.file, contentMarkdown(item));
    this.invalidate();
    return item;
  }

  async convertInbox(item: LoadedContent, type: Exclude<ContentType, "inbox">): Promise<LoadedContent> {
    if (item.type !== "inbox") return item;
    item.type = type;
    item.id = makeId(CONTENT_PREFIXES[type]);
    item.status = type === "hypothesis" ? "validating" : "draft";
    item.body = templateFor(type, item.body);
    return this.updateContent(item);
  }

  async archiveContent(item: LoadedContent): Promise<void> {
    item.previousStatus = item.status;
    item.status = "archived";
    await this.updateContent(item);
  }

  async restoreContent(item: LoadedContent): Promise<void> {
    item.status = item.previousStatus && item.previousStatus !== "archived" ? item.previousStatus : "draft";
    item.previousStatus = undefined;
    await this.updateContent(item);
  }

  private async moveReferences(sourceIds: string[], targetId: string): Promise<void> {
    const sourceSet = new Set(sourceIds);
    for (const item of await this.loadContents()) {
      if (!item.capabilityIds.some((id) => sourceSet.has(id))) continue;
      item.capabilityIds = [...new Set([...item.capabilityIds.filter((id) => !sourceSet.has(id)), targetId])];
      await this.updateContent(item);
    }
  }

  private contentPath(item: ContentItem): string {
    const label = item.title || item.body.split("\n").find((line) => line.trim() && !line.startsWith("#")) || "Untitled";
    return normalizePath(`${CONTENT_FOLDERS[item.type]}/${item.id} ${sanitizeFileName(label)}.md`);
  }

  private async writeCapability(capability: Capability): Promise<void> {
    await this.ensureFolder("01 Capabilities");
    const path = normalizePath(`01 Capabilities/${capability.id}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const { body } = parseSimpleFrontmatter(await this.app.vault.cachedRead(existing));
      await this.app.vault.modify(existing, capabilityMarkdown(capability, body));
    }
    else await this.app.vault.create(path, capabilityMarkdown(capability));
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalized)) return;
    await this.app.vault.createFolder(normalized);
  }

  private async createIfMissing(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) await this.app.vault.create(normalized, content);
  }
}
