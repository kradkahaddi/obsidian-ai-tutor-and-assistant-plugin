import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {requestUrl } from "obsidian";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';

import {Editor, Notice} from "obsidian";

export async function submitToLLM(view:EditorView){
    console.log("submitting something!");
    new Notice("submitting to LLM");
    const queryStr = getLLMquery(view);
    console.log(queryStr);
    //       curl http://localhost:1234/api/v1/chat \
    //   -H "Content-Type: application/json" \
    //   -d '{
    //     "model": "google/gemma-4-26b-a4b",
    //     "system_prompt": "You answer only in rhymes.",
    //     "input": "What is your favorite color?"
    // }'
    const answer = await pingLLM(queryStr);
    if(answer){
      new Notice("Response received!")
      console.log(answer);

      appendAnswer(view, answer);
    }
    else{
      new Notice("Call failed")
    }
}

function appendAnswer(view:EditorView, text:string){
    const pos = view.state.selection.main.head;
    let currLine = view.state.doc.lineAt(pos);
    while (currLine.number<view.state.doc.lines){
      currLine = view.state.doc.line(currLine.number + 1);
      if (currLine.text.trim()===""){
        currLine = view.state.doc.line(currLine.number-1);
        break;
      }
    }
    view.dispatch({
      selection: {anchor:currLine.to},
      scrollIntoView:true
    })

    const formattedText = `\n@response: ${text}`
    view.dispatch({
        changes: {from:currLine.to, insert: formattedText},
        selection: {anchor: currLine.to+formattedText.length}
    })
}
async function pingLLM(query:string):Promise<string|null>{
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
            {role: "system", content: system_prompt},
            {role: "user", content: query}
          ],
          temperature:0.9,
        })
    }
    const response = await requestUrl(payload);
  return response.json.choices?.[0]?.message?.content ?? null;
}

function getLLMquery(view:EditorView) {
    const pos = view.state.selection.main.head;
    const allLines: string[] = [];
    const line = view.state.doc.lineAt(pos);
    
    const numLines = view.state.doc.lines;
    let number = line.number;
    allLines.push(line.text);
    
    while(number>1){
      number--;
      let currLine = view.state.doc.line(number);
      if (currLine.text.trim() === ""){
        // console.log('breaking point')
        break;
      }
      else{
        // console.log(`line_qNo: ${number} line: ${currLine.number}`, "text: ", currLine.text)
        allLines.unshift(currLine.text);
      }
    }
    
    number = line.number;
    while(number<(numLines-1)){
      number++;
      const nextLine = view.state.doc.line(number);
      if (nextLine && (nextLine?.text.trim() !== "")){
        allLines.push(nextLine.text)
      }
      else{
        break;
      }
    }
    return allLines.join("\n")

}

// import { EmojiWidget } from 'emoji';
export class InlineAIWidget extends WidgetType {
  constructor(
    private view: EditorView,
    private from: number,
    private to: number,
  ){
    super()
  }
  
  eq(other: InlineAIWidget) {
    return this.from === other.from && this.to === other.to;
  }

  toDOM(view:EditorView):HTMLElement {
    const queryWrapper = document.createElement('div');
    const button = document.createElement('button');
    button.innerText = "submit";
    button.style.position = "absolute";
    button.style.right = '0px';
    button.id = "ai-submit-button"
    
    button.onclick = async () => {
        submitToLLM(this.view);
        // button.style.display = "none";
    };
    queryWrapper.appendChild(button);
    return queryWrapper;
  }
}
class InlineAssistantPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {}

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    const pos = view.state.selection.main.head;
    
    const line = view.state.doc.lineAt(pos);
    let number = line.number;
    // console.log('start number: ', number)
    // console.log('current line is:', line.text)
    
    const paraLines: string[] = []
    paraLines.push(line.text)
    while(number>1){
      number--;
      let currLine = view.state.doc.line(number);
      if (currLine.text.trim() === ""){
        // console.log('breaking point')
        break;
      }
      else{
        // console.log(`line_qNo: ${number} line: ${currLine.number}`, "text: ", currLine.text)
        paraLines.unshift(currLine.text);
      }
    }
    
    const paraText = paraLines.join('\n');
    
    // console.log("paraText: ", paraText)
    
    const prevLine = line.number > 1 ? view.state.doc.line(line.number-1): null;
    // console.log("previous line: ", prevLine?.text);
    
    if(line.text.startsWith("@assistant") && (line.number > 1) && (prevLine?.text.trim() !== "")){
      // this condition means that it is not the first line and it is not a paragraph by itself.
      console.log("will need to add a line break")
      const insertionStr = "\n"
      setTimeout(()=>{view.dispatch({
        changes: {from:line.from, insert: insertionStr},
        selection: {anchor: line.to+insertionStr.length}
        });
      })
    }
    else if (paraText.startsWith("@assistant")){
      builder.add(line.to, line.to, 
        Decoration.widget(
          {widget: new InlineAIWidget(view, line.to, line.to), side: 1}
        ))
    }
    return builder.finish();
  }
}

const pluginSpec: PluginSpec<InlineAssistantPlugin> = {
  decorations: (value: InlineAssistantPlugin) => value.decorations,
};

export const inlineAssistantPlugin = ViewPlugin.fromClass(
  InlineAssistantPlugin,
  pluginSpec
);