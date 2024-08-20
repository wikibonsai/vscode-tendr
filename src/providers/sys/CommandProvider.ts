import * as vscode from 'vscode';

import { NODE, Node } from 'caudex';
import * as wikirefs from 'wikirefs';

import {
  colDescrToNum,
  getMDUris,
  getWorkspaceDir,
} from '../../util/wrapVSCode';
import { getConfigProperty } from '../../config';
import logger from '../../util/logger';
import {
  ATTR_NODETYPE,
  INVALID_FNAME_CHARS,
  EXT_MD,
} from '../../util/const';

import { SEED, ts } from '../../util/emoji';
import { TypeProvider } from '../sys/TypeProvider';
import { AttributesProvider } from './AttributesProvider';
import { IndexProvider } from './IndexProvider';
import { CamlDecorationProvider } from '../doc/CamlDecorationProvider';
import { WikiRefDecorationProvider } from '../doc/WikiRefDecorationProvider';
import { SemTreeProvider } from './SemTreeProvider';
import { TagDecorationProvider } from '../doc/TagDecorationProvider';


interface Payload {
  filename: string;
  // ...created from a zombie node
  id?: string;
  filenameFromZombie?: string;
  // ...created from a template (mandatory: 'tmplVscUri' and 'type')
  tmplVscUri?: vscode.Uri;
  path?: string;
  type?: string;
  unfixedFilename?: string;
}

export class CommandProvider {
  private attrs: AttributesProvider;
  private bonsai: SemTreeProvider;
  private index: IndexProvider;
  private types: TypeProvider;
  // 
  private camlTextDecorationProvider: CamlDecorationProvider;
  private wikiRefDecorationProvider: WikiRefDecorationProvider;
  private tagDecorationProvider: TagDecorationProvider;

  constructor(
    attrs: AttributesProvider,
    types: TypeProvider,
    index: IndexProvider,
    bonsai: SemTreeProvider,
    camlTextDecorationProvider: CamlDecorationProvider,
    textDecorationProvider: WikiRefDecorationProvider,
    tagDecorationProvider: TagDecorationProvider,
  ) {
    logger.debug('creating CommandProvider...');
    this.attrs = attrs;
    this.types = types;
    this.index = index;
    this.bonsai = bonsai;
    // 
    this.camlTextDecorationProvider = camlTextDecorationProvider;
    this.wikiRefDecorationProvider = textDecorationProvider;
    this.tagDecorationProvider = tagDecorationProvider;
    logger.debug('...CommandProvider created');
  }

  public async openDoc(vscUri: vscode.Uri): Promise<void> {
    const configCol: string = getConfigProperty('wikibonsai.file.open.loc', 'one');
    const column: number = colDescrToNum[configCol] || vscode.ViewColumn.One;
    vscode.window.showTextDocument(vscUri, {
      // preserveFocus: false,
      // preview: false,
      // selection: new vscode.Range(),
      viewColumn: column,
    });
  }

  // todo: keep an eye on whether 'encodeURIComponent' will be needed...docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
  public async createDoc(payload: Payload): Promise<vscode.Uri | undefined> {
    logger.debug('CommandProvider.createDoc()');
    let affixedFilename: string | undefined;
    let unfixedFilename: string | undefined;
    let thisTypeOpts: any;
    // create from template (that may or may not be a zombie)
    // if not creating from a template, 'AttributesProvider' should populate init attrs from the 'default' doctype
    if (this.types && this.types.typeOpts) {
      //  explicitly given in the payload
      if (payload.type) {
        // apply filename affixes
        thisTypeOpts = this.types.typeOpts[payload.type];
        affixedFilename = await this.types.addAffixes(payload.filename, thisTypeOpts.prefix, thisTypeOpts.suffix);
        unfixedFilename = payload.filename;
        if (!payload.tmplVscUri) { payload.tmplVscUri = thisTypeOpts.vscUri; }
        payload.unfixedFilename = this.types.stripAffixes(payload.filename, thisTypeOpts.prefix, thisTypeOpts.suffix);
        payload.filename = affixedFilename;
      //  implicitly given in the filename
      } else {
        [unfixedFilename, affixedFilename] = this.types.hasAffix(payload.filename);
        if (unfixedFilename !== affixedFilename) {
          payload.type = this.types.resolve(affixedFilename);
          thisTypeOpts = this.types.typeOpts[payload.type];
          payload.tmplVscUri = thisTypeOpts.vscUri;
          payload.unfixedFilename = unfixedFilename;
        }
      }
    }
    // if type hasn't been successfully initialized,
    // auto-init from 'default' doctype
    // (if no 'default' doctype is found,
    //  'AttributesProvider' should automatically init
    //  from wikibonsai attr default)
    if (!payload.type) {
      payload.type = NODE.TYPE.DEFAULT;
      if (this.types.typeOpts) {
        thisTypeOpts = this.types.typeOpts[NODE.TYPE.DEFAULT];
        payload.tmplVscUri = thisTypeOpts.vscUri;
      }
    }
    // todo:
    //  - from docwikiref in particular: check for prefix and ensure typing from that
    // push zombie/template data to attrs-provider
    if (payload.id || payload.tmplVscUri || payload.type || payload.path) {
      this.attrs.payload = payload;
    }
    // create doc
    //
    // prep
    const workspaceDir: vscode.Uri | undefined = await getWorkspaceDir();
    if (!workspaceDir) { return; }
    const relativePath: string = (thisTypeOpts && thisTypeOpts.path) ? thisTypeOpts.path : '';
    const newVscUri: vscode.Uri = vscode.Uri.joinPath(workspaceDir, relativePath, payload.filename + EXT_MD);
    // create
    const wsedit = new vscode.WorkspaceEdit();
    wsedit.createFile(newVscUri, { ignoreIfExists: true, overwrite: false });
    await vscode.workspace.applyEdit(wsedit);
    // open
    vscode.commands.executeCommand('wikibonsai.open.file', newVscUri);
    // wikiref symbol rename: update other zombie wikirefs that match the given 'filename'
    // get nodes that need updating
    let node: Node | undefined;
    if (payload.id) {
      node = this.index.get(payload.id);
    }
    if (!node) {
      // if user changed filename midway through operation
      // in 'wikibonsai.name.file', check for prior filename
      if (payload.filenameFromZombie) {
        node = this.index.find('filename', payload.filenameFromZombie);
      } else {
        node = this.index.find('filename', affixedFilename);
      }
      if (!node) {
        node = this.index.find('filename', unfixedFilename);
        if (!node) {
          console.warn('node not found');
          return;
        }
      }
    }
    // todo: only perform if affix includes a ':const'...
    if (getConfigProperty('wikibonsai.wikiref.affix-rename.enabled', false)) {
      if (affixedFilename && unfixedFilename && (affixedFilename !== unfixedFilename)) {
        const battrsUris = this.index.backattrs(node.id, 'uri');
        const blinksUris = this.index.backlinks(node.id, 'uri');
        let backrefUris: string[] = [];
        if (battrsUris) {
          backrefUris = backrefUris.concat(Object.values(battrsUris).flatMap((ids) => ids));
        }
        if (blinksUris) {
          backrefUris = backrefUris.concat(blinksUris.map((link: any) => link[1]));
        }
        // update file text
        const mdVscUris: vscode.Uri[] = await getMDUris();
        const mdUris: string[] = mdVscUris.map(vscUri => vscUri.toString());
        const urisToUpdate: string[] = mdUris.filter((uri: string) => backrefUris.includes(uri));
        for (const uri of urisToUpdate) {
          // prep edit
          const document: vscode.TextDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
          const docText: string = document.getText();
          const updatedDocText: string = docText.replace(
            new RegExp('\\[\\[' + unfixedFilename, 'g'),
            '[[' + affixedFilename,
          );
          // workspace edit
          const edit = new vscode.WorkspaceEdit();
          const start = new vscode.Position(0, 0);
          const end = document.positionAt(docText.length);
          edit.replace(document.uri, new vscode.Range(start, end), updatedDocText);
          await vscode.workspace.applyEdit(edit);
          await document.save();
        }
      }
    }
    return newVscUri;
  }

  public async createDocBulk(): Promise<void> {
    logger.debug('CommandProvider.createDocBulk()');
    const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!editor) { return; }
    /* eslint-disable indent */
    // document links...
    let wikiDocLinks: vscode.DocumentLink[] = await vscode.commands.executeCommand(
                                                      'vscode.executeLinkProvider',
                                                      editor.document.uri
                                                    );
    /* eslint-enable indent */
    // ...in selected text
    wikiDocLinks = wikiDocLinks.filter((wikiDocLink: vscode.DocumentLink) =>
      // todo: widen selections to include the full words at the end of the range
      editor.selections.some((selection) => selection.contains(wikiDocLink.range))
    );
    // ...that are zombies
    wikiDocLinks = wikiDocLinks.filter((wikiDocLink: vscode.DocumentLink) => 
      wikiDocLink
      && wikiDocLink.target
      && wikiDocLink.target.scheme === 'command'
      && wikiDocLink.target.query.includes('filename')
    );
    // ...should create documents -- with-(ids)
    for (const wikiDocLink of wikiDocLinks) {
    // todo: or, execute the uri the documentlink already has access to...
      if (wikiDocLink
        && wikiDocLink.target
        && wikiDocLink.target.scheme === 'command'
        && wikiDocLink.target.query.includes('filename')
      ) {
        const payload: any = JSON.parse(wikiDocLink.target.query);
        const node: any = this.index.find('filename', payload.filename);
        await vscode.commands.executeCommand(
          'wikibonsai.create.file',
          {
            id: node.id,
            filename: payload.filename,
            type: NODE.TYPE.ENTRY, // todo: un-hard-code this to be customizable somehow
          }
        );}
    }
  }

  public async executeDecoratorProvider(editor: vscode.TextEditor): Promise<void> {
    logger.debug('CommandProvider.executeDecoratorProvider()');
    this.camlTextDecorationProvider.updateDecorations(editor);
    this.wikiRefDecorationProvider.updateDecorations(editor);
    if (getConfigProperty('wikibonsai.tag.enabled', true)){
      this.tagDecorationProvider.updateDecorations(editor);
    }
  }

  public async nameFile(payload: any): Promise<(string | undefined)> {
    logger.debug('CommandProvider.nameFile()');
    return vscode.window.showInputBox({
      title: payload.createFrom,
      prompt: 'do not use these characters: ' + INVALID_FNAME_CHARS + '; doctype prefixes and suffixes will be automatically populated',
      placeHolder: 'new filename',
      value: payload.startValue,
    });
  }

  // sync

  // note: preferring sync-ing files directly
  //       instead of referring to index.
  //       it's slower, but
  //       this way we can be absolutely sure all references are updated.

  public async syncWikiRefs(oldFilename: string, newFilename: string): Promise<void> {
    logger.debug('CommandProvider.syncWikiRefs() -- start');
    // update wikirefs in rest of files
    const mdfileVscUris: vscode.Uri[] = await getMDUris();
    for (const uri of mdfileVscUris) {
      const docToUpdate = await vscode.workspace.openTextDocument(uri);
      const docToUpdateText: string = docToUpdate.getText();
      const updatedContent = wikirefs.renameFileName(oldFilename, newFilename, docToUpdateText);
      if (docToUpdateText !== updatedContent) {
        const edit = new vscode.WorkspaceEdit();
        const start = new vscode.Position(0, 0);
        const end = docToUpdate.positionAt(docToUpdateText.length);
        edit.replace(uri, new vscode.Range(start, end), updatedContent);
        await vscode.workspace.applyEdit(edit);
        await docToUpdate.save();
        // refs updated in index via 'FileWatcherProvider'
      }
    }
    logger.debug('CommandProvider.syncWikiRefs() -- end');
  }

  public async syncRefTypes(oldType: string, newType: string): Promise<void> {
    logger.debug('CommandProvider.syncRefTypes() -- start');
    // update reftypes in rest of files
    const mdfileVscUris: vscode.Uri[] = await getMDUris();
    for (const uri of mdfileVscUris) {
      const docToUpdate = await vscode.workspace.openTextDocument(uri);
      const docToUpdateText: string = docToUpdate.getText();
      const updatedContent = wikirefs.retypeRefType(oldType, newType, docToUpdateText);
      if (docToUpdateText !== updatedContent) {
        const edit = new vscode.WorkspaceEdit();
        const start = new vscode.Position(0, 0);
        const end = docToUpdate.positionAt(docToUpdateText.length);
        edit.replace(uri, new vscode.Range(start, end), updatedContent);
        await vscode.workspace.applyEdit(edit);
        await docToUpdate.save();
        // refs updated in index via 'FileWatcherProvider'
      }
    }
    logger.debug('CommandProvider.syncRefTypes() -- end');
  }

  public async syncBonsai(): Promise<void> {
    logger.debug('CommandProvider.syncBonsai() -- start');
    if (!getConfigProperty('wikibonsai.bonsai.sync.enabled', true)) { return; }
    vscode.window.showInformationMessage('building bonsai...' + SEED);
    // flush tree
    this.index.flushRelFams();
    // if there are still index files in the vault, rebuild bonsai
    const indexNodes: Node[] | undefined = this.index.filter(ATTR_NODETYPE, NODE.TYPE.INDEX);
    if (!indexNodes || indexNodes.length === 0) {
      vscode.window.showInformationMessage('last "index" doc was deconsted 🪓 -- without index files, the bonsai cannot be built 🪵');
      return;
    }
    // re-init
    await this.bonsai.build();
    this.syncGUI();
    vscode.window.showInformationMessage('bonsai complete! ' + ts.emoji);
    logger.debug('CommandProvider.syncBonsai() -- end');
  }

  public async syncGUI(): Promise<void> {
    logger.debug('CommandProvider.syncGUI() -- start');
    // open document status
    // update docwikirefs (mostly for zombies' sake)
    // todo: there's still a lag between save and the link population if a
    //       (zombie) node needed to be added to the index
    // doc: https://stackoverflow.com/questions/36414811/getting-the-currently-open-file-in-vscode
    const visibleEditors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
    for (const editor of visibleEditors) {
      // active editor docs
      vscode.commands.executeCommand('wikibonsai.vscode.executeDecorationProvider', editor);
      vscode.commands.executeCommand('vscode.executeLinkProvider', editor.document.uri);
    }
    // follow active editor treeviews; views that change on active editor changes
    vscode.commands.executeCommand('wikibonsai.refresh.panel.ancestors');
    vscode.commands.executeCommand('wikibonsai.refresh.panel.children');
    vscode.commands.executeCommand('wikibonsai.refresh.panel.backrefs');
    vscode.commands.executeCommand('wikibonsai.refresh.panel.forerefs');
    // follow file changes treeviews; views that change on file changes
    vscode.commands.executeCommand('wikibonsai.refresh.panel.bonsai');
    vscode.commands.executeCommand('wikibonsai.refresh.panel.danglers');
    vscode.commands.executeCommand('wikibonsai.refresh.panel.zombies');
    // 
    if (getConfigProperty('wikibonsai.graph.ctrls.autosync.enabled', false)) {
      vscode.commands.executeCommand('wikibonsai.sync.graph');
    }
    // todo:
    // - update 'setContext' from 'extension.ts'
    logger.debug('CommandProvider.syncGUI() -- end');
  }

  public async syncIndex(): Promise<void> {
    logger.debug('CommandProvider.syncIndex() -- start');
    this.index.flushRels();
    this.index.init();
    this.bonsai.build();
    logger.debug('CommandProvider.syncIndex() -- end');
  }
}
