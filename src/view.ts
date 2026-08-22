import { ItemView, MarkdownRenderer, Notice, Platform, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { capabilityPath, connectionKey, descendantsOf, progressFor, relativeTime, spectrumHue, timeRangeStart } from "./core";
import { computeMobileBottomOffset } from "./mobile-layout";
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
  type AttachmentRef,
  type Capability,
  type ContentType,
  type LoadedContent,
  type MainPage,
  type TimeRange,
  type TimelineActivity
} from "./types";

export const VIEW_TYPE_GROWTH_MAP = "growth-map-view";

type LibraryTypeFilter = ContentType | "all";

export class GrowthMapView extends ItemView {
  private page: MainPage = "home";
  private mapMode: "tree" | "connections" = "tree";
  private timeRange: TimeRange = "3m";
  private selectedConnectionKey: string | null = null;
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
  private bottomOffsetFrame: number | null = null;
  private bottomBarResizeObserver: ResizeObserver | null = null;
  private bottomBarMutationObserver: MutationObserver | null = null;
  private observedBottomBars: Element[] = [];
  private readonly scheduleBottomOffsetUpdate = (): void => {
    if (this.bottomOffsetFrame !== null) window.cancelAnimationFrame(this.bottomOffsetFrame);
    this.bottomOffsetFrame = window.requestAnimationFrame(() => {
      this.bottomOffsetFrame = null;
      this.updateMobileBottomOffset();
    });
  };

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
    this.setupBottomOffsetTracking();
    await this.render();
    this.scheduleBottomOffsetUpdate();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.bottomOffsetFrame !== null) window.cancelAnimationFrame(this.bottomOffsetFrame);
    this.bottomBarResizeObserver?.disconnect();
    this.bottomBarMutationObserver?.disconnect();
    window.visualViewport?.removeEventListener("resize", this.scheduleBottomOffsetUpdate);
    window.visualViewport?.removeEventListener("scroll", this.scheduleBottomOffsetUpdate);
    window.removeEventListener("resize", this.scheduleBottomOffsetUpdate);
    window.removeEventListener("orientationchange", this.scheduleBottomOffsetUpdate);
    this.contentEl.style.removeProperty("--gm-mobile-bottom-offset");
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
    if (page === "connection") this.selectedConnectionKey = id ?? null;
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

  private setupBottomOffsetTracking(): void {
    window.addEventListener("resize", this.scheduleBottomOffsetUpdate, { passive: true });
    window.addEventListener("orientationchange", this.scheduleBottomOffsetUpdate, { passive: true });
    window.visualViewport?.addEventListener("resize", this.scheduleBottomOffsetUpdate, { passive: true });
    window.visualViewport?.addEventListener("scroll", this.scheduleBottomOffsetUpdate, { passive: true });
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

  private updateMobileBottomOffset(): void {
    const isMobile = Platform.isMobile || document.body.classList.contains("is-mobile")
      || document.body.classList.contains("emulate-mobile");
    if (!isMobile) {
      this.contentEl.style.setProperty("--gm-mobile-bottom-offset", "0px");
      this.observeBottomBars([]);
      return;
    }
    const viewport = window.visualViewport;
    const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
    const safeAreaInset = Number.parseFloat(getComputedStyle(this.contentEl).getPropertyValue("--gm-safe-area-probe")) || 0;
    const selectors = [
      ".mobile-navbar",
      ".mobile-navbar-container",
      ".mobile-bottom-bar",
      ".mobile-toolbar",
      ".workspace-drawer.mod-bottom"
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(",")))
      .filter((element: Element) => !this.contentEl.contains(element) && this.isVisibleBottomBar(element));
    const offset = computeMobileBottomOffset(
      true,
      viewportBottom,
      safeAreaInset,
      candidates.map((element) => element.getBoundingClientRect())
    );
    this.contentEl.style.setProperty("--gm-mobile-bottom-offset", `${offset}px`);
    this.observeBottomBars(candidates);
  }

  private isVisibleBottomBar(element: Element): boolean {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
  }

  private observeBottomBars(elements: Element[]): void {
    if (!this.bottomBarResizeObserver) return;
    if (elements.length === this.observedBottomBars.length && elements.every((element, index) => element === this.observedBottomBars[index])) return;
    this.bottomBarResizeObserver.disconnect();
    for (const element of elements) this.bottomBarResizeObserver.observe(element);
    this.observedBottomBars = elements;
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
    const monthStart = timeRangeStart("30d") as Date;
    const monthEvents = await this.plugin.repository.loadGrowthEvents(monthStart);
    const active = capabilities.filter((item) => item.status === "active");
    const roots = active.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order);
    this.renderPageHeader(container, "My Growth", "GROWTH MAP", undefined, { icon: "archive", label: "Open archive", run: () => void this.navigate("archive") });

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
    setIcon(addIcon, "plus");
    addArea.createSpan({ text: "Add area" });
    addArea.addEventListener("click", () => void this.addCapability(null));

    const recordedContentIds = new Set(monthEvents.filter((event) => event.eventType === "content-created" && event.contentId).map((event) => event.contentId as string));
    const legacyNewItems = contents.filter((item) => item.created >= monthStart.toISOString() && !recordedContentIds.has(item.id)).length;
    const newItems = recordedContentIds.size + legacyNewItems;
    const stageChanges = monthEvents.filter((event) => event.eventType === "capability-stage-changed").length;
    const month = container.createEl("button", { cls: "gm-month-card" });
    const monthText = month.createDiv();
    monthText.createEl("strong", { text: "This Month" });
    monthText.createSpan({ text: `${newItems} new item${newItems === 1 ? "" : "s"} · ${stageChanges} stage change${stageChanges === 1 ? "" : "s"}` });
    const monthArrow = month.createSpan();
    setIcon(monthArrow, "chevron-right");
    month.addEventListener("click", () => void this.navigate("timeline"));

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
    this.renderPageHeader(container, "Growth Map", "MY GROWTH", undefined, { icon: "plus", label: "Add root area", run: () => void this.addCapability(null) });
    const modes = container.createDiv("gm-segmented");
    for (const mode of ["tree", "connections"] as const) {
      const button = modes.createEl("button", { text: mode === "tree" ? "Tree" : "Connections", cls: this.mapMode === mode ? "is-active" : "" });
      button.addEventListener("click", () => { this.mapMode = mode; void this.render(); });
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
    this.applySpectrum(row, capability.id, capabilities);
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

    const recentEvents = (await this.plugin.repository.loadGrowthEvents(timeRangeStart("3m"))).filter((event) =>
      event.capabilityIds.some((id) => relevantIds.has(id))
    ).slice(0, 3);
    if (recentEvents.length) {
      this.sectionTitle(container, "Recent Growth");
      const growth = container.createDiv("gm-growth-list is-compact");
      for (const event of recentEvents) this.renderGrowthRow(growth, { ...event, recorded: true }, capabilities, contents);
    }
    const connections = (await this.plugin.repository.loadConnections()).filter((item) =>
      (item.strength > 0 || item.pinned) && (item.fromId === capability.id || item.toId === capability.id)
    ).slice(0, 5);
    if (connections.length) {
      this.sectionTitle(container, "Connected Capabilities");
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

    this.sectionTitle(container, "Recent Content");
    const recent = related.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4);
    if (recent.length) this.renderContentCards(container, recent, capabilities);
    else this.emptyState(container, "Capture something here and it will be linked automatically.");
    const add = container.createEl("button", { text: "+  Add", cls: "gm-inline-add" });
    add.addEventListener("click", () => this.openContentForm([capability.id]));
  }

  private async renderTimeline(container: HTMLElement): Promise<void> {
    const capabilities = (await this.plugin.repository.loadCapabilities()).filter((item) => item.status === "active");
    const contents = (await this.plugin.repository.loadContentMetadata()).filter((item) => item.status !== "archived");
    const start = timeRangeStart(this.timeRange);
    const events = await this.plugin.repository.loadGrowthEvents(start);
    const recordedContentIds = new Set(events.filter((event) => event.eventType === "content-created" && event.contentId).map((event) => event.contentId as string));
    const activities: TimelineActivity[] = events.map((event) => ({ ...event, recorded: true }));
    for (const item of contents) {
      if ((start && new Date(item.created) < start) || recordedContentIds.has(item.id)) continue;
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
    for (const range of ["30d", "3m", "6m", "1y", "all"] as const) {
      const label = range === "all" ? "All" : range.toUpperCase();
      const button = ranges.createEl("button", { text: label, cls: this.timeRange === range ? "is-active" : "" });
      button.addEventListener("click", () => { this.timeRange = range; void this.render(); });
    }

    const last30Start = timeRangeStart("30d") as Date;
    const last30Events = this.timeRange === "30d" ? events : await this.plugin.repository.loadGrowthEvents(last30Start);
    const last30Recorded = new Set(last30Events.filter((event) => event.eventType === "content-created" && event.contentId).map((event) => event.contentId as string));
    const last30Items = last30Recorded.size + contents.filter((item) => item.created >= last30Start.toISOString() && !last30Recorded.has(item.id)).length;
    const last30Stages = last30Events.filter((event) => event.eventType === "capability-stage-changed").length;
    const activeCounts = new Map<string, number>();
    for (const activity of activities.filter((item) => item.timestamp >= last30Start.toISOString())) {
      for (const id of activity.capabilityIds) {
        const root = capabilityPath(id, capabilities)[0];
        if (root) activeCounts.set(root.id, (activeCounts.get(root.id) ?? 0) + 1);
      }
    }
    const mostActiveId = [...activeCounts].sort((left, right) => right[1] - left[1])[0]?.[0];
    const mostActive = capabilities.find((item) => item.id === mostActiveId)?.name ?? "—";
    const summary = container.createDiv("gm-time-summary");
    this.timeSummary(summary, String(last30Items), "new items");
    this.timeSummary(summary, String(last30Stages), "stage changes");
    this.timeSummary(summary, mostActive, "most active");

    const roots = capabilities.filter((item) => item.parentId === null).sort((left, right) => left.order - right.order);
    const focus = capabilities.filter((item) => item.focus && item.parentId !== null);
    const rows = [...roots, ...focus].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
    const buckets = this.timelineBuckets(start, activities);
    this.sectionTitle(container, "Time Map", "activity · stage change");
    if (!activities.length) this.emptyState(container, "Changes recorded from v1.1.0 will appear here.");
    else {
      const map = container.createDiv("gm-time-map");
      const header = map.createDiv("gm-time-map-header");
      header.createSpan();
      for (const bucket of buckets) header.createSpan({ text: bucket.label });
      for (const rowCapability of rows) {
        const row = map.createDiv("gm-time-map-row");
        this.applySpectrum(row, rowCapability.id, capabilities);
        const label = row.createEl("button", { text: rowCapability.name, cls: "gm-time-row-label" });
        label.addEventListener("click", () => void this.navigate("capability", rowCapability.id));
        const relatedIds = descendantsOf(rowCapability.id, capabilities);
        relatedIds.add(rowCapability.id);
        for (const bucket of buckets) {
          const cell = row.createDiv("gm-time-cell");
          const matches = activities.filter((activity) => activity.capabilityIds.some((id) => relatedIds.has(id)) && new Date(activity.timestamp).getTime() >= bucket.start && new Date(activity.timestamp).getTime() < bucket.end);
          if (matches.length) {
            const hasStage = matches.some((activity) => activity.eventType === "capability-stage-changed");
            const allRecorded = matches.every((activity) => activity.recorded);
            const marker = cell.createEl("button", {
              cls: `gm-time-marker${hasStage ? " is-stage" : ""}${allRecorded ? "" : " is-existing"}`,
              attr: { "aria-label": matches.length === 1 ? this.activityLabel(matches[0], contents) : `${matches.length} growth activities` }
            });
            marker.addEventListener("click", () => void (matches.length === 1
              ? this.showTimelineActivity(matches[0], capabilities, contents)
              : this.showTimelineBucket(matches, capabilities, contents)));
            if (matches.length > 1) marker.createSpan({ text: `+${matches.length - 1}`, cls: "gm-time-more" });
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
      const day = new Date(activity.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
      if (day !== lastDay) {
        list.createEl("h3", { text: day });
        lastDay = day;
      }
      this.renderGrowthRow(list, activity, capabilities, contents);
    }
  }

  private async renderConnections(container: HTMLElement, capabilities: Capability[]): Promise<void> {
    const connections = (await this.plugin.repository.loadConnections()).filter((item) =>
      (item.strength > 0 || item.pinned)
      && capabilities.some((capability) => capability.id === item.fromId)
      && capabilities.some((capability) => capability.id === item.toId)
    );
    this.sectionTitle(container, "Emergent Connections", "observed through shared content");
    if (!connections.length) {
      this.emptyState(container, "Link one item to two capabilities and their connection will appear here.");
      return;
    }
    const list = container.createDiv("gm-connection-list");
    for (const connection of connections) {
      const from = capabilities.find((item) => item.id === connection.fromId) as Capability;
      const to = capabilities.find((item) => item.id === connection.toId) as Capability;
      const row = list.createEl("button", { cls: "gm-connection-row" });
      this.applySpectrum(row, from.id, capabilities);
      const names = row.createDiv();
      names.createEl("strong", { text: capabilityPath(from.id, capabilities).map((item) => item.name).join(" / ") });
      names.createSpan({ text: `Related through content · ${capabilityPath(to.id, capabilities).map((item) => item.name).join(" / ")}` });
      const strength = row.createDiv("gm-connection-strength");
      if (connection.pinned) {
        const pin = strength.createSpan();
        setIcon(pin, "pin");
      }
      strength.createEl("b", { text: String(connection.strength) });
      strength.createSpan({ text: connection.strength === 1 ? "shared item" : "shared items" });
      row.addEventListener("click", () => void this.navigate("connection", connectionKey(connection.fromId, connection.toId)));
    }
  }

  private async renderConnectionDetail(container: HTMLElement): Promise<void> {
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
    this.renderPageHeader(container, "Capability Connection", "OBSERVED ASSOCIATION", () => { this.mapMode = "connections"; void this.navigate("map"); });
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
      const value = await promptText(this.app, "Why are they connected?", "Optional note", connection.note ?? "");
      if (value === null) return;
      await this.plugin.repository.pinConnection(from.id, to.id, true, value);
      await this.render();
    });
    if (connection.note) container.createEl("p", { text: connection.note, cls: "gm-connection-note" });
    const breakdown = container.createDiv("gm-connection-breakdown");
    for (const type of ["case", "lesson", "knowledge", "hypothesis", "question", "inbox"] as const) {
      const count = connection.counts[type] ?? 0;
      if (count) this.timeSummary(breakdown, String(count), CONTENT_LABELS[type]);
    }
    const contents = (await this.plugin.repository.loadContentMetadata()).filter((item) => connection.sharedContentIds.includes(item.id));
    this.sectionTitle(container, "Shared Content", `${connection.strength} item${connection.strength === 1 ? "" : "s"}`);
    if (contents.length) this.renderContentCards(container, contents, capabilities);
    else this.emptyState(container, "This pinned connection has no shared content yet.");
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
    await this.renderAttachments(container, item.attachments ?? []);
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
      { page: "timeline" as const, label: "Timeline", icon: "history" },
      { page: "library" as const, label: "Library", icon: "library" }
    ]) {
      const active = this.page === item.page || (item.page === "map" && (this.page === "capability" || this.page === "connection")) || (item.page === "library" && this.page === "content");
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
    new QuickCaptureModal(this.app, capability?.name ?? null, async (title, content, files) => {
      await this.plugin.repository.createContent({ type: "inbox", title, body: content, capabilityIds: capability ? [capability.id] : [], attachmentFiles: files });
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
      if (item.attachments?.length) {
        const attachment = card.createSpan({ cls: "gm-attachment-indicator" });
        setIcon(attachment, "paperclip");
        attachment.createSpan({ text: String(item.attachments.length) });
      }
      card.addEventListener("click", () => void this.navigate("content", item.id));
    }
  }

  private applySpectrum(element: HTMLElement, capabilityId: string, capabilities: Capability[]): void {
    const root = capabilityPath(capabilityId, capabilities)[0];
    if (root) element.style.setProperty("--gm-spectrum-hue", String(spectrumHue(root.id)));
  }

  private timeSummary(container: HTMLElement, value: string, label: string): void {
    const item = container.createDiv("gm-time-summary-item");
    item.createEl("strong", { text: value });
    item.createSpan({ text: label });
  }

  private timelineBuckets(start: Date | null, activities: TimelineActivity[]): Array<{ start: number; end: number; label: string }> {
    const now = Date.now();
    const activityTimes = activities.map((item) => new Date(item.timestamp).getTime()).filter(Number.isFinite);
    const startTime = start?.getTime() ?? (activityTimes.length ? Math.min(...activityTimes) : now - 90 * 86400000);
    const safeStart = Math.min(startTime, now - 86400000);
    const bucketCount = 6;
    const step = Math.max(1, (now + 1 - safeStart) / bucketCount);
    const shortRange = now - safeStart <= 62 * 86400000;
    return Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = safeStart + step * index;
      const bucketEnd = index === bucketCount - 1 ? now + 1 : safeStart + step * (index + 1);
      return {
        start: bucketStart,
        end: bucketEnd,
        label: new Date(bucketStart).toLocaleDateString(undefined, shortRange ? { month: "short", day: "numeric" } : { month: "short" })
      };
    });
  }

  private activityLabel(activity: TimelineActivity, contents: LoadedContent[]): string {
    const content = activity.contentId ? contents.find((item) => item.id === activity.contentId) : undefined;
    if (activity.eventType === "capability-stage-changed") return `Stage ${activity.fromStage ?? "?"} → ${activity.toStage ?? "?"}`;
    if (activity.eventType === "focus-added") return "Added to Focus";
    if (activity.eventType === "focus-removed") return "Removed from Focus";
    if (activity.eventType === "content-converted") return `Inbox → ${content ? CONTENT_LABELS[content.type] : String(activity.metadata?.toType ?? "Library")}`;
    const label = content ? CONTENT_LABELS[content.type] : String(activity.metadata?.contentType ?? "Content");
    return activity.recorded ? `New ${label}` : `${label} · existing created date`;
  }

  private async showTimelineBucket(activities: TimelineActivity[], capabilities: Capability[], contents: LoadedContent[]): Promise<void> {
    const choice = await chooseOption(this.app, "Growth activity", activities.map((activity, index) => ({
      label: this.activityLabel(activity, contents),
      value: index,
      description: activity.capabilityIds.map((id) => capabilityPath(id, capabilities).map((item) => item.name).join(" / ")).filter(Boolean).join(" · ") || "Unlinked content"
    })));
    if (choice !== null) await this.showTimelineActivity(activities[choice], capabilities, contents);
  }
  private async showTimelineActivity(activity: TimelineActivity, capabilities: Capability[], contents: LoadedContent[]): Promise<void> {
    const path = activity.capabilityIds.map((id) => capabilityPath(id, capabilities).map((item) => item.name).join(" / ")).filter(Boolean).join(" · ") || "Unlinked content";
    const options: Array<{ label: string; value: string; description?: string }> = [{
      label: path,
      value: activity.capabilityIds[0] ? `cap:${activity.capabilityIds[0]}` : "close",
      description: this.activityLabel(activity, contents)
    }];
    if (activity.contentId && contents.some((item) => item.id === activity.contentId)) {
      options.push({ label: "Open related content", value: `content:${activity.contentId}`, description: activity.contentId });
    }
    const date = new Date(activity.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const choice = await chooseOption(this.app, date, options);
    if (choice?.startsWith("cap:")) await this.navigate("capability", choice.slice(4));
    else if (choice?.startsWith("content:")) await this.navigate("content", choice.slice(8));
  }

  private renderGrowthRow(container: HTMLElement, activity: TimelineActivity, capabilities: Capability[], contents: LoadedContent[]): void {
    const row = container.createEl("button", { cls: "gm-growth-row" });
    const capabilityId = activity.capabilityIds[0];
    if (capabilityId) this.applySpectrum(row, capabilityId, capabilities);
    const marker = row.createSpan({ cls: `gm-growth-dot${activity.eventType === "capability-stage-changed" ? " is-stage" : ""}` });
    const text = row.createDiv();
    const path = activity.capabilityIds.map((id) => capabilityPath(id, capabilities).map((item) => item.name).join(" / ")).filter(Boolean).join(" · ");
    text.createEl("strong", { text: path || "Unlinked content" });
    text.createSpan({ text: this.activityLabel(activity, contents) });
    row.createSpan({ text: new Date(activity.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }), cls: "gm-muted" });
    marker.setAttribute("aria-hidden", "true");
    row.addEventListener("click", () => void this.showTimelineActivity(activity, capabilities, contents));
  }

  private async renderAttachments(container: HTMLElement, attachments: AttachmentRef[]): Promise<void> {
    if (!attachments.length) return;
    this.sectionTitle(container, "Attachments", `${attachments.length}`);
    const list = container.createDiv("gm-attachment-list");
    const extra = attachments.length > 3 ? list.createDiv("gm-attachment-extra") : null;
    attachments.forEach((attachment, index) => {
      const parent = index < 3 || !extra ? list : extra;
      const file = this.app.vault.getAbstractFileByPath(attachment.path);
      const extension = attachment.path.split(".").pop()?.toLocaleLowerCase() ?? "";
      const isImage = attachment.mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
      if (isImage && file instanceof TFile) {
        const figure = parent.createEl("figure", { cls: "gm-attachment-image" });
        const image = figure.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: attachment.name, loading: "lazy" } });
        image.addEventListener("click", () => void this.openAttachment(file));
        figure.createEl("figcaption", { text: attachment.name });
        return;
      }
      const card = parent.createEl("button", { cls: "gm-attachment-card" });
      const icon = card.createSpan();
      setIcon(icon, extension === "pdf" ? "file-text" : extension === "doc" || extension === "docx" ? "file-type-2" : "file");
      const text = card.createDiv();
      text.createEl("strong", { text: attachment.name });
      text.createSpan({ text: file instanceof TFile ? this.formatBytes(file.stat.size) : attachment.path });
      card.createSpan({ text: "Open", cls: "gm-attachment-open" });
      if (file instanceof TFile) card.addEventListener("click", () => void this.openAttachment(file));
      else card.disabled = true;
    });
    if (extra) {
      extra.hidden = true;
      const show = container.createEl("button", { text: "Show All Attachments", cls: "gm-text-button gm-show-attachments" });
      show.addEventListener("click", () => {
        extra.hidden = !extra.hidden;
        show.setText(extra.hidden ? "Show All Attachments" : "Show Fewer Attachments");
      });
    }
  }

  private async openAttachment(file: TFile): Promise<void> {
    try {
      await this.app.workspace.getLeaf(true).openFile(file);
    } catch {
      new Notice("This attachment cannot be previewed on this device. Open it from the Vault to share or export it.");
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
