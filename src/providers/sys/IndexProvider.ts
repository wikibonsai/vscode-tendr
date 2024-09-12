import * as vscode from 'vscode';

import { Node, QUERY_TYPE, Caudex, NODE } from 'caudex';

import { getConfigProperty } from '../../config';
import {
  getFilename,
  getMDUris,
  getMediaAbsPaths,
} from '../../util/wrapVSCode';
import { AttributesProvider } from './AttributesProvider';
import { TypeProvider } from './TypeProvider';
import logger from '../../util/logger';
import path from 'path';


interface InitNode {
  id: string | undefined;
  kind: string;
  type?: string;
}

interface FileData {
  filename: string;
  uri: string;
  title: string | undefined;
}

interface FileItem {
  data: FileData;
  init: InitNode;
}

// steps to initialize:
// 1. build data from files; creates file objects             : const fileData = IndexProvider.prepFileData();
// 2. create index instance                                   : const index = new IndexProvider();
// 3. initialize the index; builds relationships between files: index.init(fileData);

export class IndexProvider extends Caudex {
  // @ts-expect-error: typescript is not smart enough to detect the try block in the constructor
  public cacheMedia: Record<string, string>;
  // @ts-expect-error: typescript is not smart enough to detect the try block in the constructor
  public cacheContent: Record<string, string>; // (this cache operates by memoization)

  constructor(fileItems: FileItem[]) {
    logger.debug('creating IndexProvider...');
    const indexOpts = {
      nanoid: {
        alphabet: getConfigProperty('wikibonsai.attrs.id.alpha', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'),
        size: getConfigProperty('wikibonsai.attrs.id.size', 21),
      },
      uniqKeys: ['uri', 'filename'],
      zombieKey: 'filename',
    };
    try {
      super(fileItems, indexOpts);
      this.cacheMedia = {};
      this.cacheContent = {};
      logger.debug('...IndexProvider created');
    } catch (e: any) {
      vscode.window.showErrorMessage(e);
      logger.error(e);
    }
  }

  public static async prepFileData(attrs: AttributesProvider, types?: TypeProvider): Promise<FileItem> {
    logger.debug('IndexProvider.prepFileData() -- start...');
    const fileItem: FileItem[] = [] as FileItem[];
    const fileVscURIs: vscode.Uri[] = await getMDUris();
    for (const vscUri of fileVscURIs) {
      // prep attrs
      const textDoc = await vscode.workspace.openTextDocument(vscUri);
      const text = textDoc.getText();
      // build
      const fname: string = getFilename(vscUri);
      const init: InitNode = {} as InitNode;
      // todo: error-handling on duplicate filenames
      const data: FileData = {
        filename: fname,
        uri: vscUri.toString(),
        title: undefined,
      };
      const attrPayload: any = await attrs.load(text);
      const attrData: any = attrPayload.data;
      // todo: this may cause issues later as it's pretty much expected for there to be an id in a file's attributes;
      //       keep an eye out for files that have no id, but are being handled somehow anyway
      // only populate id if there is one -- if not, const the index generate one
      if (attrData.id) {
        init.id = attrData.id;
      }
      if (!attrData.title || (attrData.title === '')) {
        data.title = fname;
      } else {
        data.title = attrData.title;
      }
      if (types) {
        // dockind (template)
        const templateUris: string[] = (await types.tmplItems()).map(t => t.vscUri.toString());
        if (types && templateUris.includes(data.uri)) {
          init.kind = NODE.KIND.TEMPLATE;
        }
        // doctype
        if (types.useTypes()) {
          init.type = types.resolve(fname, vscUri.toString(), attrData);
        }
      }
      fileItem.push({
        init: init,
        data: data,
      });
    }
    logger.debug('IndexProvider.prepFileData() -- ...finished');
    // @ts-expect-error: see "const data: FileData" above...
    return fileItem;
  }

  public async init(): Promise<boolean> {
    logger.debug('IndexProvider.init()');
    try {
      const jobs: any[] = [];
      // loop through all nodes and call MarkdownEngine.render() in order to populate the index.
      const nodes = this.all(QUERY_TYPE.NODE);
      for (const node of nodes) {
        if (node.kind && node.kind !== NODE.KIND.ZOMBIE) {
          const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
          // note: ⚠️ do not nest 'await's: https://stackoverflow.com/a/44090244
          jobs.push(this.refreshRelRefs(vscUri));
        }
      }
      // media cache
      jobs.push(this.initCacheMedia());
      await Promise.all(jobs);
      // secondary markdown content cache
      // only cache if the node is embedded in another node
      for (const node of this.all(QUERY_TYPE.NODE)) {
        // if node is embedded in another document...
        const foreembedNodes: any = this.foreembeds(node.id, QUERY_TYPE.NODE);
        const isEmbedded: boolean = foreembedNodes ? (foreembedNodes.length > 0) : false;
        if ((isEmbedded !== undefined) && (isEmbedded)) {
          for (const embedNode of foreembedNodes) {
            // ...its hasn't been cached already...
            if (!Object.keys(this.cacheContent).includes(embedNode.data.filename)) {
              // ...cache its contents
              jobs.push(this.updateCacheContent(embedNode));
            }
          }
        }
      }
      return true;
    } catch (e) {
      logger.error(<string> e);
      return false;
    }
  }

  // local caching

  private async updateCacheContent(node: Node): Promise<void> {
    const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
    const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(vscUri);
    const docText: string = doc.getText();
    this.cacheContent[node.data.filename] = docText; // vscode.workspace.fs.readFile(vscode.Uri.parse(node.data.uri));
  }

  private async initCacheMedia(): Promise<void> {
    const mediaAbsPaths: string[] = await getMediaAbsPaths();
    for (const mediaVscUri of mediaAbsPaths) {
      const mediaUri: string = mediaVscUri.toString();
      const mediaFileName: string = path.basename(mediaUri);
      this.cacheMedia[mediaFileName] = mediaUri;
    }
  }

  // validation

  public isTemplate(vscUri: vscode.Uri): boolean {
    const node: Node | undefined = this.find('uri', vscUri.toString());
    if (!node) { return false; }
    return (node.kind === NODE.KIND.TEMPLATE);
  }

  // refresh

  public async refreshNodeTypes(attrs: AttributesProvider, types: TypeProvider): Promise<void> {
    // prefix > attr > path
    for (const node of this.all(QUERY_TYPE.NODE)) {
      if (types.useTypes()) {
        const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
        const textDoc: vscode.TextDocument = await vscode.workspace.openTextDocument(vscUri);
        const attrData: any = await attrs.load(textDoc.getText());
        const type: string = types.resolve(node.data.filename, node.data.uri, attrData);
        if (node.type !== type) { node.type = type; }
      }
    }
  }

  // this method exists to make it clear that the primary intent of
  // certain markdown render calls is to update the index
  // note: putting an await in here will break everything
  //       ⚠️ do not nest 'await's: https://stackoverflow.com/a/44090244
  public async refreshRelRefs(vscUri: vscode.Uri, node?: any): Promise<void> {
    logger.verbose('IndexProvider.refreshRelRefs() -- refreshing:\n' + vscUri, node);
    try {
      // todo:
      // - cache media urls and check for duplicates
      // - cache embedded content
      const document = await vscode.workspace.openTextDocument(vscUri);
      vscode.commands.executeCommand('markdown.api.render', document);
    } catch (e) {
      logger.error(e);
    }
  }

  // debug

  public printIndex(): void {
    const index: string = super.print();
    logger.debug('IndexProvider.print() -- index:\n\n' + index);
  }

  public printIndexTree(): void {
    const tree: string = super.printTree('filename');
    logger.debug('IndexProvider.printTree() -- tree:\n\n' + tree);
  }

  public async dump(): Promise<void> {
    const data: any = {
      index: JSON.stringify(this.index),
      media: JSON.stringify(this.cacheMedia),
      content: JSON.stringify(this.cacheContent),
    };
    const writeData = Buffer.from(JSON.stringify(data), 'utf8');
    const workspace = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined;
    if (workspace === undefined) {
      logger.error('unable to dump index data -- problem finding workspace uri / url');
      return;
    }
    const pageUri = vscode.Uri.joinPath(workspace.uri, 'index.json');
    return vscode.workspace.fs.writeFile(pageUri, writeData);
  }
}
