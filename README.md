# Workspace Manager

VSCode extension that lets you manage browser and terminal tabs inside your VSCode workspace.

## Example config

Adding the following to a file called `workspace.json` inside your `.vscode` folder would open the defined
tabs and terminals.

```json
{
  "tabs": [
    {
      "type": "file",
      "uri": ".vscode/workspace.json",
      "viewColumn": 1,
      "active": true
    },
    {
      "type": "browser",
      "uri": "https://jumppad.dev",
      "name": "Docs"
    },
    {
      "type": "browser",
      "uri": "https://jumppad.dev", 
      "name": "Terminal 1"
    },
    {
      "type": "terminal",
      "name": "Terminal 1", 
      "command": "docker ps", 
      "viewColumn": 1, 
      "location": "editor", 
      "env": {"HOME": "/root"},
      "cwd": "/root"
    },
    {
      "type": "terminal", 
      "name": "Terminal 2", 
      "command": "ls -la", 
      "viewColumn": 1, 
      "location": "panel"
    }
  ],
  "closeUnmanagedTabs": true,
  "closeUnmanagedTerminals": true
}
```