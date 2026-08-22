import { Notice, Plugin, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { QuickCaptureModal, promptText } from "./modals";
import { GrowthRepository } from "./repository";
import { GrowthMapSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type GrowthMapSettings, type MainPage } from "./types";
import { GrowthMapView, VIEW_TYPE_GROWTH_MAP } from "./view";

export default class GrowthMapPlugin extends Plugin {
  settings: GrowthMapSettings = { ...DEFAULT_SETTINGS };
  repository!: GrowthRepository;

  async onload(): Promise<void> {
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

    const invalidate = (file: TAbstractFile): void => {
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

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GROWTH_MAP);
  }

  async activateView(page: MainPage = "home"): Promise<GrowthMapView | null> {
    let leaf: WorkspaceLeaf;
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

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<GrowthMapSettings> | null ?? {}) };
  }

  private async quickCapture(): Promise<void> {
    if (!(await this.repository.isInitialized())) {
      await this.activateView("home");
      new Notice("Initialize Growth Map before capturing");
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(GrowthMapView);
    if (activeView) {
      activeView.openQuickCapture();
      return;
    }
    new QuickCaptureModal(this.app, null, async (title, content, files) => {
      await this.repository.createContent({ type: "inbox", title, body: content, attachmentFiles: files });
    }).open();
  }

  private async newCapability(): Promise<void> {
    if (!(await this.repository.isInitialized())) {
      await this.activateView("home");
      new Notice("Initialize Growth Map first");
      return;
    }
    const name = await promptText(this.app, "New root capability", "Capability name");
    if (!name) return;
    await this.repository.createCapability(name, null);
    new Notice(`${name} added to Growth Map`);
    await this.activateView("map");
  }

  private async openSearch(): Promise<void> {
    const view = await this.activateView("library");
    await view?.openSearch();
  }

  private async createCheckpoint(): Promise<void> {
    if (!(await this.repository.isInitialized())) {
      new Notice("Initialize Growth Map first");
      return;
    }
    await this.repository.createCheckpoint();
    new Notice("Capability checkpoint created");
  }

  private async restoreLastCheckpoint(): Promise<void> {
    if (!(await this.repository.isInitialized())) {
      new Notice("Initialize Growth Map first");
      return;
    }
    const restored = await this.repository.restoreLastCheckpoint();
    new Notice(restored ? "Capability structure restored" : "No checkpoint found");
    await this.activateView("map");
  }

  private debug(message: string): void {
    if (this.settings.debug) console.debug(`[Growth Map] ${message}`);
  }
}
