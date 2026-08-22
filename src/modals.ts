import { App, Modal, Notice, Setting } from "obsidian";
import { capabilityPath } from "./core";
import {
  CONFIDENCES,
  CONTENT_LABELS,
  CONTENT_STATUSES,
  SOURCE_TYPES,
  type Capability,
  type Confidence,
  type ContentStatus,
  type ContentType,
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

class TextPromptModal extends Modal {
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
    this.modalEl.addClass("gm-modal");
    this.contentEl.createEl("h2", { text: this.title });
    const input = this.contentEl.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder: this.placeholder } });
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
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
}

class ChoiceModal<T> extends Modal {
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
    this.modalEl.addClass("gm-modal", "gm-choice-modal");
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
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
}

export class QuickCaptureModal extends Modal {
  private selectedFiles: File[] = [];

  constructor(
    app: App,
    private readonly contextName: string | null,
    private readonly onSave: (title: string, content: string, files: File[]) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("gm-modal", "gm-capture-modal");
    this.contentEl.createEl("h2", { text: "Record something" });
    if (this.contextName) this.contentEl.createDiv({ text: `Linked to ${this.contextName}`, cls: "gm-context-pill" });
    const textarea = this.contentEl.createEl("textarea", {
      cls: "gm-capture-input",
      attr: { placeholder: "What's worth remembering?", rows: "8" }
    });
    const details = this.contentEl.createEl("details", { cls: "gm-optional-title" });
    details.createEl("summary", { text: "Add a title (optional)" });
    const title = details.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder: "Title" } });
    const attachmentInput = this.contentEl.createEl("input", {
      cls: "gm-file-input",
      attr: {
        type: "file",
        accept: ".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.txt,.md,image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown"
      }
    });
    attachmentInput.multiple = true;
    const attachmentRow = this.contentEl.createDiv("gm-capture-attachment-row");
    const addAttachment = attachmentRow.createEl("button", { text: "Add Attachment", cls: "gm-attachment-picker" });
    const attachmentSummary = attachmentRow.createSpan({ text: "Optional", cls: "gm-muted" });
    addAttachment.addEventListener("click", () => attachmentInput.click());
    attachmentInput.addEventListener("change", () => {
      this.selectedFiles = Array.from(attachmentInput.files ?? []);
      attachmentSummary.setText(this.selectedFiles.length
        ? `${this.selectedFiles.length} selected`
        : "Optional");
    });
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save to Inbox", cls: "mod-cta" });
    save.addEventListener("click", () => void this.submit(title.value, textarea.value, save));
    textarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void this.submit(title.value, textarea.value, save);
    });
    window.setTimeout(() => textarea.focus(), 50);
  }

  private async submit(title: string, content: string, button: HTMLButtonElement): Promise<void> {
    if (!content.trim()) {
      new Notice("Write something first");
      return;
    }
    button.disabled = true;
    try {
      await this.onSave(title.trim(), content.trim(), this.selectedFiles);
      this.close();
      new Notice("Saved to Growth Map Inbox");
    } catch (error) {
      button.disabled = false;
      new Notice(error instanceof Error ? error.message : "Could not save capture");
    }
  }

  onClose(): void {
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
}

export class ContentFormModal extends Modal {
  private selectedCapabilities: Set<string>;

  constructor(
    app: App,
    private readonly capabilities: Capability[],
    initialCapabilityIds: string[],
    private readonly initial?: Partial<ContentFormValue>,
    private readonly onSave?: (value: ContentFormValue) => Promise<void>
  ) {
    super(app);
    this.selectedCapabilities = new Set(initialCapabilityIds);
  }

  onOpen(): void {
    this.modalEl.addClass("gm-modal", "gm-content-form-modal");
    this.contentEl.createEl("h2", { text: this.initial?.body ? "Organize content" : "Add to library" });
    const form = this.contentEl.createDiv("gm-form");
    const type = this.selectField(form, "Type", ["knowledge", "case", "lesson", "hypothesis", "question"], this.initial?.type ?? "knowledge", (value) => CONTENT_LABELS[value as ContentType]);
    const title = this.inputField(form, "Title", "A clear, short title", this.initial?.title ?? "");
    const body = this.textareaField(form, "Content", "What do you want to keep?", this.initial?.body ?? "");
    const capabilitySection = form.createDiv("gm-form-field");
    capabilitySection.createEl("label", { text: "Capabilities" });
    const capabilityList = capabilitySection.createDiv("gm-capability-picker");
    for (const capability of this.capabilities.filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name))) {
      const label = capabilityList.createEl("label", { cls: "gm-check-row" });
      const checkbox = label.createEl("input", { attr: { type: "checkbox" } });
      checkbox.checked = this.selectedCapabilities.has(capability.id);
      checkbox.addEventListener("change", () => checkbox.checked ? this.selectedCapabilities.add(capability.id) : this.selectedCapabilities.delete(capability.id));
      label.createSpan({ text: capabilityPath(capability.id, this.capabilities).map((item) => item.name).join(" / ") });
    }
    const status = this.selectField(form, "Status", CONTENT_STATUSES.filter((item) => item !== "archived"), this.initial?.status ?? "draft");
    const confidence = this.selectField(form, "Confidence", CONFIDENCES, this.initial?.confidence ?? "low");
    const source = this.selectField(form, "Source type", SOURCE_TYPES, this.initial?.sourceType ?? "personal-observation");
    type.addEventListener("change", () => {
      if (type.value === "hypothesis") {
        status.value = "validating";
        confidence.value = "low";
      }
    });
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta" });
    save.addEventListener("click", () => void this.submit({
      type: type.value as Exclude<ContentType, "inbox">,
      title: title.value.trim(),
      body: body.value.trim(),
      capabilityIds: [...this.selectedCapabilities],
      status: status.value as ContentStatus,
      confidence: confidence.value as Confidence,
      sourceType: source.value as SourceType
    }, save));
  }

  private inputField(container: HTMLElement, labelText: string, placeholder: string, value: string): HTMLInputElement {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const input = field.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder } });
    input.value = value;
    return input;
  }

  private textareaField(container: HTMLElement, labelText: string, placeholder: string, value: string): HTMLTextAreaElement {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const input = field.createEl("textarea", { cls: "gm-capture-input", attr: { placeholder, rows: "7" } });
    input.value = value;
    return input;
  }

  private selectField<T extends string>(
    container: HTMLElement,
    labelText: string,
    values: readonly T[],
    selected: T,
    label: (value: T) => string = (value) => value
  ): HTMLSelectElement {
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
    if (!value.body && !value.title) {
      new Notice("Add a title or some content");
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
    this.contentEl.empty();
  }
}

export class ReferenceProtectionModal extends Modal {
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
    this.modalEl.addClass("gm-modal");
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
    this.contentEl.empty();
    if (!this.settled) this.onChoice(null);
  }
}

export class CheckpointListModal extends Modal {
  constructor(app: App, private readonly paths: string[]) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("gm-modal");
    this.contentEl.createEl("h2", { text: "Capability checkpoints" });
    if (this.paths.length === 0) this.contentEl.createEl("p", { text: "No checkpoints yet.", cls: "gm-muted" });
    const list = this.contentEl.createDiv("gm-checkpoint-list");
    for (const path of this.paths) list.createDiv({ text: path.split("/").pop()?.replace(".md", "") ?? path, cls: "gm-checkpoint-row" });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Done").setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
