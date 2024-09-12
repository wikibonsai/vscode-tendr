import * as vscode from 'vscode';

import path from 'path';

import { NODE, Node, QUERY_TYPE, REL } from 'caudex';

import { colDescrToNum } from '../../util/wrapVSCode';
import { getConfigProperty } from '../../config';
import {
  ATTR_ID,
  MSG_CREATE_NODE,
  MSG_DRAW_TREE,
  MSG_DRAW_WEB,
  MSG_OPEN_NODE,
  MSG_SAVE_COORDS,
  MSG_SYNC_TREE,
  MSG_SYNC_WEB,
  MSG_UPDATE_DATA,
  MSG_UPDATE_DIM,
  MSG_UPDATE_FIX,
  MSG_UPDATE_FOCUS_NODE,
  MSG_UPDATE_FOLLOW,
  MSG_UPDATE_SYNC,
} from '../../util/const';
import logger from '../../util/logger';
import { ts, WEB } from '../../util/emoji';

import { IndexProvider } from './IndexProvider';
import { TypeProvider } from './TypeProvider';


export abstract class GraphProvider {
  protected wsDir: vscode.Uri | undefined;
  protected types: TypeProvider;
  protected index: IndexProvider;
  protected panel: vscode.WebviewPanel | undefined = undefined;
  protected disposables: vscode.Disposable[] = [];
  public dimensions: string = '2d';

  constructor(wsDir: vscode.Uri, types: TypeProvider, index: IndexProvider) {
    logger.debug('creating GraphProvider...');
    // cache workspce directory so 'save' message can be handled synchronously
    this.wsDir = wsDir;
    this.types = types;
    this.index = index;
    logger.debug('...GraphProvider created');
  }

  public ctrlConfigs() {
    return {
      // properties
      filter: {
        nodes: {
          doc: true,
          template: true,
          zombie: true,
        },
        links: {
          fam: true,
          attr: true,
          link: true,
          embed: true,
        },
      },
      dim: getConfigProperty('tendr.graph.ctrls.dim', '2d'),
      autosync: getConfigProperty('tendr.graph.ctrls.autosync.enabled', false),
      // actions
      fix: getConfigProperty('tendr.graph.ctrls.fix.enabled', false),
      follow: getConfigProperty('tendr.graph.ctrls.follow.enabled', true),
    };
  }

  public async draw(context: vscode.ExtensionContext, panelTitle: string): Promise<void> {
    // build webview
    const configCol: string = getConfigProperty('tendr.graph.open-loc', 'beside');
    const column: number = colDescrToNum[configCol] || vscode.ViewColumn.Beside;
    // if panel exists, don't create a new one
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      panelTitle,
      panelTitle,
      column,
      {
        enableScripts: true,           // enable javascript in the webview
        retainContextWhenHidden: true, // don't destroy the webview when hidden
      },
    );
    if (!this.panel) { return; }
    /* eslint-disable indent */
    // set webview components
    this.panel.webview.html = await this.getHTML(
                                      context.extensionPath,
                                      this.panel.webview,
                                    );
    /* eslint-enable indent */
    this.panel.webview.onDidReceiveMessage((message) =>
      this.handle(message), null, this.disposables
    );
    this.panel.onDidDispose(() =>
      this.dispose(), null, this.disposables
    );
    // subclass should trigger final draw...
  }

  // message handling

  // receive

  public handle(message: any) {
    switch (message.type) {
    case MSG_OPEN_NODE: {
      // chaining commands so that we can
      // convert the string uri to a vscode uri
      const vscUri: vscode.Uri = vscode.Uri.parse(message.payload);
      vscode.commands.executeCommand('tendr.open.file', vscUri);
      return;
    }
    case MSG_CREATE_NODE: {
      const filename: string = message.payload;
      const node = this.index.find('filename', filename);
      let payload: any;
      // zombie node
      if (node) {
        payload = {
          id: node.id,
          filename: filename,
        };
      // error...?
      } else {
        logger.error('GraphProvider.handle() -- no node found for graph click-to-create');
        payload = {
          filename: filename,
        };
      }
      vscode.commands.executeCommand('tendr.create.file', payload);
      return;
    }
    case MSG_SAVE_COORDS: {
      this.updateCoordDoc(message.payload.filename, message.payload.data);
      return;
    }
    case MSG_SYNC_TREE: {
      vscode.commands.executeCommand('tendr.graph.show.tree');
      return;
    }
    case MSG_SYNC_WEB: {
      vscode.commands.executeCommand('tendr.graph.show.web');
      return;
    }
    case MSG_UPDATE_DIM: {
      vscode.commands.executeCommand('tendr.toggle.graph.ctrls.dim', message.payload);
      return;
    }
    case MSG_UPDATE_FIX: {
      vscode.commands.executeCommand('tendr.toggle.graph.ctrls.fix', message.payload);
      return;
    }
    case MSG_UPDATE_FOLLOW: {
      vscode.commands.executeCommand('tendr.toggle.graph.ctrls.follow', message.payload);
      return;
    }
    case MSG_UPDATE_SYNC: {
      vscode.commands.executeCommand('tendr.toggle.graph.ctrls.sync', message.payload);
      return;
    }
    default: {
      logger.error(`GraphProvider.handle() -- graph received unknown command: ${message.command}`);
      return;
    }
    }
  }

  // post

  public post(type: string, payload: any) {
    if (this.panel && this.panel.webview) {
      this.panel.webview.postMessage({
        type: type,
        payload: payload,
      });
    }
  }

  public postFocusNode(uri: string) {
    this.post(MSG_UPDATE_FOCUS_NODE, uri);
  }

  // public postToggleAutoSync(value: boolean) {
  //   this.post(MSG_UPDATE_SYNC, value);
  // }

  // public postToggleFix(value: boolean) {
  //   this.post(MSG_TOGGLE_FIX, value);
  // }

  // public postToggleFollow(value: boolean) {
  //   this.post(MSG_TOGGLE_FOLLOW, value);
  // }

  // static assets

  private async getHTML(extensionPath: string, webview: vscode.Webview) {
    // vscode.extensionPath -> extensionPath 
    const indexDocPath = path.join(extensionPath, 'static', 'index.html');
    const indexViewDoc = await vscode.workspace.openTextDocument(indexDocPath);
    const text = indexViewDoc.getText();
    // from: https://github.com/microsoft/vscode-extension-samples/blob/92b34c5733e2d1640ad877e9ed4605da04709124/webview-sample/src/extension.ts#L194
    const nonce = this.getNonce();
    /* eslint-disable indent */
    return text.replace(/\{\{nonce\}\}/g, nonce)
              .replace(/\{\{.*\}\}/g, (match) => {
                const filename = match.slice(2, -2).trim();
                const staticRsrcPath = path.join(extensionPath, 'static', filename);
                const staticRsrcUri = vscode.Uri.file(staticRsrcPath);
                const staticRsrcStr = webview.asWebviewUri(staticRsrcUri).toString();
                return staticRsrcStr;
              });
    /* eslint-enable indent */
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // coordinate docs

  public async getCoordDoc(filename: string): Promise<JSON | void> {
    if (!this.wsDir) { logger.error('no workspace directory found'); return; }
    try {
      const vscUri: vscode.Uri = vscode.Uri.joinPath(this.wsDir, filename);
      const docToSave = await vscode.workspace.openTextDocument(vscUri);
      const docText: string = docToSave.getText();
      return JSON.parse(docText);
    } catch(e) {
      return;
    }
  }

  public async updateCoordDoc(filename: string, coords: JSON): Promise<void> {
    if (!this.wsDir) { logger.error('no workspace directory found'); return; }
    const vscUri: vscode.Uri = vscode.Uri.joinPath(this.wsDir, filename);
    const wseditCreate = new vscode.WorkspaceEdit();
    wseditCreate.createFile(vscUri, { overwrite: true });
    await vscode.workspace.applyEdit(wseditCreate);
    const wseditInsert = new vscode.WorkspaceEdit();
    wseditInsert.insert(vscUri, new vscode.Position(0, 0), JSON.stringify(coords));
    vscode.workspace.applyEdit(wseditInsert);
  }

  // webview methods

  public dispose() {
    if (this.panel) {
      this.panel.dispose();
      while (this.disposables.length) {
        const x = this.disposables.pop();
        if (x) {
          x.dispose();
        }
      }
    }
    this.panel = undefined;
  }
}

export class GraphTreeProvider extends GraphProvider {
  public panelTitle: string = ts.emoji + ' Tree';

  public async draw(context: vscode.ExtensionContext): Promise<void> {
    if (!getConfigProperty('tendr.graph.tree.enabled', true)) { return; }
    await super.draw(context, this.panelTitle);
    if (!this.panel) { return; }
    const coordFileName: string = getConfigProperty('tendr.graph.coords.tree', 'coords-tree.json');
    const ctrlOpts: any = this.ctrlConfigs();
    // todo: removed 'Function' return type -- keep an eye on this
    const kindOpts: Record<string, (string)> = {};
    if (this.types.hasKinds()) {
      Object.entries(this.types.kindOpts).forEach(([kind, opts]) => {
        if (opts.color) {
          kindOpts[kind] = opts.color;
        }
      });
    }
    // todo: removed 'Function' return type -- keep an eye on this
    const typeOpts: Record<string, (string)> = {};
    if (this.types.hasTypes()) {
      // @ts-expect-error: hasTypes()
      Object.entries(this.types.typeOpts).forEach(([type, opts]) => {
        if (opts.color) {
          typeOpts[type] = opts.color;
        }
      });
    }
    const opts: any = {
      ctrls: ctrlOpts,
      nodekinds: kindOpts,
      nodetypes: typeOpts,
    };
    const treeData: any = await this.genTreeData(coordFileName);
    this.post(MSG_DRAW_TREE, {
      coordFileName: coordFileName,
      opts: opts,
      data: treeData,
      dim: this.dimensions,
    });
  }

  // message handling

  public async postUpdateData() {
    const coordFileName: string = getConfigProperty('tendr.graph.coords.tree', 'coords-tree.json');
    const data = await this.genTreeData(coordFileName);
    this.post(MSG_UPDATE_DATA, data);
  }

  // data

  public async genTreeData(coordFileName: string) {
    const data: any = {};
    data['nodes'] = [];
    data['links'] = [];
    const root: Node = this.index.root('node');
    let bonsaiNodes: any[] | undefined = this.index.lineage(root.id, 'node');
    if (!bonsaiNodes) { return data; }
    bonsaiNodes = bonsaiNodes.concat([root]);
    const coords: any /* JSON | void */ = await this.getCoordDoc(coordFileName);
    for (const node of bonsaiNodes) {
      // add node
      const newNode: any = {
        id: node.id,
        kind: node.kind,
        type: node.type,
        lineage: {
          nodes: this.index.lineage(node.id, ATTR_ID),
          links: this.getLineageLinks(node.id).map((link: any) => Object.assign({}, link)),
        },
      };
      // existing node
      if (node.kind !== NODE.KIND.ZOMBIE) {
        newNode.uri = node.data.uri;
        newNode.filename = node.data.filename;
        newNode.label = node.data.title;
      // zombie node
      } else {
        newNode.uri = '';
        newNode.filename = node.data.filename;
        newNode.label = node.data.filename;
      }
      if (coords && Object.keys(coords).includes(node.id)) {
        newNode.coord = coords[node.id];
      }
      data['nodes'].push(newNode);
    }
    data['links'] = this.getLineageLinks(root.id).map((link: any) => Object.assign({}, link));
    return data;
  }

  private getLineageLinks(id: string) {
    const linLinks: any = [];
    // add children first, since the root itself isn't included in 'lineage ids'
    const chilIDs = this.index.children(id);
    if (!chilIDs) { return; }
    for (const chilID of chilIDs) {
      linLinks.push({
        kind: REL.FAM.FAM,
        source: id,
        target: chilID,
      });
    }
    // add rest of lineage
    const linIDs = this.index.lineage(id);
    if (!linIDs) { return; }
    for (const linID of linIDs) {
      const childIDs = this.index.children(linID);
      if (!childIDs) { return; }
      for (const childID of childIDs) {
        if ((linIDs.includes(linID) && linIDs.includes(childID)) || childID === id) {
          linLinks.push({
            kind: REL.FAM.FAM,
            source: linID,
            target: childID,
          });
        }
      }
    }
    return linLinks;
  }
}

export class GraphWebProvider extends GraphProvider {
  public panelTitle: string = WEB + ' Web';

  public async draw(context: vscode.ExtensionContext): Promise<void> {
    if (!getConfigProperty('tendr.graph.web.enabled', true)) { return; }
    await super.draw(context, this.panelTitle);
    if (!this.panel) { return; }
    // todo: is there a race condition here? do we need to wait for the panel somehow? (i thought the prior line did that...)
    const coordFileName: string = getConfigProperty('tendr.graph.coords.web', 'coords-web.json');
    const ctrlOpts: any = this.ctrlConfigs();
    // todo: removed 'Function' return type -- keep an eye on this
    const kindOpts: Record<string, (string)> = {};
    if (this.types.hasKinds()) {
      Object.entries(this.types.kindOpts).forEach(([kind, opts]) => {
        if (opts.color) {
          kindOpts[kind] = opts.color;
        }
      });
    }
    // todo: removed 'Function' return type -- keep an eye on this
    const typeOpts: Record<string, (string)> = {};
    if (this.types.hasTypes()) {
      // @ts-expect-error: hasTypes()
      Object.entries(this.types.typeOpts).forEach(([type, opts]) => {
        if (opts.color) {
          typeOpts[type] = opts.color;
        }
      });
    }
    const opts: any = {
      ctrls: ctrlOpts,
      nodekinds: kindOpts,
      nodetypes: typeOpts,
    };
    const webData: any = await this.genWebData(coordFileName);
    this.post(MSG_DRAW_WEB, {
      coordFileName: coordFileName,
      opts: opts,
      data: webData,
      dim: this.dimensions,
    });
  }

  // message handling

  public async postUpdateData() {
    const coordFileName: string = getConfigProperty('tendr.graph.coords.web', 'coords-web.json');
    const data = await this.genWebData(coordFileName);
    this.post(MSG_UPDATE_DATA, data);
  }

  // data

  public async genWebData(coordFileName: string) {
    const data: any = {};
    data['nodes'] = [];
    data['links'] = [];
    const coords: any /* JSON | void */ = await this.getCoordDoc(coordFileName);
    for (const node of this.index.all(QUERY_TYPE.NODE)) {
      let curLinks: any = [];
      curLinks = curLinks.concat(this.getSourceLinks(node.id));
      data['links'] = data['links'].concat(curLinks.map((link: any) => Object.assign({}, link)));
      curLinks = curLinks.concat(this.getTargetLinks(node.id));
      // add node
      const newNode: any = {
        id: node.id,
        kind: node.kind,
        type: node.type,
        neighbors: {
          nodes: this.index.neighbors(node.id),
          links: curLinks.map((link: any) => Object.assign({}, link)),
        },
      };
      // existing node
      if (node.kind !== NODE.KIND.ZOMBIE) {
        newNode.uri = node.data.uri;
        newNode.filename = node.data.filename;
        newNode.label = node.data.title;
      // zombie node
      } else {
        newNode.uri = '';
        newNode.filename = node.data.filename;
        newNode.label = node.data.filename;
      }
      if (coords && Object.keys(coords).includes(node.id)) {
        newNode.coord = coords[node.id];
      }
      data['nodes'].push(newNode);
    }
    return data;
  }

  private getSourceLinks(id: string) {
    const graphLinks: any = [];
    const attrs: any = this.index.foreattrs(id);
    // @ts-expect-error: to fix this, import 'Attr' type from 'wikirefs'
    const attrIDs: any[] = Object.values(attrs).flatMap((ids) => Array.from(ids));
    for (const attrID of attrIDs) {
      graphLinks.push({
        kind: REL.REF.ATTR,
        source: id,
        target: attrID,
      });
    }
    const links: any = this.index.forelinks(id);
    const linkIDs: string[] = links.map((link: any) => { return link.id; });
    // todo: don't add index doc forelinks since that is meant to build the tree?
    for (const linkID of linkIDs) {
      graphLinks.push({
        kind: REL.REF.LINK,
        source: id,
        target: linkID,
      });
    }
    const embeds: any = this.index.foreembeds(id);
    const embedIDs: string[] = embeds.map((embed: any) => { return embed.id; });
    for (const embedID of embedIDs) {
      graphLinks.push({
        kind: REL.REF.EMBED,
        source: id,
        target: embedID,
      });
    }
    return graphLinks;
  }

  private getTargetLinks(id: string) {
    const graphLinks: any = [];
    const attrd: any = this.index.backattrs(id);
    // @ts-expect-error: to fix this, import 'Attr' type from 'wikirefs'
    const attrIDs: any[] = Object.values(attrd).flatMap((ids) => Array.from(ids));
    for (const attrID of attrIDs) {
      graphLinks.push({
        kind: REL.REF.ATTR,
        source: attrID,
        target: id,
      });
    }
    const links: any = this.index.backlinks(id);
    const linkIDs: string[] = links.map((link: any) => { return link.id; });
    for (const linkID of linkIDs) {
      graphLinks.push({
        kind: REL.REF.LINK,
        source: linkID,
        target: id,
      });
    }
    const embeds: any = this.index.backembeds(id);
    const embedIDs: string[] = embeds.map((embed: any) => { return embed.id; });
    for (const embedID of embedIDs) {
      graphLinks.push({
        kind: REL.REF.EMBED,
        source: embedID,
        target: id,
      });
    }
    return graphLinks;
  }
}