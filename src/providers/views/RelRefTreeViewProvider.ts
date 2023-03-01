/*
 * while forerefs and backrefs are for the most part completely identical,
 * they remain separate since vscode requires certain functionality to be
 * defined in package.json.
 * 
 * see 'forerefs' and 'backrefs' in package.json for details.
 */

import * as vscode from 'vscode';

import { NODE } from 'caudex';
import { BaseTreeDataProvider } from './BaseTreeViewProvider';
import {
  DisplayTreeItem,
  DocTreeItem,
  NoDocTreeItem,
  BaseTreeItem,
} from '../../items/TreeItems';
import { ATTR_ID, ATTR_NODETYPE, ATTR_TITLE } from '../../util/const';
import { alphaSortLabels } from '../../util/util';


export class BackRefsTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    if (!element) {
      return [
        new DisplayTreeItem('top', 'attrs', vscode.TreeItemCollapsibleState.Expanded, 'back'),
        new DisplayTreeItem('top', 'links', vscode.TreeItemCollapsibleState.Expanded, 'back'),
        new DisplayTreeItem('top', 'embeds', vscode.TreeItemCollapsibleState.Expanded, 'back'),
      ];
    // attribute -- type
    } else if ((element.type === 'top') && (element.label === 'attrs')) {
      const typeNodes: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const attrds: Record<string, any> | undefined = this.index.backattrs(node.id, ['uri', ATTR_TITLE]);
      if (!attrds) { return []; }
      for (const type of Object.keys(attrds)) {
        typeNodes.push(
          new DisplayTreeItem(
            ATTR_NODETYPE,
            type,
            vscode.TreeItemCollapsibleState.Collapsed,
          )
        );
      }
      return typeNodes;
    } else if (element.type === ATTR_NODETYPE) {
      const treeItems: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const attrds: Record<string, any> | undefined = this.index.backattrs(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!attrds) { return []; }
      for (const [type, items] of Object.entries(attrds)) {
        if (type === element.label) {
          for (const item of items) {
            if (item.title && item.uri) {
              const label: string = this.buildLabel(item.filename, item.title);
              treeItems.push(
                new DocTreeItem(
                  label,
                  item.uri,
                  vscode.TreeItemCollapsibleState.None,
                  item.id,
                )
              );
            } else {
              const label: string = this.buildLabel(item.zombie);
              const typedLabel: string = type ? label + ' ( ' + type + ' ) ' : label;
              treeItems.push(
                new NoDocTreeItem(
                  NODE.KIND.ZOMBIE,
                  typedLabel,
                  vscode.TreeItemCollapsibleState.Collapsed,
                  item.id,
                ),
              );
            }
          }
        }
      }
      return treeItems.sort(alphaSortLabels);
    } else if ((element.type === 'top') && (element.label === 'links')) {
      const treeItems: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const blinks = this.index.backlinks(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!blinks) { return []; }
      for (const blink of blinks) {
        const type: string = blink[0];
        const payload: any = blink[1];
        const label: string = this.buildLabel(payload.filename, payload.title);
        const typedLabel: string = type ? label + ' ( ' + type + ' ) ' : label;
        if (payload) {
          treeItems.push(
            new DocTreeItem(
              typedLabel,
              payload.uri,
              vscode.TreeItemCollapsibleState.None,
              payload.id,
            )
          );
        } else {
          const label: string = this.buildLabel(payload.zombie);
          const typedLabel: string = type ? label + ' ( ' + type + ' ) ' : label;
          treeItems.push(
            new NoDocTreeItem(
              NODE.KIND.ZOMBIE,
              typedLabel,
              vscode.TreeItemCollapsibleState.Collapsed,
              payload.id,
            ),
          );
        }
      }
      return treeItems.sort(alphaSortLabels);
    } else {
      return [];
    }
  }
}

export class ForeRefsTreeDataProvider extends BaseTreeDataProvider {

  public async getChildren(element?: any): Promise<BaseTreeItem[]> {
    if (!element) {
      return [
        new DisplayTreeItem('top', 'attrs', vscode.TreeItemCollapsibleState.Expanded, 'fore'),
        new DisplayTreeItem('top', 'links', vscode.TreeItemCollapsibleState.Expanded, 'fore'),
        new DisplayTreeItem('top', 'embeds', vscode.TreeItemCollapsibleState.Expanded, 'fore'),
      ];
    // attribute -- type
    } else if ((element.type === 'top') && (element.label === 'attrs')) {
      const typeNodes: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const attrs: Record<string, any> | undefined = this.index.foreattrs(node.id, ['uri', ATTR_TITLE]);
      if (!attrs) { return []; }
      for (const type of Object.keys(attrs)) {
        typeNodes.push(
          new DisplayTreeItem(
            ATTR_NODETYPE,
            type,
            vscode.TreeItemCollapsibleState.Collapsed,
          )
        );
      }
      return typeNodes;
    } else if (element.type === ATTR_NODETYPE) {
      const treeItems: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const attrs: Record<string, any> | undefined = this.index.foreattrs(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!attrs) { return []; }
      for (const [type, items] of Object.entries(attrs)) {
        if (type === element.label) {
          for (const item of items) {
            if (item.title && item.uri) {
              const label: string = this.buildLabel(item.filename, item.title);
              treeItems.push(
                new DocTreeItem(
                  label,
                  item.uri,
                  vscode.TreeItemCollapsibleState.None,
                  item.id,
                )
              );
            } else {
              const label: string = this.buildLabel(item.zombie);
              const typedLabel: string = type ? label + ' ( ' + type + ' ) ' : label;
              treeItems.push(
                new NoDocTreeItem(
                  NODE.KIND.ZOMBIE,
                  typedLabel,
                  vscode.TreeItemCollapsibleState.None,
                  item.id,
                )
              );
            }
          }
        }
      }
      return treeItems.sort(alphaSortLabels);
    } else if ((element.type === 'top') && (element.label === 'links')) {
      const treeItems: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const flinks = this.index.forelinks(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!flinks) { return []; }
      for (const flink of flinks) {
        const type: string = flink[0];
        const payload: any = flink[1];
        if (payload.title && payload.uri) {
          const label: string = this.buildLabel(payload.filename, payload.title);
          const typedLabel: string = type ? label + ' ( ' + type + ' ) ' : label;
          treeItems.push(
            new DocTreeItem(
              typedLabel,
              payload.uri,
              vscode.TreeItemCollapsibleState.None,
              payload.id,
            )
          );
        } else {
          const label: string = this.buildLabel(payload.zombie);
          const typedLabel: string = type ? label + ' ( ' + type + ' ) ' : label;
          treeItems.push(
            new NoDocTreeItem(
              NODE.KIND.ZOMBIE,
              typedLabel,
              vscode.TreeItemCollapsibleState.None,
              payload.id,
            )
          );
        }
      }
      return treeItems.sort(alphaSortLabels);
    } else if ((element.type === 'top') && (element.label === 'embeds')) {
      const treeItems: BaseTreeItem[] = [];
      const uri = this.getActiveUri();
      if (!uri) { return []; }
      const node = this.index.find('uri', uri.toString());
      if (!node) { return []; }
      const fembeds = this.index.foreembeds(node.id, [ATTR_ID, 'uri', 'filename', ATTR_TITLE, NODE.KIND.ZOMBIE]);
      if (!fembeds) { return []; }
      for (const fembed of fembeds) {
        const payload: any = fembed;
        if (payload.title && payload.uri) {
          const label: string = this.buildLabel(payload.filename, payload.title);
          treeItems.push(
            new DocTreeItem(
              label,
              payload.uri,
              vscode.TreeItemCollapsibleState.None,
              payload.id,
            )
          );
        } else {
          const label: string = this.buildLabel(payload.zombie);
          treeItems.push(
            new NoDocTreeItem(
              NODE.KIND.ZOMBIE,
              label,
              vscode.TreeItemCollapsibleState.None,
              payload.id,
            )
          );
        }
      }
      return treeItems.sort(alphaSortLabels);
    } else {
      return [];
    }
  }
}

