import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { escape } from 'querystring';

interface TConfig {
  tabs: TTab[];
  terminals: TTerminal[];
  closeAllTerminalsOnStart: boolean;
  closeAllTabsOnStart: boolean;
}

interface TTab {
  uri: string;
  title: string;
  viewColumn: vscode.ViewColumn;
  active: boolean;
}

interface TTerminal {
  name: string;
  command: string;
  viewColumn: vscode.ViewColumn;
  location: string;
  active: boolean;
  message: string;
  env: object;
  cwd: string;
}

const emptyConfig: TConfig = {
  tabs: [],
  terminals: [],
  closeAllTabsOnStart: false,
  closeAllTerminalsOnStart: false,
};

const panels: vscode.WebviewPanel[] = [];

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
    //fs.writeFileSync(configPath, JSON.stringify(emptyConfig, null, 2));
    return { ...emptyConfig };
  }
}


async function openFile(uri: string) {
  const options: vscode.TextDocumentShowOptions = {
    preview: false,
    viewColumn: vscode.ViewColumn.One,
  };

  const filePath = path.join(vscode.workspace.rootPath || '', uri);
  const docURI = vscode.Uri.file(filePath);

  const files = await vscode.workspace.textDocuments.filter(doc => doc.fileName === docURI.fsPath);

  if (files.length === 0) {
    console.log("openFile: " + filePath);
    // no active file, open it and return
    const doc = await vscode.workspace.openTextDocument(docURI);
    await vscode.window.showTextDocument(doc, options);
    return;
  }

  // if we have the window open and it is not active just show it
  for await (const doc of files){
    if(vscode.window.activeTextEditor?.document.fileName !== doc.fileName){
      console.log("openFile: " + filePath);
      vscode.window.showTextDocument(doc, options).then((editor) => {}).then(undefined, err => {});
    }
  }
}

async function openTerminal(command: string, name: string, column: number, location: string) {
  // if we have a terminal with the same name, grab it
  let term: vscode.Terminal | undefined = vscode.window.terminals.find((term) => term.name === name);
  let opts: vscode.TerminalOptions;

  // if not create a new one
  if (term === undefined) {
    if(location === "editor") {
      var locationOpts: vscode.TerminalEditorLocationOptions = {viewColumn: column};
      opts = {name: name, location: locationOpts, isTransient: true};
    } else {
      opts = {name: name, isTransient: true};
    }

    term = vscode.window.createTerminal(opts);
  }

  term?.show();

  if (command !== '') {
    term?.sendText(command);
  }
}

async function openHtml(context: vscode.ExtensionContext, uri: string, title: string, column: number) {
  // if the panel is open close it
  panels.forEach((panel, index) => {
    if (panel.title === title) {
      panel.dispose();
      panels.splice(index, 1);
    }
  });

  const panel = vscode.window.createWebviewPanel(
    'openWebview',
    title,
    column,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panels.push(panel);

  panel.iconPath = {
    light: vscode.Uri.joinPath(vscode.Uri.parse(context.extensionPath), "images", "browser_light.svg"),
    dark: vscode.Uri.joinPath(vscode.Uri.parse(context.extensionPath), "images", "browser_dark.svg"),
  };
  
  panel.webview.html = getWebViewHTML(uri);
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.function) {
        case 'openFile':
          openFile(message.uri);
          return;
        case 'openHtml':
          openHtml(context, message.uri, message.title, message.viewColumn);
          return;
        case 'openTerminal':
          openTerminal(message.command, message.name, message.viewColumn, message.location);
          return;
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

export function reloadActiveBrowser() {
  let activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (activeTab?.input instanceof  vscode.TabInputWebview) {
    panels.forEach((panel, index) => {
      if (panel.title === activeTab?.label) {
        panel.webview.postMessage({"function":"reloadIFrame"});
      }
    });
  }
}

export async function restoreEditors(context: vscode.ExtensionContext) {
  const configPath = getConfigPath();
  if (configPath === undefined) {
    return;
  }

  const config: TConfig = getConfig(configPath);

  if (config.closeAllTabsOnStart) {
    vscode.window.tabGroups.all.forEach(group => {
      vscode.window.tabGroups.close(group.tabs);
    });
  }
  
  if (config.closeAllTerminalsOnStart) {
    vscode.window.terminals.forEach(terminal => {
      terminal.dispose();
    });
  }

  config.tabs.forEach(async (tab) => {
    const uri = vscode.Uri.parse(tab.uri);
    if(uri.scheme === 'http' || uri.scheme === 'https') {
      openHtml(context, tab.uri, tab.title, tab.viewColumn);
    } else {
      openFile(tab.uri);
    }
  });
  
  config.terminals.forEach(async (terminal) => {
    let col: number = terminal.viewColumn || 1;
    openTerminal(terminal.command, terminal.name, col, terminal.location);
  });
}