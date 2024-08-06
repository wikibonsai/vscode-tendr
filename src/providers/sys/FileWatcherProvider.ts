import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import fs from 'fs';

import { NODE, Node, QUERY_TYPE } from 'caudex';
import * as wikirefs from 'wikirefs';

import {
  getAbsPathInWorkspaceForMedia,
  getFilename,
} from '../../util/wrapVSCode';
import { getConfigProperty } from '../../config';
import logger from '../../util/logger';
import {
  ATTR_MDATE,
  ATTR_MTIME,
  ATTR_NODETYPE,
  ATTR_TITLE,
  ATTR_VDATE,
  ATTR_VTIME,
  INVALID_FNAME_CHARS,
  EXT_MD,
} from '../../util/const';

import { AttributesProvider, AttrPayload } from './AttributesProvider';
import { IndexProvider } from './IndexProvider';
import { SemTreeProvider } from './SemTreeProvider';
import { TypeProvider, DocOpts } from './TypeProvider';
import { ConfigProvider } from './ConfigProvider';


export class FileWatcherProvider {
  // for locking out 'handleWillSave' effects -- only used in 'extension.ts' for now
  public lockWillSave: boolean = false;
  // providers
  private attrs: AttributesProvider;
  private config: ConfigProvider;
  private types: TypeProvider;
  private index: IndexProvider;
  private bonsai: SemTreeProvider;

  constructor(
    config: ConfigProvider,
    attrs: AttributesProvider,
    types: TypeProvider,
    index: IndexProvider,
    bonsai: SemTreeProvider,
  ) {
    logger.debug('create FileWatcherProvider...');
    this.config = config;
    this.attrs = attrs;
    this.types = types;
    this.index = index;
    this.bonsai = bonsai;
    logger.debug('...FileWatcherProvider created');
  }

  // todo: can't figure out how to actually use the cancellationToken...
  // public async handleWillCreate(e: vscode.FileWillCreateEvent): Promise<vscode.CancellationToken | void> {
  //   if (!getConfigProperty('wikibonsai.file.sync.enabled', true)) { return; }
  //   logger.debug('FileWatcherProvider.handleWillCreate()');
  //   const fileVscUris: readonly vscode.Uri[] = e.files;
  //   for (let vscUri of fileVscUris) {
  //     const filename: string = getFilename(vscUri);
  //     const isValid: boolean = wikirefs.RGX.USABLE_CHAR.FILENAME.test(filename);
  //     if (!isValid) {
  //       vscode.window.showInformationMessage(`cannot use these characters in filenames: ${INVALID_FNAME_CHARS}`);
  //       // e.token.isCancellationRequested = true;
  //       // e.token.onCancellationRequested(listener);
  //       // e.waitUntil(FileWatcherProvider.cancel);
  //       // return new vscode.CancellationTokenSource().cancel();
  //     }
  //     const isDuplicateFilename: boolean | undefined = this.index.all('filename')?.includes(filename);
  //     if (isDuplicateFilename) {
  //       vscode.window.showInformationMessage(`filename '${filename}' already exists`);
  //       // e.token.isCancellationRequested = true;
  //       // e.token.onCancellationRequested(listener);
  //       // e.waitUntil(FileWatcherProvider.cancel);
  //       // return new vscode.CancellationTokenSource().cancel();
  //     }
  //   }
  // }

  public async handleCreate(e: vscode.FileCreateEvent): Promise<void> {
    if (!getConfigProperty('wikibonsai.file.sync.enabled', true)) { return; }
    logger.debug('FileWatcherProvider.handleCreate()');
    const fileVscUris: readonly vscode.Uri[] = e.files;
    let successfullyCreated: boolean = false;
    for (const vscUri of fileVscUris) {
      const filename: string = getFilename(vscUri);
      const newFileNameWithExt: string = Utils.basename(vscUri);
      if (wikirefs.isMedia(newFileNameWithExt)) {
        if (Object.keys(this.index.cacheMedia).includes(newFileNameWithExt)) {
          // todo: wish i could use 'handleWillCreate()' instead...
          const userResponse: string | undefined = await vscode.window.showInformationMessage(`file with name '${newFileNameWithExt}' already exists at ${vscUri.toString()}.\nundo create?`, 'yes', 'no');
          if (userResponse === 'yes') {
            const wsedit = new vscode.WorkspaceEdit();
            wsedit.deleteFile(vscUri);
            await vscode.workspace.applyEdit(wsedit);
          }
          return;
        }
        this.index.cacheMedia[newFileNameWithExt] = getAbsPathInWorkspaceForMedia(vscUri);
        return;
      } else if (Utils.extname(vscUri) === EXT_MD) {
        // error: invalid filename chars
        const validFilename: RegExp = new RegExp( '^' + wikirefs.RGX.VALID_CHARS.FILENAME.source + '$' );
        if (!validFilename.test(filename)) {
          const userResponse: string | undefined = await vscode.window.showInformationMessage(`cannot use these characters in filenames:\n${INVALID_FNAME_CHARS}\nundo create?`, 'yes', 'no');
          if (userResponse === 'yes') {
            const wsedit = new vscode.WorkspaceEdit();
            wsedit.deleteFile(vscUri);
            await vscode.workspace.applyEdit(wsedit);
          }
        }
        // get node -- if it's a zombie we want to re-use its node id
        let node: Node | undefined = this.index.find('filename', filename);
        const id: string | undefined = node?.id;
        ////
        // init attrs
        // defaults
        if (!this.attrs.payload) {
          let unfixedFilename: string = '';
          let affixedFilename: string = '';
          [unfixedFilename, affixedFilename] = this.types.hasAffix(filename);
          const defaults: DocOpts | undefined = this.types.default;
          if (!defaults) {
            logger.warn('no default template');
          } else {
            this.attrs.payload = {
              filename: affixedFilename,
              unfixedFilename: unfixedFilename,
              tmplVscUri: defaults.vscUri,
            } as AttrPayload;
          }
        }
        // if we're creating from a zombie, use the pre-existing id
        const attrs: any = await this.attrs.init(vscUri, id);
        const attrData: any = attrs[0];
        const attrStr: string = attrs[1];
        ////
        // update index
        // error: node exists
        if (node && node.kind !== NODE.KIND.ZOMBIE) {
          // todo: wish i could use 'handleWillCreate()' instead...
          const userResponse: string | undefined = await vscode.window.showInformationMessage(`file with name '${filename}' already exists at ${node.data.uri}.\nundo create?`, 'yes', 'no');
          if (userResponse === 'yes') {
            const wsedit = new vscode.WorkspaceEdit();
            wsedit.deleteFile(vscUri);
            await vscode.workspace.applyEdit(wsedit);
          }
          return;
        // node does not exist
        } else if (!node) {
          // node type
          let type: string | undefined = this.attrs.typePayload();
          if (type === undefined) {
            type = this.types.resolve(filename, vscUri.toString(), attrs);
          }
          /* eslint-disable indent */
          node = this.index.add({
                                  uri: vscUri.toString(),
                                  filename: filename,
                                  title: attrData.title,
                                }, {
                                  id: attrData.id,
                                  type: type,
                                });
          /* eslint-enable indent */
          if (!node) {
            logger.warn(`unable to create new node for filename '${filename}' in index`);
            return;
          }
        // node is a zombie
        } else if (node.kind === NODE.KIND.ZOMBIE) {
          node = this.index.fill(node.id, {
            uri: vscUri.toString(),
            filename: filename,
            title: attrData.title,
          });
          if (!node) {
            logger.warn(`unable to fill zombie node: ${JSON.stringify(node)}`);
            return;
          }
        // existing node
        } else {
          console.warn('oops -- how are we here?');
          return;
        }
        ////
        // update file
        const edit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();
        // build edit
        edit.insert(vscUri, new vscode.Position(0, 0), attrStr);
        await vscode.workspace.applyEdit(edit);
        // save
        const docToCreate: vscode.TextDocument = await vscode.workspace.openTextDocument(vscUri);
        await docToCreate.save();
        successfullyCreated = true;
        // update embed cache
        const docText: string = docToCreate.getText();
        const backembeds: any[] | undefined = this.index.backembeds(node.id);
        if (backembeds && (backembeds.length !== 0)) {
          this.index.cacheContent[filename] = docText;
        }
      } else {
        logger.verbose('FileWatcherProvider.handleDidCreate() -- skipp file: ' + vscUri.toString());
      }
    }
    if (successfullyCreated) {
      vscode.commands.executeCommand('wikibonsai.sync.gui');
    }
  }

  public async handleRename(e: vscode.FileRenameEvent): Promise<void> {
    if (!getConfigProperty('wikibonsai.file.sync.enabled', true)) { return; }
    logger.debug('FileWatcherProvider.handleRename()');
    const fileVscUris: readonly any[] = e.files;
    for (const uriInfo of fileVscUris) {
      // init consts
      const oldVscUri: vscode.Uri = uriInfo.oldUri;
      const newVscUri: vscode.Uri = uriInfo.newUri;
      const oldUri: string = oldVscUri.toString();
      const newUri: string = newVscUri.toString();
      const oldFilename: string = getFilename(oldVscUri);
      const newFilename: string = getFilename(newVscUri);
      const oldFileNameWithExt: string = Utils.basename(oldVscUri);
      const newFileNameWithExt: string = Utils.basename(newVscUri);
      const nodeWithNewFileName: Node | undefined = this.index.find('filename', newFilename);
      ////
      // not a file rename
      if (nodeWithNewFileName && (nodeWithNewFileName.kind === NODE.KIND.DOC)) {
        // error: node that already has new filename
        if (nodeWithNewFileName.data.uri === newUri) {
          vscode.window.showErrorMessage(`a file already exists with that name: ${nodeWithNewFileName.data.uri}`);
          return;
        }
        // file was moved
        if((nodeWithNewFileName.data.uri === oldUri)
          && (oldFileNameWithExt === newFileNameWithExt)
        ) {
          this.index.edit(nodeWithNewFileName.id, 'uri', newUri);
          return;
        }
      }
      ////
      // media changes
      if (wikirefs.isMedia(newFileNameWithExt)) {
        this.index.cacheMedia[newFileNameWithExt] = getAbsPathInWorkspaceForMedia(newVscUri);
        await vscode.commands.executeCommand('wikibonsai.sync.wikirefs', oldFileNameWithExt, newFileNameWithExt);
        return;
      ////
      // filename changes
      } else if (Utils.extname(newVscUri) === EXT_MD) {
        // logger.debug('file rename operation:\noldUri: ', oldUri, 'newUri: ', newUri);
        // get id from file, if it exists
        const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(newVscUri);
        const docText: string = doc.getText();
        ////
        // get node from index
        let node: any;
        // attrs
        const attrPayload: any = await this.attrs.load(docText);
        const attrData: any = attrPayload.data;
        // nodetype
        let type: string | undefined = this.attrs.typePayload();
        if (type === undefined) {
          type = this.types.resolve(newFilename, newUri, attrData);
        }
        if (attrData.id) {
          node = this.index.get(attrData.id);
        } else {
          node = this.index.find('filename', oldFilename);
        }
        // update node in index
        // no node
        if (!node) {
          logger.warn(`'${oldFilename}' not found in index, unable to update 'filename' to '${newFilename}'`);
          continue;
        // zombie node
        } else if (node.kind === NODE.KIND.ZOMBIE) {
          const zombieNode = this.index.fill(node.id, {
            type: type,
            uri: newVscUri.toString(),
            filename: newFilename,
            title: attrData.title,
          });
          if (!zombieNode) {
            logger.warn(`unable to fill zombie node: ${JSON.stringify(node)}`);
            return;
          }
        // existing node
        } else {
          // if renamed file is replacing a zombie:
          if (nodeWithNewFileName && (nodeWithNewFileName.kind === NODE.KIND.ZOMBIE)) {
            // transfer web relationships
            this.index.transfer(nodeWithNewFileName.id, node.id);
            // replace tree location
            this.index.replace(nodeWithNewFileName.id, node.id);
            // delete zombie
            this.index.rm(nodeWithNewFileName.id);
          }
          this.index.edit(node.id, ATTR_NODETYPE, type);
          this.index.edit(node.id, 'filename', newFilename);
          this.index.edit(node.id, 'uri', newVscUri.toString());
          // update embed cache
          const backembeds: any[] | undefined = this.index.backembeds(node.id);
          if (backembeds && (backembeds.length !== 0)) {
            delete this.index.cacheContent[oldFilename];
            this.index.cacheContent[newFilename] = docText;
          }
        }
        await vscode.commands.executeCommand('wikibonsai.sync.wikirefs', oldFilename, newFilename);
      ////
      // handle directory-name change
      } else if (fs.lstatSync(newVscUri.fsPath).isDirectory()) {
        // update filename in rest of files
        for (const node of this.index.all(QUERY_TYPE.NODE)) {
          // update uris of files who include renamed directory in uri
          const uriIncludesDirPrefix: boolean = node.data.uri.includes(oldUri);
          if (uriIncludesDirPrefix) {
            // uri is already updated on vscode's end, so just update the index
            this.index.edit(node.id, 'uri', node.data.uri.replace(oldUri, newUri));
          }
        }
      } else {
        logger.verbose('FileWatcherProvider.handleRename() -- skipping file: ' + newVscUri);
      }
    }
    // will be called after this method runs:
    // handleWillSave()
    // handleDidSave()
  }

  // fires on 'vscode.window.onDidChangeActiveTextEditor' (see extension.ts)
  // primarily handles view time ('vtime', 'vdate') updates.
  public async handleDidView(e: any): Promise<void> {
    if (!getConfigProperty('wikibonsai.file.sync.enabled', true)
    || !getConfigProperty('wikibonsai.attrs.vtime.enabled', true)
    ) {
      return;
    }
    logger.debug('FileWatcherProvider.handleView()');
    // skip templates
    if (this.index.isTemplate(e.document.uri)) { return; }
    // @ts-expect-error: return type defined in last argument 'wse': 'WorkspaceEdit'.
    const updateVtimes: vscode.WorkspaceEdit[] | void = await this.attrs.updateFileAttr([ATTR_VTIME, ATTR_VDATE], e.document.uri, 'wse');
    if (updateVtimes) {
      const jobs: any[] = [];
      // lock 'handleWillSave()' so that modified time does
      // not update every time view time is updated.
      this.lockWillSave = true;
      // note: this is kind of silly, as there will probably only be
      // one instance the vast, vast majority of the time...
      for (const edit of updateVtimes) {
        jobs.push(vscode.workspace.applyEdit(edit));
      }
      Promise.all(jobs).then(async () => {
        await vscode.workspace.saveAll();
        this.lockWillSave = false;
      });
    }
  }

  // primarily handles modified time ('mtime', 'mdate') updates
  public async handleWillSave(e: vscode.TextDocumentWillSaveEvent): Promise<(vscode.TextEdit[] | void) | void> {
    if (!getConfigProperty('wikibonsai.file.sync.enabled', true)) { return; }
    logger.debug('FileWatcherProvider.handleWillSave()');
    // todo: if it's a filename change, only change that and nothing else.
    const vscUri: vscode.Uri = e.document.uri;
    if (Utils.extname(vscUri) !== EXT_MD) { return; }
    // skip templates
    if (this.index.isTemplate(vscUri)) { return; }
    // if manually saved, then update timestamp attrs in file
    // note: creation via 'createDoc' command will not be considered 'manual',
    //       but this is fine since 'handleCreate()' will populate the initial
    //       attribute values
    if (!this.lockWillSave && e.reason === vscode.TextDocumentSaveReason.Manual) {
      const mdateOn: boolean = getConfigProperty('wikibonsai.attrs.mdate.enabled', true);
      const vdateOn: boolean = getConfigProperty('wikibonsai.attrs.vdate.enabled', true);
      const mtimeOn: boolean = getConfigProperty('wikibonsai.attrs.mtime.enabled', true);
      const vtimeOn: boolean = getConfigProperty('wikibonsai.attrs.vtime.enabled', true);
      const times: string[] = [];
      if (mdateOn) { times.push(ATTR_MDATE); }
      if (vdateOn) { times.push(ATTR_VDATE); }
      if (mtimeOn) { times.push(ATTR_MTIME); }
      if (vtimeOn) { times.push(ATTR_VTIME); }
      if (times.length > 0) {
        logger.debug('FileWatcherProvider.handleWillSave() -- updating timestamp');
        // @ts-expect-error: return type defined in last argument 'te': 'TextEdit'.
        const attrAutoUpdateEdits: Promise<vscode.TextEdit[] | void> = this.attrs.updateFileAttr(times, vscUri, 'te');
        return attrAutoUpdateEdits;
      }
    }
    logger.debug('FileWatcherProvider.handleWillSave() -- attrs locked');
  }

  public async handleDidSave(e: vscode.TextDocument): Promise<void> {
    if (!getConfigProperty('wikibonsai.file.sync.enabled', true)) { return; }
    logger.debug('FileWatcherProvider.handleDidSave()');
    const vscUri: vscode.Uri = e.uri;
    const uri: string = vscUri.toString();
    const filename: string = getFilename(vscUri);
    const fileNameWithExt: string = Utils.basename(vscUri);
    // config file
    const isConfigFile: boolean = (vscUri.toString() === this.config.configFileUri);
    if (isConfigFile) {
      this.config.build();
    }
    // doctype file
    const isDocTypeFile: boolean = (vscUri.toString() === this.types.typesFileUri);
    if (isDocTypeFile) {
      // reresolve types
      this.types.build();
      this.index.refreshNodeTypes(this.attrs, this.types);
      vscode.commands.executeCommand('wikibonsai.sync.gui');
      logger.debug('FileWatcherProvider.handleDidSave() -- finished saving doctype file');
      return;
    // media file
    } else if (wikirefs.isMedia(fileNameWithExt)) {
      this.index.cacheMedia[fileNameWithExt] = getAbsPathInWorkspaceForMedia(vscUri);
      logger.debug('FileWatcherProvider.handleDidSave() -- finished saving media file');
      return;
    // markdown files
    } else if (Utils.extname(vscUri) === EXT_MD) {
      // prep update
      const docToSave = await vscode.workspace.openTextDocument(vscUri);
      const docText: string = docToSave.getText();
      const attrPayload: any = await this.attrs.load(docText);
      const attrData: any = attrPayload.data;
      const type: string = this.types.resolve(filename, uri, attrData);
      if (!attrData.id && (type !== NODE.KIND.TEMPLATE)) {
        logger.warn(`unable to update index, no 'id' found for file '${vscUri}'`);
        return;
      }
      /* eslint-disable indent */
      const node: Node | undefined = (type === NODE.KIND.TEMPLATE)
                                    ? this.index.find('uri', uri)
                                    : this.index.get(attrData.id);
      /* eslint-enable indent */
      if (!node) {
        logger.warn(`unable to update index, no node found with 'uri' ${uri} and/or 'id' ${attrData.id}`);
        return;
      }
      // update 'type'
      if (node.type !== type) { node.type = type; }
      // update 'attr's
      if (attrData.id && attrData.title) {
        // update 'title'
        this.index.edit(attrData.id, ATTR_TITLE, attrData.title);
      }
      // index file
      if (type === NODE.TYPE.INDEX) {
        logger.debug('FileWatcherProvider.handleDidSave() -- updating tree from index doc');
        // tree
        const attrPayload: any = await this.attrs.load(docText);
        const cleanContent: string = attrPayload.content.replace(/^\n*/, '');
        const updated: boolean = await this.bonsai.updateSubTree(filename, cleanContent);
        if (updated) { vscode.commands.executeCommand('wikibonsai.refresh.panel.bonsai'); }
        else { logger.debug('FileWatcherProvider.handleDidSave() -- unable to update tree'); }
      }
      // web
      // ('flushRelRefs()' is called internally)
      try {
        await this.index.refreshRelRefs(vscUri, node);
      } catch (e) {
        logger.error(e, vscUri, JSON.stringify(node));
      }
      // update embed cache
      const foreembeds: any[] | undefined = this.index.foreembeds(node.id);
      if (foreembeds && (foreembeds.length !== 0)) {
        this.index.cacheContent[filename] = docText;
      }
      // todo: when partial bonsai updates work
      // // if bonsai root updated
      // if (this.config.root !== this.index.root(QUERY_TYPE.node)?.data.filename) {
      //   // rebuild tree
      //   await this.bonsai.update(docText, filename);
      // }
      vscode.commands.executeCommand('wikibonsai.sync.gui');
      logger.debug('FileWatcherProvider.handleDidSave() -- finished saving mkdn file');
      return;
    } else {
      logger.debug('FileWatcherProvider.handleDidSave() -- skip file: ' + vscUri.toString());
      return;
    }
    // note: this line should not be reachable...
  }

  public async handleWillDelete(e: vscode.FileWillDeleteEvent): Promise<void> {
    if (!getConfigProperty('wikibonsai.file.sync.enabled', true)) { return; }
    logger.debug('FileWatcherProvider.handleDelete()');
    const fileVscUris: readonly any[] = e.files;
    for (const vscUri of fileVscUris) {
      // directory
      const isDir: boolean = fs.lstatSync(vscUri.fsPath).isDirectory();
      if (isDir) {
        logger.debug('FileWatcherProvider.handleDelete() -- directory ' + vscUri.toString());
        // update filename in rest of files
        for (const node of this.index.all(QUERY_TYPE.NODE)) {
          // update uris of files who include renamed directory in uri
          const rmDirUri: string = vscUri.toString();
          const uriIncludesDirPrefix: boolean = (node.data.uri.indexOf(rmDirUri) === 0);
          if (uriIncludesDirPrefix) {
            // uri is already updated on vscode's end, so just update the index
            this.index.rm(node.id);
          }
        }
        logger.debug('FileWatcherProvider.handleDelete() -- deleted directory and contents');
      // file
      } else {
        logger.debug('FileWatcherProvider.handleDelete() -- file ' + vscUri.toString());
        const filename: string = getFilename(vscUri);
        const fileNameWithExt: string = Utils.basename(vscUri);
        // media file
        if (wikirefs.isMedia(fileNameWithExt)) {
          delete this.index.cacheMedia[fileNameWithExt];
          logger.debug('FileWatcherProvider.handleDelete() -- deleted media file');
          return;
        // markdown file
        } else if (Utils.extname(vscUri) === EXT_MD) {
          const node: Node | undefined = this.index.find('uri', vscUri.toString());
          if (!node) {
            logger.info(`FileWatcherProvider.handleDelete() -- file '${vscUri}' was not in the index`);
            return;
          }
          this.index.rm(node.id);
          // todo: when partial bonsai updates work
          if (Object.keys(this.index.cacheContent).includes(filename)) {
            delete this.index.cacheContent[filename];
          }
          logger.debug('FileWatcherProvider.handleDelete() -- deleted mkdn file');
        } else {
          logger.debug('FileWatcherProvider.handleDidDelete() -- skip file: ' + vscUri.toString());
        }
      }
    }
    vscode.commands.executeCommand('wikibonsai.sync.gui');
    return;
  }
}
