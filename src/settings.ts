import { App, PluginSettingTab, Setting } from "obsidian";
import type GrowthMapPlugin from "./main";

export class GrowthMapSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GrowthMapPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Growth Map" });
    containerEl.createEl("h3", { text: "General" });
    new Setting(containerEl)
      .setName("Archive instead of delete")
      .setDesc("Keep Markdown recoverable. Growth Map does not permanently delete managed content.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.archiveInsteadOfDelete).onChange(async (value) => {
        this.plugin.settings.archiveInsteadOfDelete = value;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("Checkpoint before structure changes")
      .setDesc("Create a capability-tree checkpoint before move, reorder, archive, merge, split, and restore.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.checkpointBeforeChanges).onChange(async (value) => {
        this.plugin.settings.checkpointBeforeChanges = value;
        await this.plugin.saveSettings();
      }));
    containerEl.createEl("h3", { text: "AI" });
    new Setting(containerEl)
      .setName("AI enabled")
      .setDesc("V1 includes the interface only. No network requests are made.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.aiEnabled).setDisabled(true));
    new Setting(containerEl)
      .setName("Provider")
      .setDesc("No provider is configured in V1.")
      .addDropdown((dropdown) => dropdown.addOption("none", "None").setValue("none").setDisabled(true));
    new Setting(containerEl)
      .setName("Debug")
      .setDesc("Log Growth Map diagnostics to the developer console.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.debug).onChange(async (value) => {
        this.plugin.settings.debug = value;
        await this.plugin.saveSettings();
      }));
  }
}
