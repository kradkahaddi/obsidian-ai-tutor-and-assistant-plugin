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
  // framework: "lmstudio",
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
    const receiveTime = formatDate(Date.now());
    appendAnswer(view, answer, submitTime, receiveTime);
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
            ...befArrayFormatted,
            { type: "text", text: `<position_${active_num}> *This is the position of the user question/prompt currently posed to you* </position_${active_num}>` },
            ...aftArrayFormatted,
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3MhOkluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncztcblx0c3lzdGVtUHJvbXB0ITpzdHJpbmc7XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCl7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSlcblx0fVxuXHRcblx0YXN5bmMgc2F2ZVNldHRpbmdzKCl7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTeXN0ZW1Qcm9tcHQoKXtcblx0XHRjb25zdCBwYXRoID0gYCR7dGhpcy5tYW5pZmVzdC5kaXJ9L2NvbmZpZ3MvZGVmYXVsdF9zeXNfcHJvbXB0Lm1kYDtcblx0XHR0aGlzLnN5c3RlbVByb21wdCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChwYXRoKTtcblx0fVxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRTeXN0ZW1Qcm9tcHQoKTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbdmlld1BsdWdpbkZhY3RvcnlNZXRob2QodGhpcyldKVxuXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcInN1Ym1pdC1haS1wcm9tcHRcIixcblx0XHRcdG5hbWU6IFwic3VibWl0IHRvIHRoZSBMTE1cIixcblx0XHRcdGhvdGtleXM6IFt7IFxuXHRcdFx0XHRtb2RpZmllcnM6IFtcIk1vZFwiLFwiU2hpZnRcIl0sIFxuXHRcdFx0XHRrZXk6IFwiTFwiXG5cdFx0XHR9XSxcblx0XHRcdGVkaXRvckNhbGxiYWNrOiBhc3luYyAoX2VkaXRvciwgdmlldykgPT4ge1xuXHRcdFx0XHRjb25zdCBidXR0b25DaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaS1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRcdGlmIChidXR0b25DaGVjayA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdGNvbnN0IGVkaXRvclZpZXcgPSB2aWV3LmVkaXRvci5jbSBhcyBFZGl0b3JWaWV3O1xuXHRcdFx0XHRhd2FpdCBzdWJtaXRUb0xMTShlZGl0b3JWaWV3LCB0aGlzKTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG59IiwgImltcG9ydCB0eXBlIEluTGluZUFJVHV0b3JQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHtBcHAsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmd9IGZyb20gXCJvYnNpZGlhblwiXG5cbi8vIGV4cG9ydCB0eXBlIEFQSUZyYW1lV29yayA9IFwibG1zdHVkaW9cIiB8IFwib2xsYW1hXCIgfCBcImxsYW1hY3BwXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5MaW5lQUlUdXRvclBsdWdpblNldHRpbmdzIHtcblx0YmFzZVVSTDpzdHJpbmc7XG5cdG1vZGVsTmFtZTpzdHJpbmc7XG5cdC8vIGZyYW1ld29yazpzdHJpbmc7XG5cdGRlZmF1bHRDb250ZXh0OnN0cmluZztcblx0Ly8gaW5saW5lTExNSWQ6c3RyaW5nO1xuXHQvLyBpbmxpbmVMTE1SZXNwb25zZUlkOnN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFBhcnRpYWw8SW5MaW5lQUlUdXRvclBsdWdpblNldHRpbmdzPiA9IHtcblx0YmFzZVVSTDogXCJodHRwOi8vMTI3LjAuMC4xOjEyMzRcIixcblx0bW9kZWxOYW1lOiBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIixcblx0Ly8gZnJhbWV3b3JrOiBcImxtc3R1ZGlvXCIsXG5cdGRlZmF1bHRDb250ZXh0OiBcImRvY1wiLFxuXHQvLyBpbmxpbmVMTE1JZDogXCJhc3Npc3RhbnRcIixcblx0Ly8gaW5saW5lTExNUmVzcG9uc2VJZDpcInJlc3BvbnNlXCIsXG59XG5leHBvcnQgY2xhc3MgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYntcblx0cGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luO1xuXHRcblx0Y29uc3RydWN0b3IoYXBwOkFwcCwgcGx1Z2luOkluTGluZUFJVHV0b3JQbHVnaW4pe1xuXHRcdHN1cGVyKGFwcCwgcGx1Z2luKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdGRpc3BsYXkoKTogdm9pZCB7XG5cdFx0bGV0IHtjb250YWluZXJFbH0gPSB0aGlzO1xuXHRcdGNvbnRhaW5lckVsLmVtcHR5KClcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiQVBJIFVSTFwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwiaHR0cHMvL2V4YW1wbGUuY29tOlwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5iYXNlVVJMKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmJhc2VVUkwgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJtb2RlbCBpZFwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwiY29tcGFueS9jb29sLW1vZGVsLTFiXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSlcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWUgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KVxuXG5cdFx0Ly8gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0Ly8gXHQuc2V0TmFtZShcImxsbSBhY3RpdmF0aW9uIGlkZW50aWZpZXJcIilcblx0XHQvLyBcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHQvLyBcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImxsbV9hY3RpdmF0ZSFcIilcblx0XHQvLyBcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNSWQpXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNSWQgPSB2YWx1ZTtcblx0XHQvLyBcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdC8vIFx0XHRcdH0pXG5cdFx0Ly8gXHR9KVxuXG5cdFx0Ly8gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0Ly8gXHQuc2V0TmFtZShcImxsbSByZXNwb25zZSBpZGVudGlmaWVyXCIpXG5cdFx0Ly8gXHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0Ly8gXHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJlbGVtZW50YXJ5LXdhdHNvblwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1SZXNwb25zZUlkKVxuXHRcdC8vIFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHQvLyBcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTVJlc3BvbnNlSWQgPSB2YWx1ZTtcblx0XHQvLyBcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdC8vIFx0XHRcdH0pXG5cdFx0Ly8gXHR9KVxuXG5cdFx0Ly8gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0Ly8gXHQuc2V0TmFtZShcImJhY2tlbmRcIilcblx0XHQvLyBcdC5hZGREcm9wZG93bigoZHJvcGRvd24pPT4ge1xuXHRcdC8vIFx0XHRkcm9wZG93blxuXHRcdC8vIFx0XHRcdC5hZGRPcHRpb24oXCJsbXN0dWRpb1wiLCBcIkxNLVN0dWRpb1wiKVxuXHRcdC8vIFx0XHRcdC5hZGRPcHRpb24oXCJsbGFtYWNwcFwiLCBcImxsYW1hLmNwcFwiKVxuXHRcdC8vIFx0XHRcdC5hZGRPcHRpb24oXCJvbGxhbWFcIiwgXCJvbGxhbWFcIilcblx0XHQvLyBcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZnJhbWV3b3JrKVxuXHRcdC8vIFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHQvLyBcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmZyYW1ld29yayA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcImRlZmF1bHQgY29udGV4dFwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bik9PiB7XG5cdFx0XHRcdGRyb3Bkb3duXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImRvY1wiLCBcIldob2xlIGRvY3VtZW50XCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcImlzb2xhdGVkXCIsIFwiTm8gZG9jdW1lbnQgY29udGV4dFwiKVxuXHRcdFx0XHRcdC5hZGRPcHRpb24oXCJzZWN0aW9uXCIsIFwiaW1tZWRpYXRlIHNlY3Rpb24gb25seVwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0Q29udGV4dClcblx0XHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0Q29udGV4dCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0fVxufSIsICJpbXBvcnQgeyBSYW5nZVNldEJ1aWxkZXIgfSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7XG5pbXBvcnQge3JlcXVlc3RVcmwsIEVkaXRvciwgTm90aWNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQge1xuICBEZWNvcmF0aW9uLFxuICBEZWNvcmF0aW9uU2V0LFxuICBFZGl0b3JWaWV3LFxuICBQbHVnaW5TcGVjLFxuICBQbHVnaW5WYWx1ZSxcbiAgVmlld1BsdWdpbixcbiAgVmlld1VwZGF0ZSxcbiAgV2lkZ2V0VHlwZSxcbn0gZnJvbSAnQGNvZGVtaXJyb3Ivdmlldyc7XG5cbmltcG9ydCBJbkxpbmVBSVR1dG9yUGx1Z2luIGZyb20gJy4vbWFpbic7XG5pbXBvcnQgeyBiZWZvcmUgfSBmcm9tICdub2RlOnRlc3QnO1xuXG5jb25zdCBTRVBBUkFUT1IgPSBcIi1cIi5yZXBlYXQoMTApO1xuXG5mdW5jdGlvbiBmb3JtYXREYXRlKHRpbWVzdGFtcDpudW1iZXIpOnN0cmluZ3tcbiAgY29uc3QgbW9udGhOYW1lcyA9IFtcImphblwiLCAnZmViJywgXCJhcHJcIiwgJ21heScsICdqdW4nLCAnanVsJyxcbiAgICAgICAgICAgICAgXCJhdWdcIiwgXCJzZXBcIiwgXCJvY3RcIiwgXCJub3ZcIiwgXCJkZWNcIl07XG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0aW1lc3RhbXApO1xuICBjb25zdCBhZGRQYWRkaW5nID0gKG51bTpudW1iZXIpOiBzdHJpbmcgPT4gbnVtLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICBjb25zdCBoaCA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRIb3VycygpKTtcbiAgY29uc3QgbW0gPSBhZGRQYWRkaW5nKGRhdGUuZ2V0TWludXRlcygpKTtcbiAgY29uc3QgZGF5ID0gYWRkUGFkZGluZyhkYXRlLmdldERhdGUoKSk7XG4gIGNvbnN0IG1vbnRoID0gbW9udGhOYW1lc1soZGF0ZS5nZXRNb250aCgpKS0xXTtcbiAgY29uc3QgeWVhciA9IGRhdGUuZ2V0RnVsbFllYXIoKTtcblxuICByZXR1cm4gYCR7aGh9OiR7bW19ICR7ZGF5fSAke21vbnRofSAke3llYXJ9YDtcbn1cblxuZXhwb3J0IHR5cGUgbWF5YmVTdHJpbmcgPSBzdHJpbmcgfCBudWxsO1xuXG5leHBvcnQgY29uc3QgSU1BR0VfRklMRV9UWVBFUyA9IFsncG5nJywgJ2pwZycsICdqcGVnJywgJ2dpZicsICd3ZWJwJywgJ2JtcCcsICdzdmcnXVxuXG5hc3luYyBmdW5jdGlvbiBmb3JtYXRUZXh0QmxvYihwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgdGV4dDpzdHJpbmcsIGlkeDpudW1iZXI9MSwgaXNEb2M6Ym9vbGVhbj10cnVlKXtcbiAgY29uc3QgZmlsZSA9IHBsdWdpbi5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgY29uc3Qgc291cmNlUGF0aCA9IGZpbGU/LnBhdGggYXMgc3RyaW5nO1xuICBjb25zdCByZWdleFBhdHRlcm4gPSAvXFwhXFxbXFxbKFtcXHdcXHNfXFwtXStcXC5cXHcrKVxcXVxcXXxcXCFcXFsuK1xcXVxcKChbXFx3XFxzX1xcLV0rXFwuXFx3KylcXCkvZztcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcbiAgY29uc3QgYnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjb250ZW50QXJyYXk6b2JqZWN0W10gPSBbXTtcbiAgXG4gIGxldCBudW1iZXIgPSBpZHg7XG4gIGxldCBpbnRlcmltT2JqOm9iamVjdHxBcnJheTxvYmplY3Q+O1xuICBcbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5saW5lLm1hdGNoQWxsKHJlZ2V4UGF0dGVybildO1xuICAgIGNvbnN0IGNoa0xpbmUgPSBsaW5lLnJlcGxhY2UocmVnZXhQYXR0ZXJuLCBcIlwiKTtcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGg+MCl7XG4gICAgICBpbnRlcmltT2JqID0gW11cbiAgICAgIGlmIChjaGtMaW5lLnRyaW0oKSE9PVwiXCIpIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgdGV4dCBpbmxpbmUgd2l0aCBpbWFnZShzKSBiZWxvdzogJHtsaW5lLnJlcGxhY2UocmVnZXhQYXR0ZXJuLCAnPGltYWdlUGxhY2VIb2xkZXI+Jyl9YH0pO1xuXG4gICAgICBmb3IoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcyl7XG4gICAgICAgIGNvbnN0IG1hdGNoZWQgPSBtYXRjaFsxXSA/PyBtYXRjaFsyXTtcbiAgICAgICAgaWYgKElNQUdFX0ZJTEVfVFlQRVMuY29udGFpbnMobWF0Y2hlZC5zcGxpdCgnLicpWzFdKSl7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0ID0gcGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KG1hdGNoZWQsIHNvdXJjZVBhdGgpO1xuICAgICAgICAgIGNvbnN0IGltYWdlUGF0aCA9IHRhcmdldD8ucGF0aDtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcImltYWdlIGZvdW5kOiBcIiwgaW1hZ2VQYXRoKVxuICAgICAgICAgIGlmKGltYWdlUGF0aCl7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcGx1Z2luLmFwcC52YXVsdC5yZWFkQmluYXJ5KHRhcmdldCk7XG4gICAgICAgICAgICBjb25zdCBmaWxlQnVmZmVyID0gQnVmZmVyLmlzQnVmZmVyKGRhdGEpID8gZGF0YSA6IEJ1ZmZlci5mcm9tKGRhdGEgYXMgQXJyYXlCdWZmZXIpO1xuICAgICAgICAgICAgY29uc3QgaW1TdHIgPSBgZGF0YTppbWFnZS8ke21hdGNoZWQuc3BsaXQoJy4nKVsxXX07YmFzZTY0LCR7ZmlsZUJ1ZmZlci50b1N0cmluZyhcImJhc2U2NFwiKX19YFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBwb3NUYWdTdGFydCA9IGlzRG9jPyBgJDxwb3NpdGlvbl8ke251bWJlcn0+YDogXCJcIjtcbiAgICAgICAgICAgIGNvbnN0IHBvc1RhZ0VuZCAgID0gaXNEb2M/IGAkPC9wb3NpdGlvbl8ke251bWJlcn0+YDogXCJcIjtcblxuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IHBvc1RhZ1N0YXJ0fSk7XG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcImltYWdlX3VybFwiLCBpbWFnZV91cmw6IHt1cmw6aW1TdHJ9fSk7XG4gICAgICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogcG9zVGFnRW5kfSk7XG4gICAgICAgICAgICBudW1iZXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAobGluZS50cmltKCk9PT1cIlwiKXtcbiAgICAgICAgLy8gbWVyZ2UgYnVmZmVyXG4gICAgICAgIGNvbnN0IHBvc1RhZ1N0YXJ0ID0gaXNEb2M/IGAkPHBvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuICAgICAgICBjb25zdCBwb3NUYWdFbmQgICA9IGlzRG9jPyBgJDwvcG9zaXRpb25fJHtudW1iZXJ9PmA6IFwiXCI7XG5cbiAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke3Bvc1RhZ1N0YXJ0fSR7YnVmZmVyLmpvaW4oXCJcXG5cIil9JHtwb3NUYWdFbmR9YH0pO1xuICAgICAgICBudW1iZXIrKztcbiAgICAgICAgYnVmZmVyLmxlbmd0aCA9IDA7XG4gICAgfVxuICAgIGVsc2UgaWYgKGxpbmUudHJpbSgpIT09XCJcIil7XG4gICAgICAvLyBhZGQgdG8gYnVmZmVyXG4gICAgICBidWZmZXIucHVzaChsaW5lKTtcbiAgICB9XG4gICAgLy8gYWRkIHBvc2l0aW9uIG51bWJlciBhbmQgYXBwZW5kIHRoZSBtZXNzYWdlIHRvIHRoZSBjb250ZW50IGFycmF5LlxuICB9XG5cbiAgaWYgKGJ1ZmZlci5sZW5ndGg+MCl7XG4gICAgY29uc3QgcG9zVGFnU3RhcnQgPSBpc0RvYz8gYCQ8cG9zaXRpb25fJHtudW1iZXJ9PmA6IFwiXCI7XG4gICAgICAgIGNvbnN0IHBvc1RhZ0VuZCAgID0gaXNEb2M/IGAkPC9wb3NpdGlvbl8ke251bWJlcn0+YDogXCJcIjtcblxuICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7cG9zVGFnU3RhcnR9JHtidWZmZXIuam9pbihcIlxcblwiKX0ke3Bvc1RhZ0VuZH1gfSk7XG4gICAgICAgIG51bWJlcisrO1xuICAgICAgICBidWZmZXIubGVuZ3RoID0gMDtcbiAgfVxuXG4gIHJldHVybiB7Y29udGVudEFycmF5LCBudW1iZXJ9XG59XG5mdW5jdGlvbiBnZXRRdWVyeUNvbnRleHQodmlldzpFZGl0b3JWaWV3LCBiZWZvcmVMaW5lOm51bWJlciwgYWZ0ZXJMaW5lOm51bWJlciwgc2VjdGlvbk9ubHk6Ym9vbGVhbj1mYWxzZSlcbjp7YmVmb3JlVGV4dDpzdHJpbmcsIGFmdGVyVGV4dDpzdHJpbmd9ICB7XG4gIFxuICBsZXQgbnVtYmVyID0gYmVmb3JlTGluZTtcbiAgY29uc3QgYmVmb3JlTGluZXMgPSBbXTtcbiAgd2hpbGUgKG51bWJlciA+IDApe1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgaWYgKHNlY3Rpb25Pbmx5ICYmIChsaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYmVmb3JlTGluZXMudW5zaGlmdChsaW5lLnRleHQpO1xuICAgIG51bWJlci0tO1xuICB9XG5cbiAgbnVtYmVyID0gYWZ0ZXJMaW5lO1xuICBjb25zdCBhZnRlckxpbmVzID0gW107XG4gIHdoaWxlIChudW1iZXIgPCB2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICBpZiAoc2VjdGlvbk9ubHkgJiYgKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSl7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBhZnRlckxpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICBudW1iZXIrKztcbiAgfVxuICBcblxuICBjb25zdCBiZWZvcmVUZXh0ID0gYmVmb3JlTGluZXMuam9pbignXFxuJylcbiAgY29uc3QgYWZ0ZXJUZXh0ID0gYWZ0ZXJMaW5lcy5qb2luKCdcXG4nKVxuXG4gIHJldHVybiB7YmVmb3JlVGV4dCwgYWZ0ZXJUZXh0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3VibWl0VG9MTE0odmlldzpFZGl0b3JWaWV3LCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG4gICAgY29uc3Qgc3VibWl0VGltZSA9IGZvcm1hdERhdGUoRGF0ZS5ub3coKSk7XG4gICAgY29uc3Qge2NvbnRlbnQsIGJlZm9yZUxpbmUsIGFmdGVyTGluZX0gPSBnZXRMTE1xdWVyeSh2aWV3KTtcbiAgICBcbiAgICBpZiAoY29udGVudC5jb250YWlucyhcIkByZXNwb25zZVwiKSkgcmV0dXJuO1xuICAgIFxuICAgIGNvbnN0IGRlZmF1bHRUeXBlID0gcGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0O1xuICAgIGNvbnN0IGZpcnN0V29yZCA9IGNvbnRlbnQuc3BsaXQoXCIgXCIpWzBdO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBmaXJzdFdvcmQuc3BsaXQoXCI6XCIpLnNsaWNlKDEsIHVuZGVmaW5lZCk7XG4gICAgaWYoKG9wdGlvbnMubGVuZ3RoPT09MSkgJiYob3B0aW9uc1swXT09PVwiXCIpKSBvcHRpb25zLmxlbmd0aCA9IDA7XG4gICAgbGV0IGJlZm9yZVRleHQ6IG1heWJlU3RyaW5nPW51bGwsIGFmdGVyVGV4dDogbWF5YmVTdHJpbmc9bnVsbDtcblxuICAgIGlmKG9wdGlvbnMuY29udGFpbnMoJ2lzb2xhdGVkJyl8fCgoZGVmYXVsdFR5cGU9PT1cImlzb2xhdGVkXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKSl7XG4gICAgICBiZWZvcmVUZXh0ID0gbnVsbDtcbiAgICAgIGFmdGVyVGV4dCA9IG51bGw7XG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJkb2NcIil8fChkZWZhdWx0VHlwZT09PVwiZG9jXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICAgIFxuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNvbnRhaW5zKFwic2VjdGlvblwiKXx8KGRlZmF1bHRUeXBlPT09XCJzZWN0aW9uXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lLCB0cnVlKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgYW5zd2VyID0gYXdhaXQgcGluZ0xMTShwbHVnaW4sIGNvbnRlbnQsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG4gICAgaWYoYW5zd2VyKXtcbiAgICAgIGNvbnN0IHJlY2VpdmVUaW1lID0gZm9ybWF0RGF0ZShEYXRlLm5vdygpKTtcbiAgICAgIGFwcGVuZEFuc3dlcih2aWV3LCBhbnN3ZXIsIHN1Ym1pdFRpbWUsIHJlY2VpdmVUaW1lKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZEFuc3dlcih2aWV3OkVkaXRvclZpZXcsIHRleHQ6c3RyaW5nLCBzdWJtaXRUaW1lOnN0cmluZywgcmVjZWl2ZVRpbWU6c3RyaW5nKXtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgd2hpbGUgKGN1cnJMaW5lLm51bWJlcjx2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgICBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoY3VyckxpbmUubnVtYmVyICsgMSk7XG4gICAgICBpZiAoKGN1cnJMaW5lLnRleHQudHJpbSgpPT09XCJcIil8fChjdXJyTGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKXtcbiAgICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlci0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOmN1cnJMaW5lLnRvfSxcbiAgICAgIHNjcm9sbEludG9WaWV3OnRydWVcbiAgICB9KVxuXG4gICAgY29uc3QgZm9ybWF0dGVkVGV4dCA9IGAgKHN1Ym1pdHRlZCBhdCAke3N1Ym1pdFRpbWV9KVxcbioqQHJlc3BvbnNlKiogJHt0ZXh0fSAocmVzcG9uZGVkIGF0ICR7cmVjZWl2ZVRpbWV9KVxcblxcbmBcbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgY2hhbmdlczoge2Zyb206Y3VyckxpbmUudG8sIGluc2VydDogZm9ybWF0dGVkVGV4dH0sXG4gICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogY3VyckxpbmUudG8rZm9ybWF0dGVkVGV4dC5sZW5ndGh9XG4gICAgfSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGluZ0xMTShwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgcXVlcnk6c3RyaW5nLCBiZWZvcmVUZXh0Om1heWJlU3RyaW5nLCBhZnRlclRleHQ6bWF5YmVTdHJpbmcpOlByb21pc2U8c3RyaW5nfG51bGw+e1xuICAgIGNvbnN0IGJhc2VfdXJsID0gcGx1Z2luLnNldHRpbmdzLmJhc2VVUkw7XG4gICAgY29uc3QgdXJsID0gYCR7YmFzZV91cmx9L3YxL2NoYXQvY29tcGxldGlvbnNgO1xuICAgIGNvbnN0IG1vZGVsID0gcGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcbiAgICBjb25zdCBzeXN0ZW1fcHJvbXB0ID0gXCJZb3UgYXJlIGEgY29uY2lzZSBhbmQgc3VjY2luY3QgYXNzaXN0YW50IG9wZXJhdGluZyBpbnNpZGUgT2JzaWRpYW4uTUQsIGEgc3BlY2lhbGl6ZWQgbm90ZSB0YWtpbmcgYXBwLlwiO1xuICAgIFxuICAgIGNvbnN0IG1ldGhvZCA9IFwiUE9TVFwiO1xuXG4gICAgbGV0IGJlZkFycmF5Rm9ybWF0dGVkOm9iamVjdFtdPVtdLCBhZnRBcnJheUZvcm1hdHRlZDpvYmplY3RbXT1bXSwgbnVtOm51bWJlcj0wO1xuICAgIFxuICAgIGlmIChiZWZvcmVUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBiZWZvcmVUZXh0LCBudW0pO1xuICAgICAgbnVtID0gbnVtYmVyO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQgPSBjb250ZW50QXJyYXk7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZC51bnNoaWZ0KFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQucHVzaChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgYWN0aXZlX251bSA9IG51bTtcbiAgICBudW0rKztcbiAgICBcbiAgICBpZiAoYWZ0ZXJUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBhZnRlclRleHQsIG51bSk7XG4gICAgICBudW0gPSBudW1iZXI7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICAgIGFmdEFycmF5Rm9ybWF0dGVkLnVuc2hpZnQoXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZC5wdXNoKFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBsZXQge2NvbnRlbnRBcnJheSwgbnVtYmVyfSA9IGF3YWl0IGZvcm1hdFRleHRCbG9iKHBsdWdpbiwgcXVlcnkuc3BsaXQoXCIgXCIpLnNsaWNlKDEsIHVuZGVmaW5lZCkuam9pbihcIiBcIiksIG51bSwgZmFsc2UpXG4gICAgY29uc3QgcXVlcnlBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgICB1cmwsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBcIkJlYXJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtb2RlbCxcbiAgICAgICAgICBtZXNzYWdlczogW1xuICAgICAgICAgICAge3JvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHBsdWdpbi5zeXN0ZW1Qcm9tcHR9LFxuICAgICAgICAgICAge3JvbGU6IFwidXNlclwiLCBcbiAgICAgICAgICAgICAgY29udGVudDogW1xuICAgICAgICAgICAgICAgIC4uLmJlZkFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYDxwb3NpdGlvbl8ke2FjdGl2ZV9udW19PiAqVGhpcyBpcyB0aGUgcG9zaXRpb24gb2YgdGhlIHVzZXIgcXVlc3Rpb24vcHJvbXB0IGN1cnJlbnRseSBwb3NlZCB0byB5b3UqIDwvcG9zaXRpb25fJHthY3RpdmVfbnVtfT5gfSxcbiAgICAgICAgICAgICAgICAuLi5hZnRBcnJheUZvcm1hdHRlZCxcbiAgICAgICAgICAgICAgICB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBjdXJyZW50IHVzZXIgcHJvbXB0OiBgfSxcbiAgICAgICAgICAgICAgICAuLi5xdWVyeUFycmF5Rm9ybWF0dGVkLFxuICAgICAgICAgICAgICBdfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgdGVtcGVyYXR1cmU6MC45LFxuICAgICAgICB9KVxuICAgIH1cbiAgIFxuICBsZXQgcmVzcG9uc2U7XG4gIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2UoXCJsbG0gaXMgdGhpbmtpbmcuLi5cIiwgMCk7XG4gIHRyeXtcbiAgICByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwocGF5bG9hZCk7XG4gICAgbm90aWNlLnNldE1lc3NhZ2UoXCJyZXNwb25zZSBpcyByZWFkeSFcIilcbiAgICBzZXRUaW1lb3V0KCgpPT5ub3RpY2UuaGlkZSgpLCAxNTAwKTtcbiAgfVxuICBjYXRjaChlKXtcbiAgICBub3RpY2Uuc2V0TWVzc2FnZShcImxsbSBjYWxsIGZhaWxlZFwiKTtcbiAgICBzZXRUaW1lb3V0KCgpPT5ub3RpY2UuaGlkZSgpLCAxNTAwKVxuICB9XG4gIHJldHVybiByZXNwb25zZT8uanNvbi5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0TExNcXVlcnkodmlldzpFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGNvbnN0IGFsbExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBcbiAgICBjb25zdCBudW1MaW5lcyA9IHZpZXcuc3RhdGUuZG9jLmxpbmVzO1xuICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICBhbGxMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgXG4gICAgbGV0IGJlZm9yZUxpbmU6bnVtYmVyPTEwMDAwMDtcbiAgICBsZXQgYWZ0ZXJMaW5lOm51bWJlcj0wO1xuXG4gICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgbnVtYmVyLS07XG4gICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpe1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIGFsbExpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIGJlZm9yZUxpbmU9bnVtYmVyO1xuICAgIFxuICAgIG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIHdoaWxlKG51bWJlcjwobnVtTGluZXMtMSkpe1xuICAgICAgbnVtYmVyKys7XG4gICAgICBjb25zdCBuZXh0TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChuZXh0TGluZSAmJiAoKG5leHRMaW5lPy50ZXh0LnRyaW0oKSAhPT0gXCJcIil8fChuZXh0TGluZT8udGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSkpe1xuICAgICAgICBhbGxMaW5lcy5wdXNoKG5leHRMaW5lLnRleHQpXG4gICAgICB9XG4gICAgICBlbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgYWZ0ZXJMaW5lPW51bWJlcjtcbiAgICByZXR1cm4ge2NvbnRlbnQ6IGFsbExpbmVzLmpvaW4oXCJcXG5cIiksIGJlZm9yZUxpbmUsIGFmdGVyTGluZX1cblxufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lQUlXaWRnZXQgZXh0ZW5kcyBXaWRnZXRUeXBlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW4sXG4gICAgcHJpdmF0ZSB2aWV3OiBFZGl0b3JWaWV3LFxuICAgIHByaXZhdGUgZnJvbTogbnVtYmVyLFxuICAgIHByaXZhdGUgdG86IG51bWJlcixcbiAgKXtcbiAgICBzdXBlcigpXG4gIH1cbiAgXG4gIGVxKG90aGVyOiBJbmxpbmVBSVdpZGdldCkge1xuICAgIHJldHVybiB0aGlzLmZyb20gPT09IG90aGVyLmZyb20gJiYgdGhpcy50byA9PT0gb3RoZXIudG87XG4gIH1cblxuICB0b0RPTSh2aWV3OkVkaXRvclZpZXcpOkhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBxdWVyeVdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICBidXR0b24uaW5uZXJUZXh0ID0gXCJzdWJtaXRcIjtcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzBweCc7XG4gICAgYnV0dG9uLmlkID0gXCJhaS1zdWJtaXQtYnV0dG9uXCJcbiAgICBcbiAgICBidXR0b24ub25jbGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgc3VibWl0VG9MTE0odGhpcy52aWV3LCB0aGlzLnBsdWdpbik7XG4gICAgfTtcbiAgICBxdWVyeVdyYXBwZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICByZXR1cm4gcXVlcnlXcmFwcGVyO1xuICB9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHZpZXdQbHVnaW5GYWN0b3J5TWV0aG9kKF9wbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG4gIGNsYXNzIElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luIGltcGxlbWVudHMgUGx1Z2luVmFsdWUge1xuICAgIGRlY29yYXRpb25zOiBEZWNvcmF0aW9uU2V0O1xuICAgIHBsdWdpbjogSW5MaW5lQUlUdXRvclBsdWdpbjtcblxuICAgIGNvbnN0cnVjdG9yKHZpZXc6IEVkaXRvclZpZXcpIHtcbiAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmJ1aWxkRGVjb3JhdGlvbnModmlldyk7XG4gICAgICB0aGlzLnBsdWdpbiA9IF9wbHVnaW47XG4gICAgfVxuXG4gICAgdXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuICAgICAgaWYgKHVwZGF0ZS5kb2NDaGFuZ2VkIHx8IHVwZGF0ZS52aWV3cG9ydENoYW5nZWQpIHtcbiAgICAgICAgdGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuYnVpbGREZWNvcmF0aW9ucyh1cGRhdGUudmlldyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZGVzdHJveSgpIHt9XG5cbiAgICBidWlsZERlY29yYXRpb25zKHZpZXc6IEVkaXRvclZpZXcpOiBEZWNvcmF0aW9uU2V0IHtcbiAgICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgUmFuZ2VTZXRCdWlsZGVyPERlY29yYXRpb24+KCk7XG5cbiAgICAgIGNvbnN0IHBvcyA9IHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4uaGVhZDtcbiAgICAgIFxuICAgICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgICAgbGV0IG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgICAgXG4gICAgICBjb25zdCBwYXJhTGluZXM6IHN0cmluZ1tdID0gW11cbiAgICAgIHBhcmFMaW5lcy5wdXNoKGxpbmUudGV4dClcbiAgICAgIHdoaWxlKG51bWJlcj4xKXtcbiAgICAgICAgbnVtYmVyLS07XG4gICAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpID09PSBcIlwiKSBicmVhaztcbiAgICAgICAgZWxzZSBwYXJhTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgIH1cblxuICAgICAgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgICB3aGlsZSAobnVtYmVyIDwgKHZpZXcuc3RhdGUuZG9jLmxpbmVzLTEpKXtcbiAgICAgICAgbnVtYmVyKys7XG4gICAgICAgIGNvbnN0IEFmdExpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICAgIGlmICgoQWZ0TGluZS50ZXh0LnRyaW0oKT09PVwiXCIpIHx8IChBZnRMaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpIGJyZWFrO1xuICAgICAgICBlbHNlIHBhcmFMaW5lcy5wdXNoKEFmdExpbmUudGV4dCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IHBhcmFUZXh0ID0gcGFyYUxpbmVzLmpvaW4oJ1xcbicpO1xuICAgIFxuICAgICAgY29uc3QgcHJldkxpbmUgPSBsaW5lLm51bWJlciA+IDEgPyB2aWV3LnN0YXRlLmRvYy5saW5lKGxpbmUubnVtYmVyLTEpOiBudWxsO1xuICAgICAgXG4gICAgICBpZihsaW5lLnRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgKGxpbmUubnVtYmVyID4gMSkgJiYgKHByZXZMaW5lPy50ZXh0LnRyaW0oKSAhPT0gXCJcIikpe1xuICAgICAgICAvLyB0aGlzIGNvbmRpdGlvbiBtZWFucyB0aGF0IGl0IGlzIG5vdCB0aGUgZmlyc3QgbGluZSBhbmQgaXQgaXMgbm90IGEgcGFyYWdyYXBoIGJ5IGl0c2VsZi5cbiAgICAgICAgY29uc3QgaW5zZXJ0aW9uU3RyID0gXCJcXG5cIlxuICAgICAgICBzZXRUaW1lb3V0KCgpPT57dmlldy5kaXNwYXRjaCh7XG4gICAgICAgICAgY2hhbmdlczoge2Zyb206bGluZS5mcm9tLCBpbnNlcnQ6IGluc2VydGlvblN0cn0sXG4gICAgICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOiBsaW5lLnRvK2luc2VydGlvblN0ci5sZW5ndGh9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbHNlIGlmIChwYXJhVGV4dC5zdGFydHNXaXRoKFwiQGFzc2lzdGFudFwiKSAmJiAhKHBhcmFUZXh0LmNvbnRhaW5zKFwiQHJlc3BvbnNlXCIpKSl7XG4gICAgICAgIGJ1aWxkZXIuYWRkKGxpbmUudG8sIGxpbmUudG8sIFxuICAgICAgICAgIERlY29yYXRpb24ud2lkZ2V0KFxuICAgICAgICAgICAge3dpZGdldDogbmV3IElubGluZUFJV2lkZ2V0KHRoaXMucGx1Z2luLCB2aWV3LCBsaW5lLnRvLCBsaW5lLnRvKSwgc2lkZTogMX1cbiAgICAgICAgICApKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGJ1aWxkZXIuZmluaXNoKCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcGx1Z2luU3BlYzogUGx1Z2luU3BlYzxJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbj4gPSB7XG4gICAgZGVjb3JhdGlvbnM6ICh2YWx1ZTogSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4pID0+IHZhbHVlLmRlY29yYXRpb25zLFxuICB9O1xuXG4gIGNvbnN0IGlubGluZUFJQUlQbHVnaW4gPSBWaWV3UGx1Z2luLmZyb21DbGFzcyhcbiAgICBJbmxpbmVBSUFURWRpdG9yVklld1BsdWdpbixcbiAgICBwbHVnaW5TcGVjXG4gICk7XG5cbnJldHVybiBpbmxpbmVBSUFJUGx1Z2luXG59Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUFBQSxtQkFBcUU7OztBQ0NyRSxzQkFBNkM7QUFhdEMsSUFBTSxtQkFBeUQ7QUFBQSxFQUNyRSxTQUFTO0FBQUEsRUFDVCxXQUFXO0FBQUE7QUFBQSxFQUVYLGdCQUFnQjtBQUFBO0FBQUE7QUFHakI7QUFDTyxJQUFNLDJCQUFOLGNBQXVDLGlDQUFnQjtBQUFBLEVBRzdELFlBQVksS0FBUyxRQUEyQjtBQUMvQyxVQUFNLEtBQUssTUFBTTtBQUNqQixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFFB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LEtBQUssS0FBRyxhQUFhLE9BQU07QUFBQSxVQUMvQyxDQUFDO0FBQUEsUUFDSCxDQUFDO0FBQUEsTUFDSCxXQUNTLFNBQVMsV0FBVyxZQUFZLEtBQUssQ0FBRSxTQUFTLFNBQVMsV0FBVyxHQUFHO0FBQzlFLGdCQUFRO0FBQUEsVUFBSSxLQUFLO0FBQUEsVUFBSSxLQUFLO0FBQUEsVUFDeEIsdUJBQVc7QUFBQSxZQUNULEVBQUMsUUFBUSxJQUFJLGVBQWUsS0FBSyxRQUFRLE1BQU0sS0FBSyxJQUFJLEtBQUssRUFBRSxHQUFHLE1BQU0sRUFBQztBQUFBLFVBQzNFO0FBQUEsUUFBQztBQUFBLE1BQ0w7QUFDQSxhQUFPLFFBQVEsT0FBTztBQUFBLElBQ3hCO0FBQUEsRUFDRjtBQUVBLFFBQU0sYUFBcUQ7QUFBQSxJQUN6RCxhQUFhLENBQUMsVUFBc0MsTUFBTTtBQUFBLEVBQzVEO0FBRUEsUUFBTSxtQkFBbUIsdUJBQVc7QUFBQSxJQUNsQztBQUFBLElBQ0E7QUFBQSxFQUNGO0FBRUYsU0FBTztBQUNQOzs7QUYzWkEsSUFBcUIsc0JBQXJCLGNBQWlELHdCQUFPO0FBQUEsRUFJdkQsTUFBTSxlQUFjO0FBQ25CLFNBQUssV0FBVyxPQUFPLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixNQUFNLEtBQUssU0FBUyxDQUFDO0FBQUEsRUFDMUU7QUFBQSxFQUVBLE1BQU0sZUFBYztBQUNuQixVQUFNLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBTSxtQkFBa0I7QUFDdkIsVUFBTSxPQUFPLEdBQUcsS0FBSyxTQUFTLEdBQUc7QUFDakMsU0FBSyxlQUFlLE1BQU0sS0FBSyxJQUFJLE1BQU0sUUFBUSxLQUFLLElBQUk7QUFBQSxFQUMzRDtBQUFBLEVBQ0EsTUFBTSxTQUFTO0FBQ2QsVUFBTSxLQUFLLGFBQWE7QUFDeEIsVUFBTSxLQUFLLGlCQUFpQjtBQUU1QixTQUFLLGNBQWMsSUFBSSx5QkFBeUIsS0FBSyxLQUFLLElBQUksQ0FBQztBQUUvRCxTQUFLLHdCQUF3QixDQUFDLHdCQUF3QixJQUFJLENBQUMsQ0FBQztBQUU1RCxTQUFLLFdBQVc7QUFBQSxNQUNmLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFNBQVMsQ0FBQztBQUFBLFFBQ1QsV0FBVyxDQUFDLE9BQU0sT0FBTztBQUFBLFFBQ3pCLEtBQUs7QUFBQSxNQUNOLENBQUM7QUFBQSxNQUNELGdCQUFnQixPQUFPLFNBQVMsU0FBUztBQUN4QyxjQUFNLGNBQWMsU0FBUyxlQUFlLGtCQUFrQjtBQUM5RCxZQUFJLGdCQUFnQixLQUFNO0FBRTFCLGNBQU0sYUFBYSxLQUFLLE9BQU87QUFDL0IsY0FBTSxZQUFZLFlBQVksSUFBSTtBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImNvbnRlbnRBcnJheSIsICJudW1iZXIiXQp9Cg==
