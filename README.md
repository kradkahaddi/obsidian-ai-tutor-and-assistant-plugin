# Inline AI Tutor and Assistant Plugin

## Note:
This plugin is in active development and is in alpha stages. Please regularly save your notebooks or create a secondary vault to test things. The plugin works by having a conversation with AI models directly in your document. see the example at the end.

IMPORTANT: The gemma hackathon version is present in the release/hackathon branch.

IMPORTANT: the gemma hackathon zip file is nested. be sure to extract the contents correctly. (automatically it extracts as ./plugin/\<this plugin>, you need to remove the middle /plugin/ directory so the effective directory is \<vault name>/.obsidian/plugins/\<plugin name as per manifest id>). The id field has been changed in the main branch and is different form the name in the submission branch (release/hackathon). This was done to later comply with obsidian plugin naming conventions.

IMPORTANT: ensure that the any zip extracted into plugins/ is not nested. the manifest.json should be directly visible as plugins/inline-ai-tutor-assistant/manifest.json
also the name of the folder must match the manifest "id" field.

## Installation
1. unzip or git clone into the \<vault>/.obsidian/plugins/\<the git repo/folder goes here>
2. if cloning, then do an npm run build if needed. Since the main.js is already present it shouldn't be necessary.
3. open obsidian -> settings -> community plugins -> TURN ON community plugins
4. switch on the "Inline AI Tutor+Assistant Plugin"
5. ensure that the folder in plugins/ is not nested and that manifest.json is visible in main sub-directory as plugins/inline-ai-tutor-assistant/manifest.json
6. follow the naming convention set by obsidian. the main directory of the plugin must be the same as the "id" field of the manifest.json. the id is now "inline-ai-tutor-assistant" but previously in the gemma hackathon submission it was "inline-ai-tutor-assistant-plugin".
7. An easy way to make sure you have the right folder name during git clone is: `git clone \<this repo> \<id field from manifest.json>`, this allows you to set a name correctly in one-shot.

## Usage
1. set the correct url and model name in the settings tab (open settings and see the plugin name in the left side pane.)
2. url should just be the http(s)://IP_ADDRESS or URI:PORT (v1/chat/completions is added automatically) so if doing local then it is probably http://127.0.0.1:8xxx (no trailing /)
3. The LLM query interface is triggered by typing @assistant at the start of a fresh paragraph. There must be a an empty line between typing @assistant and any other content.
4. CMD/CTRL + SHIFT + L is the default hot key to submit (when the button is visible)
5. you can control the amount of context that the model has access to:
    1. @assistant:isolated -> no document context. 
    2. @assistant:doc -> whole document as context.
    3. @assistant:section -> only the immediate section (identified by the ## Header)
    4. You can choose a default context in the settings.
    5. BE SURE TO NOT ADD ANY SPACE WHEN SPECIFYING CONTEXT. @assistant:doc is not the same as "@assistant: doc" or "@assistant :doc" or "@assistant : doc". only "@assistant:doc" no-spaces will trigger the llm call feature.
6. The plugin supports images too, make sure your model and framework support them.
7. currently lm-studio and llama.cpp are supported.
8. LLM responses are prefixed by **@response**
9. if the plugin sees @assistant at the start of line and sees there is no new-line above it, it will insert a new line automatically.

## Example screenshot
See this image for an example of correct calling
![alt text](assets/image.png)