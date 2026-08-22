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
function spectrumHue(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}
function connectionKey(firstId, secondId) {
  return [firstId, secondId].sort().join("::");
}
function calculateConnections(contents, pinnedConnections = []) {
  var _a, _b, _c;
  const result = /* @__PURE__ */ new Map();
  for (const item of contents.filter((content) => content.status !== "archived")) {
    const ids = [...new Set(item.capabilityIds)].sort();
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const key = connectionKey(ids[left], ids[right]);
        const existing = (_a = result.get(key)) != null ? _a : {
          fromId: ids[left],
          toId: ids[right],
          pinned: false,
          created: item.created,
          strength: 0,
          sharedContentIds: [],
          counts: {}
        };
        existing.strength += 1;
        existing.sharedContentIds.push(item.id);
        existing.counts[item.type] = ((_b = existing.counts[item.type]) != null ? _b : 0) + 1;
        if (item.created < existing.created) existing.created = item.created;
        result.set(key, existing);
      }
    }
  }
  for (const pinned of pinnedConnections) {
    const key = connectionKey(pinned.fromId, pinned.toId);
    if (!pinned.pinned && !result.has(key)) continue;
    const existing = (_c = result.get(key)) != null ? _c : {
      ...pinned,
      strength: 0,
      sharedContentIds: [],
      counts: {}
    };
    existing.pinned = pinned.pinned;
    existing.note = pinned.note;
    existing.created = pinned.created;
    result.set(key, existing);
  }
  return [...result.values()].sort(
    (left, right) => Number(right.pinned) - Number(left.pinned) || right.strength - left.strength || connectionKey(left.fromId, left.toId).localeCompare(connectionKey(right.fromId, right.toId))
  );
}
function uniqueAttachmentPath(originalName, exists, timestamp = Date.now()) {
  var _a;
  const leaf = ((_a = originalName.split(/[\\/]/).pop()) == null ? void 0 : _a.trim()) || "Attachment";
  const safe = leaf.replace(/[\\/:*?"<>|#\[\]\^]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Attachment";
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  let path = "08 Attachments/" + safe;
  if (!exists(path)) return path;
  path = "08 Attachments/" + base + "-" + timestamp + extension;
  let suffix = 2;
  while (exists(path)) {
    path = "08 Attachments/" + base + "-" + timestamp + "-" + suffix + extension;
    suffix += 1;
  }
  return path;
}
function timeRangeStart(range, now = /* @__PURE__ */ new Date()) {
  if (range === "all") return null;
  const start = new Date(now);
  if (range === "30d") start.setDate(start.getDate() - 30);
  else if (range === "3m") start.setMonth(start.getMonth() - 3);
  else if (range === "6m") start.setMonth(start.getMonth() - 6);
  else start.setFullYear(start.getFullYear() - 1);
  return start;
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

// src/content-ux.ts
var attachmentEmbedPattern = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
function attachmentEmbed(path) {
  return `![[${path}]]`;
}
function pendingAttachmentMarker(token) {
  return `<!--GM-ATTACH:${token}-->`;
}
function parseContentBlocks(body, attachments) {
  const byPath = new Map(attachments.map((attachment) => [attachment.path, attachment]));
  const used = /* @__PURE__ */ new Set();
  const blocks = [];
  let cursor = 0;
  let index = 0;
  for (const match of body.matchAll(attachmentEmbedPattern)) {
    const path = match[1].trim();
    const attachment = byPath.get(path);
    if (!attachment || match.index === void 0) continue;
    if (match.index > cursor) blocks.push({ id: `text-${index++}`, kind: "text", value: body.slice(cursor, match.index) });
    blocks.push({ id: `attachment-${index++}`, kind: "attachment", attachment });
    used.add(path);
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length || blocks.length === 0) blocks.push({ id: `text-${index++}`, kind: "text", value: body.slice(cursor) });
  for (const attachment of attachments) {
    if (used.has(attachment.path)) continue;
    const last = blocks.at(-1);
    if ((last == null ? void 0 : last.kind) === "text" && last.value && !last.value.endsWith("\n\n")) last.value += last.value.endsWith("\n") ? "\n" : "\n\n";
    blocks.push({ id: `attachment-${index++}`, kind: "attachment", attachment });
    blocks.push({ id: `text-${index++}`, kind: "text", value: "\n\n" });
  }
  return blocks.length ? blocks : [{ id: "text-0", kind: "text", value: "" }];
}
function serializeContentBlocks(blocks) {
  return blocks.map((block) => {
    if (block.kind === "text") return block.value;
    if (block.attachment) return attachmentEmbed(block.attachment.path);
    return block.pending ? pendingAttachmentMarker(block.pending.token) : "";
  }).join("").trim();
}
function initialRelatedCapabilityIds(initialIds, contextCapabilityId) {
  return [.../* @__PURE__ */ new Set([...initialIds, ...contextCapabilityId ? [contextCapabilityId] : []])];
}
function fullCapabilityPath(capabilityId, capabilities) {
  return capabilityPath(capabilityId, capabilities).map((item) => item.name).join(" / ");
}
function searchCapabilities(capabilities, query, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return capabilities.filter((capability) => capability.status === "active" && !excluded.has(capability.id)).map((capability) => ({ capability, path: fullCapabilityPath(capability.id, capabilities).toLocaleLowerCase() })).filter(({ capability, path }) => capability.name.toLocaleLowerCase().includes(needle) || path.includes(needle)).sort((left, right) => {
    const leftName = left.capability.name.toLocaleLowerCase();
    const rightName = right.capability.name.toLocaleLowerCase();
    return Number(!leftName.startsWith(needle)) - Number(!rightName.startsWith(needle)) || left.path.length - right.path.length || left.path.localeCompare(right.path);
  }).map(({ capability }) => capability);
}
function updateRecentCapabilityIds(current, usedIds, limit = 8) {
  return [.../* @__PURE__ */ new Set([...usedIds, ...current])].slice(0, limit);
}
function suggestedCapabilities(capabilities, contextCapabilityId, excludedIds, limit = 3) {
  if (!contextCapabilityId) return [];
  const excluded = new Set(excludedIds);
  const context = capabilities.find((item) => item.id === contextCapabilityId && item.status === "active");
  if (!context) return [];
  const siblings = capabilities.filter((item) => item.status === "active" && item.parentId === context.parentId && item.id !== context.id);
  return [context, ...siblings].filter((item) => !excluded.has(item.id)).slice(0, limit);
}

// src/types.ts
var DEFAULT_SETTINGS = {
  archiveInsteadOfDelete: true,
  checkpointBeforeChanges: true,
  recentCapabilityIds: [],
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
var GrowthModal = class extends import_obsidian.Modal {
  constructor() {
    super(...arguments);
    this.viewportCleanup = null;
  }
  prepareModal(...classes) {
    this.modalEl.addClass("gm-modal", ...classes);
    const viewport = window.visualViewport;
    const container = this.modalEl.closest(".modal-container");
    const update = () => {
      var _a, _b;
      const height = (_a = viewport == null ? void 0 : viewport.height) != null ? _a : window.innerHeight;
      const top = (_b = viewport == null ? void 0 : viewport.offsetTop) != null ? _b : 0;
      this.modalEl.style.setProperty("--gm-visible-viewport-height", `${height}px`);
      this.modalEl.style.setProperty("--gm-visible-viewport-top", `${top}px`);
      if (container) {
        container.addClass("gm-modal-viewport");
        container.style.top = `${top}px`;
        container.style.height = `${height}px`;
        container.style.bottom = "auto";
      }
    };
    const focus = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select, [contenteditable=true]")) return;
      window.setTimeout(() => {
        var _a, _b;
        const top = (_a = viewport == null ? void 0 : viewport.offsetTop) != null ? _a : 0;
        const bottom = top + ((_b = viewport == null ? void 0 : viewport.height) != null ? _b : window.innerHeight) - 76;
        const rect = target.getBoundingClientRect();
        if (rect.top < top + 12 || rect.bottom > bottom) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 80);
    };
    update();
    viewport == null ? void 0 : viewport.addEventListener("resize", update, { passive: true });
    viewport == null ? void 0 : viewport.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    this.contentEl.addEventListener("focusin", focus);
    this.viewportCleanup = () => {
      viewport == null ? void 0 : viewport.removeEventListener("resize", update);
      viewport == null ? void 0 : viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      this.contentEl.removeEventListener("focusin", focus);
      this.modalEl.style.removeProperty("--gm-visible-viewport-height");
      this.modalEl.style.removeProperty("--gm-visible-viewport-top");
      if (container) {
        container.removeClass("gm-modal-viewport");
        container.style.removeProperty("top");
        container.style.removeProperty("height");
        container.style.removeProperty("bottom");
      }
    };
  }
  finishModal() {
    var _a;
    (_a = this.viewportCleanup) == null ? void 0 : _a.call(this);
    this.viewportCleanup = null;
  }
};
var TextPromptModal = class extends GrowthModal {
  constructor(app, title, placeholder, initial, resolve) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.initial = initial;
    this.resolve = resolve;
    this.settled = false;
  }
  onOpen() {
    this.prepareModal();
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
    this.finishModal();
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
};
var ChoiceModal = class extends GrowthModal {
  constructor(app, title, options, resolve) {
    super(app);
    this.title = title;
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
  }
  onOpen() {
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
  onClose() {
    this.finishModal();
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
};
var ContentComposer = class {
  constructor(app, container, body, attachments) {
    this.app = app;
    this.container = container;
    this.activeTextId = null;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.tokenCounter = 0;
    this.previewUrls = /* @__PURE__ */ new Map();
    this.blocks = parseContentBlocks(body, attachments);
    this.render();
  }
  value() {
    return {
      body: serializeContentBlocks(this.blocks),
      attachments: this.blocks.flatMap((block) => block.kind === "attachment" && block.attachment ? [block.attachment] : []),
      pendingAttachments: this.blocks.flatMap((block) => block.kind === "attachment" && block.pending ? [block.pending] : [])
    };
  }
  destroy() {
    for (const url of this.previewUrls.values()) URL.revokeObjectURL(url);
    this.previewUrls.clear();
  }
  render() {
    this.container.empty();
    this.blocks.forEach((block, index) => {
      if (block.kind === "text") this.renderText(block, index);
      else this.renderAttachment(block, index);
    });
    const addRow = this.container.createDiv("gm-composer-add-row");
    this.fileButton(addRow, "Image", "image", ".jpg,.jpeg,.png,.webp,.gif,image/*");
    this.fileButton(addRow, "File", "file", ".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain,text/markdown");
  }
  renderText(block, index) {
    const textarea = this.container.createEl("textarea", {
      cls: "gm-composer-text",
      attr: {
        placeholder: index === 0 ? "What do you want to remember?" : "Continue writing\u2026",
        rows: index === 0 ? "7" : "3",
        "data-gm-block-id": block.id
      }
    });
    textarea.value = block.value;
    const rememberSelection = () => {
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
  renderAttachment(block, index) {
    var _a, _b, _c, _d, _e;
    const attachment = block.attachment;
    const pending = block.pending;
    const name = (_b = (_a = attachment == null ? void 0 : attachment.name) != null ? _a : pending == null ? void 0 : pending.file.name) != null ? _b : "Attachment";
    const mimeType = (_d = (_c = attachment == null ? void 0 : attachment.mimeType) != null ? _c : pending == null ? void 0 : pending.file.type) != null ? _d : "";
    const isImage = mimeType.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(name);
    const card = this.container.createDiv(`gm-composer-attachment${isImage ? " is-image" : ""}`);
    if (isImage) {
      const url = this.previewUrl(block);
      if (url) card.createEl("img", { attr: { src: url, alt: name } });
    } else {
      const icon = card.createSpan("gm-composer-file-icon");
      (0, import_obsidian.setIcon)(icon, /\.pdf$/i.test(name) ? "file-text" : "file");
    }
    const text = card.createDiv("gm-composer-attachment-copy");
    text.createEl("strong", { text: name });
    const size = (_e = pending == null ? void 0 : pending.file.size) != null ? _e : attachment ? this.attachmentSize(attachment) : 0;
    text.createSpan({ text: `${this.fileKind(name)}${size ? ` \xB7 ${this.formatBytes(size)}` : ""}` });
    const remove = card.createEl("button", { cls: "gm-composer-remove", attr: { "aria-label": `Remove ${name} from content` } });
    (0, import_obsidian.setIcon)(remove, "x");
    remove.addEventListener("click", () => {
      this.blocks.splice(index, 1);
      this.mergeTextBlocks();
      this.render();
    });
  }
  fileButton(container, label, kind, accept) {
    const input = container.createEl("input", { cls: "gm-file-input", attr: { type: "file", accept } });
    input.multiple = true;
    const button = container.createEl("button", { text: `+ ${label}`, cls: "gm-composer-add" });
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      var _a;
      const files = Array.from((_a = input.files) != null ? _a : []);
      if (files.length) this.insertFiles(files, kind);
      input.value = "";
    });
  }
  insertFiles(files, kind) {
    var _a, _b;
    const valid = files.filter((file) => kind === "image" ? /\.(jpe?g|png|webp|gif)$/i.test(file.name) : /\.(pdf|docx?|txt|md)$/i.test(file.name));
    if (!valid.length) {
      new import_obsidian.Notice(kind === "image" ? "Choose an image file" : "Choose a PDF, Word, text, or Markdown file");
      return;
    }
    let index = this.blocks.findIndex((block) => block.kind === "text" && block.id === this.activeTextId);
    if (index < 0) index = this.blocks.map((block) => block.kind).lastIndexOf("text");
    if (index < 0) {
      this.blocks.push({ id: this.nextId("text"), kind: "text", value: "" });
      index = this.blocks.length - 1;
    }
    const text = this.blocks[index];
    const start = this.activeTextId === text.id ? this.selectionStart : text.value.length;
    const end = this.activeTextId === text.id ? this.selectionEnd : text.value.length;
    const before = text.value.slice(0, start);
    const after = text.value.slice(end);
    const replacement = [
      { id: text.id, kind: "text", value: before ? `${before.replace(/\s*$/, "")}

` : "" },
      ...valid.map((file) => ({ id: this.nextId("attachment"), kind: "attachment", pending: { token: this.nextId("pending"), file } })),
      { id: this.nextId("text"), kind: "text", value: after ? `

${after.replace(/^\s*/, "")}` : "\n\n" }
    ];
    this.blocks.splice(index, 1, ...replacement);
    this.activeTextId = (_b = (_a = replacement.at(-1)) == null ? void 0 : _a.id) != null ? _b : null;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.render();
    window.setTimeout(() => {
      var _a2, _b2;
      return (_b2 = this.container.querySelector(`[data-gm-block-id="${(_a2 = this.activeTextId) != null ? _a2 : ""}"]`)) == null ? void 0 : _b2.focus();
    }, 30);
  }
  previewUrl(block) {
    if (block.pending) {
      const existing = this.previewUrls.get(block.pending.token);
      if (existing) return existing;
      if (typeof URL.createObjectURL !== "function") return null;
      const url = URL.createObjectURL(block.pending.file);
      this.previewUrls.set(block.pending.token, url);
      return url;
    }
    const file = block.attachment ? this.app.vault.getAbstractFileByPath(block.attachment.path) : null;
    return file instanceof import_obsidian.TFile ? this.app.vault.getResourcePath(file) : null;
  }
  attachmentSize(attachment) {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    return file instanceof import_obsidian.TFile ? file.stat.size : 0;
  }
  mergeTextBlocks() {
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
  nextId(prefix) {
    this.tokenCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.tokenCounter}`;
  }
  fileKind(name) {
    var _a;
    return ((_a = name.split(".").pop()) == null ? void 0 : _a.toLocaleUpperCase()) || "FILE";
  }
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
};
var CapabilityPickerModal = class extends GrowthModal {
  constructor(app, capabilities, selectedIds, contextCapabilityId, recentCapabilityIds, onPick) {
    super(app);
    this.capabilities = capabilities;
    this.selectedIds = selectedIds;
    this.contextCapabilityId = contextCapabilityId;
    this.recentCapabilityIds = recentCapabilityIds;
    this.onPick = onPick;
    this.expanded = /* @__PURE__ */ new Set();
  }
  onOpen() {
    this.prepareModal("gm-capability-picker-modal");
    this.contentEl.createEl("h2", { text: "Add related capability" });
    const search = this.contentEl.createEl("input", { cls: "gm-text-input gm-capability-search", attr: { type: "search", placeholder: "Search capabilities\u2026" } });
    const results = this.contentEl.createDiv("gm-picker-content");
    const render = () => {
      results.empty();
      const query = search.value.trim();
      if (query) {
        this.pickerSection(results, "Results", searchCapabilities(this.capabilities, query, this.selectedIds).slice(0, 30));
        if (!results.childElementCount) results.createDiv({ text: "No matching capabilities", cls: "gm-picker-empty" });
        return;
      }
      this.pickerSection(results, "Suggested", suggestedCapabilities(this.capabilities, this.contextCapabilityId, this.selectedIds));
      this.pickerSection(results, "Focus", this.capabilities.filter((item) => item.status === "active" && item.focus && !this.selectedIds.has(item.id)).slice(0, 5));
      const recent = this.recentCapabilityIds.map((id) => this.capabilities.find((item) => item.id === id)).filter((item) => Boolean(item && item.status === "active" && !this.selectedIds.has(item.id))).slice(0, 5);
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
  pickerSection(container, title, capabilities) {
    if (!capabilities.length) return;
    container.createEl("h3", { text: title });
    for (const capability of capabilities) this.capabilityButton(container, capability);
  }
  capabilityButton(container, capability, depth = 0) {
    const button = container.createEl("button", { cls: "gm-picker-row" });
    button.style.setProperty("--gm-picker-depth", String(Math.min(depth, 4)));
    button.createEl("strong", { text: capability.name });
    button.createSpan({ text: fullCapabilityPath(capability.id, this.capabilities) });
    button.addEventListener("click", () => {
      this.onPick(capability.id);
      this.close();
    });
  }
  renderTreeNode(container, capability, depth, rerender) {
    const children = this.childrenOf(capability.id);
    const row = container.createDiv("gm-picker-tree-row");
    row.style.setProperty("--gm-picker-depth", String(Math.min(depth, 4)));
    const toggle = row.createEl("button", { cls: "gm-picker-toggle", attr: { "aria-label": children.length ? "Expand or collapse" : "No children" } });
    if (children.length) (0, import_obsidian.setIcon)(toggle, this.expanded.has(capability.id) ? "chevron-down" : "chevron-right");
    else toggle.disabled = true;
    toggle.addEventListener("click", () => {
      if (this.expanded.has(capability.id)) this.expanded.delete(capability.id);
      else this.expanded.add(capability.id);
      rerender();
    });
    this.capabilityButton(row, capability, depth);
    if (children.length && this.expanded.has(capability.id)) for (const child of children) this.renderTreeNode(container, child, depth + 1, rerender);
  }
  childrenOf(parentId) {
    return this.capabilities.filter((item) => item.status === "active" && item.parentId === parentId).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }
  onClose() {
    this.finishModal();
    this.contentEl.empty();
  }
};
var QuickCaptureModal = class extends GrowthModal {
  constructor(app, contextName, onSave) {
    super(app);
    this.contextName = contextName;
    this.onSave = onSave;
    this.composer = null;
  }
  onOpen() {
    this.prepareModal("gm-capture-modal");
    this.contentEl.createEl("h2", { text: "Record something" });
    if (this.contextName) this.contentEl.createDiv({ text: `Related to ${this.contextName}`, cls: "gm-context-pill" });
    const details = this.contentEl.createEl("details", { cls: "gm-optional-title" });
    details.createEl("summary", { text: "Add a title (optional)" });
    const title = details.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder: "Title" } });
    const composerHost = this.contentEl.createDiv("gm-composer");
    this.composer = new ContentComposer(this.app, composerHost, "", []);
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save to Inbox", cls: "mod-cta" });
    save.addEventListener("click", () => void this.submit(title.value, save));
    window.setTimeout(() => {
      var _a;
      return (_a = composerHost.querySelector(".gm-composer-text")) == null ? void 0 : _a.focus();
    }, 50);
  }
  async submit(title, button) {
    var _a, _b;
    const value = (_b = (_a = this.composer) == null ? void 0 : _a.value()) != null ? _b : { body: "", pendingAttachments: [] };
    if (!value.body && !title.trim() && !value.pendingAttachments.length) {
      new import_obsidian.Notice("Write something or add an attachment first");
      return;
    }
    button.disabled = true;
    try {
      await this.onSave(title.trim(), value.body, value.pendingAttachments);
      this.close();
      new import_obsidian.Notice("Saved to Growth Map Inbox");
    } catch (error) {
      button.disabled = false;
      new import_obsidian.Notice(error instanceof Error ? error.message : "Could not save capture");
    }
  }
  onClose() {
    var _a;
    (_a = this.composer) == null ? void 0 : _a.destroy();
    this.finishModal();
    this.contentEl.empty();
  }
};
var ContentFormModal = class extends GrowthModal {
  constructor(app, capabilities, initialCapabilityIds, initial, onSave, contextCapabilityId, recentCapabilityIds = [], onRecentCapabilities, mode = (initial == null ? void 0 : initial.body) ? "edit" : "new") {
    super(app);
    this.capabilities = capabilities;
    this.initial = initial;
    this.onSave = onSave;
    this.contextCapabilityId = contextCapabilityId;
    this.recentCapabilityIds = recentCapabilityIds;
    this.onRecentCapabilities = onRecentCapabilities;
    this.mode = mode;
    this.composer = null;
    this.selectedCapabilities = new Set(initialRelatedCapabilityIds(initialCapabilityIds, contextCapabilityId));
  }
  onOpen() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    this.prepareModal("gm-content-form-modal");
    const initialType = (_b = (_a = this.initial) == null ? void 0 : _a.type) != null ? _b : "knowledge";
    const heading = this.contentEl.createEl("h2", { text: this.modalTitle(initialType) });
    const form = this.contentEl.createDiv("gm-form");
    const title = this.inputField(form, "Title", "A clear, short title", (_d = (_c = this.initial) == null ? void 0 : _c.title) != null ? _d : "");
    const contentField = form.createDiv("gm-form-field gm-content-field");
    contentField.createEl("label", { text: "Content" });
    const composerHost = contentField.createDiv("gm-composer");
    this.composer = new ContentComposer(this.app, composerHost, (_f = (_e = this.initial) == null ? void 0 : _e.body) != null ? _f : "", (_h = (_g = this.initial) == null ? void 0 : _g.attachments) != null ? _h : []);
    const related = form.createDiv("gm-related-section");
    related.createEl("label", { text: "Related to" });
    const relatedList = related.createDiv("gm-related-list");
    const renderRelated = () => {
      relatedList.empty();
      if (!this.selectedCapabilities.size) relatedList.createSpan({ text: "None yet", cls: "gm-related-empty" });
      for (const id of this.selectedCapabilities) {
        const capability = this.capabilities.find((item) => item.id === id);
        if (!capability) continue;
        const chip = relatedList.createDiv("gm-related-chip");
        chip.createSpan({ text: fullCapabilityPath(id, this.capabilities) });
        const remove = chip.createEl("button", { attr: { "aria-label": `Remove ${capability.name}` } });
        (0, import_obsidian.setIcon)(remove, "x");
        remove.addEventListener("click", () => {
          this.selectedCapabilities.delete(id);
          renderRelated();
        });
      }
      const add = relatedList.createEl("button", { text: "+ Add", cls: "gm-related-add" });
      add.addEventListener("click", () => new CapabilityPickerModal(
        this.app,
        this.capabilities,
        this.selectedCapabilities,
        this.contextCapabilityId,
        this.recentCapabilityIds,
        (id) => {
          var _a2;
          this.selectedCapabilities.add(id);
          const recent = updateRecentCapabilityIds(this.recentCapabilityIds, [id]);
          void ((_a2 = this.onRecentCapabilities) == null ? void 0 : _a2.call(this, recent));
          renderRelated();
        }
      ).open());
    };
    renderRelated();
    const more = form.createEl("details", { cls: "gm-more-options" });
    more.createEl("summary", { text: "More options" });
    const options = more.createDiv("gm-more-options-grid");
    const type = this.selectField(options, "Type", ["knowledge", "case", "lesson", "hypothesis", "question"], initialType, (value) => CONTENT_LABELS[value]);
    const status = this.selectField(options, "Status", CONTENT_STATUSES.filter((item) => item !== "archived"), (_j = (_i = this.initial) == null ? void 0 : _i.status) != null ? _j : "draft");
    const confidence = this.selectField(options, "Confidence", CONFIDENCES, (_l = (_k = this.initial) == null ? void 0 : _k.confidence) != null ? _l : "low");
    const source = this.selectField(options, "Source type", SOURCE_TYPES, (_n = (_m = this.initial) == null ? void 0 : _m.sourceType) != null ? _n : "personal-observation");
    type.addEventListener("change", () => {
      heading.setText(this.modalTitle(type.value));
      if (type.value === "hypothesis") {
        status.value = "validating";
        confidence.value = "low";
      }
    });
    const actions = this.contentEl.createDiv("gm-modal-actions");
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta" });
    save.addEventListener("click", () => {
      var _a2, _b2;
      const content = (_b2 = (_a2 = this.composer) == null ? void 0 : _a2.value()) != null ? _b2 : { body: "", attachments: [], pendingAttachments: [] };
      void this.submit({
        type: type.value,
        title: title.value.trim(),
        body: content.body,
        capabilityIds: [...this.selectedCapabilities],
        status: status.value,
        confidence: confidence.value,
        sourceType: source.value,
        attachments: content.attachments,
        pendingAttachments: content.pendingAttachments
      }, save);
    });
  }
  modalTitle(type) {
    if (this.mode === "organize") return "Organize Inbox";
    return `${this.mode === "new" ? "New" : "Edit"} ${CONTENT_LABELS[type]}`;
  }
  inputField(container, labelText, placeholder, value) {
    const field = container.createDiv("gm-form-field");
    field.createEl("label", { text: labelText });
    const input = field.createEl("input", { cls: "gm-text-input", attr: { type: "text", placeholder } });
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
    var _a, _b, _c;
    if (!value.body && !value.title && !((_a = value.pendingAttachments) == null ? void 0 : _a.length) && !((_b = value.attachments) == null ? void 0 : _b.length)) {
      new import_obsidian.Notice("Add a title, content, or attachment");
      return;
    }
    if (value.sourceType === "ai-generated") {
      value.confidence = "low";
      if (value.status === "validated") value.status = "validating";
    }
    button.disabled = true;
    try {
      await ((_c = this.onSave) == null ? void 0 : _c.call(this, value));
      this.close();
      new import_obsidian.Notice("Saved to library");
    } catch (error) {
      button.disabled = false;
      new import_obsidian.Notice(error instanceof Error ? error.message : "Could not save content");
    }
  }
  onClose() {
    var _a;
    (_a = this.composer) == null ? void 0 : _a.destroy();
    this.finishModal();
    this.contentEl.empty();
  }
};
var ReferenceProtectionModal = class extends GrowthModal {
  constructor(app, capabilityName, referenceCount, onChoice) {
    super(app);
    this.capabilityName = capabilityName;
    this.referenceCount = referenceCount;
    this.onChoice = onChoice;
    this.settled = false;
  }
  onOpen() {
    this.prepareModal();
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
    this.finishModal();
    this.contentEl.empty();
    if (!this.settled) this.onChoice(null);
  }
};
var CheckpointListModal = class extends GrowthModal {
  constructor(app, paths) {
    super(app);
    this.paths = paths;
  }
  onOpen() {
    var _a, _b;
    this.prepareModal();
    this.contentEl.createEl("h2", { text: "Capability checkpoints" });
    if (this.paths.length === 0) this.contentEl.createEl("p", { text: "No checkpoints yet.", cls: "gm-muted" });
    const list = this.contentEl.createDiv("gm-checkpoint-list");
    for (const path of this.paths) list.createDiv({ text: (_b = (_a = path.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) != null ? _b : path, cls: "gm-checkpoint-row" });
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText("Done").setCta().onClick(() => this.close()));
  }
  onClose() {
    this.finishModal();
    this.contentEl.empty();
  }
};

// src/repository.ts
var import_obsidian2 = require("obsidian");
var FOLDERS = [
  "00 System",
  "00 System/Checkpoints",
  "00 System/Growth Events",
  "00 System/Connections",
  "01 Capabilities",
  "02 Knowledge",
  "03 Cases",
  "04 Hypotheses",
  "05 Lessons",
  "06 Questions",
  "07 Inbox",
  "08 Attachments",
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
var GROWTH_EVENT_FOLDER = "00 System/Growth Events";
var CONNECTION_FOLDER = "00 System/Connections";
var ATTACHMENT_FOLDER = "08 Attachments";
var ALLOWED_ATTACHMENT_EXTENSIONS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "txt", "md"]);
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
function attachmentArray(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item;
    const path = stringValue(data.path);
    const name = stringValue(data.name);
    const added = stringValue(data.added);
    if (!path || !name || !added || path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) return [];
    return [{ path, name, added, mimeType: typeof data.mimeType === "string" ? data.mimeType : void 0 }];
  });
}
function metadataValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const entries = Object.entries(value).filter(
    (entry) => entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])
  );
  return entries.length ? Object.fromEntries(entries) : void 0;
}
function yamlLine(key, value) {
  return `${key}: ${value === null ? "null" : typeof value === "string" || Array.isArray(value) ? JSON.stringify(value) : String(value)}`;
}
function jsonLine(key, value) {
  return `${key}: ${JSON.stringify(value)}`;
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
  var _a;
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
  if ((_a = item.attachments) == null ? void 0 : _a.length) lines.push(yamlLine("attachments", item.attachments));
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
    attachments: attachmentArray(data.attachments),
    body,
    file
  };
}
function parseContent(markdown, file) {
  const { data, body } = parseSimpleFrontmatter(markdown);
  return contentFromData(data, body, file);
}
function cloneContent(item) {
  var _a;
  return {
    ...item,
    capabilityIds: [...item.capabilityIds],
    attachments: (_a = item.attachments) == null ? void 0 : _a.map((attachment) => ({ ...attachment }))
  };
}
function growthEventMarkdown(event) {
  const lines = [
    "---",
    yamlLine("gmType", "growth-event"),
    yamlLine("id", event.id),
    yamlLine("timestamp", event.timestamp),
    yamlLine("eventType", event.eventType),
    yamlLine("capabilityIds", event.capabilityIds)
  ];
  if (event.contentId) lines.push(yamlLine("contentId", event.contentId));
  if (event.fromStage !== void 0) lines.push(yamlLine("fromStage", event.fromStage));
  if (event.toStage !== void 0) lines.push(yamlLine("toStage", event.toStage));
  if (event.metadata) lines.push(jsonLine("metadata", event.metadata));
  lines.push("---", "", "# Growth Event", "", "Recorded automatically by Growth Map.", "");
  return lines.join("\n");
}
function growthEventFromData(data) {
  const eventTypes = ["capability-stage-changed", "content-created", "content-converted", "focus-added", "focus-removed"];
  if (data.gmType !== "growth-event" || typeof data.id !== "string" || !eventTypes.includes(data.eventType)) return null;
  return {
    id: data.id,
    timestamp: stringValue(data.timestamp),
    eventType: data.eventType,
    capabilityIds: stringArray(data.capabilityIds),
    contentId: typeof data.contentId === "string" ? data.contentId : void 0,
    fromStage: typeof data.fromStage === "number" ? data.fromStage : void 0,
    toStage: typeof data.toStage === "number" ? data.toStage : void 0,
    metadata: metadataValue(data.metadata)
  };
}
function connectionMarkdown(connection) {
  const lines = [
    "---",
    yamlLine("gmType", "capability-connection"),
    yamlLine("fromId", connection.fromId),
    yamlLine("toId", connection.toId),
    yamlLine("pinned", connection.pinned),
    yamlLine("created", connection.created)
  ];
  if (connection.note) lines.push(yamlLine("note", connection.note));
  lines.push("---", "", "# Capability Connection", "", "> Observed association. Pinning does not assert causation or dependency.", "");
  return lines.join("\n");
}
function connectionFromData(data) {
  if (data.gmType !== "capability-connection" || typeof data.fromId !== "string" || typeof data.toId !== "string") return null;
  return {
    fromId: data.fromId,
    toId: data.toId,
    pinned: boolValue(data.pinned),
    note: typeof data.note === "string" ? data.note : void 0,
    created: stringValue(data.created, nowIso())
  };
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
    this.growthEventCache = /* @__PURE__ */ new Map();
    this.pinnedConnectionCache = null;
    this.connectionCache = null;
  }
  invalidate(path) {
    if (!path || path.startsWith("01 Capabilities/")) this.capabilityCache = null;
    if (!path || MANAGED_CONTENT_FOLDERS.some((folder) => path.startsWith(`${folder}/`))) {
      this.contentCache = null;
      this.contentMetadataCache = null;
      this.connectionCache = null;
    }
    if (!path || path.startsWith(`${GROWTH_EVENT_FOLDER}/`)) this.growthEventCache.clear();
    if (!path || path.startsWith(`${CONNECTION_FOLDER}/`)) {
      this.pinnedConnectionCache = null;
      this.connectionCache = null;
    }
  }
  isManagedPath(path) {
    return path.startsWith("01 Capabilities/") || MANAGED_CONTENT_FOLDERS.some((folder) => path.startsWith(`${folder}/`)) || path.startsWith(`${GROWTH_EVENT_FOLDER}/`) || path.startsWith(`${CONNECTION_FOLDER}/`);
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
    const before = (await this.loadCapabilities()).find((item) => item.id === capability.id);
    if (structural && this.getSettings().checkpointBeforeChanges) await this.createCheckpoint(label);
    capability.updated = nowIso();
    await this.writeCapability(capability);
    this.invalidate();
    if (before && before.stage !== capability.stage) {
      await this.recordEventSafely({
        eventType: "capability-stage-changed",
        capabilityIds: [capability.id],
        fromStage: before.stage,
        toStage: capability.stage
      });
    }
    if (before && before.focus !== capability.focus) {
      await this.recordEventSafely({
        eventType: capability.focus ? "focus-added" : "focus-removed",
        capabilityIds: [capability.id]
      });
    }
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
    if (this.contentCache && !force) return this.contentCache.map(cloneContent);
    const files = this.app.vault.getMarkdownFiles().filter((file) => MANAGED_CONTENT_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)));
    const contents = [];
    for (const file of files) {
      const item = parseContent(await this.app.vault.cachedRead(file), file);
      if (item) contents.push(item);
    }
    this.contentCache = contents;
    return contents.map(cloneContent);
  }
  async loadContentMetadata(force = false) {
    var _a;
    if (this.contentMetadataCache && !force) return this.contentMetadataCache.map(cloneContent);
    const files = this.app.vault.getMarkdownFiles().filter((file) => MANAGED_CONTENT_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)));
    const contents = [];
    for (const file of files) {
      const cached = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      const item = cached ? contentFromData(cached, "", file) : parseContent(await this.app.vault.cachedRead(file), file);
      if (item) contents.push(item);
    }
    this.contentMetadataCache = contents;
    return contents.map(cloneContent);
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    await this.ensureFolder(CONTENT_FOLDERS[input.type]);
    const timestamp = nowIso();
    const title = (_b = (_a = input.title) == null ? void 0 : _a.trim()) != null ? _b : "";
    const savedAttachments = ((_c = input.attachmentFiles) == null ? void 0 : _c.length) ? await this.saveAttachmentFiles(input.attachmentFiles) : [];
    const materialized = await this.materializePendingAttachments(input.body, (_d = input.pendingAttachments) != null ? _d : []);
    const attachments = [...(_e = input.attachments) != null ? _e : [], ...savedAttachments, ...materialized.attachments];
    const item = {
      id: makeId(CONTENT_PREFIXES[input.type]),
      type: input.type,
      title,
      body: input.type === "inbox" ? materialized.body.trim() : templateFor(input.type, materialized.body),
      capabilityIds: [...new Set((_f = input.capabilityIds) != null ? _f : [])],
      status: (_g = input.status) != null ? _g : input.type === "hypothesis" ? "validating" : "draft",
      confidence: (_h = input.confidence) != null ? _h : "low",
      sourceType: (_i = input.sourceType) != null ? _i : "personal-observation",
      created: timestamp,
      updated: timestamp,
      attachments: attachments.length ? attachments : void 0
    };
    const file = await this.app.vault.create(this.contentPath(item), contentMarkdown(item));
    this.invalidate(file.path);
    await this.recordEventSafely({
      eventType: "content-created",
      capabilityIds: item.capabilityIds,
      contentId: item.id,
      metadata: { contentType: item.type }
    });
    return { ...item, file };
  }
  async updateContent(item, pendingAttachments = []) {
    var _a;
    if (pendingAttachments.length) {
      const materialized = await this.materializePendingAttachments(item.body, pendingAttachments);
      item.body = materialized.body;
      item.attachments = [...(_a = item.attachments) != null ? _a : [], ...materialized.attachments];
    }
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
  async convertInbox(item, type, pendingAttachments = []) {
    var _a;
    if (item.type !== "inbox") return item;
    const previousId = item.id;
    if (pendingAttachments.length) {
      const materialized = await this.materializePendingAttachments(item.body, pendingAttachments);
      item.body = materialized.body;
      item.attachments = [...(_a = item.attachments) != null ? _a : [], ...materialized.attachments];
    }
    item.type = type;
    item.id = makeId(CONTENT_PREFIXES[type]);
    item.status = type === "hypothesis" ? "validating" : "draft";
    item.body = templateFor(type, item.body);
    const converted = await this.updateContent(item);
    await this.recordEventSafely({
      eventType: "content-converted",
      capabilityIds: item.capabilityIds,
      contentId: item.id,
      metadata: { fromType: "inbox", toType: type, previousId }
    });
    return converted;
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
  async materializePendingAttachments(body, pending) {
    if (!pending.length) return { body, attachments: [] };
    const attachments = await this.saveAttachmentFiles(pending.map((item) => item.file));
    let materializedBody = body;
    pending.forEach((item, index) => {
      materializedBody = materializedBody.split(pendingAttachmentMarker(item.token)).join(attachmentEmbed(attachments[index].path));
    });
    return { body: materializedBody, attachments };
  }
  async saveAttachmentFiles(files) {
    var _a, _b;
    const unsupported = files.find((file) => {
      var _a2, _b2;
      return !ALLOWED_ATTACHMENT_EXTENSIONS.has((_b2 = (_a2 = file.name.split(".").pop()) == null ? void 0 : _a2.toLocaleLowerCase()) != null ? _b2 : "");
    });
    if (unsupported) throw new Error(`Unsupported attachment type: ${unsupported.name}`);
    await this.ensureFolder(ATTACHMENT_FOLDER);
    const saved = [];
    for (const file of files) {
      const extension = (_b = (_a = file.name.split(".").pop()) == null ? void 0 : _a.toLocaleLowerCase()) != null ? _b : "";
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) throw new Error(`Unsupported attachment type: ${file.name}`);
      const path = (0, import_obsidian2.normalizePath)(uniqueAttachmentPath(file.name, (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate))));
      const created = await this.app.vault.createBinary(path, await file.arrayBuffer());
      saved.push({ path: created.path, name: file.name, mimeType: file.type || void 0, added: nowIso() });
    }
    return saved;
  }
  async recordGrowthEvent(input) {
    var _a, _b;
    const event = {
      ...input,
      id: (_a = input.id) != null ? _a : makeId("EVT"),
      timestamp: (_b = input.timestamp) != null ? _b : nowIso(),
      capabilityIds: [...new Set(input.capabilityIds)]
    };
    const monthFolder = (0, import_obsidian2.normalizePath)(`${GROWTH_EVENT_FOLDER}/${event.timestamp.slice(0, 7)}`);
    await this.ensureFolder(GROWTH_EVENT_FOLDER);
    await this.ensureFolder(monthFolder);
    const stamp = event.timestamp.replace(/[:.]/g, "-");
    let path = (0, import_obsidian2.normalizePath)(`${monthFolder}/${stamp} ${event.id}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = (0, import_obsidian2.normalizePath)(`${monthFolder}/${stamp} ${event.id}-${suffix}.md`);
      suffix += 1;
    }
    await this.app.vault.create(path, growthEventMarkdown(event));
    this.invalidate(path);
    return event;
  }
  async loadGrowthEvents(start, end = /* @__PURE__ */ new Date(), force = false) {
    var _a, _b;
    const cacheKey = `${(_a = start == null ? void 0 : start.toISOString()) != null ? _a : "all"}|${end.toISOString()}`;
    const cached = this.growthEventCache.get(cacheKey);
    if (cached && !force) return cached.map((event) => ({ ...event, capabilityIds: [...event.capabilityIds], metadata: event.metadata ? { ...event.metadata } : void 0 }));
    const startMonth = start == null ? void 0 : start.toISOString().slice(0, 7);
    const endMonth = end.toISOString().slice(0, 7);
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (!file.path.startsWith(`${GROWTH_EVENT_FOLDER}/`)) return false;
      const month = file.path.slice(GROWTH_EVENT_FOLDER.length + 1, GROWTH_EVENT_FOLDER.length + 8);
      return (!startMonth || month >= startMonth) && month <= endMonth;
    });
    const events = [];
    for (const file of files) {
      const cachedData = (_b = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _b.frontmatter;
      const data = cachedData != null ? cachedData : parseSimpleFrontmatter(await this.app.vault.cachedRead(file)).data;
      const event = growthEventFromData(data);
      if (!event) continue;
      const time = new Date(event.timestamp).getTime();
      if ((!start || time >= start.getTime()) && time <= end.getTime()) events.push(event);
    }
    events.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    this.growthEventCache.set(cacheKey, events);
    return events.map((event) => ({ ...event, capabilityIds: [...event.capabilityIds], metadata: event.metadata ? { ...event.metadata } : void 0 }));
  }
  async loadPinnedConnections(force = false) {
    var _a;
    if (this.pinnedConnectionCache && !force) return this.pinnedConnectionCache.map((item) => ({ ...item }));
    const connections = [];
    for (const file of this.app.vault.getMarkdownFiles().filter((candidate) => candidate.path.startsWith(`${CONNECTION_FOLDER}/`))) {
      const cached = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      const data = cached != null ? cached : parseSimpleFrontmatter(await this.app.vault.cachedRead(file)).data;
      const connection = connectionFromData(data);
      if (connection) connections.push(connection);
    }
    this.pinnedConnectionCache = connections;
    return connections.map((item) => ({ ...item }));
  }
  async loadConnections(force = false) {
    if (this.connectionCache && !force) return this.connectionCache.map((item) => ({ ...item, sharedContentIds: [...item.sharedContentIds], counts: { ...item.counts } }));
    const connections = calculateConnections(await this.loadContentMetadata(), await this.loadPinnedConnections());
    this.connectionCache = connections;
    return connections.map((item) => ({ ...item, sharedContentIds: [...item.sharedContentIds], counts: { ...item.counts } }));
  }
  async pinConnection(firstId, secondId, pinned, note) {
    var _a;
    if (firstId === secondId) throw new Error("A capability cannot connect to itself");
    await this.ensureFolder(CONNECTION_FOLDER);
    const [fromId, toId] = connectionKey(firstId, secondId).split("::");
    const existing = (await this.loadPinnedConnections()).find((item) => connectionKey(item.fromId, item.toId) === connectionKey(fromId, toId));
    const connection = {
      fromId,
      toId,
      pinned,
      note: (note == null ? void 0 : note.trim()) || (existing == null ? void 0 : existing.note),
      created: (_a = existing == null ? void 0 : existing.created) != null ? _a : nowIso()
    };
    const path = (0, import_obsidian2.normalizePath)(`${CONNECTION_FOLDER}/CONN-${fromId}--${toId}.md`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian2.TFile) await this.app.vault.modify(file, connectionMarkdown(connection));
    else await this.app.vault.create(path, connectionMarkdown(connection));
    this.invalidate(path);
    return connection;
  }
  async recordEventSafely(input) {
    try {
      await this.recordGrowthEvent(input);
    } catch (error) {
      this.log(`Could not record Growth Event: ${error instanceof Error ? error.message : String(error)}`);
    }
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

// src/mobile-layout.ts
function computeMobileBottomOffset(isMobile, viewportBottom, safeAreaInset, candidates, gap = 8) {
  if (!isMobile) return 0;
  const nativeHeight = candidates.reduce((largest, rect) => {
    const distanceFromBottom = viewportBottom - rect.bottom;
    const visibleHeight = viewportBottom - rect.top;
    const isNearViewportBottom = distanceFromBottom >= -2 && distanceFromBottom <= Math.max(96, safeAreaInset + 16);
    if (!isNearViewportBottom || visibleHeight < 24 || visibleHeight > 180) return largest;
    return Math.max(largest, visibleHeight);
  }, 0);
  const safeInset = Math.max(0, safeAreaInset);
  return Math.ceil(nativeHeight > 0 ? Math.max(nativeHeight, safeInset) + gap : safeInset);
}

// src/timeline.ts
var DAY = 864e5;
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function startOfMonth(year, month) {
  return new Date(year, month, 1);
}
function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}
function monthName(date) {
  return date.toLocaleDateString("en", { month: "short" }).toUpperCase();
}
function dayRangeLabel(start, endExclusive) {
  const end = addDays(endExclusive, -1);
  if (start.getMonth() === end.getMonth()) return { label: monthName(start), detail: `${start.getDate()}\u2013${end.getDate()}` };
  return { label: `${monthName(start)}\u2013${monthName(end)}`, detail: `${start.getDate()}\u2013${end.getDate()}` };
}
function timelineRangeStart(range, now = /* @__PURE__ */ new Date()) {
  const tomorrow = addDays(startOfDay(now), 1);
  if (range === "all") return null;
  if (range === "30d") return addDays(tomorrow, -30);
  if (range === "3m") return startOfMonth(now.getFullYear(), now.getMonth() - 2);
  if (range === "6m") return startOfMonth(now.getFullYear(), now.getMonth() - 5);
  return startOfMonth(now.getFullYear(), now.getMonth() - 11);
}
function naturalTimelineBuckets(range, now = /* @__PURE__ */ new Date(), earliest) {
  const tomorrow = addDays(startOfDay(now), 1);
  if (range === "30d") {
    const start = addDays(tomorrow, -30);
    return Array.from({ length: 6 }, (_, index) => {
      const bucketStart = addDays(start, index * 5);
      const bucketEnd = addDays(bucketStart, 5);
      return { start: bucketStart.getTime(), end: bucketEnd.getTime(), ...dayRangeLabel(bucketStart, bucketEnd) };
    });
  }
  if (range === "3m") {
    const first = startOfMonth(now.getFullYear(), now.getMonth() - 2);
    const buckets = [];
    for (let month = 0; month < 3; month += 1) {
      const monthStart = startOfMonth(first.getFullYear(), first.getMonth() + month);
      const secondHalf = new Date(monthStart.getFullYear(), monthStart.getMonth(), 16);
      const monthEnd = startOfMonth(monthStart.getFullYear(), monthStart.getMonth() + 1);
      const isCurrent = monthStart.getFullYear() === now.getFullYear() && monthStart.getMonth() === now.getMonth();
      const currentFirstHalf = isCurrent && now.getDate() < 16;
      buckets.push({
        start: monthStart.getTime(),
        end: (currentFirstHalf ? tomorrow : secondHalf).getTime(),
        label: monthName(monthStart),
        detail: currentFirstHalf ? "1\u2013NOW" : "1\u201315"
      });
      buckets.push({
        start: secondHalf.getTime(),
        end: (isCurrent && !currentFirstHalf ? tomorrow : monthEnd).getTime(),
        label: monthName(monthStart),
        detail: isCurrent && !currentFirstHalf ? "16\u2013NOW" : `16\u2013${addDays(monthEnd, -1).getDate()}`
      });
    }
    return buckets;
  }
  if (range === "6m") {
    const first = startOfMonth(now.getFullYear(), now.getMonth() - 5);
    return Array.from({ length: 6 }, (_, index) => {
      const bucketStart = startOfMonth(first.getFullYear(), first.getMonth() + index);
      const next = startOfMonth(bucketStart.getFullYear(), bucketStart.getMonth() + 1);
      const isCurrent = bucketStart.getFullYear() === now.getFullYear() && bucketStart.getMonth() === now.getMonth();
      return { start: bucketStart.getTime(), end: (isCurrent ? tomorrow : next).getTime(), label: monthName(bucketStart) };
    });
  }
  if (range === "1y") {
    const first = startOfMonth(now.getFullYear(), now.getMonth() - 11);
    return Array.from({ length: 6 }, (_, index) => {
      const bucketStart = startOfMonth(first.getFullYear(), first.getMonth() + index * 2);
      const next = startOfMonth(bucketStart.getFullYear(), bucketStart.getMonth() + 2);
      const end = next > tomorrow ? tomorrow : next;
      const lastMonth = startOfMonth(end.getFullYear(), end.getMonth() - (end.getDate() === 1 ? 1 : 0));
      return { start: bucketStart.getTime(), end: end.getTime(), label: `${monthName(bucketStart)}\u2013${monthName(lastMonth)}` };
    });
  }
  return allBuckets(earliest != null ? earliest : now, now, tomorrow);
}
function allBuckets(earliest, now, tomorrow) {
  const first = startOfDay(earliest);
  const spanYears = Math.max(0, (now.getTime() - first.getTime()) / (365.2425 * DAY));
  const buckets = [];
  if (spanYears <= 2) {
    let cursor = new Date(first.getFullYear(), Math.floor(first.getMonth() / 3) * 3, 1);
    while (cursor <= now) {
      const next = startOfMonth(cursor.getFullYear(), cursor.getMonth() + 3);
      buckets.push({ start: cursor.getTime(), end: (next > tomorrow ? tomorrow : next).getTime(), label: `Q${Math.floor(cursor.getMonth() / 3) + 1}`, detail: String(cursor.getFullYear()) });
      cursor = next;
    }
    return buckets;
  }
  if (spanYears <= 5) {
    let cursor = new Date(first.getFullYear(), first.getMonth() < 6 ? 0 : 6, 1);
    while (cursor <= now) {
      const next = startOfMonth(cursor.getFullYear(), cursor.getMonth() + 6);
      buckets.push({ start: cursor.getTime(), end: (next > tomorrow ? tomorrow : next).getTime(), label: cursor.getMonth() === 0 ? "JAN\u2013JUN" : "JUL\u2013DEC", detail: String(cursor.getFullYear()) });
      cursor = next;
    }
    return buckets;
  }
  const firstYear = first.getFullYear();
  const yearCount = now.getFullYear() - firstYear + 1;
  const step = Math.max(1, Math.ceil(yearCount / 12));
  for (let year = firstYear; year <= now.getFullYear(); year += step) {
    const start = new Date(year, 0, 1);
    const next = new Date(year + step, 0, 1);
    const endYear = Math.min(year + step - 1, now.getFullYear());
    buckets.push({ start: start.getTime(), end: (next > tomorrow ? tomorrow : next).getTime(), label: step === 1 ? String(year) : `${year}\u2013${endYear}` });
  }
  return buckets;
}
function timelineBucketIndex(timestamp, buckets) {
  const time = timestamp instanceof Date ? timestamp.getTime() : typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  return buckets.findIndex((bucket) => time >= bucket.start && time < bucket.end);
}

// src/view.ts
var VIEW_TYPE_GROWTH_MAP = "growth-map-view";
var CONTENT_PLURAL_LABELS = {
  knowledge: "Knowledge",
  case: "Cases",
  lesson: "Lessons",
  hypothesis: "Hypotheses",
  question: "Questions"
};
var GrowthMapView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.page = "home";
    this.mapMode = "tree";
    this.timeRange = "3m";
    this.selectedConnectionKey = null;
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
    this.bottomOffsetFrame = null;
    this.bottomBarResizeObserver = null;
    this.bottomBarMutationObserver = null;
    this.observedBottomBars = [];
    this.scheduleBottomOffsetUpdate = () => {
      if (this.bottomOffsetFrame !== null) window.cancelAnimationFrame(this.bottomOffsetFrame);
      this.bottomOffsetFrame = window.requestAnimationFrame(() => {
        this.bottomOffsetFrame = null;
        this.updateMobileBottomOffset();
      });
    };
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
    this.setupBottomOffsetTracking();
    await this.render();
    this.scheduleBottomOffsetUpdate();
  }
  async onClose() {
    var _a, _b, _c, _d;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.bottomOffsetFrame !== null) window.cancelAnimationFrame(this.bottomOffsetFrame);
    (_a = this.bottomBarResizeObserver) == null ? void 0 : _a.disconnect();
    (_b = this.bottomBarMutationObserver) == null ? void 0 : _b.disconnect();
    (_c = window.visualViewport) == null ? void 0 : _c.removeEventListener("resize", this.scheduleBottomOffsetUpdate);
    (_d = window.visualViewport) == null ? void 0 : _d.removeEventListener("scroll", this.scheduleBottomOffsetUpdate);
    window.removeEventListener("resize", this.scheduleBottomOffsetUpdate);
    window.removeEventListener("orientationchange", this.scheduleBottomOffsetUpdate);
    this.contentEl.style.removeProperty("--gm-mobile-bottom-offset");
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
    if (page === "connection") this.selectedConnectionKey = id != null ? id : null;
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
      else if (this.page === "timeline") await this.renderTimeline(scroll);
      else if (this.page === "library") await this.renderLibrary(scroll);
      else if (this.page === "ai") this.renderAI(scroll);
      else if (this.page === "archive") await this.renderArchive(scroll);
      else if (this.page === "capability") await this.renderCapability(scroll);
      else if (this.page === "content") await this.renderContent(scroll);
      else if (this.page === "connection") await this.renderConnectionDetail(scroll);
      this.renderFab(shell);
      this.renderNavigation(shell);
      this.scheduleBottomOffsetUpdate();
    } catch (error) {
      this.renderError(shell, error);
    }
  }
  setupBottomOffsetTracking() {
    var _a, _b;
    window.addEventListener("resize", this.scheduleBottomOffsetUpdate, { passive: true });
    window.addEventListener("orientationchange", this.scheduleBottomOffsetUpdate, { passive: true });
    (_a = window.visualViewport) == null ? void 0 : _a.addEventListener("resize", this.scheduleBottomOffsetUpdate, { passive: true });
    (_b = window.visualViewport) == null ? void 0 : _b.addEventListener("scroll", this.scheduleBottomOffsetUpdate, { passive: true });
    if (typeof ResizeObserver !== "undefined") this.bottomBarResizeObserver = new ResizeObserver(this.scheduleBottomOffsetUpdate);
    if (typeof MutationObserver !== "undefined") {
      this.bottomBarMutationObserver = new MutationObserver(this.scheduleBottomOffsetUpdate);
      this.bottomBarMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    }
    this.updateMobileBottomOffset();
  }
  updateMobileBottomOffset() {
    var _a, _b;
    const isMobile = import_obsidian4.Platform.isMobile || document.body.classList.contains("is-mobile") || document.body.classList.contains("emulate-mobile");
    if (!isMobile) {
      this.contentEl.style.setProperty("--gm-mobile-bottom-offset", "0px");
      this.observeBottomBars([]);
      return;
    }
    const viewport = window.visualViewport;
    const viewportBottom = ((_a = viewport == null ? void 0 : viewport.offsetTop) != null ? _a : 0) + ((_b = viewport == null ? void 0 : viewport.height) != null ? _b : window.innerHeight);
    const safeAreaInset = Number.parseFloat(getComputedStyle(this.contentEl).getPropertyValue("--gm-safe-area-probe")) || 0;
    const selectors = [
      ".mobile-navbar",
      ".mobile-navbar-container",
      ".mobile-bottom-bar",
      ".mobile-toolbar",
      ".workspace-drawer.mod-bottom"
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(","))).filter((element) => !this.contentEl.contains(element) && this.isVisibleBottomBar(element));
    const offset = computeMobileBottomOffset(
      true,
      viewportBottom,
      safeAreaInset,
      candidates.map((element) => element.getBoundingClientRect())
    );
    this.contentEl.style.setProperty("--gm-mobile-bottom-offset", `${offset}px`);
    this.observeBottomBars(candidates);
  }
  isVisibleBottomBar(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
  }
  observeBottomBars(elements) {
    if (!this.bottomBarResizeObserver) return;
    if (elements.length === this.observedBottomBars.length && elements.every((element, index) => element === this.observedBottomBars[index])) return;
    this.bottomBarResizeObserver.disconnect();
    for (const element of elements) this.bottomBarResizeObserver.observe(element);
    this.observedBottomBars = elements;
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
    const monthStart = timeRangeStart("30d");
    const monthEvents = await this.plugin.repository.loadGrowthEvents(monthStart);
    const active = capabilities.filter((item) => item.status === "active");
    const roots = active.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order);
    this.renderPageHeader(container, "My Growth", "GROWTH MAP", void 0, { icon: "archive", label: "Open archive", run: () => void this.navigate("archive") });
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
      this.applySpectrum(card, root.id, capabilities);
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
    const recordedContentIds = new Set(monthEvents.filter((event) => event.eventType === "content-created" && event.contentId).map((event) => event.contentId));
    const legacyNewItems = contents.filter((item) => item.created >= monthStart.toISOString() && !recordedContentIds.has(item.id)).length;
    const newItems = recordedContentIds.size + legacyNewItems;
    const stageChanges = monthEvents.filter((event) => event.eventType === "capability-stage-changed").length;
    const month = container.createEl("button", { cls: "gm-month-card" });
    const monthText = month.createDiv();
    monthText.createEl("strong", { text: "This Month" });
    monthText.createSpan({ text: `${newItems} new item${newItems === 1 ? "" : "s"} \xB7 ${stageChanges} stage change${stageChanges === 1 ? "" : "s"}` });
    const monthArrow = month.createSpan();
    (0, import_obsidian4.setIcon)(monthArrow, "chevron-right");
    month.addEventListener("click", () => void this.navigate("timeline"));
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
    this.renderPageHeader(container, "Growth Map", "MY GROWTH", void 0, { icon: "plus", label: "Add root area", run: () => void this.addCapability(null) });
    const modes = container.createDiv("gm-segmented");
    for (const mode of ["tree", "connections"]) {
      const button = modes.createEl("button", { text: mode === "tree" ? "Tree" : "Connections", cls: this.mapMode === mode ? "is-active" : "" });
      button.addEventListener("click", () => {
        this.mapMode = mode;
        void this.render();
      });
    }
    if (this.mapMode === "connections") {
      await this.renderConnections(container, capabilities);
      return;
    }
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
    this.applySpectrum(row, capability.id, capabilities);
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
    this.applySpectrum(hero, capability.id, capabilities);
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
    const recentEvents = (await this.plugin.repository.loadGrowthEvents(timeRangeStart("3m"))).filter(
      (event) => event.capabilityIds.some((id) => relevantIds.has(id))
    ).slice(0, 3);
    if (recentEvents.length) {
      this.sectionTitle(container, "Recent Growth");
      const growth = container.createDiv("gm-growth-list is-compact");
      for (const event of recentEvents) this.renderGrowthRow(growth, { ...event, recorded: true }, capabilities, contents);
    }
    const connections = (await this.plugin.repository.loadConnections()).filter(
      (item) => (item.strength > 0 || item.pinned) && (item.fromId === capability.id || item.toId === capability.id)
    ).slice(0, 5);
    if (connections.length) {
      this.sectionTitle(container, "Connected");
      const connectionList = container.createDiv("gm-connected-list");
      for (const connection of connections) {
        const otherId = connection.fromId === capability.id ? connection.toId : connection.fromId;
        const other = capabilities.find((item) => item.id === otherId);
        if (!other) continue;
        const row = connectionList.createEl("button", { cls: "gm-connected-row" });
        this.applySpectrum(row, other.id, capabilities);
        const text = row.createDiv();
        text.createEl("strong", { text: other.name });
        text.createSpan({ text: capabilityPath(other.id, capabilities).slice(0, -1).map((item) => item.name).join(" / ") || "Root area" });
        row.createEl("b", { text: String(connection.strength) });
        row.addEventListener("click", () => void this.navigate("connection", connectionKey(connection.fromId, connection.toId)));
      }
    }
    this.sectionTitle(container, "Library");
    const summary = container.createDiv("gm-library-summary");
    for (const type of ["knowledge", "case", "lesson", "hypothesis", "question"]) {
      const count = related.filter((item) => item.type === type).length;
      const stat = summary.createEl("button", { text: `${count} ${count === 1 ? CONTENT_LABELS[type] : CONTENT_PLURAL_LABELS[type]}` });
      stat.addEventListener("click", () => {
        this.libraryType = type;
        this.libraryCapability = capability.id;
        void this.navigate("library");
      });
    }
    const add = container.createEl("button", { text: "+ Add content", cls: "gm-inline-add" });
    add.addEventListener("click", () => this.openContentForm([capability.id], void 0, void 0, capability.id));
  }
  async renderTimeline(container) {
    var _a, _b, _c, _d;
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active");
    const contents = (await this.plugin.repository.loadContentMetadata()).filter((item) => item.status !== "archived");
    const start = timelineRangeStart(this.timeRange);
    const events = await this.plugin.repository.loadGrowthEvents(start);
    const recordedContentIds = new Set(events.filter((event) => event.eventType === "content-created" && event.contentId).map((event) => event.contentId));
    const activities = events.map((event) => ({ ...event, recorded: true }));
    for (const item of contents) {
      if (start && new Date(item.created) < start || recordedContentIds.has(item.id)) continue;
      activities.push({
        timestamp: item.created,
        eventType: "historical-content",
        capabilityIds: item.capabilityIds,
        contentId: item.id,
        recorded: false,
        metadata: { contentType: item.type }
      });
    }
    activities.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    this.renderPageHeader(container, "Growth Over Time", "TIMELINE");
    const ranges = container.createDiv("gm-range-chips");
    for (const range of ["30d", "3m", "6m", "1y", "all"]) {
      const label = range === "all" ? "All" : range.toUpperCase();
      const button = ranges.createEl("button", { text: label, cls: this.timeRange === range ? "is-active" : "" });
      button.addEventListener("click", () => {
        this.timeRange = range;
        void this.render();
      });
    }
    const last30Start = timelineRangeStart("30d");
    const last30Events = this.timeRange === "30d" ? events : await this.plugin.repository.loadGrowthEvents(last30Start);
    const last30Recorded = new Set(last30Events.filter((event) => event.eventType === "content-created" && event.contentId).map((event) => event.contentId));
    const last30Items = last30Recorded.size + contents.filter((item) => item.created >= last30Start.toISOString() && !last30Recorded.has(item.id)).length;
    const last30Stages = last30Events.filter((event) => event.eventType === "capability-stage-changed").length;
    const activeCounts = /* @__PURE__ */ new Map();
    for (const activity of activities.filter((item) => item.timestamp >= last30Start.toISOString())) {
      for (const id of activity.capabilityIds) {
        const root = capabilityPath(id, capabilities)[0];
        if (root) activeCounts.set(root.id, ((_a = activeCounts.get(root.id)) != null ? _a : 0) + 1);
      }
    }
    const mostActiveId = (_b = [...activeCounts].sort((left, right) => right[1] - left[1])[0]) == null ? void 0 : _b[0];
    const mostActive = (_d = (_c = capabilities.find((item) => item.id === mostActiveId)) == null ? void 0 : _c.name) != null ? _d : "\u2014";
    const summary = container.createDiv("gm-time-summary");
    this.timeSummary(summary, String(last30Items), "new items");
    this.timeSummary(summary, String(last30Stages), "stage changes");
    this.timeSummary(summary, mostActive, "most active");
    const roots = capabilities.filter((item) => item.parentId === null).sort((left, right) => left.order - right.order);
    const focus = capabilities.filter((item) => item.focus && item.parentId !== null);
    const rows = [...roots, ...focus].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
    const earliest = activities.length ? new Date(activities[activities.length - 1].timestamp) : null;
    const buckets = naturalTimelineBuckets(this.timeRange, /* @__PURE__ */ new Date(), earliest);
    const activitiesByBucket = buckets.map(() => []);
    for (const activity of activities) {
      const index = timelineBucketIndex(activity.timestamp, buckets);
      if (index >= 0) activitiesByBucket[index].push(activity);
    }
    this.sectionTitle(container, "Time Map", "activity \xB7 stage change");
    if (!activities.length) this.emptyState(container, "Changes recorded from v1.1.0 will appear here.");
    else {
      const map = container.createDiv("gm-time-map");
      map.style.setProperty("--gm-time-columns", String(buckets.length));
      const header = map.createDiv("gm-time-map-header");
      header.createSpan();
      for (const bucket of buckets) {
        const bucketLabel = header.createDiv("gm-time-bucket-label");
        bucketLabel.createEl("strong", { text: bucket.label });
        if (bucket.detail) bucketLabel.createSpan({ text: bucket.detail });
      }
      for (const rowCapability of rows) {
        const row = map.createDiv("gm-time-map-row");
        this.applySpectrum(row, rowCapability.id, capabilities);
        const label = row.createEl("button", { text: rowCapability.name, cls: "gm-time-row-label" });
        label.addEventListener("click", () => void this.navigate("capability", rowCapability.id));
        const relatedIds = descendantsOf(rowCapability.id, capabilities);
        relatedIds.add(rowCapability.id);
        for (const [bucketIndex] of buckets.entries()) {
          const cell = row.createDiv("gm-time-cell");
          const matches = activitiesByBucket[bucketIndex].filter((activity) => activity.capabilityIds.some((id) => relatedIds.has(id)));
          if (matches.length) {
            const hasStage = matches.some((activity) => activity.eventType === "capability-stage-changed");
            const allRecorded = matches.every((activity) => activity.recorded);
            const marker = cell.createEl("button", {
              cls: `gm-time-marker${hasStage ? " is-stage" : ""}${allRecorded ? "" : " is-existing"}`,
              attr: { "aria-label": matches.length === 1 ? this.activityLabel(matches[0], contents) : `${matches.length} growth activities` }
            });
            marker.addEventListener("click", () => void (matches.length === 1 ? this.showTimelineActivity(matches[0], capabilities, contents) : this.showTimelineBucket(matches, capabilities, contents)));
            if (matches.length > 1) marker.createSpan({ text: String(matches.length), cls: "gm-time-more" });
          }
        }
      }
    }
    container.createEl("p", {
      text: "Recorded Events are shown directly. Earlier content uses its Markdown created date; past stage changes are never inferred.",
      cls: "gm-timeline-note"
    });
    this.sectionTitle(container, "Recent Growth");
    if (!activities.length) return;
    const list = container.createDiv("gm-growth-list");
    let lastDay = "";
    for (const activity of activities.slice(0, 24)) {
      const eventDate = new Date(activity.timestamp);
      const today = /* @__PURE__ */ new Date();
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const day = eventDate.toDateString() === today.toDateString() ? "TODAY" : eventDate.toDateString() === yesterday.toDateString() ? "YESTERDAY" : eventDate.toLocaleDateString(void 0, { month: "short", day: "numeric" }).toUpperCase();
      if (day !== lastDay) {
        list.createEl("h3", { text: day });
        lastDay = day;
      }
      this.renderGrowthRow(list, activity, capabilities, contents);
    }
  }
  async renderConnections(container, capabilities) {
    const connections = (await this.plugin.repository.loadConnections()).filter(
      (item) => (item.strength > 0 || item.pinned) && capabilities.some((capability) => capability.id === item.fromId) && capabilities.some((capability) => capability.id === item.toId)
    );
    this.sectionTitle(container, "Emergent Connections", "observed through shared content");
    if (!connections.length) {
      this.emptyState(container, "Link one item to two capabilities and their connection will appear here.");
      return;
    }
    const list = container.createDiv("gm-connection-list");
    for (const connection of connections) {
      const from = capabilities.find((item) => item.id === connection.fromId);
      const to = capabilities.find((item) => item.id === connection.toId);
      const row = list.createEl("button", { cls: "gm-connection-row" });
      this.applySpectrum(row, from.id, capabilities);
      const names = row.createDiv();
      names.createEl("strong", { text: capabilityPath(from.id, capabilities).map((item) => item.name).join(" / ") });
      names.createSpan({ text: `Related through content \xB7 ${capabilityPath(to.id, capabilities).map((item) => item.name).join(" / ")}` });
      const strength = row.createDiv("gm-connection-strength");
      if (connection.pinned) {
        const pin = strength.createSpan();
        (0, import_obsidian4.setIcon)(pin, "pin");
      }
      strength.createEl("b", { text: String(connection.strength) });
      strength.createSpan({ text: connection.strength === 1 ? "shared item" : "shared items" });
      row.addEventListener("click", () => void this.navigate("connection", connectionKey(connection.fromId, connection.toId)));
    }
  }
  async renderConnectionDetail(container) {
    var _a;
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active");
    const connection = (await this.plugin.repository.loadConnections()).find((item) => connectionKey(item.fromId, item.toId) === this.selectedConnectionKey);
    if (!connection) {
      this.mapMode = "connections";
      await this.navigate("map");
      return;
    }
    const from = capabilities.find((item) => item.id === connection.fromId);
    const to = capabilities.find((item) => item.id === connection.toId);
    if (!from || !to) {
      await this.navigate("map");
      return;
    }
    this.renderPageHeader(container, "Capability Connection", "OBSERVED ASSOCIATION", () => {
      this.mapMode = "connections";
      void this.navigate("map");
    });
    const pair = container.createDiv("gm-connection-pair");
    this.applySpectrum(pair, from.id, capabilities);
    pair.createEl("strong", { text: capabilityPath(from.id, capabilities).map((item) => item.name).join(" / ") });
    pair.createSpan({ text: "Related through shared content" });
    pair.createEl("strong", { text: capabilityPath(to.id, capabilities).map((item) => item.name).join(" / ") });
    const actions = container.createDiv("gm-inline-actions");
    const pin = actions.createEl("button", { text: connection.pinned ? "Unpin Connection" : "Pin Connection", cls: connection.pinned ? "" : "mod-cta" });
    pin.addEventListener("click", async () => {
      await this.plugin.repository.pinConnection(from.id, to.id, !connection.pinned, connection.note);
      await this.render();
    });
    const note = actions.createEl("button", { text: connection.note ? "Edit Note" : "Add Why" });
    note.addEventListener("click", async () => {
      var _a2;
      const value = await promptText(this.app, "Why are they connected?", "Optional note", (_a2 = connection.note) != null ? _a2 : "");
      if (value === null) return;
      await this.plugin.repository.pinConnection(from.id, to.id, true, value);
      await this.render();
    });
    if (connection.note) container.createEl("p", { text: connection.note, cls: "gm-connection-note" });
    const breakdown = container.createDiv("gm-connection-breakdown");
    for (const type of ["case", "lesson", "knowledge", "hypothesis", "question", "inbox"]) {
      const count = (_a = connection.counts[type]) != null ? _a : 0;
      if (count) this.timeSummary(breakdown, String(count), CONTENT_LABELS[type]);
    }
    const contents = (await this.plugin.repository.loadContentMetadata()).filter((item) => connection.sharedContentIds.includes(item.id));
    this.sectionTitle(container, "Shared Content", `${connection.strength} item${connection.strength === 1 ? "" : "s"}`);
    if (contents.length) this.renderContentCards(container, contents, capabilities);
    else this.emptyState(container, "This pinned connection has no shared content yet.");
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
    const preview = container.createDiv("gm-markdown-preview");
    await this.renderContentBody(preview, item);
    if (item.capabilityIds.length) {
      const related = container.createDiv("gm-content-related");
      related.createEl("h2", { text: "Related to" });
      const links = related.createDiv("gm-content-capabilities");
      for (const id of item.capabilityIds) {
        const capability = capabilities.find((entry) => entry.id === id);
        if (!capability) continue;
        const button = links.createEl("button", { text: capabilityPath(capability.id, capabilities).map((entry) => entry.name).join(" / ") });
        button.addEventListener("click", () => void this.navigate("capability", capability.id));
      }
    }
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
      { page: "timeline", label: "Timeline", icon: "history" },
      { page: "library", label: "Library", icon: "library" }
    ]) {
      const active = this.page === item.page || item.page === "map" && (this.page === "capability" || this.page === "connection") || item.page === "library" && this.page === "content";
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
    new QuickCaptureModal(this.app, (_a = capability == null ? void 0 : capability.name) != null ? _a : null, async (title, content, pendingAttachments) => {
      await this.plugin.repository.createContent({ type: "inbox", title, body: content, capabilityIds: capability ? [capability.id] : [], pendingAttachments });
      if (capability) await this.rememberCapabilities([capability.id]);
      this.requestRefresh();
    }).open();
  }
  openContentForm(capabilityIds, initial, onSave, contextCapabilityId) {
    void this.plugin.repository.loadCapabilities().then((capabilities) => {
      new ContentFormModal(
        this.app,
        capabilities,
        capabilityIds,
        initial,
        onSave != null ? onSave : (async (value) => {
          await this.plugin.repository.createContent(value);
          await this.rememberCapabilities(value.capabilityIds);
          this.requestRefresh();
        }),
        contextCapabilityId,
        this.plugin.settings.recentCapabilityIds,
        (ids) => this.saveRecentCapabilities(ids),
        (initial == null ? void 0 : initial.body) ? "edit" : "new"
      ).open();
    });
  }
  organizeInbox(item, capabilities) {
    new ContentFormModal(this.app, capabilities, item.capabilityIds, {
      title: item.title,
      body: item.body,
      status: "draft",
      confidence: item.confidence,
      sourceType: item.sourceType,
      type: "knowledge",
      attachments: item.attachments
    }, async (value) => {
      item.body = value.body;
      item.attachments = value.attachments;
      const converted = await this.plugin.repository.convertInbox(item, value.type, value.pendingAttachments);
      converted.title = value.title;
      converted.capabilityIds = value.capabilityIds;
      converted.status = value.status;
      converted.confidence = value.confidence;
      converted.sourceType = value.sourceType;
      await this.plugin.repository.updateContent(converted);
      await this.rememberCapabilities(value.capabilityIds);
      this.selectedContentId = converted.id;
      await this.render();
    }, void 0, this.plugin.settings.recentCapabilityIds, (ids) => this.saveRecentCapabilities(ids), "organize").open();
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
        item.attachments = value.attachments;
        await this.plugin.repository.updateContent(item, value.pendingAttachments);
        await this.rememberCapabilities(value.capabilityIds);
        await this.render();
      }, void 0, this.plugin.settings.recentCapabilityIds, (ids) => this.saveRecentCapabilities(ids), "edit").open();
    }
  }
  async rememberCapabilities(ids) {
    await this.saveRecentCapabilities(updateRecentCapabilityIds(this.plugin.settings.recentCapabilityIds, ids));
  }
  async saveRecentCapabilities(ids) {
    this.plugin.settings.recentCapabilityIds = ids;
    await this.plugin.saveSettings();
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
    var _a;
    const list = container.createDiv("gm-content-list");
    for (const item of items) {
      const card = list.createEl("button", { cls: "gm-content-card" });
      const top = card.createDiv("gm-content-card-top");
      top.createSpan({ text: CONTENT_LABELS[item.type].toUpperCase(), cls: `gm-type gm-type-${item.type}` });
      top.createSpan({ text: relativeTime(item.updated), cls: "gm-muted" });
      card.createEl("strong", { text: this.contentTitle(item) });
      const capNames = item.capabilityIds.map((id) => {
        var _a2;
        return (_a2 = capabilities.find((entry) => entry.id === id)) == null ? void 0 : _a2.name;
      }).filter(Boolean).slice(0, 3).join(" \xB7 ");
      if (capNames) card.createSpan({ text: capNames, cls: "gm-content-path" });
      if ((_a = item.attachments) == null ? void 0 : _a.length) {
        const attachment = card.createSpan({ cls: "gm-attachment-indicator" });
        (0, import_obsidian4.setIcon)(attachment, "paperclip");
        attachment.createSpan({ text: String(item.attachments.length) });
      }
      card.addEventListener("click", () => void this.navigate("content", item.id));
    }
  }
  applySpectrum(element, capabilityId, capabilities) {
    const root = capabilityPath(capabilityId, capabilities)[0];
    if (root) element.style.setProperty("--gm-spectrum-hue", String(spectrumHue(root.id)));
  }
  timeSummary(container, value, label) {
    const item = container.createDiv("gm-time-summary-item");
    item.createEl("strong", { text: value });
    item.createSpan({ text: label });
  }
  activityLabel(activity, contents) {
    var _a, _b, _c, _d, _e, _f;
    const content = activity.contentId ? contents.find((item) => item.id === activity.contentId) : void 0;
    if (activity.eventType === "capability-stage-changed") return `Stage ${(_a = activity.fromStage) != null ? _a : "?"} \u2192 ${(_b = activity.toStage) != null ? _b : "?"}`;
    if (activity.eventType === "focus-added") return "Added to Focus";
    if (activity.eventType === "focus-removed") return "Removed from Focus";
    if (activity.eventType === "content-converted") return `Inbox \u2192 ${content ? CONTENT_LABELS[content.type] : String((_d = (_c = activity.metadata) == null ? void 0 : _c.toType) != null ? _d : "Library")}`;
    const label = content ? CONTENT_LABELS[content.type] : String((_f = (_e = activity.metadata) == null ? void 0 : _e.contentType) != null ? _f : "Content");
    return activity.recorded ? `New ${label}` : `${label} \xB7 existing created date`;
  }
  async showTimelineBucket(activities, capabilities, contents) {
    const choice = await chooseOption(this.app, "Growth activity", activities.map((activity, index) => ({
      label: this.activityLabel(activity, contents),
      value: index,
      description: activity.capabilityIds.map((id) => capabilityPath(id, capabilities).map((item) => item.name).join(" / ")).filter(Boolean).join(" \xB7 ") || "Unlinked content"
    })));
    if (choice !== null) await this.showTimelineActivity(activities[choice], capabilities, contents);
  }
  async showTimelineActivity(activity, capabilities, contents) {
    const path = activity.capabilityIds.map((id) => capabilityPath(id, capabilities).map((item) => item.name).join(" / ")).filter(Boolean).join(" \xB7 ") || "Unlinked content";
    const options = [{
      label: path,
      value: activity.capabilityIds[0] ? `cap:${activity.capabilityIds[0]}` : "close",
      description: this.activityLabel(activity, contents)
    }];
    if (activity.contentId && contents.some((item) => item.id === activity.contentId)) {
      options.push({ label: "Open related content", value: `content:${activity.contentId}`, description: activity.contentId });
    }
    const date = new Date(activity.timestamp).toLocaleDateString(void 0, { year: "numeric", month: "short", day: "numeric" });
    const choice = await chooseOption(this.app, date, options);
    if (choice == null ? void 0 : choice.startsWith("cap:")) await this.navigate("capability", choice.slice(4));
    else if (choice == null ? void 0 : choice.startsWith("content:")) await this.navigate("content", choice.slice(8));
  }
  renderGrowthRow(container, activity, capabilities, contents) {
    const row = container.createEl("button", { cls: "gm-growth-row" });
    const capabilityId = activity.capabilityIds[0];
    if (capabilityId) this.applySpectrum(row, capabilityId, capabilities);
    const marker = row.createSpan({ cls: `gm-growth-dot${activity.eventType === "capability-stage-changed" ? " is-stage" : ""}` });
    const text = row.createDiv();
    const path = activity.capabilityIds.map((id) => capabilityPath(id, capabilities).map((item) => item.name).join(" / ")).filter(Boolean).join(" \xB7 ");
    text.createEl("strong", { text: path || "Unlinked content" });
    text.createSpan({ text: this.activityLabel(activity, contents) });
    const eventDate = new Date(activity.timestamp);
    const today = /* @__PURE__ */ new Date();
    const sameDay = eventDate.toDateString() === today.toDateString();
    row.createSpan({
      text: `${sameDay ? "" : `${eventDate.toLocaleDateString(void 0, { month: "short", day: "numeric" })} \xB7 `}${eventDate.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" })}`,
      cls: "gm-muted gm-growth-time"
    });
    marker.setAttribute("aria-hidden", "true");
    row.addEventListener("click", () => void this.showTimelineActivity(activity, capabilities, contents));
  }
  async renderContentBody(container, item) {
    var _a;
    const blocks = parseContentBlocks(item.body, (_a = item.attachments) != null ? _a : []);
    for (const block of blocks) {
      if (block.kind === "text") {
        if (!block.value.trim()) continue;
        const segment = container.createDiv("gm-markdown-segment markdown-rendered");
        await import_obsidian4.MarkdownRenderer.render(this.app, block.value, segment, item.file.path, this);
        continue;
      }
      if (block.attachment) this.renderInlineAttachment(container, block.attachment);
    }
  }
  renderInlineAttachment(container, attachment) {
    var _a, _b, _c;
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    const extension = (_b = (_a = attachment.path.split(".").pop()) == null ? void 0 : _a.toLocaleLowerCase()) != null ? _b : "";
    const isImage = ((_c = attachment.mimeType) == null ? void 0 : _c.startsWith("image/")) || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
    if (isImage && file instanceof import_obsidian4.TFile) {
      const figure = container.createEl("figure", { cls: "gm-attachment-image gm-inline-attachment" });
      const image = figure.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: attachment.name, loading: "lazy" } });
      image.addEventListener("click", () => void this.openAttachment(file));
      figure.createEl("figcaption", { text: attachment.name });
      return;
    }
    const card = container.createEl("button", { cls: "gm-attachment-card gm-inline-attachment" });
    const icon = card.createSpan();
    (0, import_obsidian4.setIcon)(icon, extension === "pdf" ? "file-text" : extension === "doc" || extension === "docx" ? "file-type-2" : "file");
    const text = card.createDiv();
    text.createEl("strong", { text: attachment.name });
    text.createSpan({ text: `${extension.toUpperCase() || "FILE"}${file instanceof import_obsidian4.TFile ? ` \xB7 ${this.formatBytes(file.stat.size)}` : ""}` });
    card.createSpan({ text: "Open", cls: "gm-attachment-open" });
    if (file instanceof import_obsidian4.TFile) card.addEventListener("click", () => void this.openAttachment(file));
    else card.disabled = true;
  }
  async openAttachment(file) {
    try {
      await this.app.workspace.getLeaf(true).openFile(file);
    } catch (e) {
      new import_obsidian4.Notice("This attachment cannot be previewed on this device. Open it from the Vault to share or export it.");
    }
  }
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    this.addCommand({ id: "open-timeline", name: "Open Timeline", callback: () => void this.activateView("timeline") });
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
    new QuickCaptureModal(this.app, null, async (title, content, pendingAttachments) => {
      await this.repository.createContent({ type: "inbox", title, body: content, pendingAttachments });
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
