/* Growth Map - Markdown-first Obsidian plugin */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GrowthMapPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/modals.ts
var import_obsidian = require("obsidian");

// src/core.ts
function stageProgress(stage) {
  return Math.max(0, Math.min(5, Math.round(stage))) * 20;
}
function progressFor(capabilityId, capabilities) {
  var _a;
  const active = capabilities.filter((capability) => capability.status === "active");
  const byParent = /* @__PURE__ */ new Map();
  for (const capability of active) {
    const siblings = (_a = byParent.get(capability.parentId)) != null ? _a : [];
    siblings.push(capability);
    byParent.set(capability.parentId, siblings);
  }
  const leaves = [];
  const collectLeaves = (id) => {
    var _a2;
    const children = (_a2 = byParent.get(id)) != null ? _a2 : [];
    if (id !== null && children.length === 0) {
      const current = active.find((capability) => capability.id === id);
      if (current) leaves.push(current);
      return;
    }
    for (const child of children) collectLeaves(child.id);
  };
  collectLeaves(capabilityId);
  if (leaves.length === 0 && capabilityId !== null) {
    const capability = active.find((item) => item.id === capabilityId);
    return capability ? stageProgress(capability.stage) : 0;
  }
  const weightTotal = leaves.reduce((sum, leaf) => sum + Math.max(0, leaf.weight), 0);
  if (weightTotal === 0) return 0;
  return Math.round(leaves.reduce((sum, leaf) => sum + stageProgress(leaf.stage) * Math.max(0, leaf.weight), 0) / weightTotal);
}
function descendantsOf(capabilityId, capabilities) {
  const result = /* @__PURE__ */ new Set();
  const visit = (parentId) => {
    for (const child of capabilities.filter((item) => item.parentId === parentId)) {
      if (!result.has(child.id)) {
        result.add(child.id);
        visit(child.id);
      }
    }
  };
  visit(capabilityId);
  return result;
}
function capabilityPath(capabilityId, capabilities) {
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
  const path = [];
  const visited = /* @__PURE__ */ new Set();
  let current = byId.get(capabilityId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : void 0;
  }
  return path;
}
function sanitizeFileName(value) {
  const cleaned = value.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Untitled").slice(0, 80);
}
function makeId(prefix, random = Math.random) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 8; index += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${prefix}-${suffix}`;
}
function parseSimpleFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return { data: {}, body: markdown };
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: markdown };
  const raw = markdown.slice(4, end);
  const data = {};
  for (const line of raw.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (value === "null") data[key] = null;
    else if (value === "true" || value === "false") data[key] = value === "true";
    else if (/^-?\d+(\.\d+)?$/.test(value)) data[key] = Number(value);
    else {
      try {
        data[key] = JSON.parse(value);
      } catch (e) {
        data[key] = value;
      }
    }
  }
  return { data, body: markdown.slice(end + 5).replace(/^\n/, "") };
}
function relativeTime(iso, now = Date.now()) {
  const delta = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(delta / 6e4);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// src/types.ts
var DEFAULT_SETTINGS = {
  archiveInsteadOfDelete: true,
  checkpointBeforeChanges: true,
  aiEnabled: false,
  aiProvider: "none",
  debug: false
};
var STAGE_LABELS = [
  "Not started",
  "Initial exposure",
  "Can understand and explain",
  "Practiced / has cases",
  "Can apply independently",
  "Stable, reviewable capability"
];
var CONTENT_LABELS = {
  knowledge: "Knowledge",
  case: "Case",
  lesson: "Lesson",
  hypothesis: "Hypothesis",
  question: "Question",
  inbox: "Inbox"
};
var CONTENT_STATUSES = ["draft", "validating", "validated", "outdated", "archived"];
var CONFIDENCES = ["low", "medium", "high"];
var SOURCE_TYPES = [
  "personal-observation",
  "colleague",
  "professional-source",
  "primary-source",
  "ai-generated",
  "mixed"
];

// src/modals.ts
function promptText(app, title, placeholder, initial = "") {
  return new Promise((resolve) => new TextPromptModal(app, title, placeholder, initial, resolve).open());
}
function chooseOption(app, title, options) {
  return new Promise((resolve) => new ChoiceModal(app, title, options, resolve).open());
}
var TextPromptModal = class extends import_obsidian.Modal {
  constructor(app, title, placeholder, initial, resolve) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.initial = initial;
    this.resolve = resolve;
    this.settled = false;
  }
  onOpen() {
    this.modalEl.addClass("gm-modal");
    this.contentEl.createEl("h2", { text: this.title });
    const input = this.contentEl.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder: this.placeholder } });
    input.value = this.initial;
    const submit = () => {
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
  onClose() {
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
};
var ChoiceModal = class extends import_obsidian.Modal {
  constructor(app, title, options, resolve) {
    super(app);
    this.title = title;
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
  }
  onOpen() {
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
  onClose() {
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
};
var QuickCaptureModal = class extends import_obsidian.Modal {
  constructor(app, contextName, onSave) {
    super(app);
    this.contextName = contextName;
    this.onSave = onSave;
  }
  onOpen() {
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
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save to Inbox", cls: "mod-cta" });
    save.addEventListener("click", () => void this.submit(title.value, textarea.value, save));
    textarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void this.submit(title.value, textarea.value, save);
    });
    window.setTimeout(() => textarea.focus(), 50);
  }
  async submit(title, content, button) {
    if (!content.trim()) {
      new import_obsidian.Notice("Write something first");
      return;
    }
    button.disabled = true;
    try {
      await this.onSave(title.trim(), content.trim());
      this.close();
      new import_obsidian.Notice("Saved to Growth Map Inbox");
    } catch (error) {
      button.disabled = false;
      new import_obsidian.Notice(error instanceof Error ? error.message : "Could not save capture");
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ContentFormModal = class extends import_obsidian.Modal {
  constructor(app, capabilities, initialCapabilityIds, initial, onSave) {
    super(app);
    this.capabilities = capabilities;
    this.initial = initial;
    this.onSave = onSave;
    this.selectedCapabilities = new Set(initialCapabilityIds);
  }
  onOpen() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    this.modalEl.addClass("gm-modal", "gm-content-form-modal");
    this.contentEl.createEl("h2", { text: ((_a = this.initial) == null ? void 0 : _a.body) ? "Organize content" : "Add to library" });
    const form = this.contentEl.createDiv("gm-form");
    const type = this.selectField(form, "Type", ["knowledge", "case", "lesson", "hypothesis", "question"], (_c = (_b = this.initial) == null ? void 0 : _b.type) != null ? _c : "knowledge", (value) => CONTENT_LABELS[value]);
    const title = this.inputField(form, "Title", "A clear, short title", (_e = (_d = this.initial) == null ? void 0 : _d.title) != null ? _e : "");
    const body = this.textareaField(form, "Content", "What do you want to keep?", (_g = (_f = this.initial) == null ? void 0 : _f.body) != null ? _g : "");
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
    const status = this.selectField(form, "Status", CONTENT_STATUSES.filter((item) => item !== "archived"), (_i = (_h = this.initial) == null ? void 0 : _h.status) != null ? _i : "draft");
    const confidence = this.selectField(form, "Confidence", CONFIDENCES, (_k = (_j = this.initial) == null ? void 0 : _j.confidence) != null ? _k : "low");
    const source = this.selectField(form, "Source type", SOURCE_TYPES, (_m = (_l = this.initial) == null ? void 0 : _l.sourceType) != null ? _m : "personal-observation");
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
      type: type.value,
      title: title.value.trim(),
      body: body.value.trim(),
      capabilityIds: [...this.selectedCapabilities],
      status: status.value,
      confidence: confidence.value,
      sourceType: source.value
    }, save));
  }
  inputField(container, labelText, placeholder, value) {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const input = field.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder } });
    input.value = value;
    return input;
  }
  textareaField(container, labelText, placeholder, value) {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const input = field.createEl("textarea", { cls: "gm-capture-input", attr: { placeholder, rows: "7" } });
    input.value = value;
    return input;
  }
  selectField(container, labelText, values, selected, label = (value) => value) {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const select = field.createEl("select", { cls: "dropdown" });
    for (const value of values) {
      const option = select.createEl("option", { text: label(value), value });
      option.selected = value === selected;
    }
    return select;
  }
  async submit(value, button) {
    var _a;
    if (!value.body && !value.title) {
      new import_obsidian.Notice("Add a title or some content");
      return;
    }
    if (value.sourceType === "ai-generated") {
      value.confidence = "low";
      if (value.status === "validated") value.status = "validating";
    }
    button.disabled = true;
    try {
      await ((_a = this.onSave) == null ? void 0 : _a.call(this, value));
      this.close();
      new import_obsidian.Notice("Saved to library");
    } catch (error) {
      button.disabled = false;
      new import_obsidian.Notice(error instanceof Error ? error.message : "Could not save content");
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ReferenceProtectionModal = class extends import_obsidian.Modal {
  constructor(app, capabilityName, referenceCount, onChoice) {
    super(app);
    this.capabilityName = capabilityName;
    this.referenceCount = referenceCount;
    this.onChoice = onChoice;
    this.settled = false;
  }
  onOpen() {
    this.modalEl.addClass("gm-modal");
    this.contentEl.createEl("h2", { text: `Archive ${this.capabilityName}?` });
    this.contentEl.createEl("p", {
      text: this.referenceCount > 0 ? `This branch is still referenced by ${this.referenceCount} content item${this.referenceCount === 1 ? "" : "s"}.` : "This capability will move to the archive. Its Markdown file will not be deleted."
    });
    const actions = this.contentEl.createDiv("gm-stack-actions");
    if (this.referenceCount > 0) this.action(actions, "Move references, then archive", "move");
    this.action(actions, "Archive only", "archive", true);
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
  }
  action(container, text, choice, destructive = false) {
    const button = container.createEl("button", { text, cls: destructive ? "mod-warning" : "" });
    button.addEventListener("click", () => {
      this.settled = true;
      this.onChoice(choice);
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) this.onChoice(null);
  }
};
var CheckpointListModal = class extends import_obsidian.Modal {
  constructor(app, paths) {
    super(app);
    this.paths = paths;
  }
  onOpen() {
    var _a, _b;
    this.modalEl.addClass("gm-modal");
    this.contentEl.createEl("h2", { text: "Capability checkpoints" });
    if (this.paths.length === 0) this.contentEl.createEl("p", { text: "No checkpoints yet.", cls: "gm-muted" });
    const list = this.contentEl.createDiv("gm-checkpoint-list");
    for (const path of this.paths) list.createDiv({ text: (_b = (_a = path.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) != null ? _b : path, cls: "gm-checkpoint-row" });
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText("Done").setCta().onClick(() => this.close()));
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/repository.ts
var import_obsidian2 = require("obsidian");
var FOLDERS = [
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
];
var CONTENT_FOLDERS = {
  knowledge: "02 Knowledge",
  case: "03 Cases",
  hypothesis: "04 Hypotheses",
  lesson: "05 Lessons",
  question: "06 Questions",
  inbox: "07 Inbox"
};
var CONTENT_PREFIXES = {
  knowledge: "KNOW",
  case: "CASE",
  lesson: "LESSON",
  hypothesis: "HYP",
  question: "Q",
  inbox: "INBOX"
};
var MANAGED_CONTENT_FOLDERS = Object.values(CONTENT_FOLDERS);
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function stringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function numberValue(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function boolValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function yamlLine(key, value) {
  return `${key}: ${value === null ? "null" : typeof value === "string" || Array.isArray(value) ? JSON.stringify(value) : String(value)}`;
}
function capabilityMarkdown(capability, existingBody) {
  const body = existingBody ? existingBody.replace(/^# .+$/m, `# ${capability.name}`).trim() : [`# ${capability.name}`, "", "> Managed by Growth Map. You can add notes below; keep the frontmatter fields intact."].join("\n");
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
function contentMarkdown(item) {
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
function parseCapability(markdown) {
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
function contentFromData(data, body, file) {
  if (data.gmType !== "content" || typeof data.id !== "string") return null;
  const allowedTypes = ["knowledge", "case", "lesson", "hypothesis", "question", "inbox"];
  const type = allowedTypes.includes(data.type) ? data.type : "inbox";
  const allowedStatuses = ["draft", "validating", "validated", "outdated", "archived"];
  const allowedConfidence = ["low", "medium", "high"];
  const allowedSources = ["personal-observation", "colleague", "professional-source", "primary-source", "ai-generated", "mixed"];
  return {
    id: data.id,
    type,
    title: stringValue(data.title),
    capabilityIds: stringArray(data.capabilityIds),
    status: allowedStatuses.includes(data.status) ? data.status : "draft",
    confidence: allowedConfidence.includes(data.confidence) ? data.confidence : "low",
    sourceType: allowedSources.includes(data.sourceType) ? data.sourceType : "personal-observation",
    created: stringValue(data.created, nowIso()),
    updated: stringValue(data.updated, nowIso()),
    previousStatus: allowedStatuses.includes(data.previousStatus) ? data.previousStatus : void 0,
    demo: boolValue(data.demo),
    body,
    file
  };
}
function parseContent(markdown, file) {
  const { data, body } = parseSimpleFrontmatter(markdown);
  return contentFromData(data, body, file);
}
function templateFor(type, seed = "") {
  const value = seed.trim();
  if (type === "inbox") return value;
  if (type === "knowledge") return value ? `# Knowledge

${value}` : "# Knowledge\n\n";
  if (type === "case") {
    return `# Context

${value}

# Options

# Decision / Action

# Why

# Outcome

# Lesson

# Open Questions
`;
  }
  if (type === "lesson") {
    return `# Lesson

${value}

# When It Applies

# Why

# Supporting Cases

# Exceptions

# Revision History
`;
  }
  if (type === "hypothesis") {
    return `# Hypothesis

${value}

# Why I Think This

# Supporting Evidence

# Contradicting Evidence

# What Would Falsify It

# Revision History
`;
  }
  return value ? `# Question

${value}` : "# Question\n\n";
}
function vaultReadme() {
  return `---
gmType: "growth-map-system"
initialized: true
---

# Growth Map

Growth Map stores every capability, case, lesson, hypothesis, question, and inbox capture as ordinary Markdown inside this Vault. The plugin interface is the primary way to browse it, but your data remains readable without the plugin.

## Recovery

Enable Obsidian's core **File recovery** plugin. Recommended settings:

- Snapshot interval: 5 minutes
- Retention: 30 days

Growth Map checkpoints protect capability-tree structure. File Recovery protects the Markdown content itself.

## iCloud

If this Vault is stored in iCloud Drive, Obsidian and iCloud handle device migration. Growth Map has no account, server, or cloud database.
`;
}
function protocolMarkdown() {
  return `# Knowledge Protocol

## Object types

- **Knowledge** \u2014 stable principles, methods, and explanations.
- **Case** \u2014 something that happened and what you did.
- **Lesson** \u2014 a reusable conclusion drawn from experience.
- **Hypothesis** \u2014 a claim still being tested.
- **Question** \u2014 an unresolved question worth returning to.
- **Inbox** \u2014 a fast, unprocessed capture.

## Reliability

Confidence is \`low\`, \`medium\`, or \`high\`. Status is \`draft\`, \`validating\`, \`validated\`, \`outdated\`, or \`archived\`. AI-generated material must start as low-confidence and validating, and requires human confirmation before entering the library.
`;
}
var INITIAL_TREE = [
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
];
var GrowthRepository = class {
  constructor(app, getSettings, log) {
    this.app = app;
    this.getSettings = getSettings;
    this.log = log;
    this.capabilityCache = null;
    this.contentCache = null;
    this.contentMetadataCache = null;
  }
  invalidate(path) {
    if (!path || path.startsWith("01 Capabilities/")) this.capabilityCache = null;
    if (!path || MANAGED_CONTENT_FOLDERS.some((folder) => path.startsWith(`${folder}/`))) {
      this.contentCache = null;
      this.contentMetadataCache = null;
    }
  }
  isManagedPath(path) {
    return path.startsWith("01 Capabilities/") || MANAGED_CONTENT_FOLDERS.some((folder) => path.startsWith(`${folder}/`));
  }
  async isInitialized() {
    if (this.app.vault.getAbstractFileByPath("00 System/Growth Map Initialized.md") instanceof import_obsidian2.TFile) return true;
    const readme = this.app.vault.getAbstractFileByPath("00 System/README.md");
    if (!(readme instanceof import_obsidian2.TFile)) return false;
    const { data } = parseSimpleFrontmatter(await this.app.vault.cachedRead(readme));
    return data.gmType === "growth-map-system" && data.initialized === true;
  }
  async initialize() {
    var _a, _b, _c;
    for (const folder of FOLDERS) await this.ensureFolder(folder);
    await this.createIfMissing("00 System/Knowledge Protocol.md", protocolMarkdown());
    if (await this.isInitialized()) return;
    const created = nowIso();
    const existingCapabilities = await this.loadCapabilities(true);
    const idsByKey = /* @__PURE__ */ new Map();
    const orderByParent = /* @__PURE__ */ new Map();
    for (const item of INITIAL_TREE) {
      const parentId = item.parentKey ? (_a = idsByKey.get(item.parentKey)) != null ? _a : null : null;
      const existing = existingCapabilities.find((capability2) => capability2.name === item.name && capability2.parentId === parentId);
      if (existing) {
        idsByKey.set(item.key, existing.id);
        orderByParent.set(parentId, Math.max((_b = orderByParent.get(parentId)) != null ? _b : 0, existing.order + 1));
        continue;
      }
      const order = (_c = orderByParent.get(parentId)) != null ? _c : 0;
      const capability = {
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
    if (!await this.isInitialized()) {
      await this.createIfMissing("00 System/Growth Map Initialized.md", '---\ngmType: "growth-map-system"\ninitialized: true\n---\n\n# Growth Map Initialized\n');
    }
    this.invalidate();
  }
  async loadCapabilities(force = false) {
    if (this.capabilityCache && !force) return this.capabilityCache.map((item) => ({ ...item }));
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("01 Capabilities/"));
    const capabilities = [];
    for (const file of files) {
      const capability = parseCapability(await this.app.vault.cachedRead(file));
      if (capability) capabilities.push(capability);
    }
    this.capabilityCache = capabilities;
    return capabilities.map((item) => ({ ...item }));
  }
  async createCapability(name, parentId) {
    const capabilities = await this.loadCapabilities();
    const timestamp = nowIso();
    const capability = {
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
  async updateCapability(capability, structural = false, label = "Update capability") {
    if (structural && this.getSettings().checkpointBeforeChanges) await this.createCheckpoint(label);
    capability.updated = nowIso();
    await this.writeCapability(capability);
    this.invalidate();
  }
  async moveCapability(id, parentId) {
    const capabilities = await this.loadCapabilities();
    const capability = capabilities.find((item) => item.id === id);
    if (!capability) throw new Error("Capability not found");
    if (parentId === id || descendantsOf(id, capabilities).has(parentId != null ? parentId : "")) throw new Error("A capability cannot be moved inside itself");
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before move");
    capability.parentId = parentId;
    capability.order = capabilities.filter((item) => item.parentId === parentId && item.status === "active").length;
    capability.updated = nowIso();
    await this.writeCapability(capability);
    this.invalidate();
  }
  async reorderCapability(id, direction) {
    const capabilities = await this.loadCapabilities();
    const capability = capabilities.find((item) => item.id === id);
    if (!capability) return;
    const siblings = capabilities.filter((item) => item.parentId === capability.parentId && item.status === "active").sort((a, b) => a.order - b.order);
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
  async splitCapability(id, childNames) {
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before split");
    for (const name of childNames.map((item) => item.trim()).filter(Boolean)) await this.createCapability(name, id);
  }
  async referencedContent(id) {
    const capabilities = await this.loadCapabilities();
    const ids = descendantsOf(id, capabilities);
    ids.add(id);
    return (await this.loadContentMetadata()).filter((item) => item.status !== "archived" && item.capabilityIds.some((capabilityId) => ids.has(capabilityId)));
  }
  async archiveCapability(id, moveReferencesTo) {
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
  async restoreCapability(id) {
    var _a, _b;
    const capabilities = await this.loadCapabilities();
    const current = capabilities.find((item) => item.id === id);
    if (!current) return;
    if (this.getSettings().checkpointBeforeChanges) await this.createCheckpoint("Before restore");
    const ids = descendantsOf(id, capabilities);
    ids.add(id);
    let parentId = current.parentId;
    while (parentId) {
      ids.add(parentId);
      parentId = (_b = (_a = capabilities.find((item) => item.id === parentId)) == null ? void 0 : _a.parentId) != null ? _b : null;
    }
    for (const capability of capabilities.filter((item) => ids.has(item.id))) {
      capability.status = "active";
      capability.updated = nowIso();
      await this.writeCapability(capability);
    }
    this.invalidate();
  }
  async mergeCapability(sourceId, targetId) {
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
  async createCheckpoint(label = "Manual checkpoint") {
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
    let path = (0, import_obsidian2.normalizePath)(`00 System/Checkpoints/${fileStamp}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = (0, import_obsidian2.normalizePath)(`00 System/Checkpoints/${fileStamp}-${suffix}.md`);
      suffix += 1;
    }
    const markdown = [
      "---",
      yamlLine("gmType", "capability-checkpoint"),
      yamlLine("created", timestamp),
      yamlLine("label", label),
      "---",
      "",
      `# Capability Checkpoint \u2014 ${label}`,
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
  async listCheckpoints() {
    return this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("00 System/Checkpoints/")).sort((a, b) => b.path.localeCompare(a.path));
  }
  async restoreLastCheckpoint() {
    var _a;
    const checkpoint = (await this.listCheckpoints())[0];
    if (!checkpoint) return null;
    const markdown = await this.app.vault.cachedRead(checkpoint);
    const match = markdown.match(/```json\s*([\s\S]*?)```/);
    if (!match) throw new Error("Checkpoint data is invalid");
    const snapshot = JSON.parse(match[1]);
    await this.createCheckpoint("Before checkpoint restore");
    const current = await this.loadCapabilities();
    const timestamp = nowIso();
    const snapshotIds = new Set(snapshot.map((item) => item.id));
    for (const item of snapshot) {
      const existing = current.find((capability) => capability.id === item.id);
      await this.writeCapability({ ...item, created: (_a = existing == null ? void 0 : existing.created) != null ? _a : timestamp, updated: timestamp });
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
  async loadContents(force = false) {
    if (this.contentCache && !force) return this.contentCache.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
    const files = this.app.vault.getMarkdownFiles().filter((file) => MANAGED_CONTENT_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)));
    const contents = [];
    for (const file of files) {
      const item = parseContent(await this.app.vault.cachedRead(file), file);
      if (item) contents.push(item);
    }
    this.contentCache = contents;
    return contents.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
  }
  async loadContentMetadata(force = false) {
    var _a;
    if (this.contentMetadataCache && !force) return this.contentMetadataCache.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
    const files = this.app.vault.getMarkdownFiles().filter((file) => MANAGED_CONTENT_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)));
    const contents = [];
    for (const file of files) {
      const cached = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      const item = cached ? contentFromData(cached, "", file) : parseContent(await this.app.vault.cachedRead(file), file);
      if (item) contents.push(item);
    }
    this.contentMetadataCache = contents;
    return contents.map((item) => ({ ...item, capabilityIds: [...item.capabilityIds] }));
  }
  async loadContent(id) {
    const metadata = (await this.loadContentMetadata()).find((item) => item.id === id);
    if (metadata) return parseContent(await this.app.vault.cachedRead(metadata.file), metadata.file);
    for (const file of this.app.vault.getMarkdownFiles().filter((candidate) => MANAGED_CONTENT_FOLDERS.some((folder) => candidate.path.startsWith(`${folder}/`)))) {
      const item = parseContent(await this.app.vault.cachedRead(file), file);
      if ((item == null ? void 0 : item.id) === id) return item;
    }
    return null;
  }
  async createContent(input) {
    var _a, _b, _c, _d, _e, _f;
    await this.ensureFolder(CONTENT_FOLDERS[input.type]);
    const timestamp = nowIso();
    const title = (_b = (_a = input.title) == null ? void 0 : _a.trim()) != null ? _b : "";
    const item = {
      id: makeId(CONTENT_PREFIXES[input.type]),
      type: input.type,
      title,
      body: input.type === "inbox" ? input.body.trim() : templateFor(input.type, input.body),
      capabilityIds: [...new Set((_c = input.capabilityIds) != null ? _c : [])],
      status: (_d = input.status) != null ? _d : input.type === "hypothesis" ? "validating" : "draft",
      confidence: (_e = input.confidence) != null ? _e : "low",
      sourceType: (_f = input.sourceType) != null ? _f : "personal-observation",
      created: timestamp,
      updated: timestamp
    };
    const file = await this.app.vault.create(this.contentPath(item), contentMarkdown(item));
    this.invalidate(file.path);
    return { ...item, file };
  }
  async updateContent(item) {
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
  async convertInbox(item, type) {
    if (item.type !== "inbox") return item;
    item.type = type;
    item.id = makeId(CONTENT_PREFIXES[type]);
    item.status = type === "hypothesis" ? "validating" : "draft";
    item.body = templateFor(type, item.body);
    return this.updateContent(item);
  }
  async archiveContent(item) {
    item.previousStatus = item.status;
    item.status = "archived";
    await this.updateContent(item);
  }
  async restoreContent(item) {
    item.status = item.previousStatus && item.previousStatus !== "archived" ? item.previousStatus : "draft";
    item.previousStatus = void 0;
    await this.updateContent(item);
  }
  async moveReferences(sourceIds, targetId) {
    const sourceSet = new Set(sourceIds);
    for (const item of await this.loadContents()) {
      if (!item.capabilityIds.some((id) => sourceSet.has(id))) continue;
      item.capabilityIds = [.../* @__PURE__ */ new Set([...item.capabilityIds.filter((id) => !sourceSet.has(id)), targetId])];
      await this.updateContent(item);
    }
  }
  contentPath(item) {
    const label = item.title || item.body.split("\n").find((line) => line.trim() && !line.startsWith("#")) || "Untitled";
    return (0, import_obsidian2.normalizePath)(`${CONTENT_FOLDERS[item.type]}/${item.id} ${sanitizeFileName(label)}.md`);
  }
  async writeCapability(capability) {
    await this.ensureFolder("01 Capabilities");
    const path = (0, import_obsidian2.normalizePath)(`01 Capabilities/${capability.id}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian2.TFile) {
      const { body } = parseSimpleFrontmatter(await this.app.vault.cachedRead(existing));
      await this.app.vault.modify(existing, capabilityMarkdown(capability, body));
    } else await this.app.vault.create(path, capabilityMarkdown(capability));
  }
  async ensureFolder(path) {
    const normalized = (0, import_obsidian2.normalizePath)(path);
    if (this.app.vault.getAbstractFileByPath(normalized)) return;
    await this.app.vault.createFolder(normalized);
  }
  async createIfMissing(path, content) {
    const normalized = (0, import_obsidian2.normalizePath)(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) await this.app.vault.create(normalized, content);
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var GrowthMapSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Growth Map" });
    containerEl.createEl("h3", { text: "General" });
    new import_obsidian3.Setting(containerEl).setName("Archive instead of delete").setDesc("Keep Markdown recoverable. Growth Map does not permanently delete managed content.").addToggle((toggle) => toggle.setValue(this.plugin.settings.archiveInsteadOfDelete).onChange(async (value) => {
      this.plugin.settings.archiveInsteadOfDelete = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Checkpoint before structure changes").setDesc("Create a capability-tree checkpoint before move, reorder, archive, merge, split, and restore.").addToggle((toggle) => toggle.setValue(this.plugin.settings.checkpointBeforeChanges).onChange(async (value) => {
      this.plugin.settings.checkpointBeforeChanges = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "AI" });
    new import_obsidian3.Setting(containerEl).setName("AI enabled").setDesc("V1 includes the interface only. No network requests are made.").addToggle((toggle) => toggle.setValue(this.plugin.settings.aiEnabled).setDisabled(true));
    new import_obsidian3.Setting(containerEl).setName("Provider").setDesc("No provider is configured in V1.").addDropdown((dropdown) => dropdown.addOption("none", "None").setValue("none").setDisabled(true));
    new import_obsidian3.Setting(containerEl).setName("Debug").setDesc("Log Growth Map diagnostics to the developer console.").addToggle((toggle) => toggle.setValue(this.plugin.settings.debug).onChange(async (value) => {
      this.plugin.settings.debug = value;
      await this.plugin.saveSettings();
    }));
  }
};

// src/view.ts
var import_obsidian4 = require("obsidian");
var VIEW_TYPE_GROWTH_MAP = "growth-map-view";
var GrowthMapView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.page = "home";
    this.selectedCapabilityId = null;
    this.selectedContentId = null;
    this.expanded = /* @__PURE__ */ new Set();
    this.expandedInitialized = false;
    this.libraryType = "all";
    this.librarySearch = "";
    this.libraryArea = "all";
    this.libraryCapability = "all";
    this.libraryStatus = "all";
    this.libraryConfidence = "all";
    this.refreshTimer = null;
    this.initializing = false;
  }
  getViewType() {
    return VIEW_TYPE_GROWTH_MAP;
  }
  getDisplayText() {
    return "Growth Map";
  }
  getIcon() {
    return "sprout";
  }
  async onOpen() {
    this.contentEl.addClass("growth-map-view");
    await this.render();
  }
  async onClose() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.contentEl.empty();
  }
  requestRefresh() {
    if (this.initializing) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 250);
  }
  async navigate(page, id) {
    this.page = page;
    if (page === "capability") this.selectedCapabilityId = id != null ? id : null;
    if (page === "content") this.selectedContentId = id != null ? id : null;
    await this.render();
  }
  async openSearch() {
    this.page = "library";
    await this.render();
    const input = this.contentEl.querySelector(".gm-search-input");
    input == null ? void 0 : input.focus();
  }
  openQuickCapture(capabilityId) {
    var _a;
    void this.launchQuickCapture(capabilityId != null ? capabilityId : this.page === "capability" ? (_a = this.selectedCapabilityId) != null ? _a : void 0 : void 0);
  }
  async render() {
    this.contentEl.empty();
    const shell = this.contentEl.createDiv("gm-shell");
    try {
      if (!await this.plugin.repository.isInitialized()) {
        this.renderWelcome(shell);
        return;
      }
      const scroll = shell.createDiv("gm-scroll");
      if (this.page === "home") await this.renderHome(scroll);
      else if (this.page === "map") await this.renderMap(scroll);
      else if (this.page === "library") await this.renderLibrary(scroll);
      else if (this.page === "ai") this.renderAI(scroll);
      else if (this.page === "archive") await this.renderArchive(scroll);
      else if (this.page === "capability") await this.renderCapability(scroll);
      else if (this.page === "content") await this.renderContent(scroll);
      this.renderFab(shell);
      this.renderNavigation(shell);
    } catch (error) {
      this.renderError(shell, error);
    }
  }
  renderWelcome(container) {
    const welcome = container.createDiv("gm-welcome");
    const mark = welcome.createDiv("gm-welcome-mark");
    (0, import_obsidian4.setIcon)(mark, "sprout");
    welcome.createEl("p", { text: "GROWTH MAP", cls: "gm-eyebrow" });
    welcome.createEl("h1", { text: "Welcome to Growth Map" });
    welcome.createEl("p", {
      text: "Build a map of what you're learning, what you've experienced, and what you're becoming.",
      cls: "gm-welcome-copy"
    });
    const button = welcome.createEl("button", { text: "Initialize My Growth", cls: "gm-primary-button" });
    button.addEventListener("click", () => void this.initialize(button));
    welcome.createEl("p", { text: "Offline \xB7 Markdown \xB7 Yours", cls: "gm-welcome-footnote" });
  }
  async initialize(button) {
    this.initializing = true;
    button.disabled = true;
    button.setText("Initializing\u2026");
    try {
      await this.plugin.repository.initialize();
      this.initializing = false;
      new import_obsidian4.Notice("Growth Map is ready");
      this.page = "home";
      await this.render();
    } catch (error) {
      this.initializing = false;
      button.disabled = false;
      button.setText("Initialize My Growth");
      new import_obsidian4.Notice(error instanceof Error ? error.message : "Initialization failed");
    }
  }
  renderPageHeader(container, title, subtitle, back, action) {
    const header = container.createDiv("gm-page-header");
    const leading = header.createDiv("gm-header-leading");
    if (back) {
      const backButton = leading.createEl("button", { cls: "gm-icon-button", attr: { "aria-label": "Back" } });
      (0, import_obsidian4.setIcon)(backButton, "chevron-left");
      backButton.addEventListener("click", back);
    }
    const titles = leading.createDiv();
    if (subtitle) titles.createEl("p", { text: subtitle, cls: "gm-eyebrow" });
    titles.createEl("h1", { text: title });
    if (action) {
      const button = header.createEl("button", { cls: "gm-icon-button", attr: { "aria-label": action.label } });
      (0, import_obsidian4.setIcon)(button, action.icon);
      button.addEventListener("click", action.run);
    }
  }
  async renderHome(container) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const contents = await this.plugin.repository.loadContentMetadata();
    const active = capabilities.filter((item) => item.status === "active");
    const roots = active.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order);
    this.renderPageHeader(container, "Your Growth Map", "MY GROWTH", void 0, { icon: "archive", label: "Open archive", run: () => void this.navigate("archive") });
    const overview = container.createDiv("gm-overview");
    const overall = progressFor(null, active);
    const overviewCopy = overview.createDiv();
    overviewCopy.createEl("span", { text: "Overall", cls: "gm-muted" });
    overviewCopy.createEl("strong", { text: `${overall}%` });
    this.progressBar(overview, overall);
    const areaGrid = container.createDiv("gm-area-grid");
    for (const root of roots) {
      const progress = progressFor(root.id, active);
      const card = areaGrid.createEl("button", { cls: "gm-area-card" });
      const top = card.createDiv("gm-card-top");
      top.createEl("span", { text: root.name });
      top.createEl("strong", { text: `${progress}%` });
      this.progressBar(card, progress);
      card.addEventListener("click", () => void this.navigate("capability", root.id));
    }
    const addArea = areaGrid.createEl("button", { cls: "gm-add-area-card" });
    const addIcon = addArea.createSpan();
    (0, import_obsidian4.setIcon)(addIcon, "plus");
    addArea.createSpan({ text: "Add area" });
    addArea.addEventListener("click", () => void this.addCapability(null));
    const focus = active.filter((item) => item.focus).slice(0, 5);
    this.sectionTitle(container, "Focus", focus.length ? void 0 : "Choose up to five capabilities");
    if (focus.length === 0) {
      const empty = container.createEl("button", { text: "Set your first focus", cls: "gm-empty-action" });
      empty.addEventListener("click", () => void this.chooseFocus());
    } else {
      const list = container.createDiv("gm-focus-list");
      for (const capability of focus) {
        const row = list.createEl("button", { cls: "gm-focus-row" });
        const text = row.createDiv();
        text.createEl("strong", { text: capability.name });
        text.createEl("span", { text: capabilityPath(capability.id, active).slice(0, -1).map((item) => item.name).join(" \u2192 ") || "Root area" });
        row.createEl("b", { text: `${progressFor(capability.id, active)}%` });
        row.addEventListener("click", () => void this.navigate("capability", capability.id));
      }
    }
    const activeContents = contents.filter((item) => item.status !== "archived");
    const validationCount = activeContents.filter((item) => item.type === "hypothesis" && item.status === "validating").length;
    const questionCount = activeContents.filter((item) => item.type === "question").length;
    const signals = container.createDiv("gm-signal-grid");
    this.signalCard(signals, "To Verify", `${validationCount} ${validationCount === 1 ? "Hypothesis" : "Hypotheses"}`, "hypothesis");
    this.signalCard(signals, "Open Questions", `${questionCount} ${questionCount === 1 ? "Question" : "Questions"}`, "question");
    this.sectionTitle(container, "Recent");
    const recent = activeContents.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4);
    if (recent.length === 0) this.emptyState(container, "Your newest cases, lessons, and ideas will appear here.");
    else this.renderContentCards(container, recent, capabilities);
  }
  async renderMap(container) {
    var _a;
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active");
    this.renderPageHeader(container, "Capability Map", "MY GROWTH", void 0, { icon: "plus", label: "Add root area", run: () => void this.addCapability(null) });
    const summary = container.createDiv("gm-map-summary");
    summary.createSpan({ text: "My Growth" });
    summary.createEl("strong", { text: `${progressFor(null, capabilities)}%` });
    if (!this.expandedInitialized) {
      for (const capability of capabilities) {
        if (capability.parentId === null || ((_a = capabilities.find((item) => item.id === capability.parentId)) == null ? void 0 : _a.parentId) === null) this.expanded.add(capability.id);
      }
      this.expandedInitialized = true;
    }
    const tree = container.createDiv("gm-tree");
    for (const root of this.childrenOf(null, capabilities)) this.renderTreeNode(tree, root, capabilities, 0);
    const add = container.createEl("button", { text: "+  Add Area", cls: "gm-inline-add" });
    add.addEventListener("click", () => void this.addCapability(null));
  }
  renderTreeNode(container, capability, capabilities, depth) {
    const children = this.childrenOf(capability.id, capabilities);
    const row = container.createDiv("gm-tree-row");
    row.style.setProperty("--gm-depth", String(Math.min(depth, 3)));
    const toggle = row.createEl("button", { cls: "gm-tree-toggle", attr: { "aria-label": children.length ? "Expand or collapse" : "No children" } });
    if (children.length) (0, import_obsidian4.setIcon)(toggle, this.expanded.has(capability.id) ? "chevron-down" : "chevron-right");
    else toggle.createSpan({ text: "\xB7" });
    toggle.disabled = children.length === 0;
    toggle.addEventListener("click", () => {
      if (this.expanded.has(capability.id)) this.expanded.delete(capability.id);
      else this.expanded.add(capability.id);
      void this.render();
    });
    const main = row.createEl("button", { cls: "gm-tree-main" });
    main.createSpan({ text: capability.name });
    main.createEl("strong", { text: `${progressFor(capability.id, capabilities)}%` });
    main.addEventListener("click", () => void this.navigate("capability", capability.id));
    const more = row.createEl("button", { cls: "gm-tree-more", attr: { "aria-label": `More actions for ${capability.name}` } });
    (0, import_obsidian4.setIcon)(more, "ellipsis");
    more.addEventListener("click", () => void this.capabilityActions(capability));
    if (children.length && this.expanded.has(capability.id)) {
      for (const child of children) this.renderTreeNode(container, child, capabilities, depth + 1);
    }
  }
  async renderCapability(container) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const capability = capabilities.find((item) => item.id === this.selectedCapabilityId);
    if (!capability || capability.status === "archived") {
      this.page = "map";
      await this.render();
      return;
    }
    const contents = (await this.plugin.repository.loadContentMetadata()).filter((item) => item.status !== "archived");
    this.renderPageHeader(container, capability.name, "CAPABILITY", () => void this.navigate("map"), {
      icon: "ellipsis",
      label: "Capability actions",
      run: () => void this.capabilityActions(capability)
    });
    const breadcrumb = container.createDiv("gm-breadcrumb");
    for (const [index, part] of capabilityPath(capability.id, capabilities).entries()) {
      if (index > 0) breadcrumb.createSpan({ text: "/" });
      const crumb = breadcrumb.createEl("button", { text: part.name });
      crumb.addEventListener("click", () => void this.navigate("capability", part.id));
    }
    const children = this.childrenOf(capability.id, capabilities);
    const progress = progressFor(capability.id, capabilities);
    const hero = container.createDiv("gm-capability-hero");
    hero.createEl("strong", { text: `${progress}%`, cls: "gm-progress-number" });
    this.progressBar(hero, progress);
    if (children.length === 0) {
      const stageRow = hero.createDiv("gm-stage-row");
      const stageText = stageRow.createDiv();
      stageText.createSpan({ text: "Stage", cls: "gm-muted" });
      stageText.createEl("b", { text: STAGE_LABELS[capability.stage] });
      const change = stageRow.createEl("button", { text: "Change", cls: "gm-text-button" });
      change.addEventListener("click", () => void this.changeStage(capability));
    } else {
      hero.createEl("p", { text: `Calculated from ${this.leafCount(capability.id, capabilities)} active leaf capabilities`, cls: "gm-muted" });
    }
    const focus = hero.createEl("button", { text: capability.focus ? "Remove Focus" : "Set as Focus", cls: capability.focus ? "gm-secondary-button" : "gm-primary-button" });
    focus.addEventListener("click", () => void this.toggleFocus(capability));
    if (children.length) {
      this.sectionTitle(container, "Sub-capabilities");
      const list = container.createDiv("gm-subcap-list");
      for (const child of children) {
        const row = list.createEl("button", { cls: "gm-subcap-row" });
        row.createSpan({ text: child.name });
        row.createEl("b", { text: `${progressFor(child.id, capabilities)}%` });
        const arrow = row.createSpan();
        (0, import_obsidian4.setIcon)(arrow, "chevron-right");
        row.addEventListener("click", () => void this.navigate("capability", child.id));
      }
    }
    const relevantIds = descendantsOf(capability.id, capabilities);
    relevantIds.add(capability.id);
    const related = contents.filter((item) => item.capabilityIds.some((id) => relevantIds.has(id)));
    this.sectionTitle(container, "Library");
    const stats = container.createDiv("gm-stat-grid");
    for (const type of ["knowledge", "case", "lesson", "hypothesis", "question"]) {
      const count = related.filter((item) => item.type === type).length;
      const stat = stats.createEl("button", { cls: "gm-stat-card" });
      stat.createEl("strong", { text: String(count) });
      stat.createSpan({ text: CONTENT_LABELS[type] });
      stat.addEventListener("click", () => {
        this.libraryType = type;
        this.libraryCapability = capability.id;
        void this.navigate("library");
      });
    }
    this.sectionTitle(container, "Recent Content");
    const recent = related.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4);
    if (recent.length) this.renderContentCards(container, recent, capabilities);
    else this.emptyState(container, "Capture something here and it will be linked automatically.");
    const add = container.createEl("button", { text: "+  Add", cls: "gm-inline-add" });
    add.addEventListener("click", () => this.openContentForm([capability.id]));
  }
  async renderLibrary(container) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const contents = await this.plugin.repository.loadContents();
    this.renderPageHeader(container, "Library", "YOUR KNOWLEDGE", void 0, { icon: "plus", label: "Add content", run: () => this.openContentForm([]) });
    const inbox = contents.filter((item) => item.type === "inbox" && item.status !== "archived");
    if (inbox.length) {
      const inboxButton = container.createEl("button", { cls: "gm-inbox-banner" });
      const icon = inboxButton.createSpan();
      (0, import_obsidian4.setIcon)(icon, "inbox");
      const text = inboxButton.createDiv();
      text.createEl("strong", { text: `${inbox.length} in Inbox` });
      text.createSpan({ text: "Review and organize your captures" });
      const arrow = inboxButton.createSpan();
      (0, import_obsidian4.setIcon)(arrow, "chevron-right");
      inboxButton.addEventListener("click", () => {
        this.libraryType = "inbox";
        void this.render();
      });
    }
    const searchWrap = container.createDiv("gm-search");
    const searchIcon = searchWrap.createSpan();
    (0, import_obsidian4.setIcon)(searchIcon, "search");
    const search = searchWrap.createEl("input", { cls: "gm-search-input", attr: { type: "search", placeholder: "Search my knowledge\u2026" } });
    search.value = this.librarySearch;
    search.addEventListener("input", () => {
      this.librarySearch = search.value;
      this.updateLibraryResults(container, capabilities, contents);
    });
    const chips = container.createDiv("gm-chips");
    for (const type of ["all", "knowledge", "case", "lesson", "hypothesis", "question"]) {
      const chip = chips.createEl("button", { text: type === "all" ? "All" : CONTENT_LABELS[type], cls: `gm-chip${this.libraryType === type ? " is-active" : ""}` });
      chip.addEventListener("click", () => {
        this.libraryType = type;
        void this.render();
      });
    }
    const filters = container.createEl("details", { cls: "gm-filters" });
    filters.createEl("summary", { text: "Filters" });
    const filterGrid = filters.createDiv("gm-filter-grid");
    this.filterSelect(filterGrid, "Area", this.rootOptions(capabilities), this.libraryArea, (value) => {
      this.libraryArea = value;
      void this.render();
    });
    this.filterSelect(filterGrid, "Capability", [{ value: "all", label: "All capabilities" }, ...capabilities.filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ value: item.id, label: item.name }))], this.libraryCapability, (value) => {
      this.libraryCapability = value;
      void this.render();
    });
    this.filterSelect(filterGrid, "Status", ["all", "draft", "validating", "validated", "outdated"].map((value) => ({ value, label: value === "all" ? "All statuses" : value })), this.libraryStatus, (value) => {
      this.libraryStatus = value;
      void this.render();
    });
    this.filterSelect(filterGrid, "Confidence", ["all", "low", "medium", "high"].map((value) => ({ value, label: value === "all" ? "All confidence" : value })), this.libraryConfidence, (value) => {
      this.libraryConfidence = value;
      void this.render();
    });
    const results = container.createDiv("gm-library-results");
    results.dataset.gmResults = "true";
    this.renderLibraryResults(results, capabilities, contents);
  }
  updateLibraryResults(container, capabilities, contents) {
    const results = container.querySelector("[data-gm-results]");
    if (!results) return;
    results.empty();
    this.renderLibraryResults(results, capabilities, contents);
  }
  renderLibraryResults(container, capabilities, contents) {
    let filtered = contents.filter((item) => item.status !== "archived");
    if (this.libraryType !== "all") filtered = filtered.filter((item) => item.type === this.libraryType);
    if (this.librarySearch.trim()) {
      const needle = this.librarySearch.toLocaleLowerCase();
      filtered = filtered.filter((item) => `${item.title}
${item.body}`.toLocaleLowerCase().includes(needle));
    }
    if (this.libraryArea !== "all") {
      const ids = descendantsOf(this.libraryArea, capabilities);
      ids.add(this.libraryArea);
      filtered = filtered.filter((item) => item.capabilityIds.some((id) => ids.has(id)));
    }
    if (this.libraryCapability !== "all") filtered = filtered.filter((item) => item.capabilityIds.includes(this.libraryCapability));
    if (this.libraryStatus !== "all") filtered = filtered.filter((item) => item.status === this.libraryStatus);
    if (this.libraryConfidence !== "all") filtered = filtered.filter((item) => item.confidence === this.libraryConfidence);
    filtered.sort((a, b) => b.updated.localeCompare(a.updated));
    const count = container.createDiv("gm-result-count");
    count.setText(`${filtered.length} item${filtered.length === 1 ? "" : "s"}`);
    if (filtered.length) this.renderContentCards(container, filtered, capabilities);
    else this.emptyState(container, "No content matches these filters.");
  }
  async renderContent(container) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const item = this.selectedContentId ? await this.plugin.repository.loadContent(this.selectedContentId) : null;
    if (!item) {
      this.page = "library";
      await this.render();
      return;
    }
    this.renderPageHeader(container, this.contentTitle(item), CONTENT_LABELS[item.type].toUpperCase(), () => void this.navigate("library"), {
      icon: "ellipsis",
      label: "Content actions",
      run: () => void this.contentActions(item, capabilities)
    });
    const badges = container.createDiv("gm-badges");
    badges.createSpan({ text: item.status });
    badges.createSpan({ text: `${item.confidence} confidence` });
    badges.createSpan({ text: item.sourceType });
    if (item.capabilityIds.length) {
      const links = container.createDiv("gm-content-capabilities");
      for (const id of item.capabilityIds) {
        const capability = capabilities.find((entry) => entry.id === id);
        if (!capability) continue;
        const button = links.createEl("button", { text: capability.name });
        button.addEventListener("click", () => void this.navigate("capability", capability.id));
      }
    }
    const preview = container.createDiv("gm-markdown-preview markdown-rendered");
    await import_obsidian4.MarkdownRenderer.render(this.app, item.body, preview, item.file.path, this);
    const meta = container.createDiv("gm-content-meta");
    meta.createSpan({ text: item.id });
    meta.createSpan({ text: `Updated ${relativeTime(item.updated)}` });
    if (item.type === "inbox") {
      const organize = container.createEl("button", { text: "Organize Inbox Item", cls: "gm-primary-button" });
      organize.addEventListener("click", () => this.organizeInbox(item, capabilities));
    }
    const open = container.createEl("button", { text: "Open Markdown", cls: "gm-secondary-button" });
    open.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(item.file));
  }
  renderAI(container) {
    this.renderPageHeader(container, "AI Assistant", "OPTIONAL");
    const status = container.createDiv("gm-ai-status");
    const icon = status.createDiv("gm-ai-icon");
    (0, import_obsidian4.setIcon)(icon, "sparkles");
    status.createEl("h2", { text: "AI is not configured." });
    status.createEl("p", { text: "Growth Map works fully without AI." });
    const future = container.createDiv("gm-future-list");
    this.futureCard(future, "Organize with AI", "Preview suggested type, capabilities, confidence, status, and structure before adding anything.");
    this.futureCard(future, "Ask My Knowledge", "Search locally first, send only selected context, and show every source used in the answer.");
    container.createEl("p", { text: "V1 makes no network requests and stores no API keys.", cls: "gm-privacy-note" });
  }
  async renderArchive(container) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const contents = await this.plugin.repository.loadContentMetadata();
    this.renderPageHeader(container, "Archive", "RECOVERABLE", () => void this.navigate("home"));
    const checkpointActions = container.createDiv("gm-inline-actions");
    const view = checkpointActions.createEl("button", { text: "View Checkpoints" });
    view.addEventListener("click", () => void this.showCheckpoints());
    const restoreLast = checkpointActions.createEl("button", { text: "Restore Last" });
    restoreLast.addEventListener("click", () => void this.restoreLastCheckpoint());
    this.sectionTitle(container, "Capabilities");
    const archivedCapabilities = capabilities.filter((item) => item.status === "archived").sort((a, b) => b.updated.localeCompare(a.updated));
    if (!archivedCapabilities.length) this.emptyState(container, "No archived capabilities.");
    for (const capability of archivedCapabilities) {
      const row = container.createDiv("gm-archive-row");
      const text = row.createDiv();
      text.createEl("strong", { text: capability.name });
      text.createSpan({ text: capability.id });
      const restore = row.createEl("button", { text: "Restore" });
      restore.addEventListener("click", () => void this.restoreCapability(capability.id));
    }
    this.sectionTitle(container, "Content");
    const archivedContent = contents.filter((item) => item.status === "archived").sort((a, b) => b.updated.localeCompare(a.updated));
    if (!archivedContent.length) this.emptyState(container, "No archived content.");
    for (const item of archivedContent) {
      const row = container.createDiv("gm-archive-row");
      const text = row.createDiv();
      text.createEl("strong", { text: this.contentTitle(item) });
      text.createSpan({ text: `${CONTENT_LABELS[item.type]} \xB7 ${item.id}` });
      const restore = row.createEl("button", { text: "Restore" });
      restore.addEventListener("click", () => void this.restoreContent(item.id));
    }
  }
  renderNavigation(shell) {
    const nav = shell.createEl("nav", { cls: "gm-nav", attr: { "aria-label": "Growth Map" } });
    for (const item of [
      { page: "home", label: "Home", icon: "house" },
      { page: "map", label: "Map", icon: "list-tree" },
      { page: "library", label: "Library", icon: "library" },
      { page: "ai", label: "AI", icon: "sparkles" }
    ]) {
      const active = this.page === item.page || item.page === "map" && this.page === "capability" || item.page === "library" && this.page === "content";
      const button = nav.createEl("button", { cls: `gm-nav-item${active ? " is-active" : ""}`, attr: { "aria-label": item.label } });
      const icon = button.createSpan();
      (0, import_obsidian4.setIcon)(icon, item.icon);
      button.createSpan({ text: item.label });
      button.addEventListener("click", () => void this.navigate(item.page));
    }
  }
  renderFab(shell) {
    const button = shell.createEl("button", { cls: "gm-fab", attr: { "aria-label": "Quick Capture" } });
    (0, import_obsidian4.setIcon)(button, "plus");
    button.addEventListener("click", () => this.openQuickCapture());
  }
  async launchQuickCapture(capabilityId) {
    var _a;
    const capabilities = await this.plugin.repository.loadCapabilities();
    const capability = capabilities.find((item) => item.id === capabilityId);
    new QuickCaptureModal(this.app, (_a = capability == null ? void 0 : capability.name) != null ? _a : null, async (title, content) => {
      await this.plugin.repository.createContent({ type: "inbox", title, body: content, capabilityIds: capability ? [capability.id] : [] });
      this.requestRefresh();
    }).open();
  }
  openContentForm(capabilityIds, initial, onSave) {
    void this.plugin.repository.loadCapabilities().then((capabilities) => {
      new ContentFormModal(this.app, capabilities, capabilityIds, initial, onSave != null ? onSave : (async (value) => {
        await this.plugin.repository.createContent(value);
        this.requestRefresh();
      })).open();
    });
  }
  organizeInbox(item, capabilities) {
    new ContentFormModal(this.app, capabilities, item.capabilityIds, {
      title: item.title,
      body: item.body,
      status: "draft",
      confidence: item.confidence,
      sourceType: item.sourceType,
      type: "knowledge"
    }, async (value) => {
      item.body = value.body;
      const converted = await this.plugin.repository.convertInbox(item, value.type);
      converted.title = value.title;
      converted.capabilityIds = value.capabilityIds;
      converted.status = value.status;
      converted.confidence = value.confidence;
      converted.sourceType = value.sourceType;
      await this.plugin.repository.updateContent(converted);
      this.selectedContentId = converted.id;
      await this.render();
    }).open();
  }
  async contentActions(item, capabilities) {
    const choice = await chooseOption(this.app, this.contentTitle(item), [
      { label: item.type === "inbox" ? "Organize" : "Edit metadata and content", value: "edit" },
      { label: "Open Markdown", value: "open" },
      { label: "Archive", value: "archive", destructive: true }
    ]);
    if (choice === "open") await this.app.workspace.getLeaf(false).openFile(item.file);
    else if (choice === "archive") {
      await this.plugin.repository.archiveContent(item);
      new import_obsidian4.Notice("Content archived \u2014 Markdown kept");
      await this.navigate("library");
    } else if (choice === "edit") {
      if (item.type === "inbox") this.organizeInbox(item, capabilities);
      else new ContentFormModal(this.app, capabilities, item.capabilityIds, item, async (value) => {
        item.type = value.type;
        item.title = value.title;
        item.body = value.body;
        item.capabilityIds = value.capabilityIds;
        item.status = value.status;
        item.confidence = value.confidence;
        item.sourceType = value.sourceType;
        await this.plugin.repository.updateContent(item);
        await this.render();
      }).open();
    }
  }
  async addCapability(parentId) {
    const name = await promptText(this.app, parentId ? "Add child capability" : "Add growth area", "Capability name");
    if (!name) return;
    const capability = await this.plugin.repository.createCapability(name, parentId);
    if (parentId) this.expanded.add(parentId);
    new import_obsidian4.Notice(`${capability.name} added`);
    await this.render();
  }
  async capabilityActions(capability) {
    const choice = await chooseOption(this.app, capability.name, [
      { label: "Add Child", value: "add" },
      { label: "Rename", value: "rename" },
      { label: "Move / Change Parent", value: "move" },
      { label: "Change Stage", value: "stage" },
      { label: capability.focus ? "Remove Focus" : "Set as Focus", value: "focus" },
      { label: "Change Weight", value: "weight" },
      { label: "Move Up", value: "up" },
      { label: "Move Down", value: "down" },
      { label: "Split into Children", value: "split" },
      { label: "Merge into Another", value: "merge" },
      { label: "Archive", value: "archive", destructive: true }
    ]);
    if (!choice) return;
    try {
      if (choice === "add") await this.addCapability(capability.id);
      else if (choice === "rename") {
        const name = await promptText(this.app, "Rename capability", "Name", capability.name);
        if (name) {
          capability.name = name;
          await this.plugin.repository.updateCapability(capability);
          await this.render();
        }
      } else if (choice === "move") await this.moveCapability(capability);
      else if (choice === "stage") await this.changeStage(capability);
      else if (choice === "focus") await this.toggleFocus(capability);
      else if (choice === "weight") await this.changeWeight(capability);
      else if (choice === "up" || choice === "down") {
        await this.plugin.repository.reorderCapability(capability.id, choice === "up" ? -1 : 1);
        await this.render();
      } else if (choice === "split") await this.splitCapability(capability);
      else if (choice === "merge") await this.mergeCapability(capability);
      else if (choice === "archive") await this.archiveCapability(capability);
    } catch (error) {
      new import_obsidian4.Notice(error instanceof Error ? error.message : "Capability action failed");
    }
  }
  async changeStage(capability) {
    const stage = await chooseOption(this.app, "Capability stage", STAGE_LABELS.map((label, index) => ({
      label: `${index * 20}% \xB7 ${label}`,
      value: index
    })));
    if (stage === null) return;
    capability.stage = stage;
    await this.plugin.repository.updateCapability(capability);
    await this.render();
  }
  async toggleFocus(capability) {
    if (capability.focus) {
      capability.focus = false;
      await this.plugin.repository.updateCapability(capability);
      await this.render();
      return;
    }
    const capabilities = await this.plugin.repository.loadCapabilities();
    const focus = capabilities.filter((item) => item.status === "active" && item.focus);
    if (focus.length >= 5) {
      const replaceId = await chooseOption(this.app, "Replace a focus", focus.map((item) => ({ label: item.name, value: item.id, description: "Remove from Home focus" })));
      if (!replaceId) return;
      const replaced = focus.find((item) => item.id === replaceId);
      if (replaced) {
        replaced.focus = false;
        await this.plugin.repository.updateCapability(replaced);
      }
    }
    capability.focus = true;
    await this.plugin.repository.updateCapability(capability);
    await this.render();
  }
  async chooseFocus() {
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active" && !item.focus);
    const id = await chooseOption(this.app, "Set as Focus", capabilities.map((item) => ({
      label: item.name,
      description: capabilityPath(item.id, capabilities).slice(0, -1).map((part) => part.name).join(" / "),
      value: item.id
    })));
    const capability = capabilities.find((item) => item.id === id);
    if (capability) await this.toggleFocus(capability);
  }
  async changeWeight(capability) {
    const value = await promptText(this.app, "Capability weight", "A number greater than 0", String(capability.weight));
    if (!value) return;
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight <= 0) {
      new import_obsidian4.Notice("Weight must be a number greater than 0");
      return;
    }
    capability.weight = weight;
    await this.plugin.repository.updateCapability(capability, true, "Before weight change");
    await this.render();
  }
  async moveCapability(capability) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const blocked = descendantsOf(capability.id, capabilities);
    blocked.add(capability.id);
    const target = await chooseOption(this.app, "Move to", [
      { label: "Top level", value: "__root__", description: "Make this a root area" },
      ...capabilities.filter((item) => item.status === "active" && !blocked.has(item.id)).map((item) => ({
        label: item.name,
        description: capabilityPath(item.id, capabilities).map((part) => part.name).join(" / "),
        value: item.id
      }))
    ]);
    if (target === null) return;
    await this.plugin.repository.moveCapability(capability.id, target === "__root__" ? null : target);
    await this.render();
  }
  async splitCapability(capability) {
    const names = await promptText(this.app, "Split into child capabilities", "Names separated by commas");
    if (!names) return;
    const children = names.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    if (children.length < 2) {
      new import_obsidian4.Notice("Enter at least two child names");
      return;
    }
    await this.plugin.repository.splitCapability(capability.id, children);
    this.expanded.add(capability.id);
    await this.render();
  }
  async mergeCapability(capability) {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const blocked = descendantsOf(capability.id, capabilities);
    blocked.add(capability.id);
    const target = await chooseOption(this.app, "Merge into", capabilities.filter((item) => item.status === "active" && !blocked.has(item.id)).map((item) => ({
      label: item.name,
      description: capabilityPath(item.id, capabilities).map((part) => part.name).join(" / "),
      value: item.id
    })));
    if (!target) return;
    await this.plugin.repository.mergeCapability(capability.id, target);
    new import_obsidian4.Notice("Capabilities merged; source archived");
    if (this.selectedCapabilityId === capability.id) this.selectedCapabilityId = target;
    await this.render();
  }
  async archiveCapability(capability) {
    const references = await this.plugin.repository.referencedContent(capability.id);
    const choice = await new Promise((resolve) => new ReferenceProtectionModal(this.app, capability.name, references.length, resolve).open());
    if (!choice) return;
    let target;
    if (choice === "move") {
      const capabilities = await this.plugin.repository.loadCapabilities();
      const blocked = descendantsOf(capability.id, capabilities);
      blocked.add(capability.id);
      const selected = await chooseOption(this.app, "Move references to", capabilities.filter((item) => item.status === "active" && !blocked.has(item.id)).map((item) => ({ label: item.name, value: item.id })));
      if (!selected) return;
      target = selected;
    }
    await this.plugin.repository.archiveCapability(capability.id, target);
    new import_obsidian4.Notice("Capability archived \u2014 Markdown kept");
    if (this.page === "capability") await this.navigate("map");
    else await this.render();
  }
  async restoreCapability(id) {
    await this.plugin.repository.restoreCapability(id);
    new import_obsidian4.Notice("Capability branch restored");
    await this.render();
  }
  async restoreContent(id) {
    const item = await this.plugin.repository.loadContent(id);
    if (!item) return;
    await this.plugin.repository.restoreContent(item);
    new import_obsidian4.Notice("Content restored");
    await this.render();
  }
  async showCheckpoints() {
    const files = await this.plugin.repository.listCheckpoints();
    new CheckpointListModal(this.app, files.map((file) => file.path)).open();
  }
  async restoreLastCheckpoint() {
    const confirm = await chooseOption(this.app, "Restore last checkpoint?", [{
      label: "Restore capability structure",
      value: true,
      description: "A checkpoint of the current structure will be created first."
    }]);
    if (!confirm) return;
    const path = await this.plugin.repository.restoreLastCheckpoint();
    new import_obsidian4.Notice(path ? "Capability structure restored" : "No checkpoint found");
    await this.render();
  }
  renderContentCards(container, items, capabilities) {
    const list = container.createDiv("gm-content-list");
    for (const item of items) {
      const card = list.createEl("button", { cls: "gm-content-card" });
      const top = card.createDiv("gm-content-card-top");
      top.createSpan({ text: CONTENT_LABELS[item.type].toUpperCase(), cls: `gm-type gm-type-${item.type}` });
      top.createSpan({ text: relativeTime(item.updated), cls: "gm-muted" });
      card.createEl("strong", { text: this.contentTitle(item) });
      const capNames = item.capabilityIds.map((id) => {
        var _a;
        return (_a = capabilities.find((entry) => entry.id === id)) == null ? void 0 : _a.name;
      }).filter(Boolean).slice(0, 3).join(" \xB7 ");
      if (capNames) card.createSpan({ text: capNames, cls: "gm-content-path" });
      card.addEventListener("click", () => void this.navigate("content", item.id));
    }
  }
  progressBar(container, progress) {
    const track = container.createDiv("gm-progress-track");
    const fill = track.createDiv("gm-progress-fill");
    fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
  signalCard(container, label, value, type) {
    const card = container.createEl("button", { cls: "gm-signal-card" });
    card.createSpan({ text: label });
    card.createEl("strong", { text: value });
    card.addEventListener("click", () => {
      this.libraryType = type;
      void this.navigate("library");
    });
  }
  sectionTitle(container, title, hint) {
    const row = container.createDiv("gm-section-title");
    row.createEl("h2", { text: title });
    if (hint) row.createSpan({ text: hint });
  }
  emptyState(container, text) {
    container.createDiv({ text, cls: "gm-empty-state" });
  }
  futureCard(container, title, description) {
    const card = container.createDiv("gm-future-card");
    card.createEl("strong", { text: title });
    card.createEl("p", { text: description });
    card.createSpan({ text: "Coming later" });
  }
  filterSelect(container, label, options, selected, onChange) {
    const field = container.createDiv("gm-filter-field");
    field.createEl("label", { text: label });
    const select = field.createEl("select", { cls: "dropdown" });
    for (const option of options) {
      const element = select.createEl("option", { text: option.label, value: option.value });
      element.selected = selected === option.value;
    }
    select.addEventListener("change", () => onChange(select.value));
  }
  rootOptions(capabilities) {
    return [{ value: "all", label: "All areas" }, ...capabilities.filter((item) => item.status === "active" && item.parentId === null).sort((a, b) => a.order - b.order).map((item) => ({ value: item.id, label: item.name }))];
  }
  childrenOf(parentId, capabilities) {
    return capabilities.filter((item) => item.status === "active" && item.parentId === parentId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  leafCount(id, capabilities) {
    const descendants = [...descendantsOf(id, capabilities)].filter((descendantId) => {
      var _a;
      return ((_a = capabilities.find((item) => item.id === descendantId)) == null ? void 0 : _a.status) === "active";
    });
    return descendants.filter((descendantId) => this.childrenOf(descendantId, capabilities).length === 0).length || 1;
  }
  contentTitle(item) {
    var _a, _b, _c, _d;
    if (item.title.trim()) return item.title.trim();
    const lines = item.body.split("\n");
    return (_d = (_c = (_b = (_a = lines.find((line) => line.trim() && !line.trim().startsWith("#"))) == null ? void 0 : _a.trim()) != null ? _b : lines.map((line) => line.replace(/^#+\s*/, "").trim()).find(Boolean)) != null ? _c : item.file.basename.replace(new RegExp(`^${item.id}\\s*`), "")) != null ? _d : "Untitled";
  }
  renderError(container, error) {
    const box = container.createDiv("gm-error");
    box.createEl("h2", { text: "Growth Map couldn't load" });
    box.createEl("p", { text: error instanceof Error ? error.message : "Unknown error" });
    const retry = box.createEl("button", { text: "Try Again", cls: "gm-primary-button" });
    retry.addEventListener("click", () => void this.render());
  }
};

// src/main.ts
var GrowthMapPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    await this.loadSettings();
    this.repository = new GrowthRepository(this.app, () => this.settings, (message) => this.debug(message));
    this.registerView(VIEW_TYPE_GROWTH_MAP, (leaf) => new GrowthMapView(leaf, this));
    this.addRibbonIcon("sprout", "Open Growth Map", () => void this.activateView("home"));
    this.addSettingTab(new GrowthMapSettingTab(this.app, this));
    this.addCommand({ id: "open", name: "Open", callback: () => void this.activateView("home") });
    this.addCommand({ id: "quick-capture", name: "Quick Capture", callback: () => void this.quickCapture() });
    this.addCommand({ id: "new-capability", name: "New Capability", callback: () => void this.newCapability() });
    this.addCommand({ id: "search", name: "Search", callback: () => void this.openSearch() });
    this.addCommand({ id: "open-archive", name: "Open Archive", callback: () => void this.activateView("archive") });
    this.addCommand({ id: "create-checkpoint", name: "Create Checkpoint", callback: () => void this.createCheckpoint() });
    this.addCommand({ id: "restore-last-checkpoint", name: "Restore Last Checkpoint", callback: () => void this.restoreLastCheckpoint() });
    this.addCommand({ id: "open-ai", name: "Open AI", callback: () => void this.activateView("ai") });
    const invalidate = (file) => {
      if (!this.repository.isManagedPath(file.path)) return;
      this.repository.invalidate(file.path);
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GROWTH_MAP)) {
        if (leaf.view instanceof GrowthMapView) leaf.view.requestRefresh();
      }
    };
    this.registerEvent(this.app.vault.on("create", invalidate));
    this.registerEvent(this.app.vault.on("modify", invalidate));
    this.registerEvent(this.app.vault.on("delete", invalidate));
    this.registerEvent(this.app.vault.on("rename", invalidate));
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GROWTH_MAP);
  }
  async activateView(page = "home") {
    let leaf;
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_GROWTH_MAP)[0];
    if (existing) leaf = existing;
    else {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_GROWTH_MAP, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof GrowthMapView) {
      await leaf.view.navigate(page);
      return leaf.view;
    }
    return null;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async loadSettings() {
    var _a;
    this.settings = { ...DEFAULT_SETTINGS, ...(_a = await this.loadData()) != null ? _a : {} };
  }
  async quickCapture() {
    if (!await this.repository.isInitialized()) {
      await this.activateView("home");
      new import_obsidian5.Notice("Initialize Growth Map before capturing");
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(GrowthMapView);
    if (activeView) {
      activeView.openQuickCapture();
      return;
    }
    new QuickCaptureModal(this.app, null, async (title, content) => {
      await this.repository.createContent({ type: "inbox", title, body: content });
    }).open();
  }
  async newCapability() {
    if (!await this.repository.isInitialized()) {
      await this.activateView("home");
      new import_obsidian5.Notice("Initialize Growth Map first");
      return;
    }
    const name = await promptText(this.app, "New root capability", "Capability name");
    if (!name) return;
    await this.repository.createCapability(name, null);
    new import_obsidian5.Notice(`${name} added to Growth Map`);
    await this.activateView("map");
  }
  async openSearch() {
    const view = await this.activateView("library");
    await (view == null ? void 0 : view.openSearch());
  }
  async createCheckpoint() {
    if (!await this.repository.isInitialized()) {
      new import_obsidian5.Notice("Initialize Growth Map first");
      return;
    }
    await this.repository.createCheckpoint();
    new import_obsidian5.Notice("Capability checkpoint created");
  }
  async restoreLastCheckpoint() {
    if (!await this.repository.isInitialized()) {
      new import_obsidian5.Notice("Initialize Growth Map first");
      return;
    }
    const restored = await this.repository.restoreLastCheckpoint();
    new import_obsidian5.Notice(restored ? "Capability structure restored" : "No checkpoint found");
    await this.activateView("map");
  }
  debug(message) {
    if (this.settings.debug) console.debug(`[Growth Map] ${message}`);
  }
};
