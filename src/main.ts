import {App, Editor, MarkdownView, Modal, Notice, Menu, Plugin} from 'obsidian';
// import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";

import {inlineAssistantPlugin, submitToLLM} from "./editor-plugin";

export default class MyPlugin extends Plugin {
	async onload() {

		this.addRibbonIcon("paper-plane", "Print to console", 
							()=>{
									new Notice("testing plugins");
									console.log('testing plugins');
								}
						)

		this.registerEditorExtension([inlineAssistantPlugin])

		this.addCommand({
			id: "submit-ai-prompt",
			name: "submit to the LLM",
			hotkeys: [{ 
				modifiers: ["Mod","Shift"], 
				key: "L"
			}],
			editorCallback: async (_editor, view) => {
				console.log('hot key detected');
				const buttonCheck = document.getElementById('ai-submit-button');
				if (buttonCheck === null) return;
				// buttonCheck.style.display = "none";
				// @ts-expect-error
				const editorView = view.editor.cm as EditorView;
				await submitToLLM(editorView);
			}
		})
	}
}