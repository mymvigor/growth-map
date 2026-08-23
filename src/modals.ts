import { App, Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import {
  fullCapabilityPath,
  initialRelatedCapabilityIds,
  parseContentBlocks,
  searchCapabilities,
  serializeContentBlocks,
  suggestedCapabilities,
  updateRecentCapabilityIds,
  type ContentEditorBlock
} from "./content-ux";
import { calculateModalViewport, observeModalViewport } from "./mobile-modal";
import {
  CONFIDENCES,
  CONTENT_LABELS,
  CONTENT_STATUSES,
  SOURCE_TYPES,
  type AttachmentRef,
  type Capability,
  type Confidence,
  type ContentStatus,
  type ContentType,
  type PendingAttachment,
  type SourceType
} from "./types";

export interface ChoiceOption<T> {
  label: string;
  value: T;
  description?: string;
  destructive?: boolean;
}

export function promptText(app: App, title: string, placeholder: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) => new TextPromptModal(app, title, placeholder, initial, resolve).open());
}

export function chooseOption<T>(app: App, title: string, options: ChoiceOption<T>[]): Promise<T | null> {
  return new Promise((resolve) => new ChoiceModal(app, title, options, resolve).open());
}

class GrowthModal extends Modal {
  private viewportCleanup: (() => void) | null = null;

  protected prepareModal(...classes: string[]): void {
    this.modalEl.addClass("gm-modal", ...classes);
    const viewport = window.visualViewport;
    const container = this.modalEl.closest(".modal-container") as HTMLElement | null;
    let viewportFrame: number | null = null;
    let focusFrame: number | null = null;
    let focusTimer: number | null = null;
    const isInput = (target: HTMLElement): boolean => target.matches("input, textarea, select, [contenteditable=true]");
    const revealInput = (target: HTMLElement): void => {
      if (focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
        focusFrame = null;
      }
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focusTimer = null;
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = null;
          const scrollRegion = (target.closest(".gm-modal-body") as HTMLElement | null) ?? this.contentEl;
          const regionRect = scrollRegion.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          if (targetRect.top >= regionRect.top + 12 && targetRect.bottom <= regionRect.bottom - 12) return;
          const regionCenter = regionRect.top + regionRect.height / 2;
          const targetCenter = targetRect.top + targetRect.height / 2;
          scrollRegion.scrollBy({ top: targetCenter - regionCenter, behavior: "smooth" });
        });
      }, 80);
    };
    const update = (): void => {
      viewportFrame = null;
      const metrics = calculateModalViewport(viewport, window.innerHeight);
      this.modalEl.style.setProperty("--gm-visible-height", `${metrics.visibleHeight}px`);
      this.modalEl.style.setProperty("--gm-modal-max-height", `${metrics.maxModalHeight}px`);
      this.modalEl.style.setProperty("--gm-visible-top", `${metrics.offsetTop}px`);
      if (container) {
        container.addClass("gm-modal-viewport");
        container.style.top = `${metrics.offsetTop}px`;
        container.style.height = `${metrics.visibleHeight}px`;
        container.style.bottom = "auto";
      }
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.contentEl.contains(active) && isInput(active)) revealInput(active);
    };
    const scheduleUpdate: EventListener = () => {
      if (viewportFrame !== null) return;
      viewportFrame = window.requestAnimationFrame(update);
    };
    const focus = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && isInput(target)) revealInput(target);
    };
    update();
    const stopObservingViewport = observeModalViewport(viewport, window, scheduleUpdate);
    this.contentEl.addEventListener("focusin", focus);
    this.viewportCleanup = () => {
      stopObservingViewport();
      this.contentEl.removeEventListener("focusin", focus);
      if (viewportFrame !== null) window.cancelAnimationFrame(viewportFrame);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      this.modalEl.style.removeProperty("--gm-visible-height");
      this.modalEl.style.removeProperty("--gm-modal-max-height");
      this.modalEl.style.removeProperty("--gm-visible-top");
      if (container) {
        container.removeClass("gm-modal-viewport");
        container.style.removeProperty("top");
        container.style.removeProperty("height");
        container.style.removeProperty("bottom");
      }
    };
  }

  protected finishModal(): void {
    this.viewportCleanup?.();
    this.viewportCleanup = null;
  }
}

class TextPromptModal extends GrowthModal {
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    private readonly placeholder: string,
    private readonly initial: string,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.prepareModal("gm-keyboard-actions-modal");
    const body = this.contentEl.createDiv("gm-modal-body");
    body.createEl("h2", { text: this.title });
    const input = body.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder: this.placeholder } });
    input.value = this.initial;
    const submit = (): void => {
      const value = input.value.trim();
      if (!value) return;
      this.settled = true;
      this.resolve(value);
      this.close();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta" });
    save.addEventListener("click", submit);
    window.setTimeout(() => input.focus(), 50);
  }

  onClose(): void {
    this.finishModal();
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
}

class ChoiceModal<T> extends GrowthModal {
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    private readonly options: ChoiceOption<T>[],
    private readonly resolve: (value: T | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.prepareModal("gm-choice-modal");
    this.contentEl.createEl("h2", { text: this.title });
    const list = this.contentEl.createDiv("gm-choice-list");
    for (const option of this.options) {
      const button = list.createEl("button", { cls: `gm-choice${option.destructive ? " is-destructive" : ""}` });
      button.createSpan({ text: option.label, cls: "gm-choice-label" });
      if (option.description) button.createSpan({ text: option.description, cls: "gm-choice-description" });
      button.addEventListener("click", () => {
        this.settled = true;
        this.resolve(option.value);
        this.close();
      });
    }
    this.contentEl.createEl("button", { text: "Cancel", cls: "gm-cancel-button" }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.finishModal();
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
}

class ContentComposer {
  private blocks: ContentEditorBlock[];
  private activeTextId: string | null = null;
  private selectionStart = 0;
  private selectionEnd = 0;
  private tokenCounter = 0;
  private previewUrls = new Map<string, string>();

  constructor(
    private readonly app: App,
    private readonly container: HTMLElement,
    body: string,
    attachments: AttachmentRef[]
  ) {
    this.blocks = parseContentBlocks(body, attachments);
    this.render();
  }

  value(): { body: string; attachments: AttachmentRef[]; pendingAttachments: PendingAttachment[] } {
    return {
      body: serializeContentBlocks(this.blocks),
      attachments: this.blocks.flatMap((block) => block.kind === "attachment" && block.attachment ? [block.attachment] : []),
      pendingAttachments: this.blocks.flatMap((block) => block.kind === "attachment" && block.pending ? [block.pending] : [])
    };
  }

  destroy(): void {
    for (const url of this.previewUrls.values()) URL.revokeObjectURL(url);
    this.previewUrls.clear();
  }

  private render(): void {
    this.container.empty();
    this.blocks.forEach((block, index) => {
      if (block.kind === "text") this.renderText(block, index);
      else this.renderAttachment(block, index);
    });
    const addRow = this.container.createDiv("gm-composer-add-row");
    this.fileButton(addRow, "Image", "image", ".jpg,.jpeg,.png,.webp,.gif,image/*");
    this.fileButton(addRow, "File", "file", ".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain,text/markdown");
  }

  private renderText(block: Extract<ContentEditorBlock, { kind: "text" }>, index: number): void {
    const textarea = this.container.createEl("textarea", {
      cls: "gm-composer-text",
      attr: {
        placeholder: index === 0 ? "What do you want to remember?" : "Continue writing…",
        rows: index === 0 ? "7" : "3",
        "data-gm-block-id": block.id
      }
    });
    textarea.value = block.value;
    const rememberSelection = (): void => {
      this.activeTextId = block.id;
      this.selectionStart = textarea.selectionStart;
      this.selectionEnd = textarea.selectionEnd;
    };
    textarea.addEventListener("focus", rememberSelection);
    textarea.addEventListener("select", rememberSelection);
    textarea.addEventListener("click", rememberSelection);
    textarea.addEventListener("input", () => {
      block.value = textarea.value;
      rememberSelection();
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(96, textarea.scrollHeight)}px`;
    });
    window.setTimeout(() => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(96, textarea.scrollHeight)}px`;
    }, 0);
  }

  private renderAttachment(block: Extract<ContentEditorBlock, { kind: "attachment" }>, index: number): void {
    const attachment = block.attachment;
    const pending = block.pending;
    const name = attachment?.name ?? pending?.file.name ?? "Attachment";
    const mimeType = attachment?.mimeType ?? pending?.file.type ?? "";
    const isImage = mimeType.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(name);
    const card = this.container.createDiv(`gm-composer-attachment${isImage ? " is-image" : ""}`);
    if (isImage) {
      const url = this.previewUrl(block);
      if (url) card.createEl("img", { attr: { src: url, alt: name } });
    } else {
      const icon = card.createSpan("gm-composer-file-icon");
      setIcon(icon, /\.pdf$/i.test(name) ? "file-text" : "file");
    }
    const text = card.createDiv("gm-composer-attachment-copy");
    text.createEl("strong", { text: name });
    const size = pending?.file.size ?? (attachment ? this.attachmentSize(attachment) : 0);
    text.createSpan({ text: `${this.fileKind(name)}${size ? ` · ${this.formatBytes(size)}` : ""}` });
    const remove = card.createEl("button", { cls: "gm-composer-remove", attr: { "aria-label": `Remove ${name} from content` } });
    setIcon(remove, "x");
    remove.addEventListener("click", () => {
      this.blocks.splice(index, 1);
      this.mergeTextBlocks();
      this.render();
    });
  }

  private fileButton(container: HTMLElement, label: string, kind: "image" | "file", accept: string): void {
    const input = container.createEl("input", { cls: "gm-file-input", attr: { type: "file", accept } });
    input.multiple = true;
    const button = container.createEl("button", { text: `+ ${label}`, cls: "gm-composer-add" });
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      if (files.length) this.insertFiles(files, kind);
      input.value = "";
    });
  }

  private insertFiles(files: File[], kind: "image" | "file"): void {
    const valid = files.filter((file) => kind === "image" ? /\.(jpe?g|png|webp|gif)$/i.test(file.name) : /\.(pdf|docx?|txt|md)$/i.test(file.name));
    if (!valid.length) {
      new Notice(kind === "image" ? "Choose an image file" : "Choose a PDF, Word, text, or Markdown file");
      return;
    }
    let index = this.blocks.findIndex((block) => block.kind === "text" && block.id === this.activeTextId);
    if (index < 0) index = this.blocks.map((block) => block.kind).lastIndexOf("text");
    if (index < 0) {
      this.blocks.push({ id: this.nextId("text"), kind: "text", value: "" });
      index = this.blocks.length - 1;
    }
    const text = this.blocks[index] as Extract<ContentEditorBlock, { kind: "text" }>;
    const start = this.activeTextId === text.id ? this.selectionStart : text.value.length;
    const end = this.activeTextId === text.id ? this.selectionEnd : text.value.length;
    const before = text.value.slice(0, start);
    const after = text.value.slice(end);
    const replacement: ContentEditorBlock[] = [
      { id: text.id, kind: "text", value: before ? `${before.replace(/\s*$/, "")}\n\n` : "" },
      ...valid.map((file) => ({ id: this.nextId("attachment"), kind: "attachment" as const, pending: { token: this.nextId("pending"), file } })),
      { id: this.nextId("text"), kind: "text", value: after ? `\n\n${after.replace(/^\s*/, "")}` : "\n\n" }
    ];
    this.blocks.splice(index, 1, ...replacement);
    this.activeTextId = replacement.at(-1)?.id ?? null;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.render();
    window.setTimeout(() => this.container.querySelector<HTMLTextAreaElement>(`[data-gm-block-id="${this.activeTextId ?? ""}"]`)?.focus(), 30);
  }

  private previewUrl(block: Extract<ContentEditorBlock, { kind: "attachment" }>): string | null {
    if (block.pending) {
      const existing = this.previewUrls.get(block.pending.token);
      if (existing) return existing;
      if (typeof URL.createObjectURL !== "function") return null;
      const url = URL.createObjectURL(block.pending.file);
      this.previewUrls.set(block.pending.token, url);
      return url;
    }
    const file = block.attachment ? this.app.vault.getAbstractFileByPath(block.attachment.path) : null;
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }

  private attachmentSize(attachment: AttachmentRef): number {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    return file instanceof TFile ? file.stat.size : 0;
  }

  private mergeTextBlocks(): void {
    for (let index = this.blocks.length - 2; index >= 0; index -= 1) {
      const left = this.blocks[index];
      const right = this.blocks[index + 1];
      if (left.kind === "text" && right.kind === "text") {
        left.value += right.value;
        this.blocks.splice(index + 1, 1);
      }
    }
    if (!this.blocks.some((block) => block.kind === "text")) this.blocks.push({ id: this.nextId("text"), kind: "text", value: "" });
  }

  private nextId(prefix: string): string {
    this.tokenCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.tokenCounter}`;
  }

  private fileKind(name: string): string {
    return name.split(".").pop()?.toLocaleUpperCase() || "FILE";
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

class CapabilityPickerModal extends GrowthModal {
  private expanded = new Set<string>();

  constructor(
    app: App,
    private readonly capabilities: Capability[],
    private readonly selectedIds: Set<string>,
    private readonly contextCapabilityId: string | undefined,
    private readonly recentCapabilityIds: string[],
    private readonly onPick: (capabilityId: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.prepareModal("gm-capability-picker-modal");
    this.contentEl.createEl("h2", { text: "Add related capability" });
    const search = this.contentEl.createEl("input", { cls: "gm-text-input gm-capability-search", attr: { type: "search", placeholder: "Search capabilities…" } });
    const results = this.contentEl.createDiv("gm-picker-content");
    const render = (): void => {
      results.empty();
      const query = search.value.trim();
      if (query) {
        this.pickerSection(results, "Results", searchCapabilities(this.capabilities, query, this.selectedIds).slice(0, 30));
        if (!results.childElementCount) results.createDiv({ text: "No matching capabilities", cls: "gm-picker-empty" });
        return;
      }
      this.pickerSection(results, "Suggested", suggestedCapabilities(this.capabilities, this.contextCapabilityId, this.selectedIds));
      this.pickerSection(results, "Focus", this.capabilities.filter((item) => item.status === "active" && item.focus && !this.selectedIds.has(item.id)).slice(0, 5));
      const recent = this.recentCapabilityIds.map((id) => this.capabilities.find((item) => item.id === id)).filter((item): item is Capability => Boolean(item && item.status === "active" && !this.selectedIds.has(item.id))).slice(0, 5);
      this.pickerSection(results, "Recent", recent);
      const browse = results.createEl("button", { text: this.expanded.size ? "Hide All" : "Browse All", cls: "gm-picker-browse" });
      browse.addEventListener("click", () => {
        if (this.expanded.size) this.expanded.clear();
        else for (const root of this.childrenOf(null)) this.expanded.add(root.id);
        render();
      });
      if (this.expanded.size) {
        const tree = results.createDiv("gm-picker-tree");
        for (const root of this.childrenOf(null)) this.renderTreeNode(tree, root, 0, render);
      }
    };
    search.addEventListener("input", render);
    render();
    window.setTimeout(() => search.focus(), 50);
  }

  private pickerSection(container: HTMLElement, title: string, capabilities: Capability[]): void {
    if (!capabilities.length) return;
    container.createEl("h3", { text: title });
    for (const capability of capabilities) this.capabilityButton(container, capability);
  }

  private capabilityButton(container: HTMLElement, capability: Capability, depth = 0): void {
    const button = container.createEl("button", { cls: "gm-picker-row" });
    button.style.setProperty("--gm-picker-depth", String(Math.min(depth, 4)));
    button.createEl("strong", { text: capability.name });
    button.createSpan({ text: fullCapabilityPath(capability.id, this.capabilities) });
    button.addEventListener("click", () => {
      this.onPick(capability.id);
      this.close();
    });
  }

  private renderTreeNode(container: HTMLElement, capability: Capability, depth: number, rerender: () => void): void {
    const children = this.childrenOf(capability.id);
    const row = container.createDiv("gm-picker-tree-row");
    row.style.setProperty("--gm-picker-depth", String(Math.min(depth, 4)));
    const toggle = row.createEl("button", { cls: "gm-picker-toggle", attr: { "aria-label": children.length ? "Expand or collapse" : "No children" } });
    if (children.length) setIcon(toggle, this.expanded.has(capability.id) ? "chevron-down" : "chevron-right");
    else toggle.disabled = true;
    toggle.addEventListener("click", () => {
      if (this.expanded.has(capability.id)) this.expanded.delete(capability.id);
      else this.expanded.add(capability.id);
      rerender();
    });
    this.capabilityButton(row, capability, depth);
    if (children.length && this.expanded.has(capability.id)) for (const child of children) this.renderTreeNode(container, child, depth + 1, rerender);
  }

  private childrenOf(parentId: string | null): Capability[] {
    return this.capabilities.filter((item) => item.status === "active" && item.parentId === parentId).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }

  onClose(): void {
    this.finishModal();
    this.contentEl.empty();
  }
}

export class QuickCaptureModal extends GrowthModal {
  private composer: ContentComposer | null = null;

  constructor(
    app: App,
    private readonly contextName: string | null,
    private readonly onSave: (title: string, content: string, pendingAttachments: PendingAttachment[]) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.prepareModal("gm-capture-modal", "gm-keyboard-actions-modal");
    const body = this.contentEl.createDiv("gm-modal-body");
    body.createEl("h2", { text: "Record something" });
    if (this.contextName) body.createDiv({ text: `Related to ${this.contextName}`, cls: "gm-context-pill" });
    const details = body.createEl("details", { cls: "gm-optional-title" });
    details.createEl("summary", { text: "Add a title (optional)" });
    const title = details.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder: "Title" } });
    const composerHost = body.createDiv("gm-composer");
    this.composer = new ContentComposer(this.app, composerHost, "", []);
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save to Inbox", cls: "mod-cta" });
    save.addEventListener("click", () => void this.submit(title.value, save));
    window.setTimeout(() => composerHost.querySelector<HTMLTextAreaElement>(".gm-composer-text")?.focus(), 50);
  }

  private async submit(title: string, button: HTMLButtonElement): Promise<void> {
    const value = this.composer?.value() ?? { body: "", pendingAttachments: [] };
    if (!value.body && !title.trim() && !value.pendingAttachments.length) {
      new Notice("Write something or add an attachment first");
      return;
    }
    button.disabled = true;
    try {
      await this.onSave(title.trim(), value.body, value.pendingAttachments);
      this.close();
      new Notice("Saved to Growth Map Inbox");
    } catch (error) {
      button.disabled = false;
      new Notice(error instanceof Error ? error.message : "Could not save capture");
    }
  }

  onClose(): void {
    this.composer?.destroy();
    this.finishModal();
    this.contentEl.empty();
  }
}

export interface ContentFormValue {
  type: Exclude<ContentType, "inbox">;
  title: string;
  body: string;
  capabilityIds: string[];
  status: ContentStatus;
  confidence: Confidence;
  sourceType: SourceType;
  attachments?: AttachmentRef[];
  pendingAttachments?: PendingAttachment[];
}

export class ContentFormModal extends GrowthModal {
  private selectedCapabilities: Set<string>;
  private composer: ContentComposer | null = null;

  constructor(
    app: App,
    private readonly capabilities: Capability[],
    initialCapabilityIds: string[],
    private readonly initial?: Partial<ContentFormValue>,
    private readonly onSave?: (value: ContentFormValue) => Promise<void>,
    private readonly contextCapabilityId?: string,
    private readonly recentCapabilityIds: string[] = [],
    private readonly onRecentCapabilities?: (ids: string[]) => Promise<void>,
    private readonly mode: "new" | "edit" | "organize" = initial?.body ? "edit" : "new"
  ) {
    super(app);
    this.selectedCapabilities = new Set(initialRelatedCapabilityIds(initialCapabilityIds, contextCapabilityId));
  }

  onOpen(): void {
    this.prepareModal("gm-content-form-modal", "gm-keyboard-actions-modal");
    const body = this.contentEl.createDiv("gm-modal-body");
    const initialType = this.initial?.type ?? "knowledge";
    const heading = body.createEl("h2", { text: this.modalTitle(initialType) });
    const form = body.createDiv("gm-form");
    const title = this.inputField(form, "Title", "A clear, short title", this.initial?.title ?? "");
    const contentField = form.createDiv("gm-form-field gm-content-field");
    contentField.createEl("label", { text: "Content" });
    const composerHost = contentField.createDiv("gm-composer");
    this.composer = new ContentComposer(this.app, composerHost, this.initial?.body ?? "", this.initial?.attachments ?? []);

    const related = form.createDiv("gm-related-section");
    related.createEl("label", { text: "Related to" });
    const relatedList = related.createDiv("gm-related-list");
    const renderRelated = (): void => {
      relatedList.empty();
      if (!this.selectedCapabilities.size) relatedList.createSpan({ text: "None yet", cls: "gm-related-empty" });
      for (const id of this.selectedCapabilities) {
        const capability = this.capabilities.find((item) => item.id === id);
        if (!capability) continue;
        const chip = relatedList.createDiv("gm-related-chip");
        chip.createSpan({ text: fullCapabilityPath(id, this.capabilities) });
        const remove = chip.createEl("button", { attr: { "aria-label": `Remove ${capability.name}` } });
        setIcon(remove, "x");
        remove.addEventListener("click", () => { this.selectedCapabilities.delete(id); renderRelated(); });
      }
      const add = relatedList.createEl("button", { text: "+ Add", cls: "gm-related-add" });
      add.addEventListener("click", () => new CapabilityPickerModal(
        this.app,
        this.capabilities,
        this.selectedCapabilities,
        this.contextCapabilityId,
        this.recentCapabilityIds,
        (id) => {
          this.selectedCapabilities.add(id);
          const recent = updateRecentCapabilityIds(this.recentCapabilityIds, [id]);
          void this.onRecentCapabilities?.(recent);
          renderRelated();
        }
      ).open());
    };
    renderRelated();

    const more = form.createEl("details", { cls: "gm-more-options" });
    more.createEl("summary", { text: "More options" });
    const options = more.createDiv("gm-more-options-grid");
    const type = this.selectField(options, "Type", ["knowledge", "case", "lesson", "hypothesis", "question"], initialType, (value) => CONTENT_LABELS[value as ContentType]);
    const status = this.selectField(options, "Status", CONTENT_STATUSES.filter((item) => item !== "archived"), this.initial?.status ?? "draft");
    const confidence = this.selectField(options, "Confidence", CONFIDENCES, this.initial?.confidence ?? "low");
    const source = this.selectField(options, "Source type", SOURCE_TYPES, this.initial?.sourceType ?? "personal-observation");
    type.addEventListener("change", () => {
      heading.setText(this.modalTitle(type.value as Exclude<ContentType, "inbox">));
      if (type.value === "hypothesis") {
        status.value = "validating";
        confidence.value = "low";
      }
    });
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta" });
    save.addEventListener("click", () => {
      const content = this.composer?.value() ?? { body: "", attachments: [], pendingAttachments: [] };
      void this.submit({
        type: type.value as Exclude<ContentType, "inbox">,
        title: title.value.trim(),
        body: content.body,
        capabilityIds: [...this.selectedCapabilities],
        status: status.value as ContentStatus,
        confidence: confidence.value as Confidence,
        sourceType: source.value as SourceType,
        attachments: content.attachments,
        pendingAttachments: content.pendingAttachments
      }, save);
    });
  }

  private modalTitle(type: Exclude<ContentType, "inbox">): string {
    if (this.mode === "organize") return "Organize Inbox";
    return `${this.mode === "new" ? "New" : "Edit"} ${CONTENT_LABELS[type]}`;
  }

  private inputField(container: HTMLElement, labelText: string, placeholder: string, value: string): HTMLInputElement {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const input = field.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder } });
    input.value = value;
    return input;
  }

  private selectField<T extends string>(container: HTMLElement, labelText: string, values: readonly T[], selected: T, label: (value: T) => string = (value) => value): HTMLSelectElement {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const select = field.createEl("select", { cls: "dropdown" });
    for (const value of values) {
      const option = select.createEl("option", { text: label(value), value });
      option.selected = value === selected;
    }
    return select;
  }

  private async submit(value: ContentFormValue, button: HTMLButtonElement): Promise<void> {
    if (!value.body && !value.title && !value.pendingAttachments?.length && !value.attachments?.length) {
      new Notice("Add a title, content, or attachment");
      return;
    }
    if (value.sourceType === "ai-generated") {
      value.confidence = "low";
      if (value.status === "validated") value.status = "validating";
    }
    button.disabled = true;
    try {
      await this.onSave?.(value);
      this.close();
      new Notice("Saved to library");
    } catch (error) {
      button.disabled = false;
      new Notice(error instanceof Error ? error.message : "Could not save content");
    }
  }

  onClose(): void {
    this.composer?.destroy();
    this.finishModal();
    this.contentEl.empty();
  }
}
export class ReferenceProtectionModal extends GrowthModal {
  private settled = false;

  constructor(
    app: App,
    private readonly capabilityName: string,
    private readonly referenceCount: number,
    private readonly onChoice: (choice: "archive" | "move" | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.prepareModal();
    this.contentEl.createEl("h2", { text: `Archive ${this.capabilityName}?` });
    this.contentEl.createEl("p", {
      text: this.referenceCount > 0
        ? `This branch is still referenced by ${this.referenceCount} content item${this.referenceCount === 1 ? "" : "s"}.`
        : "This capability will move to the archive. Its Markdown file will not be deleted."
    });
    const actions = this.contentEl.createDiv("gm-stack-actions");
    if (this.referenceCount > 0) this.action(actions, "Move references, then archive", "move");
    this.action(actions, "Archive only", "archive", true);
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
  }

  private action(container: HTMLElement, text: string, choice: "archive" | "move", destructive = false): void {
    const button = container.createEl("button", { text, cls: destructive ? "mod-warning" : "" });
    button.addEventListener("click", () => {
      this.settled = true;
      this.onChoice(choice);
      this.close();
    });
  }

  onClose(): void {
    this.finishModal();
    this.contentEl.empty();
    if (!this.settled) this.onChoice(null);
  }
}

export class CheckpointListModal extends GrowthModal {
  constructor(app: App, private readonly paths: string[]) {
    super(app);
  }

  onOpen(): void {
    this.prepareModal();
    this.contentEl.createEl("h2", { text: "Capability checkpoints" });
    if (this.paths.length === 0) this.contentEl.createEl("p", { text: "No checkpoints yet.", cls: "gm-muted" });
    const list = this.contentEl.createDiv("gm-checkpoint-list");
    for (const path of this.paths) list.createDiv({ text: path.split("/").pop()?.replace(".md", "") ?? path, cls: "gm-checkpoint-row" });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Done").setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.finishModal();
    this.contentEl.empty();
  }
}
