import * as vscode from 'vscode';

import { NODE, Node } from 'caudex';

import { IndexProvider } from '../sys/IndexProvider';
import { BaseTreeItem } from '../../items/TreeItems';
import { TypeProvider } from '../sys/TypeProvider';


export class BaseTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

  protected types: TypeProvider;
  protected index: IndexProvider;

  constructor(types: TypeProvider, index: IndexProvider) {
    // logger.debug('BaseTreeDataProvider.constructor');
    this.types = types;
    this.index = index;
  }

  public refresh(): void {
    // logger.debug('BaseTreeDataProvider.refresh');
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    // logger.debug('BaseTreeDataProvider.getTreeItem');
    return element;
  }

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    if (element) { return element; }
    return [];
  }

  // util

  public getActiveUri() {
    return vscode.window.activeTextEditor?.document.uri;
  }

  public buildLabel(filename: string, title?: string): string {
    const node: Node | undefined = this.index.find('filename', filename);
    let emoji: string | undefined;
    if (!node) {
      console.warn('buildLabel(); no node found');
      return '';
    } else {
      if (this.types.hasKinds() && ((node.kind === NODE.KIND.ZOMBIE) || (node.kind === NODE.KIND.TEMPLATE))) {
        emoji = this.types.kindOpts[node.kind].emoji;
      } else if (this.types.hasTypes()) {
        // @ts-expect-error: verified in hasTypes()
        emoji = this.types.typeOpts[node.type].emoji;
      }
      if (emoji) {
        return title ? emoji + ' ' + title : emoji + ' ' + filename;
      } else {
        return title ? title : filename;
      }
    }
  }
}
