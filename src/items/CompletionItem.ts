import * as vscode from 'vscode';


export class WikiRefCompletionItem implements vscode.CompletionItem {
  public detail?: string;
  public label: string;
  public kind: vscode.CompletionItemKind;
  public nodeID: string;

  constructor(label: string, kind: vscode.CompletionItemKind, nodeID: string) {
    this.label = label;
    this.kind = kind;
    this.nodeID = nodeID;
  }
}
