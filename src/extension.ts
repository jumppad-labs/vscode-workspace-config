import * as vscode from 'vscode';
import { restoreEditors, reloadActiveBrowser } from './commands';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('workspace_manager.reloadWorkspace', restoreEditors);
  context.subscriptions.push(disposable);
  
  disposable = vscode.commands.registerCommand('workspace_manager.reloadBrowser', reloadActiveBrowser);
  context.subscriptions.push(disposable);

  restoreEditors(context);
}

export function deactivate() {}