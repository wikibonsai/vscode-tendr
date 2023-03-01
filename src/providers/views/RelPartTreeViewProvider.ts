import * as vscode from 'vscode';

import { NODE, Node } from 'caudex';

import { ts, WEB, ZOMBIE } from '../../util/emoji';
import { ATTR_ID, ATTR_NODETYPE, ATTR_TITLE } from '../../util/const';
import { alphaSortLabels } from '../../util/util';
import {
  DocTreeItem,
  NoDocTreeItem,
  BaseTreeItem,
} from '../../items/TreeItems';
import { BaseTreeDataProvider } from './BaseTreeViewProvider';


interface Item {
  id: string;
  uri: string;
  title: string;
}

// documents without links
export class OrphanTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    const treeItems: BaseTreeItem[] = [];
    let items: Item[] = [];
    if (!element) {
      // build bonsai ids
      const indexIDs: string[] | undefined = this.index.filter(ATTR_NODETYPE, NODE.TYPE.INDEX)?.map((node: Node) => node.id);
      const entryIDs: string[] | undefined = this.index.filter(ATTR_NODETYPE, NODE.TYPE.ENTRY)?.map((node: Node) => node.id);
      let bonsaiIDs: string[] = [];
      if (indexIDs) {
        bonsaiIDs = bonsaiIDs.concat(indexIDs);
      }
      if (entryIDs) {
        bonsaiIDs = bonsaiIDs.concat(entryIDs);
      }
      // tree orphans
      const orphansQuery: any[] | undefined = this.index.orphans(bonsaiIDs, [ATTR_ID, 'uri', ATTR_TITLE]);
      if (orphansQuery) {
        for (const orphan of orphansQuery) {
          orphan.title = ts.emoji + ' ' + orphan.title;
        }
        items = items.concat(orphansQuery);
      }
      // web orphans
      const floatersQuery: any[] | undefined = this.index.floaters([ATTR_ID, 'uri', ATTR_TITLE]);
      if (floatersQuery) {
        for (const floater of floatersQuery) {
          const duplicateOrphan = items.find((item: any) => item.id === floater.id);
          if (duplicateOrphan) {
            duplicateOrphan.title = WEB + ' ' + duplicateOrphan.title;
          } else {
            floater.title = WEB + ' ' + floater.title;
            items.push(floater);
          }
        }
      }
    }
    for (const item of items) {
      treeItems.push(
        new DocTreeItem(
          item.title,
          item.uri,
          vscode.TreeItemCollapsibleState.None,
          item.id,
        )
      );
    }
    return treeItems.sort(alphaSortLabels);
  }
}

// links without documents
export class ZombieTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    const treeItems: BaseTreeItem[] = [];
    if (!element) {
      const zombieNodes: any[] = this.index.zombies('node');
      if (!zombieNodes) { return []; }
      for (const zombie of zombieNodes) {
        treeItems.push(
          new NoDocTreeItem(
            NODE.KIND.ZOMBIE,
            ZOMBIE + ' ' + zombie.data.filename,
            vscode.TreeItemCollapsibleState.Collapsed,
            zombie.id,
          ),
        );
      }
      return treeItems.sort(alphaSortLabels);
    } else {
      const zombieNode = this.index.find('filename', element.label.replace(ZOMBIE + ' ', ''));
      if (!zombieNode) { return []; }
      // todo: mentioned in bonsai file...?
      const parent: string | undefined = this.index.parent(zombieNode.id);
      const battrsPayload = this.index.backattrs(zombieNode.id);
      const battrs: string[] | undefined = battrsPayload ? Object.values(battrsPayload).flatMap((ids) => Array.from(ids)) : [];
      const blinks: string[] | undefined = this.index.backlinks(zombieNode.id)?.map((blink: any) => blink.id);
      const bembeds: string[] | undefined = this.index.backembeds(zombieNode.id)?.map((bembed: any) => bembed.id);
      // const ids: string[] = [].concat([parent], attrds, blinks);
      let ids: string[];
      ids = parent ? [parent] : [];
      ids = ids.concat(battrs);
      ids = blinks ? ids.concat(blinks) : ids;
      ids = bembeds ? ids.concat(bembeds) : ids;
      if (!ids) { return []; }
      const payloads = ids.map((id: string) => this.index.get(id, [ATTR_ID, 'uri', ATTR_TITLE]));
      for (const payload of payloads) {
        treeItems.push(
          new DocTreeItem(
            payload.title,
            payload.uri,
            vscode.TreeItemCollapsibleState.None,
            payload.id,
          ),
        );
      }
      return treeItems.sort(alphaSortLabels);
    }
  }
}
