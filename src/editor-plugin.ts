// import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {requestUrl, Editor, Notice } from "obsidian";
// import { Buffer } from "buffer";
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

import InLineAITutorPlugin from './main';
import { before } from 'node:test';

const SEPARATOR = "-".repeat(10);

function formatDate(timestamp:number):string{
  const monthNames = ["jan", 'feb', "apr", 'may', 'jun', 'jul',
              "aug", "sep", "oct", "nov", "dec"];
  const date = new Date(timestamp);
  const addPadding = (num:number): string => num.toString().padStart(2, "0");
  const hh = addPadding(date.getHours());
  const mm = addPadding(date.getMinutes());
  const day = addPadding(date.getDate());
  const month = monthNames[(date.getMonth())-1];
  const year = date.getFullYear();

  return `${hh}:${mm} ${day} ${month} ${year}`;
}

export type maybeString = string | null;

export const IMAGE_FILE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']

async function formatTextBlob(plugin:InLineAITutorPlugin, text:string, idx:number=1){
  // const regexPattern: RegExp = new RegExp("\!\[\[([\w\s.\-_]+)\]\]", 'g');
  const file = plugin.app.workspace.getActiveFile();
  const sourcePath = file?.path as string;
  const regexPattern = /\!\[\[([\w\s_\-]+\.\w+)\]\]|\!\[.+\]\(([\w\s_\-]+\.\w+)\)/g;
  const lines = text.split('\n');
  const buffer: string[] = [];
  const contentArray:object[] = [];
  
  let number = idx;
  let interimObj:object|Array<object>;
  
  // test pattern 
  // const text_ = '![[Pasted image 20260517041407.png]]';
  // const re = /!\[\[([\w\s_-]+\.\w+)\]\]/g;
  // console.log('testing pattern');
  // for (const match of text_.matchAll(re)) {
  //   console.log(match[0]); // whole ![[...]]
  //   console.log(match[1]); // Pasted image 20260517041407.png
  // }
  // console.log("end of pattern test")
  // test pattern 

  for (const line of lines) {
    const matches = [...line.matchAll(regexPattern)];
    // console.log([...'![[Pasted image 20260517041407.png]]'.matchAll(regexPattern)]);
    // console.log("LINE:", JSON.stringify(line))
    if (matches.length>0){
      // extract image, convert to base
      interimObj = []
      for(const match of matches){
        const matched = match[1] ?? match[2];
        if (IMAGE_FILE_TYPES.contains(matched.split('.')[1])){
          const target = plugin.app.metadataCache.getFirstLinkpathDest(matched, sourcePath);
          const imagePath = target?.path;
          console.log("image found: ", imagePath)
          if(imagePath){
            const data = await plugin.app.vault.readBinary(target);
            const fileBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
            const imStr = `data:image/${matched.split('.')[1]};base64,${fileBuffer.toString("base64")}}`
            contentArray.push({type:"text", text: `<position_${number}>`});
            contentArray.push({type:"image_url", image_url: {url:imStr}});
            contentArray.push({type:"text", text: `</position_${number}>`});
            number++;
          }
        }
      }
    }
    else if (line.trim()===""){
        // merge buffer
        contentArray.push({type:"text", text: `<position_${number}>${buffer.join("\n")}<position_${number}`});
        number++;
        buffer.length = 0;
    }
    else if (line.trim()!==""){
      // add to buffer
      buffer.push(line);
    }
    // add position number and append the message to the content array.
  }

  return {contentArray, number}
}
function getQueryContext(view:EditorView, beforeLine:number, afterLine:number, sectionOnly:boolean=false)
:{beforeText:string, afterText:string}  {
  
  let number = beforeLine;
  const beforeLines = [];
  while (number > 0){
    const line = view.state.doc.line(number);
    if (sectionOnly && (line.text.startsWith("## "))){
      break
    }
    beforeLines.unshift(line.text);
    number--;
  }

  number = afterLine;
  const afterLines = [];
  while (number < view.state.doc.lines){
    const line = view.state.doc.line(number);
    if (sectionOnly && (line.text.startsWith("## "))){
      break
    }
    afterLines.push(line.text);
    number++;
  }
  

  const beforeText = beforeLines.join('\n')
  const afterText = afterLines.join('\n')

  // console.log("BEFORE TEXT:", beforeText);
  // console.log("AFTER TEXT:", afterText);
  return {beforeText, afterText}
}

export async function submitToLLM(view:EditorView, plugin:InLineAITutorPlugin){
    // console.log("submitting something!");
    // new Notice("submitting to LLM");
    const submitTime = formatDate(Date.now());
    const {content, beforeLine, afterLine} = getLLMquery(view);
    console.log("submitted at:", submitTime);
    // console.log(content);
    
    const defaultType = plugin.settings.defaultContext;
    const firstWord = content.split(" ")[0];
    const options = firstWord.split(":").slice(1, undefined);
    // console.log(options)
    if((options.length===1) &&(options[0]==="")) options.length = 0;
    // let answer:string;
    let beforeText: maybeString=null, afterText: maybeString=null;

    if(options.contains('isolated')||((defaultType==="isolated") && (options.length===0))){
      beforeText = null;
      afterText = null;
    }
    else if (options.contains("doc")||(defaultType==="doc") && (options.length===0)){
      const context = getQueryContext(view, beforeLine, afterLine);
      beforeText = context.beforeText;
      afterText = context.afterText;
      
    }
    else if (options.contains("section")||(defaultType==="section") && (options.length===0)){
      const context = getQueryContext(view, beforeLine, afterLine, true);
      // const context = getQueryContext(view, beforeLine, afterLine);
      beforeText = context.beforeText;
      afterText = context.afterText;
    }
    
    //       curl http://localhost:1234/api/v1/chat \
    //   -H "Content-Type: application/json" \
    //   -d '{
    //     "model": "google/gemma-4-26b-a4b",
    //     "system_prompt": "You answer only in rhymes.",
    //     "input": "What is your favorite color?"
    // }'
    const answer = await pingLLM(plugin, content, beforeText, afterText);
    if(answer){
      // new Notice("Response received!")
      console.log(answer);
      const receiveTime = formatDate(Date.now());
      // console.log("received at:", receiveTime);
    
      appendAnswer(view, answer, submitTime, receiveTime);
    }
    else{
      new Notice("Call failed")
    }
}

function appendAnswer(view:EditorView, text:string, submitTime:string, receiveTime:string){
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

    const formattedText = ` (submitted at ${submitTime})\n**@response** ${text} (responded at ${receiveTime})\n\n`
    view.dispatch({
        changes: {from:currLine.to, insert: formattedText},
        selection: {anchor: currLine.to+formattedText.length}
    })
}

async function pingLLM(plugin:InLineAITutorPlugin, query:string, beforeText:maybeString, afterText:maybeString):Promise<string|null>{
    const base_url = plugin.settings.baseURL;
    const url = `${base_url}/v1/chat/completions`;
    const model = plugin.settings.modelName;
    const system_prompt = "You are a concise and succinct assistant operating inside Obsidian.MD, a specialized note taking app.";
    
    const method = "POST";

    // console.log('before text', beforeText);
    // console.log('after text', afterText);
    let befArrayFormatted:object[]=[], aftArrayFormatted:object[]=[], num:number=0;
    
    if (beforeText){
      let {contentArray, number} = await formatTextBlob(plugin, beforeText, num);
      num = number;
      befArrayFormatted = contentArray;
      befArrayFormatted.unshift(
        {type:"text", text: `${SEPARATOR} START OF DOCUMENT PART ABOVE QUERY ${SEPARATOR}\n`}
      );
      befArrayFormatted.push(
        {type:"text", text: `${SEPARATOR} END OF DOCUMENT PART ABOVE QUERY ${SEPARATOR}\n`}
      );
    }

    // console.log('BEFORE CONTENT', befArrayFormatted);
    const active_num = num;
    num++;
    
    if (afterText){
      let {contentArray, number} = await formatTextBlob(plugin, afterText, num);
      num = number;
      aftArrayFormatted = contentArray;
      aftArrayFormatted.unshift(
        {type:"text", text: `${SEPARATOR} START OF DOCUMENT PART BELOW QUERY ${SEPARATOR}\n`}
      );
      aftArrayFormatted.push(
        {type:"text", text: `${SEPARATOR} END OF DOCUMENT PART BELOW QUERY ${SEPARATOR}\n`}
      );
    }

    // console.log('AFTER CONTENT', aftArrayFormatted);
    // const beforeText = `${separator} START OF DOCUMENT PART ABOVE QUERY ${separator}\n${beforeLines.join("\n")}\n${separator} END OF DOCUMENT PART ABOVE QUERY ${separator}\n`;
    // const afterText  = `${separator} START OF DOCUMENT PART BELOW QUERY ${separator}\n${afterLines.join("\n")}\n${separator} END OF DOCUMENT PART BELOW QUERY ${separator}\n`;;

    // console.log('query', query)
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
            {role: "system", content: plugin.systemPrompt},
            {role: "user", 
              content: [
                // {type: "text", text: beforeText ?? "\n"},
                ...befArrayFormatted,
                {type: "text", text: `<position_${active_num}> *This is the position of the user question/prompt currently posed to you* </position_${active_num}>`},
                // {type: "text", text: afterText  ?? "\n"},
                ...aftArrayFormatted,
                {type: "text", text: `current user prompt: ${query.split(" ").slice(1, undefined).join(" ")}`},
              ]}
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
    
    let beforeLine:number=100000;
    let afterLine:number=0;

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
    beforeLine=number;
    
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
    afterLine=number;
    return {content: allLines.join("\n"), beforeLine, afterLine}

}

// import { EmojiWidget } from 'emoji';
export class InlineAIWidget extends WidgetType {
  constructor(
    private plugin: InLineAITutorPlugin,
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
    // const queryWrapper = document.createElement('div');
    const button = document.createElement('button');
    button.innerText = "submit";
    button.style.position = "absolute";
    button.style.right = '0px';
    button.style.top = "0px";
    button.id = "ai-submit-button"
    
    button.onclick = async () => {
        submitToLLM(this.view, this.plugin);
        // button.style.display = "none";
    };
    // queryWrapper.appendChild(button);
    return button;
  }
}


export function viewPluginFactoryMethod(_plugin:InLineAITutorPlugin){
  class InlineAIATEditorVIewPlugin implements PluginValue {
    decorations: DecorationSet;
    plugin: InLineAITutorPlugin;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
      this.plugin = _plugin;
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
        if (currLine.text.trim() === "") break;
        else paraLines.unshift(currLine.text);
      }

      while (number < (view.state.doc.lines-1)){
        number++;
        const AftLine = view.state.doc.line(number);
        if (AftLine.text.trim()==="") break;
        else paraLines.push(AftLine.text);
      }
      
      const paraText = paraLines.join('\n');
      // console.log(paraText)
      console.log("paraText: ", paraText)
      
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
      else if (paraText.startsWith("@assistant") && !(paraText.contains("@response"))){
        builder.add(line.to, line.to, 
          Decoration.widget(
            {widget: new InlineAIWidget(this.plugin, view, line.to, line.to), side: 1}
          ))
      }
      return builder.finish();
    }
  }

  const pluginSpec: PluginSpec<InlineAIATEditorVIewPlugin> = {
    decorations: (value: InlineAIATEditorVIewPlugin) => value.decorations,
  };

  const inlineAIAIPlugin = ViewPlugin.fromClass(
    InlineAIATEditorVIewPlugin,
    pluginSpec
  );

return inlineAIAIPlugin
}