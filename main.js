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
async function formatTextBlob(plugin, text, idx = 1, isDoc = true) {
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
    const chkLine = line.replace(regexPattern, "");
    if (matches.length > 0) {
      interimObj = [];
      if (chkLine.trim() !== "") contentArray.push({ type: "text", text: `text inline with image(s) below: ${line.replace(regexPattern, "<imagePlaceHolder>")}` });
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
            const posTagStart = isDoc ? `$<position_${number}>` : "";
            const posTagEnd = isDoc ? `$</position_${number}>` : "";
            contentArray.push({ type: "text", text: posTagStart });
            contentArray.push({ type: "image_url", image_url: { url: imStr } });
            contentArray.push({ type: "text", text: posTagEnd });
            number++;
          }
        }
      }
    } else if (line.trim() === "") {
      const posTagStart = isDoc ? `$<position_${number}>` : "";
      const posTagEnd = isDoc ? `$</position_${number}>` : "";
      contentArray.push({ type: "text", text: `${posTagStart}${buffer.join("\n")}${posTagEnd}` });
      number++;
      buffer.length = 0;
    } else if (line.trim() !== "") {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    const posTagStart = isDoc ? `$<position_${number}>` : "";
    const posTagEnd = isDoc ? `$</position_${number}>` : "";
    contentArray.push({ type: "text", text: `${posTagStart}${buffer.join("\n")}${posTagEnd}` });
    number++;
    buffer.length = 0;
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
    if (currLine.text.trim() === "" || currLine.text.startsWith("## ")) {
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
    let { contentArray: contentArray2, number: number2 } = await formatTextBlob(plugin, beforeText, num);
    num = number2;
    befArrayFormatted = contentArray2;
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
    let { contentArray: contentArray2, number: number2 } = await formatTextBlob(plugin, afterText, num);
    num = number2;
    aftArrayFormatted = contentArray2;
    aftArrayFormatted.unshift(
      { type: "text", text: `${SEPARATOR} START OF DOCUMENT PART BELOW QUERY ${SEPARATOR}
` }
    );
    aftArrayFormatted.push(
      { type: "text", text: `${SEPARATOR} END OF DOCUMENT PART BELOW QUERY ${SEPARATOR}
` }
    );
  }
  let { contentArray, number } = await formatTextBlob(plugin, query.split(" ").slice(1, void 0).join(" "), num, false);
  const queryArrayFormatted = contentArray;
  console.log(queryArrayFormatted);
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
            // {type: "text", text: `current user prompt: ${query.split(" ").slice(1, undefined).join(" ")}`},
            { type: "text", text: `current user prompt: ` },
            ...queryArrayFormatted
          ]
        }
      ],
      temperature: 0.9
    })
  };
  let response;
  const notice = new import_obsidian2.Notice("llm is thinking...", 0);
  try {
    response = await (0, import_obsidian2.requestUrl)(payload);
    notice.setMessage("response is ready!");
    setTimeout(() => notice.hide(), 1500);
  } catch (e) {
    notice.setMessage("llm call failed");
    setTimeout(() => notice.hide(), 1500);
  }
  return response?.json.choices?.[0]?.message?.content ?? null;
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
    if (nextLine && (nextLine?.text.trim() !== "" || nextLine?.text.startsWith("## "))) {
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
    const queryWrapper = document.createElement("div");
    const button = document.createElement("button");
    button.innerText = "submit";
    button.style.position = "absolute";
    button.style.right = "0px";
    button.id = "ai-submit-button";
    button.onclick = async () => {
      submitToLLM(this.view, this.plugin);
    };
    queryWrapper.appendChild(button);
    return queryWrapper;
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
      number = line.number;
      while (number < view.state.doc.lines - 1) {
        number++;
        const AftLine = view.state.doc.line(number);
        if (AftLine.text.trim() === "" || AftLine.text.startsWith("## ")) break;
        else paraLines.push(AftLine.text);
      }
      const paraText = paraLines.join("\n");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3MhOkluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncztcblx0c3lzdGVtUHJvbXB0ITpzdHJpbmc7XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCl7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSlcblx0fVxuXHRcblx0YXN5bmMgc2F2ZVNldHRpbmdzKCl7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTeXN0ZW1Qcm9tcHQoKXtcblx0XHRjb25zdCBwYXRoID0gYCR7dGhpcy5tYW5pZmVzdC5kaXJ9L2NvbmZpZ3MvZGVmYXVsdF9zeXNfcHJvbXB0Lm1kYDtcblx0XHR0aGlzLnN5c3RlbVByb21wdCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChwYXRoKTtcblx0fVxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRTeXN0ZW1Qcm9tcHQoKTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKHRoaXMuc3lzdGVtUHJvbXB0KTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKHRoaXMuc2V0dGluZ3MpO1xuXHRcdHRoaXMuYWRkUmliYm9uSWNvbihcInBhcGVyLXBsYW5lXCIsIFwiUHJpbnQgdG8gY29uc29sZVwiLCBcblx0XHRcdFx0XHRcdFx0KCk9Pntcblx0XHRcdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJ0ZXN0aW5nIHBsdWdpbnNcIik7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygndGVzdGluZyBwbHVnaW5zJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbdmlld1BsdWdpbkZhY3RvcnlNZXRob2QodGhpcyldKVxuXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcInN1Ym1pdC1haS1wcm9tcHRcIixcblx0XHRcdG5hbWU6IFwic3VibWl0IHRvIHRoZSBMTE1cIixcblx0XHRcdGhvdGtleXM6IFt7IFxuXHRcdFx0XHRtb2RpZmllcnM6IFtcIk1vZFwiLFwiU2hpZnRcIl0sIFxuXHRcdFx0XHRrZXk6IFwiTFwiXG5cdFx0XHR9XSxcblx0XHRcdGVkaXRvckNhbGxiYWNrOiBhc3luYyAoX2VkaXRvciwgdmlldykgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnaG90IGtleSBkZXRlY3RlZCcpO1xuXHRcdFx0XHRjb25zdCBidXR0b25DaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaS1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRcdGlmIChidXR0b25DaGVjayA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHQvLyBidXR0b25DaGVjay5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0Y29uc3QgZWRpdG9yVmlldyA9IHZpZXcuZWRpdG9yLmNtIGFzIEVkaXRvclZpZXc7XG5cdFx0XHRcdGF3YWl0IHN1Ym1pdFRvTExNKGVkaXRvclZpZXcsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdH1cbn0iLCAiaW1wb3J0IHR5cGUgSW5MaW5lQUlUdXRvclBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge0FwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZ30gZnJvbSBcIm9ic2lkaWFuXCJcblxuLy8gZXhwb3J0IHR5cGUgQVBJRnJhbWVXb3JrID0gXCJsbXN0dWRpb1wiIHwgXCJvbGxhbWFcIiB8IFwibGxhbWFjcHBcIjtcblxuZXhwb3J0IGludGVyZmFjZSBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3Mge1xuXHRiYXNlVVJMOnN0cmluZztcblx0bW9kZWxOYW1lOnN0cmluZztcblx0ZnJhbWV3b3JrOnN0cmluZztcblx0ZGVmYXVsdENvbnRleHQ6c3RyaW5nO1xuXHQvLyBpbmxpbmVMTE1JZDpzdHJpbmc7XG5cdC8vIGlubGluZUxMTVJlc3BvbnNlSWQ6c3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGFydGlhbDxJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3M+ID0ge1xuXHRiYXNlVVJMOiBcImh0dHA6Ly8xMjcuMC4wLjE6MTIzNFwiLFxuXHRtb2RlbE5hbWU6IFwiZ29vZ2xlL2dlbW1hLTQtMjZiLWE0YlwiLFxuXHRmcmFtZXdvcms6IFwibG1zdHVkaW9cIixcblx0ZGVmYXVsdENvbnRleHQ6IFwiZG9jXCIsXG5cdC8vIGlubGluZUxMTUlkOiBcImFzc2lzdGFudFwiLFxuXHQvLyBpbmxpbmVMTE1SZXNwb25zZUlkOlwicmVzcG9uc2VcIixcbn1cbmV4cG9ydCBjbGFzcyBJbkxpbmVBSVR1dG9yU2V0dGluZ3NUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFie1xuXHRwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW47XG5cdFxuXHRjb25zdHJ1Y3RvcihhcHA6QXBwLCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0ZGlzcGxheSgpOiB2b2lkIHtcblx0XHRsZXQge2NvbnRhaW5lckVsfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgVVJMXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJodHRwcy8vZXhhbXBsZS5jb206XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJhc2VVUkwpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFzZVVSTCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIm1vZGVsIGlkXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJjb21wYW55L2Nvb2wtbW9kZWwtMWJcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIGFjdGl2YXRpb24gaWRlbnRpZmllclwiKVxuXHRcdC8vIFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdC8vIFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwibGxtX2FjdGl2YXRlIVwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZClcblx0XHQvLyBcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0Ly8gXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIHJlc3BvbnNlIGlkZW50aWZpZXJcIilcblx0XHQvLyBcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHQvLyBcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImVsZW1lbnRhcnktd2F0c29uXCIpXG5cdFx0Ly8gXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTVJlc3BvbnNlSWQpXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNUmVzcG9uc2VJZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiYmFja2VuZFwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bik9PiB7XG5cdFx0XHRcdGRyb3Bkb3duXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImxtc3R1ZGlvXCIsIFwiTE0tU3R1ZGlvXCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImxsYW1hY3BwXCIsIFwibGxhbWEuY3BwXCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcIm9sbGFtYVwiLCBcIm9sbGFtYVwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mcmFtZXdvcmspXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZnJhbWV3b3JrID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiZGVmYXVsdCBjb250ZXh0XCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKT0+IHtcblx0XHRcdFx0ZHJvcGRvd25cblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiZG9jXCIsIFwiV2hvbGUgZG9jdW1lbnRcIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiaXNvbGF0ZWRcIiwgXCJObyBkb2N1bWVudCBjb250ZXh0XCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcInNlY3Rpb25cIiwgXCJpbW1lZGlhdGUgc2VjdGlvbiBvbmx5XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblxuXHR9XG59IiwgIi8vIGltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tICdAY29kZW1pcnJvci9sYW5ndWFnZSc7XG5pbXBvcnQgeyBSYW5nZVNldEJ1aWxkZXIgfSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7XG5pbXBvcnQge3JlcXVlc3RVcmwsIEVkaXRvciwgTm90aWNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG4vLyBpbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiYnVmZmVyXCI7XG5pbXBvcnQge1xuICBEZWNvcmF0aW9uLFxuICBEZWNvcmF0aW9uU2V0LFxuICBFZGl0b3JWaWV3LFxuICBQbHVnaW5TcGVjLFxuICBQbHVnaW5WYWx1ZSxcbiAgVmlld1BsdWdpbixcbiAgVmlld1VwZGF0ZSxcbiAgV2lkZ2V0VHlwZSxcbn0gZnJvbSAnQGNvZGVtaXJyb3Ivdmlldyc7XG5cbmltcG9ydCBJbkxpbmVBSVR1dG9yUGx1Z2luIGZyb20gJy4vbWFpbic7XG5pbXBvcnQgeyBiZWZvcmUgfSBmcm9tICdub2RlOnRlc3QnO1xuXG5jb25zdCBTRVBBUkFUT1IgPSBcIi1cIi5yZXBlYXQoMTApO1xuXG5mdW5jdGlvbiBmb3JtYXREYXRlKHRpbWVzdGFtcDpudW1iZXIpOnN0cmluZ3tcbiAgY29uc3QgbW9udGhOYW1lcyA9IFtcImphblwiLCAnZmViJywgXCJhcHJcIiwgJ21heScsICdqdW4nLCAnanVsJyxcbiAgICAgICAgICAgICAgXCJhdWdcIiwgXCJzZXBcIiwgXCJvY3RcIiwgXCJub3ZcIiwgXCJkZWNcIl07XG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0aW1lc3RhbXApO1xuICBjb25zdCBhZGRQYWRkaW5nID0gKG51bTpudW1iZXIpOiBzdHJpbmcgPT4gbnVtLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICBjb25zdCBoaCA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRIb3VycygpKTtcbiAgY29uc3QgbW0gPSBhZGRQYWRkaW5nKGRhdGUuZ2V0TWludXRlcygpKTtcbiAgY29uc3QgZGF5ID0gYWRkUGFkZGluZyhkYXRlLmdldERhdGUoKSk7XG4gIGNvbnN0IG1vbnRoID0gbW9udGhOYW1lc1soZGF0ZS5nZXRNb250aCgpKS0xXTtcbiAgY29uc3QgeWVhciA9IGRhdGUuZ2V0RnVsbFllYXIoKTtcblxuICByZXR1cm4gYCR7aGh9OiR7bW19ICR7ZGF5fSAke21vbnRofSAke3llYXJ9YDtcbn1cblxuZXhwb3J0IHR5cGUgbWF5YmVTdHJpbmcgPSBzdHJpbmcgfCBudWxsO1xuXG5leHBvcnQgY29uc3QgSU1BR0VfRklMRV9UWVBFUyA9IFsncG5nJywgJ2pwZycsICdqcGVnJywgJ2dpZicsICd3ZWJwJywgJ2JtcCcsICdzdmcnXVxuXG5hc3luYyBmdW5jdGlvbiBmb3JtYXRUZXh0QmxvYihwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgdGV4dDpzdHJpbmcsIGlkeDpudW1iZXI9MSwgaXNEb2M6Ym9vbGVhbj10cnVlKXtcbiAgLy8gY29uc3QgcmVnZXhQYXR0ZXJuOiBSZWdFeHAgPSBuZXcgUmVnRXhwKFwiXFwhXFxbXFxbKFtcXHdcXHMuXFwtX10rKVxcXVxcXVwiLCAnZycpO1xuICBjb25zdCBmaWxlID0gcGx1Z2luLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICBjb25zdCBzb3VyY2VQYXRoID0gZmlsZT8ucGF0aCBhcyBzdHJpbmc7XG4gIGNvbnN0IHJlZ2V4UGF0dGVybiA9IC9cXCFcXFtcXFsoW1xcd1xcc19cXC1dK1xcLlxcdyspXFxdXFxdfFxcIVxcWy4rXFxdXFwoKFtcXHdcXHNfXFwtXStcXC5cXHcrKVxcKS9nO1xuICAvLyBjb25zdCByZWdleFBhdHRlcm5UZXh0ID0gL1xcIVxcW1xcW1tcXHdcXHNfXFwtXStcXC5cXHcrXFxdXFxdfFxcIVxcWy4rXFxdXFwoKFtcXHdcXHNfXFwtXStcXC5cXHcrKVxcKS9nXG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG4gIGNvbnN0IGJ1ZmZlcjogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY29udGVudEFycmF5Om9iamVjdFtdID0gW107XG4gIFxuICBsZXQgbnVtYmVyID0gaWR4O1xuICBsZXQgaW50ZXJpbU9iajpvYmplY3R8QXJyYXk8b2JqZWN0PjtcbiAgXG4gIC8vIHRlc3QgcGF0dGVybiBcbiAgLy8gY29uc3QgdGV4dF8gPSAnIVtbUGFzdGVkIGltYWdlIDIwMjYwNTE3MDQxNDA3LnBuZ11dJztcbiAgLy8gY29uc3QgcmUgPSAvIVxcW1xcWyhbXFx3XFxzXy1dK1xcLlxcdyspXFxdXFxdL2c7XG4gIC8vIGNvbnNvbGUubG9nKCd0ZXN0aW5nIHBhdHRlcm4nKTtcbiAgLy8gZm9yIChjb25zdCBtYXRjaCBvZiB0ZXh0Xy5tYXRjaEFsbChyZSkpIHtcbiAgLy8gICBjb25zb2xlLmxvZyhtYXRjaFswXSk7IC8vIHdob2xlICFbWy4uLl1dXG4gIC8vICAgY29uc29sZS5sb2cobWF0Y2hbMV0pOyAvLyBQYXN0ZWQgaW1hZ2UgMjAyNjA1MTcwNDE0MDcucG5nXG4gIC8vIH1cbiAgLy8gY29uc29sZS5sb2coXCJlbmQgb2YgcGF0dGVybiB0ZXN0XCIpXG4gIC8vIHRlc3QgcGF0dGVybiBcblxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBjb25zdCBtYXRjaGVzID0gWy4uLmxpbmUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuKV07XG4gICAgLy8gY29uc29sZS5sb2cobWF0Y2hlcylcbiAgICBjb25zdCBjaGtMaW5lID0gbGluZS5yZXBsYWNlKHJlZ2V4UGF0dGVybiwgXCJcIik7XG4gICAgLy8gY29uc3QgdGV4dE1hdGNoZXMgPSBbLi4ubGluZS5tYXRjaEFsbChyZWdleFBhdHRlcm5UZXh0KV07XG4gICAgLy8gY29uc29sZS5sb2coJ3RleHQgbWF0Y2ggb24gaW1hZ2UgbGluZXMnLCB0ZXh0TWF0Y2hlcylcbiAgICAvLyBjb25zb2xlLmxvZyhbLi4uJyFbW1Bhc3RlZCBpbWFnZSAyMDI2MDUxNzA0MTQwNy5wbmddXScubWF0Y2hBbGwocmVnZXhQYXR0ZXJuKV0pO1xuICAgIC8vIGNvbnNvbGUubG9nKFwiTElORTpcIiwgSlNPTi5zdHJpbmdpZnkobGluZSkpXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoPjApe1xuICAgICAgLy8gZXh0cmFjdCBpbWFnZSwgY29udmVydCB0byBiYXNlXG4gICAgICBpbnRlcmltT2JqID0gW11cbiAgICAgIC8vIGNvbnNvbGUubG9nKGNoa0xpbmUpO1xuICAgICAgaWYgKGNoa0xpbmUudHJpbSgpIT09XCJcIikgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGB0ZXh0IGlubGluZSB3aXRoIGltYWdlKHMpIGJlbG93OiAke2xpbmUucmVwbGFjZShyZWdleFBhdHRlcm4sICc8aW1hZ2VQbGFjZUhvbGRlcj4nKX1gfSk7XG5cbiAgICAgIGZvcihjb25zdCBtYXRjaCBvZiBtYXRjaGVzKXtcbiAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG1hdGNoWzFdID8/IG1hdGNoWzJdO1xuICAgICAgICBpZiAoSU1BR0VfRklMRV9UWVBFUy5jb250YWlucyhtYXRjaGVkLnNwbGl0KCcuJylbMV0pKXtcbiAgICAgICAgICBjb25zdCB0YXJnZXQgPSBwbHVnaW4uYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QobWF0Y2hlZCwgc291cmNlUGF0aCk7XG4gICAgICAgICAgY29uc3QgaW1hZ2VQYXRoID0gdGFyZ2V0Py5wYXRoO1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1hZ2UgZm91bmQ6IFwiLCBpbWFnZVBhdGgpXG4gICAgICAgICAgaWYoaW1hZ2VQYXRoKXtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBwbHVnaW4uYXBwLnZhdWx0LnJlYWRCaW5hcnkodGFyZ2V0KTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVCdWZmZXIgPSBCdWZmZXIuaXNCdWZmZXIoZGF0YSkgPyBkYXRhIDogQnVmZmVyLmZyb20oZGF0YSBhcyBBcnJheUJ1ZmZlcik7XG4gICAgICAgICAgICBjb25zdCBpbVN0ciA9IGBkYXRhOmltYWdlLyR7bWF0Y2hlZC5zcGxpdCgnLicpWzFdfTtiYXNlNjQsJHtmaWxlQnVmZmVyLnRvU3RyaW5nKFwiYmFzZTY0XCIpfX1gXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IHBvc1RhZ1N0YXJ0ID0gaXNEb2M/IGAkPHBvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuICAgICAgICAgICAgY29uc3QgcG9zVGFnRW5kICAgPSBpc0RvYz8gYCQ8L3Bvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuXG4gICAgICAgICAgICAvLyBjb25zdCBiZWZUZXh0ID0gdGV4dE1hdGNoZXNbMV0/P3RleHRNYXRjaGVzWzRdO1xuICAgICAgICAgICAgLy8gY29uc3QgYWZ0VGV4dCA9IHRleHRNYXRjaGVzWzJdPz90ZXh0TWF0Y2hlc1s1XTtcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAvLyBpZih0ZXh0TWF0Y2hlcy5sZW5ndGg+MCl7XG4gICAgICAgICAgICAvLyAgIGNvbnNvbGUubG9nKFwidGV4dCBtYXRjaGVzXCIsIHRleHRNYXRjaGVzKTtcbiAgICAgICAgICAgIC8vICAgY29uc29sZS5sb2coYmVmVGV4dCk7XG4gICAgICAgICAgICAvLyAgIGNvbnNvbGUubG9nKGFmdFRleHQpO1xuICAgICAgICAgICAgLy8gfVxuXG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogcG9zVGFnU3RhcnR9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gaWYoYmVmVGV4dCkgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6YmVmVGV4dH0pO1xuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJpbWFnZV91cmxcIiwgaW1hZ2VfdXJsOiB7dXJsOmltU3RyfX0pO1xuICAgICAgICAgICAgLy8gaWYoYWZ0VGV4dCkgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6YWZ0VGV4dH0pO1xuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IHBvc1RhZ0VuZH0pO1xuICAgICAgICAgICAgbnVtYmVyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGxpbmUudHJpbSgpPT09XCJcIil7XG4gICAgICAgIC8vIG1lcmdlIGJ1ZmZlclxuICAgICAgICBjb25zdCBwb3NUYWdTdGFydCA9IGlzRG9jPyBgJDxwb3NpdGlvbl8ke251bWJlcn0+YDogXCJcIjtcbiAgICAgICAgY29uc3QgcG9zVGFnRW5kICAgPSBpc0RvYz8gYCQ8L3Bvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuXG4gICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtwb3NUYWdTdGFydH0ke2J1ZmZlci5qb2luKFwiXFxuXCIpfSR7cG9zVGFnRW5kfWB9KTtcbiAgICAgICAgbnVtYmVyKys7XG4gICAgICAgIGJ1ZmZlci5sZW5ndGggPSAwO1xuICAgIH1cbiAgICBlbHNlIGlmIChsaW5lLnRyaW0oKSE9PVwiXCIpe1xuICAgICAgLy8gYWRkIHRvIGJ1ZmZlclxuICAgICAgYnVmZmVyLnB1c2gobGluZSk7XG4gICAgfVxuICAgIC8vIGFkZCBwb3NpdGlvbiBudW1iZXIgYW5kIGFwcGVuZCB0aGUgbWVzc2FnZSB0byB0aGUgY29udGVudCBhcnJheS5cbiAgfVxuXG4gIGlmIChidWZmZXIubGVuZ3RoPjApe1xuICAgIGNvbnN0IHBvc1RhZ1N0YXJ0ID0gaXNEb2M/IGAkPHBvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuICAgICAgICBjb25zdCBwb3NUYWdFbmQgICA9IGlzRG9jPyBgJDwvcG9zaXRpb25fJHtudW1iZXJ9PmA6IFwiXCI7XG5cbiAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke3Bvc1RhZ1N0YXJ0fSR7YnVmZmVyLmpvaW4oXCJcXG5cIil9JHtwb3NUYWdFbmR9YH0pO1xuICAgICAgICBudW1iZXIrKztcbiAgICAgICAgYnVmZmVyLmxlbmd0aCA9IDA7XG4gIH1cblxuICAvLyBjb25zb2xlLmxvZyhjb250ZW50QXJyYXkpXG4gIHJldHVybiB7Y29udGVudEFycmF5LCBudW1iZXJ9XG59XG5mdW5jdGlvbiBnZXRRdWVyeUNvbnRleHQodmlldzpFZGl0b3JWaWV3LCBiZWZvcmVMaW5lOm51bWJlciwgYWZ0ZXJMaW5lOm51bWJlciwgc2VjdGlvbk9ubHk6Ym9vbGVhbj1mYWxzZSlcbjp7YmVmb3JlVGV4dDpzdHJpbmcsIGFmdGVyVGV4dDpzdHJpbmd9ICB7XG4gIFxuICBsZXQgbnVtYmVyID0gYmVmb3JlTGluZTtcbiAgY29uc3QgYmVmb3JlTGluZXMgPSBbXTtcbiAgd2hpbGUgKG51bWJlciA+IDApe1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgaWYgKHNlY3Rpb25Pbmx5ICYmIChsaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYmVmb3JlTGluZXMudW5zaGlmdChsaW5lLnRleHQpO1xuICAgIG51bWJlci0tO1xuICB9XG5cbiAgbnVtYmVyID0gYWZ0ZXJMaW5lO1xuICBjb25zdCBhZnRlckxpbmVzID0gW107XG4gIHdoaWxlIChudW1iZXIgPCB2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICBpZiAoc2VjdGlvbk9ubHkgJiYgKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSl7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBhZnRlckxpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICBudW1iZXIrKztcbiAgfVxuICBcblxuICBjb25zdCBiZWZvcmVUZXh0ID0gYmVmb3JlTGluZXMuam9pbignXFxuJylcbiAgY29uc3QgYWZ0ZXJUZXh0ID0gYWZ0ZXJMaW5lcy5qb2luKCdcXG4nKVxuXG4gIC8vIGNvbnNvbGUubG9nKFwiQkVGT1JFIFRFWFQ6XCIsIGJlZm9yZVRleHQpO1xuICAvLyBjb25zb2xlLmxvZyhcIkFGVEVSIFRFWFQ6XCIsIGFmdGVyVGV4dCk7XG4gIHJldHVybiB7YmVmb3JlVGV4dCwgYWZ0ZXJUZXh0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3VibWl0VG9MTE0odmlldzpFZGl0b3JWaWV3LCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG4gICAgLy8gY29uc29sZS5sb2coXCJzdWJtaXR0aW5nIHNvbWV0aGluZyFcIik7XG4gICAgLy8gbmV3IE5vdGljZShcInN1Ym1pdHRpbmcgdG8gTExNXCIpO1xuICAgIGNvbnN0IHN1Ym1pdFRpbWUgPSBmb3JtYXREYXRlKERhdGUubm93KCkpO1xuICAgIGNvbnN0IHtjb250ZW50LCBiZWZvcmVMaW5lLCBhZnRlckxpbmV9ID0gZ2V0TExNcXVlcnkodmlldyk7XG4gICAgXG4gICAgaWYgKGNvbnRlbnQuY29udGFpbnMoXCJAcmVzcG9uc2VcIikpIHJldHVybjtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhcInN1Ym1pdHRlZCBhdDpcIiwgc3VibWl0VGltZSk7XG4gICAgLy8gY29uc29sZS5sb2coY29udGVudCk7XG4gICAgXG4gICAgY29uc3QgZGVmYXVsdFR5cGUgPSBwbHVnaW4uc2V0dGluZ3MuZGVmYXVsdENvbnRleHQ7XG4gICAgY29uc3QgZmlyc3RXb3JkID0gY29udGVudC5zcGxpdChcIiBcIilbMF07XG4gICAgY29uc3Qgb3B0aW9ucyA9IGZpcnN0V29yZC5zcGxpdChcIjpcIikuc2xpY2UoMSwgdW5kZWZpbmVkKTtcbiAgICAvLyBjb25zb2xlLmxvZyhvcHRpb25zKVxuICAgIGlmKChvcHRpb25zLmxlbmd0aD09PTEpICYmKG9wdGlvbnNbMF09PT1cIlwiKSkgb3B0aW9ucy5sZW5ndGggPSAwO1xuICAgIC8vIGxldCBhbnN3ZXI6c3RyaW5nO1xuICAgIGxldCBiZWZvcmVUZXh0OiBtYXliZVN0cmluZz1udWxsLCBhZnRlclRleHQ6IG1heWJlU3RyaW5nPW51bGw7XG5cbiAgICBpZihvcHRpb25zLmNvbnRhaW5zKCdpc29sYXRlZCcpfHwoKGRlZmF1bHRUeXBlPT09XCJpc29sYXRlZFwiKSAmJiAob3B0aW9ucy5sZW5ndGg9PT0wKSkpe1xuICAgICAgYmVmb3JlVGV4dCA9IG51bGw7XG4gICAgICBhZnRlclRleHQgPSBudWxsO1xuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNvbnRhaW5zKFwiZG9jXCIpfHwoZGVmYXVsdFR5cGU9PT1cImRvY1wiKSAmJiAob3B0aW9ucy5sZW5ndGg9PT0wKSl7XG4gICAgICBjb25zdCBjb250ZXh0ID0gZ2V0UXVlcnlDb250ZXh0KHZpZXcsIGJlZm9yZUxpbmUsIGFmdGVyTGluZSk7XG4gICAgICBiZWZvcmVUZXh0ID0gY29udGV4dC5iZWZvcmVUZXh0O1xuICAgICAgYWZ0ZXJUZXh0ID0gY29udGV4dC5hZnRlclRleHQ7XG4gICAgICBcbiAgICB9XG4gICAgZWxzZSBpZiAob3B0aW9ucy5jb250YWlucyhcInNlY3Rpb25cIil8fChkZWZhdWx0VHlwZT09PVwic2VjdGlvblwiKSAmJiAob3B0aW9ucy5sZW5ndGg9PT0wKSl7XG4gICAgICBjb25zdCBjb250ZXh0ID0gZ2V0UXVlcnlDb250ZXh0KHZpZXcsIGJlZm9yZUxpbmUsIGFmdGVyTGluZSwgdHJ1ZSk7XG4gICAgICAvLyBjb25zdCBjb250ZXh0ID0gZ2V0UXVlcnlDb250ZXh0KHZpZXcsIGJlZm9yZUxpbmUsIGFmdGVyTGluZSk7XG4gICAgICBiZWZvcmVUZXh0ID0gY29udGV4dC5iZWZvcmVUZXh0O1xuICAgICAgYWZ0ZXJUZXh0ID0gY29udGV4dC5hZnRlclRleHQ7XG4gICAgfVxuICAgIFxuICAgIC8vICAgICAgIGN1cmwgaHR0cDovL2xvY2FsaG9zdDoxMjM0L2FwaS92MS9jaGF0IFxcXG4gICAgLy8gICAtSCBcIkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvblwiIFxcXG4gICAgLy8gICAtZCAne1xuICAgIC8vICAgICBcIm1vZGVsXCI6IFwiZ29vZ2xlL2dlbW1hLTQtMjZiLWE0YlwiLFxuICAgIC8vICAgICBcInN5c3RlbV9wcm9tcHRcIjogXCJZb3UgYW5zd2VyIG9ubHkgaW4gcmh5bWVzLlwiLFxuICAgIC8vICAgICBcImlucHV0XCI6IFwiV2hhdCBpcyB5b3VyIGZhdm9yaXRlIGNvbG9yP1wiXG4gICAgLy8gfSdcbiAgICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwaW5nTExNKHBsdWdpbiwgY29udGVudCwgYmVmb3JlVGV4dCwgYWZ0ZXJUZXh0KTtcbiAgICBpZihhbnN3ZXIpe1xuICAgICAgLy8gbmV3IE5vdGljZShcIlJlc3BvbnNlIHJlY2VpdmVkIVwiKVxuICAgICAgY29uc29sZS5sb2coYW5zd2VyKTtcbiAgICAgIGNvbnN0IHJlY2VpdmVUaW1lID0gZm9ybWF0RGF0ZShEYXRlLm5vdygpKTtcbiAgICAgIC8vIGNvbnNvbGUubG9nKFwicmVjZWl2ZWQgYXQ6XCIsIHJlY2VpdmVUaW1lKTtcbiAgICBcbiAgICAgIGFwcGVuZEFuc3dlcih2aWV3LCBhbnN3ZXIsIHN1Ym1pdFRpbWUsIHJlY2VpdmVUaW1lKTtcbiAgICB9XG4gICAgZWxzZXtcbiAgICAgIG5ldyBOb3RpY2UoXCJDYWxsIGZhaWxlZFwiKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gYXBwZW5kQW5zd2VyKHZpZXc6RWRpdG9yVmlldywgdGV4dDpzdHJpbmcsIHN1Ym1pdFRpbWU6c3RyaW5nLCByZWNlaXZlVGltZTpzdHJpbmcpe1xuICAgIGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uaGVhZDtcbiAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICB3aGlsZSAoY3VyckxpbmUubnVtYmVyPHZpZXcuc3RhdGUuZG9jLmxpbmVzKXtcbiAgICAgIGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShjdXJyTGluZS5udW1iZXIgKyAxKTtcbiAgICAgIGlmICgoY3VyckxpbmUudGV4dC50cmltKCk9PT1cIlwiKXx8KGN1cnJMaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgICBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoY3VyckxpbmUubnVtYmVyLTEpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgdmlldy5kaXNwYXRjaCh7XG4gICAgICBzZWxlY3Rpb246IHthbmNob3I6Y3VyckxpbmUudG99LFxuICAgICAgc2Nyb2xsSW50b1ZpZXc6dHJ1ZVxuICAgIH0pXG5cbiAgICBjb25zdCBmb3JtYXR0ZWRUZXh0ID0gYCAoc3VibWl0dGVkIGF0ICR7c3VibWl0VGltZX0pXFxuKipAcmVzcG9uc2UqKiAke3RleHR9IChyZXNwb25kZWQgYXQgJHtyZWNlaXZlVGltZX0pXFxuXFxuYFxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgICBjaGFuZ2VzOiB7ZnJvbTpjdXJyTGluZS50bywgaW5zZXJ0OiBmb3JtYXR0ZWRUZXh0fSxcbiAgICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOiBjdXJyTGluZS50bytmb3JtYXR0ZWRUZXh0Lmxlbmd0aH1cbiAgICB9KVxufVxuXG5hc3luYyBmdW5jdGlvbiBwaW5nTExNKHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luLCBxdWVyeTpzdHJpbmcsIGJlZm9yZVRleHQ6bWF5YmVTdHJpbmcsIGFmdGVyVGV4dDptYXliZVN0cmluZyk6UHJvbWlzZTxzdHJpbmd8bnVsbD57XG4gICAgY29uc3QgYmFzZV91cmwgPSBwbHVnaW4uc2V0dGluZ3MuYmFzZVVSTDtcbiAgICBjb25zdCB1cmwgPSBgJHtiYXNlX3VybH0vdjEvY2hhdC9jb21wbGV0aW9uc2A7XG4gICAgY29uc3QgbW9kZWwgPSBwbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xuICAgIGNvbnN0IHN5c3RlbV9wcm9tcHQgPSBcIllvdSBhcmUgYSBjb25jaXNlIGFuZCBzdWNjaW5jdCBhc3Npc3RhbnQgb3BlcmF0aW5nIGluc2lkZSBPYnNpZGlhbi5NRCwgYSBzcGVjaWFsaXplZCBub3RlIHRha2luZyBhcHAuXCI7XG4gICAgXG4gICAgY29uc3QgbWV0aG9kID0gXCJQT1NUXCI7XG5cbiAgICAvLyBjb25zb2xlLmxvZygnYmVmb3JlIHRleHQnLCBiZWZvcmVUZXh0KTtcbiAgICAvLyBjb25zb2xlLmxvZygnYWZ0ZXIgdGV4dCcsIGFmdGVyVGV4dCk7XG4gICAgbGV0IGJlZkFycmF5Rm9ybWF0dGVkOm9iamVjdFtdPVtdLCBhZnRBcnJheUZvcm1hdHRlZDpvYmplY3RbXT1bXSwgbnVtOm51bWJlcj0wO1xuICAgIFxuICAgIGlmIChiZWZvcmVUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBiZWZvcmVUZXh0LCBudW0pO1xuICAgICAgbnVtID0gbnVtYmVyO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQgPSBjb250ZW50QXJyYXk7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZC51bnNoaWZ0KFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQucHVzaChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gY29uc29sZS5sb2coJ0JFRk9SRSBDT05URU5UJywgYmVmQXJyYXlGb3JtYXR0ZWQpO1xuICAgIGNvbnN0IGFjdGl2ZV9udW0gPSBudW07XG4gICAgbnVtKys7XG4gICAgXG4gICAgaWYgKGFmdGVyVGV4dCl7XG4gICAgICBsZXQge2NvbnRlbnRBcnJheSwgbnVtYmVyfSA9IGF3YWl0IGZvcm1hdFRleHRCbG9iKHBsdWdpbiwgYWZ0ZXJUZXh0LCBudW0pO1xuICAgICAgbnVtID0gbnVtYmVyO1xuICAgICAgYWZ0QXJyYXlGb3JtYXR0ZWQgPSBjb250ZW50QXJyYXk7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZC51bnNoaWZ0KFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgICAgYWZ0QXJyYXlGb3JtYXR0ZWQucHVzaChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gY29uc29sZS5sb2coJ0FGVEVSIENPTlRFTlQnLCBhZnRBcnJheUZvcm1hdHRlZCk7XG4gICAgLy8gY29uc3QgYmVmb3JlVGV4dCA9IGAke3NlcGFyYXRvcn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBBQk9WRSBRVUVSWSAke3NlcGFyYXRvcn1cXG4ke2JlZm9yZUxpbmVzLmpvaW4oXCJcXG5cIil9XFxuJHtzZXBhcmF0b3J9IEVORCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7c2VwYXJhdG9yfVxcbmA7XG4gICAgLy8gY29uc3QgYWZ0ZXJUZXh0ICA9IGAke3NlcGFyYXRvcn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke3NlcGFyYXRvcn1cXG4ke2FmdGVyTGluZXMuam9pbihcIlxcblwiKX1cXG4ke3NlcGFyYXRvcn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtzZXBhcmF0b3J9XFxuYDs7XG5cbiAgICAvLyBjb25zb2xlLmxvZygncXVlcnknLCBxdWVyeSlcbiAgICAvLyAgJHtxdWVyeS5zcGxpdChcIiBcIikuc2xpY2UoMSwgdW5kZWZpbmVkKS5qb2luKFwiIFwiKX1cbiAgICBsZXQge2NvbnRlbnRBcnJheSwgbnVtYmVyfSA9IGF3YWl0IGZvcm1hdFRleHRCbG9iKHBsdWdpbiwgcXVlcnkuc3BsaXQoXCIgXCIpLnNsaWNlKDEsIHVuZGVmaW5lZCkuam9pbihcIiBcIiksIG51bSwgZmFsc2UpXG4gICAgY29uc3QgcXVlcnlBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICBjb25zb2xlLmxvZyhxdWVyeUFycmF5Rm9ybWF0dGVkKVxuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICAgIHVybCxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgXCJBdXRob3JpemF0aW9uXCI6IFwiQmVhcmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIG1vZGVsLFxuICAgICAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgICAgICB7cm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogcGx1Z2luLnN5c3RlbVByb21wdH0sXG4gICAgICAgICAgICB7cm9sZTogXCJ1c2VyXCIsIFxuICAgICAgICAgICAgICBjb250ZW50OiBbXG4gICAgICAgICAgICAgICAgLy8ge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBiZWZvcmVUZXh0ID8/IFwiXFxuXCJ9LFxuICAgICAgICAgICAgICAgIC4uLmJlZkFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke2FjdGl2ZV9udW19PiAqVGhpcyBpcyB0aGUgcG9zaXRpb24gb2YgdGhlIHVzZXIgcXVlc3Rpb24vcHJvbXB0IGN1cnJlbnRseSBwb3NlZCB0byB5b3UqIDwvcG9zaXRpb25fJHthY3RpdmVfbnVtfT5gfSxcbiAgICAgICAgICAgICAgICAvLyB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGFmdGVyVGV4dCAgPz8gXCJcXG5cIn0sXG4gICAgICAgICAgICAgICAgLi4uYWZ0QXJyYXlGb3JtYXR0ZWQsXG4gICAgICAgICAgICAgICAgLy8ge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBgY3VycmVudCB1c2VyIHByb21wdDogJHtxdWVyeS5zcGxpdChcIiBcIikuc2xpY2UoMSwgdW5kZWZpbmVkKS5qb2luKFwiIFwiKX1gfSxcbiAgICAgICAgICAgICAgICB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBjdXJyZW50IHVzZXIgcHJvbXB0OiBgfSxcbiAgICAgICAgICAgICAgICAuLi5xdWVyeUFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICBdfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgdGVtcGVyYXR1cmU6MC45LFxuICAgICAgICB9KVxuICAgIH1cbiAgIFxuICBsZXQgcmVzcG9uc2U7XG4gIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2UoXCJsbG0gaXMgdGhpbmtpbmcuLi5cIiwgMCk7XG4gIHRyeXtcbiAgICByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwocGF5bG9hZCk7XG4gICAgbm90aWNlLnNldE1lc3NhZ2UoXCJyZXNwb25zZSBpcyByZWFkeSFcIilcbiAgICBzZXRUaW1lb3V0KCgpPT5ub3RpY2UuaGlkZSgpLCAxNTAwKTtcbiAgfVxuICBjYXRjaChlKXtcbiAgICBub3RpY2Uuc2V0TWVzc2FnZShcImxsbSBjYWxsIGZhaWxlZFwiKTtcbiAgICBzZXRUaW1lb3V0KCgpPT5ub3RpY2UuaGlkZSgpLCAxNTAwKVxuICB9XG4gIHJldHVybiByZXNwb25zZT8uanNvbi5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0TExNcXVlcnkodmlldzpFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGNvbnN0IGFsbExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBcbiAgICBjb25zdCBudW1MaW5lcyA9IHZpZXcuc3RhdGUuZG9jLmxpbmVzO1xuICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICBhbGxMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgXG4gICAgbGV0IGJlZm9yZUxpbmU6bnVtYmVyPTEwMDAwMDtcbiAgICBsZXQgYWZ0ZXJMaW5lOm51bWJlcj0wO1xuXG4gICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgbnVtYmVyLS07XG4gICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpe1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnYnJlYWtpbmcgcG9pbnQnKVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBsaW5lX3FObzogJHtudW1iZXJ9IGxpbmU6ICR7Y3VyckxpbmUubnVtYmVyfWAsIFwidGV4dDogXCIsIGN1cnJMaW5lLnRleHQpXG4gICAgICAgIGFsbExpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIGJlZm9yZUxpbmU9bnVtYmVyO1xuICAgIFxuICAgIG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIHdoaWxlKG51bWJlcjwobnVtTGluZXMtMSkpe1xuICAgICAgbnVtYmVyKys7XG4gICAgICBjb25zdCBuZXh0TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChuZXh0TGluZSAmJiAoKG5leHRMaW5lPy50ZXh0LnRyaW0oKSAhPT0gXCJcIil8fChuZXh0TGluZT8udGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSkpe1xuICAgICAgICBhbGxMaW5lcy5wdXNoKG5leHRMaW5lLnRleHQpXG4gICAgICB9XG4gICAgICBlbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgYWZ0ZXJMaW5lPW51bWJlcjtcbiAgICByZXR1cm4ge2NvbnRlbnQ6IGFsbExpbmVzLmpvaW4oXCJcXG5cIiksIGJlZm9yZUxpbmUsIGFmdGVyTGluZX1cblxufVxuXG4vLyBpbXBvcnQgeyBFbW9qaVdpZGdldCB9IGZyb20gJ2Vtb2ppJztcbmV4cG9ydCBjbGFzcyBJbmxpbmVBSVdpZGdldCBleHRlbmRzIFdpZGdldFR5cGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogSW5MaW5lQUlUdXRvclBsdWdpbixcbiAgICBwcml2YXRlIHZpZXc6IEVkaXRvclZpZXcsXG4gICAgcHJpdmF0ZSBmcm9tOiBudW1iZXIsXG4gICAgcHJpdmF0ZSB0bzogbnVtYmVyLFxuICApe1xuICAgIHN1cGVyKClcbiAgfVxuICBcbiAgZXEob3RoZXI6IElubGluZUFJV2lkZ2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuZnJvbSA9PT0gb3RoZXIuZnJvbSAmJiB0aGlzLnRvID09PSBvdGhlci50bztcbiAgfVxuXG4gIHRvRE9NKHZpZXc6RWRpdG9yVmlldyk6SFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IHF1ZXJ5V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGJ1dHRvbi5pbm5lclRleHQgPSBcInN1Ym1pdFwiO1xuICAgIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnMHB4JztcbiAgICAvLyBidXR0b24uc3R5bGUuYm90dG9tID0gXCIwcHhcIjtcbiAgICBidXR0b24uaWQgPSBcImFpLXN1Ym1pdC1idXR0b25cIlxuICAgIFxuICAgIGJ1dHRvbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBzdWJtaXRUb0xMTSh0aGlzLnZpZXcsIHRoaXMucGx1Z2luKTtcbiAgICAgICAgLy8gYnV0dG9uLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9O1xuICAgIHF1ZXJ5V3JhcHBlci5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIHJldHVybiBxdWVyeVdyYXBwZXI7XG4gIH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gdmlld1BsdWdpbkZhY3RvcnlNZXRob2QoX3BsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luKXtcbiAgY2xhc3MgSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4gaW1wbGVtZW50cyBQbHVnaW5WYWx1ZSB7XG4gICAgZGVjb3JhdGlvbnM6IERlY29yYXRpb25TZXQ7XG4gICAgcGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luO1xuXG4gICAgY29uc3RydWN0b3IodmlldzogRWRpdG9yVmlldykge1xuICAgICAgdGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuYnVpbGREZWNvcmF0aW9ucyh2aWV3KTtcbiAgICAgIHRoaXMucGx1Z2luID0gX3BsdWdpbjtcbiAgICB9XG5cbiAgICB1cGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XG4gICAgICBpZiAodXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnZpZXdwb3J0Q2hhbmdlZCkge1xuICAgICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHVwZGF0ZS52aWV3KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkZXN0cm95KCkge31cblxuICAgIGJ1aWxkRGVjb3JhdGlvbnModmlldzogRWRpdG9yVmlldyk6IERlY29yYXRpb25TZXQge1xuICAgICAgY29uc3QgYnVpbGRlciA9IG5ldyBSYW5nZVNldEJ1aWxkZXI8RGVjb3JhdGlvbj4oKTtcblxuICAgICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgICAgXG4gICAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgICBsZXQgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgICAvLyBjb25zb2xlLmxvZygnc3RhcnQgbnVtYmVyOiAnLCBudW1iZXIpXG4gICAgICAvLyBjb25zb2xlLmxvZygnY3VycmVudCBsaW5lIGlzOicsIGxpbmUudGV4dClcbiAgICAgIFxuICAgICAgY29uc3QgcGFyYUxpbmVzOiBzdHJpbmdbXSA9IFtdXG4gICAgICBwYXJhTGluZXMucHVzaChsaW5lLnRleHQpXG4gICAgICB3aGlsZShudW1iZXI+MSl7XG4gICAgICAgIG51bWJlci0tO1xuICAgICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICAgIGlmIChjdXJyTGluZS50ZXh0LnRyaW0oKSA9PT0gXCJcIikgYnJlYWs7XG4gICAgICAgIGVsc2UgcGFyYUxpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG5cbiAgICAgIG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgICAgd2hpbGUgKG51bWJlciA8ICh2aWV3LnN0YXRlLmRvYy5saW5lcy0xKSl7XG4gICAgICAgIG51bWJlcisrO1xuICAgICAgICBjb25zdCBBZnRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgICBpZiAoKEFmdExpbmUudGV4dC50cmltKCk9PT1cIlwiKSB8fCAoQWZ0TGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKSBicmVhaztcbiAgICAgICAgZWxzZSBwYXJhTGluZXMucHVzaChBZnRMaW5lLnRleHQpO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBwYXJhVGV4dCA9IHBhcmFMaW5lcy5qb2luKCdcXG4nKTtcbiAgICAgIC8vIGNvbnNvbGUubG9nKHBhcmFUZXh0KVxuICAgICAgLy8gY29uc29sZS5sb2coXCJwYXJhVGV4dDogXCIsIHBhcmFUZXh0KVxuICAgICAgXG4gICAgICBjb25zdCBwcmV2TGluZSA9IGxpbmUubnVtYmVyID4gMSA/IHZpZXcuc3RhdGUuZG9jLmxpbmUobGluZS5udW1iZXItMSk6IG51bGw7XG4gICAgICAvLyBjb25zb2xlLmxvZyhcInByZXZpb3VzIGxpbmU6IFwiLCBwcmV2TGluZT8udGV4dCk7XG4gICAgICBcbiAgICAgIGlmKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiQGFzc2lzdGFudFwiKSAmJiAobGluZS5udW1iZXIgPiAxKSAmJiAocHJldkxpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAgIC8vIHRoaXMgY29uZGl0aW9uIG1lYW5zIHRoYXQgaXQgaXMgbm90IHRoZSBmaXJzdCBsaW5lIGFuZCBpdCBpcyBub3QgYSBwYXJhZ3JhcGggYnkgaXRzZWxmLlxuICAgICAgICBjb25zb2xlLmxvZyhcIndpbGwgbmVlZCB0byBhZGQgYSBsaW5lIGJyZWFrXCIpXG4gICAgICAgIGNvbnN0IGluc2VydGlvblN0ciA9IFwiXFxuXCJcbiAgICAgICAgc2V0VGltZW91dCgoKT0+e3ZpZXcuZGlzcGF0Y2goe1xuICAgICAgICAgIGNoYW5nZXM6IHtmcm9tOmxpbmUuZnJvbSwgaW5zZXJ0OiBpbnNlcnRpb25TdHJ9LFxuICAgICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogbGluZS50bytpbnNlcnRpb25TdHIubGVuZ3RofVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZWxzZSBpZiAocGFyYVRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgIShwYXJhVGV4dC5jb250YWlucyhcIkByZXNwb25zZVwiKSkpe1xuICAgICAgICBidWlsZGVyLmFkZChsaW5lLnRvLCBsaW5lLnRvLCBcbiAgICAgICAgICBEZWNvcmF0aW9uLndpZGdldChcbiAgICAgICAgICAgIHt3aWRnZXQ6IG5ldyBJbmxpbmVBSVdpZGdldCh0aGlzLnBsdWdpbiwgdmlldywgbGluZS50bywgbGluZS50byksIHNpZGU6IDF9XG4gICAgICAgICAgKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBsdWdpblNwZWM6IFBsdWdpblNwZWM8SW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4+ID0ge1xuICAgIGRlY29yYXRpb25zOiAodmFsdWU6IElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luKSA9PiB2YWx1ZS5kZWNvcmF0aW9ucyxcbiAgfTtcblxuICBjb25zdCBpbmxpbmVBSUFJUGx1Z2luID0gVmlld1BsdWdpbi5mcm9tQ2xhc3MoXG4gICAgSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4sXG4gICAgcGx1Z2luU3BlY1xuICApO1xuXG5yZXR1cm4gaW5saW5lQUlBSVBsdWdpblxufSJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFBQUEsbUJBQXFFOzs7QUNDckUsc0JBQTZDO0FBYXRDLElBQU0sbUJBQXlEO0FBQUEsRUFDckUsU0FBUztBQUFBLEVBQ1QsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsZ0JBQWdCO0FBQUE7QUFBQTtBQUdqQjtBQUNPLElBQU0sMkJBQU4sY0FBdUMsaUNBQWdCO0FBQUEsRUFHN0QsWUFBWSxLQUFTLFFBQTJCO0FBQy9DLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsUUFBSSxFQUFDLFlBQVcsSUFBSTtBQUNwQixnQkFBWSxNQUFNO0FBRWxCLFFBQUksd0JBQVEsV0FBVyxFQUNyQixRQUFRLFNBQVMsRUFDakIsUUFBUSxD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QzFFO0FBQUEsRUFFQSxNQUFNLGVBQWM7QUFDbkIsVUFBTSxLQUFLLFNBQVMsS0FBSyxRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQU0sbUJBQWtCO0FBQ3ZCLFVBQU0sT0FBTyxHQUFHLEtBQUssU0FBUyxHQUFHO0FBQ2pDLFNBQUssZUFBZSxNQUFNLEtBQUssSUFBSSxNQUFNLFFBQVEsS0FBSyxJQUFJO0FBQUEsRUFDM0Q7QUFBQSxFQUNBLE1BQU0sU0FBUztBQUNkLFVBQU0sS0FBSyxhQUFhO0FBQ3hCLFVBQU0sS0FBSyxpQkFBaUI7QUFLNUIsU0FBSztBQUFBLE1BQWM7QUFBQSxNQUFlO0FBQUEsTUFDN0IsTUFBSTtBQUNGLFlBQUksd0JBQU8saUJBQWlCO0FBQzVCLGdCQUFRLElBQUksaUJBQWlCO0FBQUEsTUFDOUI7QUFBQSxJQUNGO0FBQ0osU0FBSyxjQUFjLElBQUkseUJBQXlCLEtBQUssS0FBSyxJQUFJLENBQUM7QUFFL0QsU0FBSyx3QkFBd0IsQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLENBQUM7QUFFNUQsU0FBSyxXQUFXO0FBQUEsTUFDZixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULFdBQVcsQ0FBQyxPQUFNLE9BQU87QUFBQSxRQUN6QixLQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsTUFDRCxnQkFBZ0IsT0FBTyxTQUFTLFNBQVM7QUFFeEMsY0FBTSxjQUFjLFNBQVMsZUFBZSxrQkFBa0I7QUFDOUQsWUFBSSxnQkFBZ0IsS0FBTTtBQUcxQixjQUFNLGFBQWEsS0FBSyxPQUFPO0FBQy9CLGNBQU0sWUFBWSxZQUFZLElBQUk7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJjb250ZW50QXJyYXkiLCAibnVtYmVyIl0KfQo=
