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
async function submitToLLM(view) {
  console.log("submitting something!");
  new import_obsidian2.Notice("submitting to LLM");
  const queryStr = getLLMquery(view);
  console.log(queryStr);
  const answer = await pingLLM(queryStr);
  if (answer) {
    new import_obsidian2.Notice("Response received!");
    console.log(answer);
    appendAnswer(view, answer);
  } else {
    new import_obsidian2.Notice("Call failed");
  }
}
function appendAnswer(view, text) {
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
  const formattedText = `
@response: ${text}`;
  view.dispatch({
    changes: { from: currLine.to, insert: formattedText },
    selection: { anchor: currLine.to + formattedText.length }
  });
}
async function pingLLM(query) {
  const base_url = "http://localhost:1234";
  const url = `${base_url}/v1/chat/completions`;
  const model = "google/gemma-4-26b-a4b";
  const system_prompt = "You are a concise and succinct assistant";
  const method = "POST";
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
        { role: "user", content: query }
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
  while (number > 1) {
    number--;
    let currLine = view.state.doc.line(number);
    if (currLine.text.trim() === "") {
      break;
    } else {
      allLines.unshift(currLine.text);
    }
  }
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
  return allLines.join("\n");
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
    } else if (paraText.startsWith("@assistant")) {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2VkaXRvci1wbHVnaW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7QXBwLCBFZGl0b3IsIE1hcmtkb3duVmlldywgTW9kYWwsIE5vdGljZSwgTWVudSwgUGx1Z2lufSBmcm9tICdvYnNpZGlhbic7XG4vLyBpbXBvcnQge0RFRkFVTFRfU0VUVElOR1MsIE15UGx1Z2luU2V0dGluZ3MsIFNhbXBsZVNldHRpbmdUYWJ9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5cbmltcG9ydCB7aW5saW5lQXNzaXN0YW50UGx1Z2luLCBzdWJtaXRUb0xMTX0gZnJvbSBcIi4vZWRpdG9yLXBsdWdpblwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNeVBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG5cdGFzeW5jIG9ubG9hZCgpIHtcblxuXHRcdHRoaXMuYWRkUmliYm9uSWNvbihcInBhcGVyLXBsYW5lXCIsIFwiUHJpbnQgdG8gY29uc29sZVwiLCBcblx0XHRcdFx0XHRcdFx0KCk9Pntcblx0XHRcdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJ0ZXN0aW5nIHBsdWdpbnNcIik7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygndGVzdGluZyBwbHVnaW5zJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbaW5saW5lQXNzaXN0YW50UGx1Z2luXSlcblxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJzdWJtaXQtYWktcHJvbXB0XCIsXG5cdFx0XHRuYW1lOiBcInN1Ym1pdCB0byB0aGUgTExNXCIsXG5cdFx0XHRob3RrZXlzOiBbeyBcblx0XHRcdFx0bW9kaWZpZXJzOiBbXCJNb2RcIixcIlNoaWZ0XCJdLCBcblx0XHRcdFx0a2V5OiBcIkxcIlxuXHRcdFx0fV0sXG5cdFx0XHRlZGl0b3JDYWxsYmFjazogYXN5bmMgKF9lZGl0b3IsIHZpZXcpID0+IHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ2hvdCBrZXkgZGV0ZWN0ZWQnKTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uQ2hlY2sgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWktc3VibWl0LWJ1dHRvbicpO1xuXHRcdFx0XHRpZiAoYnV0dG9uQ2hlY2sgPT09IG51bGwpIHJldHVybjtcblx0XHRcdFx0Ly8gYnV0dG9uQ2hlY2suc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdGNvbnN0IGVkaXRvclZpZXcgPSB2aWV3LmVkaXRvci5jbSBhcyBFZGl0b3JWaWV3O1xuXHRcdFx0XHRhd2FpdCBzdWJtaXRUb0xMTShlZGl0b3JWaWV3KTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG59IiwgImltcG9ydCB7IHN5bnRheFRyZWUgfSBmcm9tICdAY29kZW1pcnJvci9sYW5ndWFnZSc7XG5pbXBvcnQgeyBSYW5nZVNldEJ1aWxkZXIgfSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7XG5pbXBvcnQge3JlcXVlc3RVcmwgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7XG4gIERlY29yYXRpb24sXG4gIERlY29yYXRpb25TZXQsXG4gIEVkaXRvclZpZXcsXG4gIFBsdWdpblNwZWMsXG4gIFBsdWdpblZhbHVlLFxuICBWaWV3UGx1Z2luLFxuICBWaWV3VXBkYXRlLFxuICBXaWRnZXRUeXBlLFxufSBmcm9tICdAY29kZW1pcnJvci92aWV3JztcblxuaW1wb3J0IHtFZGl0b3IsIE5vdGljZX0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdWJtaXRUb0xMTSh2aWV3OkVkaXRvclZpZXcpe1xuICAgIGNvbnNvbGUubG9nKFwic3VibWl0dGluZyBzb21ldGhpbmchXCIpO1xuICAgIG5ldyBOb3RpY2UoXCJzdWJtaXR0aW5nIHRvIExMTVwiKTtcbiAgICBjb25zdCBxdWVyeVN0ciA9IGdldExMTXF1ZXJ5KHZpZXcpO1xuICAgIGNvbnNvbGUubG9nKHF1ZXJ5U3RyKTtcbiAgICAvLyAgICAgICBjdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9hcGkvdjEvY2hhdCBcXFxuICAgIC8vICAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxuICAgIC8vICAgLWQgJ3tcbiAgICAvLyAgICAgXCJtb2RlbFwiOiBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIixcbiAgICAvLyAgICAgXCJzeXN0ZW1fcHJvbXB0XCI6IFwiWW91IGFuc3dlciBvbmx5IGluIHJoeW1lcy5cIixcbiAgICAvLyAgICAgXCJpbnB1dFwiOiBcIldoYXQgaXMgeW91ciBmYXZvcml0ZSBjb2xvcj9cIlxuICAgIC8vIH0nXG4gICAgY29uc3QgYW5zd2VyID0gYXdhaXQgcGluZ0xMTShxdWVyeVN0cik7XG4gICAgaWYoYW5zd2VyKXtcbiAgICAgIG5ldyBOb3RpY2UoXCJSZXNwb25zZSByZWNlaXZlZCFcIilcbiAgICAgIGNvbnNvbGUubG9nKGFuc3dlcik7XG5cbiAgICAgIGFwcGVuZEFuc3dlcih2aWV3LCBhbnN3ZXIpO1xuICAgIH1cbiAgICBlbHNle1xuICAgICAgbmV3IE5vdGljZShcIkNhbGwgZmFpbGVkXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBlbmRBbnN3ZXIodmlldzpFZGl0b3JWaWV3LCB0ZXh0OnN0cmluZyl7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmVBdChwb3MpO1xuICAgIHdoaWxlIChjdXJyTGluZS5udW1iZXI8dmlldy5zdGF0ZS5kb2MubGluZXMpe1xuICAgICAgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKGN1cnJMaW5lLm51bWJlciArIDEpO1xuICAgICAgaWYgKGN1cnJMaW5lLnRleHQudHJpbSgpPT09XCJcIil7XG4gICAgICAgIGN1cnJMaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZShjdXJyTGluZS5udW1iZXItMSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjpjdXJyTGluZS50b30sXG4gICAgICBzY3JvbGxJbnRvVmlldzp0cnVlXG4gICAgfSlcblxuICAgIGNvbnN0IGZvcm1hdHRlZFRleHQgPSBgXFxuQHJlc3BvbnNlOiAke3RleHR9YFxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgICBjaGFuZ2VzOiB7ZnJvbTpjdXJyTGluZS50bywgaW5zZXJ0OiBmb3JtYXR0ZWRUZXh0fSxcbiAgICAgICAgc2VsZWN0aW9uOiB7YW5jaG9yOiBjdXJyTGluZS50bytmb3JtYXR0ZWRUZXh0Lmxlbmd0aH1cbiAgICB9KVxufVxuYXN5bmMgZnVuY3Rpb24gcGluZ0xMTShxdWVyeTpzdHJpbmcpOlByb21pc2U8c3RyaW5nfG51bGw+e1xuICAgIGNvbnN0IGJhc2VfdXJsID0gXCJodHRwOi8vbG9jYWxob3N0OjEyMzRcIjtcbiAgICBjb25zdCB1cmwgPSBgJHtiYXNlX3VybH0vdjEvY2hhdC9jb21wbGV0aW9uc2A7XG4gICAgY29uc3QgbW9kZWwgPSBcImdvb2dsZS9nZW1tYS00LTI2Yi1hNGJcIjtcbiAgICBjb25zdCBzeXN0ZW1fcHJvbXB0ID0gXCJZb3UgYXJlIGEgY29uY2lzZSBhbmQgc3VjY2luY3QgYXNzaXN0YW50XCI7XG4gICAgY29uc3QgbWV0aG9kID0gXCJQT1NUXCI7XG5cbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgICB1cmwsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBcIkJlYXJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtb2RlbCxcbiAgICAgICAgICBtZXNzYWdlczogW1xuICAgICAgICAgICAge3JvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHN5c3RlbV9wcm9tcHR9LFxuICAgICAgICAgICAge3JvbGU6IFwidXNlclwiLCBjb250ZW50OiBxdWVyeX1cbiAgICAgICAgICBdLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOjAuOSxcbiAgICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHBheWxvYWQpO1xuICByZXR1cm4gcmVzcG9uc2UuanNvbi5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0TExNcXVlcnkodmlldzpFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIGNvbnN0IGFsbExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBcbiAgICBjb25zdCBudW1MaW5lcyA9IHZpZXcuc3RhdGUuZG9jLmxpbmVzO1xuICAgIGxldCBudW1iZXIgPSBsaW5lLm51bWJlcjtcbiAgICBhbGxMaW5lcy5wdXNoKGxpbmUudGV4dCk7XG4gICAgXG4gICAgd2hpbGUobnVtYmVyPjEpe1xuICAgICAgbnVtYmVyLS07XG4gICAgICBsZXQgY3VyckxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lKG51bWJlcik7XG4gICAgICBpZiAoY3VyckxpbmUudGV4dC50cmltKCkgPT09IFwiXCIpe1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnYnJlYWtpbmcgcG9pbnQnKVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBsaW5lX3FObzogJHtudW1iZXJ9IGxpbmU6ICR7Y3VyckxpbmUubnVtYmVyfWAsIFwidGV4dDogXCIsIGN1cnJMaW5lLnRleHQpXG4gICAgICAgIGFsbExpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIG51bWJlciA9IGxpbmUubnVtYmVyO1xuICAgIHdoaWxlKG51bWJlcjwobnVtTGluZXMtMSkpe1xuICAgICAgbnVtYmVyKys7XG4gICAgICBjb25zdCBuZXh0TGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChuZXh0TGluZSAmJiAobmV4dExpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAgIGFsbExpbmVzLnB1c2gobmV4dExpbmUudGV4dClcbiAgICAgIH1cbiAgICAgIGVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYWxsTGluZXMuam9pbihcIlxcblwiKVxuXG59XG5cbi8vIGltcG9ydCB7IEVtb2ppV2lkZ2V0IH0gZnJvbSAnZW1vamknO1xuZXhwb3J0IGNsYXNzIElubGluZUFJV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgdmlldzogRWRpdG9yVmlldyxcbiAgICBwcml2YXRlIGZyb206IG51bWJlcixcbiAgICBwcml2YXRlIHRvOiBudW1iZXIsXG4gICl7XG4gICAgc3VwZXIoKVxuICB9XG4gIFxuICBlcShvdGhlcjogSW5saW5lQUlXaWRnZXQpIHtcbiAgICByZXR1cm4gdGhpcy5mcm9tID09PSBvdGhlci5mcm9tICYmIHRoaXMudG8gPT09IG90aGVyLnRvO1xuICB9XG5cbiAgdG9ET00odmlldzpFZGl0b3JWaWV3KTpIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgcXVlcnlXcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgYnV0dG9uLmlubmVyVGV4dCA9IFwic3VibWl0XCI7XG4gICAgYnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xuICAgIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwcHgnO1xuICAgIGJ1dHRvbi5pZCA9IFwiYWktc3VibWl0LWJ1dHRvblwiXG4gICAgXG4gICAgYnV0dG9uLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIHN1Ym1pdFRvTExNKHRoaXMudmlldyk7XG4gICAgICAgIC8vIGJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfTtcbiAgICBxdWVyeVdyYXBwZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICByZXR1cm4gcXVlcnlXcmFwcGVyO1xuICB9XG59XG5jbGFzcyBJbmxpbmVBc3Npc3RhbnRQbHVnaW4gaW1wbGVtZW50cyBQbHVnaW5WYWx1ZSB7XG4gIGRlY29yYXRpb25zOiBEZWNvcmF0aW9uU2V0O1xuXG4gIGNvbnN0cnVjdG9yKHZpZXc6IEVkaXRvclZpZXcpIHtcbiAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHZpZXcpO1xuICB9XG5cbiAgdXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuICAgIGlmICh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkKSB7XG4gICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5idWlsZERlY29yYXRpb25zKHVwZGF0ZS52aWV3KTtcbiAgICB9XG4gIH1cblxuICBkZXN0cm95KCkge31cblxuICBidWlsZERlY29yYXRpb25zKHZpZXc6IEVkaXRvclZpZXcpOiBEZWNvcmF0aW9uU2V0IHtcbiAgICBjb25zdCBidWlsZGVyID0gbmV3IFJhbmdlU2V0QnVpbGRlcjxEZWNvcmF0aW9uPigpO1xuXG4gICAgY29uc3QgcG9zID0gdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkO1xuICAgIFxuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBsZXQgbnVtYmVyID0gbGluZS5udW1iZXI7XG4gICAgLy8gY29uc29sZS5sb2coJ3N0YXJ0IG51bWJlcjogJywgbnVtYmVyKVxuICAgIC8vIGNvbnNvbGUubG9nKCdjdXJyZW50IGxpbmUgaXM6JywgbGluZS50ZXh0KVxuICAgIFxuICAgIGNvbnN0IHBhcmFMaW5lczogc3RyaW5nW10gPSBbXVxuICAgIHBhcmFMaW5lcy5wdXNoKGxpbmUudGV4dClcbiAgICB3aGlsZShudW1iZXI+MSl7XG4gICAgICBudW1iZXItLTtcbiAgICAgIGxldCBjdXJyTGluZSA9IHZpZXcuc3RhdGUuZG9jLmxpbmUobnVtYmVyKTtcbiAgICAgIGlmIChjdXJyTGluZS50ZXh0LnRyaW0oKSA9PT0gXCJcIil7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKCdicmVha2luZyBwb2ludCcpXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZWxzZXtcbiAgICAgICAgLy8gY29uc29sZS5sb2coYGxpbmVfcU5vOiAke251bWJlcn0gbGluZTogJHtjdXJyTGluZS5udW1iZXJ9YCwgXCJ0ZXh0OiBcIiwgY3VyckxpbmUudGV4dClcbiAgICAgICAgcGFyYUxpbmVzLnVuc2hpZnQoY3VyckxpbmUudGV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBhcmFUZXh0ID0gcGFyYUxpbmVzLmpvaW4oJ1xcbicpO1xuICAgIFxuICAgIC8vIGNvbnNvbGUubG9nKFwicGFyYVRleHQ6IFwiLCBwYXJhVGV4dClcbiAgICBcbiAgICBjb25zdCBwcmV2TGluZSA9IGxpbmUubnVtYmVyID4gMSA/IHZpZXcuc3RhdGUuZG9jLmxpbmUobGluZS5udW1iZXItMSk6IG51bGw7XG4gICAgLy8gY29uc29sZS5sb2coXCJwcmV2aW91cyBsaW5lOiBcIiwgcHJldkxpbmU/LnRleHQpO1xuICAgIFxuICAgIGlmKGxpbmUudGV4dC5zdGFydHNXaXRoKFwiQGFzc2lzdGFudFwiKSAmJiAobGluZS5udW1iZXIgPiAxKSAmJiAocHJldkxpbmU/LnRleHQudHJpbSgpICE9PSBcIlwiKSl7XG4gICAgICAvLyB0aGlzIGNvbmRpdGlvbiBtZWFucyB0aGF0IGl0IGlzIG5vdCB0aGUgZmlyc3QgbGluZSBhbmQgaXQgaXMgbm90IGEgcGFyYWdyYXBoIGJ5IGl0c2VsZi5cbiAgICAgIGNvbnNvbGUubG9nKFwid2lsbCBuZWVkIHRvIGFkZCBhIGxpbmUgYnJlYWtcIilcbiAgICAgIGNvbnN0IGluc2VydGlvblN0ciA9IFwiXFxuXCJcbiAgICAgIHNldFRpbWVvdXQoKCk9Pnt2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgY2hhbmdlczoge2Zyb206bGluZS5mcm9tLCBpbnNlcnQ6IGluc2VydGlvblN0cn0sXG4gICAgICAgIHNlbGVjdGlvbjoge2FuY2hvcjogbGluZS50bytpbnNlcnRpb25TdHIubGVuZ3RofVxuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgfVxuICAgIGVsc2UgaWYgKHBhcmFUZXh0LnN0YXJ0c1dpdGgoXCJAYXNzaXN0YW50XCIpKXtcbiAgICAgIGJ1aWxkZXIuYWRkKGxpbmUudG8sIGxpbmUudG8sIFxuICAgICAgICBEZWNvcmF0aW9uLndpZGdldChcbiAgICAgICAgICB7d2lkZ2V0OiBuZXcgSW5saW5lQUlXaWRnZXQodmlldywgbGluZS50bywgbGluZS50byksIHNpZGU6IDF9XG4gICAgICAgICkpXG4gICAgfVxuICAgIHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xuICB9XG59XG5cbmNvbnN0IHBsdWdpblNwZWM6IFBsdWdpblNwZWM8SW5saW5lQXNzaXN0YW50UGx1Z2luPiA9IHtcbiAgZGVjb3JhdGlvbnM6ICh2YWx1ZTogSW5saW5lQXNzaXN0YW50UGx1Z2luKSA9PiB2YWx1ZS5kZWNvcmF0aW9ucyxcbn07XG5cbmV4cG9ydCBjb25zdCBpbmxpbmVBc3Npc3RhbnRQbHVnaW4gPSBWaWV3UGx1Z2luLmZyb21DbGFzcyhcbiAgSW5saW5lQXNzaXN0YW50UGx1Z2luLFxuICBwbHVnaW5TcGVjXG4pOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFBQUEsbUJBQXFFOzs7QUNDckUsbUJBQWdDO0FBQ2hDLHNCQUEwQjtBQUMxQixrQkFTTztBQUVQLElBQUFDLG1CQUE2QjtBQUU3QixlQUFzQixZQUFZLE1BQWdCO0FBQzlDLFVBQVEsSUFBSSx1QkFBdUI7QUFDbkMsTUFBSSx3QkFBTyxtQkFBbUI7QUFDOUIsUUFBTSxXQUFXLFlBQVksSUFBSTtBQUNqQyxVQUFRLElBQUksUUFBUTtBQVFwQixRQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVE7QUFDckMsTUFBRyxRQUFPO0FBQ1IsUUFBSSx3QkFBTyxvQkFBb0I7QUFDL0IsWUFBUSxJQUFJLE1BQU07QUFFbEIsaUJBQWEsTUFBTSxNQUFNO0FBQUEsRUFDM0IsT0FDSTtBQUNGLFFBQUksd0JBQU8sYUFBYTtBQUFBLEVBQzFCO0FBQ0o7QUFFQSxTQUFTLGFBQWEsTUFBaUIsTUFBWTtBQUMvQyxRQUFNLE1BQU0sS0FBSyxNQUFNLFVBQVUsS0FBSztBQUN0QyxNQUFJLFdBQVcsS0FBSyxNQUFNLElBQUksT0FBTyxHQUFHO0FBQ3hDLFNBQU8sU0FBUyxTQUFPLEtBQUssTUFBTSxJQUFJLE9BQU07QUFDMUMsZUFBVyxLQUFLLE1BQU0sSUFBSSxLQUFLLFNBQVMsU0FBUyxDQUFDO0FBQ2xELFFBQUksU0FBUyxLQUFLLEtBQUssTUFBSSxJQUFHO0FBQzVCLGlCQUFXLEtBQUssTUFBTSxJQUFJLEtBQUssU0FBUyxTQUFPLENBQUM7QUFDaEQ7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNBLE9BQUssU0FBUztBQUFBLElBQ1osV0FBVyxFQUFDLFFBQU8sU0FBUyxHQUFFO0FBQUEsSUFDOUIsZ0JBQWU7QUFBQSxFQUNqQixDQUFDO0FBRUQsUUFBTSxnQkFBZ0I7QUFBQSxhQUFnQixJQUFJO0FBQzFDLE9BQUssU0FBUztBQUFBLElBQ1YsU0FBUyxFQUFDLE1BQUssU0FBUyxJQUFJLFFBQVEsY0FBYTtBQUFBLElBQ2pELFdBQVcsRUFBQyxRQUFRLFNBQVMsS0FBRyxjQUFjLE9BQU07QUFBQSxFQUN4RCxDQUFDO0FBQ0w7QUFDQSxlQUFlLFFBQVEsT0FBa0M7QUFDckQsUUFBTSxXQUFXO0FBQ2pCLFFBQU0sTUFBTSxHQUFHLFFBQVE7QUFDdkIsUUFBTSxRQUFRO0FBQ2QsUUFBTSxnQkFBZ0I7QUFDdEIsUUFBTSxTQUFTO0FBRWYsUUFBTSxVQUFVO0FBQUEsSUFDWjtBQUFBLElBQ0E7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLElBQ25CO0FBQUEsSUFDQSxNQUFNLEtBQUssVUFBVTtBQUFBLE1BQ25CO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDUixFQUFDLE1BQU0sVUFBVSxTQUFTLGNBQWE7QUFBQSxRQUN2QyxFQUFDLE1BQU0sUUFBUSxTQUFTLE1BQUs7QUFBQSxNQUMvQjtBQUFBLE1BQ0EsYUFBWTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0w7QUFDQSxRQUFNLFdBQVcsVUFBTSw0QkFBVyxPQUFPO0FBQzNDLFNBQU8sU0FBUyxLQUFLLFVBQVUsQ0FBQyxHQUFHLFNBQVMsV0FBVztBQUN6RDtBQUVBLFNBQVMsWUFBWSxNQUFpQjtBQUNsQyxRQUFNLE1BQU0sS0FBSyxNQUFNLFVBQVUsS0FBSztBQUN0QyxRQUFNLFdBQXFCLENBQUM7QUFDNUIsUUFBTSxPQUFPLEtBQUssTUFBTSxJQUFJLE9BQU8sR0FBRztBQUV0QyxRQUFNLFdBQVcsS0FBSyxNQUFNLElBQUk7QUFDaEMsTUFBSSxTQUFTLEtBQUs7QUFDbEIsV0FBUyxLQUFLLEtBQUssSUFBSTtBQUV2QixTQUFNLFNBQU8sR0FBRTtBQUNiO0FBQ0EsUUFBSSxXQUFXLEtBQUssTUFBTSxJQUFJLEtBQUssTUFBTTtBQUN6QyxRQUFJLFNBQVMsS0FBSyxLQUFLLE1BQU0sSUFBRztBQUU5QjtBQUFBLElBQ0YsT0FDSTtBQUVGLGVBQVMsUUFBUSxTQUFTLElBQUk7QUFBQSxJQUNoQztBQUFBLEVBQ0Y7QUFFQSxXQUFTLEtBQUs7QUFDZCxTQUFNLFNBQVEsV0FBUyxHQUFHO0FBQ3hCO0FBQ0EsVUFBTSxXQUFXLEtBQUssTUFBTSxJQUFJLEtBQUssTUFBTTtBQUMzQyxRQUFJLFlBQWEsVUFBVSxLQUFLLEtBQUssTUFBTSxJQUFJO0FBQzdDLGVBQVMsS0FBSyxTQUFTLElBQUk7QUFBQSxJQUM3QixPQUNJO0FBQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNBLFNBQU8sU0FBUyxLQUFLLElBQUk7QUFFN0I7QUFHTyxJQUFNLGlCQUFOLGNBQTZCLHVCQUFXO0FBQUEsRUFDN0MsWUFDVSxNQUNBLE1BQ0EsSUFDVDtBQUNDLFVBQU07QUFKRTtBQUNBO0FBQ0E7QUFBQSxFQUdWO0FBQUEsRUFMVTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFLVixHQUFHLE9BQXVCO0FBQ3hCLFdBQU8sS0FBSyxTQUFTLE1BQU0sUUFBUSxLQUFLLE9BQU8sTUFBTTtBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxNQUFNLE1BQTZCO0FBQ2pDLFVBQU0sZUFBZSxTQUFTLGNBQWMsS0FBSztBQUNqRCxVQUFNLFNBQVMsU0FBUyxjQUFjLFFBQVE7QUFDOUMsV0FBTyxZQUFZO0FBQ25CLFdBQU8sTUFBTSxXQUFXO0FBQ3hCLFdBQU8sTUFBTSxRQUFRO0FBQ3JCLFdBQU8sS0FBSztBQUVaLFdBQU8sVUFBVSxZQUFZO0FBQ3pCLGtCQUFZLEtBQUssSUFBSTtBQUFBLElBRXpCO0FBQ0EsaUJBQWEsWUFBWSxNQUFNO0FBQy9CLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFDQSxJQUFNLHdCQUFOLE1BQW1EO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFlBQVksTUFBa0I7QUFDNUIsU0FBSyxjQUFjLEtBQUssaUJBQWlCLElBQUk7QUFBQSxFQUMvQztBQUFBLEVBRUEsT0FBTyxRQUFvQjtBQUN6QixRQUFJLE9BQU8sY0FBYyxPQUFPLGlCQUFpQjtBQUMvQyxXQUFLLGNBQWMsS0FBSyxpQkFBaUIsT0FBTyxJQUFJO0FBQUEsSUFDdEQ7QUFBQSxFQUNGO0FBQUEsRUFFQSxVQUFVO0FBQUEsRUFBQztBQUFBLEVBRVgsaUJBQWlCLE1BQWlDO0FBQ2hELFVBQU0sVUFBVSxJQUFJLDZCQUE0QjtBQUVoRCxVQUFNLE1BQU0sS0FBSyxNQUFNLFVBQVUsS0FBSztBQUV0QyxVQUFNLE9BQU8sS0FBSyxNQUFNLElBQUksT0FBTyxHQUFHO0FBQ3RDLFFBQUksU0FBUyxLQUFLO0FBSWxCLFVBQU0sWUFBc0IsQ0FBQztBQUM3QixjQUFVLEtBQUssS0FBSyxJQUFJO0FBQ3hCLFdBQU0sU0FBTyxHQUFFO0FBQ2I7QUFDQSxVQUFJLFdBQVcsS0FBSyxNQUFNLElBQUksS0FBSyxNQUFNO0FBQ3pDLFVBQUksU0FBUyxLQUFLLEtBQUssTUFBTSxJQUFHO0FBRTlCO0FBQUEsTUFDRixPQUNJO0FBRUYsa0JBQVUsUUFBUSxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0Y7QUFFQSxVQUFNLFdBQVcsVUFBVSxLQUFLLElBQUk7QUFJcEMsVUFBTSxXQUFXLEtBQUssU0FBUyxJQUFJLEtBQUssTUFBTSxJQUFJLEtBQUssS0FBSyxTQUFPLENBQUMsSUFBRztBQUd2RSxRQUFHLEtBQUssS0FBSyxXQUFXLFlBQVksS0FBTSxLQUFLLFNBQVMsS0FBTyxVQUFVLEtBQUssS0FBSyxNQUFNLElBQUk7QUFFM0YsY0FBUSxJQUFJLCtCQUErQjtBQUMzQyxZQUFNLGVBQWU7QUFDckIsaUJBQVcsTUFBSTtBQUFDLGFBQUssU0FBUztBQUFBLFVBQzVCLFNBQVMsRUFBQyxNQUFLLEtBQUssTUFBTSxRQUFRLGFBQVk7QUFBQSxVQUM5QyxXQUFXLEVBQUMsUUFBUSxLQUFLLEtBQUcsYUFBYSxPQUFNO0FBQUEsUUFDL0MsQ0FBQztBQUFBLE1BQ0gsQ0FBQztBQUFBLElBQ0gsV0FDUyxTQUFTLFdBQVcsWUFBWSxHQUFFO0FBQ3pDLGNBQVE7QUFBQSxRQUFJLEtBQUs7QUFBQSxRQUFJLEtBQUs7QUFBQSxRQUN4Qix1QkFBVztBQUFBLFVBQ1QsRUFBQyxRQUFRLElBQUksZUFBZSxNQUFNLEtBQUssSUFBSSxLQUFLLEVBQUUsR0FBRyxNQUFNLEVBQUM7QUFBQSxRQUM5RDtBQUFBLE1BQUM7QUFBQSxJQUNMO0FBQ0EsV0FBTyxRQUFRLE9BQU87QUFBQSxFQUN4QjtBQUNGO0FBRUEsSUFBTSxhQUFnRDtBQUFBLEVBQ3BELGFBQWEsQ0FBQyxVQUFpQyxNQUFNO0FBQ3ZEO0FBRU8sSUFBTSx3QkFBd0IsdUJBQVc7QUFBQSxFQUM5QztBQUFBLEVBQ0E7QUFDRjs7O0FEaE9BLElBQXFCLFdBQXJCLGNBQXNDLHdCQUFPO0FBQUEsRUFDNUMsTUFBTSxTQUFTO0FBRWQsU0FBSztBQUFBLE1BQWM7QUFBQSxNQUFlO0FBQUEsTUFDN0IsTUFBSTtBQUNGLFlBQUksd0JBQU8saUJBQWlCO0FBQzVCLGdCQUFRLElBQUksaUJBQWlCO0FBQUEsTUFDOUI7QUFBQSxJQUNGO0FBRUosU0FBSyx3QkFBd0IsQ0FBQyxxQkFBcUIsQ0FBQztBQUVwRCxTQUFLLFdBQVc7QUFBQSxNQUNmLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFNBQVMsQ0FBQztBQUFBLFFBQ1QsV0FBVyxDQUFDLE9BQU0sT0FBTztBQUFBLFFBQ3pCLEtBQUs7QUFBQSxNQUNOLENBQUM7QUFBQSxNQUNELGdCQUFnQixPQUFPLFNBQVMsU0FBUztBQUN4QyxnQkFBUSxJQUFJLGtCQUFrQjtBQUM5QixjQUFNLGNBQWMsU0FBUyxlQUFlLGtCQUFrQjtBQUM5RCxZQUFJLGdCQUFnQixLQUFNO0FBRzFCLGNBQU0sYUFBYSxLQUFLLE9BQU87QUFDL0IsY0FBTSxZQUFZLFVBQVU7QUFBQSxNQUM3QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiJdCn0K
