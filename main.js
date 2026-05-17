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
  console.log(content);
  const defaultType = plugin.settings.defaultContext;
  const firstWord = content.split(" ")[0];
  const options = firstWord.split(":").slice(1, void 0);
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
    new import_obsidian2.Notice("Response received!");
    console.log(answer);
    const receiveTime = formatDate(Date.now());
    console.log("received at:", receiveTime);
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
  console.log("query", query);
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
        { role: "system", content: system_prompt },
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
        if (currLine.text.trim() === "") {
          break;
        } else {
          paraLines.unshift(currLine.text);
        }
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
  async onload() {
    await this.loadSettings();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3MhOkluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncztcblxuXHRhc3luYyBsb2FkU2V0dGluZ3MoKXtcblx0XHR0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKVxuXHR9XG5cdFxuXHRhc3luYyBzYXZlU2V0dGluZ3MoKXtcblx0XHRhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xuXHR9XG5cdGFzeW5jIG9ubG9hZCgpIHtcblx0XHRhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG5cdFx0Ly8gY29uc29sZS5sb2codGhpcy5zZXR0aW5ncyk7XG5cdFx0dGhpcy5hZGRSaWJib25JY29uKFwicGFwZXItcGxhbmVcIiwgXCJQcmludCB0byBjb25zb2xlXCIsIFxuXHRcdFx0XHRcdFx0XHQoKT0+e1xuXHRcdFx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShcInRlc3RpbmcgcGx1Z2luc1wiKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKCd0ZXN0aW5nIHBsdWdpbnMnKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQpXG5cdFx0dGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBJbkxpbmVBSVR1dG9yU2V0dGluZ3NUYWIodGhpcy5hcHAsIHRoaXMpKTtcblx0XHRcblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFt2aWV3UGx1Z2luRmFjdG9yeU1ldGhvZCh0aGlzKV0pXG5cblx0XHR0aGlzLmFkZENvbW1hbmQoe1xuXHRcdFx0aWQ6IFwic3VibWl0LWFpLXByb21wdFwiLFxuXHRcdFx0bmFtZTogXCJzdWJtaXQgdG8gdGhlIExMTVwiLFxuXHRcdFx0aG90a2V5czogW3sgXG5cdFx0XHRcdG1vZGlmaWVyczogW1wiTW9kXCIsXCJTaGlmdFwiXSwgXG5cdFx0XHRcdGtleTogXCJMXCJcblx0XHRcdH1dLFxuXHRcdFx0ZWRpdG9yQ2FsbGJhY2s6IGFzeW5jIChfZWRpdG9yLCB2aWV3KSA9PiB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdob3Qga2V5IGRldGVjdGVkJyk7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbkNoZWNrID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FpLXN1Ym1pdC1idXR0b24nKTtcblx0XHRcdFx0aWYgKGJ1dHRvbkNoZWNrID09PSBudWxsKSByZXR1cm47XG5cdFx0XHRcdC8vIGJ1dHRvbkNoZWNrLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblx0XHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0XHRjb25zdCBlZGl0b3JWaWV3ID0gdmlldy5lZGl0b3IuY20gYXMgRWRpdG9yVmlldztcblx0XHRcdFx0YXdhaXQgc3VibWl0VG9MTE0oZWRpdG9yVmlldywgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fSlcblx0fVxufSIsICJpbXBvcnQgdHlwZSBJbkxpbmVBSVR1dG9yUGx1Z2luIGZyb20gXCIuL21haW5cIjtcbmltcG9ydCB7QXBwLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nfSBmcm9tIFwib2JzaWRpYW5cIlxuXG4vLyBleHBvcnQgdHlwZSBBUElGcmFtZVdvcmsgPSBcImxtc3R1ZGlvXCIgfCBcIm9sbGFtYVwiIHwgXCJsbGFtYWNwcFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncyB7XG5cdGJhc2VVUkw6c3RyaW5nO1xuXHRtb2RlbE5hbWU6c3RyaW5nO1xuXHRmcmFtZXdvcms6c3RyaW5nO1xuXHRkZWZhdWx0Q29udGV4dDpzdHJpbmc7XG5cdC8vIGlubGluZUxMTUlkOnN0cmluZztcblx0Ly8gaW5saW5lTExNUmVzcG9uc2VJZDpzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NFVFRJTkdTOiBQYXJ0aWFsPEluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncz4gPSB7XG5cdGJhc2VVUkw6IFwiaHR0cDovLzEyNy4wLjAuMToxMjM0XCIsXG5cdG1vZGVsTmFtZTogXCJnb29nbGUvZ2VtbWEtNC0yNmItYTRiXCIsXG5cdGZyYW1ld29yazogXCJsbXN0dWRpb1wiLFxuXHRkZWZhdWx0Q29udGV4dDogXCJkb2NcIixcblx0Ly8gaW5saW5lTExNSWQ6IFwiYXNzaXN0YW50XCIsXG5cdC8vIGlubGluZUxMTVJlc3BvbnNlSWQ6XCJyZXNwb25zZVwiLFxufVxuZXhwb3J0IGNsYXNzIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWJ7XG5cdHBsdWdpbjogSW5MaW5lQUlUdXRvclBsdWdpbjtcblx0XG5cdGNvbnN0cnVjdG9yKGFwcDpBcHAsIHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luKXtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGxldCB7Y29udGFpbmVyRWx9ID0gdGhpcztcblx0XHRjb250YWluZXJFbC5lbXB0eSgpXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkFQSSBVUkxcIilcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHRcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImh0dHBzLy9leGFtcGxlLmNvbTpcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFzZVVSTClcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5iYXNlVVJMID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwibW9kZWwgaWRcIilcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHRcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImNvbXBhbnkvY29vbC1tb2RlbC0xYlwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblxuXHRcdC8vIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdC8vIFx0LnNldE5hbWUoXCJsbG0gYWN0aXZhdGlvbiBpZGVudGlmaWVyXCIpXG5cdFx0Ly8gXHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0Ly8gXHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJsbG1fYWN0aXZhdGUhXCIpXG5cdFx0Ly8gXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTUlkKVxuXHRcdC8vIFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHQvLyBcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTUlkID0gdmFsdWU7XG5cdFx0Ly8gXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHQvLyBcdFx0XHR9KVxuXHRcdC8vIFx0fSlcblxuXHRcdC8vIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdC8vIFx0LnNldE5hbWUoXCJsbG0gcmVzcG9uc2UgaWRlbnRpZmllclwiKVxuXHRcdC8vIFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdC8vIFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwiZWxlbWVudGFyeS13YXRzb25cIilcblx0XHQvLyBcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNUmVzcG9uc2VJZClcblx0XHQvLyBcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0Ly8gXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1SZXNwb25zZUlkID0gdmFsdWU7XG5cdFx0Ly8gXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHQvLyBcdFx0XHR9KVxuXHRcdC8vIFx0fSlcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJiYWNrZW5kXCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKT0+IHtcblx0XHRcdFx0ZHJvcGRvd25cblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwibG1zdHVkaW9cIiwgXCJMTS1TdHVkaW9cIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwibGxhbWFjcHBcIiwgXCJsbGFtYS5jcHBcIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwib2xsYW1hXCIsIFwib2xsYW1hXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZyYW1ld29yaylcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5mcmFtZXdvcmsgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJkZWZhdWx0IGNvbnRleHRcIilcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pPT4ge1xuXHRcdFx0XHRkcm9wZG93blxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJkb2NcIiwgXCJXaG9sZSBkb2N1bWVudFwiKVxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJpc29sYXRlZFwiLCBcIk5vIGRvY3VtZW50IGNvbnRleHRcIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwic2VjdGlvblwiLCBcImltbWVkaWF0ZSBzZWN0aW9uIG9ubHlcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGVmYXVsdENvbnRleHQpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZGVmYXVsdENvbnRleHQgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KVxuXG5cdH1cbn0iLCAiLy8gaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gJ0Bjb2RlbWlycm9yL2xhbmd1YWdlJztcbmltcG9ydCB7IFJhbmdlU2V0QnVpbGRlciB9IGZyb20gJ0Bjb2RlbWlycm9yL3N0YXRlJztcbmltcG9ydCB7cmVxdWVzdFVybCwgRWRpdG9yLCBOb3RpY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcbi8vIGltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCJidWZmZXJcIjtcbmltcG9ydCB7XG4gIERlY29yYXRpb24sXG4gIERlY29yYXRpb25TZXQsXG4gIEVkaXRvclZpZXcsXG4gIFBsdWdpblNwZWMsXG4gIFBsdWdpblZhbHVlLFxuICBWaWV3UGx1Z2luLFxuICBWaWV3VXBkYXRlLFxuICBXaWRnZXRUeXBlLFxufSBmcm9tICdAY29kZW1pcnJvci92aWV3JztcblxuaW1wb3J0IEluTGluZUFJVHV0b3JQbHVnaW4gZnJvbSAnLi9tYWluJztcbmltcG9ydCB7IGJlZm9yZSB9IGZyb20gJ25vZGU6dGVzdCc7XG5cbmNvbnN0IFNFUEFSQVRPUiA9IFwiLVwiLnJlcGVhdCgxMCk7XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGUodGltZXN0YW1wOm51bWJlcik6c3RyaW5ne1xuICBjb25zdCBtb250aE5hbWVzID0gW1wiamFuXCIsICdmZWInLCBcImFwclwiLCAnbWF5JywgJ2p1bicsICdqdWwnLFxuICAgICAgICAgICAgICBcImF1Z1wiLCBcInNlcFwiLCBcIm9jdFwiLCBcIm5vdlwiLCBcImRlY1wiXTtcbiAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHRpbWVzdGFtcCk7XG4gIGNvbnN0IGFkZFBhZGRpbmcgPSAobnVtOm51bWJlcik6IHN0cmluZyA9PiBudW0udG9TdHJpbmcoKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gIGNvbnN0IGhoID0gYWRkUGFkZGluZyhkYXRlLmdldEhvdXJzKCkpO1xuICBjb25zdCBtbSA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRNaW51dGVzKCkpO1xuICBjb25zdCBkYXkgPSBhZGRQYWRkaW5nKGRhdGUuZ2V0RGF0ZSgpKTtcbiAgY29uc3QgbW9udGggPSBtb250aE5hbWVzWyhkYXRlLmdldE1vbnRoKCkpLTFdO1xuICBjb25zdCB5ZWFyID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuXG4gIHJldHVybiBgJHtoaH06JHttbX0gJHtkYXl9ICR7bW9udGh9ICR7eWVhcn1gO1xufVxuXG5leHBvcnQgdHlwZSBtYXliZVN0cmluZyA9IHN0cmluZyB8IG51bGw7XG5cbmV4cG9ydCBjb25zdCBJTUFHRV9GSUxFX1RZUEVTID0gWydwbmcnLCAnanBnJywgJ2pwZWcnLCAnZ2lmJywgJ3dlYnAnLCAnYm1wJywgJ3N2ZyddXG5cbmFzeW5jIGZ1bmN0aW9uIGZvcm1hdFRleHRCbG9iKHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luLCB0ZXh0OnN0cmluZywgaWR4Om51bWJlcj0xKXtcbiAgLy8gY29uc3QgcmVnZXhQYXR0ZXJuOiBSZWdFeHAgPSBuZXcgUmVnRXhwKFwiXFwhXFxbXFxbKFtcXHdcXHMuXFwtX10rKVxcXVxcXVwiLCAnZycpO1xuICBjb25zdCBmaWxlID0gcGx1Z2luLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICBjb25zdCBzb3VyY2VQYXRoID0gZmlsZT8ucGF0aCBhcyBzdHJpbmc7XG4gIGNvbnN0IHJlZ2V4UGF0dGVybiA9IC9cXCFcXFtcXFsoW1xcd1xcc19cXC1dK1xcLlxcdyspXFxdXFxdfFxcIVxcWy4rXFxdXFwoKFtcXHdcXHNfXFwtXStcXC5cXHcrKVxcKS9nO1xuICBjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuICBjb25zdCBidWZmZXI6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGNvbnRlbnRBcnJheTpvYmplY3RbXSA9IFtdO1xuICBcbiAgbGV0IG51bWJlciA9IGlkeDtcbiAgbGV0IGludGVyaW1PYmo6b2JqZWN0fEFycmF5PG9iamVjdD47XG4gIFxuICAvLyB0ZXN0IHBhdHRlcm4gXG4gIC8vIGNvbnN0IHRleHRfID0gJyFbW1Bhc3RlZCBpbWFnZSAyMDI2MDUxNzA0MTQwNy5wbmddXSc7XG4gIC8vIGNvbnN0IHJlID0gLyFcXFtcXFsoW1xcd1xcc18tXStcXC5cXHcrKVxcXVxcXS9nO1xuICAvLyBjb25zb2xlLmxvZygndGVzdGluZyBwYXR0ZXJuJyk7XG4gIC8vIGZvciAoY29uc3QgbWF0Y2ggb2YgdGV4dF8ubWF0Y2hBbGwocmUpKSB7XG4gIC8vICAgY29uc29sZS5sb2cobWF0Y2hbMF0pOyAvLyB3aG9sZSAhW1suLi5dXVxuICAvLyAgIGNvbnNvbGUubG9nKG1hdGNoWzFdKTsgLy8gUGFzdGVkIGltYWdlIDIwMjYwNTE3MDQxNDA3LnBuZ1xuICAvLyB9XG4gIC8vIGNvbnNvbGUubG9nKFwiZW5kIG9mIHBhdHRlcm4gdGVzdFwiKVxuICAvLyB0ZXN0IHBhdHRlcm4gXG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5saW5lLm1hdGNoQWxsKHJlZ2V4UGF0dGVybildO1xuICAgIC8vIGNvbnNvbGUubG9nKFsuLi4nIVtbUGFzdGVkIGltYWdlIDIwMjYwNTE3MDQxNDA3LnBuZ11dJy5tYXRjaEFsbChyZWdleFBhdHRlcm4pXSk7XG4gICAgLy8gY29uc29sZS5sb2coXCJMSU5FOlwiLCBKU09OLnN0cmluZ2lmeShsaW5lKSlcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGg+MCl7XG4gICAgICAvLyBleHRyYWN0IGltYWdlLCBjb252ZXJ0IHRvIGJhc2VcbiAgICAgIGludGVyaW1PYmogPSBbXVxuICAgICAgZm9yKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpe1xuICAgICAgICBjb25zdCBtYXRjaGVkID0gbWF0Y2hbMV0gPz8gbWF0Y2hbMl07XG4gICAgICAgIGlmIChJTUFHRV9GSUxFX1RZUEVTLmNvbnRhaW5zKG1hdGNoZWQuc3BsaXQoJy4nKVsxXSkpe1xuICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHBsdWdpbi5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChtYXRjaGVkLCBzb3VyY2VQYXRoKTtcbiAgICAgICAgICBjb25zdCBpbWFnZVBhdGggPSB0YXJnZXQ/LnBhdGg7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJpbWFnZSBmb3VuZDogXCIsIGltYWdlUGF0aClcbiAgICAgICAgICBpZihpbWFnZVBhdGgpe1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHBsdWdpbi5hcHAudmF1bHQucmVhZEJpbmFyeSh0YXJnZXQpO1xuICAgICAgICAgICAgY29uc3QgZmlsZUJ1ZmZlciA9IEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSA/IGRhdGEgOiBCdWZmZXIuZnJvbShkYXRhIGFzIEFycmF5QnVmZmVyKTtcbiAgICAgICAgICAgIGNvbnN0IGltU3RyID0gYGRhdGE6aW1hZ2UvJHttYXRjaGVkLnNwbGl0KCcuJylbMV19O2Jhc2U2NCwke2ZpbGVCdWZmZXIudG9TdHJpbmcoXCJiYXNlNjRcIil9fWBcbiAgICAgICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgPHBvc2l0aW9uXyR7bnVtYmVyfT5gfSk7XG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcImltYWdlX3VybFwiLCBpbWFnZV91cmw6IHt1cmw6aW1TdHJ9fSk7XG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogYDwvcG9zaXRpb25fJHtudW1iZXJ9PmB9KTtcbiAgICAgICAgICAgIG51bWJlcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChsaW5lLnRyaW0oKT09PVwiXCIpe1xuICAgICAgICAvLyBtZXJnZSBidWZmZXJcbiAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGA8cG9zaXRpb25fJHtudW1iZXJ9PiR7YnVmZmVyLmpvaW4oXCJcXG5cIil9PHBvc2l0aW9uXyR7bnVtYmVyfWB9KTtcbiAgICAgICAgbnVtYmVyKys7XG4gICAgICAgIGJ1ZmZlci5sZW5ndGggPSAwO1xuICAgIH1cbiAgICBlbHNlIGlmIChsaW5lLnRyaW0oKSE9PVwiXCIpe1xuICAgICAgLy8gYWRkIHRvIGJ1ZmZlclxuICAgICAgYnVmZmVyLnB1c2gobGluZSk7XG4gICAgfVxuICAgIC8vIGFkZCBwb3NpdGlvbiBudW1iZXIgYW5kIGFwcGVuZCB0aGUgbWVzc2FnZSB0byB0aGUgY29udGVudCBhcnJheS5cbiAgfVxuXG4gIHJldHVybiB7Y29udGVudEFycmF5LCBudW1iZXJ9XG59XG5mdW5jdGlvbiBnZXRRdWVyeUNvbnRleHQodmlldzpFZGl0b3JWaWV3LCBiZWZvcmVMaW5lOm51bWJlciwgYWZ0ZXJMaW5lOm51bWJlciwgc2VjdGlvbk9ubHk6Ym9vbGVhbj1mYWxzZSlcbjp7YmVmb3JlVGV4dDpzdHJpbmcsIGFmdGVyVGV4dDpzdHJpbmd9ICB7XG4gIFxuICBsZXQgbnVtYmVyID0gYmVmb3JlTGluZTtcbiAgY29uc3QgYmVmb3JlTGluZXMgPSBbXTtcbiAgd2hpbGUgKG51bWJlciA+IDApe1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgaWYgKHNlY3Rpb25Pbmx5ICYmIChsaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYmVmb3JlTGluZXMudW5zaGlmdChsaW5lLnRleHQpO1xuICAgIG51bWJlci0tO1xuICB9XG5cbiAgbnVtYmVyID0gYWZ0ZXJMaW5lO1xuICBjb25zdCBhZnRlckxpbmVzID0gW107XG4gIHdoaWxlIChudW1iZXIgPCB2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICBpZiAoc2VjdGlvbk9ubHkgJiYgKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSl7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBhZnRlckxpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICBudW1iZXIrKztcbiAgfVxuICBcblxuICBjb25zdCBiZWZvcmVUZXh0ID0gYmVmb3JlTGluZXMuam9pbignXFxuJylcbiAgY29uc3QgYWZ0ZXJUZXh0ID0gYWZ0ZXJMaW5lcy5qb2luKCdcXG4nKVxuXG4gIC8vIGNvbnNvbGUubG9nKFwiQkVGT1JFIFRFWFQ6XCIsIGJlZm9yZVRleHQpO1xuICAvLyBjb25zb2xlLmxvZyhcIkFGVEVSIFRFWFQ6XCIsIGFmdGVyVGV4dCk7XG4gIHJldHVybiB7YmVmb3JlVGV4dCwgYWZ0ZXJUZXh0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3VibWl0VG9MTE0odmlldzpFZGl0b3JWaWV3LCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG4gICAgLy8gY29uc29sZS5sb2coXCJzdWJtaXR0aW5nIHNvbWV0aGluZyFcIik7XG4gICAgLy8gbmV3IE5vdGljZShcInN1Ym1pdHRpbmcgdG8gTExNXCIpO1xuICAgIGNvbnN0IHN1Ym1pdFRpbWUgPSBmb3JtYXREYXRlKERhdGUubm93KCkpO1xuICAgIGNvbnN0IHtjb250ZW50LCBiZWZvcmVMaW5lLCBhZnRlckxpbmV9ID0gZ2V0TExNcXVlcnkodmlldyk7XG4gICAgY29uc29sZS5sb2coXCJzdWJtaXR0ZWQgYXQ6XCIsIHN1Ym1pdFRpbWUpO1xuICAgIGNvbnNvbGUubG9nKGNvbnRlbnQpO1xuICAgIFxuICAgIGNvbnN0IGRlZmF1bHRUeXBlID0gcGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0O1xuICAgIGNvbnN0IGZpcnN0V29yZCA9IGNvbnRlbnQuc3BsaXQoXCIgXCIpWzBdO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBmaXJzdFdvcmQuc3BsaXQoXCI6XCIpLnNsaWNlKDEsIHVuZGVmaW5lZCk7XG4gICAgLy8gbGV0IGFuc3dlcjpzdHJpbmc7XG4gICAgbGV0IGJlZm9yZVRleHQ6IG1heWJlU3RyaW5nPW51bGwsIGFmdGVyVGV4dDogbWF5YmVTdHJpbmc9bnVsbDtcblxuICAgIGlmKG9wdGlvbnMuY29udGFpbnMoJ2lzb2xhdGVkJyl8fCgoZGVmYXVsdFR5cGU9PT1cImlzb2xhdGVkXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKSl7XG4gICAgICBiZWZvcmVUZXh0ID0gbnVsbDtcbiAgICAgIGFmdGVyVGV4dCA9IG51bGw7XG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJkb2NcIil8fChkZWZhdWx0VHlwZT09PVwiZG9jXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICAgIFxuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNvbnRhaW5zKFwic2VjdGlvblwiKXx8KGRlZmF1bHRUeXBlPT09XCJzZWN0aW9uXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lLCB0cnVlKTtcbiAgICAgIC8vIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICB9XG4gICAgXG4gICAgLy8gICAgICAgY3VybCBodHRwOi8vbG9jYWxob3N0OjEyMzQvYXBpL3YxL2NoYXQgXFxcbiAgICAvLyAgIC1IIFwiQ29udGVudC1UeXBlOiBhcHBsaWNhdGlvbi9qc29uXCIgXFxcbiAgICAvLyAgIC1kICd7XG4gICAgLy8gICAgIFwibW9kZWxcIjogXCJnb29nbGUvZ2VtbWEtNC0yNmItYTRiXCIsXG4gICAgLy8gICAgIFwic3lzdGVtX3Byb21wdFwiOiBcIllvdSBhbnN3ZXIgb25seSBpbiByaHltZXMuXCIsXG4gICAgLy8gICAgIFwiaW5wdXRcIjogXCJXaGF0IGlzIHlvdXIgZmF2b3JpdGUgY29sb3I/XCJcbiAgICAvLyB9J1xuICAgIGNvbnN0IGFuc3dlciA9IGF3YWl0IHBpbmdMTE0ocGx1Z2luLCBjb250ZW50LCBiZWZvcmVUZXh0LCBhZnRlclRleHQpO1xuICAgIGlmKGFuc3dlcil7XG4gICAgICBuZXcgTm90aWNlKFwiUmVzcG9uc2UgcmVjZWl2ZWQhXCIpXG4gICAgICBjb25zb2xlLmxvZyhhbnN3ZXIpO1xuICAgICAgY29uc3QgcmVjZWl2ZVRpbWUgPSBmb3JtYXREYXRlKERhdGUubm93KCkpO1xuICAgICAgY29uc29sZS5sb2coXCJyZWNlaXZlZCBhdDpcIiwgcmVjZWl2ZVRpbWUpO1xuICAgIFxuICAgICAgYXBwZW5kQW5zd2VyKHZpZXcsIGFuc3dlciwgc3VibWl0VGltZSwgcmVjZWl2ZVRpbWUpO1xuICAgIH1cbiAgICBlbHNle1xuICAgICAgbmV3IE5vdGljZShcIkNhbGwgZmFpbGVkXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBlbmRBbnN3ZXIodmlldzpFZGl0b3JWaWV3LCB0ZXh0OnN0cmluZywgc3VibWl0VGltZTpzdHJpbmcsIHJlY2VpdmVUaW1lOnN0cmluZyl7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIHdoaWxlIChjdXJyTGluZS5udW1iZXI8dmlldy5zdGF0ZS5kb2MubGluZXMpe1xuICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlciArIDEpO1xuICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpPT09XCJcIil7XG4gICAgICAgIGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShjdXJyTGluZS5udW1iZXItMSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjpjdXJyTGluZS50b30sXG4gICAgICBzY3JvbGxJbnRvVmlldzp0cnVlXG4gICAgfSlcblxuICAgIGNvbnN0IGZvcm1hdHRlZFRleHQgPSBgIChzdWJtaXR0ZWQgYXQgJHtzdWJtaXRUaW1lfSlcXG4qKkByZXNwb25zZSoqICR7dGV4dH0gKHJlc3BvbmRlZCBhdCAke3JlY2VpdmVUaW1lfSlcXG5cXG5gXG4gICAgdmlldy5kaXNwYXRjaCh7XG4gICAgICAgIGNoYW5nZXM6IHtmcm9tOmN1cnJMaW5lLnRvLCBpbnNlcnQ6IGZvcm1hdHRlZFRleHR9LFxuICAgICAgICBzZWxlY3Rpb246IHthbmNob3I6IGN1cnJMaW5lLnRvK2Zvcm1hdHRlZFRleHQubGVuZ3RofVxuICAgIH0pXG59XG5hc3luYyBmdW5jdGlvbiBwaW5nTExNKHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luLCBxdWVyeTpzdHJpbmcsIGJlZm9yZVRleHQ6bWF5YmVTdHJpbmcsIGFmdGVyVGV4dDptYXliZVN0cmluZyk6UHJvbWlzZTxzdHJpbmd8bnVsbD57XG4gICAgY29uc3QgYmFzZV91cmwgPSBwbHVnaW4uc2V0dGluZ3MuYmFzZVVSTDtcbiAgICBjb25zdCB1cmwgPSBgJHtiYXNlX3VybH0vdjEvY2hhdC9jb21wbGV0aW9uc2A7XG4gICAgY29uc3QgbW9kZWwgPSBwbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xuICAgIGNvbnN0IHN5c3RlbV9wcm9tcHQgPSBcIllvdSBhcmUgYSBjb25jaXNlIGFuZCBzdWNjaW5jdCBhc3Npc3RhbnQgb3BlcmF0aW5nIGluc2lkZSBPYnNpZGlhbi5NRCwgYSBzcGVjaWFsaXplZCBub3RlIHRha2luZyBhcHAuXCI7XG4gICAgXG4gICAgY29uc3QgbWV0aG9kID0gXCJQT1NUXCI7XG5cbiAgICAvLyBjb25zb2xlLmxvZygnYmVmb3JlIHRleHQnLCBiZWZvcmVUZXh0KTtcbiAgICAvLyBjb25zb2xlLmxvZygnYWZ0ZXIgdGV4dCcsIGFmdGVyVGV4dCk7XG4gICAgbGV0IGJlZkFycmF5Rm9ybWF0dGVkOm9iamVjdFtdPVtdLCBhZnRBcnJheUZvcm1hdHRlZDpvYmplY3RbXT1bXSwgbnVtOm51bWJlcj0wO1xuICAgIFxuICAgIGlmIChiZWZvcmVUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBiZWZvcmVUZXh0LCBudW0pO1xuICAgICAgbnVtID0gbnVtYmVyO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQgPSBjb250ZW50QXJyYXk7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZC51bnNoaWZ0KFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQucHVzaChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gY29uc29sZS5sb2coJ0JFRk9SRSBDT05URU5UJywgYmVmQXJyYXlGb3JtYXR0ZWQpO1xuICAgIGNvbnN0IGFjdGl2ZV9udW0gPSBudW07XG4gICAgbnVtKys7XG4gICAgXG4gICAgaWYgKGFmdGVyVGV4dCl7XG4gICAgICBsZXQge2NvbnRlbnRBcnJheSwgbnVtYmVyfSA9IGF3YWl0IGZvcm1hdFRleHRCbG9iKHBsdWdpbiwgYWZ0ZXJUZXh0LCBudW0pO1xuICAgICAgbnVtID0gbnVtYmVyO1xuICAgICAgYWZ0QXJyYXlGb3JtYXR0ZWQgPSBjb250ZW50QXJyYXk7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZC51bnNoaWZ0KFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgICAgYWZ0QXJyYXlGb3JtYXR0ZWQucHVzaChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gY29uc29sZS5sb2coJ0FGVEVSIENPTlRFTlQnLCBhZnRBcnJheUZvcm1hdHRlZCk7XG4gICAgLy8gY29uc3QgYmVmb3JlVGV4dCA9IGAke3NlcGFyYXRvcn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBBQk9WRSBRVUVSWSAke3NlcGFyYXRvcn1cXG4ke2JlZm9yZUxpbmVzLmpvaW4oXCJcXG5cIil9XFxuJHtzZXBhcmF0b3J9IEVORCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7c2VwYXJhdG9yfVxcbmA7XG4gICAgLy8gY29uc3QgYWZ0ZXJUZXh0ICA9IGAke3NlcGFyYXRvcn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke3NlcGFyYXRvcn1cXG4ke2FmdGVyTGluZXMuam9pbihcIlxcblwiKX1cXG4ke3NlcGFyYXRvcn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtzZXBhcmF0b3J9XFxuYDs7XG5cbiAgICBjb25zb2xlLmxvZygncXVlcnknLCBxdWVyeSlcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgICB1cmwsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBcIkJlYXJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtb2RlbCxcbiAgICAgICAgICBtZXNzYWdlczogW1xuICAgICAgICAgICAge3JvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHN5c3RlbV9wcm9tcHR9LFxuICAgICAgICAgICAge3JvbGU6IFwidXNlclwiLCBcbiAgICAgICAgICAgICAgY29udGVudDogW1xuICAgICAgICAgICAgICAgIC8vIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYmVmb3JlVGV4dCA/PyBcIlxcblwifSxcbiAgICAgICAgICAgICAgICAuLi5iZWZBcnJheUZvcm1hdHRlZCxcbiAgICAgICAgICAgICAgICB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGA8cG9zaXRpb25fJHthY3RpdmVfbnVtfT4gKlRoaXMgaXMgdGhlIHBvc2l0aW9uIG9mIHRoZSB1c2VyIHF1ZXN0aW9uL3Byb21wdCBjdXJyZW50bHkgcG9zZWQgdG8geW91KiA8L3Bvc2l0aW9uXyR7YWN0aXZlX251bX0+YH0sXG4gICAgICAgICAgICAgICAgLy8ge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBhZnRlclRleHQgID8/IFwiXFxuXCJ9LFxuICAgICAgICAgICAgICAgIC4uLmFmdEFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYGN1cnJlbnQgdXNlciBwcm9tcHQ6ICR7cXVlcnkuc3BsaXQoXCIgXCIpLnNsaWNlKDEsIHVuZGVmaW5lZCkuam9pbihcIiBcIil9YH0sXG4gICAgICAgICAgICAgIF19XG4gICAgICAgICAgXSxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTowLjksXG4gICAgICAgIH0pXG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFVybChwYXlsb2FkKTtcbiAgcmV0dXJuIHJlc3BvbnNlLmpzb24uY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50ID8/IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldExMTXF1ZXJ5KHZpZXc6RWRpdG9yVmlldykge1xuICAgIGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uaGVhZDtcbiAgICBjb25zdCBhbGxMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgXG4gICAgY29uc3QgbnVtTGluZXMgPSB2aWV3LnN0YXRlLmRvYy5saW5lcztcbiAgICBsZXQgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgYWxsTGluZXMucHVzaChsaW5lLnRleHQpO1xuICAgIFxuICAgIGxldCBiZWZvcmVMaW5lOm51bWJlcj0xMDAwMDA7XG4gICAgbGV0IGFmdGVyTGluZTpudW1iZXI9MDtcblxuICAgIHdoaWxlKG51bWJlcj4xKXtcbiAgICAgIG51bWJlci0tO1xuICAgICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpID09PSBcIlwiKXtcbiAgICAgICAgLy8gY29uc29sZS5sb2coJ2JyZWFraW5nIHBvaW50JylcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBlbHNle1xuICAgICAgICAvLyBjb25zb2xlLmxvZyhgbGluZV9xTm86ICR7bnVtYmVyfSBsaW5lOiAke2N1cnJMaW5lLm51bWJlcn1gLCBcInRleHQ6IFwiLCBjdXJyTGluZS50ZXh0KVxuICAgICAgICBhbGxMaW5lcy51bnNoaWZ0KGN1cnJMaW5lLnRleHQpO1xuICAgICAgfVxuICAgIH1cbiAgICBiZWZvcmVMaW5lPW51bWJlcjtcbiAgICBcbiAgICBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICB3aGlsZShudW1iZXI8KG51bUxpbmVzLTEpKXtcbiAgICAgIG51bWJlcisrO1xuICAgICAgY29uc3QgbmV4dExpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICBpZiAobmV4dExpbmUgJiYgKG5leHRMaW5lPy50ZXh0LnRyaW0oKSAhPT0gXCJcIikpe1xuICAgICAgICBhbGxMaW5lcy5wdXNoKG5leHRMaW5lLnRleHQpXG4gICAgICB9XG4gICAgICBlbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgYWZ0ZXJMaW5lPW51bWJlcjtcbiAgICByZXR1cm4ge2NvbnRlbnQ6IGFsbExpbmVzLmpvaW4oXCJcXG5cIiksIGJlZm9yZUxpbmUsIGFmdGVyTGluZX1cblxufVxuXG4vLyBpbXBvcnQgeyBFbW9qaVdpZGdldCB9IGZyb20gJ2Vtb2ppJztcbmV4cG9ydCBjbGFzcyBJbmxpbmVBSVdpZGdldCBleHRlbmRzIFdpZGdldFR5cGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogSW5MaW5lQUlUdXRvclBsdWdpbixcbiAgICBwcml2YXRlIHZpZXc6IEVkaXRvclZpZXcsXG4gICAgcHJpdmF0ZSBmcm9tOiBudW1iZXIsXG4gICAgcHJpdmF0ZSB0bzogbnVtYmVyLFxuICApe1xuICAgIHN1cGVyKClcbiAgfVxuICBcbiAgZXEob3RoZXI6IElubGluZUFJV2lkZ2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuZnJvbSA9PT0gb3RoZXIuZnJvbSAmJiB0aGlzLnRvID09PSBvdGhlci50bztcbiAgfVxuXG4gIHRvRE9NKHZpZXc6RWRpdG9yVmlldyk6SFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IHF1ZXJ5V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGJ1dHRvbi5pbm5lclRleHQgPSBcInN1Ym1pdFwiO1xuICAgIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnMHB4JztcbiAgICBidXR0b24uaWQgPSBcImFpLXN1Ym1pdC1idXR0b25cIlxuICAgIFxuICAgIGJ1dHRvbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBzdWJtaXRUb0xMTSh0aGlzLnZpZXcsIHRoaXMucGx1Z2luKTtcbiAgICAgICAgLy8gYnV0dG9uLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9O1xuICAgIHF1ZXJ5V3JhcHBlci5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIHJldHVybiBxdWVyeVdyYXBwZXI7XG4gIH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gdmlld1BsdWdpbkZhY3RvcnlNZXRob2QoX3BsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luKXtcbiAgY2xhc3MgSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4gaW1wbGVtZW50cyBQbHVnaW5WYWx1ZSB7XG4gICAgZGVjb3JhdGlvbnM6IERlY29yYXRpb25TZXQ7XG4gICAgcGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luO1xuXG4gICAgY29uc3RydWN0b3IodmlldzogRWRpdG9yVmlldykge1xuICAgICAgdGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuYnVpbGREZWNvcmF0aW9ucyh2aWV3KTtcbiAgICAgIHRoaXMucGx1Z2luID0gX3BsdWdpbjtcbiAgICB9XG5cbiAgICB1cGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XG4gICAgICBpZiAodXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnZpZXdwb3J0Q2hhbmdlZCkge1xuICAgICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHVwZGF0ZS52aWV3KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkZXN0cm95KCkge31cblxuICAgIGJ1aWxkRGVjb3JhdGlvbnModmlldzogRWRpdG9yVmlldyk6IERlY29yYXRpb25TZXQge1xuICAgICAgY29uc3QgYnVpbGRlciA9IG5ldyBSYW5nZVNldEJ1aWxkZXI8RGVjb3JhdGlvbj4oKTtcblxuICAgICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgICAgXG4gICAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgICBsZXQgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgICAvLyBjb25zb2xlLmxvZygnc3RhcnQgbnVtYmVyOiAnLCBudW1iZXIpXG4gICAgICAvLyBjb25zb2xlLmxvZygnY3VycmVudCBsaW5lIGlzOicsIGxpbmUudGV4dClcbiAgICAgIFxuICAgICAgY29uc3QgcGFyYUxpbmVzOiBzdHJpbmdbXSA9IFtdXG4gICAgICBwYXJhTGluZXMucHVzaChsaW5lLnRleHQpXG4gICAgICB3aGlsZShudW1iZXI+MSl7XG4gICAgICAgIG51bWJlci0tO1xuICAgICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICAgIGlmIChjdXJyTGluZS50ZXh0LnRyaW0oKSA9PT0gXCJcIil7XG4gICAgICAgICAgLy8gY29uc29sZS5sb2coJ2JyZWFraW5nIHBvaW50JylcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNle1xuICAgICAgICAgIC8vIGNvbnNvbGUubG9nKGBsaW5lX3FObzogJHtudW1iZXJ9IGxpbmU6ICR7Y3VyckxpbmUubnVtYmVyfWAsIFwidGV4dDogXCIsIGN1cnJMaW5lLnRleHQpXG4gICAgICAgICAgcGFyYUxpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgcGFyYVRleHQgPSBwYXJhTGluZXMuam9pbignXFxuJyk7XG4gICAgICBcbiAgICAgIC8vIGNvbnNvbGUubG9nKFwicGFyYVRleHQ6IFwiLCBwYXJhVGV4dClcbiAgICAgIFxuICAgICAgY29uc3QgcHJldkxpbmUgPSBsaW5lLm51bWJlciA+IDEgPyB2aWV3LnN0YXRlLmRvYy5saW5lKGxpbmUubnVtYmVyLTEpOiBudWxsO1xuICAgICAgLy8gY29uc29sZS5sb2coXCJwcmV2aW91cyBsaW5lOiBcIiwgcHJldkxpbmU/LnRleHQpO1xuICAgICAgXG4gICAgICBpZihsaW5lLnRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgKGxpbmUubnVtYmVyID4gMSkgJiYgKHByZXZMaW5lPy50ZXh0LnRyaW0oKSAhPT0gXCJcIikpe1xuICAgICAgICAvLyB0aGlzIGNvbmRpdGlvbiBtZWFucyB0aGF0IGl0IGlzIG5vdCB0aGUgZmlyc3QgbGluZSBhbmQgaXQgaXMgbm90IGEgcGFyYWdyYXBoIGJ5IGl0c2VsZi5cbiAgICAgICAgY29uc29sZS5sb2coXCJ3aWxsIG5lZWQgdG8gYWRkIGEgbGluZSBicmVha1wiKVxuICAgICAgICBjb25zdCBpbnNlcnRpb25TdHIgPSBcIlxcblwiXG4gICAgICAgIHNldFRpbWVvdXQoKCk9Pnt2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgICBjaGFuZ2VzOiB7ZnJvbTpsaW5lLmZyb20sIGluc2VydDogaW5zZXJ0aW9uU3RyfSxcbiAgICAgICAgICBzZWxlY3Rpb246IHthbmNob3I6IGxpbmUudG8raW5zZXJ0aW9uU3RyLmxlbmd0aH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKHBhcmFUZXh0LnN0YXJ0c1dpdGgoXCJAYXNzaXN0YW50XCIpICYmICEocGFyYVRleHQuY29udGFpbnMoXCJAcmVzcG9uc2VcIikpKXtcbiAgICAgICAgYnVpbGRlci5hZGQobGluZS50bywgbGluZS50bywgXG4gICAgICAgICAgRGVjb3JhdGlvbi53aWRnZXQoXG4gICAgICAgICAgICB7d2lkZ2V0OiBuZXcgSW5saW5lQUlXaWRnZXQodGhpcy5wbHVnaW4sIHZpZXcsIGxpbmUudG8sIGxpbmUudG8pLCBzaWRlOiAxfVxuICAgICAgICAgICkpXG4gICAgICB9XG4gICAgICByZXR1cm4gYnVpbGRlci5maW5pc2goKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwbHVnaW5TcGVjOiBQbHVnaW5TcGVjPElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luPiA9IHtcbiAgICBkZWNvcmF0aW9uczogKHZhbHVlOiBJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbikgPT4gdmFsdWUuZGVjb3JhdGlvbnMsXG4gIH07XG5cbiAgY29uc3QgaW5saW5lQUlBSVBsdWdpbiA9IFZpZXdQbHVnaW4uZnJvbUNsYXNzKFxuICAgIElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luLFxuICAgIHBsdWdpblNwZWNcbiAgKTtcblxucmV0dXJuIGlubGluZUFJQUlQbHVnaW5cbn0iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBQUFBLG1CQUFxRTs7O0FDQ3JFLHNCQUE2QztBQWF0QyxJQUFNLG1CQUF5RDtBQUFBLEVBQ3JFLFNBQVM7QUFBQSxFQUNULFdBQVc7QUFBQSxFQUNYLFdBQVc7QUFBQSxFQUNYLGdCQUFnQjtBQUFBO0FBQUE7QUFHakI7QUFDTyxJQUFNLDJCQUFOLGNBQXVDLGlDQUFnQjtBQUFBLEVBRzdELFlBQVksS0FBUyxRQUEyQjtBQUMvQyxVQUFNLEtBQUssTUFBTTtBQUNqQixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFFBQUksRUFBQyxZQUFXLElBQUk7QUFDcEIsZ0JBQVksTUFBTTtBQUVsQixRQUFJLHdCQUFRLFdBQVcsRUFDckIsUUFBUSxTQUFTLEVBQ2pCLFFBQVEsQ0FBQyxTQUFRO0FBQ2pCLFdBQUssZUFBZSxxQkFBcUIsRUFDdkMsU0FBUyxLQUFLLE9BQU8sU0FBUyxPQUFPLEVBQ3JDLFNBQVMsT0FBTyxVQUFVO0FBQzFCLGFBQUssT0FBTyxTQUFTLFVBQVU7QUFDL0IsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLE1BQ2hDLENBQUM7QUFBQSxJQUNILENBQUM7QUFFRixRQUFJLHdCQUFRLFdBQVcsRUFDckIsUUFBUSxVQUFVLEVBQ2xCLFFBQVEsQ0FBQyxTQUFRO0FBQ2pCLFdBQUssZUFBZSx1QkFBdUIsRUFDekMsU0FBUyxLQUFLLE9BQU8sU0FBUyxTQUFTLEVBQ3ZDLFNBQVMsT0FBTyxVQUFnQjtBQUNoQyxhQUFLLE9BQU8sU0FBUyxZQUFZO0FBQ2pDLGNB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QUFBQSxZQUNULEVBQUMsUUFBUSxJQUFJLGVBQWUsS0FBSyxRQUFRLE1BQU0sS0FBSyxJQUFJLEtBQUssRUFBRSxHQUFHLE1BQU0sRUFBQztBQUFBLFVBQzNFO0FBQUEsUUFBQztBQUFBLE1BQ0w7QUFDQSxhQUFPLFFBQVEsT0FBTztBQUFBLElBQ3hCO0FBQUEsRUFDRjtBQUVBLFFBQU0sYUFBcUQ7QUFBQSxJQUN6RCxhQUFhLENBQUMsVUFBc0MsTUFBTTtBQUFBLEVBQzVEO0FBRUEsUUFBTSxtQkFBbUIsdUJBQVc7QUFBQSxJQUNsQztBQUFBLElBQ0E7QUFBQSxFQUNGO0FBRUYsU0FBTztBQUNQOzs7QUYvYUEsSUFBcUIsc0JBQXJCLGNBQWlELHdCQUFPO0FBQUEsRUFHdkQsTUFBTSxlQUFjO0FBQ25CLFNBQUssV0FBVyxPQUFPLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixNQUFNLEtBQUssU0FBUyxDQUFDO0FBQUEsRUFDMUU7QUFBQSxFQUVBLE1BQU0sZUFBYztBQUNuQixVQUFNLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBQ0EsTUFBTSxTQUFTO0FBQ2QsVUFBTSxLQUFLLGFBQWE7QUFHeEIsU0FBSztBQUFBLE1BQWM7QUFBQSxNQUFlO0FBQUEsTUFDN0IsTUFBSTtBQUNGLFlBQUksd0JBQU8saUJBQWlCO0FBQzVCLGdCQUFRLElBQUksaUJBQWlCO0FBQUEsTUFDOUI7QUFBQSxJQUNGO0FBQ0osU0FBSyxjQUFjLElBQUkseUJBQXlCLEtBQUssS0FBSyxJQUFJLENBQUM7QUFFL0QsU0FBSyx3QkFBd0IsQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLENBQUM7QUFFNUQsU0FBSyxXQUFXO0FBQUEsTUFDZixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULFdBQVcsQ0FBQyxPQUFNLE9BQU87QUFBQSxRQUN6QixLQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsTUFDRCxnQkFBZ0IsT0FBTyxTQUFTLFNBQVM7QUFFeEMsY0FBTSxjQUFjLFNBQVMsZUFBZSxrQkFBa0I7QUFDOUQsWUFBSSxnQkFBZ0IsS0FBTTtBQUcxQixjQUFNLGFBQWEsS0FBSyxPQUFPO0FBQy9CLGNBQU0sWUFBWSxZQUFZLElBQUk7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiJdCn0K
