import type InLineAITutorPlugin from "./main";
import {App, PluginSettingTab, Setting} from "obsidian"

// export type APIFrameWork = "lmstudio" | "ollama" | "llamacpp";

export interface InLineAITutorPluginSettings {
	baseURL:string;
	modelName:string;
	framework:string;
	defaultContext:string;
	// inlineLLMId:string;
	// inlineLLMResponseId:string;
}

export const DEFAULT_SETTINGS: Partial<InLineAITutorPluginSettings> = {
	baseURL: "http://127.0.0.1:1234",
	modelName: "google/gemma-4-26b-a4b",
	framework: "lmstudio",
	defaultContext: "doc",
	// inlineLLMId: "assistant",
	// inlineLLMResponseId:"response",
}
export class InLineAITutorSettingsTab extends PluginSettingTab{
	plugin: InLineAITutorPlugin;
	
	constructor(app:App, plugin:InLineAITutorPlugin){
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;
		containerEl.empty()
		
		new Setting(containerEl)
			.setName("API URL")
			.addText((text)=> {
				text.setPlaceholder("https//example.com:")
					.setValue(this.plugin.settings.baseURL)
					.onChange(async (value) => {
						this.plugin.settings.baseURL = value;
						await this.plugin.saveSettings();
					})
			})
		
		new Setting(containerEl)
			.setName("model id")
			.addText((text)=> {
				text.setPlaceholder("company/cool-model-1b")
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value:string)=> {
						this.plugin.settings.modelName = value;
						await this.plugin.saveSettings();
					})
			})

		// new Setting(containerEl)
		// 	.setName("llm activation identifier")
		// 	.addText((text)=> {
		// 		text.setPlaceholder("llm_activate!")
		// 			.setValue(this.plugin.settings.inlineLLMId)
		// 			.onChange(async (value:string)=> {
		// 				this.plugin.settings.inlineLLMId = value;
		// 				await this.plugin.saveSettings();
		// 			})
		// 	})

		// new Setting(containerEl)
		// 	.setName("llm response identifier")
		// 	.addText((text)=> {
		// 		text.setPlaceholder("elementary-watson")
		// 			.setValue(this.plugin.settings.inlineLLMResponseId)
		// 			.onChange(async (value:string)=> {
		// 				this.plugin.settings.inlineLLMResponseId = value;
		// 				await this.plugin.saveSettings();
		// 			})
		// 	})

		new Setting(containerEl)
			.setName("backend")
			.addDropdown((dropdown)=> {
				dropdown
					.addOption("lmstudio", "LM-Studio")
					.addOption("llamacpp", "llama.cpp")
					.addOption("ollama", "ollama")
					.setValue(this.plugin.settings.framework)
					.onChange(async (value:string)=> {
						this.plugin.settings.framework = value;
						await this.plugin.saveSettings();
					})
			})
		
		new Setting(containerEl)
			.setName("default context")
			.addDropdown((dropdown)=> {
				dropdown
					.addOption("doc", "Whole document")
					.addOption("isolated", "No document context")
					.addOption("section", "immediate section only")
					.setValue(this.plugin.settings.defaultContext)
					.onChange(async (value:string)=> {
						this.plugin.settings.defaultContext = value;
						await this.plugin.saveSettings();
					})
			})

	}
}