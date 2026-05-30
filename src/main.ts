import {App, Editor, MarkdownView, Modal, Notice, Menu, Plugin} from 'obsidian';
import {DEFAULT_SETTINGS, InLineAITutorPluginSettings, InLineAITutorSettingsTab} from "./settings";
import {viewPluginFactoryMethod, submitToLLM} from "./editor-plugin";


export default class InLineAITutorPlugin extends Plugin {	
	settings!:InLineAITutorPluginSettings;
	systemPrompt!:string;

	async loadSettings(){
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}
	
	async saveSettings(){
		await this.saveData(this.settings);
	}

	async loadSystemPrompt(){
		const path = `${this.manifest.dir}/configs/default_sys_prompt.md`;
		this.systemPrompt = await this.app.vault.adapter.read(path);
	}
	async onload() {
		await this.loadSettings();
		await this.loadSystemPrompt();

		this.addSettingTab(new InLineAITutorSettingsTab(this.app, this));
		
		this.registerEditorExtension([viewPluginFactoryMethod(this)])

		this.addCommand({
			id: "submit-ai-prompt",
			name: "submit to the LLM",
			hotkeys: [{ 
				modifiers: ["Mod","Shift"], 
				key: "L"
			}],
			editorCallback: async (_editor, view) => {
				const buttonCheck = document.getElementById('ai-submit-button');
				if (buttonCheck === null) return;
				// @ts-expect-error
				const editorView = view.editor.cm as EditorView;
				await submitToLLM(editorView, this);
			}
		})
	}
}