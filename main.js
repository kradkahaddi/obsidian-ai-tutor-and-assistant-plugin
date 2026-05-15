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
  default: () => MyPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/editor-plugin.ts
var import_state = require("@codemirror/state");
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");
var import_obsidian2 = require("obsidian");
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
function getQueryContext(view, beforeLine, afterLine, sectionOnly = false) {
  const regexPattern = new RegExp("![[[ws.-_]+]]", "g");
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
  const separator = "-".repeat(10);
  const beforeText = `${separator} START OF DOCUMENT PART ABOVE QUERY ${separator}
${beforeLines.join("\n")}
${separator} END OF DOCUMENT PART ABOVE QUERY ${separator}
`;
  const afterText = `${separator} START OF DOCUMENT PART BELOW QUERY ${separator}
${beforeLines.join("\n")}
${separator} END OF DOCUMENT PART BELOW QUERY ${separator}
`;
  ;
  return { beforeText, afterText };
}
async function submitToLLM(view) {
  console.log("submitting something!");
  const submitTime = formatDate(Date.now());
  const { content, beforeLine, afterLine } = getLLMquery(view);
  console.log("submitted at:", submitTime);
  console.log(content);
  const defaultType = "isolated";
  const firstWord = content.split(" ")[0];
  const options = firstWord.split(":").slice(1, void 0);
  let beforeText = null, afterText = null;
  if (options.contains("isolated") || defaultType === "isolated" && options.length === 0) {
    beforeText = null;
    afterText = null;
  } else if (options.contains("doc") || defaultType === "doc") {
    const context = getQueryContext(view, beforeLine, afterLine);
    beforeText = context.beforeText;
    afterText = context.afterText;
  } else if (options.contains("section") || defaultType === "section") {
    const context = getQueryContext(view, beforeLine, afterLine, true);
    beforeText = context.beforeText;
    afterText = context.afterText;
  }
  const answer = await pingLLM(content, beforeText, afterText);
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
async function pingLLM(query, beforeText, afterText) {
  const base_url = "http://localhost:1234";
  const url = `${base_url}/v1/chat/completions`;
  const model = "google/gemma-4-26b-a4b";
  const system_prompt = "You are a concise and succinct assistant";
  const method = "POST";
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
            { type: "text", text: beforeText ?? "\n" },
            { type: "text", text: "<ACTIVE QUESTION POSITION>" },
            { type: "text", text: afterText ?? "\n" },
            { type: "text", text: query ?? "\n" }
          ]
        }
      ],
      temperature: 0.9
    })
  };
  const response = await (0, import_obsidian.requestUrl)(payload);
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
  constructor(view, from, to) {
    super();
    this.view = view;
    this.from = from;
    this.to = to;
  }
  view;
  from;
  to;
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
      submitToLLM(this.view);
    };
    queryWrapper.appendChild(button);
    return queryWrapper;
  }
};
var InlineAssistantPlugin = class {
  decorations;
  constructor(view) {
    this.decorations = this.buildDecorations(view);
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
          { widget: new InlineAIWidget(view, line.to, line.to), side: 1 }
        )
      );
    }
    return builder.finish();
  }
};
var pluginSpec = {
  decorations: (value) => value.decorations
};
var inlineAssistantPlugin = import_view.ViewPlugin.fromClass(
  InlineAssistantPlugin,
  pluginSpec
);

// src/main.ts
var MyPlugin = class extends import_obsidian3.Plugin {
  async onload() {
    this.addRibbonIcon(
      "paper-plane",
      "Print to console",
      () => {
        new import_obsidian3.Notice("testing plugins");
        console.log("testing plugins");
      }
    );
    this.registerEditorExtension([inlineAssistantPlugin]);
    this.addCommand({
      id: "submit-ai-prompt",
      name: "submit to the LLM",
      hotkeys: [{
        modifiers: ["Mod", "Shift"],
        key: "L"
      }],
      editorCallback: async (_editor, view) => {
        console.log("hot key detected");
        const buttonCheck = document.getElementById("ai-submit-button");
        if (buttonCheck === null) return;
        const editorView = view.editor.cm;
        await submitToLLM(editorView);
      }
    });
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2VkaXRvci1wbHVnaW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7QXBwLCBFZGl0b3IsIE1hcmtkb3duVmlldywgTW9kYWwsIE5vdGljZSwgTWVudSwgUGx1Z2lufSBmcm9tICdvYnNpZGlhbic7XG4vLyBpbXBvcnQge0RFRkFVTFRfU0VUVElOR1MsIE15UGx1Z2luU2V0dGluZ3MsIFNhbXBsZVNldHRpbmdUYWJ9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5cbmltcG9ydCB7aW5saW5lQXNzaXN0YW50UGx1Z2luLCBzdWJtaXRUb0xMTX0gZnJvbSBcIi4vZWRpdG9yLXBsdWdpblwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNeVBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG5cdGFzeW5jIG9ubG9hZCgpIHtcblxuXHRcdHRoaXMuYWRkUmliYm9uSWNvbihcInBhcGVyLXBsYW5lXCIsIFwiUHJpbnQgdG8gY29uc29sZVwiLCBcblx0XHRcdFx0XHRcdFx0KCk9Pntcblx0XHRcdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJ0ZXN0aW5nIHBsdWdpbnNcIik7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygndGVzdGluZyBwbHVnaW5zJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbaW5saW5lQXNzaXN0YW50UGx1Z2luXSlcblxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJzdWJtaXQtYWktcHJvbXB0XCIsXG5cdFx0XHRuYW1lOiBcInN1Ym1pdCB0byB0aGUgTExNXCIsXG5cdFx0XHRob3RrZXlzOiBbeyBcblx0XHRcdFx0bW9kaWZpZXJzOiBbXCJNb2RcIixcIlNoaWZ0XCJdLCBcblx0XHRcdFx0a2V5OiBcIkxcIlxuXHRcdFx0fV0sXG5cdFx0XHRlZGl0b3JDYWxsYmFjazogYXN5bmMgKF9lZGl0b3IsIHZpZXcpID0+IHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ2hvdCBrZXkgZGV0ZWN0ZWQnKTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uQ2hlY2sgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWktc3VibWl0LWJ1dHRvbicpO1xuXHRcdFx0XHRpZiAoYnV0dG9uQ2hlY2sgPT09IG51bGwpIHJldHVybjtcblx0XHRcdFx0Ly8gYnV0dG9uQ2hlY2suc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdGNvbnN0IGVkaXRvclZpZXcgPSB2aWV3LmVkaXRvci5jbSBhcyBFZGl0b3JWaWV3O1xuXHRcdFx0XHRhd2FpdCBzdWJtaXRUb0xMTShlZGl0b3JWaWV3KTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG59IiwgImltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tICdAY29kZW1pcnJvci9sYW5ndWFnZSc7XG5pbXBvcnQgeyBSYW5nZVNldEJ1aWxkZXIgfSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7XG5pbXBvcnQge3JlcXVlc3RVcmwgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7XG4gIERlY29yYXRpb24sXG4gIERlY29yYXRpb25TZXQsXG4gIEVkaXRvclZpZXcsXG4gIFBsdWdpblNwZWMsXG4gIFBsdWdpblZhbHVlLFxuICBWaWV3UGx1Z2luLFxuICBWaWV3VXBkYXRlLFxuICBXaWRnZXRUeXBlLFxufSBmcm9tICdAY29kZW1pcnJvci92aWV3JztcblxuaW1wb3J0IHtFZGl0b3IsIE5vdGljZX0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGUodGltZXN0YW1wOm51bWJlcik6c3RyaW5ne1xuICBjb25zdCBtb250aE5hbWVzID0gW1wiamFuXCIsICdmZWInLCBcImFwclwiLCAnbWF5JywgJ2p1bicsICdqdWwnLFxuICAgICAgICAgICAgICBcImF1Z1wiLCBcInNlcFwiLCBcIm9jdFwiLCBcIm5vdlwiLCBcImRlY1wiXTtcbiAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHRpbWVzdGFtcCk7XG4gIGNvbnN0IGFkZFBhZGRpbmcgPSAobnVtOm51bWJlcik6IHN0cmluZyA9PiBudW0udG9TdHJpbmcoKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gIGNvbnN0IGhoID0gYWRkUGFkZGluZyhkYXRlLmdldEhvdXJzKCkpO1xuICBjb25zdCBtbSA9IGFkZFBhZGRpbmcoZGF0ZS5nZXRNaW51dGVzKCkpO1xuICBjb25zdCBkYXkgPSBhZGRQYWRkaW5nKGRhdGUuZ2V0RGF0ZSgpKTtcbiAgY29uc3QgbW9udGggPSBtb250aE5hbWVzWyhkYXRlLmdldE1vbnRoKCkpLTFdO1xuICBjb25zdCB5ZWFyID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuXG4gIHJldHVybiBgJHtoaH06JHttbX0gJHtkYXl9ICR7bW9udGh9ICR7eWVhcn1gO1xufVxuXG5leHBvcnQgdHlwZSBtYXliZVN0cmluZyA9IHN0cmluZyB8IG51bGw7XG5cbmZ1bmN0aW9uIGdldFF1ZXJ5Q29udGV4dCh2aWV3OkVkaXRvclZpZXcsIGJlZm9yZUxpbmU6bnVtYmVyLCBhZnRlckxpbmU6bnVtYmVyLCBzZWN0aW9uT25seTpib29sZWFuPWZhbHNlKVxuOntiZWZvcmVUZXh0OnN0cmluZywgYWZ0ZXJUZXh0OnN0cmluZ30gIHtcbiAgY29uc3QgcmVnZXhQYXR0ZXJuOiBSZWdFeHAgPSBuZXcgUmVnRXhwKFwiXFwhXFxbXFxbW1xcd1xccy5cXC1fXStcXF1cXF1cIiwgJ2cnKTtcbiAgXG4gIGxldCBudW1iZXIgPSBiZWZvcmVMaW5lO1xuICBjb25zdCBiZWZvcmVMaW5lcyA9IFtdO1xuICB3aGlsZSAobnVtYmVyID4gMCl7XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICBpZiAoc2VjdGlvbk9ubHkgJiYgKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiIyMgXCIpKSl7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBiZWZvcmVMaW5lcy51bnNoaWZ0KGxpbmUudGV4dCk7XG4gICAgbnVtYmVyLS07XG4gIH1cbiAgXG4gIG51bWJlciA9IGFmdGVyTGluZTtcbiAgY29uc3QgYWZ0ZXJMaW5lcyA9IFtdO1xuICB3aGlsZSAobnVtYmVyIDwgdmlldy5zdGF0ZS5kb2MubGluZXMpe1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgaWYgKHNlY3Rpb25Pbmx5ICYmIChsaW5lLnRleHQuc3RhcnRzV2l0aChcIiMjIFwiKSkpe1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYWZ0ZXJMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgbnVtYmVyKys7XG4gIH1cbiAgY29uc3Qgc2VwYXJhdG9yID0gXCItXCIucmVwZWF0KDEwKTtcblxuICBjb25zdCBiZWZvcmVUZXh0ID0gYCR7c2VwYXJhdG9yfSBTVEFSVCBPRiBET0NVTUVOVCBQQVJUIEFCT1ZFIFFVRVJZICR7c2VwYXJhdG9yfVxcbiR7YmVmb3JlTGluZXMuam9pbihcIlxcblwiKX1cXG4ke3NlcGFyYXRvcn0gRU5EIE9GIERPQ1VNRU5UIFBBUlQgQUJPVkUgUVVFUlkgJHtzZXBhcmF0b3J9XFxuYDtcbiAgY29uc3QgYWZ0ZXJUZXh0ICA9IGAke3NlcGFyYXRvcn0gU1RBUlQgT0YgRE9DVU1FTlQgUEFSVCBCRUxPVyBRVUVSWSAke3NlcGFyYXRvcn1cXG4ke2JlZm9yZUxpbmVzLmpvaW4oXCJcXG5cIil9XFxuJHtzZXBhcmF0b3J9IEVORCBPRiBET0NVTUVOVCBQQVJUIEJFTE9XIFFVRVJZICR7c2VwYXJhdG9yfVxcbmA7O1xuICByZXR1cm4ge2JlZm9yZVRleHQsIGFmdGVyVGV4dH1cbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdWJtaXRUb0xMTSh2aWV3OkVkaXRvclZpZXcpe1xuICAgIGNvbnNvbGUubG9nKFwic3VibWl0dGluZyBzb21ldGhpbmchXCIpO1xuICAgIC8vIG5ldyBOb3RpY2UoXCJzdWJtaXR0aW5nIHRvIExMTVwiKTtcbiAgICBjb25zdCBzdWJtaXRUaW1lID0gZm9ybWF0RGF0ZShEYXRlLm5vdygpKTtcbiAgICBjb25zdCB7Y29udGVudCwgYmVmb3JlTGluZSwgYWZ0ZXJMaW5lfSA9IGdldExMTXF1ZXJ5KHZpZXcpO1xuICAgIGNvbnNvbGUubG9nKFwic3VibWl0dGVkIGF0OlwiLCBzdWJtaXRUaW1lKTtcbiAgICBjb25zb2xlLmxvZyhjb250ZW50KTtcbiAgICBcbiAgICBjb25zdCBkZWZhdWx0VHlwZSA9IFwiaXNvbGF0ZWRcIjtcbiAgICBjb25zdCBmaXJzdFdvcmQgPSBjb250ZW50LnNwbGl0KFwiIFwiKVswXTtcbiAgICBjb25zdCBvcHRpb25zID0gZmlyc3RXb3JkLnNwbGl0KFwiOlwiKS5zbGljZSgxLCB1bmRlZmluZWQpO1xuICAgIC8vIGxldCBhbnN3ZXI6c3RyaW5nO1xuICAgIGxldCBiZWZvcmVUZXh0OiBtYXliZVN0cmluZz1udWxsLCBhZnRlclRleHQ6IG1heWJlU3RyaW5nPW51bGw7XG5cbiAgICBpZihvcHRpb25zLmNvbnRhaW5zKCdpc29sYXRlZCcpfHwoKGRlZmF1bHRUeXBlPT09XCJpc29sYXRlZFwiKSAmJiAob3B0aW9ucy5sZW5ndGg9PT0wKSkpe1xuICAgICAgYmVmb3JlVGV4dCA9IG51bGw7XG4gICAgICBhZnRlclRleHQgPSBudWxsO1xuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNvbnRhaW5zKFwiZG9jXCIpfHwoZGVmYXVsdFR5cGU9PT0nZG9jJykpe1xuICAgICAgY29uc3QgY29udGV4dCA9IGdldFF1ZXJ5Q29udGV4dCh2aWV3LCBiZWZvcmVMaW5lLCBhZnRlckxpbmUpO1xuICAgICAgYmVmb3JlVGV4dCA9IGNvbnRleHQuYmVmb3JlVGV4dDtcbiAgICAgIGFmdGVyVGV4dCA9IGNvbnRleHQuYWZ0ZXJUZXh0O1xuICAgICAgXG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY29udGFpbnMoXCJzZWN0aW9uXCIpfHxkZWZhdWx0VHlwZT09PSdzZWN0aW9uJyl7XG4gICAgICBjb25zdCBjb250ZXh0ID0gZ2V0UXVlcnlDb250ZXh0KHZpZXcsIGJlZm9yZUxpbmUsIGFmdGVyTGluZSwgdHJ1ZSk7XG4gICAgICAvLyBjb25zdCBjb250ZXh0ID0gZ2V0UXVlcnlDb250ZXh0KHZpZXcsIGJlZm9yZUxpbmUsIGFmdGVyTGluZSk7XG4gICAgICBiZWZvcmVUZXh0ID0gY29udGV4dC5iZWZvcmVUZXh0O1xuICAgICAgYWZ0ZXJUZXh0ID0gY29udGV4dC5hZnRlclRleHQ7XG4gICAgfVxuICAgIFxuICAgIC8vICAgICAgIGN1cmwgaHR0cDovL2xvY2FsaG9zdDoxMjM0L2FwaS92MS9jaGF0IFxcXG4gICAgLy8gICAtSCBcIkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvblwiIFxcXG4gICAgLy8gICAtZCAne1xuICAgIC8vICAgICBcIm1vZGVsXCI6IFwiZ29vZ2xlL2dlbW1hLTQtMjZiLWE0YlwiLFxuICAgIC8vICAgICBcInN5c3RlbV9wcm9tcHRcIjogXCJZb3UgYW5zd2VyIG9ubHkgaW4gcmh5bWVzLlwiLFxuICAgIC8vICAgICBcImlucHV0XCI6IFwiV2hhdCBpcyB5b3VyIGZhdm9yaXRlIGNvbG9yP1wiXG4gICAgLy8gfSdcbiAgICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwaW5nTExNKGNvbnRlbnQsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG4gICAgaWYoYW5zd2VyKXtcbiAgICAgIG5ldyBOb3RpY2UoXCJSZXNwb25zZSByZWNlaXZlZCFcIilcbiAgICAgIGNvbnNvbGUubG9nKGFuc3dlcik7XG4gICAgICBjb25zdCByZWNlaXZlVGltZSA9IGZvcm1hdERhdGUoRGF0ZS5ub3coKSk7XG4gICAgICBjb25zb2xlLmxvZyhcInJlY2VpdmVkIGF0OlwiLCByZWNlaXZlVGltZSk7XG4gICAgXG4gICAgICBhcHBlbmRBbnN3ZXIodmlldywgYW5zd2VyLCBzdWJtaXRUaW1lLCByZWNlaXZlVGltZSk7XG4gICAgfVxuICAgIGVsc2V7XG4gICAgICBuZXcgTm90aWNlKFwiQ2FsbCBmYWlsZWRcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZEFuc3dlcih2aWV3OkVkaXRvclZpZXcsIHRleHQ6c3RyaW5nLCBzdWJtaXRUaW1lOnN0cmluZywgcmVjZWl2ZVRpbWU6c3RyaW5nKXtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgd2hpbGUgKGN1cnJMaW5lLm51bWJlcjx2aWV3LnN0YXRlLmRvYy5saW5lcyl7XG4gICAgICBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUoY3VyckxpbmUubnVtYmVyICsgMSk7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCk9PT1cIlwiKXtcbiAgICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlci0xKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOmN1cnJMaW5lLnRvfSxcbiAgICAgIHNjcm9sbEludG9WaWV3OnRydWVcbiAgICB9KVxuXG4gICAgY29uc3QgZm9ybWF0dGVkVGV4dCA9IGAgKHN1Ym1pdHRlZCBhdCAke3N1Ym1pdFRpbWV9KVxcbioqQHJlc3BvbnNlKiogJHt0ZXh0fSAocmVzcG9uZGVkIGF0ICR7cmVjZWl2ZVRpbWV9KVxcblxcbmBcbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgY2hhbmdlczoge2Zyb206Y3VyckxpbmUudG8sIGluc2VydDogZm9ybWF0dGVkVGV4dH0sXG4gICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogY3VyckxpbmUudG8rZm9ybWF0dGVkVGV4dC5sZW5ndGh9XG4gICAgfSlcbn1cbmFzeW5jIGZ1bmN0aW9uIHBpbmdMTE0ocXVlcnk6c3RyaW5nLCBiZWZvcmVUZXh0Om1heWJlU3RyaW5nLCBhZnRlclRleHQ6bWF5YmVTdHJpbmcpOlByb21pc2U8c3RyaW5nfG51bGw+e1xuICAgIGNvbnN0IGJhc2VfdXJsID0gXCJodHRwOi8vbG9jYWxob3N0OjEyMzRcIjtcbiAgICBjb25zdCB1cmwgPSBgJHtiYXNlX3VybH0vdjEvY2hhdC9jb21wbGV0aW9uc2A7XG4gICAgY29uc3QgbW9kZWwgPSBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIjtcbiAgICBjb25zdCBzeXN0ZW1fcHJvbXB0ID0gXCJZb3UgYXJlIGEgY29uY2lzZSBhbmQgc3VjY2luY3QgYXNzaXN0YW50XCI7XG4gICAgY29uc3QgbWV0aG9kID0gXCJQT1NUXCI7XG5cbiAgICAvLyBjb25zb2xlLmxvZygnYmVmb3JlIHRleHQnLCBiZWZvcmVUZXh0KTtcbiAgICAvLyBjb25zb2xlLmxvZygnYWZ0ZXIgdGV4dCcsIGFmdGVyVGV4dCk7XG4gICAgY29uc29sZS5sb2coJ3F1ZXJ5JywgcXVlcnkpXG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgICAgdXJsLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICBcIkF1dGhvcml6YXRpb25cIjogXCJCZWFyZXJcIlxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbW9kZWwsXG4gICAgICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAgICAgIHtyb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzeXN0ZW1fcHJvbXB0fSxcbiAgICAgICAgICAgIHtyb2xlOiBcInVzZXJcIiwgXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgICAgICB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGJlZm9yZVRleHQgPz8gXCJcXG5cIn0sXG4gICAgICAgICAgICAgICAge3R5cGU6IFwidGV4dFwiLCB0ZXh0OiBcIjxBQ1RJVkUgUVVFU1RJT04gUE9TSVRJT04+XCJ9LFxuICAgICAgICAgICAgICAgIHt0eXBlOiBcInRleHRcIiwgdGV4dDogYWZ0ZXJUZXh0ICA/PyBcIlxcblwifSxcbiAgICAgICAgICAgICAgICB7dHlwZTogXCJ0ZXh0XCIsIHRleHQ6IHF1ZXJ5ID8/IFwiXFxuXCJ9LFxuICAgICAgICAgICAgICBdfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgdGVtcGVyYXR1cmU6MC45LFxuICAgICAgICB9KVxuICAgIH1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwocGF5bG9hZCk7XG4gIHJldHVybiByZXNwb25zZS5qc29uLmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudCA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRMTE1xdWVyeSh2aWV3OkVkaXRvclZpZXcpIHtcbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgY29uc3QgYWxsTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIFxuICAgIGNvbnN0IG51bUxpbmVzID0gdmlldy5zdGF0ZS5kb2MubGluZXM7XG4gICAgbGV0IG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIGFsbExpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICBcbiAgICBsZXQgYmVmb3JlTGluZTpudW1iZXI9MTAwMDAwO1xuICAgIGxldCBhZnRlckxpbmU6bnVtYmVyPTA7XG5cbiAgICB3aGlsZShudW1iZXI+MSl7XG4gICAgICBudW1iZXItLTtcbiAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChjdXJyTGluZS50ZXh0LnRyaW0oKSA9PT0gXCJcIil7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKCdicmVha2luZyBwb2ludCcpXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZWxzZXtcbiAgICAgICAgLy8gY29uc29sZS5sb2coYGxpbmVfcU5vOiAke251bWJlcn0gbGluZTogJHtjdXJyTGluZS5udW1iZXJ9YCwgXCJ0ZXh0OiBcIiwgY3VyckxpbmUudGV4dClcbiAgICAgICAgYWxsTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgYmVmb3JlTGluZT1udW1iZXI7XG4gICAgXG4gICAgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgd2hpbGUobnVtYmVyPChudW1MaW5lcy0xKSl7XG4gICAgICBudW1iZXIrKztcbiAgICAgIGNvbnN0IG5leHRMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgaWYgKG5leHRMaW5lICYmIChuZXh0TGluZT8udGV4dC50cmltKCkgIT09IFwiXCIpKXtcbiAgICAgICAgYWxsTGluZXMucHVzaChuZXh0TGluZS50ZXh0KVxuICAgICAgfVxuICAgICAgZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGFmdGVyTGluZT1udW1iZXI7XG4gICAgcmV0dXJuIHtjb250ZW50OiBhbGxMaW5lcy5qb2luKFwiXFxuXCIpLCBiZWZvcmVMaW5lLCBhZnRlckxpbmV9XG5cbn1cblxuLy8gaW1wb3J0IHsgRW1vamlXaWRnZXQgfSBmcm9tICdlbW9qaSc7XG5leHBvcnQgY2xhc3MgSW5saW5lQUlXaWRnZXQgZXh0ZW5kcyBXaWRnZXRUeXBlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSB2aWV3OiBFZGl0b3JWaWV3LFxuICAgIHByaXZhdGUgZnJvbTogbnVtYmVyLFxuICAgIHByaXZhdGUgdG86IG51bWJlcixcbiAgKXtcbiAgICBzdXBlcigpXG4gIH1cbiAgXG4gIGVxKG90aGVyOiBJbmxpbmVBSVdpZGdldCkge1xuICAgIHJldHVybiB0aGlzLmZyb20gPT09IG90aGVyLmZyb20gJiYgdGhpcy50byA9PT0gb3RoZXIudG87XG4gIH1cblxuICB0b0RPTSh2aWV3OkVkaXRvclZpZXcpOkhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBxdWVyeVdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICBidXR0b24uaW5uZXJUZXh0ID0gXCJzdWJtaXRcIjtcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzBweCc7XG4gICAgYnV0dG9uLmlkID0gXCJhaS1zdWJtaXQtYnV0dG9uXCJcbiAgICBcbiAgICBidXR0b24ub25jbGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgc3VibWl0VG9MTE0odGhpcy52aWV3KTtcbiAgICAgICAgLy8gYnV0dG9uLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9O1xuICAgIHF1ZXJ5V3JhcHBlci5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIHJldHVybiBxdWVyeVdyYXBwZXI7XG4gIH1cbn1cbmNsYXNzIElubGluZUFzc2lzdGFudFBsdWdpbiBpbXBsZW1lbnRzIFBsdWdpblZhbHVlIHtcbiAgZGVjb3JhdGlvbnM6IERlY29yYXRpb25TZXQ7XG5cbiAgY29uc3RydWN0b3IodmlldzogRWRpdG9yVmlldykge1xuICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmJ1aWxkRGVjb3JhdGlvbnModmlldyk7XG4gIH1cblxuICB1cGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XG4gICAgaWYgKHVwZGF0ZS5kb2NDaGFuZ2VkIHx8IHVwZGF0ZS52aWV3cG9ydENoYW5nZWQpIHtcbiAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmJ1aWxkRGVjb3JhdGlvbnModXBkYXRlLnZpZXcpO1xuICAgIH1cbiAgfVxuXG4gIGRlc3Ryb3koKSB7fVxuXG4gIGJ1aWxkRGVjb3JhdGlvbnModmlldzogRWRpdG9yVmlldyk6IERlY29yYXRpb25TZXQge1xuICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgUmFuZ2VTZXRCdWlsZGVyPERlY29yYXRpb24+KCk7XG5cbiAgICBjb25zdCBwb3MgPSB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQ7XG4gICAgXG4gICAgY29uc3QgbGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICAvLyBjb25zb2xlLmxvZygnc3RhcnQgbnVtYmVyOiAnLCBudW1iZXIpXG4gICAgLy8gY29uc29sZS5sb2coJ2N1cnJlbnQgbGluZSBpczonLCBsaW5lLnRleHQpXG4gICAgXG4gICAgY29uc3QgcGFyYUxpbmVzOiBzdHJpbmdbXSA9IFtdXG4gICAgcGFyYUxpbmVzLnB1c2gobGluZS50ZXh0KVxuICAgIHdoaWxlKG51bWJlcj4xKXtcbiAgICAgIG51bWJlci0tO1xuICAgICAgbGV0IGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShudW1iZXIpO1xuICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpID09PSBcIlwiKXtcbiAgICAgICAgLy8gY29uc29sZS5sb2coJ2JyZWFraW5nIHBvaW50JylcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBlbHNle1xuICAgICAgICAvLyBjb25zb2xlLmxvZyhgbGluZV9xTm86ICR7bnVtYmVyfSBsaW5lOiAke2N1cnJMaW5lLm51bWJlcn1gLCBcInRleHQ6IFwiLCBjdXJyTGluZS50ZXh0KVxuICAgICAgICBwYXJhTGluZXMudW5zaGlmdChjdXJyTGluZS50ZXh0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY29uc3QgcGFyYVRleHQgPSBwYXJhTGluZXMuam9pbignXFxuJyk7XG4gICAgXG4gICAgLy8gY29uc29sZS5sb2coXCJwYXJhVGV4dDogXCIsIHBhcmFUZXh0KVxuICAgIFxuICAgIGNvbnN0IHByZXZMaW5lID0gbGluZS5udW1iZXIgPiAxID8gdmlldy5zdGF0ZS5kb2MubGluZShsaW5lLm51bWJlci0xKTogbnVsbDtcbiAgICAvLyBjb25zb2xlLmxvZyhcInByZXZpb3VzIGxpbmU6IFwiLCBwcmV2TGluZT8udGV4dCk7XG4gICAgXG4gICAgaWYobGluZS50ZXh0LnN0YXJ0c1dpdGgoXCJAYXNzaXN0YW50XCIpICYmIChsaW5lLm51bWJlciA+IDEpICYmIChwcmV2TGluZT8udGV4dC50cmltKCkgIT09IFwiXCIpKXtcbiAgICAgIC8vIHRoaXMgY29uZGl0aW9uIG1lYW5zIHRoYXQgaXQgaXMgbm90IHRoZSBmaXJzdCBsaW5lIGFuZCBpdCBpcyBub3QgYSBwYXJhZ3JhcGggYnkgaXRzZWxmLlxuICAgICAgY29uc29sZS5sb2coXCJ3aWxsIG5lZWQgdG8gYWRkIGEgbGluZSBicmVha1wiKVxuICAgICAgY29uc3QgaW5zZXJ0aW9uU3RyID0gXCJcXG5cIlxuICAgICAgc2V0VGltZW91dCgoKT0+e3ZpZXcuZGlzcGF0Y2goe1xuICAgICAgICBjaGFuZ2VzOiB7ZnJvbTpsaW5lLmZyb20sIGluc2VydDogaW5zZXJ0aW9uU3RyfSxcbiAgICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOiBsaW5lLnRvK2luc2VydGlvblN0ci5sZW5ndGh9XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICB9XG4gICAgZWxzZSBpZiAocGFyYVRleHQuc3RhcnRzV2l0aChcIkBhc3Npc3RhbnRcIikgJiYgIShwYXJhVGV4dC5jb250YWlucyhcIkByZXNwb25zZVwiKSkpe1xuICAgICAgYnVpbGRlci5hZGQobGluZS50bywgbGluZS50bywgXG4gICAgICAgIERlY29yYXRpb24ud2lkZ2V0KFxuICAgICAgICAgIHt3aWRnZXQ6IG5ldyBJbmxpbmVBSVdpZGdldCh2aWV3LCBsaW5lLnRvLCBsaW5lLnRvKSwgc2lkZTogMX1cbiAgICAgICAgKSlcbiAgICB9XG4gICAgcmV0dXJuIGJ1aWxkZXIuZmluaXNoKCk7XG4gIH1cbn1cblxuY29uc3QgcGx1Z2luU3BlYzogUGx1Z2luU3BlYzxJbmxpbmVBc3Npc3RhbnRQbHVnaW4+ID0ge1xuICBkZWNvcmF0aW9uczogKHZhbHVlOiBJbmxpbmVBc3Npc3RhbnRQbHVnaW4pID0+IHZhbHVlLmRlY29yYXRpb25zLFxufTtcblxuZXhwb3J0IGNvbnN0IGlubGluZUFzc2lzdGFudFBsdWdpbiA9IFZpZXdQbHVnaW4uZnJvbUNsYXNzKFxuICBJbmxpbmVBc3Npc3RhbnRQbHVnaW4sXG4gIHBsdWdpblNwZWNcbik7Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUFBQSxtQkFBcUU7OztBQ0NyRSxtQkFBZ0M7QUFDaEMsc0JBQTBCO0FBQzFCLGtCQVNPO0FBRVAsSUFBQUMsbUJBQTZCO0FBRTdCLFNBQVMsV0FBVyxXQUF3QjtBQUMxQyxRQUFNLGFBQWE7QUFBQSxJQUFDO0FBQUEsSUFBTztBQUFBLElBQU87QUFBQSxJQUFPO0FBQUEsSUFBTztBQUFBLElBQU87QUFBQSxJQUMzQztBQUFBLElBQU87QUFBQSxJQUFPO0FBQUEsSUFBTztBQUFBLElBQU87QUFBQSxFQUFLO0FBQzdDLFFBQU0sT0FBTyxJQUFJLEtBQUssU0FBUztBQUMvQixRQUFNLGFBQWEsQ0FBQyxRQUF1QixJQUFJLFNBQVMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUN6RSxRQUFNLEtBQUssV0FBVyxLQUFLLFNBQVMsQ0FBQztBQUNyQyxRQUFNLEtBQUssV0FBVyxLQUFLLFdBQVcsQ0FBQztBQUN2QyxRQUFNLE1BQU0sV0FBVyxLQUFLLFFBQVEsQ0FBQztBQUNyQyxRQUFNLFFBQVEsV0FBWSxLQUFLLFNBQVMsSUFBRyxDQUFDO0FBQzVDLFFBQU0sT0FBTyxLQUFLLFlBQVk7QUFFOUIsU0FBTyxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksR0FBRyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQzVDO0FBSUEsU0FBUyxnQkFBZ0IsTUFBaUIsWUFBbUIsV0FBa0IsY0FBb0IsT0FDM0Q7QUFDdEMsUUFBTSxl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QUFjO0FBQUEsTUFBZTtBQUFBLE1BQzdCLE1BQUk7QUFDRixZQUFJLHdCQUFPLGlCQUFpQjtBQUM1QixnQkFBUSxJQUFJLGlCQUFpQjtBQUFBLE1BQzlCO0FBQUEsSUFDRjtBQUVKLFNBQUssd0JBQXdCLENBQUMscUJBQXFCLENBQUM7QUFFcEQsU0FBSyxXQUFXO0FBQUEsTUFDZixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULFdBQVcsQ0FBQyxPQUFNLE9BQU87QUFBQSxRQUN6QixLQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsTUFDRCxnQkFBZ0IsT0FBTyxTQUFTLFNBQVM7QUFDeEMsZ0JBQVEsSUFBSSxrQkFBa0I7QUFDOUIsY0FBTSxjQUFjLFNBQVMsZUFBZSxrQkFBa0I7QUFDOUQsWUFBSSxnQkFBZ0IsS0FBTTtBQUcxQixjQUFNLGFBQWEsS0FBSyxPQUFPO0FBQy9CLGNBQU0sWUFBWSxVQUFVO0FBQUEsTUFDN0I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iXQp9Cg==
