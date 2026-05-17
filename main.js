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
  default: () => InLineAITutorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  baseURL: "http://127.0.0.1:1234",
  modelName: "google/gemma-4-26b-a4b",
  framework: "lmstudio",
  defaultContext: "doc"
  // inlineLLMId: "assistant",
  // inlineLLMResponseId:"response",
};
var InLineAITutorSettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    let { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("API URL").addText((text) => {
      text.setPlaceholder("https//example.com:").setValue(this.plugin.settings.baseURL).onChange(async (value) => {
        this.plugin.settings.baseURL = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("model id").addText((text) => {
      text.setPlaceholder("company/cool-model-1b").setValue(this.plugin.settings.modelName).onChange(async (value) => {
        this.plugin.settings.modelName = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("backend").addDropdown((dropdown) => {
      dropdown.addOption("lmstudio", "LM-Studio").addOption("llamacpp", "llama.cpp").addOption("ollama", "ollama").setValue(this.plugin.settings.framework).onChange(async (value) => {
        this.plugin.settings.framework = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("default context").addDropdown((dropdown) => {
      dropdown.addOption("doc", "Whole document").addOption("isolated", "No document context").addOption("section", "immediate section only").setValue(this.plugin.settings.defaultContext).onChange(async (value) => {
        this.plugin.settings.defaultContext = value;
        await this.plugin.saveSettings();
      });
    });
  }
};

// src/editor-plugin.ts
var import_state = require("@codemirror/state");
var import_obsidian2 = require("obsidian");
var import_view = require("@codemirror/view");
var SEPARATOR = "-".repeat(10);
function formatDate(timestamp) {
  const monthNames = [
    "jan",
    "feb",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec"
  ];
  const date = new Date(timestamp);
  const addPadding = (num) => num.toString().padStart(2, "0");
  const hh = addPadding(date.getHours());
  const mm = addPadding(date.getMinutes());
  const day = addPadding(date.getDate());
  const month = monthNames[date.getMonth() - 1];
  const year = date.getFullYear();
  return `${hh}:${mm} ${day} ${month} ${year}`;
}
var IMAGE_FILE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
async function formatTextBlob(plugin, text, idx = 1) {
  const file = plugin.app.workspace.getActiveFile();
  const sourcePath = file?.path;
  const regexPattern = /\!\[\[([\w\s_\-]+\.\w+)\]\]|\!\[.+\]\(([\w\s_\-]+\.\w+)\)/g;
  const lines = text.split("\n");
  const buffer = [];
  const contentArray = [];
  let number = idx;
  let interimObj;
  for (const line of lines) {
    const matches = [...line.matchAll(regexPattern)];
    if (matches.length > 0) {
      interimObj = [];
      for (const match of matches) {
        const matched = match[1] ?? match[2];
        if (IMAGE_FILE_TYPES.contains(matched.split(".")[1])) {
          const target = plugin.app.metadataCache.getFirstLinkpathDest(matched, sourcePath);
          const imagePath = target?.path;
          console.log("image found: ", imagePath);
          if (imagePath) {
            const data = await plugin.app.vault.readBinary(target);
            const fileBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            const imStr = `data:image/${matched.split(".")[1]};base64,${fileBuffer.toString("base64")}}`;
            contentArray.push({ type: "text", text: `<position_${number}>` });
            contentArray.push({ type: "image_url", image_url: { url: imStr } });
            contentArray.push({ type: "text", text: `</position_${number}>` });
            number++;
          }
        }
      }
    } else if (line.trim() === "") {
      contentArray.push({ type: "text", text: `<position_${number}>${buffer.join("\n")}<position_${number}` });
      number++;
      buffer.length = 0;
    } else if (line.trim() !== "") {
      buffer.push(line);
    }
  }
  return { contentArray, number };
}
function getQueryContext(view, beforeLine, afterLine, sectionOnly = false) {
  let number = beforeLine;
  const beforeLines = [];
  while (number > 0) {
    const line = view.state.doc.line(number);
    if (sectionOnly && line.text.startsWith("## ")) {
      break;
    }
    beforeLines.unshift(line.text);
    number--;
  }
  number = afterLine;
  const afterLines = [];
  while (number < view.state.doc.lines) {
    const line = view.state.doc.line(number);
    if (sectionOnly && line.text.startsWith("## ")) {
      break;
    }
    afterLines.push(line.text);
    number++;
  }
  const beforeText = beforeLines.join("\n");
  const afterText = afterLines.join("\n");
  return { beforeText, afterText };
}
async function submitToLLM(view, plugin) {
  const submitTime = formatDate(Date.now());
  const { content, beforeLine, afterLine } = getLLMquery(view);
  console.log("submitted at:", submitTime);
  const defaultType = plugin.settings.defaultContext;
  const firstWord = content.split(" ")[0];
  const options = firstWord.split(":").slice(1, void 0);
  if (options.length === 1 && options[0] === "") options.length = 0;
  let beforeText = null, afterText = null;
  if (options.contains("isolated") || defaultType === "isolated" && options.length === 0) {
    beforeText = null;
    afterText = null;
  } else if (options.contains("doc") || defaultType === "doc" && options.length === 0) {
    const context = getQueryContext(view, beforeLine, afterLine);
    beforeText = context.beforeText;
    afterText = context.afterText;
  } else if (options.contains("section") || defaultType === "section" && options.length === 0) {
    const context = getQueryContext(view, beforeLine, afterLine, true);
    beforeText = context.beforeText;
    afterText = context.afterText;
  }
  const answer = await pingLLM(plugin, content, beforeText, afterText);
  if (answer) {
    console.log(answer);
    const receiveTime = formatDate(Date.now());
    appendAnswer(view, answer, submitTime, receiveTime);
  } else {
    new import_obsidian2.Notice("Call failed");
  }
}
function appendAnswer(view, text, submitTime, receiveTime) {
  const pos = view.state.selection.main.head;
  let currLine = view.state.doc.lineAt(pos);
  while (currLine.number < view.state.doc.lines) {
    currLine = view.state.doc.line(currLine.number + 1);
    if (currLine.text.trim() === "") {
      currLine = view.state.doc.line(currLine.number - 1);
      break;
    }
  }
  view.dispatch({
    selection: { anchor: currLine.to },
    scrollIntoView: true
  });
  const formattedText = ` (submitted at ${submitTime})
**@response** ${text} (responded at ${receiveTime})

`;
  view.dispatch({
    changes: { from: currLine.to, insert: formattedText },
    selection: { anchor: currLine.to + formattedText.length }
  });
}
async function pingLLM(plugin, query, beforeText, afterText) {
  const base_url = plugin.settings.baseURL;
  const url = `${base_url}/v1/chat/completions`;
  const model = plugin.settings.modelName;
  const system_prompt = "You are a concise and succinct assistant operating inside Obsidian.MD, a specialized note taking app.";
  const method = "POST";
  let befArrayFormatted = [], aftArrayFormatted = [], num = 0;
  if (beforeText) {
    let { contentArray, number } = await formatTextBlob(plugin, beforeText, num);
    num = number;
    befArrayFormatted = contentArray;
    befArrayFormatted.unshift(
      { type: "text", text: `${SEPARATOR} START OF DOCUMENT PART ABOVE QUERY ${SEPARATOR}
` }
    );
    befArrayFormatted.push(
      { type: "text", text: `${SEPARATOR} END OF DOCUMENT PART ABOVE QUERY ${SEPARATOR}
` }
    );
  }
  const active_num = num;
  num++;
  if (afterText) {
    let { contentArray, number } = await formatTextBlob(plugin, afterText, num);
    num = number;
    aftArrayFormatted = contentArray;
    aftArrayFormatted.unshift(
      { type: "text", text: `${SEPARATOR} START OF DOCUMENT PART BELOW QUERY ${SEPARATOR}
` }
    );
    aftArrayFormatted.push(
      { type: "text", text: `${SEPARATOR} END OF DOCUMENT PART BELOW QUERY ${SEPARATOR}
` }
    );
  }
  const payload = {
    url,
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: plugin.systemPrompt },
        {
          role: "user",
          content: [
            // {type: "text", text: beforeText ?? "\n"},
            ...befArrayFormatted,
            { type: "text", text: `<position_${active_num}> *This is the position of the user question/prompt currently posed to you* </position_${active_num}>` },
            // {type: "text", text: afterText  ?? "\n"},
            ...aftArrayFormatted,
            { type: "text", text: `current user prompt: ${query.split(" ").slice(1, void 0).join(" ")}` }
          ]
        }
      ],
      temperature: 0.9
    })
  };
  const response = await (0, import_obsidian2.requestUrl)(payload);
  return response.json.choices?.[0]?.message?.content ?? null;
}
function getLLMquery(view) {
  const pos = view.state.selection.main.head;
  const allLines = [];
  const line = view.state.doc.lineAt(pos);
  const numLines = view.state.doc.lines;
  let number = line.number;
  allLines.push(line.text);
  let beforeLine = 1e5;
  let afterLine = 0;
  while (number > 1) {
    number--;
    let currLine = view.state.doc.line(number);
    if (currLine.text.trim() === "") {
      break;
    } else {
      allLines.unshift(currLine.text);
    }
  }
  beforeLine = number;
  number = line.number;
  while (number < numLines - 1) {
    number++;
    const nextLine = view.state.doc.line(number);
    if (nextLine && nextLine?.text.trim() !== "") {
      allLines.push(nextLine.text);
    } else {
      break;
    }
  }
  afterLine = number;
  return { content: allLines.join("\n"), beforeLine, afterLine };
}
var InlineAIWidget = class extends import_view.WidgetType {
  constructor(plugin, view, from, to) {
    super();
    this.plugin = plugin;
    this.view = view;
    this.from = from;
    this.to = to;
  }
  eq(other) {
    return this.from === other.from && this.to === other.to;
  }
  toDOM(view) {
    const button = document.createElement("button");
    button.innerText = "submit";
    button.style.position = "absolute";
    button.style.right = "0px";
    button.style.top = "0px";
    button.id = "ai-submit-button";
    button.onclick = async () => {
      submitToLLM(this.view, this.plugin);
    };
    return button;
  }
};
function viewPluginFactoryMethod(_plugin) {
  class InlineAIATEditorVIewPlugin {
    constructor(view) {
      this.decorations = this.buildDecorations(view);
      this.plugin = _plugin;
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
    destroy() {
    }
    buildDecorations(view) {
      const builder = new import_state.RangeSetBuilder();
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      let number = line.number;
      const paraLines = [];
      paraLines.push(line.text);
      while (number > 1) {
        number--;
        let currLine = view.state.doc.line(number);
        if (currLine.text.trim() === "") break;
        else paraLines.unshift(currLine.text);
      }
      while (number < view.state.doc.lines - 1) {
        number++;
        const AftLine = view.state.doc.line(number);
        if (AftLine.text.trim() === "") break;
        else paraLines.push(AftLine.text);
      }
      const paraText = paraLines.join("\n");
      console.log("paraText: ", paraText);
      const prevLine = line.number > 1 ? view.state.doc.line(line.number - 1) : null;
      if (line.text.startsWith("@assistant") && line.number > 1 && prevLine?.text.trim() !== "") {
        console.log("will need to add a line break");
        const insertionStr = "\n";
        setTimeout(() => {
          view.dispatch({
            changes: { from: line.from, insert: insertionStr },
            selection: { anchor: line.to + insertionStr.length }
          });
        });
      } else if (paraText.startsWith("@assistant") && !paraText.contains("@response")) {
        builder.add(
          line.to,
          line.to,
          import_view.Decoration.widget(
            { widget: new InlineAIWidget(this.plugin, view, line.to, line.to), side: 1 }
          )
        );
      }
      return builder.finish();
    }
  }
  const pluginSpec = {
    decorations: (value) => value.decorations
  };
  const inlineAIAIPlugin = import_view.ViewPlugin.fromClass(
    InlineAIATEditorVIewPlugin,
    pluginSpec
  );
  return inlineAIAIPlugin;
}

// src/main.ts
var InLineAITutorPlugin = class extends import_obsidian3.Plugin {
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async loadSystemPrompt() {
    const path = `${this.manifest.dir}/configs/default_sys_prompt.md`;
    this.systemPrompt = await this.app.vault.adapter.read(path);
  }
  async onload() {
    await this.loadSettings();
    await this.loadSystemPrompt();
    this.addRibbonIcon(
      "paper-plane",
      "Print to console",
      () => {
        new import_obsidian3.Notice("testing plugins");
        console.log("testing plugins");
      }
    );
    this.addSettingTab(new InLineAITutorSettingsTab(this.app, this));
    this.registerEditorExtension([viewPluginFactoryMethod(this)]);
    this.addCommand({
      id: "submit-ai-prompt",
      name: "submit to the LLM",
      hotkeys: [{
        modifiers: ["Mod", "Shift"],
        key: "L"
      }],
      editorCallback: async (_editor, view) => {
        const buttonCheck = document.getElementById("ai-submit-button");
        if (buttonCheck === null) return;
        const editorView = view.editor.cm;
        await submitToLLM(editorView, this);
      }
    });
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3MhOkluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncztcblx0c3lzdGVtUHJvbXB0ITpzdHJpbmc7XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCl7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSlcblx0fVxuXHRcblx0YXN5bmMgc2F2ZVNldHRpbmdzKCl7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTeXN0ZW1Qcm9tcHQoKXtcblx0XHRjb25zdCBwYXRoID0gYCR7dGhpcy5tYW5pZmVzdC5kaXJ9L2NvbmZpZ3MvZGVmYXVsdF9zeXNfcHJvbXB0Lm1kYDtcblx0XHR0aGlzLnN5c3RlbVByb21wdCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChwYXRoKTtcblx0fVxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRTeXN0ZW1Qcm9tcHQoKTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKHRoaXMuc3lzdGVtUHJvbXB0KTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKHRoaXMuc2V0dGluZ3MpO1xuXHRcdHRoaXMuYWRkUmliYm9uSWNvbihcInBhcGVyLXBsYW5lXCIsIFwiUHJpbnQgdG8gY29uc29sZVwiLCBcblx0XHRcdFx0XHRcdFx0KCk9Pntcblx0XHRcdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJ0ZXN0aW5nIHBsdWdpbnNcIik7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygndGVzdGluZyBwbHVnaW5zJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbdmlld1BsdWdpbkZhY3RvcnlNZXRob2QodGhpcyldKVxuXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcInN1Ym1pdC1haS1wcm9tcHRcIixcblx0XHRcdG5hbWU6IFwic3VibWl0IHRvIHRoZSBMTE1cIixcblx0XHRcdGhvdGtleXM6IFt7IFxuXHRcdFx0XHRtb2RpZmllcnM6IFtcIk1vZFwiLFwiU2hpZnRcIl0sIFxuXHRcdFx0XHRrZXk6IFwiTFwiXG5cdFx0XHR9XSxcblx0XHRcdGVkaXRvckNhbGxiYWNrOiBhc3luYyAoX2VkaXRvciwgdmlldykgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnaG90IGtleSBkZXRlY3RlZCcpO1xuXHRcdFx0XHRjb25zdCBidXR0b25DaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaS1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRcdGlmIChidXR0b25DaGVjayA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHQvLyBidXR0b25DaGVjay5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0Y29uc3QgZWRpdG9yVmlldyA9IHZpZXcuZWRpdG9yLmNtIGFzIEVkaXRvclZpZXc7XG5cdFx0XHRcdGF3YWl0IHN1Ym1pdFRvTExNKGVkaXRvclZpZXcsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdH1cbn0iLCAiaW1wb3J0IHR5cGUgSW5MaW5lQUlUdXRvclBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge0FwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZ30gZnJvbSBcIm9ic2lkaWFuXCJcblxuLy8gZXhwb3J0IHR5cGUgQVBJRnJhbWVXb3JrID0gXCJsbXN0dWRpb1wiIHwgXCJvbGxhbWFcIiB8IFwibGxhbWFjcHBcIjtcblxuZXhwb3J0IGludGVyZmFjZSBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3Mge1xuXHRiYXNlVVJMOnN0cmluZztcblx0bW9kZWxOYW1lOnN0cmluZztcblx0ZnJhbWV3b3JrOnN0cmluZztcblx0ZGVmYXVsdENvbnRleHQ6c3RyaW5nO1xuXHQvLyBpbmxpbmVMTE1JZDpzdHJpbmc7XG5cdC8vIGlubGluZUxMTVJlc3BvbnNlSWQ6c3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGFydGlhbDxJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3M+ID0ge1xuXHRiYXNlVVJMOiBcImh0dHA6Ly8xMjcuMC4wLjE6MTIzNFwiLFxuXHRtb2RlbE5hbWU6IFwiZ29vZ2xlL2dlbW1hLTQtMjZiLWE0YlwiLFxuXHRmcmFtZXdvcms6IFwibG1zdHVkaW9cIixcblx0ZGVmYXVsdENvbnRleHQ6IFwiZG9jXCIsXG5cdC8vIGlubGluZUxMTUlkOiBcImFzc2lzdGFudFwiLFxuXHQvLyBpbmxpbmVMTE1SZXNwb25zZUlkOlwicmVzcG9uc2VcIixcbn1cbmV4cG9ydCBjbGFzcyBJbkxpbmVBSVR1dG9yU2V0dGluZ3NUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFie1xuXHRwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW47XG5cdFxuXHRjb25zdHJ1Y3RvcihhcHA6QXBwLCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0ZGlzcGxheSgpOiB2b2lkIHtcblx0XHRsZXQge2NvbnRhaW5lckVsfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgVVJMXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJodHRwcy8vZXhhbXBsZS5jb206XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJhc2VVUkwpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFzZVVSTCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIm1vZGVsIGlkXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJjb21wYW55L2Nvb2wtbW9kZWwtMWJcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIGFjdGl2YXRpb24gaWRlbnRpZmllclwiKVxuXHRcdC8vIFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdC8vIFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwibGxtX2FjdGl2YXRlIVwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZClcblx0XHQvLyBcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0Ly8gXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIHJlc3BvbnNlIGlkZW50aWZpZXJcIilcblx0XHQvLyBcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHQvLyBcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImVsZW1lbnRhcnktd2F0c29uXCIpXG5cdFx0Ly8gXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTVJlc3BvbnNlSWQpXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNUmVzcG9uc2VJZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiYmFja2VuZFwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bik9PiB7XG5cdFx0XHRcdGRyb3Bkb3duXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImxtc3R1ZGlvXCIsIFwiTE0tU3R1ZGlvXCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImxsYW1hY3BwXCIsIFwibGxhbWEuY3BwXCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcIm9sbGFtYVwiLCBcIm9sbGFtYVwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mcmFtZXdvcmspXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZnJhbWV3b3JrID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiZGVmYXVsdCBjb250ZXh0XCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKT0+IHtcblx0XHRcdFx0ZHJvcGRvd25cblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiZG9jXCIsIFwiV2hvbGUgZG9jdW1lbnRcIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiaXNvbGF0ZWRcIiwgXCJObyBkb2N1bWVudCBjb250ZXh0XCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcInNlY3Rpb25cIiwgXCJpbW1lZGlhdGUgc2VjdGlvbiBvbmx5XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblxuXHR9XG59IiwgIi8vIGltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tICdAY29kZW1pcnJvci9sYW5ndWFnZSc7XG5pbXBvcnQgeyBSYW5nZVNldEJ1aWxkZXIgfSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7XG5pbXBvcnQge3JlcXVlc3RVcmwsIEVkaXRvciwgTm90aWNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG4vLyBpbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiYnVmZmVyXCI7XG5pbXBvcnQge1xuICBEZWNvcmF0aW9uLFxuICBEZWNvcmF0aW9uU2V0LFxuICBFZGl0b3JWaWV3LFxuICBQbHVnaW5TcGVjLFxuICBQbHVnaW5WYWx1ZSxcbiAgVmlld1BsdWdpbixcbiAgVmlld1VwZGF0ZSxcbiAgV2lkZ2V0VHlwZSxcbn0gZnJvbSAnQGNvZGVtaXJyb3Ivdmlldyc7XG5cbmltcG9ydCBJbkxpbmVBSVR1dG9yUGx1Z2luIGZyb20gJy4vbWFpbic7XG5pbXBvcnQgeyBiZWZvcmUgfSBmcm9tICdub2RlOnRlc3QnO1xuXG5jb25zdCBTRVBBUkFUT1IgPSBcIi1cIi5yZXBlYXQoMTApO1xuXG5mdW5jdGlvbiBmb3JtYXREYXRlKHRpbWVzdGFtcDpudW1iZXIpOnN0cmluZ3tcbiAgY29uc3QgbW9udGhOYW1lcyA9IFtcImphblwiLCAnZmViJywgXCJhcHJcIiwgJ21heScsICdqdW4nLCAnanVsJyxcbiAgICAgICAgICAgICAgXCJhdWdcIiwgXCJzZXBcIiwgXCJvY3RcIiwgXCJub3ZcIiwgXCJkZWNcIl07XG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0aW1lc3RhbXApO1xuICBjb25zdCBhZGRQYWRkaW5nID0gKG51bTpudW1iZXIpOiBzdHJpbmcgPT4gbnVtLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICBjb25zdCBoaCA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRIb3VycygpKTtcbiAgY29uc3QgbW0gPSBhZGRQYWRkaW5nKGRhdGUuZ2V0TWludXRlcygpKTtcbiAgY29uc3QgZGF5ID0gYWRkUGFkZGluZyhkYXRlLmdldERhdGUoKSk7XG4gIGNvbnN0IG1vbnRoID0gbW9udGhOYW1lc1soZGF0ZS5nZXRNb250aCgpKS0xXTtcbiAgY29uc3QgeWVhciA9IGRhdGUuZ2V0RnVsbFllYXIoKTtcblxuICByZXR1cm4gYCR7aGh9OiR7bW19ICR7ZGF5fSAke21vbnRofSAke3llYXJ9YDtcbn1cblxuZXhwb3J0IHR5cGUgbWF5YmVTdHJpbmcgPSBzdHJpbmcgfCBudWxsO1xuXG5leHBvcnQgY29uc3QgSU1BR0VfRklMRV9UWVBFUyA9IFsncG5nJywgJ2pwZycsICdqcGVnJywgJ2dpZicsICd3ZWJwJywgJ2JtcCcsICdzdmcnXVxuXG5hc3luYyBmdW5jdGlvbiBmb3JtYXRUZXh0QmxvYihwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgdGV4dDpzdHJpbmcsIGlkeDpudW1iZXI9MSl7XG4gIC8vIGNvbnN0IHJlZ2V4UGF0dGVybjogUmVnRXhwID0gbmV3IFJlZ0V4cChcIlxcIVxcW1xcWyhbXFx3XFxzLlxcLV9dKylcXF1cXF1cIiwgJ2cnKTtcbiAgY29uc3QgZmlsZSA9IHBsdWdpbi5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgY29uc3Qgc291cmNlUGF0aCA9IGZpbGU/LnBhdGggYXMgc3RyaW5nO1xuICBjb25zdCByZWdleFBhdHRlcm4gPSAvXFwhXFxbXFxbKFtcXHdcXHNfXFwtXStcXC5cXHcrKVxcXVxcXXxcXCFcXFsuK1xcXVxcKChbXFx3XFxzX1xcLV0rXFwuXFx3KylcXCkvZztcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcbiAgY29uc3QgYnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjb250ZW50QXJyYXk6b2JqZWN0W10gPSBbXTtcbiAgXG4gIGxldCBudW1iZXIgPSBpZHg7XG4gIGxldCBpbnRlcmltT2JqOm9iamVjdHxBcnJheTxvYmplY3Q+O1xuICBcbiAgLy8gdGVzdCBwYXR0ZXJuIFxuICAvLyBjb25zdCB0ZXh0XyA9ICchW1tQYXN0ZWQgaW1hZ2UgMjAyNjA1MTcwNDE0MDcucG5nXV0nO1xuICAvLyBjb25zdCByZSA9IC8hXFxbXFxbKFtcXHdcXHNfLV0rXFwuXFx3KylcXF1cXF0vZztcbiAgLy8gY29uc29sZS5sb2coJ3Rlc3RpbmcgcGF0dGVybicpO1xuICAvLyBmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHRfLm1hdGNoQWxsKHJlKSkge1xuICAvLyAgIGNvbnNvbGUubG9nKG1hdGNoWzBdKTsgLy8gd2hvbGUgIVtbLi4uXV1cbiAgLy8gICBjb25zb2xlLmxvZyhtYXRjaFsxXSk7IC8vIFBhc3RlZCBpbWFnZSAyMDI2MDUxNzA0MTQwNy5wbmdcbiAgLy8gfVxuICAvLyBjb25zb2xlLmxvZyhcImVuZCBvZiBwYXR0ZXJuIHRlc3RcIilcbiAgLy8gdGVzdCBwYXR0ZXJuIFxuXG4gIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgIGNvbnN0IG1hdGNoZXMgPSBbLi4ubGluZS5tYXRjaEFsbChyZWdleFBhdHRlcm4pXTtcbiAgICAvLyBjb25zb2xlLmxvZyhbLi4uJyFbW1Bhc3RlZCBpbWFnZSAyMDI2MDUxNzA0MTQwNy5wbmddXScubWF0Y2hBbGwocmVnZXhQYXR0ZXJuKV0pO1xuICAgIC8vIGNvbnNvbGUubG9nKFwiTElORTpcIiwgSlNPTi5zdHJpbmdpZnkobGluZSkpXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoPjApe1xuICAgICAgLy8gZXh0cmFjdCBpbWFnZSwgY29udmVydCB0byBiYXNlXG4gICAgICBpbnRlcmltT2JqID0gW11cbiAgICAgIGZvcihjb25zdCBtYXRjaCBvZiBtYXRjaGVzKXtcbiAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG1hdGNoWzFdID8/IG1hdGNoWzJdO1xuICAgICAgICBpZiAoSU1BR0VfRklMRV9UWVBFUy5jb250YWlucyhtYXRjaGVkLnNwbGl0KCcuJylbMV0pKXtcbiAgICAgICAgICBjb25zdCB0YXJnZXQgPSBwbHVnaW4uYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QobWF0Y2hlZCwgc291cmNlUGF0aCk7XG4gICAgICAgICAgY29uc3QgaW1hZ2VQYXRoID0gdGFyZ2V0Py5wYXRoO1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1hZ2UgZm91bmQ6IFwiLCBpbWFnZVBhdGgpXG4gICAgICAgICAgaWYoaW1hZ2VQYXRoKXtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBwbHVnaW4uYXBwLnZhdWx0LnJlYWRCaW5hcnkodGFyZ2V0KTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVCdWZmZXIgPSBCdWZmZXIuaXNCdWZmZXIoZGF0YSkgPyBkYXRhIDogQnVmZmVyLmZyb20oZGF0YSBhcyBBcnJheUJ1ZmZlcik7XG4gICAgICAgICAgICBjb25zdCBpbVN0ciA9IGBkYXRhOmltYWdlLyR7bWF0Y2hlZC5zcGxpdCgnLicpWzFdfTtiYXNlNjQsJHtmaWxlQnVmZmVyLnRvU3RyaW5nKFwiYmFzZTY0XCIpfX1gXG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke251bWJlcn0+YH0pO1xuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJpbWFnZV91cmxcIiwgaW1hZ2VfdXJsOiB7dXJsOmltU3RyfX0pO1xuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGA8L3Bvc2l0aW9uXyR7bnVtYmVyfT5gfSk7XG4gICAgICAgICAgICBudW1iZXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAobGluZS50cmltKCk9PT1cIlwiKXtcbiAgICAgICAgLy8gbWVyZ2UgYnVmZmVyXG4gICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgPHBvc2l0aW9uXyR7bnVtYmVyfT4ke2J1ZmZlci5qb2luKFwiXFxuXCIpfTxwb3NpdGlvbl8ke251bWJlcn1gfSk7XG4gICAgICAgIG51bWJlcisrO1xuICAgICAgICBidWZmZXIubGVuZ3RoID0gMDtcbiAgICB9XG4gICAgZWxzZSBpZiAobGluZS50cmltKCkhPT1cIlwiKXtcbiAgICAgIC8vIGFkZCB0byBidWZmZXJcbiAgICAgIGJ1ZmZlci5wdXNoKGxpbmUpO1xuICAgIH1cbiAgICAvLyBhZGQgcG9zaXRpb24gbnVtYmVyIGFuZCBhcHBlbmQgdGhlIG1lc3NhZ2UgdG8gdGhlIGNvbnRlbnQgYXJyYXkuXG4gIH1cblxuICByZXR1cm4ge2NvbnRlbnRBcnJheSwgbnVtYmVyfVxufVxuZnVuY3Rpb24gZ2V0UXVlcnlDb250ZXh0KHZpZXc6RWRpdG9yVmlldywgYmVmb3JlTGluZTpudW1iZXIsIGFmdGVyTGluZTpudW1iZXIsIHNlY3Rpb25Pbmx5OmJvb2xlYW49ZmFsc2UpXG46e2JlZm9yZVRleHQ6c3RyaW5nLCBhZnRlclRleHQ6c3RyaW5nfSAge1xuICBcbiAgbGV0IG51bWJlciA9IGJlZm9yZUxpbmU7XG4gIGNvbnN0IGJlZm9yZUxpbmVzID0gW107XG4gIHdoaWxlIChudW1iZXIgPiAwKXtcbiAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgIGlmIChzZWN0aW9uT25seSAmJiAobGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKXtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGJlZm9yZUxpbmVzLnVuc2hpZnQobGluZS50ZXh0KTtcbiAgICBudW1iZXItLTtcbiAgfVxuXG4gIG51bWJlciA9IGFmdGVyTGluZTtcbiAgY29uc3QgYWZ0ZXJMaW5lcyA9IFtdO1xuICB3aGlsZSAobnVtYmVyIDwgdmlldy5zdGF0ZS5kb2MubGluZXMpe1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgaWYgKHNlY3Rpb25Pbmx5ICYmIChsaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYWZ0ZXJMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgbnVtYmVyKys7XG4gIH1cbiAgXG5cbiAgY29uc3QgYmVmb3JlVGV4dCA9IGJlZm9yZUxpbmVzLmpvaW4oJ1xcbicpXG4gIGNvbnN0IGFmdGVyVGV4dCA9IGFmdGVyTGluZXMuam9pbignXFxuJylcblxuICAvLyBjb25zb2xlLmxvZyhcIkJFRk9SRSBURVhUOlwiLCBiZWZvcmVUZXh0KTtcbiAgLy8gY29uc29sZS5sb2coXCJBRlRFUiBURVhUOlwiLCBhZnRlclRleHQpO1xuICByZXR1cm4ge2JlZm9yZVRleHQsIGFmdGVyVGV4dH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN1Ym1pdFRvTExNKHZpZXc6RWRpdG9yVmlldywgcGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4pe1xuICAgIC8vIGNvbnNvbGUubG9nKFwic3VibWl0dGluZyBzb21ldGhpbmchXCIpO1xuICAgIC8vIG5ldyBOb3RpY2UoXCJzdWJtaXR0aW5nIHRvIExMTVwiKTtcbiAgICBjb25zdCBzdWJtaXRUaW1lID0gZm9ybWF0RGF0ZShEYXRlLm5vdygpKTtcbiAgICBjb25zdCB7Y29udGVudCwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfSA9IGdldExMTXF1ZXJ5KHZpZXcpO1xuICAgIGNvbnNvbGUubG9nKFwic3VibWl0dGVkIGF0OlwiLCBzdWJtaXRUaW1lKTtcbiAgICAvLyBjb25zb2xlLmxvZyhjb250ZW50KTtcbiAgICBcbiAgICBjb25zdCBkZWZhdWx0VHlwZSA9IHBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0Q29udGV4dDtcbiAgICBjb25zdCBmaXJzdFdvcmQgPSBjb250ZW50LnNwbGl0KFwiIFwiKVswXTtcbiAgICBjb25zdCBvcHRpb25zID0gZmlyc3RXb3JkLnNwbGl0KFwiOlwiKS5zbGljZSgxLCB1bmRlZmluZWQpO1xuICAgIC8vIGNvbnNvbGUubG9nKG9wdGlvbnMpXG4gICAgaWYoKG9wdGlvbnMubGVuZ3RoPT09MSkgJiYob3B0aW9uc1swXT09PVwiXCIpKSBvcHRpb25zLmxlbmd0aCA9IDA7XG4gICAgLy8gbGV0IGFuc3dlcjpzdHJpbmc7XG4gICAgbGV0IGJlZm9yZVRleHQ6IG1heWJlU3RyaW5nPW51bGwsIGFmdGVyVGV4dDogbWF5YmVTdHJpbmc9bnVsbDtcblxuICAgIGlmKG9wdGlvbnMuY29udGFpbnMoJ2lzb2xhdGVkJyl8fCgoZGVmYXVsdFR5cGU9PT1cImlzb2xhdGVkXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKSl7XG4gICAgICBiZWZvcmVUZXh0ID0gbnVsbDtcbiAgICAgIGFmdGVyVGV4dCA9IG51bGw7XG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJkb2NcIil8fChkZWZhdWx0VHlwZT09PVwiZG9jXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICAgIFxuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNvbnRhaW5zKFwic2VjdGlvblwiKXx8KGRlZmF1bHRUeXBlPT09XCJzZWN0aW9uXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lLCB0cnVlKTtcbiAgICAgIC8vIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICB9XG4gICAgXG4gICAgLy8gICAgICAgY3VybCBodHRwOi8vbG9jYWxob3N0OjEyMzQvYXBpL3YxL2NoYXQgXFxcbiAgICAvLyAgIC1IIFwiQ29udGVudC1UeXBlOiBhcHBsaWNhdGlvbi9qc29uXCIgXFxcbiAgICAvLyAgIC1kICd7XG4gICAgLy8gICAgIFwibW9kZWxcIjogXCJnb29nbGUvZ2VtbWEtNC0yNmItYTRiXCIsXG4gICAgLy8gICAgIFwic3lzdGVtX3Byb21wdFwiOiBcIllvdSBhbnN3ZXIgb25seSBpbiByaHltZXMuXCIsXG4gICAgLy8gICAgIFwiaW5wdXRcIjogXCJXaGF0IGlzIHlvdXIgZmF2b3JpdGUgY29sb3I/XCJcbiAgICAvLyB9J1xuICAgIGNvbnN0IGFuc3dlciA9IGF3YWl0IHBpbmdMTE0ocGx1Z2luLCBjb250ZW50LCBiZWZvcmVUZXh0LCBhZnRlclRleHQpO1xuICAgIGlmKGFuc3dlcil7XG4gICAgICAvLyBuZXcgTm90aWNlKFwiUmVzcG9uc2UgcmVjZWl2ZWQhXCIpXG4gICAgICBjb25zb2xlLmxvZyhhbnN3ZXIpO1xuICAgICAgY29uc3QgcmVjZWl2ZVRpbWUgPSBmb3JtYXREYXRlKERhdGUubm93KCkpO1xuICAgICAgLy8gY29uc29sZS5sb2coXCJyZWNlaXZlZCBhdDpcIiwgcmVjZWl2ZVRpbWUpO1xuICAgIFxuICAgICAgYXBwZW5kQW5zd2VyKHZpZXcsIGFuc3dlciwgc3VibWl0VGltZSwgcmVjZWl2ZVRpbWUpO1xuICAgIH1cbiAgICBlbHNle1xuICAgICAgbmV3IE5vdGljZShcIkNhbGwgZmFpbGVkXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBlbmRBbnN3ZXIodmlldzpFZGl0b3JWaWV3LCB0ZXh0OnN0cmluZywgc3VibWl0VGltZTpzdHJpbmcsIHJlY2VpdmVUaW1lOnN0cmluZyl7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIHdoaWxlIChjdXJyTGluZS5udW1iZXI8dmlldy5zdGF0ZS5kb2MubGluZXMpe1xuICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlciArIDEpO1xuICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpPT09XCJcIil7XG4gICAgICAgIGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShjdXJyTGluZS5udW1iZXItMSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjpjdXJyTGluZS50b30sXG4gICAgICBzY3JvbGxJbnRvVmlldzp0cnVlXG4gICAgfSlcblxuICAgIGNvbnN0IGZvcm1hdHRlZFRleHQgPSBgIChzdWJtaXR0ZWQgYXQgJHtzdWJtaXRUaW1lfSlcXG4qKkByZXNwb25zZSoqICR7dGV4dH0gKHJlc3BvbmRlZCBhdCAke3JlY2VpdmVUaW1lfSlcXG5cXG5gXG4gICAgdmlldy5kaXNwYXRjaCh7XG4gICAgICAgIGNoYW5nZXM6IHtmcm9tOmN1cnJMaW5lLnRvLCBpbnNlcnQ6IGZvcm1hdHRlZFRleHR9LFxuICAgICAgICBzZWxlY3Rpb246IHthbmNob3I6IGN1cnJMaW5lLnRvK2Zvcm1hdHRlZFRleHQubGVuZ3RofVxuICAgIH0pXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBpbmdMTE0ocGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4sIHF1ZXJ5OnN0cmluZywgYmVmb3JlVGV4dDptYXliZVN0cmluZywgYWZ0ZXJUZXh0Om1heWJlU3RyaW5nKTpQcm9taXNlPHN0cmluZ3xudWxsPntcbiAgICBjb25zdCBiYXNlX3VybCA9IHBsdWdpbi5zZXR0aW5ncy5iYXNlVVJMO1xuICAgIGNvbnN0IHVybCA9IGAke2Jhc2VfdXJsfS92MS9jaGF0L2NvbXBsZXRpb25zYDtcbiAgICBjb25zdCBtb2RlbCA9IHBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWU7XG4gICAgY29uc3Qgc3lzdGVtX3Byb21wdCA9IFwiWW91IGFyZSBhIGNvbmNpc2UgYW5kIHN1Y2NpbmN0IGFzc2lzdGFudCBvcGVyYXRpbmcgaW5zaWRlIE9ic2lkaWFuLk1ELCBhIHNwZWNpYWxpemVkIG5vdGUgdGFraW5nIGFwcC5cIjtcbiAgICBcbiAgICBjb25zdCBtZXRob2QgPSBcIlBPU1RcIjtcblxuICAgIC8vIGNvbnNvbGUubG9nKCdiZWZvcmUgdGV4dCcsIGJlZm9yZVRleHQpO1xuICAgIC8vIGNvbnNvbGUubG9nKCdhZnRlciB0ZXh0JywgYWZ0ZXJUZXh0KTtcbiAgICBsZXQgYmVmQXJyYXlGb3JtYXR0ZWQ6b2JqZWN0W109W10sIGFmdEFycmF5Rm9ybWF0dGVkOm9iamVjdFtdPVtdLCBudW06bnVtYmVyPTA7XG4gICAgXG4gICAgaWYgKGJlZm9yZVRleHQpe1xuICAgICAgbGV0IHtjb250ZW50QXJyYXksIG51bWJlcn0gPSBhd2FpdCBmb3JtYXRUZXh0QmxvYihwbHVnaW4sIGJlZm9yZVRleHQsIG51bSk7XG4gICAgICBudW0gPSBudW1iZXI7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICAgIGJlZkFycmF5Rm9ybWF0dGVkLnVuc2hpZnQoXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZC5wdXNoKFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBBQk9WRSBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBjb25zb2xlLmxvZygnQkVGT1JFIENPTlRFTlQnLCBiZWZBcnJheUZvcm1hdHRlZCk7XG4gICAgY29uc3QgYWN0aXZlX251bSA9IG51bTtcbiAgICBudW0rKztcbiAgICBcbiAgICBpZiAoYWZ0ZXJUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBhZnRlclRleHQsIG51bSk7XG4gICAgICBudW0gPSBudW1iZXI7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICAgIGFmdEFycmF5Rm9ybWF0dGVkLnVuc2hpZnQoXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZC5wdXNoKFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBjb25zb2xlLmxvZygnQUZURVIgQ09OVEVOVCcsIGFmdEFycmF5Rm9ybWF0dGVkKTtcbiAgICAvLyBjb25zdCBiZWZvcmVUZXh0ID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YmVmb3JlTGluZXMuam9pbihcIlxcblwiKX1cXG4ke3NlcGFyYXRvcn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtzZXBhcmF0b3J9XFxuYDtcbiAgICAvLyBjb25zdCBhZnRlclRleHQgID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YWZ0ZXJMaW5lcy5qb2luKFwiXFxuXCIpfVxcbiR7c2VwYXJhdG9yfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke3NlcGFyYXRvcn1cXG5gOztcblxuICAgIC8vIGNvbnNvbGUubG9nKCdxdWVyeScsIHF1ZXJ5KVxuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICAgIHVybCxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgXCJBdXRob3JpemF0aW9uXCI6IFwiQmVhcmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIG1vZGVsLFxuICAgICAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgICAgICB7cm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogcGx1Z2luLnN5c3RlbVByb21wdH0sXG4gICAgICAgICAgICB7cm9sZTogXCJ1c2VyXCIsIFxuICAgICAgICAgICAgICBjb250ZW50OiBbXG4gICAgICAgICAgICAgICAgLy8ge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBiZWZvcmVUZXh0ID8/IFwiXFxuXCJ9LFxuICAgICAgICAgICAgICAgIC4uLmJlZkFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke2FjdGl2ZV9udW19PiAqVGhpcyBpcyB0aGUgcG9zaXRpb24gb2YgdGhlIHVzZXIgcXVlc3Rpb24vcHJvbXB0IGN1cnJlbnRseSBwb3NlZCB0byB5b3UqIDwvcG9zaXRpb25fJHthY3RpdmVfbnVtfT5gfSxcbiAgICAgICAgICAgICAgICAvLyB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGFmdGVyVGV4dCAgPz8gXCJcXG5cIn0sXG4gICAgICAgICAgICAgICAgLi4uYWZ0QXJyYXlGb3JtYXR0ZWQsXG4gICAgICAgICAgICAgICAge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBgY3VycmVudCB1c2VyIHByb21wdDogJHtxdWVyeS5zcGxpdChcIiBcIikuc2xpY2UoMSwgdW5kZWZpbmVkKS5qb2luKFwiIFwiKX1gfSxcbiAgICAgICAgICAgICAgXX1cbiAgICAgICAgICBdLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOjAuOSxcbiAgICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHBheWxvYWQpO1xuICByZXR1cm4gcmVzcG9uc2UuanNvbi5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0TExNcXVlcnkodmlldzpFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGNvbnN0IGFsbExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBcbiAgICBjb25zdCBudW1MaW5lcyA9IHZpZXcuc3RhdGUuZG9jLmxpbmVzO1xuICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICBhbGxMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgXG4gICAgbGV0IGJlZm9yZUxpbmU6bnVtYmVyPTEwMDAwMDtcbiAgICBsZXQgYWZ0ZXJMaW5lOm51bWJlcj0wO1xuXG4gICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgbnVtYmVyLS07XG4gICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpe1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnYnJlYWtpbmcgcG9pbnQnKVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBsaW5lX3FObzogJHtudW1iZXJ9IGxpbmU6ICR7Y3VyckxpbmUubnVtYmVyfWAsIFwidGV4dDogXCIsIGN1cnJMaW5lLnRleHQpXG4gICAgICAgIGFsbExpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIGJlZm9yZUxpbmU9bnVtYmVyO1xuICAgIFxuICAgIG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIHdoaWxlKG51bWJlcjwobnVtTGluZXMtMSkpe1xuICAgICAgbnVtYmVyKys7XG4gICAgICBjb25zdCBuZXh0TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChuZXh0TGluZSAmJiAobmV4dExpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAgIGFsbExpbmVzLnB1c2gobmV4dExpbmUudGV4dClcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBhZnRlckxpbmU9bnVtYmVyO1xuICAgIHJldHVybiB7Y29udGVudDogYWxsTGluZXMuam9pbihcIlxcblwiKSwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfVxuXG59XG5cbi8vIGltcG9ydCB7IEVtb2ppV2lkZ2V0IH0gZnJvbSAnZW1vamknO1xuZXhwb3J0IGNsYXNzIElubGluZUFJV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luLFxuICAgIHByaXZhdGUgdmlldzogRWRpdG9yVmlldyxcbiAgICBwcml2YXRlIGZyb206IG51bWJlcixcbiAgICBwcml2YXRlIHRvOiBudW1iZXIsXG4gICl7XG4gICAgc3VwZXIoKVxuICB9XG4gIFxuICBlcShvdGhlcjogSW5saW5lQUlXaWRnZXQpIHtcbiAgICByZXR1cm4gdGhpcy5mcm9tID09PSBvdGhlci5mcm9tICYmIHRoaXMudG8gPT09IG90aGVyLnRvO1xuICB9XG5cbiAgdG9ET00odmlldzpFZGl0b3JWaWV3KTpIVE1MRWxlbWVudCB7XG4gICAgLy8gY29uc3QgcXVlcnlXcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgYnV0dG9uLmlubmVyVGV4dCA9IFwic3VibWl0XCI7XG4gICAgYnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xuICAgIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwcHgnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSBcIjBweFwiO1xuICAgIGJ1dHRvbi5pZCA9IFwiYWktc3VibWl0LWJ1dHRvblwiXG4gICAgXG4gICAgYnV0dG9uLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIHN1Ym1pdFRvTExNKHRoaXMudmlldywgdGhpcy5wbHVnaW4pO1xuICAgICAgICAvLyBidXR0b24uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH07XG4gICAgLy8gcXVlcnlXcmFwcGVyLmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gICAgcmV0dXJuIGJ1dHRvbjtcbiAgfVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiB2aWV3UGx1Z2luRmFjdG9yeU1ldGhvZChfcGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4pe1xuICBjbGFzcyBJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbiBpbXBsZW1lbnRzIFBsdWdpblZhbHVlIHtcbiAgICBkZWNvcmF0aW9uczogRGVjb3JhdGlvblNldDtcbiAgICBwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW47XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHZpZXcpO1xuICAgICAgdGhpcy5wbHVnaW4gPSBfcGx1Z2luO1xuICAgIH1cblxuICAgIHVwZGF0ZSh1cGRhdGU6IFZpZXdVcGRhdGUpIHtcbiAgICAgIGlmICh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkKSB7XG4gICAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmJ1aWxkRGVjb3JhdGlvbnModXBkYXRlLnZpZXcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRlc3Ryb3koKSB7fVxuXG4gICAgYnVpbGREZWNvcmF0aW9ucyh2aWV3OiBFZGl0b3JWaWV3KTogRGVjb3JhdGlvblNldCB7XG4gICAgICBjb25zdCBidWlsZGVyID0gbmV3IFJhbmdlU2V0QnVpbGRlcjxEZWNvcmF0aW9uPigpO1xuXG4gICAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgICBcbiAgICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdzdGFydCBudW1iZXI6ICcsIG51bWJlcilcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdjdXJyZW50IGxpbmUgaXM6JywgbGluZS50ZXh0KVxuICAgICAgXG4gICAgICBjb25zdCBwYXJhTGluZXM6IHN0cmluZ1tdID0gW11cbiAgICAgIHBhcmFMaW5lcy5wdXNoKGxpbmUudGV4dClcbiAgICAgIHdoaWxlKG51bWJlcj4xKXtcbiAgICAgICAgbnVtYmVyLS07XG4gICAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpID09PSBcIlwiKSBicmVhaztcbiAgICAgICAgZWxzZSBwYXJhTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgIH1cblxuICAgICAgd2hpbGUgKG51bWJlciA8ICh2aWV3LnN0YXRlLmRvYy5saW5lcy0xKSl7XG4gICAgICAgIG51bWJlcisrO1xuICAgICAgICBjb25zdCBBZnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgICBpZiAoQWZ0TGluZS50ZXh0LnRyaW0oKT09PVwiXCIpIGJyZWFrO1xuICAgICAgICBlbHNlIHBhcmFMaW5lcy5wdXNoKEFmdExpbmUudGV4dCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IHBhcmFUZXh0ID0gcGFyYUxpbmVzLmpvaW4oJ1xcbicpO1xuICAgICAgLy8gY29uc29sZS5sb2cocGFyYVRleHQpXG4gICAgICBjb25zb2xlLmxvZyhcInBhcmFUZXh0OiBcIiwgcGFyYVRleHQpXG4gICAgICBcbiAgICAgIGNvbnN0IHByZXZMaW5lID0gbGluZS5udW1iZXIgPiAxID8gdmlldy5zdGF0ZS5kb2MubGluZShsaW5lLm51bWJlci0xKTogbnVsbDtcbiAgICAgIC8vIGNvbnNvbGUubG9nKFwicHJldmlvdXMgbGluZTogXCIsIHByZXZMaW5lPy50ZXh0KTtcbiAgICAgIFxuICAgICAgaWYobGluZS50ZXh0LnN0YXJ0c1dpdGgoXCJAYXNzaXN0YW50XCIpICYmIChsaW5lLm51bWJlciA+IDEpICYmIChwcmV2TGluZT8udGV4dC50cmltKCkgIT09IFwiXCIpKXtcbiAgICAgICAgLy8gdGhpcyBjb25kaXRpb24gbWVhbnMgdGhhdCBpdCBpcyBub3QgdGhlIGZpcnN0IGxpbmUgYW5kIGl0IGlzIG5vdCBhIHBhcmFncmFwaCBieSBpdHNlbGYuXG4gICAgICAgIGNvbnNvbGUubG9nKFwid2lsbCBuZWVkIHRvIGFkZCBhIGxpbmUgYnJlYWtcIilcbiAgICAgICAgY29uc3QgaW5zZXJ0aW9uU3RyID0gXCJcXG5cIlxuICAgICAgICBzZXRUaW1lb3V0KCgpPT57dmlldy5kaXNwYXRjaCh7XG4gICAgICAgICAgY2hhbmdlczoge2Zyb206bGluZS5mcm9tLCBpbnNlcnQ6IGluc2VydGlvblN0cn0sXG4gICAgICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOiBsaW5lLnRvK2luc2VydGlvblN0ci5sZW5ndGh9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbHNlIGlmIChwYXJhVGV4dC5zdGFydHNXaXRoKFwiQGFzc2lzdGFudFwiKSAmJiAhKHBhcmFUZXh0LmNvbnRhaW5zKFwiQHJlc3BvbnNlXCIpKSl7XG4gICAgICAgIGJ1aWxkZXIuYWRkKGxpbmUudG8sIGxpbmUudG8sIFxuICAgICAgICAgIERlY29yYXRpb24ud2lkZ2V0KFxuICAgICAgICAgICAge3dpZGdldDogbmV3IElubGluZUFJV2lkZ2V0KHRoaXMucGx1Z2luLCB2aWV3LCBsaW5lLnRvLCBsaW5lLnRvKSwgc2lkZTogMX1cbiAgICAgICAgICApKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGJ1aWxkZXIuZmluaXNoKCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcGx1Z2luU3BlYzogUGx1Z2luU3BlYzxJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbj4gPSB7XG4gICAgZGVjb3JhdGlvbnM6ICh2YWx1ZTogSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4pID0+IHZhbHVlLmRlY29yYXRpb25zLFxuICB9O1xuXG4gIGNvbnN0IGlubGluZUFJQUlQbHVnaW4gPSBWaWV3UGx1Z2luLmZyb21DbGFzcyhcbiAgICBJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbixcbiAgICBwbHVnaW5TcGVjXG4gICk7XG5cbnJldHVybiBpbmxpbmVBSUFJUGx1Z2luXG59Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUFBQSxtQkFBcUU7OztBQ0NyRSxzQkFBNkM7QUFhdEMsSUFBTSxtQkFBeUQ7QUFBQSxFQUNyRSxTQUFTO0FBQUEsRUFDVCxXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQUEsRUFDWCxnQkFBZ0I7QUFBQTtBQUFBO0FBR2pCO0FBQ08sSUFBTSwyQkFBTixjQUF1QyxpQ0FBZ0I7QUFBQSxFQUc3RCxZQUFZLEtBQVMsUUFBMkI7QUFD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
