import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { capabilityPath, descendantsOf, progressFor, relativeTime } from "./core";
import {
  CheckpointListModal,
  ContentFormModal,
  QuickCaptureModal,
  ReferenceProtectionModal,
  chooseOption,
  promptText,
  type ContentFormValue
} from "./modals";
import type GrowthMapPlugin from "./main";
import {
  CONTENT_LABELS,
  STAGE_LABELS,
  type Capability,
  type ContentType,
  type LoadedContent,
  type MainPage
} from "./types";

export const VIEW_TYPE_GROWTH_MAP = "growth-map-view";

type LibraryTypeFilter = ContentType | "all";

export class GrowthMapView extends ItemView {
  private page: MainPage = "home";
  private selectedCapabilityId: string | null = null;
  private selectedContentId: string | null = null;
  private expanded = new Set<string>();
  private expandedInitialized = false;
  private libraryType: LibraryTypeFilter = "all";
  private librarySearch = "";
  private libraryArea = "all";
  private libraryCapability = "all";
  private libraryStatus = "all";
  private libraryConfidence = "all";
  private refreshTimer: number | null = null;
  private initializing = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: GrowthMapPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GROWTH_MAP;
  }

  getDisplayText(): string {
    return "Growth Map";
  }

  getIcon(): string {
    return "sprout";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("growth-map-view");
    await this.render();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.contentEl.empty();
  }

  requestRefresh(): void {
    if (this.initializing) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.render();
    }, 250);
  }

  async navigate(page: MainPage, id?: string): Promise<void> {
    this.page = page;
    if (page === "capability") this.selectedCapabilityId = id ?? null;
    if (page === "content") this.selectedContentId = id ?? null;
    await this.render();
  }

  async openSearch(): Promise<void> {
    this.page = "library";
    await this.render();
    const input = this.contentEl.querySelector<HTMLInputElement>(".gm-search-input");
    input?.focus();
  }

  openQuickCapture(capabilityId?: string): void {
    void this.launchQuickCapture(capabilityId ?? (this.page === "capability" ? this.selectedCapabilityId ?? undefined : undefined));
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    const shell = this.contentEl.createDiv("gm-shell");
    try {
      if (!(await this.plugin.repository.isInitialized())) {
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

  private renderWelcome(container: HTMLElement): void {
    const welcome = container.createDiv("gm-welcome");
    const mark = welcome.createDiv("gm-welcome-mark");
    setIcon(mark, "sprout");
    welcome.createEl("p", { text: "GROWTH MAP", cls: "gm-eyebrow" });
    welcome.createEl("h1", { text: "Welcome to Growth Map" });
    welcome.createEl("p", {
      text: "Build a map of what you're learning, what you've experienced, and what you're becoming.",
      cls: "gm-welcome-copy"
    });
    const button = welcome.createEl("button", { text: "Initialize My Growth", cls: "gm-primary-button" });
    button.addEventListener("click", () => void this.initialize(button));
    welcome.createEl("p", { text: "Offline · Markdown · Yours", cls: "gm-welcome-footnote" });
  }

  private async initialize(button: HTMLButtonElement): Promise<void> {
    this.initializing = true;
    button.disabled = true;
    button.setText("Initializing…");
    try {
      await this.plugin.repository.initialize();
      this.initializing = false;
      new Notice("Growth Map is ready");
      this.page = "home";
      await this.render();
    } catch (error) {
      this.initializing = false;
      button.disabled = false;
      button.setText("Initialize My Growth");
      new Notice(error instanceof Error ? error.message : "Initialization failed");
    }
  }

  private renderPageHeader(container: HTMLElement, title: string, subtitle?: string, back?: () => void, action?: { icon: string; label: string; run: () => void }): void {
    const header = container.createDiv("gm-page-header");
    const leading = header.createDiv("gm-header-leading");
    if (back) {
      const backButton = leading.createEl("button", { cls: "gm-icon-button", attr: { "aria-label": "Back" } });
      setIcon(backButton, "chevron-left");
      backButton.addEventListener("click", back);
    }
    const titles = leading.createDiv();
    if (subtitle) titles.createEl("p", { text: subtitle, cls: "gm-eyebrow" });
    titles.createEl("h1", { text: title });
    if (action) {
      const button = header.createEl("button", { cls: "gm-icon-button", attr: { "aria-label": action.label } });
      setIcon(button, action.icon);
      button.addEventListener("click", action.run);
    }
  }

  private async renderHome(container: HTMLElement): Promise<void> {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const contents = await this.plugin.repository.loadContentMetadata();
    const active = capabilities.filter((item) => item.status === "active");
    const roots = active.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order);
    this.renderPageHeader(container, "Your Growth Map", "MY GROWTH", undefined, { icon: "archive", label: "Open archive", run: () => void this.navigate("archive") });

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
    setIcon(addIcon, "plus");
    addArea.createSpan({ text: "Add area" });
    addArea.addEventListener("click", () => void this.addCapability(null));

    const focus = active.filter((item) => item.focus).slice(0, 5);
    this.sectionTitle(container, "Focus", focus.length ? undefined : "Choose up to five capabilities");
    if (focus.length === 0) {
      const empty = container.createEl("button", { text: "Set your first focus", cls: "gm-empty-action" });
      empty.addEventListener("click", () => void this.chooseFocus());
    } else {
      const list = container.createDiv("gm-focus-list");
      for (const capability of focus) {
        const row = list.createEl("button", { cls: "gm-focus-row" });
        const text = row.createDiv();
        text.createEl("strong", { text: capability.name });
        text.createEl("span", { text: capabilityPath(capability.id, active).slice(0, -1).map((item) => item.name).join(" → ") || "Root area" });
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

  private async renderMap(container: HTMLElement): Promise<void> {
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active");
    this.renderPageHeader(container, "Capability Map", "MY GROWTH", undefined, { icon: "plus", label: "Add root area", run: () => void this.addCapability(null) });
    const summary = container.createDiv("gm-map-summary");
    summary.createSpan({ text: "My Growth" });
    summary.createEl("strong", { text: `${progressFor(null, capabilities)}%` });
    if (!this.expandedInitialized) {
      for (const capability of capabilities) {
        if (capability.parentId === null || capabilities.find((item) => item.id === capability.parentId)?.parentId === null) this.expanded.add(capability.id);
      }
      this.expandedInitialized = true;
    }
    const tree = container.createDiv("gm-tree");
    for (const root of this.childrenOf(null, capabilities)) this.renderTreeNode(tree, root, capabilities, 0);
    const add = container.createEl("button", { text: "+  Add Area", cls: "gm-inline-add" });
    add.addEventListener("click", () => void this.addCapability(null));
  }

  private renderTreeNode(container: HTMLElement, capability: Capability, capabilities: Capability[], depth: number): void {
    const children = this.childrenOf(capability.id, capabilities);
    const row = container.createDiv("gm-tree-row");
    row.style.setProperty("--gm-depth", String(Math.min(depth, 3)));
    const toggle = row.createEl("button", { cls: "gm-tree-toggle", attr: { "aria-label": children.length ? "Expand or collapse" : "No children" } });
    if (children.length) setIcon(toggle, this.expanded.has(capability.id) ? "chevron-down" : "chevron-right");
    else toggle.createSpan({ text: "·" });
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
    setIcon(more, "ellipsis");
    more.addEventListener("click", () => void this.capabilityActions(capability));
    if (children.length && this.expanded.has(capability.id)) {
      for (const child of children) this.renderTreeNode(container, child, capabilities, depth + 1);
    }
  }

  private async renderCapability(container: HTMLElement): Promise<void> {
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
        setIcon(arrow, "chevron-right");
        row.addEventListener("click", () => void this.navigate("capability", child.id));
      }
    }

    const relevantIds = descendantsOf(capability.id, capabilities);
    relevantIds.add(capability.id);
    const related = contents.filter((item) => item.capabilityIds.some((id) => relevantIds.has(id)));
    this.sectionTitle(container, "Library");
    const stats = container.createDiv("gm-stat-grid");
    for (const type of ["knowledge", "case", "lesson", "hypothesis", "question"] as const) {
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

  private async renderLibrary(container: HTMLElement): Promise<void> {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const contents = await this.plugin.repository.loadContents();
    this.renderPageHeader(container, "Library", "YOUR KNOWLEDGE", undefined, { icon: "plus", label: "Add content", run: () => this.openContentForm([]) });
    const inbox = contents.filter((item) => item.type === "inbox" && item.status !== "archived");
    if (inbox.length) {
      const inboxButton = container.createEl("button", { cls: "gm-inbox-banner" });
      const icon = inboxButton.createSpan();
      setIcon(icon, "inbox");
      const text = inboxButton.createDiv();
      text.createEl("strong", { text: `${inbox.length} in Inbox` });
      text.createSpan({ text: "Review and organize your captures" });
      const arrow = inboxButton.createSpan();
      setIcon(arrow, "chevron-right");
      inboxButton.addEventListener("click", () => {
        this.libraryType = "inbox";
        void this.render();
      });
    }
    const searchWrap = container.createDiv("gm-search");
    const searchIcon = searchWrap.createSpan();
    setIcon(searchIcon, "search");
    const search = searchWrap.createEl("input", { cls: "gm-search-input", attr: { type: "search", placeholder: "Search my knowledge…" } });
    search.value = this.librarySearch;
    search.addEventListener("input", () => {
      this.librarySearch = search.value;
      this.updateLibraryResults(container, capabilities, contents);
    });
    const chips = container.createDiv("gm-chips");
    for (const type of ["all", "knowledge", "case", "lesson", "hypothesis", "question"] as const) {
      const chip = chips.createEl("button", { text: type === "all" ? "All" : CONTENT_LABELS[type], cls: `gm-chip${this.libraryType === type ? " is-active" : ""}` });
      chip.addEventListener("click", () => {
        this.libraryType = type;
        void this.render();
      });
    }
    const filters = container.createEl("details", { cls: "gm-filters" });
    filters.createEl("summary", { text: "Filters" });
    const filterGrid = filters.createDiv("gm-filter-grid");
    this.filterSelect(filterGrid, "Area", this.rootOptions(capabilities), this.libraryArea, (value) => { this.libraryArea = value; void this.render(); });
    this.filterSelect(filterGrid, "Capability", [{ value: "all", label: "All capabilities" }, ...capabilities.filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ value: item.id, label: item.name }))], this.libraryCapability, (value) => { this.libraryCapability = value; void this.render(); });
    this.filterSelect(filterGrid, "Status", ["all", "draft", "validating", "validated", "outdated"].map((value) => ({ value, label: value === "all" ? "All statuses" : value })), this.libraryStatus, (value) => { this.libraryStatus = value; void this.render(); });
    this.filterSelect(filterGrid, "Confidence", ["all", "low", "medium", "high"].map((value) => ({ value, label: value === "all" ? "All confidence" : value })), this.libraryConfidence, (value) => { this.libraryConfidence = value; void this.render(); });
    const results = container.createDiv("gm-library-results");
    results.dataset.gmResults = "true";
    this.renderLibraryResults(results, capabilities, contents);
  }

  private updateLibraryResults(container: HTMLElement, capabilities: Capability[], contents: LoadedContent[]): void {
    const results = container.querySelector<HTMLElement>("[data-gm-results]");
    if (!results) return;
    results.empty();
    this.renderLibraryResults(results, capabilities, contents);
  }

  private renderLibraryResults(container: HTMLElement, capabilities: Capability[], contents: LoadedContent[]): void {
    let filtered = contents.filter((item) => item.status !== "archived");
    if (this.libraryType !== "all") filtered = filtered.filter((item) => item.type === this.libraryType);
    if (this.librarySearch.trim()) {
      const needle = this.librarySearch.toLocaleLowerCase();
      filtered = filtered.filter((item) => `${item.title}\n${item.body}`.toLocaleLowerCase().includes(needle));
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

  private async renderContent(container: HTMLElement): Promise<void> {
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
    await MarkdownRenderer.render(this.app, item.body, preview, item.file.path, this);
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

  private renderAI(container: HTMLElement): void {
    this.renderPageHeader(container, "AI Assistant", "OPTIONAL");
    const status = container.createDiv("gm-ai-status");
    const icon = status.createDiv("gm-ai-icon");
    setIcon(icon, "sparkles");
    status.createEl("h2", { text: "AI is not configured." });
    status.createEl("p", { text: "Growth Map works fully without AI." });
    const future = container.createDiv("gm-future-list");
    this.futureCard(future, "Organize with AI", "Preview suggested type, capabilities, confidence, status, and structure before adding anything.");
    this.futureCard(future, "Ask My Knowledge", "Search locally first, send only selected context, and show every source used in the answer.");
    container.createEl("p", { text: "V1 makes no network requests and stores no API keys.", cls: "gm-privacy-note" });
  }

  private async renderArchive(container: HTMLElement): Promise<void> {
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
      text.createSpan({ text: `${CONTENT_LABELS[item.type]} · ${item.id}` });
      const restore = row.createEl("button", { text: "Restore" });
      restore.addEventListener("click", () => void this.restoreContent(item.id));
    }
  }

  private renderNavigation(shell: HTMLElement): void {
    const nav = shell.createEl("nav", { cls: "gm-nav", attr: { "aria-label": "Growth Map" } });
    for (const item of [
      { page: "home" as const, label: "Home", icon: "house" },
      { page: "map" as const, label: "Map", icon: "list-tree" },
      { page: "library" as const, label: "Library", icon: "library" },
      { page: "ai" as const, label: "AI", icon: "sparkles" }
    ]) {
      const active = this.page === item.page || (item.page === "map" && this.page === "capability") || (item.page === "library" && this.page === "content");
      const button = nav.createEl("button", { cls: `gm-nav-item${active ? " is-active" : ""}`, attr: { "aria-label": item.label } });
      const icon = button.createSpan();
      setIcon(icon, item.icon);
      button.createSpan({ text: item.label });
      button.addEventListener("click", () => void this.navigate(item.page));
    }
  }

  private renderFab(shell: HTMLElement): void {
    const button = shell.createEl("button", { cls: "gm-fab", attr: { "aria-label": "Quick Capture" } });
    setIcon(button, "plus");
    button.addEventListener("click", () => this.openQuickCapture());
  }

  private async launchQuickCapture(capabilityId?: string): Promise<void> {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const capability = capabilities.find((item) => item.id === capabilityId);
    new QuickCaptureModal(this.app, capability?.name ?? null, async (title, content) => {
      await this.plugin.repository.createContent({ type: "inbox", title, body: content, capabilityIds: capability ? [capability.id] : [] });
      this.requestRefresh();
    }).open();
  }

  private openContentForm(capabilityIds: string[], initial?: Partial<ContentFormValue>, onSave?: (value: ContentFormValue) => Promise<void>): void {
    void this.plugin.repository.loadCapabilities().then((capabilities) => {
      new ContentFormModal(this.app, capabilities, capabilityIds, initial, onSave ?? (async (value) => {
        await this.plugin.repository.createContent(value);
        this.requestRefresh();
      })).open();
    });
  }

  private organizeInbox(item: LoadedContent, capabilities: Capability[]): void {
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

  private async contentActions(item: LoadedContent, capabilities: Capability[]): Promise<void> {
    const choice = await chooseOption(this.app, this.contentTitle(item), [
      { label: item.type === "inbox" ? "Organize" : "Edit metadata and content", value: "edit" },
      { label: "Open Markdown", value: "open" },
      { label: "Archive", value: "archive", destructive: true }
    ]);
    if (choice === "open") await this.app.workspace.getLeaf(false).openFile(item.file);
    else if (choice === "archive") {
      await this.plugin.repository.archiveContent(item);
      new Notice("Content archived — Markdown kept");
      await this.navigate("library");
    } else if (choice === "edit") {
      if (item.type === "inbox") this.organizeInbox(item, capabilities);
      else new ContentFormModal(this.app, capabilities, item.capabilityIds, item as ContentFormValue, async (value) => {
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

  private async addCapability(parentId: string | null): Promise<void> {
    const name = await promptText(this.app, parentId ? "Add child capability" : "Add growth area", "Capability name");
    if (!name) return;
    const capability = await this.plugin.repository.createCapability(name, parentId);
    if (parentId) this.expanded.add(parentId);
    new Notice(`${capability.name} added`);
    await this.render();
  }

  private async capabilityActions(capability: Capability): Promise<void> {
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
      new Notice(error instanceof Error ? error.message : "Capability action failed");
    }
  }

  private async changeStage(capability: Capability): Promise<void> {
    const stage = await chooseOption(this.app, "Capability stage", STAGE_LABELS.map((label, index) => ({
      label: `${index * 20}% · ${label}`,
      value: index
    })));
    if (stage === null) return;
    capability.stage = stage;
    await this.plugin.repository.updateCapability(capability);
    await this.render();
  }

  private async toggleFocus(capability: Capability): Promise<void> {
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

  private async chooseFocus(): Promise<void> {
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active" && !item.focus);
    const id = await chooseOption(this.app, "Set as Focus", capabilities.map((item) => ({
      label: item.name,
      description: capabilityPath(item.id, capabilities).slice(0, -1).map((part) => part.name).join(" / "),
      value: item.id
    })));
    const capability = capabilities.find((item) => item.id === id);
    if (capability) await this.toggleFocus(capability);
  }

  private async changeWeight(capability: Capability): Promise<void> {
    const value = await promptText(this.app, "Capability weight", "A number greater than 0", String(capability.weight));
    if (!value) return;
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight <= 0) {
      new Notice("Weight must be a number greater than 0");
      return;
    }
    capability.weight = weight;
    await this.plugin.repository.updateCapability(capability, true, "Before weight change");
    await this.render();
  }

  private async moveCapability(capability: Capability): Promise<void> {
    const capabilities = await this.plugin.repository.loadCapabilities();
    const blocked = descendantsOf(capability.id, capabilities);
    blocked.add(capability.id);
    const target = await chooseOption<string>(this.app, "Move to", [
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

  private async splitCapability(capability: Capability): Promise<void> {
    const names = await promptText(this.app, "Split into child capabilities", "Names separated by commas");
    if (!names) return;
    const children = names.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    if (children.length < 2) {
      new Notice("Enter at least two child names");
      return;
    }
    await this.plugin.repository.splitCapability(capability.id, children);
    this.expanded.add(capability.id);
    await this.render();
  }

  private async mergeCapability(capability: Capability): Promise<void> {
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
    new Notice("Capabilities merged; source archived");
    if (this.selectedCapabilityId === capability.id) this.selectedCapabilityId = target;
    await this.render();
  }

  private async archiveCapability(capability: Capability): Promise<void> {
    const references = await this.plugin.repository.referencedContent(capability.id);
    const choice = await new Promise<"archive" | "move" | null>((resolve) => new ReferenceProtectionModal(this.app, capability.name, references.length, resolve).open());
    if (!choice) return;
    let target: string | undefined;
    if (choice === "move") {
      const capabilities = await this.plugin.repository.loadCapabilities();
      const blocked = descendantsOf(capability.id, capabilities);
      blocked.add(capability.id);
      const selected = await chooseOption(this.app, "Move references to", capabilities.filter((item) => item.status === "active" && !blocked.has(item.id)).map((item) => ({ label: item.name, value: item.id })));
      if (!selected) return;
      target = selected;
    }
    await this.plugin.repository.archiveCapability(capability.id, target);
    new Notice("Capability archived — Markdown kept");
    if (this.page === "capability") await this.navigate("map");
    else await this.render();
  }

  private async restoreCapability(id: string): Promise<void> {
    await this.plugin.repository.restoreCapability(id);
    new Notice("Capability branch restored");
    await this.render();
  }

  private async restoreContent(id: string): Promise<void> {
    const item = await this.plugin.repository.loadContent(id);
    if (!item) return;
    await this.plugin.repository.restoreContent(item);
    new Notice("Content restored");
    await this.render();
  }

  private async showCheckpoints(): Promise<void> {
    const files = await this.plugin.repository.listCheckpoints();
    new CheckpointListModal(this.app, files.map((file) => file.path)).open();
  }

  private async restoreLastCheckpoint(): Promise<void> {
    const confirm = await chooseOption(this.app, "Restore last checkpoint?", [{
      label: "Restore capability structure",
      value: true,
      description: "A checkpoint of the current structure will be created first."
    }]);
    if (!confirm) return;
    const path = await this.plugin.repository.restoreLastCheckpoint();
    new Notice(path ? "Capability structure restored" : "No checkpoint found");
    await this.render();
  }

  private renderContentCards(container: HTMLElement, items: LoadedContent[], capabilities: Capability[]): void {
    const list = container.createDiv("gm-content-list");
    for (const item of items) {
      const card = list.createEl("button", { cls: "gm-content-card" });
      const top = card.createDiv("gm-content-card-top");
      top.createSpan({ text: CONTENT_LABELS[item.type].toUpperCase(), cls: `gm-type gm-type-${item.type}` });
      top.createSpan({ text: relativeTime(item.updated), cls: "gm-muted" });
      card.createEl("strong", { text: this.contentTitle(item) });
      const capNames = item.capabilityIds.map((id) => capabilities.find((entry) => entry.id === id)?.name).filter(Boolean).slice(0, 3).join(" · ");
      if (capNames) card.createSpan({ text: capNames, cls: "gm-content-path" });
      card.addEventListener("click", () => void this.navigate("content", item.id));
    }
  }

  private progressBar(container: HTMLElement, progress: number): void {
    const track = container.createDiv("gm-progress-track");
    const fill = track.createDiv("gm-progress-fill");
    fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  private signalCard(container: HTMLElement, label: string, value: string, type: ContentType): void {
    const card = container.createEl("button", { cls: "gm-signal-card" });
    card.createSpan({ text: label });
    card.createEl("strong", { text: value });
    card.addEventListener("click", () => {
      this.libraryType = type;
      void this.navigate("library");
    });
  }

  private sectionTitle(container: HTMLElement, title: string, hint?: string): void {
    const row = container.createDiv("gm-section-title");
    row.createEl("h2", { text: title });
    if (hint) row.createSpan({ text: hint });
  }

  private emptyState(container: HTMLElement, text: string): void {
    container.createDiv({ text, cls: "gm-empty-state" });
  }

  private futureCard(container: HTMLElement, title: string, description: string): void {
    const card = container.createDiv("gm-future-card");
    card.createEl("strong", { text: title });
    card.createEl("p", { text: description });
    card.createSpan({ text: "Coming later" });
  }

  private filterSelect(container: HTMLElement, label: string, options: Array<{ value: string; label: string }>, selected: string, onChange: (value: string) => void): void {
    const field = container.createDiv("gm-filter-field");
    field.createEl("label", { text: label });
    const select = field.createEl("select", { cls: "dropdown" });
    for (const option of options) {
      const element = select.createEl("option", { text: option.label, value: option.value });
      element.selected = selected === option.value;
    }
    select.addEventListener("change", () => onChange(select.value));
  }

  private rootOptions(capabilities: Capability[]): Array<{ value: string; label: string }> {
    return [{ value: "all", label: "All areas" }, ...capabilities.filter((item) => item.status === "active" && item.parentId === null).sort((a, b) => a.order - b.order).map((item) => ({ value: item.id, label: item.name }))];
  }

  private childrenOf(parentId: string | null, capabilities: Capability[]): Capability[] {
    return capabilities.filter((item) => item.status === "active" && item.parentId === parentId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  private leafCount(id: string, capabilities: Capability[]): number {
    const descendants = [...descendantsOf(id, capabilities)].filter((descendantId) => capabilities.find((item) => item.id === descendantId)?.status === "active");
    return descendants.filter((descendantId) => this.childrenOf(descendantId, capabilities).length === 0).length || 1;
  }

  private contentTitle(item: LoadedContent): string {
    if (item.title.trim()) return item.title.trim();
    const lines = item.body.split("\n");
    return lines.find((line) => line.trim() && !line.trim().startsWith("#"))?.trim()
      ?? lines.map((line) => line.replace(/^#+\s*/, "").trim()).find(Boolean)
      ?? item.file.basename.replace(new RegExp(`^${item.id}\\s*`), "")
      ?? "Untitled";
  }

  private renderError(container: HTMLElement, error: unknown): void {
    const box = container.createDiv("gm-error");
    box.createEl("h2", { text: "Growth Map couldn't load" });
    box.createEl("p", { text: error instanceof Error ? error.message : "Unknown error" });
    const retry = box.createEl("button", { text: "Try Again", cls: "gm-primary-button" });
    retry.addEventListener("click", () => void this.render());
  }
}
