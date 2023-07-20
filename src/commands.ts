import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface TConfig {
  tabs: TTab[];
  closeUnmanagedTerminals: boolean;
  closeUnmanagedTabs: boolean;
}

interface TTab {
  type: string;
  name: string;
  viewColumn: vscode.ViewColumn;
  active: boolean;
}

interface TFile extends TTab {
  uri: string;
}

interface TBrowser extends TTab {
  uri: string;
}

interface TTerminal extends TTab {
  name: string;
  command: string;
  viewColumn: vscode.ViewColumn;
  location: string;
  active: boolean;
  message: string;
  env: object;
  cwd: string;
}

var panels: vscode.WebviewPanel[] = [];

const emptyConfig: TConfig = {
  tabs: [],
  closeUnmanagedTabs: false,
  closeUnmanagedTerminals: false,
};

function getConfigPath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders === undefined || workspaceFolders.length === 0) {
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const vscodePath = `${rootPath}${path.sep}.vscode`;
  if (fs.existsSync(vscodePath) === false) {
    fs.mkdirSync(vscodePath);
  }
  return `${vscodePath}${path.sep}workspace.json`;
}

function getConfig(configPath: string): TConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config: TConfig = JSON.parse(content);
    if (Array.isArray(config.tabs) === false) {
      throw new Error();
    }
    return config;
  } catch (err) {
    return { ...emptyConfig };
  }
}

function getExtensionUri() {
  const extension = vscode.extensions.getExtension('jumppad.workspace-config');
  return extension
    ? extension.extensionUri
    : vscode.Uri.parse('');
}

function getWorkspaceUri() {
  return vscode.workspace.workspaceFolders 
    ? vscode.workspace.workspaceFolders[0].uri 
    : vscode.Uri.parse(''); 
}

function getBrowserIcon() {
  const extensionPath = getExtensionUri();
  return {
    light: vscode.Uri.joinPath(extensionPath, 'images', 'browser_light.svg'),
    dark: vscode.Uri.joinPath(extensionPath, 'images', 'browser_dark.svg')
  };
}

function getActiveTabIndex(config: TConfig) {
  const active = config.tabs.find(t => t.active);
  if (!active) {
    return 1;
  }

  const tabs = vscode.window.tabGroups.all.map(group => group.tabs).flat();
  const index = tabs.findIndex(t => {
    if (t.input instanceof vscode.TabInputText && active.type === "file") {
      const file = <TFile>active;
      const fileTab = <vscode.TabInputText>t.input;

      return path.join(getWorkspaceUri().path, file.uri) === fileTab.uri.path;
    } else {
      return t.label === active.name;
    }
  });

  if (index === -1) {
    return 1;
  }

  return index+1;
}

async function openTerminal(command: string, name: string, column: number, location: string) {
  // if we have a terminal with the same name, grab it
  let term: vscode.Terminal | undefined = vscode.window.terminals.find((term) => term.name === name);
  let opts: vscode.TerminalOptions;
  var opened = false;

  // if not create a new one
  if (term === undefined) {
    if(location === 'editor') {
      var locationOpts: vscode.TerminalEditorLocationOptions = {viewColumn: column, preserveFocus: true};
      opts = {name: name, location: locationOpts, isTransient: true};
    } else {
      opts = {name: name, isTransient: true};
    }

    term = vscode.window.createTerminal(opts);
    opened = true;
  }

  if (location !== "editor") {
    term?.show();
  }

  if (command !== '') {
    term?.sendText(command);
  }

  return opened;
}

async function openFile(uri: vscode.Uri) {
  const options: vscode.TextDocumentShowOptions = {
    preview: false,
    viewColumn: vscode.ViewColumn.One,
  };

  const workspaceFolder = getWorkspaceUri(); 
  const docURI = vscode.Uri.joinPath(workspaceFolder, uri.path);

  const files = await vscode.workspace.textDocuments.filter(doc => doc.fileName === docURI.fsPath);

  if (files.length === 0) {
    // no active file, open it and return
    const doc = await vscode.workspace.openTextDocument(docURI);
    await vscode.window.showTextDocument(doc, options);
    return;
  }

  // if we have the window open and it is not active just show it
  for await (const doc of files){
    if(vscode.window.activeTextEditor?.document.fileName !== doc.fileName){
      vscode.window.showTextDocument(doc, options).then(editor => {}).then(undefined, err => {});
    }
  }
}

async function openHtml(uri: vscode.Uri, name: string, column: number) {
  const openTabs = vscode.window.tabGroups.all.map(group => group.tabs).flat();
  const tab = openTabs.find(t => t.label === name);
  if (tab) {
    reloadBrowser(tab);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'openWebview', 
    name, 
    column, 
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panels.push(panel);

  panel.iconPath = getBrowserIcon();
  panel.webview.html = getWebViewHTML(uri.toString());
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.function) {
        case 'openFile':
          openFile(message.uri);
          break;
        case 'openHtml':
          openHtml(message.uri, message.name, message.viewColumn);
          break;
        case 'openTerminal':
          openTerminal(message.command, message.name, message.viewColumn, message.location);
          break;
      }
    },
    undefined,
    undefined //do we need to set this?
  );
}

function getWebViewHTML(uri: string) {
  return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cat Coding</title>
            <style>
              iframe {
                height: 100vh;
                background-color: #FFF;
              }
  
              body {
                padding: 0;
                margin: 0;
                height: 100%;
              }
  
              ul {
                list-style-type: none;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background-color: #333;
              }
              
              li {
                float: left;
              }
  
              li div {
                display: block;
                color: white;
                font-size: 16px;
                text-align: center;
                padding: 14px 16px;
                text-decoration: none;
              }
              
              li a {
                font-size: 16px;
                display: block;
                color: white;
                text-align: center;
                padding: 14px 16px;
                text-decoration: none;
              }
              
              /* Change the link color to #111 (black) on hover */
              li a:hover {
                background-color: #111;
              }
            </style>
            <script>
              const vscode = acquireVsCodeApi();
              function openFile(uri) {
                vscode.postMessage({
                  function: 'openFile',
                  uri: uri
                });
              }
            
              function openHtml(uri, title) {
                vscode.postMessage({
                  function: 'openHtml',
                  uri: uri,
                  title: title,
                });
              }
              
              function openTerminal(command, name) {
                vscode.postMessage({
                  function: 'openTerminal',
                  command: command,
                  name: name,
                });
              }
  
              function displayMessage (evt) {
                if (evt.data.function === 'openHtml') {
                  openHtml(evt.data.uri,evt.data.title);
                }
                
                if (evt.data.function === 'openFile') {
                  openFile(evt.data.uri,evt.data.title);
                }
                
                if (evt.data.function === 'openTerminal') {
                  openTerminal(evt.data.command,evt.data.name);
                }
                
                if (evt.data.function === 'reloadIFrame') {
                  reloadIFrame();
                }
              }
              
              if (window.addEventListener) {
                window.addEventListener("message", displayMessage, false);
              }
              else {
                window.attachEvent("onmessage", displayMessage);
              }
  
              function reloadIFrame() {
                document.getElementById('content').src = document.getElementById('content').src
              }
            </script>
        </head>
        <body>
            <!--<ul>
              <li><div>${uri}</div></li>
              <li style="float:right"><a class="active" href="#" onclick="reloadIFrame()">&#x27F3</a></li>
            </ul>-->
            <iframe width="100%" height="100%" src="${uri}" frameborder="0" id="content"></iframe>
        </body>
        </html>`;
}

export function reloadBrowser(tab?:vscode.Tab) {
  const activeTab = tab?.label ? tab : vscode.window.tabGroups.activeTabGroup.activeTab;
  const panel = panels.find(p => p.title === activeTab?.label);
  if(panel) {
    panel.webview.postMessage({"function":"reloadIFrame"});
  }
}

export async function restoreEditors(context: vscode.ExtensionContext) {
  const configPath = getConfigPath();
  if (configPath === undefined) {
    return;
  }

  const config: TConfig = getConfig(configPath);

  if (config.closeUnmanagedTabs) {
    const tabs = vscode.window.tabGroups.all.map(group => group.tabs).flat()
    .filter(tab => config.tabs.findIndex(t => {
      if (tab.input instanceof vscode.TabInputText && t.type === "file") {
        const file = <TFile>t;
        const fileTab = <vscode.TabInputText>tab.input;
        return path.join(getWorkspaceUri().path, file.uri) === fileTab.uri.path;
      } else {
        return t.name === tab.label;
      }
    }) === -1);
  
    tabs.forEach(tab => vscode.window.tabGroups.close(tab));
  }
  
  if (config.closeUnmanagedTerminals) {
    const terminals = vscode.window.terminals.filter(terminal => config.tabs.findIndex(t => t.name === terminal.name && t.type === "terminal") === -1);
    terminals.forEach(terminal => terminal.dispose());
  }

  let unopenedTerminals = 0;
  await config.tabs.forEach(async tab => {
    switch(tab.type) {
      case "file":
        const file = <TFile>tab;  
        await openFile(vscode.Uri.parse(file.uri, false));
        break;
      case "browser":
        const browser = <TBrowser>tab;  
        await openHtml(vscode.Uri.parse(browser.uri), browser.name, browser.viewColumn);
        break;
      case "terminal":
        const terminal = <TTerminal>tab;  
        let opened = await openTerminal(terminal.command, terminal.name, terminal.viewColumn, terminal.location);
        if(opened) {
          unopenedTerminals++;
        }

        break;
    }
  });

  // wait for all the terminals to be opened.
  if (unopenedTerminals > 0) {
    let ot = vscode.window.onDidOpenTerminal(async event => {
      unopenedTerminals--;
      if(unopenedTerminals === 0) {
        // on vscode in the browser this event can fire before the active
        // tab setting the focus has been changed.
        // delay setting the active tab to ensure the focus has been set
        setTimeout(() => { openActiveTab(config); },500);
        ot.dispose();
      }
    });
  } else {
    openActiveTab(config);
  }
}

function openActiveTab(config:TConfig) {
  let activeTab = getActiveTabIndex(config);
  let command = "workbench.action.openEditorAtIndex" + activeTab;
  let openTab = vscode.window.tabGroups.activeTabGroup.tabs.findIndex(t => t.isActive ) + 1;


  if (openTab !== activeTab) {
    vscode.commands.executeCommand(command);
  }
}