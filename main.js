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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9lZGl0b3ItcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge0FwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE1vZGFsLCBOb3RpY2UsIE1lbnUsIFBsdWdpbn0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTLCBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3MsIEluTGluZUFJVHV0b3JTZXR0aW5nc1RhYn0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7dmlld1BsdWdpbkZhY3RvcnlNZXRob2QsIHN1Ym1pdFRvTExNfSBmcm9tIFwiLi9lZGl0b3ItcGx1Z2luXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5MaW5lQUlUdXRvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHRcblx0c2V0dGluZ3MhOkluTGluZUFJVHV0b3JQbHVnaW5TZXR0aW5ncztcblx0c3lzdGVtUHJvbXB0ITpzdHJpbmc7XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCl7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSlcblx0fVxuXHRcblx0YXN5bmMgc2F2ZVNldHRpbmdzKCl7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTeXN0ZW1Qcm9tcHQoKXtcblx0XHRjb25zdCBwYXRoID0gYCR7dGhpcy5tYW5pZmVzdC5kaXJ9L2NvbmZpZ3MvZGVmYXVsdF9zeXNfcHJvbXB0Lm1kYDtcblx0XHR0aGlzLnN5c3RlbVByb21wdCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChwYXRoKTtcblx0fVxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRTeXN0ZW1Qcm9tcHQoKTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgSW5MaW5lQUlUdXRvclNldHRpbmdzVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbdmlld1BsdWdpbkZhY3RvcnlNZXRob2QodGhpcyldKVxuXG5cdFx0dGhpcy5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBcInN1Ym1pdC1haS1wcm9tcHRcIixcblx0XHRcdG5hbWU6IFwic3VibWl0IHRvIHRoZSBMTE1cIixcblx0XHRcdGhvdGtleXM6IFt7IFxuXHRcdFx0XHRtb2RpZmllcnM6IFtcIk1vZFwiLFwiU2hpZnRcIl0sIFxuXHRcdFx0XHRrZXk6IFwiTFwiXG5cdFx0XHR9XSxcblx0XHRcdGVkaXRvckNhbGxiYWNrOiBhc3luYyAoX2VkaXRvciwgdmlldykgPT4ge1xuXHRcdFx0XHRjb25zdCBidXR0b25DaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaS1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRcdGlmIChidXR0b25DaGVjayA9PT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHQvLyBidXR0b25DaGVjay5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0Y29uc3QgZWRpdG9yVmlldyA9IHZpZXcuZWRpdG9yLmNtIGFzIEVkaXRvclZpZXc7XG5cdFx0XHRcdGF3YWl0IHN1Ym1pdFRvTExNKGVkaXRvclZpZXcsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdH1cbn0iLCAiaW1wb3J0IHR5cGUgSW5MaW5lQUlUdXRvclBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQge0FwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZ30gZnJvbSBcIm9ic2lkaWFuXCJcblxuLy8gZXhwb3J0IHR5cGUgQVBJRnJhbWVXb3JrID0gXCJsbXN0dWRpb1wiIHwgXCJvbGxhbWFcIiB8IFwibGxhbWFjcHBcIjtcblxuZXhwb3J0IGludGVyZmFjZSBJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3Mge1xuXHRiYXNlVVJMOnN0cmluZztcblx0bW9kZWxOYW1lOnN0cmluZztcblx0Ly8gZnJhbWV3b3JrOnN0cmluZztcblx0ZGVmYXVsdENvbnRleHQ6c3RyaW5nO1xuXHQvLyBpbmxpbmVMTE1JZDpzdHJpbmc7XG5cdC8vIGlubGluZUxMTVJlc3BvbnNlSWQ6c3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGFydGlhbDxJbkxpbmVBSVR1dG9yUGx1Z2luU2V0dGluZ3M+ID0ge1xuXHRiYXNlVVJMOiBcImh0dHA6Ly8xMjcuMC4wLjE6MTIzNFwiLFxuXHRtb2RlbE5hbWU6IFwiZ29vZ2xlL2dlbW1hLTQtMjZiLWE0YlwiLFxuXHQvLyBmcmFtZXdvcms6IFwibG1zdHVkaW9cIixcblx0ZGVmYXVsdENvbnRleHQ6IFwiZG9jXCIsXG5cdC8vIGlubGluZUxMTUlkOiBcImFzc2lzdGFudFwiLFxuXHQvLyBpbmxpbmVMTE1SZXNwb25zZUlkOlwicmVzcG9uc2VcIixcbn1cbmV4cG9ydCBjbGFzcyBJbkxpbmVBSVR1dG9yU2V0dGluZ3NUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFie1xuXHRwbHVnaW46IEluTGluZUFJVHV0b3JQbHVnaW47XG5cdFxuXHRjb25zdHJ1Y3RvcihhcHA6QXBwLCBwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbil7XG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0ZGlzcGxheSgpOiB2b2lkIHtcblx0XHRsZXQge2NvbnRhaW5lckVsfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKVxuXHRcdFxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgVVJMXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJodHRwcy8vZXhhbXBsZS5jb206XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJhc2VVUkwpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFzZVVSTCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cdFx0XG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIm1vZGVsIGlkXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCk9PiB7XG5cdFx0XHRcdHRleHQuc2V0UGxhY2Vob2xkZXIoXCJjb21wYW55L2Nvb2wtbW9kZWwtMWJcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lKVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIGFjdGl2YXRpb24gaWRlbnRpZmllclwiKVxuXHRcdC8vIFx0LmFkZFRleHQoKHRleHQpPT4ge1xuXHRcdC8vIFx0XHR0ZXh0LnNldFBsYWNlaG9sZGVyKFwibGxtX2FjdGl2YXRlIVwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZClcblx0XHQvLyBcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOnN0cmluZyk9PiB7XG5cdFx0Ly8gXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmxpbmVMTE1JZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwibGxtIHJlc3BvbnNlIGlkZW50aWZpZXJcIilcblx0XHQvLyBcdC5hZGRUZXh0KCh0ZXh0KT0+IHtcblx0XHQvLyBcdFx0dGV4dC5zZXRQbGFjZWhvbGRlcihcImVsZW1lbnRhcnktd2F0c29uXCIpXG5cdFx0Ly8gXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmlubGluZUxMTVJlc3BvbnNlSWQpXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5saW5lTExNUmVzcG9uc2VJZCA9IHZhbHVlO1xuXHRcdC8vIFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0Ly8gXHRcdFx0fSlcblx0XHQvLyBcdH0pXG5cblx0XHQvLyBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQvLyBcdC5zZXROYW1lKFwiYmFja2VuZFwiKVxuXHRcdC8vIFx0LmFkZERyb3Bkb3duKChkcm9wZG93bik9PiB7XG5cdFx0Ly8gXHRcdGRyb3Bkb3duXG5cdFx0Ly8gXHRcdFx0LmFkZE9wdGlvbihcImxtc3R1ZGlvXCIsIFwiTE0tU3R1ZGlvXCIpXG5cdFx0Ly8gXHRcdFx0LmFkZE9wdGlvbihcImxsYW1hY3BwXCIsIFwibGxhbWEuY3BwXCIpXG5cdFx0Ly8gXHRcdFx0LmFkZE9wdGlvbihcIm9sbGFtYVwiLCBcIm9sbGFtYVwiKVxuXHRcdC8vIFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mcmFtZXdvcmspXG5cdFx0Ly8gXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTpzdHJpbmcpPT4ge1xuXHRcdC8vIFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZnJhbWV3b3JrID0gdmFsdWU7XG5cdFx0Ly8gXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHQvLyBcdFx0XHR9KVxuXHRcdC8vIFx0fSlcblx0XHRcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiZGVmYXVsdCBjb250ZXh0XCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKT0+IHtcblx0XHRcdFx0ZHJvcGRvd25cblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiZG9jXCIsIFwiV2hvbGUgZG9jdW1lbnRcIilcblx0XHRcdFx0XHQuYWRkT3B0aW9uKFwiaXNvbGF0ZWRcIiwgXCJObyBkb2N1bWVudCBjb250ZXh0XCIpXG5cdFx0XHRcdFx0LmFkZE9wdGlvbihcInNlY3Rpb25cIiwgXCJpbW1lZGlhdGUgc2VjdGlvbiBvbmx5XCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWU6c3RyaW5nKT0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0fSlcblxuXHR9XG59IiwgImltcG9ydCB7IFJhbmdlU2V0QnVpbGRlciB9IGZyb20gJ0Bjb2RlbWlycm9yL3N0YXRlJztcbmltcG9ydCB7cmVxdWVzdFVybCwgRWRpdG9yLCBOb3RpY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7XG4gIERlY29yYXRpb24sXG4gIERlY29yYXRpb25TZXQsXG4gIEVkaXRvclZpZXcsXG4gIFBsdWdpblNwZWMsXG4gIFBsdWdpblZhbHVlLFxuICBWaWV3UGx1Z2luLFxuICBWaWV3VXBkYXRlLFxuICBXaWRnZXRUeXBlLFxufSBmcm9tICdAY29kZW1pcnJvci92aWV3JztcblxuaW1wb3J0IEluTGluZUFJVHV0b3JQbHVnaW4gZnJvbSAnLi9tYWluJztcbmltcG9ydCB7IGJlZm9yZSB9IGZyb20gJ25vZGU6dGVzdCc7XG5cbmNvbnN0IFNFUEFSQVRPUiA9IFwiLVwiLnJlcGVhdCgxMCk7XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGUodGltZXN0YW1wOm51bWJlcik6c3RyaW5ne1xuICBjb25zdCBtb250aE5hbWVzID0gW1wiamFuXCIsICdmZWInLCBcImFwclwiLCAnbWF5JywgJ2p1bicsICdqdWwnLFxuICAgICAgICAgICAgICBcImF1Z1wiLCBcInNlcFwiLCBcIm9jdFwiLCBcIm5vdlwiLCBcImRlY1wiXTtcbiAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHRpbWVzdGFtcCk7XG4gIGNvbnN0IGFkZFBhZGRpbmcgPSAobnVtOm51bWJlcik6IHN0cmluZyA9PiBudW0udG9TdHJpbmcoKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gIGNvbnN0IGhoID0gYWRkUGFkZGluZyhkYXRlLmdldEhvdXJzKCkpO1xuICBjb25zdCBtbSA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRNaW51dGVzKCkpO1xuICBjb25zdCBkYXkgPSBhZGRQYWRkaW5nKGRhdGUuZ2V0RGF0ZSgpKTtcbiAgY29uc3QgbW9udGggPSBtb250aE5hbWVzWyhkYXRlLmdldE1vbnRoKCkpLTFdO1xuICBjb25zdCB5ZWFyID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuXG4gIHJldHVybiBgJHtoaH06JHttbX0gJHtkYXl9ICR7bW9udGh9ICR7eWVhcn1gO1xufVxuXG5leHBvcnQgdHlwZSBtYXliZVN0cmluZyA9IHN0cmluZyB8IG51bGw7XG5cbmV4cG9ydCBjb25zdCBJTUFHRV9GSUxFX1RZUEVTID0gWydwbmcnLCAnanBnJywgJ2pwZWcnLCAnZ2lmJywgJ3dlYnAnLCAnYm1wJywgJ3N2ZyddXG5cbmFzeW5jIGZ1bmN0aW9uIGZvcm1hdFRleHRCbG9iKHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luLCB0ZXh0OnN0cmluZywgaWR4Om51bWJlcj0xLCBpc0RvYzpib29sZWFuPXRydWUpe1xuICAvLyBjb25zdCByZWdleFBhdHRlcm46IFJlZ0V4cCA9IG5ldyBSZWdFeHAoXCJcXCFcXFtcXFsoW1xcd1xccy5cXC1fXSspXFxdXFxdXCIsICdnJyk7XG4gIGNvbnN0IGZpbGUgPSBwbHVnaW4uYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gIGNvbnN0IHNvdXJjZVBhdGggPSBmaWxlPy5wYXRoIGFzIHN0cmluZztcbiAgY29uc3QgcmVnZXhQYXR0ZXJuID0gL1xcIVxcW1xcWyhbXFx3XFxzX1xcLV0rXFwuXFx3KylcXF1cXF18XFwhXFxbLitcXF1cXCgoW1xcd1xcc19cXC1dK1xcLlxcdyspXFwpL2c7XG4gIC8vIGNvbnN0IHJlZ2V4UGF0dGVyblRleHQgPSAvXFwhXFxbXFxbW1xcd1xcc19cXC1dK1xcLlxcdytcXF1cXF18XFwhXFxbLitcXF1cXCgoW1xcd1xcc19cXC1dK1xcLlxcdyspXFwpL2dcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcbiAgY29uc3QgYnVmZmVyOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjb250ZW50QXJyYXk6b2JqZWN0W10gPSBbXTtcbiAgXG4gIGxldCBudW1iZXIgPSBpZHg7XG4gIGxldCBpbnRlcmltT2JqOm9iamVjdHxBcnJheTxvYmplY3Q+O1xuICBcbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5saW5lLm1hdGNoQWxsKHJlZ2V4UGF0dGVybildO1xuICAgIGNvbnN0IGNoa0xpbmUgPSBsaW5lLnJlcGxhY2UocmVnZXhQYXR0ZXJuLCBcIlwiKTtcbiAgICAvLyBjb25zdCB0ZXh0TWF0Y2hlcyA9IFsuLi5saW5lLm1hdGNoQWxsKHJlZ2V4UGF0dGVyblRleHQpXTtcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGg+MCl7XG4gICAgICAvLyBleHRyYWN0IGltYWdlLCBjb252ZXJ0IHRvIGJhc2VcbiAgICAgIGludGVyaW1PYmogPSBbXVxuICAgICAgaWYgKGNoa0xpbmUudHJpbSgpIT09XCJcIikgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGB0ZXh0IGlubGluZSB3aXRoIGltYWdlKHMpIGJlbG93OiAke2xpbmUucmVwbGFjZShyZWdleFBhdHRlcm4sICc8aW1hZ2VQbGFjZUhvbGRlcj4nKX1gfSk7XG5cbiAgICAgIGZvcihjb25zdCBtYXRjaCBvZiBtYXRjaGVzKXtcbiAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG1hdGNoWzFdID8/IG1hdGNoWzJdO1xuICAgICAgICBpZiAoSU1BR0VfRklMRV9UWVBFUy5jb250YWlucyhtYXRjaGVkLnNwbGl0KCcuJylbMV0pKXtcbiAgICAgICAgICBjb25zdCB0YXJnZXQgPSBwbHVnaW4uYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QobWF0Y2hlZCwgc291cmNlUGF0aCk7XG4gICAgICAgICAgY29uc3QgaW1hZ2VQYXRoID0gdGFyZ2V0Py5wYXRoO1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1hZ2UgZm91bmQ6IFwiLCBpbWFnZVBhdGgpXG4gICAgICAgICAgaWYoaW1hZ2VQYXRoKXtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBwbHVnaW4uYXBwLnZhdWx0LnJlYWRCaW5hcnkodGFyZ2V0KTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVCdWZmZXIgPSBCdWZmZXIuaXNCdWZmZXIoZGF0YSkgPyBkYXRhIDogQnVmZmVyLmZyb20oZGF0YSBhcyBBcnJheUJ1ZmZlcik7XG4gICAgICAgICAgICBjb25zdCBpbVN0ciA9IGBkYXRhOmltYWdlLyR7bWF0Y2hlZC5zcGxpdCgnLicpWzFdfTtiYXNlNjQsJHtmaWxlQnVmZmVyLnRvU3RyaW5nKFwiYmFzZTY0XCIpfX1gXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IHBvc1RhZ1N0YXJ0ID0gaXNEb2M/IGAkPHBvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuICAgICAgICAgICAgY29uc3QgcG9zVGFnRW5kICAgPSBpc0RvYz8gYCQ8L3Bvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuXG4gICAgICAgICAgICAvLyBjb25zdCBiZWZUZXh0ID0gdGV4dE1hdGNoZXNbMV0/P3RleHRNYXRjaGVzWzRdO1xuICAgICAgICAgICAgLy8gY29uc3QgYWZ0VGV4dCA9IHRleHRNYXRjaGVzWzJdPz90ZXh0TWF0Y2hlc1s1XTtcblxuICAgICAgICAgICAgY29udGVudEFycmF5LnB1c2goe3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IHBvc1RhZ1N0YXJ0fSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIGlmKGJlZlRleHQpIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OmJlZlRleHR9KTtcbiAgICAgICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwiaW1hZ2VfdXJsXCIsIGltYWdlX3VybDoge3VybDppbVN0cn19KTtcbiAgICAgICAgICAgIC8vIGlmKGFmdFRleHQpIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OmFmdFRleHR9KTtcbiAgICAgICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBwb3NUYWdFbmR9KTtcbiAgICAgICAgICAgIG51bWJlcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChsaW5lLnRyaW0oKT09PVwiXCIpe1xuICAgICAgICAvLyBtZXJnZSBidWZmZXJcbiAgICAgICAgY29uc3QgcG9zVGFnU3RhcnQgPSBpc0RvYz8gYCQ8cG9zaXRpb25fJHtudW1iZXJ9PmA6IFwiXCI7XG4gICAgICAgIGNvbnN0IHBvc1RhZ0VuZCAgID0gaXNEb2M/IGAkPC9wb3NpdGlvbl8ke251bWJlcn0+YDogXCJcIjtcblxuICAgICAgICBjb250ZW50QXJyYXkucHVzaCh7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7cG9zVGFnU3RhcnR9JHtidWZmZXIuam9pbihcIlxcblwiKX0ke3Bvc1RhZ0VuZH1gfSk7XG4gICAgICAgIG51bWJlcisrO1xuICAgICAgICBidWZmZXIubGVuZ3RoID0gMDtcbiAgICB9XG4gICAgZWxzZSBpZiAobGluZS50cmltKCkhPT1cIlwiKXtcbiAgICAgIC8vIGFkZCB0byBidWZmZXJcbiAgICAgIGJ1ZmZlci5wdXNoKGxpbmUpO1xuICAgIH1cbiAgICAvLyBhZGQgcG9zaXRpb24gbnVtYmVyIGFuZCBhcHBlbmQgdGhlIG1lc3NhZ2UgdG8gdGhlIGNvbnRlbnQgYXJyYXkuXG4gIH1cblxuICBpZiAoYnVmZmVyLmxlbmd0aD4wKXtcbiAgICBjb25zdCBwb3NUYWdTdGFydCA9IGlzRG9jPyBgJDxwb3NpdGlvbl8ke251bWJlcn0+YDogXCJcIjtcbiAgICAgICAgY29uc3QgcG9zVGFnRW5kICAgPSBpc0RvYz8gYCQ8L3Bvc2l0aW9uXyR7bnVtYmVyfT5gOiBcIlwiO1xuXG4gICAgICAgIGNvbnRlbnRBcnJheS5wdXNoKHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtwb3NUYWdTdGFydH0ke2J1ZmZlci5qb2luKFwiXFxuXCIpfSR7cG9zVGFnRW5kfWB9KTtcbiAgICAgICAgbnVtYmVyKys7XG4gICAgICAgIGJ1ZmZlci5sZW5ndGggPSAwO1xuICB9XG5cbiAgcmV0dXJuIHtjb250ZW50QXJyYXksIG51bWJlcn1cbn1cbmZ1bmN0aW9uIGdldFF1ZXJ5Q29udGV4dCh2aWV3OkVkaXRvclZpZXcsIGJlZm9yZUxpbmU6bnVtYmVyLCBhZnRlckxpbmU6bnVtYmVyLCBzZWN0aW9uT25seTpib29sZWFuPWZhbHNlKVxuOntiZWZvcmVUZXh0OnN0cmluZywgYWZ0ZXJUZXh0OnN0cmluZ30gIHtcbiAgXG4gIGxldCBudW1iZXIgPSBiZWZvcmVMaW5lO1xuICBjb25zdCBiZWZvcmVMaW5lcyA9IFtdO1xuICB3aGlsZSAobnVtYmVyID4gMCl7XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICBpZiAoc2VjdGlvbk9ubHkgJiYgKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSl7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBiZWZvcmVMaW5lcy51bnNoaWZ0KGxpbmUudGV4dCk7XG4gICAgbnVtYmVyLS07XG4gIH1cblxuICBudW1iZXIgPSBhZnRlckxpbmU7XG4gIGNvbnN0IGFmdGVyTGluZXMgPSBbXTtcbiAgd2hpbGUgKG51bWJlciA8IHZpZXcuc3RhdGUuZG9jLmxpbmVzKXtcbiAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgIGlmIChzZWN0aW9uT25seSAmJiAobGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKXtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGFmdGVyTGluZXMucHVzaChsaW5lLnRleHQpO1xuICAgIG51bWJlcisrO1xuICB9XG4gIFxuXG4gIGNvbnN0IGJlZm9yZVRleHQgPSBiZWZvcmVMaW5lcy5qb2luKCdcXG4nKVxuICBjb25zdCBhZnRlclRleHQgPSBhZnRlckxpbmVzLmpvaW4oJ1xcbicpXG5cbiAgcmV0dXJuIHtiZWZvcmVUZXh0LCBhZnRlclRleHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdWJtaXRUb0xMTSh2aWV3OkVkaXRvclZpZXcsIHBsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luKXtcbiAgICBjb25zdCBzdWJtaXRUaW1lID0gZm9ybWF0RGF0ZShEYXRlLm5vdygpKTtcbiAgICBjb25zdCB7Y29udGVudCwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfSA9IGdldExMTXF1ZXJ5KHZpZXcpO1xuICAgIFxuICAgIGlmIChjb250ZW50LmNvbnRhaW5zKFwiQHJlc3BvbnNlXCIpKSByZXR1cm47XG4gICAgXG4gICAgY29uc29sZS5sb2coXCJzdWJtaXR0ZWQgYXQ6XCIsIHN1Ym1pdFRpbWUpO1xuICAgIFxuICAgIGNvbnN0IGRlZmF1bHRUeXBlID0gcGx1Z2luLnNldHRpbmdzLmRlZmF1bHRDb250ZXh0O1xuICAgIGNvbnN0IGZpcnN0V29yZCA9IGNvbnRlbnQuc3BsaXQoXCIgXCIpWzBdO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBmaXJzdFdvcmQuc3BsaXQoXCI6XCIpLnNsaWNlKDEsIHVuZGVmaW5lZCk7XG4gICAgaWYoKG9wdGlvbnMubGVuZ3RoPT09MSkgJiYob3B0aW9uc1swXT09PVwiXCIpKSBvcHRpb25zLmxlbmd0aCA9IDA7XG4gICAgLy8gbGV0IGFuc3dlcjpzdHJpbmc7XG4gICAgbGV0IGJlZm9yZVRleHQ6IG1heWJlU3RyaW5nPW51bGwsIGFmdGVyVGV4dDogbWF5YmVTdHJpbmc9bnVsbDtcblxuICAgIGlmKG9wdGlvbnMuY29udGFpbnMoJ2lzb2xhdGVkJyl8fCgoZGVmYXVsdFR5cGU9PT1cImlzb2xhdGVkXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKSl7XG4gICAgICBiZWZvcmVUZXh0ID0gbnVsbDtcbiAgICAgIGFmdGVyVGV4dCA9IG51bGw7XG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJkb2NcIil8fChkZWZhdWx0VHlwZT09PVwiZG9jXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICAgIFxuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNvbnRhaW5zKFwic2VjdGlvblwiKXx8KGRlZmF1bHRUeXBlPT09XCJzZWN0aW9uXCIpICYmIChvcHRpb25zLmxlbmd0aD09PTApKXtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lLCB0cnVlKTtcbiAgICAgIC8vIGNvbnN0IGNvbnRleHQgPSBnZXRRdWVyeUNvbnRleHQodmlldywgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lKTtcbiAgICAgIGJlZm9yZVRleHQgPSBjb250ZXh0LmJlZm9yZVRleHQ7XG4gICAgICBhZnRlclRleHQgPSBjb250ZXh0LmFmdGVyVGV4dDtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgYW5zd2VyID0gYXdhaXQgcGluZ0xMTShwbHVnaW4sIGNvbnRlbnQsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG4gICAgaWYoYW5zd2VyKXtcbiAgICAgIC8vIG5ldyBOb3RpY2UoXCJSZXNwb25zZSByZWNlaXZlZCFcIilcbiAgICAgIGNvbnNvbGUubG9nKGFuc3dlcik7XG4gICAgICBjb25zdCByZWNlaXZlVGltZSA9IGZvcm1hdERhdGUoRGF0ZS5ub3coKSk7XG4gICAgXG4gICAgICBhcHBlbmRBbnN3ZXIodmlldywgYW5zd2VyLCBzdWJtaXRUaW1lLCByZWNlaXZlVGltZSk7XG4gICAgfVxuICAgIGVsc2V7XG4gICAgICBuZXcgTm90aWNlKFwiQ2FsbCBmYWlsZWRcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZEFuc3dlcih2aWV3OkVkaXRvclZpZXcsIHRleHQ6c3RyaW5nLCBzdWJtaXRUaW1lOnN0cmluZywgcmVjZWl2ZVRpbWU6c3RyaW5nKXtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgd2hpbGUgKGN1cnJMaW5lLm51bWJlcjx2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgICBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoY3VyckxpbmUubnVtYmVyICsgMSk7XG4gICAgICBpZiAoKGN1cnJMaW5lLnRleHQudHJpbSgpPT09XCJcIil8fChjdXJyTGluZS50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKXtcbiAgICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlci0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOmN1cnJMaW5lLnRvfSxcbiAgICAgIHNjcm9sbEludG9WaWV3OnRydWVcbiAgICB9KVxuXG4gICAgY29uc3QgZm9ybWF0dGVkVGV4dCA9IGAgKHN1Ym1pdHRlZCBhdCAke3N1Ym1pdFRpbWV9KVxcbioqQHJlc3BvbnNlKiogJHt0ZXh0fSAocmVzcG9uZGVkIGF0ICR7cmVjZWl2ZVRpbWV9KVxcblxcbmBcbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgY2hhbmdlczoge2Zyb206Y3VyckxpbmUudG8sIGluc2VydDogZm9ybWF0dGVkVGV4dH0sXG4gICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogY3VyckxpbmUudG8rZm9ybWF0dGVkVGV4dC5sZW5ndGh9XG4gICAgfSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGluZ0xMTShwbHVnaW46SW5MaW5lQUlUdXRvclBsdWdpbiwgcXVlcnk6c3RyaW5nLCBiZWZvcmVUZXh0Om1heWJlU3RyaW5nLCBhZnRlclRleHQ6bWF5YmVTdHJpbmcpOlByb21pc2U8c3RyaW5nfG51bGw+e1xuICAgIGNvbnN0IGJhc2VfdXJsID0gcGx1Z2luLnNldHRpbmdzLmJhc2VVUkw7XG4gICAgY29uc3QgdXJsID0gYCR7YmFzZV91cmx9L3YxL2NoYXQvY29tcGxldGlvbnNgO1xuICAgIGNvbnN0IG1vZGVsID0gcGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcbiAgICBjb25zdCBzeXN0ZW1fcHJvbXB0ID0gXCJZb3UgYXJlIGEgY29uY2lzZSBhbmQgc3VjY2luY3QgYXNzaXN0YW50IG9wZXJhdGluZyBpbnNpZGUgT2JzaWRpYW4uTUQsIGEgc3BlY2lhbGl6ZWQgbm90ZSB0YWtpbmcgYXBwLlwiO1xuICAgIFxuICAgIGNvbnN0IG1ldGhvZCA9IFwiUE9TVFwiO1xuXG4gICAgbGV0IGJlZkFycmF5Rm9ybWF0dGVkOm9iamVjdFtdPVtdLCBhZnRBcnJheUZvcm1hdHRlZDpvYmplY3RbXT1bXSwgbnVtOm51bWJlcj0wO1xuICAgIFxuICAgIGlmIChiZWZvcmVUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBiZWZvcmVUZXh0LCBudW0pO1xuICAgICAgbnVtID0gbnVtYmVyO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQgPSBjb250ZW50QXJyYXk7XG4gICAgICBiZWZBcnJheUZvcm1hdHRlZC51bnNoaWZ0KFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7U0VQQVJBVE9SfVxcbmB9XG4gICAgICApO1xuICAgICAgYmVmQXJyYXlGb3JtYXR0ZWQucHVzaChcbiAgICAgICAge3R5cGU6XCJ0ZXh0XCIsIHRleHQ6IGAke1NFUEFSQVRPUn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgYWN0aXZlX251bSA9IG51bTtcbiAgICBudW0rKztcbiAgICBcbiAgICBpZiAoYWZ0ZXJUZXh0KXtcbiAgICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBhZnRlclRleHQsIG51bSk7XG4gICAgICBudW0gPSBudW1iZXI7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZCA9IGNvbnRlbnRBcnJheTtcbiAgICAgIGFmdEFycmF5Rm9ybWF0dGVkLnVuc2hpZnQoXG4gICAgICAgIHt0eXBlOlwidGV4dFwiLCB0ZXh0OiBgJHtTRVBBUkFUT1J9IFNUQVJUIE9GIERPQ1VNRU5UIFBBUlQgQkVMT1cgUVVFUlkgJHtTRVBBUkFUT1J9XFxuYH1cbiAgICAgICk7XG4gICAgICBhZnRBcnJheUZvcm1hdHRlZC5wdXNoKFxuICAgICAgICB7dHlwZTpcInRleHRcIiwgdGV4dDogYCR7U0VQQVJBVE9SfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke1NFUEFSQVRPUn1cXG5gfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBjb25zdCBiZWZvcmVUZXh0ID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YmVmb3JlTGluZXMuam9pbihcIlxcblwiKX1cXG4ke3NlcGFyYXRvcn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtzZXBhcmF0b3J9XFxuYDtcbiAgICAvLyBjb25zdCBhZnRlclRleHQgID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YWZ0ZXJMaW5lcy5qb2luKFwiXFxuXCIpfVxcbiR7c2VwYXJhdG9yfSBFTkQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke3NlcGFyYXRvcn1cXG5gOztcblxuICAgIC8vICAke3F1ZXJ5LnNwbGl0KFwiIFwiKS5zbGljZSgxLCB1bmRlZmluZWQpLmpvaW4oXCIgXCIpfVxuICAgIGxldCB7Y29udGVudEFycmF5LCBudW1iZXJ9ID0gYXdhaXQgZm9ybWF0VGV4dEJsb2IocGx1Z2luLCBxdWVyeS5zcGxpdChcIiBcIikuc2xpY2UoMSwgdW5kZWZpbmVkKS5qb2luKFwiIFwiKSwgbnVtLCBmYWxzZSlcbiAgICBjb25zdCBxdWVyeUFycmF5Rm9ybWF0dGVkID0gY29udGVudEFycmF5O1xuICAgIGNvbnNvbGUubG9nKHF1ZXJ5QXJyYXlGb3JtYXR0ZWQpXG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgICAgdXJsLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICBcIkF1dGhvcml6YXRpb25cIjogXCJCZWFyZXJcIlxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbW9kZWwsXG4gICAgICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAgICAgIHtyb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBwbHVnaW4uc3lzdGVtUHJvbXB0fSxcbiAgICAgICAgICAgIHtyb2xlOiBcInVzZXJcIiwgXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgICAgICAvLyB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGJlZm9yZVRleHQgPz8gXCJcXG5cIn0sXG4gICAgICAgICAgICAgICAgLi4uYmVmQXJyYXlGb3JtYXR0ZWQsXG4gICAgICAgICAgICAgICAge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBgPHBvc2l0aW9uXyR7YWN0aXZlX251bX0+ICpUaGlzIGlzIHRoZSBwb3NpdGlvbiBvZiB0aGUgdXNlciBxdWVzdGlvbi9wcm9tcHQgY3VycmVudGx5IHBvc2VkIHRvIHlvdSogPC9wb3NpdGlvbl8ke2FjdGl2ZV9udW19PmB9LFxuICAgICAgICAgICAgICAgIC8vIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYWZ0ZXJUZXh0ICA/PyBcIlxcblwifSxcbiAgICAgICAgICAgICAgICAuLi5hZnRBcnJheUZvcm1hdHRlZCxcbiAgICAgICAgICAgICAgICAvLyB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBjdXJyZW50IHVzZXIgcHJvbXB0OiAke3F1ZXJ5LnNwbGl0KFwiIFwiKS5zbGljZSgxLCB1bmRlZmluZWQpLmpvaW4oXCIgXCIpfWB9LFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYGN1cnJlbnQgdXNlciBwcm9tcHQ6IGB9LFxuICAgICAgICAgICAgICAgIC4uLnF1ZXJ5QXJyYXlGb3JtYXR0ZWQsXG4gICAgICAgICAgICAgIF19XG4gICAgICAgICAgXSxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTowLjksXG4gICAgICAgIH0pXG4gICAgfVxuICAgXG4gIGxldCByZXNwb25zZTtcbiAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShcImxsbSBpcyB0aGlua2luZy4uLlwiLCAwKTtcbiAgdHJ5e1xuICAgIHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFVybChwYXlsb2FkKTtcbiAgICBub3RpY2Uuc2V0TWVzc2FnZShcInJlc3BvbnNlIGlzIHJlYWR5IVwiKVxuICAgIHNldFRpbWVvdXQoKCk9Pm5vdGljZS5oaWRlKCksIDE1MDApO1xuICB9XG4gIGNhdGNoKGUpe1xuICAgIG5vdGljZS5zZXRNZXNzYWdlKFwibGxtIGNhbGwgZmFpbGVkXCIpO1xuICAgIHNldFRpbWVvdXQoKCk9Pm5vdGljZS5oaWRlKCksIDE1MDApXG4gIH1cbiAgcmV0dXJuIHJlc3BvbnNlPy5qc29uLmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudCA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRMTE1xdWVyeSh2aWV3OkVkaXRvclZpZXcpIHtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgY29uc3QgYWxsTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIFxuICAgIGNvbnN0IG51bUxpbmVzID0gdmlldy5zdGF0ZS5kb2MubGluZXM7XG4gICAgbGV0IG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIGFsbExpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICBcbiAgICBsZXQgYmVmb3JlTGluZTpudW1iZXI9MTAwMDAwO1xuICAgIGxldCBhZnRlckxpbmU6bnVtYmVyPTA7XG5cbiAgICB3aGlsZShudW1iZXI+MSl7XG4gICAgICBudW1iZXItLTtcbiAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChjdXJyTGluZS50ZXh0LnRyaW0oKSA9PT0gXCJcIil7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZWxzZXtcbiAgICAgICAgYWxsTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgYmVmb3JlTGluZT1udW1iZXI7XG4gICAgXG4gICAgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgd2hpbGUobnVtYmVyPChudW1MaW5lcy0xKSl7XG4gICAgICBudW1iZXIrKztcbiAgICAgIGNvbnN0IG5leHRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgaWYgKG5leHRMaW5lICYmICgobmV4dExpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKXx8KG5leHRMaW5lPy50ZXh0LnN0YXJ0c1dpdGgoXCIjIyBcIikpKSl7XG4gICAgICAgIGFsbExpbmVzLnB1c2gobmV4dExpbmUudGV4dClcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBhZnRlckxpbmU9bnVtYmVyO1xuICAgIHJldHVybiB7Y29udGVudDogYWxsTGluZXMuam9pbihcIlxcblwiKSwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfVxuXG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVBSVdpZGdldCBleHRlbmRzIFdpZGdldFR5cGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogSW5MaW5lQUlUdXRvclBsdWdpbixcbiAgICBwcml2YXRlIHZpZXc6IEVkaXRvclZpZXcsXG4gICAgcHJpdmF0ZSBmcm9tOiBudW1iZXIsXG4gICAgcHJpdmF0ZSB0bzogbnVtYmVyLFxuICApe1xuICAgIHN1cGVyKClcbiAgfVxuICBcbiAgZXEob3RoZXI6IElubGluZUFJV2lkZ2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuZnJvbSA9PT0gb3RoZXIuZnJvbSAmJiB0aGlzLnRvID09PSBvdGhlci50bztcbiAgfVxuXG4gIHRvRE9NKHZpZXc6RWRpdG9yVmlldyk6SFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IHF1ZXJ5V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGJ1dHRvbi5pbm5lclRleHQgPSBcInN1Ym1pdFwiO1xuICAgIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnMHB4JztcbiAgICAvLyBidXR0b24uc3R5bGUuYm90dG9tID0gXCIwcHhcIjtcbiAgICBidXR0b24uaWQgPSBcImFpLXN1Ym1pdC1idXR0b25cIlxuICAgIFxuICAgIGJ1dHRvbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBzdWJtaXRUb0xMTSh0aGlzLnZpZXcsIHRoaXMucGx1Z2luKTtcbiAgICAgICAgLy8gYnV0dG9uLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9O1xuICAgIHF1ZXJ5V3JhcHBlci5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIHJldHVybiBxdWVyeVdyYXBwZXI7XG4gIH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gdmlld1BsdWdpbkZhY3RvcnlNZXRob2QoX3BsdWdpbjpJbkxpbmVBSVR1dG9yUGx1Z2luKXtcbiAgY2xhc3MgSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4gaW1wbGVtZW50cyBQbHVnaW5WYWx1ZSB7XG4gICAgZGVjb3JhdGlvbnM6IERlY29yYXRpb25TZXQ7XG4gICAgcGx1Z2luOiBJbkxpbmVBSVR1dG9yUGx1Z2luO1xuXG4gICAgY29uc3RydWN0b3IodmlldzogRWRpdG9yVmlldykge1xuICAgICAgdGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuYnVpbGREZWNvcmF0aW9ucyh2aWV3KTtcbiAgICAgIHRoaXMucGx1Z2luID0gX3BsdWdpbjtcbiAgICB9XG5cbiAgICB1cGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XG4gICAgICBpZiAodXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnZpZXdwb3J0Q2hhbmdlZCkge1xuICAgICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHVwZGF0ZS52aWV3KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkZXN0cm95KCkge31cblxuICAgIGJ1aWxkRGVjb3JhdGlvbnModmlldzogRWRpdG9yVmlldyk6IERlY29yYXRpb25TZXQge1xuICAgICAgY29uc3QgYnVpbGRlciA9IG5ldyBSYW5nZVNldEJ1aWxkZXI8RGVjb3JhdGlvbj4oKTtcblxuICAgICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgICAgXG4gICAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgICBsZXQgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgICBcbiAgICAgIGNvbnN0IHBhcmFMaW5lczogc3RyaW5nW10gPSBbXVxuICAgICAgcGFyYUxpbmVzLnB1c2gobGluZS50ZXh0KVxuICAgICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgICBudW1iZXItLTtcbiAgICAgICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpIGJyZWFrO1xuICAgICAgICBlbHNlIHBhcmFMaW5lcy51bnNoaWZ0KGN1cnJMaW5lLnRleHQpO1xuICAgICAgfVxuXG4gICAgICBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICAgIHdoaWxlIChudW1iZXIgPCAodmlldy5zdGF0ZS5kb2MubGluZXMtMSkpe1xuICAgICAgICBudW1iZXIrKztcbiAgICAgICAgY29uc3QgQWZ0TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgICAgaWYgKChBZnRMaW5lLnRleHQudHJpbSgpPT09XCJcIikgfHwgKEFmdExpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSkgYnJlYWs7XG4gICAgICAgIGVsc2UgcGFyYUxpbmVzLnB1c2goQWZ0TGluZS50ZXh0KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgcGFyYVRleHQgPSBwYXJhTGluZXMuam9pbignXFxuJyk7XG4gICAgXG4gICAgICBjb25zdCBwcmV2TGluZSA9IGxpbmUubnVtYmVyID4gMSA/IHZpZXcuc3RhdGUuZG9jLmxpbmUobGluZS5udW1iZXItMSk6IG51bGw7XG4gICAgICBcbiAgICAgIGlmKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiQGFzc2lzdGFudFwiKSAmJiAobGluZS5udW1iZXIgPiAxKSAmJiAocHJldkxpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAgIC8vIHRoaXMgY29uZGl0aW9uIG1lYW5zIHRoYXQgaXQgaXMgbm90IHRoZSBmaXJzdCBsaW5lIGFuZCBpdCBpcyBub3QgYSBwYXJhZ3JhcGggYnkgaXRzZWxmLlxuICAgICAgICBjb25zb2xlLmxvZyhcIndpbGwgbmVlZCB0byBhZGQgYSBsaW5lIGJyZWFrXCIpXG4gICAgICAgIGNvbnN0IGluc2VydGlvblN0ciA9IFwiXFxuXCJcbiAgICAgICAgc2V0VGltZW91dCgoKT0+e3ZpZXcuZGlzcGF0Y2goe1xuICAgICAgICAgIGNoYW5nZXM6IHtmcm9tOmxpbmUuZnJvbSwgaW5zZXJ0OiBpbnNlcnRpb25TdHJ9LFxuICAgICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogbGluZS50bytpbnNlcnRpb25TdHIubGVuZ3RofVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZWxzZSBpZiAocGFyYVRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgIShwYXJhVGV4dC5jb250YWlucyhcIkByZXNwb25zZVwiKSkpe1xuICAgICAgICBidWlsZGVyLmFkZChsaW5lLnRvLCBsaW5lLnRvLCBcbiAgICAgICAgICBEZWNvcmF0aW9uLndpZGdldChcbiAgICAgICAgICAgIHt3aWRnZXQ6IG5ldyBJbmxpbmVBSVdpZGdldCh0aGlzLnBsdWdpbiwgdmlldywgbGluZS50bywgbGluZS50byksIHNpZGU6IDF9XG4gICAgICAgICAgKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBsdWdpblNwZWM6IFBsdWdpblNwZWM8SW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4+ID0ge1xuICAgIGRlY29yYXRpb25zOiAodmFsdWU6IElubGluZUFJQVRFZGl0b3JWSWV3UGx1Z2luKSA9PiB2YWx1ZS5kZWNvcmF0aW9ucyxcbiAgfTtcblxuICBjb25zdCBpbmxpbmVBSUFJUGx1Z2luID0gVmlld1BsdWdpbi5mcm9tQ2xhc3MoXG4gICAgSW5saW5lQUlBVEVkaXRvclZJZXdQbHVnaW4sXG4gICAgcGx1Z2luU3BlY1xuICApO1xuXG5yZXR1cm4gaW5saW5lQUlBSVBsdWdpblxufSJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFBQUEsbUJBQXFFOzs7QUNDckUsc0JBQTZDO0FBYXRDLElBQU0sbUJBQXlEO0FBQUEsRUFDckUsU0FBUztBQUFBLEVBQ1QsV0FBVztBQUFBO0FBQUEsRUFFWCxnQkFBZ0I7QUFBQTtBQUFBO0FBR2pCO0FBQ08sSUFBTSwyQkFBTixjQUF1QyxpQ0FBZ0I7QUFBQSxFQUc3RCxZQUFZLEtBQVMsUUFBMkI7QUFDL0MsVUFBTSxLQUFLLE1BQU07QUFDakIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEs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LEtBQUssSUFBSTtBQUFBLEVBQzNEO0FBQUEsRUFDQSxNQUFNLFNBQVM7QUFDZCxVQUFNLEtBQUssYUFBYTtBQUN4QixVQUFNLEtBQUssaUJBQWlCO0FBRTVCLFNBQUssY0FBYyxJQUFJLHlCQUF5QixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRS9ELFNBQUssd0JBQXdCLENBQUMsd0JBQXdCLElBQUksQ0FBQyxDQUFDO0FBRTVELFNBQUssV0FBVztBQUFBLE1BQ2YsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sU0FBUyxDQUFDO0FBQUEsUUFDVCxXQUFXLENBQUMsT0FBTSxPQUFPO0FBQUEsUUFDekIsS0FBSztBQUFBLE1BQ04sQ0FBQztBQUFBLE1BQ0QsZ0JBQWdCLE9BQU8sU0FBUyxTQUFTO0FBQ3hDLGNBQU0sY0FBYyxTQUFTLGVBQWUsa0JBQWtCO0FBQzlELFlBQUksZ0JBQWdCLEtBQU07QUFHMUIsY0FBTSxhQUFhLEtBQUssT0FBTztBQUMvQixjQUFNLFlBQVksWUFBWSxJQUFJO0FBQUEsTUFDbkM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiY29udGVudEFycmF5IiwgIm51bWJlciJdCn0K
