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
  if (content.contains("@response")) return;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3MhOkluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncztcblx0c3lzdGVtUHJvbXB0ITpzdHJpbmc7XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCl7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSlcblx0fVxuXHRcblx0YXN5bmMgc2F2ZVNldHRpbmdzKCl7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTeXN0ZW1Qcm9tcHQoKXtcblx0XHRjb25zdCBwYXRoID0gYCR7dGhpcy5tYW5pZmVzdC5kaXJ9L2NvbmZpZ3MvZGVmYXVsdF9zeXNfcHJvbXB0Lm1kYDtcblx0XHR0aGlzLnN5c3RlbVByb21wdCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChwYXRoKTtcblx0fVxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRTeXN0ZW1Qcm9tcHQoKTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKHRoaXMuc3lzdGVtUHJvbXB0KTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKHRoaXMuc2V0dGluZ3MpO1xuXHRcdHRoaXMuYWRkUmliYm9uSWNvbihcInBhcGVyLXBsYW5lXCIsIFwiUHJpbnQgdG8gY29uc29sZVwiLCBcblx0XHRcdFx0XHRcdFx0KCk9Pntcblx0XHRcdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJ0ZXN0aW5nIHBsdWdpbnNcIik7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygndGVzdGluZyBwbHVnaW5zJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbdmlld1BsdWdpbkZhY3RvcnlNZXRob2QodGhpcyldKVxuXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcInN1Ym1pdC1haS1wcm9tcHRcIixcblx0XHRcdG5hbWU6IFwic3VibWl0IHRvIHRoZSBMTE1cIixcblx0XHRcdGhvdGtleXM6IFt7IFxuXHRcdFx0XHRtb2RpZmllcnM6IFtcIk1vZFwiLFwiU2hpZnRcIl0sIFxuXHRcdFx0XHRrZXk6IFwiTFwiXG5cdFx0XHR9XSxcblx0XHRcdGVkaXRvckNhbGxiYWNrOiBhc3luYyAoX2VkaXRvciwgdmlldykgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnaG90IGtleSBkZXRlY3RlZCcpO1xuXHRcdFx0XHRjb25zdCBidXR0b25DaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaS1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRcdGlmIChidXR0b25DaGVjayA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHQvLyBidXR0b25DaGVjay5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0Y29uc3QgZWRpdG9yVmlldyA9IHZpZXcuZWRpdG9yLmNtIGFzIEVkaXRvclZpZXc7XG5cdFx0XHRcdGF3YWl0IHN1Ym1pdFRvTExNKGVkaXRvclZpZXcsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdH1cbn0iLCAiaW1wb3J0IHR5cGUgSW5MaW5lQUlUdXRvclBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge0FwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZ30gZnJvbSBcIm9ic2lkaWFuXCJcblxuLy8gZXhwb3J0IHR5cGUgQVBJRnJhbWVXb3JrID0gXCJsbXN0dWRpb1wiIHwgXCJvbGxhbWFcIiB8IFwibGxhbWFjcHBcIjtcblxuZXhwb3J0IGludGVyZmFjZSBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3Mge1xuXHRiYXNlVVJMOnN0cmluZztcblx0bW9kZWxOYW1lOnN0cmluZztcblx0ZnJhbWV3b3JrOnN0cmluZztcblx0ZGVmYXVsdENvbnRleHQ6c3RyaW5nO1xuXHQvLyBpbmxpbmVMTE1JZDpzdHJpbmc7XG5cdC8vIGlubGluZUxMTVJlc3BvbnNlSWQ6c3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGFydGlhbDxJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3M+ID0ge1xuXHRiYXNlVVJMOiBcImh0dHA6Ly8xMjcuMC4wLjE6MTIzNFwiLFxuXHRtb2RlbE5hbWU6IFwiZ29vZ2xlL2dlbW1hLTQtMjZiLWE0YlwiLFxuXHRmcmFtZXdvcms6IFwibG1zdHVkaW9cIixcblx0ZGVmYXVsdENvbnRleHQ6IFwiZG9jXCIsXG5cdC8vIGlubGluZUxMTUlkOiBcImFzc2lzdGFudFwiLFxuXHQvLyBpbmxpbmVMTE1SZXNwb25zZUlkOlwicmVzcG9uc2VcIixcbn1cbmV4cG9ydCBjbGFzcyBJbkxpbmVBSVR1dG9yU2V0dGluZ3NUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFie1xuXHRwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW47XG5cdFxuXHRjb25zdHJ1Y3RvcihhcHA6QXBwLCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0ZGlzcGxheSgpOiB2b2lkIHtcblx0XHRsZXQge2NvbnRhaW5lckVsfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgVVJMXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJodHRwcy8vZXhhbXBsZS5jb206XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJhc2VVUkwpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFzZVVSTCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIm1vZGVsIGlkXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJjb21wYW55L2Nvb2wtbW9kZWwtMWJcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIGFjdGl2YXRpb24gaWRlbnRpZmllclwiKVxuXHRcdC8vIFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdC8vIFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwibGxtX2FjdGl2YXRlIVwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZClcblx0XHQvLyBcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0Ly8gXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIHJlc3BvbnNlIGlkZW50aWZpZXJcIilcblx0XHQvLyBcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHQvLyBcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImVsZW1lbnRhcnktd2F0c29uXCIpXG5cdFx0Ly8gXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTVJlc3BvbnNlSWQpXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNUmVzcG9uc2VJZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiYmFja2VuZFwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bik9PiB7XG5cdFx0XHRcdGRyb3Bkb3duXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImxtc3R1ZGlvXCIsIFwiTE0tU3R1ZGlvXCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImxsYW1hY3BwXCIsIFwibGxhbWEuY3BwXCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcIm9sbGFtYVwiLCBcIm9sbGFtYVwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mcmFtZXdvcmspXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZnJhbWV3b3JrID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiZGVmYXVsdCBjb250ZXh0XCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKT0+IHtcblx0XHRcdFx0ZHJvcGRvd25cblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiZG9jXCIsIFwiV2hvbGUgZG9jdW1lbnRcIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiaXNvbGF0ZWRcIiwgXCJObyBkb2N1bWVudCBjb250ZXh0XCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcInNlY3Rpb25cIiwgXCJpbW1lZGlhdGUgc2VjdGlvbiBvbmx5XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblxuXHR9XG59IiwgIi8vIGltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tICdAY29kZW1pcnJvci9sYW5ndWFnZSc7XG5pbXBvcnQgeyBSYW5nZVNldEJ1aWxkZXIgfSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7XG5pbXBvcnQge3JlcXVlc3RVcmwsIEVkaXRvciwgTm90aWNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG4vLyBpbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiYnVmZmVyXCI7XG5pbXBvcnQge1xuICBEZWNvcmF0aW9uLFxuICBEZWNvcmF0aW9uU2V0LFxuICBFZGl0b3JWaWV3LFxuICBQbHVnaW5TcGVjLFxuICBQbHVnaW5WYWx1ZSxcbiAgVmlld1BsdWdpbixcbiAgVmlld1VwZGF0ZSxcbiAgV2lkZ2V0VHlwZSxcbn0gZnJvbSAnQGNvZGVtaXJyb3Ivdmlldyc7XG5cbmltcG9ydCBJbkxpbmVBSVR1dG9yUGx1Z2luIGZyb20gJy4vbWFpbic7XG5pbXBvcnQgeyBiZWZvcmUgfSBmcm9tICdub2RlOnRlc3QnO1xuXG5jb25zdCBTRVBBUkFUT1IgPSBcIi1cIi5yZXBlYXQoMTApO1xuXG5mdW5jdGlvbiBmb3JtYXREYXRlKHRpbWVzdGFtcDpudW1iZXIpOnN0cmluZ3tcbiAgY29uc3QgbW9udGhOYW1lcyA9IFtcImphblwiLCAnZmViJywgXCJhcHJcIiwgJ21heScsICdqdW4nLCAnanVsJyxcbiAgICAgICAgICAgICAgXCJhdWdcIiwgXCJzZXBcIiwgXCJvY3RcIiwgXCJub3ZcIiwgXCJkZWNcIl07XG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0aW1lc3RhbXApO1xuICBjb25zdCBhZGRQYWRkaW5nID0gKG51bTpudW1iZXIpOiBzdHJpbmcgPT4gbnVtLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICBjb25zdCBoaCA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRIb3VycygpKTtcbiAgY29uc3QgbW0gPSBhZGRQYWRkaW5nKGRhdGUuZ2V0TWludXRlcygpKTtcbiAgY29uc3QgZGF5ID0gYWRkUGFkZGluZyhkYXRlLmdldERhdGUoKSk7XG4gIGNvbnN0IG1vbnRoID0gbW9udGhOYW1lc1soZGF0ZS5nZXRNb250aCgpKS0xXTtcbiAgY29uc3QgeWVhciA9IGRhdGUuZ2V0RnVsbFllYXIoKTtcblxuICByZXR1cm4gYCR7aGh9OiR7bW19ICR7ZGF5fSAke21vbnRofSAke3llYXJ9YDtcbn1cblxuZXhwb3J0IHR5cGUgbWF5YmVTdHJpbmcgPSBzdHJpbmcgfCBudWxsO1xuXG5leHBvcnQgY29uc3QgSU1BR0VfRklMRV9UWVBFUyA9IFsncG5nJywgJ2pwZycsICdqcGVnJywgJ2dpZicsICd3ZWJwJywgJ2JtcCcsICdzdmcnXVxuXG5hc3luYyBmdW5jdGlvbiBmb3JtYXRUZXh0QmxvYihwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgdGV4dDpzdHJpbmcsIGlkeDpudW1iZXI9MSl7XG4gIC8vIGNvbnN0IHJlZ2V4UGF0dGVybjogUmVnRXhwID0gbmV3IFJlZ0V4cChcIlxcIVxcW1xcWyhbXFx3XFxzLlxcLV9dKylcXF1cXF1cIiwgJ2cnKTtcbiAgY29uc3QgZmlsZSA9IHBsdWdpbi5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgY29uc3Qgc291cmNlUGF0aCA9IGZpbGU/LnBhdGggYXMgc3RyaW5nO1xuICBjb25zdCByZWdleFBhdHRlcm4gPSAvXFwhXFxbXFxbKFtcXHdcXHNfXFwtXStcXC5cXHcrKVxcXVxcXXxcXCFcXFsuK1xcXVxcKChbXFx3XFxzX1xcLV0rXFwuXFx3KylcXCkvZztcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcbiAgY29uc3QgYnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjb250ZW50QXJyYXk6b2JqZWN0W10gPSBbXTtcbiAgXG4gIGxldCBudW1iZXIgPSBpZHg7XG4gIGxldCBpbnRlcmltT2JqOm9iamVjdHxBcnJheTxvYmplY3Q+O1xuICBcbiAgLy8gdGVzdCBwYXR0ZXJuIFxuICAvLyBjb25zdCB0ZXh0XyA9ICchW1tQYXN0ZWQgaW1hZ2UgMjAyNjA1MTcwNDE0MDcucG5nXV0nO1xuICAvLyBjb25zdCByZSA9IC8hXFxbXFxbKFtcXHdcXHNfLV0rXFwuXFx3KylcXF1cXF0vZztcbiAgLy8gY29uc29sZS5sb2coJ3Rlc3RpbmcgcGF0dGVybicpO1xuICAvLyBmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHRfLm1hdGNoQWxsKHJlKSkge1xuICAvLyAgIGNvbnNvbGUubG9nKG1hdGNoWzBdKTsgLy8gd2hvbGUgIVtbLi4uXV1cbiAgLy8gICBjb25zb2xlLmxvZyhtYXRjaFsxXSk7IC8vIFBhc3RlZCBpbWFnZSAyMDI2MDUxNzA0MTQwNy5wbmdcbiAgLy8gfVxuICAvLyBjb25zb2xlLmxvZyhcImVuZCBvZiBwYXR0ZXJuIHRlc3RcIilcbiAgLy8gdGVzdCBwYXR0ZXJuIFxuXG4gIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgIGNvbnN0IG1hdGNoZXMgPSBbLi4ubGluZS5tYXRjaEFsbChyZWdleFBhdHRlcm4pXTtcbiAgICAvLyBjb25zb2xlLmxvZyhbLi4uJyFbW1Bhc3RlZCBpbWFnZSAyMDI2MDUxNzA0MTQwNy5wbmddXScubWF0Y2hBbGwocmVnZXhQYXR0ZXJuKV0pO1xuICAgIC8vIGNvbnNvbGUubG9nKFwiTElORTpcIiwgSlNPTi5zdHJpbmdpZnkobGluZSkpXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoPjApe1xuICAgICAgLy8gZXh0cmFjdCBpbWFnZSwgY29udmVydCB0byBiYXNlXG4gICAgICBpbnRlcmltT2JqID0gW11cbiAgICAgIGZvcihjb25zdCBtYXRjaCBvZiBtYXRjaGVzKXtcbiAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG1hdGNoWzFdID8/IG1hdGNoWzJdO1xuICAgICAgICBpZiAoSU1BR0VfRklMRV9UWVBFUy5jb250YWlucyhtYXRjaGVkLnNwbGl0KCcuJylbMV0pKXtcbiAgICAgICAgICBjb25zdCB0YXJnZXQgPSBwbHVnaW4uYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QobWF0Y2hlZCwgc291cmNlUGF0aCk7XG4gICAgICAgICAgY29uc3QgaW1hZ2VQYXRoID0gdGFyZ2V0Py5wYXRoO1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1hZ2UgZm91bmQ6IFwiLCBpbWFnZVBhdGgpXG4gICAgICAgICAgaWYoaW1hZ2VQYXRoKXtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBwbHVnaW4uYXBwLnZhdWx0LnJlYWRCaW5hcnkodGFyZ2V0KTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVCdWZmZXIgPSBCdWZmZXIuaXNCdWZmZXIoZGF0YSkgPyBkYXRhIDogQnVmZmVyLmZyb20oZGF0YSBhcyBBcnJheUJ1ZmZlcik7XG4gICAgICAgICAgICBjb25zdCBpbVN0ciA9IGBkYXRhOmltYWdlLyR7bWF0Y2hlZC5zcGxpdCgnLicpWzFdfTtiYXNlNjQsJHtmaWxlQnVmZmVyLnRvU3RyaW5nKFwiYmFzZTY0XCIpfX1gXG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke251bWJlcn0+YH0pO1xuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJpbWFnZV91cmxcIiwgaW1hZ2VfdXJsOiB7dXJsOmltU3RyfX0pO1xuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGA8L3Bvc2l0aW9uXyR7bnVtYmVyfT5gfSk7XG4gICAgICAgICAgICBudW1iZXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAobGluZS50cmltKCk9PT1cIlwiKXtcbiAgICAgICAgLy8gbWVyZ2UgYnVmZmVyXG4gICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgPHBvc2l0aW9uXyR7bnVtYmVyfT4ke2J1ZmZlci5qb2luKFwiXFxuXCIpfTxwb3NpdGlvbl8ke251bWJlcn1gfSk7XG4gICAgICAgIG51bWJlcisrO1xuICAgICAgICBidWZmZXIubGVuZ3RoID0gMDtcbiAgICB9XG4gICAgZWxzZSBpZiAobGluZS50cmltKCkhPT1cIlwiKXtcbiAgICAgIC8vIGFkZCB0byBidWZmZXJcbiAgICAgIGJ1ZmZlci5wdXNoKGxpbmUpO1xuICAgIH1cbiAgICAvLyBhZGQgcG9zaXRpb24gbnVtYmVyIGFuZCBhcHBlbmQgdGhlIG1lc3NhZ2UgdG8gdGhlIGNvbnRlbnQgYXJyYXkuXG4gIH1cblxuICByZXR1cm4ge2NvbnRlbnRBcnJheSwgbnVtYmVyfVxufVxuZnVuY3Rpb24gZ2V0UXVlcnlDb250ZXh0KHZpZXc6RWRpdG9yVmlldywgYmVmb3JlTGluZTpudW1iZXIsIGFmdGVyTGluZTpudW1iZXIsIHNlY3Rpb25Pbmx5OmJvb2xlYW49ZmFsc2UpXG46e2JlZm9yZVRleHQ6c3RyaW5nLCBhZnRlclRleHQ6c3RyaW5nfSAge1xuICBcbiAgbGV0IG51bWJlciA9IGJlZm9yZUxpbmU7XG4gIGNvbnN0IGJlZm9yZUxpbmVzID0gW107XG4gIHdoaWxlIChudW1iZXIgPiAwKXtcbiAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgIGlmIChzZWN0aW9uT25seSAmJiAobGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKXtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGJlZm9yZUxpbmVzLnVuc2hpZnQobGluZS50ZXh0KTtcbiAgICBudW1iZXItLTtcbiAgfVxuXG4gIG51bWJlciA9IGFmdGVyTGluZTtcbiAgY29uc3QgYWZ0ZXJMaW5lcyA9IFtdO1xuICB3aGlsZSAobnVtYmVyIDwgdmlldy5zdGF0ZS5kb2MubGluZXMpe1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgaWYgKHNlY3Rpb25Pbmx5ICYmIChsaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYWZ0ZXJMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgbnVtYmVyKys7XG4gIH1cbiAgXG5cbiAgY29uc3QgYmVmb3JlVGV4dCA9IGJlZm9yZUxpbmVzLmpvaW4oJ1xcbicpXG4gIGNvbnN0IGFmdGVyVGV4dCA9IGFmdGVyTGluZXMuam9pbignXFxuJylcblxuICAvLyBjb25zb2xlLmxvZyhcIkJFRk9SRSBURVhUOlwiLCBiZWZvcmVUZXh0KTtcbiAgLy8gY29uc29sZS5sb2coXCJBRlRFUiBURVhUOlwiLCBhZnRlclRleHQpO1xuICByZXR1cm4ge2JlZm9yZVRleHQsIGFmdGVyVGV4dH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN1Ym1pdFRvTExNKHZpZXc6RWRpdG9yVmlldywgcGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4pe1xuICAgIC8vIGNvbnNvbGUubG9nKFwic3VibWl0dGluZyBzb21ldGhpbmchXCIpO1xuICAgIC8vIG5ldyBOb3RpY2UoXCJzdWJtaXR0aW5nIHRvIExMTVwiKTtcbiAgICBjb25zdCBzdWJtaXRUaW1lID0gZm9ybWF0RGF0ZShEYXRlLm5vdygpKTtcbiAgICBjb25zdCB7Y29udGVudCwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfSA9IGdldExMTXF1ZXJ5KHZpZXcpO1xuICAgIFxuICAgIGlmIChjb250ZW50LmNvbnRhaW5zKFwiQHJlc3BvbnNlXCIpKSByZXR1cm47XG4gICAgXG4gICAgY29uc29sZS5sb2coXCJzdWJtaXR0ZWQgYXQ6XCIsIHN1Ym1pdFRpbWUpO1xuICAgIC8vIGNvbnNvbGUubG9nKGNvbnRlbnQpO1xuICAgIFxuICAgIGNvbnN0IGRlZmF1bHRUeXBlID0gcGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0O1xuICAgIGNvbnN0IGZpcnN0V29yZCA9IGNvbnRlbnQuc3BsaXQoXCIgXCIpWzBdO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBmaXJzdFdvcmQuc3BsaXQoXCI6XCIpLnNsaWNlKDEsIHVuZGVmaW5lZCk7XG4gICAgLy8gY29uc29sZS5sb2cob3B0aW9ucylcbiAgICBpZigob3B0aW9ucy5sZW5ndGg9PT0xKSAmJihvcHRpb25zWzBdPT09XCJcIikpIG9wdGlvbnMubGVuZ3RoID0gMDtcbiAgICAvLyBsZXQgYW5zd2VyOnN0cmluZztcbiAgICBsZXQgYmVmb3JlVGV4dDogbWF5YmVTdHJpbmc9bnVsbCwgYWZ0ZXJUZXh0OiBtYXliZVN0cmluZz1udWxsO1xuXG4gICAgaWYob3B0aW9ucy5jb250YWlucygnaXNvbGF0ZWQnKXx8KChkZWZhdWx0VHlwZT09PVwiaXNvbGF0ZWRcIikgJiYgKG9wdGlvbnMubGVuZ3RoPT09MCkpKXtcbiAgICAgIGJlZm9yZVRleHQgPSBudWxsO1xuICAgICAgYWZ0ZXJUZXh0ID0gbnVsbDtcbiAgICB9XG4gICAgZWxzZSBpZiAob3B0aW9ucy5jb250YWlucyhcImRvY1wiKXx8KGRlZmF1bHRUeXBlPT09XCJkb2NcIikgJiYgKG9wdGlvbnMubGVuZ3RoPT09MCkpe1xuICAgICAgY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUpO1xuICAgICAgYmVmb3JlVGV4dCA9IGNvbnRleHQuYmVmb3JlVGV4dDtcbiAgICAgIGFmdGVyVGV4dCA9IGNvbnRleHQuYWZ0ZXJUZXh0O1xuICAgICAgXG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJzZWN0aW9uXCIpfHwoZGVmYXVsdFR5cGU9PT1cInNlY3Rpb25cIikgJiYgKG9wdGlvbnMubGVuZ3RoPT09MCkpe1xuICAgICAgY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUsIHRydWUpO1xuICAgICAgLy8gY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUpO1xuICAgICAgYmVmb3JlVGV4dCA9IGNvbnRleHQuYmVmb3JlVGV4dDtcbiAgICAgIGFmdGVyVGV4dCA9IGNvbnRleHQuYWZ0ZXJUZXh0O1xuICAgIH1cbiAgICBcbiAgICAvLyAgICAgICBjdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9hcGkvdjEvY2hhdCBcXFxuICAgIC8vICAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxuICAgIC8vICAgLWQgJ3tcbiAgICAvLyAgICAgXCJtb2RlbFwiOiBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIixcbiAgICAvLyAgICAgXCJzeXN0ZW1fcHJvbXB0XCI6IFwiWW91IGFuc3dlciBvbmx5IGluIHJoeW1lcy5cIixcbiAgICAvLyAgICAgXCJpbnB1dFwiOiBcIldoYXQgaXMgeW91ciBmYXZvcml0ZSBjb2xvcj9cIlxuICAgIC8vIH0nXG4gICAgY29uc3QgYW5zd2VyID0gYXdhaXQgcGluZ0xMTShwbHVnaW4sIGNvbnRlbnQsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG4gICAgaWYoYW5zd2VyKXtcbiAgICAgIC8vIG5ldyBOb3RpY2UoXCJSZXNwb25zZSByZWNlaXZlZCFcIilcbiAgICAgIGNvbnNvbGUubG9nKGFuc3dlcik7XG4gICAgICBjb25zdCByZWNlaXZlVGltZSA9IGZvcm1hdERhdGUoRGF0ZS5ub3coKSk7XG4gICAgICAvLyBjb25zb2xlLmxvZyhcInJlY2VpdmVkIGF0OlwiLCByZWNlaXZlVGltZSk7XG4gICAgXG4gICAgICBhcHBlbmRBbnN3ZXIodmlldywgYW5zd2VyLCBzdWJtaXRUaW1lLCByZWNlaXZlVGltZSk7XG4gICAgfVxuICAgIGVsc2V7XG4gICAgICBuZXcgTm90aWNlKFwiQ2FsbCBmYWlsZWRcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZEFuc3dlcih2aWV3OkVkaXRvclZpZXcsIHRleHQ6c3RyaW5nLCBzdWJtaXRUaW1lOnN0cmluZywgcmVjZWl2ZVRpbWU6c3RyaW5nKXtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgd2hpbGUgKGN1cnJMaW5lLm51bWJlcjx2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgICBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoY3VyckxpbmUubnVtYmVyICsgMSk7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCk9PT1cIlwiKXtcbiAgICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlci0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOmN1cnJMaW5lLnRvfSxcbiAgICAgIHNjcm9sbEludG9WaWV3OnRydWVcbiAgICB9KVxuXG4gICAgY29uc3QgZm9ybWF0dGVkVGV4dCA9IGAgKHN1Ym1pdHRlZCBhdCAke3N1Ym1pdFRpbWV9KVxcbioqQHJlc3BvbnNlKiogJHt0ZXh0fSAocmVzcG9uZGVkIGF0ICR7cmVjZWl2ZVRpbWV9KVxcblxcbmBcbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgY2hhbmdlczoge2Zyb206Y3VyckxpbmUudG8sIGluc2VydDogZm9ybWF0dGVkVGV4dH0sXG4gICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogY3VyckxpbmUudG8rZm9ybWF0dGVkVGV4dC5sZW5ndGh9XG4gICAgfSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGluZ0xMTShwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgcXVlcnk6c3RyaW5nLCBiZWZvcmVUZXh0Om1heWJlU3RyaW5nLCBhZnRlclRleHQ6bWF5YmVTdHJpbmcpOlByb21pc2U8c3RyaW5nfG51bGw+e1xuICAgIGNvbnN0IGJhc2VfdXJsID0gcGx1Z2luLnNldHRpbmdzLmJhc2VVUkw7XG4gICAgY29uc3QgdXJsID0gYCR7YmFzZV91cmx9L3YxL2NoYXQvY29tcGxldGlvbnNgO1xuICAgIGNvbnN0IG1vZGVsID0gcGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcbiAgICBjb25zdCBzeXN0ZW1fcHJvbXB0ID0gXCJZb3UgYXJlIGEgY29uY2lzZSBhbmQgc3VjY2luY3QgYXNzaXN0YW50IG9wZXJhdGluZyBpbnNpZGUgT2JzaWRpYW4uTUQsIGEgc3BlY2lhbGl6ZWQgbm90ZSB0YWtpbmcgYXBwLlwiO1xuICAgIFxuICAgIGNvbnN0IG1ldGhvZCA9IFwiUE9TVFwiO1xuXG4gICAgLy8gY29uc29sZS5sb2coJ2JlZm9yZSB0ZXh0JywgYmVmb3JlVGV4dCk7XG4gICAgLy8gY29uc29sZS5sb2coJ2FmdGVyIHRleHQnLCBhZnRlclRleHQpO1xuICAgIGxldCBiZWZBcnJheUZvcm1hdHRlZDpvYmplY3RbXT1bXSwgYWZ0QXJyYXlGb3JtYXR0ZWQ6b2JqZWN0W109W10sIG51bTpudW1iZXI9MDtcbiAgICBcbiAgICBpZiAoYmVmb3JlVGV4dCl7XG4gICAgICBsZXQge2NvbnRlbnRBcnJheSwgbnVtYmVyfSA9IGF3YWl0IGZvcm1hdFRleHRCbG9iKHBsdWdpbiwgYmVmb3JlVGV4dCwgbnVtKTtcbiAgICAgIG51bSA9IG51bWJlcjtcbiAgICAgIGJlZkFycmF5Rm9ybWF0dGVkID0gY29udGVudEFycmF5O1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQudW5zaGlmdChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBBQk9WRSBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICAgIGJlZkFycmF5Rm9ybWF0dGVkLnB1c2goXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IEVORCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKCdCRUZPUkUgQ09OVEVOVCcsIGJlZkFycmF5Rm9ybWF0dGVkKTtcbiAgICBjb25zdCBhY3RpdmVfbnVtID0gbnVtO1xuICAgIG51bSsrO1xuICAgIFxuICAgIGlmIChhZnRlclRleHQpe1xuICAgICAgbGV0IHtjb250ZW50QXJyYXksIG51bWJlcn0gPSBhd2FpdCBmb3JtYXRUZXh0QmxvYihwbHVnaW4sIGFmdGVyVGV4dCwgbnVtKTtcbiAgICAgIG51bSA9IG51bWJlcjtcbiAgICAgIGFmdEFycmF5Rm9ybWF0dGVkID0gY29udGVudEFycmF5O1xuICAgICAgYWZ0QXJyYXlGb3JtYXR0ZWQudW5zaGlmdChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICAgIGFmdEFycmF5Rm9ybWF0dGVkLnB1c2goXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IEVORCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKCdBRlRFUiBDT05URU5UJywgYWZ0QXJyYXlGb3JtYXR0ZWQpO1xuICAgIC8vIGNvbnN0IGJlZm9yZVRleHQgPSBgJHtzZXBhcmF0b3J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtzZXBhcmF0b3J9XFxuJHtiZWZvcmVMaW5lcy5qb2luKFwiXFxuXCIpfVxcbiR7c2VwYXJhdG9yfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBBQk9WRSBRVUVSWSAke3NlcGFyYXRvcn1cXG5gO1xuICAgIC8vIGNvbnN0IGFmdGVyVGV4dCAgPSBgJHtzZXBhcmF0b3J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtzZXBhcmF0b3J9XFxuJHthZnRlckxpbmVzLmpvaW4oXCJcXG5cIil9XFxuJHtzZXBhcmF0b3J9IEVORCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7c2VwYXJhdG9yfVxcbmA7O1xuXG4gICAgLy8gY29uc29sZS5sb2coJ3F1ZXJ5JywgcXVlcnkpXG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgICAgdXJsLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICBcIkF1dGhvcml6YXRpb25cIjogXCJCZWFyZXJcIlxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbW9kZWwsXG4gICAgICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAgICAgIHtyb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBwbHVnaW4uc3lzdGVtUHJvbXB0fSxcbiAgICAgICAgICAgIHtyb2xlOiBcInVzZXJcIiwgXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgICAgICAvLyB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGJlZm9yZVRleHQgPz8gXCJcXG5cIn0sXG4gICAgICAgICAgICAgICAgLi4uYmVmQXJyYXlGb3JtYXR0ZWQsXG4gICAgICAgICAgICAgICAge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBgPHBvc2l0aW9uXyR7YWN0aXZlX251bX0+ICpUaGlzIGlzIHRoZSBwb3NpdGlvbiBvZiB0aGUgdXNlciBxdWVzdGlvbi9wcm9tcHQgY3VycmVudGx5IHBvc2VkIHRvIHlvdSogPC9wb3NpdGlvbl8ke2FjdGl2ZV9udW19PmB9LFxuICAgICAgICAgICAgICAgIC8vIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYWZ0ZXJUZXh0ICA/PyBcIlxcblwifSxcbiAgICAgICAgICAgICAgICAuLi5hZnRBcnJheUZvcm1hdHRlZCxcbiAgICAgICAgICAgICAgICB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBjdXJyZW50IHVzZXIgcHJvbXB0OiAke3F1ZXJ5LnNwbGl0KFwiIFwiKS5zbGljZSgxLCB1bmRlZmluZWQpLmpvaW4oXCIgXCIpfWB9LFxuICAgICAgICAgICAgICBdfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgdGVtcGVyYXR1cmU6MC45LFxuICAgICAgICB9KVxuICAgIH1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwocGF5bG9hZCk7XG4gIHJldHVybiByZXNwb25zZS5qc29uLmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudCA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRMTE1xdWVyeSh2aWV3OkVkaXRvclZpZXcpIHtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgY29uc3QgYWxsTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIFxuICAgIGNvbnN0IG51bUxpbmVzID0gdmlldy5zdGF0ZS5kb2MubGluZXM7XG4gICAgbGV0IG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIGFsbExpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICBcbiAgICBsZXQgYmVmb3JlTGluZTpudW1iZXI9MTAwMDAwO1xuICAgIGxldCBhZnRlckxpbmU6bnVtYmVyPTA7XG5cbiAgICB3aGlsZShudW1iZXI+MSl7XG4gICAgICBudW1iZXItLTtcbiAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChjdXJyTGluZS50ZXh0LnRyaW0oKSA9PT0gXCJcIil7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKCdicmVha2luZyBwb2ludCcpXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZWxzZXtcbiAgICAgICAgLy8gY29uc29sZS5sb2coYGxpbmVfcU5vOiAke251bWJlcn0gbGluZTogJHtjdXJyTGluZS5udW1iZXJ9YCwgXCJ0ZXh0OiBcIiwgY3VyckxpbmUudGV4dClcbiAgICAgICAgYWxsTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgYmVmb3JlTGluZT1udW1iZXI7XG4gICAgXG4gICAgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgd2hpbGUobnVtYmVyPChudW1MaW5lcy0xKSl7XG4gICAgICBudW1iZXIrKztcbiAgICAgIGNvbnN0IG5leHRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgaWYgKG5leHRMaW5lICYmIChuZXh0TGluZT8udGV4dC50cmltKCkgIT09IFwiXCIpKXtcbiAgICAgICAgYWxsTGluZXMucHVzaChuZXh0TGluZS50ZXh0KVxuICAgICAgfVxuICAgICAgZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGFmdGVyTGluZT1udW1iZXI7XG4gICAgcmV0dXJuIHtjb250ZW50OiBhbGxMaW5lcy5qb2luKFwiXFxuXCIpLCBiZWZvcmVMaW5lLCBhZnRlckxpbmV9XG5cbn1cblxuLy8gaW1wb3J0IHsgRW1vamlXaWRnZXQgfSBmcm9tICdlbW9qaSc7XG5leHBvcnQgY2xhc3MgSW5saW5lQUlXaWRnZXQgZXh0ZW5kcyBXaWRnZXRUeXBlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW4sXG4gICAgcHJpdmF0ZSB2aWV3OiBFZGl0b3JWaWV3LFxuICAgIHByaXZhdGUgZnJvbTogbnVtYmVyLFxuICAgIHByaXZhdGUgdG86IG51bWJlcixcbiAgKXtcbiAgICBzdXBlcigpXG4gIH1cbiAgXG4gIGVxKG90aGVyOiBJbmxpbmVBSVdpZGdldCkge1xuICAgIHJldHVybiB0aGlzLmZyb20gPT09IG90aGVyLmZyb20gJiYgdGhpcy50byA9PT0gb3RoZXIudG87XG4gIH1cblxuICB0b0RPTSh2aWV3OkVkaXRvclZpZXcpOkhUTUxFbGVtZW50IHtcbiAgICAvLyBjb25zdCBxdWVyeVdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICBidXR0b24uaW5uZXJUZXh0ID0gXCJzdWJtaXRcIjtcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzBweCc7XG4gICAgYnV0dG9uLnN0eWxlLnRvcCA9IFwiMHB4XCI7XG4gICAgYnV0dG9uLmlkID0gXCJhaS1zdWJtaXQtYnV0dG9uXCJcbiAgICBcbiAgICBidXR0b24ub25jbGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgc3VibWl0VG9MTE0odGhpcy52aWV3LCB0aGlzLnBsdWdpbik7XG4gICAgICAgIC8vIGJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfTtcbiAgICAvLyBxdWVyeVdyYXBwZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICByZXR1cm4gYnV0dG9uO1xuICB9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHZpZXdQbHVnaW5GYWN0b3J5TWV0aG9kKF9wbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG4gIGNsYXNzIElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luIGltcGxlbWVudHMgUGx1Z2luVmFsdWUge1xuICAgIGRlY29yYXRpb25zOiBEZWNvcmF0aW9uU2V0O1xuICAgIHBsdWdpbjogSW5MaW5lQUlUdXRvclBsdWdpbjtcblxuICAgIGNvbnN0cnVjdG9yKHZpZXc6IEVkaXRvclZpZXcpIHtcbiAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmJ1aWxkRGVjb3JhdGlvbnModmlldyk7XG4gICAgICB0aGlzLnBsdWdpbiA9IF9wbHVnaW47XG4gICAgfVxuXG4gICAgdXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuICAgICAgaWYgKHVwZGF0ZS5kb2NDaGFuZ2VkIHx8IHVwZGF0ZS52aWV3cG9ydENoYW5nZWQpIHtcbiAgICAgICAgdGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuYnVpbGREZWNvcmF0aW9ucyh1cGRhdGUudmlldyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZGVzdHJveSgpIHt9XG5cbiAgICBidWlsZERlY29yYXRpb25zKHZpZXc6IEVkaXRvclZpZXcpOiBEZWNvcmF0aW9uU2V0IHtcbiAgICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgUmFuZ2VTZXRCdWlsZGVyPERlY29yYXRpb24+KCk7XG5cbiAgICAgIGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uaGVhZDtcbiAgICAgIFxuICAgICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgICAgbGV0IG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgICAgLy8gY29uc29sZS5sb2coJ3N0YXJ0IG51bWJlcjogJywgbnVtYmVyKVxuICAgICAgLy8gY29uc29sZS5sb2coJ2N1cnJlbnQgbGluZSBpczonLCBsaW5lLnRleHQpXG4gICAgICBcbiAgICAgIGNvbnN0IHBhcmFMaW5lczogc3RyaW5nW10gPSBbXVxuICAgICAgcGFyYUxpbmVzLnB1c2gobGluZS50ZXh0KVxuICAgICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgICBudW1iZXItLTtcbiAgICAgICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpIGJyZWFrO1xuICAgICAgICBlbHNlIHBhcmFMaW5lcy51bnNoaWZ0KGN1cnJMaW5lLnRleHQpO1xuICAgICAgfVxuXG4gICAgICB3aGlsZSAobnVtYmVyIDwgKHZpZXcuc3RhdGUuZG9jLmxpbmVzLTEpKXtcbiAgICAgICAgbnVtYmVyKys7XG4gICAgICAgIGNvbnN0IEFmdExpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICAgIGlmIChBZnRMaW5lLnRleHQudHJpbSgpPT09XCJcIikgYnJlYWs7XG4gICAgICAgIGVsc2UgcGFyYUxpbmVzLnB1c2goQWZ0TGluZS50ZXh0KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgcGFyYVRleHQgPSBwYXJhTGluZXMuam9pbignXFxuJyk7XG4gICAgICAvLyBjb25zb2xlLmxvZyhwYXJhVGV4dClcbiAgICAgIGNvbnNvbGUubG9nKFwicGFyYVRleHQ6IFwiLCBwYXJhVGV4dClcbiAgICAgIFxuICAgICAgY29uc3QgcHJldkxpbmUgPSBsaW5lLm51bWJlciA+IDEgPyB2aWV3LnN0YXRlLmRvYy5saW5lKGxpbmUubnVtYmVyLTEpOiBudWxsO1xuICAgICAgLy8gY29uc29sZS5sb2coXCJwcmV2aW91cyBsaW5lOiBcIiwgcHJldkxpbmU/LnRleHQpO1xuICAgICAgXG4gICAgICBpZihsaW5lLnRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgKGxpbmUubnVtYmVyID4gMSkgJiYgKHByZXZMaW5lPy50ZXh0LnRyaW0oKSAhPT0gXCJcIikpe1xuICAgICAgICAvLyB0aGlzIGNvbmRpdGlvbiBtZWFucyB0aGF0IGl0IGlzIG5vdCB0aGUgZmlyc3QgbGluZSBhbmQgaXQgaXMgbm90IGEgcGFyYWdyYXBoIGJ5IGl0c2VsZi5cbiAgICAgICAgY29uc29sZS5sb2coXCJ3aWxsIG5lZWQgdG8gYWRkIGEgbGluZSBicmVha1wiKVxuICAgICAgICBjb25zdCBpbnNlcnRpb25TdHIgPSBcIlxcblwiXG4gICAgICAgIHNldFRpbWVvdXQoKCk9Pnt2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgICBjaGFuZ2VzOiB7ZnJvbTpsaW5lLmZyb20sIGluc2VydDogaW5zZXJ0aW9uU3RyfSxcbiAgICAgICAgICBzZWxlY3Rpb246IHthbmNob3I6IGxpbmUudG8raW5zZXJ0aW9uU3RyLmxlbmd0aH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKHBhcmFUZXh0LnN0YXJ0c1dpdGgoXCJAYXNzaXN0YW50XCIpICYmICEocGFyYVRleHQuY29udGFpbnMoXCJAcmVzcG9uc2VcIikpKXtcbiAgICAgICAgYnVpbGRlci5hZGQobGluZS50bywgbGluZS50bywgXG4gICAgICAgICAgRGVjb3JhdGlvbi53aWRnZXQoXG4gICAgICAgICAgICB7d2lkZ2V0OiBuZXcgSW5saW5lQUlXaWRnZXQodGhpcy5wbHVnaW4sIHZpZXcsIGxpbmUudG8sIGxpbmUudG8pLCBzaWRlOiAxfVxuICAgICAgICAgICkpXG4gICAgICB9XG4gICAgICByZXR1cm4gYnVpbGRlci5maW5pc2goKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwbHVnaW5TcGVjOiBQbHVnaW5TcGVjPElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luPiA9IHtcbiAgICBkZWNvcmF0aW9uczogKHZhbHVlOiBJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbikgPT4gdmFsdWUuZGVjb3JhdGlvbnMsXG4gIH07XG5cbiAgY29uc3QgaW5saW5lQUlBSVBsdWdpbiA9IFZpZXdQbHVnaW4uZnJvbUNsYXNzKFxuICAgIElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luLFxuICAgIHBsdWdpblNwZWNcbiAgKTtcblxucmV0dXJuIGlubGluZUFJQUlQbHVnaW5cbn0iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBQUFBLG1CQUFxRTs7O0FDQ3JFLHNCQUE2QztBQWF0QyxJQUFNLG1CQUF5RDtBQUFBLEVBQ3JFLFNBQVM7QUFBQSxFQUNULFdBQVc7QUFBQSxFQUNYLFdBQVc7QUFBQSxFQUNYLGdCQUFnQjtBQUFBO0FBQUE7QUFH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
