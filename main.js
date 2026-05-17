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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3M6SW5MaW5lQUlUdXRvclBsdWdpblNldHRpbmdzO1xuXG5cdGFzeW5jIGxvYWRTZXR0aW5ncygpe1xuXHRcdHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpXG5cdH1cblx0XG5cdGFzeW5jIHNhdmVTZXR0aW5ncygpe1xuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG5cdH1cblx0YXN5bmMgb25sb2FkKCkge1xuXHRcdGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG5cblx0XHQvLyBjb25zb2xlLmxvZyh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLmFkZFJpYmJvbkljb24oXCJwYXBlci1wbGFuZVwiLCBcIlByaW50IHRvIGNvbnNvbGVcIiwgXG5cdFx0XHRcdFx0XHRcdCgpPT57XG5cdFx0XHRcdFx0XHRcdFx0XHRuZXcgTm90aWNlKFwidGVzdGluZyBwbHVnaW5zXCIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coJ3Rlc3RpbmcgcGx1Z2lucycpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdClcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXHRcdFxuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oW3ZpZXdQbHVnaW5GYWN0b3J5TWV0aG9kKHRoaXMpXSlcblxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJzdWJtaXQtYWktcHJvbXB0XCIsXG5cdFx0XHRuYW1lOiBcInN1Ym1pdCB0byB0aGUgTExNXCIsXG5cdFx0XHRob3RrZXlzOiBbeyBcblx0XHRcdFx0bW9kaWZpZXJzOiBbXCJNb2RcIixcIlNoaWZ0XCJdLCBcblx0XHRcdFx0a2V5OiBcIkxcIlxuXHRcdFx0fV0sXG5cdFx0XHRlZGl0b3JDYWxsYmFjazogYXN5bmMgKF9lZGl0b3IsIHZpZXcpID0+IHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ2hvdCBrZXkgZGV0ZWN0ZWQnKTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uQ2hlY2sgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWktc3VibWl0LWJ1dHRvbicpO1xuXHRcdFx0XHRpZiAoYnV0dG9uQ2hlY2sgPT09IG51bGwpIHJldHVybjtcblx0XHRcdFx0Ly8gYnV0dG9uQ2hlY2suc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdGNvbnN0IGVkaXRvclZpZXcgPSB2aWV3LmVkaXRvci5jbSBhcyBFZGl0b3JWaWV3O1xuXHRcdFx0XHRhd2FpdCBzdWJtaXRUb0xMTShlZGl0b3JWaWV3LCB0aGlzKTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG59IiwgImltcG9ydCB0eXBlIEluTGluZUFJVHV0b3JQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHtBcHAsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmd9IGZyb20gXCJvYnNpZGlhblwiXG5cbi8vIGV4cG9ydCB0eXBlIEFQSUZyYW1lV29yayA9IFwibG1zdHVkaW9cIiB8IFwib2xsYW1hXCIgfCBcImxsYW1hY3BwXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5MaW5lQUlUdXRvclBsdWdpblNldHRpbmdzIHtcblx0YmFzZVVSTDpzdHJpbmc7XG5cdG1vZGVsTmFtZTpzdHJpbmc7XG5cdGZyYW1ld29yazpzdHJpbmc7XG5cdGRlZmF1bHRDb250ZXh0OnN0cmluZztcblx0Ly8gaW5saW5lTExNSWQ6c3RyaW5nO1xuXHQvLyBpbmxpbmVMTE1SZXNwb25zZUlkOnN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFBhcnRpYWw8SW5MaW5lQUlUdXRvclBsdWdpblNldHRpbmdzPiA9IHtcblx0YmFzZVVSTDogXCJodHRwOi8vMTI3LjAuMC4xOjEyMzRcIixcblx0bW9kZWxOYW1lOiBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIixcblx0ZnJhbWV3b3JrOiBcImxtc3R1ZGlvXCIsXG5cdGRlZmF1bHRDb250ZXh0OiBcImRvY1wiLFxuXHQvLyBpbmxpbmVMTE1JZDogXCJhc3Npc3RhbnRcIixcblx0Ly8gaW5saW5lTExNUmVzcG9uc2VJZDpcInJlc3BvbnNlXCIsXG59XG5leHBvcnQgY2xhc3MgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYntcblx0cGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luO1xuXHRcblx0Y29uc3RydWN0b3IoYXBwOkFwcCwgcGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4pe1xuXHRcdHN1cGVyKGFwcCwgcGx1Z2luKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdGRpc3BsYXkoKTogdm9pZCB7XG5cdFx0bGV0IHtjb250YWluZXJFbH0gPSB0aGlzO1xuXHRcdGNvbnRhaW5lckVsLmVtcHR5KClcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiQVBJIFVSTFwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwiaHR0cHMvL2V4YW1wbGUuY29tOlwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5iYXNlVVJMKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmJhc2VVUkwgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJtb2RlbCBpZFwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwiY29tcGFueS9jb29sLW1vZGVsLTFiXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSlcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KVxuXG5cdFx0Ly8gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0Ly8gXHQuc2V0TmFtZShcImxsbSBhY3RpdmF0aW9uIGlkZW50aWZpZXJcIilcblx0XHQvLyBcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHQvLyBcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImxsbV9hY3RpdmF0ZSFcIilcblx0XHQvLyBcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNSWQpXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNSWQgPSB2YWx1ZTtcblx0XHQvLyBcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdC8vIFx0XHRcdH0pXG5cdFx0Ly8gXHR9KVxuXG5cdFx0Ly8gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0Ly8gXHQuc2V0TmFtZShcImxsbSByZXNwb25zZSBpZGVudGlmaWVyXCIpXG5cdFx0Ly8gXHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0Ly8gXHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJlbGVtZW50YXJ5LXdhdHNvblwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1SZXNwb25zZUlkKVxuXHRcdC8vIFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHQvLyBcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTVJlc3BvbnNlSWQgPSB2YWx1ZTtcblx0XHQvLyBcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdC8vIFx0XHRcdH0pXG5cdFx0Ly8gXHR9KVxuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcImJhY2tlbmRcIilcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pPT4ge1xuXHRcdFx0XHRkcm9wZG93blxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJsbXN0dWRpb1wiLCBcIkxNLVN0dWRpb1wiKVxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJsbGFtYWNwcFwiLCBcImxsYW1hLmNwcFwiKVxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJvbGxhbWFcIiwgXCJvbGxhbWFcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZnJhbWV3b3JrKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmZyYW1ld29yayA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcImRlZmF1bHQgY29udGV4dFwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bik9PiB7XG5cdFx0XHRcdGRyb3Bkb3duXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImRvY1wiLCBcIldob2xlIGRvY3VtZW50XCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImlzb2xhdGVkXCIsIFwiTm8gZG9jdW1lbnQgY29udGV4dFwiKVxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJzZWN0aW9uXCIsIFwiaW1tZWRpYXRlIHNlY3Rpb24gb25seVwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0Q29udGV4dClcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0Q29udGV4dCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0fVxufSIsICIvLyBpbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSAnQGNvZGVtaXJyb3IvbGFuZ3VhZ2UnO1xuaW1wb3J0IHsgUmFuZ2VTZXRCdWlsZGVyIH0gZnJvbSAnQGNvZGVtaXJyb3Ivc3RhdGUnO1xuaW1wb3J0IHtyZXF1ZXN0VXJsLCBFZGl0b3IsIE5vdGljZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuLy8gaW1wb3J0IHsgQnVmZmVyIH0gZnJvbSBcImJ1ZmZlclwiO1xuaW1wb3J0IHtcbiAgRGVjb3JhdGlvbixcbiAgRGVjb3JhdGlvblNldCxcbiAgRWRpdG9yVmlldyxcbiAgUGx1Z2luU3BlYyxcbiAgUGx1Z2luVmFsdWUsXG4gIFZpZXdQbHVnaW4sXG4gIFZpZXdVcGRhdGUsXG4gIFdpZGdldFR5cGUsXG59IGZyb20gJ0Bjb2RlbWlycm9yL3ZpZXcnO1xuXG5pbXBvcnQgSW5MaW5lQUlUdXRvclBsdWdpbiBmcm9tICcuL21haW4nO1xuaW1wb3J0IHsgYmVmb3JlIH0gZnJvbSAnbm9kZTp0ZXN0JztcblxuY29uc3QgU0VQQVJBVE9SID0gXCItXCIucmVwZWF0KDEwKTtcblxuZnVuY3Rpb24gZm9ybWF0RGF0ZSh0aW1lc3RhbXA6bnVtYmVyKTpzdHJpbmd7XG4gIGNvbnN0IG1vbnRoTmFtZXMgPSBbXCJqYW5cIiwgJ2ZlYicsIFwiYXByXCIsICdtYXknLCAnanVuJywgJ2p1bCcsXG4gICAgICAgICAgICAgIFwiYXVnXCIsIFwic2VwXCIsIFwib2N0XCIsIFwibm92XCIsIFwiZGVjXCJdO1xuICBjb25zdCBkYXRlID0gbmV3IERhdGUodGltZXN0YW1wKTtcbiAgY29uc3QgYWRkUGFkZGluZyA9IChudW06bnVtYmVyKTogc3RyaW5nID0+IG51bS50b1N0cmluZygpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgY29uc3QgaGggPSBhZGRQYWRkaW5nKGRhdGUuZ2V0SG91cnMoKSk7XG4gIGNvbnN0IG1tID0gYWRkUGFkZGluZyhkYXRlLmdldE1pbnV0ZXMoKSk7XG4gIGNvbnN0IGRheSA9IGFkZFBhZGRpbmcoZGF0ZS5nZXREYXRlKCkpO1xuICBjb25zdCBtb250aCA9IG1vbnRoTmFtZXNbKGRhdGUuZ2V0TW9udGgoKSktMV07XG4gIGNvbnN0IHllYXIgPSBkYXRlLmdldEZ1bGxZZWFyKCk7XG5cbiAgcmV0dXJuIGAke2hofToke21tfSAke2RheX0gJHttb250aH0gJHt5ZWFyfWA7XG59XG5cbmV4cG9ydCB0eXBlIG1heWJlU3RyaW5nID0gc3RyaW5nIHwgbnVsbDtcblxuZXhwb3J0IGNvbnN0IElNQUdFX0ZJTEVfVFlQRVMgPSBbJ3BuZycsICdqcGcnLCAnanBlZycsICdnaWYnLCAnd2VicCcsICdibXAnLCAnc3ZnJ11cblxuYXN5bmMgZnVuY3Rpb24gZm9ybWF0VGV4dEJsb2IocGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4sIHRleHQ6c3RyaW5nLCBpZHg6bnVtYmVyPTEpe1xuICAvLyBjb25zdCByZWdleFBhdHRlcm46IFJlZ0V4cCA9IG5ldyBSZWdFeHAoXCJcXCFcXFtcXFsoW1xcd1xccy5cXC1fXSspXFxdXFxdXCIsICdnJyk7XG4gIGNvbnN0IGZpbGUgPSBwbHVnaW4uYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gIGNvbnN0IHNvdXJjZVBhdGggPSBmaWxlPy5wYXRoIGFzIHN0cmluZztcbiAgY29uc3QgcmVnZXhQYXR0ZXJuID0gL1xcIVxcW1xcWyhbXFx3XFxzX1xcLV0rXFwuXFx3KylcXF1cXF18XFwhXFxbLitcXF1cXCgoW1xcd1xcc19cXC1dK1xcLlxcdyspXFwpL2c7XG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG4gIGNvbnN0IGJ1ZmZlcjogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY29udGVudEFycmF5Om9iamVjdFtdID0gW107XG4gIFxuICBsZXQgbnVtYmVyID0gaWR4O1xuICBsZXQgaW50ZXJpbU9iajpvYmplY3R8QXJyYXk8b2JqZWN0PjtcbiAgXG4gIC8vIHRlc3QgcGF0dGVybiBcbiAgLy8gY29uc3QgdGV4dF8gPSAnIVtbUGFzdGVkIGltYWdlIDIwMjYwNTE3MDQxNDA3LnBuZ11dJztcbiAgLy8gY29uc3QgcmUgPSAvIVxcW1xcWyhbXFx3XFxzXy1dK1xcLlxcdyspXFxdXFxdL2c7XG4gIC8vIGNvbnNvbGUubG9nKCd0ZXN0aW5nIHBhdHRlcm4nKTtcbiAgLy8gZm9yIChjb25zdCBtYXRjaCBvZiB0ZXh0Xy5tYXRjaEFsbChyZSkpIHtcbiAgLy8gICBjb25zb2xlLmxvZyhtYXRjaFswXSk7IC8vIHdob2xlICFbWy4uLl1dXG4gIC8vICAgY29uc29sZS5sb2cobWF0Y2hbMV0pOyAvLyBQYXN0ZWQgaW1hZ2UgMjAyNjA1MTcwNDE0MDcucG5nXG4gIC8vIH1cbiAgLy8gY29uc29sZS5sb2coXCJlbmQgb2YgcGF0dGVybiB0ZXN0XCIpXG4gIC8vIHRlc3QgcGF0dGVybiBcblxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBjb25zdCBtYXRjaGVzID0gWy4uLmxpbmUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuKV07XG4gICAgLy8gY29uc29sZS5sb2coWy4uLichW1tQYXN0ZWQgaW1hZ2UgMjAyNjA1MTcwNDE0MDcucG5nXV0nLm1hdGNoQWxsKHJlZ2V4UGF0dGVybildKTtcbiAgICAvLyBjb25zb2xlLmxvZyhcIkxJTkU6XCIsIEpTT04uc3RyaW5naWZ5KGxpbmUpKVxuICAgIGlmIChtYXRjaGVzLmxlbmd0aD4wKXtcbiAgICAgIC8vIGV4dHJhY3QgaW1hZ2UsIGNvbnZlcnQgdG8gYmFzZVxuICAgICAgaW50ZXJpbU9iaiA9IFtdXG4gICAgICBmb3IoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcyl7XG4gICAgICAgIGNvbnN0IG1hdGNoZWQgPSBtYXRjaFsxXSA/PyBtYXRjaFsyXTtcbiAgICAgICAgaWYgKElNQUdFX0ZJTEVfVFlQRVMuY29udGFpbnMobWF0Y2hlZC5zcGxpdCgnLicpWzFdKSl7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0ID0gcGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KG1hdGNoZWQsIHNvdXJjZVBhdGgpO1xuICAgICAgICAgIGNvbnN0IGltYWdlUGF0aCA9IHRhcmdldD8ucGF0aDtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcImltYWdlIGZvdW5kOiBcIiwgaW1hZ2VQYXRoKVxuICAgICAgICAgIGlmKGltYWdlUGF0aCl7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcGx1Z2luLmFwcC52YXVsdC5yZWFkQmluYXJ5KHRhcmdldCk7XG4gICAgICAgICAgICBjb25zdCBmaWxlQnVmZmVyID0gQnVmZmVyLmlzQnVmZmVyKGRhdGEpID8gZGF0YSA6IEJ1ZmZlci5mcm9tKGRhdGEgYXMgQXJyYXlCdWZmZXIpO1xuICAgICAgICAgICAgY29uc3QgaW1TdHIgPSBgZGF0YTppbWFnZS8ke21hdGNoZWQuc3BsaXQoJy4nKVsxXX07YmFzZTY0LCR7ZmlsZUJ1ZmZlci50b1N0cmluZyhcImJhc2U2NFwiKX19YFxuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGA8cG9zaXRpb25fJHtudW1iZXJ9PmB9KTtcbiAgICAgICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwiaW1hZ2VfdXJsXCIsIGltYWdlX3VybDoge3VybDppbVN0cn19KTtcbiAgICAgICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgPC9wb3NpdGlvbl8ke251bWJlcn0+YH0pO1xuICAgICAgICAgICAgbnVtYmVyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGxpbmUudHJpbSgpPT09XCJcIil7XG4gICAgICAgIC8vIG1lcmdlIGJ1ZmZlclxuICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke251bWJlcn0+JHtidWZmZXIuam9pbihcIlxcblwiKX08cG9zaXRpb25fJHtudW1iZXJ9YH0pO1xuICAgICAgICBudW1iZXIrKztcbiAgICAgICAgYnVmZmVyLmxlbmd0aCA9IDA7XG4gICAgfVxuICAgIGVsc2UgaWYgKGxpbmUudHJpbSgpIT09XCJcIil7XG4gICAgICAvLyBhZGQgdG8gYnVmZmVyXG4gICAgICBidWZmZXIucHVzaChsaW5lKTtcbiAgICB9XG4gICAgLy8gYWRkIHBvc2l0aW9uIG51bWJlciBhbmQgYXBwZW5kIHRoZSBtZXNzYWdlIHRvIHRoZSBjb250ZW50IGFycmF5LlxuICB9XG5cbiAgcmV0dXJuIHtjb250ZW50QXJyYXksIG51bWJlcn1cbn1cbmZ1bmN0aW9uIGdldFF1ZXJ5Q29udGV4dCh2aWV3OkVkaXRvclZpZXcsIGJlZm9yZUxpbmU6bnVtYmVyLCBhZnRlckxpbmU6bnVtYmVyLCBzZWN0aW9uT25seTpib29sZWFuPWZhbHNlKVxuOntiZWZvcmVUZXh0OnN0cmluZywgYWZ0ZXJUZXh0OnN0cmluZ30gIHtcbiAgXG4gIGxldCBudW1iZXIgPSBiZWZvcmVMaW5lO1xuICBjb25zdCBiZWZvcmVMaW5lcyA9IFtdO1xuICB3aGlsZSAobnVtYmVyID4gMCl7XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICBpZiAoc2VjdGlvbk9ubHkgJiYgKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSl7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBiZWZvcmVMaW5lcy51bnNoaWZ0KGxpbmUudGV4dCk7XG4gICAgbnVtYmVyLS07XG4gIH1cblxuICBudW1iZXIgPSBhZnRlckxpbmU7XG4gIGNvbnN0IGFmdGVyTGluZXMgPSBbXTtcbiAgd2hpbGUgKG51bWJlciA8IHZpZXcuc3RhdGUuZG9jLmxpbmVzKXtcbiAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgIGlmIChzZWN0aW9uT25seSAmJiAobGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKXtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGFmdGVyTGluZXMucHVzaChsaW5lLnRleHQpO1xuICAgIG51bWJlcisrO1xuICB9XG4gIFxuXG4gIGNvbnN0IGJlZm9yZVRleHQgPSBiZWZvcmVMaW5lcy5qb2luKCdcXG4nKVxuICBjb25zdCBhZnRlclRleHQgPSBhZnRlckxpbmVzLmpvaW4oJ1xcbicpXG5cbiAgLy8gY29uc29sZS5sb2coXCJCRUZPUkUgVEVYVDpcIiwgYmVmb3JlVGV4dCk7XG4gIC8vIGNvbnNvbGUubG9nKFwiQUZURVIgVEVYVDpcIiwgYWZ0ZXJUZXh0KTtcbiAgcmV0dXJuIHtiZWZvcmVUZXh0LCBhZnRlclRleHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdWJtaXRUb0xMTSh2aWV3OkVkaXRvclZpZXcsIHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luKXtcbiAgICAvLyBjb25zb2xlLmxvZyhcInN1Ym1pdHRpbmcgc29tZXRoaW5nIVwiKTtcbiAgICAvLyBuZXcgTm90aWNlKFwic3VibWl0dGluZyB0byBMTE1cIik7XG4gICAgY29uc3Qgc3VibWl0VGltZSA9IGZvcm1hdERhdGUoRGF0ZS5ub3coKSk7XG4gICAgY29uc3Qge2NvbnRlbnQsIGJlZm9yZUxpbmUsIGFmdGVyTGluZX0gPSBnZXRMTE1xdWVyeSh2aWV3KTtcbiAgICBjb25zb2xlLmxvZyhcInN1Ym1pdHRlZCBhdDpcIiwgc3VibWl0VGltZSk7XG4gICAgY29uc29sZS5sb2coY29udGVudCk7XG4gICAgXG4gICAgY29uc3QgZGVmYXVsdFR5cGUgPSBwbHVnaW4uc2V0dGluZ3MuZGVmYXVsdENvbnRleHQ7XG4gICAgY29uc3QgZmlyc3RXb3JkID0gY29udGVudC5zcGxpdChcIiBcIilbMF07XG4gICAgY29uc3Qgb3B0aW9ucyA9IGZpcnN0V29yZC5zcGxpdChcIjpcIikuc2xpY2UoMSwgdW5kZWZpbmVkKTtcbiAgICAvLyBsZXQgYW5zd2VyOnN0cmluZztcbiAgICBsZXQgYmVmb3JlVGV4dDogbWF5YmVTdHJpbmc9bnVsbCwgYWZ0ZXJUZXh0OiBtYXliZVN0cmluZz1udWxsO1xuXG4gICAgaWYob3B0aW9ucy5jb250YWlucygnaXNvbGF0ZWQnKXx8KChkZWZhdWx0VHlwZT09PVwiaXNvbGF0ZWRcIikgJiYgKG9wdGlvbnMubGVuZ3RoPT09MCkpKXtcbiAgICAgIGJlZm9yZVRleHQgPSBudWxsO1xuICAgICAgYWZ0ZXJUZXh0ID0gbnVsbDtcbiAgICB9XG4gICAgZWxzZSBpZiAob3B0aW9ucy5jb250YWlucyhcImRvY1wiKXx8KGRlZmF1bHRUeXBlPT09XCJkb2NcIikgJiYgKG9wdGlvbnMubGVuZ3RoPT09MCkpe1xuICAgICAgY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUpO1xuICAgICAgYmVmb3JlVGV4dCA9IGNvbnRleHQuYmVmb3JlVGV4dDtcbiAgICAgIGFmdGVyVGV4dCA9IGNvbnRleHQuYWZ0ZXJUZXh0O1xuICAgICAgXG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJzZWN0aW9uXCIpfHwoZGVmYXVsdFR5cGU9PT1cInNlY3Rpb25cIikgJiYgKG9wdGlvbnMubGVuZ3RoPT09MCkpe1xuICAgICAgY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUsIHRydWUpO1xuICAgICAgLy8gY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUpO1xuICAgICAgYmVmb3JlVGV4dCA9IGNvbnRleHQuYmVmb3JlVGV4dDtcbiAgICAgIGFmdGVyVGV4dCA9IGNvbnRleHQuYWZ0ZXJUZXh0O1xuICAgIH1cbiAgICBcbiAgICAvLyAgICAgICBjdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9hcGkvdjEvY2hhdCBcXFxuICAgIC8vICAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxuICAgIC8vICAgLWQgJ3tcbiAgICAvLyAgICAgXCJtb2RlbFwiOiBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIixcbiAgICAvLyAgICAgXCJzeXN0ZW1fcHJvbXB0XCI6IFwiWW91IGFuc3dlciBvbmx5IGluIHJoeW1lcy5cIixcbiAgICAvLyAgICAgXCJpbnB1dFwiOiBcIldoYXQgaXMgeW91ciBmYXZvcml0ZSBjb2xvcj9cIlxuICAgIC8vIH0nXG4gICAgY29uc3QgYW5zd2VyID0gYXdhaXQgcGluZ0xMTShwbHVnaW4sIGNvbnRlbnQsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG4gICAgaWYoYW5zd2VyKXtcbiAgICAgIG5ldyBOb3RpY2UoXCJSZXNwb25zZSByZWNlaXZlZCFcIilcbiAgICAgIGNvbnNvbGUubG9nKGFuc3dlcik7XG4gICAgICBjb25zdCByZWNlaXZlVGltZSA9IGZvcm1hdERhdGUoRGF0ZS5ub3coKSk7XG4gICAgICBjb25zb2xlLmxvZyhcInJlY2VpdmVkIGF0OlwiLCByZWNlaXZlVGltZSk7XG4gICAgXG4gICAgICBhcHBlbmRBbnN3ZXIodmlldywgYW5zd2VyLCBzdWJtaXRUaW1lLCByZWNlaXZlVGltZSk7XG4gICAgfVxuICAgIGVsc2V7XG4gICAgICBuZXcgTm90aWNlKFwiQ2FsbCBmYWlsZWRcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZEFuc3dlcih2aWV3OkVkaXRvclZpZXcsIHRleHQ6c3RyaW5nLCBzdWJtaXRUaW1lOnN0cmluZywgcmVjZWl2ZVRpbWU6c3RyaW5nKXtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgd2hpbGUgKGN1cnJMaW5lLm51bWJlcjx2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgICBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoY3VyckxpbmUubnVtYmVyICsgMSk7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCk9PT1cIlwiKXtcbiAgICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlci0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOmN1cnJMaW5lLnRvfSxcbiAgICAgIHNjcm9sbEludG9WaWV3OnRydWVcbiAgICB9KVxuXG4gICAgY29uc3QgZm9ybWF0dGVkVGV4dCA9IGAgKHN1Ym1pdHRlZCBhdCAke3N1Ym1pdFRpbWV9KVxcbioqQHJlc3BvbnNlKiogJHt0ZXh0fSAocmVzcG9uZGVkIGF0ICR7cmVjZWl2ZVRpbWV9KVxcblxcbmBcbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgY2hhbmdlczoge2Zyb206Y3VyckxpbmUudG8sIGluc2VydDogZm9ybWF0dGVkVGV4dH0sXG4gICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogY3VyckxpbmUudG8rZm9ybWF0dGVkVGV4dC5sZW5ndGh9XG4gICAgfSlcbn1cbmFzeW5jIGZ1bmN0aW9uIHBpbmdMTE0ocGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4sIHF1ZXJ5OnN0cmluZywgYmVmb3JlVGV4dDptYXliZVN0cmluZywgYWZ0ZXJUZXh0Om1heWJlU3RyaW5nKTpQcm9taXNlPHN0cmluZ3xudWxsPntcbiAgICBjb25zdCBiYXNlX3VybCA9IHBsdWdpbi5zZXR0aW5ncy5iYXNlVVJMO1xuICAgIGNvbnN0IHVybCA9IGAke2Jhc2VfdXJsfS92MS9jaGF0L2NvbXBsZXRpb25zYDtcbiAgICBjb25zdCBtb2RlbCA9IHBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWU7XG4gICAgY29uc3Qgc3lzdGVtX3Byb21wdCA9IFwiWW91IGFyZSBhIGNvbmNpc2UgYW5kIHN1Y2NpbmN0IGFzc2lzdGFudCBvcGVyYXRpbmcgaW5zaWRlIE9ic2lkaWFuLk1ELCBhIHNwZWNpYWxpemVkIG5vdGUgdGFraW5nIGFwcC5cIjtcbiAgICBcbiAgICBjb25zdCBtZXRob2QgPSBcIlBPU1RcIjtcblxuICAgIC8vIGNvbnNvbGUubG9nKCdiZWZvcmUgdGV4dCcsIGJlZm9yZVRleHQpO1xuICAgIC8vIGNvbnNvbGUubG9nKCdhZnRlciB0ZXh0JywgYWZ0ZXJUZXh0KTtcbiAgICBsZXQgYmVmQXJyYXlGb3JtYXR0ZWQ6b2JqZWN0W109W10sIGFmdEFycmF5Rm9ybWF0dGVkOm9iamVjdFtdPVtdLCBudW06bnVtYmVyPTA7XG4gICAgXG4gICAgaWYgKGJlZm9yZVRleHQpe1xuICAgICAgbGV0IHtjb250ZW50QXJyYXksIG51bWJlcn0gPSBhd2FpdCBmb3JtYXRUZXh0QmxvYihwbHVnaW4sIGJlZm9yZVRleHQsIG51bSk7XG4gICAgICBudW0gPSBudW1iZXI7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICAgIGJlZkFycmF5Rm9ybWF0dGVkLnVuc2hpZnQoXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZC5wdXNoKFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBBQk9WRSBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBjb25zb2xlLmxvZygnQkVGT1JFIENPTlRFTlQnLCBiZWZBcnJheUZvcm1hdHRlZCk7XG4gICAgY29uc3QgYWN0aXZlX251bSA9IG51bTtcbiAgICBudW0rKztcbiAgICBcbiAgICBpZiAoYWZ0ZXJUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBhZnRlclRleHQsIG51bSk7XG4gICAgICBudW0gPSBudW1iZXI7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICAgIGFmdEFycmF5Rm9ybWF0dGVkLnVuc2hpZnQoXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZC5wdXNoKFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBjb25zb2xlLmxvZygnQUZURVIgQ09OVEVOVCcsIGFmdEFycmF5Rm9ybWF0dGVkKTtcbiAgICAvLyBjb25zdCBiZWZvcmVUZXh0ID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YmVmb3JlTGluZXMuam9pbihcIlxcblwiKX1cXG4ke3NlcGFyYXRvcn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtzZXBhcmF0b3J9XFxuYDtcbiAgICAvLyBjb25zdCBhZnRlclRleHQgID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YWZ0ZXJMaW5lcy5qb2luKFwiXFxuXCIpfVxcbiR7c2VwYXJhdG9yfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke3NlcGFyYXRvcn1cXG5gOztcblxuICAgIGNvbnNvbGUubG9nKCdxdWVyeScsIHF1ZXJ5KVxuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICAgIHVybCxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgXCJBdXRob3JpemF0aW9uXCI6IFwiQmVhcmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIG1vZGVsLFxuICAgICAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgICAgICB7cm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogc3lzdGVtX3Byb21wdH0sXG4gICAgICAgICAgICB7cm9sZTogXCJ1c2VyXCIsIFxuICAgICAgICAgICAgICBjb250ZW50OiBbXG4gICAgICAgICAgICAgICAgLy8ge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBiZWZvcmVUZXh0ID8/IFwiXFxuXCJ9LFxuICAgICAgICAgICAgICAgIC4uLmJlZkFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke2FjdGl2ZV9udW19PiAqVGhpcyBpcyB0aGUgcG9zaXRpb24gb2YgdGhlIHVzZXIgcXVlc3Rpb24vcHJvbXB0IGN1cnJlbnRseSBwb3NlZCB0byB5b3UqIDwvcG9zaXRpb25fJHthY3RpdmVfbnVtfT5gfSxcbiAgICAgICAgICAgICAgICAvLyB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGFmdGVyVGV4dCAgPz8gXCJcXG5cIn0sXG4gICAgICAgICAgICAgICAgLi4uYWZ0QXJyYXlGb3JtYXR0ZWQsXG4gICAgICAgICAgICAgICAge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBgY3VycmVudCB1c2VyIHByb21wdDogJHtxdWVyeS5zcGxpdChcIiBcIikuc2xpY2UoMSwgdW5kZWZpbmVkKS5qb2luKFwiIFwiKX1gfSxcbiAgICAgICAgICAgICAgXX1cbiAgICAgICAgICBdLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOjAuOSxcbiAgICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHBheWxvYWQpO1xuICByZXR1cm4gcmVzcG9uc2UuanNvbi5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0TExNcXVlcnkodmlldzpFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGNvbnN0IGFsbExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBcbiAgICBjb25zdCBudW1MaW5lcyA9IHZpZXcuc3RhdGUuZG9jLmxpbmVzO1xuICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICBhbGxMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgXG4gICAgbGV0IGJlZm9yZUxpbmU6bnVtYmVyPTEwMDAwMDtcbiAgICBsZXQgYWZ0ZXJMaW5lOm51bWJlcj0wO1xuXG4gICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgbnVtYmVyLS07XG4gICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpe1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnYnJlYWtpbmcgcG9pbnQnKVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBsaW5lX3FObzogJHtudW1iZXJ9IGxpbmU6ICR7Y3VyckxpbmUubnVtYmVyfWAsIFwidGV4dDogXCIsIGN1cnJMaW5lLnRleHQpXG4gICAgICAgIGFsbExpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIGJlZm9yZUxpbmU9bnVtYmVyO1xuICAgIFxuICAgIG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIHdoaWxlKG51bWJlcjwobnVtTGluZXMtMSkpe1xuICAgICAgbnVtYmVyKys7XG4gICAgICBjb25zdCBuZXh0TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChuZXh0TGluZSAmJiAobmV4dExpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAgIGFsbExpbmVzLnB1c2gobmV4dExpbmUudGV4dClcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBhZnRlckxpbmU9bnVtYmVyO1xuICAgIHJldHVybiB7Y29udGVudDogYWxsTGluZXMuam9pbihcIlxcblwiKSwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfVxuXG59XG5cbi8vIGltcG9ydCB7IEVtb2ppV2lkZ2V0IH0gZnJvbSAnZW1vamknO1xuZXhwb3J0IGNsYXNzIElubGluZUFJV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luLFxuICAgIHByaXZhdGUgdmlldzogRWRpdG9yVmlldyxcbiAgICBwcml2YXRlIGZyb206IG51bWJlcixcbiAgICBwcml2YXRlIHRvOiBudW1iZXIsXG4gICl7XG4gICAgc3VwZXIoKVxuICB9XG4gIFxuICBlcShvdGhlcjogSW5saW5lQUlXaWRnZXQpIHtcbiAgICByZXR1cm4gdGhpcy5mcm9tID09PSBvdGhlci5mcm9tICYmIHRoaXMudG8gPT09IG90aGVyLnRvO1xuICB9XG5cbiAgdG9ET00odmlldzpFZGl0b3JWaWV3KTpIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgcXVlcnlXcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgYnV0dG9uLmlubmVyVGV4dCA9IFwic3VibWl0XCI7XG4gICAgYnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xuICAgIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwcHgnO1xuICAgIGJ1dHRvbi5pZCA9IFwiYWktc3VibWl0LWJ1dHRvblwiXG4gICAgXG4gICAgYnV0dG9uLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIHN1Ym1pdFRvTExNKHRoaXMudmlldywgdGhpcy5wbHVnaW4pO1xuICAgICAgICAvLyBidXR0b24uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH07XG4gICAgcXVlcnlXcmFwcGVyLmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gICAgcmV0dXJuIHF1ZXJ5V3JhcHBlcjtcbiAgfVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiB2aWV3UGx1Z2luRmFjdG9yeU1ldGhvZChfcGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4pe1xuICBjbGFzcyBJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbiBpbXBsZW1lbnRzIFBsdWdpblZhbHVlIHtcbiAgICBkZWNvcmF0aW9uczogRGVjb3JhdGlvblNldDtcbiAgICBwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW47XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHZpZXcpO1xuICAgICAgdGhpcy5wbHVnaW4gPSBfcGx1Z2luO1xuICAgIH1cblxuICAgIHVwZGF0ZSh1cGRhdGU6IFZpZXdVcGRhdGUpIHtcbiAgICAgIGlmICh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkKSB7XG4gICAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmJ1aWxkRGVjb3JhdGlvbnModXBkYXRlLnZpZXcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRlc3Ryb3koKSB7fVxuXG4gICAgYnVpbGREZWNvcmF0aW9ucyh2aWV3OiBFZGl0b3JWaWV3KTogRGVjb3JhdGlvblNldCB7XG4gICAgICBjb25zdCBidWlsZGVyID0gbmV3IFJhbmdlU2V0QnVpbGRlcjxEZWNvcmF0aW9uPigpO1xuXG4gICAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgICBcbiAgICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdzdGFydCBudW1iZXI6ICcsIG51bWJlcilcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdjdXJyZW50IGxpbmUgaXM6JywgbGluZS50ZXh0KVxuICAgICAgXG4gICAgICBjb25zdCBwYXJhTGluZXM6IHN0cmluZ1tdID0gW11cbiAgICAgIHBhcmFMaW5lcy5wdXNoKGxpbmUudGV4dClcbiAgICAgIHdoaWxlKG51bWJlcj4xKXtcbiAgICAgICAgbnVtYmVyLS07XG4gICAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpID09PSBcIlwiKXtcbiAgICAgICAgICAvLyBjb25zb2xlLmxvZygnYnJlYWtpbmcgcG9pbnQnKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgLy8gY29uc29sZS5sb2coYGxpbmVfcU5vOiAke251bWJlcn0gbGluZTogJHtjdXJyTGluZS5udW1iZXJ9YCwgXCJ0ZXh0OiBcIiwgY3VyckxpbmUudGV4dClcbiAgICAgICAgICBwYXJhTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBwYXJhVGV4dCA9IHBhcmFMaW5lcy5qb2luKCdcXG4nKTtcbiAgICAgIFxuICAgICAgLy8gY29uc29sZS5sb2coXCJwYXJhVGV4dDogXCIsIHBhcmFUZXh0KVxuICAgICAgXG4gICAgICBjb25zdCBwcmV2TGluZSA9IGxpbmUubnVtYmVyID4gMSA/IHZpZXcuc3RhdGUuZG9jLmxpbmUobGluZS5udW1iZXItMSk6IG51bGw7XG4gICAgICAvLyBjb25zb2xlLmxvZyhcInByZXZpb3VzIGxpbmU6IFwiLCBwcmV2TGluZT8udGV4dCk7XG4gICAgICBcbiAgICAgIGlmKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiQGFzc2lzdGFudFwiKSAmJiAobGluZS5udW1iZXIgPiAxKSAmJiAocHJldkxpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAgIC8vIHRoaXMgY29uZGl0aW9uIG1lYW5zIHRoYXQgaXQgaXMgbm90IHRoZSBmaXJzdCBsaW5lIGFuZCBpdCBpcyBub3QgYSBwYXJhZ3JhcGggYnkgaXRzZWxmLlxuICAgICAgICBjb25zb2xlLmxvZyhcIndpbGwgbmVlZCB0byBhZGQgYSBsaW5lIGJyZWFrXCIpXG4gICAgICAgIGNvbnN0IGluc2VydGlvblN0ciA9IFwiXFxuXCJcbiAgICAgICAgc2V0VGltZW91dCgoKT0+e3ZpZXcuZGlzcGF0Y2goe1xuICAgICAgICAgIGNoYW5nZXM6IHtmcm9tOmxpbmUuZnJvbSwgaW5zZXJ0OiBpbnNlcnRpb25TdHJ9LFxuICAgICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogbGluZS50bytpbnNlcnRpb25TdHIubGVuZ3RofVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZWxzZSBpZiAocGFyYVRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgIShwYXJhVGV4dC5jb250YWlucyhcIkByZXNwb25zZVwiKSkpe1xuICAgICAgICBidWlsZGVyLmFkZChsaW5lLnRvLCBsaW5lLnRvLCBcbiAgICAgICAgICBEZWNvcmF0aW9uLndpZGdldChcbiAgICAgICAgICAgIHt3aWRnZXQ6IG5ldyBJbmxpbmVBSVdpZGdldCh0aGlzLnBsdWdpbiwgdmlldywgbGluZS50bywgbGluZS50byksIHNpZGU6IDF9XG4gICAgICAgICAgKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBsdWdpblNwZWM6IFBsdWdpblNwZWM8SW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4+ID0ge1xuICAgIGRlY29yYXRpb25zOiAodmFsdWU6IElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luKSA9PiB2YWx1ZS5kZWNvcmF0aW9ucyxcbiAgfTtcblxuICBjb25zdCBpbmxpbmVBSUFJUGx1Z2luID0gVmlld1BsdWdpbi5mcm9tQ2xhc3MoXG4gICAgSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4sXG4gICAgcGx1Z2luU3BlY1xuICApO1xuXG5yZXR1cm4gaW5saW5lQUlBSVBsdWdpblxufSJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFBQUEsbUJBQXFFOzs7QUNDckUsc0JBQTZDO0FBYXRDLElBQU0sbUJBQXlEO0FBQUEsRUFDckUsU0FBUztBQUFBLEVBQ1QsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsZ0JBQWdCO0FBQUE7QUFBQTtBQUdqQjtBQUNPLElBQU0sMkJBQU4sY0FBdUMsaUNBQWdCO0FBQUEsRUFHN0QsWUFBWSxLQUFTLFFBQTJCO0FBQy9DLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsUUFBSSxFQUFDLFlBQVcsSUFBSTtBQUNwQixnQkFBWSxNQUFNO0FBRWxCLFFBQUksd0JBQVEsV0FBVyxFQUNyQixRQUFRLFNBQVMsRUFDakIsUUFBUSxDQUFDLFNBQVE7QUFDakIsV0FBSyxlQUFlLHFCQUFxQixFQUN2QyxTQUFTLEtBQUssT0FBTyxTQUFTLE9BQU8sRUFDckMsU0FBUyxPQUFPLFVBQVU7QUFDMUIsYUFBSyxPQUFPLFNBQVMsVUFBVTtBQUMvQixjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDaEMsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUVGLFFBQUksd0JBQVEsV0FBVyxFQUNyQixRQUFRLFVBQVUsRUFDbEIsUUFBUSxDQUFDLFNBQVE7QUFDakIsV0FBSyxlQUFlLHVCQUF1QixFQUN6QyxTQUFTLEtBQUssT0FBTyxTQUFTLFNBQVMsRUFDdkMsU0FBUyxPQUFPLFVBQWdCO0FBQ2hDLGFBQUssT0FBTyxTQUFTLFlBQVk7QUFDakMsY0FB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QUFBLFlBQ1QsRUFBQyxRQUFRLElBQUksZUFBZSxLQUFLLFFBQVEsTUFBTSxLQUFLLElBQUksS0FBSyxFQUFFLEdBQUcsTUFBTSxFQUFDO0FBQUEsVUFDM0U7QUFBQSxRQUFDO0FBQUEsTUFDTDtBQUNBLGFBQU8sUUFBUSxPQUFPO0FBQUEsSUFDeEI7QUFBQSxFQUNGO0FBRUEsUUFBTSxhQUFxRDtBQUFBLElBQ3pELGFBQWEsQ0FBQyxVQUFzQyxNQUFNO0FBQUEsRUFDNUQ7QUFFQSxRQUFNLG1CQUFtQix1QkFBVztBQUFBLElBQ2xDO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFFRixTQUFPO0FBQ1A7OztBRi9hQSxJQUFxQixzQkFBckIsY0FBaUQsd0JBQU87QUFBQSxFQUd2RCxNQUFNLGVBQWM7QUFDbkIsU0FBSyxXQUFXLE9BQU8sT0FBTyxDQUFDLEdBQUcsa0JBQWtCLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUMxRTtBQUFBLEVBRUEsTUFBTSxlQUFjO0FBQ25CLFVBQU0sS0FBSyxTQUFTLEtBQUssUUFBUTtBQUFBLEVBQ2xDO0FBQUEsRUFDQSxNQUFNLFNBQVM7QUFDZCxVQUFNLEtBQUssYUFBYTtBQUd4QixTQUFLO0FBQUEsTUFBYztBQUFBLE1BQWU7QUFBQSxNQUM3QixNQUFJO0FBQ0YsWUFBSSx3QkFBTyxpQkFBaUI7QUFDNUIsZ0JBQVEsSUFBSSxpQkFBaUI7QUFBQSxNQUM5QjtBQUFBLElBQ0Y7QUFDSixTQUFLLGNBQWMsSUFBSSx5QkFBeUIsS0FBSyxLQUFLLElBQUksQ0FBQztBQUUvRCxTQUFLLHdCQUF3QixDQUFDLHdCQUF3QixJQUFJLENBQUMsQ0FBQztBQUU1RCxTQUFLLFdBQVc7QUFBQSxNQUNmLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFNBQVMsQ0FBQztBQUFBLFFBQ1QsV0FBVyxDQUFDLE9BQU0sT0FBTztBQUFBLFFBQ3pCLEtBQUs7QUFBQSxNQUNOLENBQUM7QUFBQSxNQUNELGdCQUFnQixPQUFPLFNBQVMsU0FBUztBQUV4QyxjQUFNLGNBQWMsU0FBUyxlQUFlLGtCQUFrQjtBQUM5RCxZQUFJLGdCQUFnQixLQUFNO0FBRzFCLGNBQU0sYUFBYSxLQUFLLE9BQU87QUFDL0IsY0FBTSxZQUFZLFlBQVksSUFBSTtBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIl0KfQo=
