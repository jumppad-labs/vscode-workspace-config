import * as vscode from 'vscode';
import { restoreEditors, reloadBrowser } from './commands';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('workspace_config.reloadWorkspace', () => {
    restoreEditors(context);
  });
  context.subscriptions.push(disposable);
  
  disposable = vscode.commands.registerCommand('workspace_config.reloadBrowser', reloadBrowser);
  context.subscriptions.push(disposable);

  restoreEditors(context);
}

export function deactivate() {}