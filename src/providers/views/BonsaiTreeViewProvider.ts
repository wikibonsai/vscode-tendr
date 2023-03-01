import * as vscode from 'vscode';

import { Node, NODE } from 'caudex';

import { BaseTreeDataProvider } from './BaseTreeViewProvider';
import {
  DocTreeItem,
  NoDocTreeItem,
  BaseTreeItem,
} from '../../items/TreeItems';
import logger from '../../util/logger';


export class BonsaiTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    const treeItems: BaseTreeItem[] = [];
    let node: Node | undefined;
    // root
    if (!element) {
      node = this.index.root('node');
      if (!node) { return []; }
      const label: string = this.buildLabel(node.data.filename, node.data.title);
      return [
        new DocTreeItem(
          label,
          node.data.uri,
          this.isCollapsed(node),
          node.id,
        ),
      ];
    // children
    } else {
      node = this.index.get(element.nodeID);
      if (!node) { return []; }
      for (const childID of node.children) {
        const childNode: any | undefined = this.index.get(childID);
        // no node
        if (!childNode) {
          logger.error(`no child node found in index for ${element.uri} with 'id' ${childID}`);
          return treeItems;
        }
        // zombie node
        if (childNode.kind === NODE.KIND.ZOMBIE) {
          const label: string = this.buildLabel(childNode.data.filename);
          treeItems.push(
            new NoDocTreeItem(
              NODE.KIND.ZOMBIE,
              label,
              this.isCollapsed(childNode),
              childNode.id,
            ),
          );
        // existing node
        } else {
          const label: string = this.buildLabel(childNode.data.filename, childNode.data.title);
          treeItems.push(
            new DocTreeItem(
              label,
              childNode.data.uri,
              this.isCollapsed(childNode),
              childNode.id,
            ),
          );
        }
      }
      return treeItems;
    }
  }

  isCollapsed(node: Node): vscode.TreeItemCollapsibleState {
    if (node.children.length === 0) {
      return vscode.TreeItemCollapsibleState.None;
    } else {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
}
