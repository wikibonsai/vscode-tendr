import * as vscode from 'vscode';

import { NODE } from 'caudex';

import { BaseTreeDataProvider } from './BaseTreeViewProvider';
import {
  DocTreeItem,
  NoDocTreeItem,
  BaseTreeItem,
} from '../../items/TreeItems';
import { ATTR_ID, ATTR_TITLE } from '../../util/const';


export class AncestorsTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    const treeItems: BaseTreeItem[] = [];
    if (!element) {
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const ancestorsQuery: any[] | undefined = this.index.ancestors(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!ancestorsQuery) { return []; }
      for (const ancestor of ancestorsQuery) {
        if (ancestor && ancestor.title && ancestor.uri) {
          const label: string = this.buildLabel(ancestor.filename, ancestor.title);
          treeItems.push(
            new DocTreeItem(
              label,
              ancestor.uri,
              vscode.TreeItemCollapsibleState.None,
              ancestor.id,
            ),
          );
        } else {
          const label: string = this.buildLabel(ancestor.zombie);
          treeItems.push(
            new NoDocTreeItem(
              NODE.KIND.ZOMBIE,
              label,
              vscode.TreeItemCollapsibleState.None,
              ancestor.id,
            ),
          );
        }
      }
      // if (node === this.index.root('node')) {
      //   treeItems.push(
      //     new DocTreeItem(
      //       TRUNK + ' ' +  node.data.title,
      //       node.data.uri,
      //       vscode.TreeItemCollapsibleState.None,
      //       node.id,
      //     ),
      //   );
      // }
    }
    return treeItems;
  }
}

export class ChildrenTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    const treeItems: BaseTreeItem[] = [];
    if (!element) {
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const childrenQuery: any[] | undefined = this.index.children(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!childrenQuery) { return []; }
      for (const child of childrenQuery) {
        if (child && child.title && child.uri) {
          const label: string = this.buildLabel(child.filename, child.title);
          treeItems.push(
            new DocTreeItem(
              label,
              child.uri,
              vscode.TreeItemCollapsibleState.None,
              child.id,
            ),
          );
        } else {
          const label: string = this.buildLabel(child.zombie);
          treeItems.push(
            new NoDocTreeItem(
              NODE.KIND.ZOMBIE,
              label,
              vscode.TreeItemCollapsibleState.None,
              child.id,
            ),
          );
        }
      }
    }
    return treeItems;
  }
}
