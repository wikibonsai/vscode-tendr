import path from 'path';

import * as vscode from 'vscode';


// use 'nodeID' instead of 'id' because vscode.TreeItem will automatically
// check for unique values -- but we want to allow duplicates between 
// attrs and links.

export abstract class BaseTreeItem extends vscode.TreeItem {
  public nodeID?: string;
  public uri?: string;
  public type?: string;
  public direction?: 'fore' | 'back';
  public iconPath?: {
    dark: string,
    light: string,
  };
}

export class DisplayTreeItem extends BaseTreeItem {

  constructor(
    // 'top' or 'type'
    public type: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public direction?: 'fore' | 'back',
  ) {
    super(label, collapsibleState);
    this.contextValue = type;
    // this.collapsibleState = collapsibleState;
    if ((type === 'top') && (direction === 'fore')) {
      this.iconPath = {
        light: path.join(__filename, '..', '..', 'icons', 'light', 'foreref.svg'),
        dark: path.join(__filename, '..', '..', 'icons', 'dark', 'foreref.svg'),
      };
    }
    if ((type === 'top') && (direction === 'back')) {
      this.iconPath = {
        light: path.join(__filename, '..', '..', 'icons', 'light', 'backref.svg'),
        dark: path.join(__filename, '..', '..', 'icons', 'dark', 'backref.svg'),
      };
    }
  }
}

// tree item that corresponds to a document
// includes: 'orphan's
export class DocTreeItem extends BaseTreeItem {

  constructor(
    public readonly label: string,
    public uri: string,
    // public resourceUri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public nodeID: string,
  ) {
    super(label, collapsibleState);
    // todo: vscode wants treeview items to use the built-in 'vscode.open' command here so behavior is consistent across extensions...
    this.command = {
      // command: 'wikibonsai.open.file',
      command: 'vscode.open',
      arguments: [
        vscode.Uri.parse(this.uri),
        { selection: new vscode.Range(0, 0, 0, 0) }
      ],
      title: 'wikibonsai:open-rel',
    };
    // this.collapsibleState = collapsibleState;
    // todo: Utils.joinPath()
    this.iconPath = {
      light: path.join(__filename, '..', '..', 'icons', 'nodes', 'node.svg'),
      dark: path.join(__filename, '..', '..', 'icons', 'nodes', 'node.svg'),
    };
  }
}

export class NoDocTreeItem extends BaseTreeItem {

  constructor(
    public type: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    // used in the bonsai treeview -- so 
    // further descent is possible from a zombie node
    public readonly nodeID: string,
  ) {
    super(label, collapsibleState);
    // 'contextValue' for 'view/item/context' in package.json
    this.contextValue = type;
    this.iconPath = {
      light: path.join(__filename, '..', '..', 'icons', 'nodes', 'node-zombie.svg'),
      dark: path.join(__filename, '..', '..', 'icons', 'nodes', 'node-zombie.svg'),
    };
  }

  public filename(): string {
    return this.label.slice(3, this.label.length);
  }

  public createDoc(): void {
    vscode.commands.executeCommand(
      'wikibonsai.create.file',
      {
        id: this.nodeID,
        filename: this.filename(),
      },
    );
  }
}
