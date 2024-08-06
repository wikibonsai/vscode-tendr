import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import { NODE, Node } from 'caudex';

// config
import { isDefined, getConfigProperty, updateConfigProperty } from './config';
// system providers
import { AttributesProvider } from './providers/sys/AttributesProvider';
import { CommandProvider } from './providers/sys/CommandProvider';
import { ConfigProvider } from './providers/sys/ConfigProvider';
import { FileWatcherProvider } from './providers/sys/FileWatcherProvider';
import { GraphTreeProvider, GraphWebProvider } from './providers/sys/GraphProvider';
import { IndexProvider } from './providers/sys/IndexProvider';
import { MarkdownProvider } from './providers/sys/MarkdownProvider';
import { WizProvider } from './providers/sys/WizProvider';
import { SemTreeProvider } from './providers/sys/SemTreeProvider';
import { TypeProvider } from './providers/sys/TypeProvider';
// document providers
import { CamlDecorationProvider } from './providers/doc/CamlDecorationProvider';
import { RefTypeCompletionProvider, WikiRefCompletionProvider} from './providers/doc/CompletionProvider';
import { TagDecorationProvider } from './providers/doc/TagDecorationProvider';
import { TagLinkProvider } from './providers/doc/TagLinkProvider';
import { WikiRefDecorationProvider } from './providers/doc/WikiRefDecorationProvider';
import { WikiRefHoverProvider } from './providers/doc/HoverProvider';
import { WikiRefLinkProvider } from './providers/doc/DocWikiRefProvider';
import { RenameProvider } from './providers/doc/RenameProvider';
// treeview providers
import { NoDocTreeItem } from './items/TreeItems';
import { BonsaiTreeDataProvider } from './providers/views/BonsaiTreeViewProvider';
import { AncestorsTreeDataProvider, ChildrenTreeDataProvider } from './providers/views/RelFamTreeViewProvider';
import { BackRefsTreeDataProvider, ForeRefsTreeDataProvider } from './providers/views/RelRefTreeViewProvider';
import { OrphanTreeDataProvider, ZombieTreeDataProvider } from './providers/views/RelPartTreeViewProvider';
// utils
import logger from './util/logger';
import { getWorkspaceDir } from './util/wrapVSCode';
import { PRUNE, TREE, WATER, ts } from './util/emoji';
import { ATTR_NODETYPE, EXT_MD } from './util/const';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export const activate = async (context: vscode.ExtensionContext) => {
  context.subscriptions.push(logger.logger);
  logger.info('WikiBonsai: start activation');
  // init bonsai species
  await ts.init(context.workspaceState);

  ////
  // init providers

  // init system providers //
  const wsDir: vscode.Uri | undefined   = await getWorkspaceDir();
  if (!wsDir) {
    logger.error('failed to get workspace directory');
    return;
  }
  const attrs: AttributesProvider       = new AttributesProvider();
  const config: ConfigProvider          = new ConfigProvider();
  const initializingConfigs             = await config.build(wsDir);
  if (!initializingConfigs) {
    logger.warn('configs failed to initialize, is there a config file?');
  }
  const types: TypeProvider             = new TypeProvider(config);
  // wait for doctypes to init...
  const initializingTypes               = await types.build(wsDir);
  if (!initializingTypes) {
    logger.warn('doctypes failed to initialize, is there a doctype file?');
  }
  // since building file data requires 'async', the index must do this outside the constructor
  const fileItems: any                  = await IndexProvider.prepFileData(attrs, types);
  const index: IndexProvider            = new IndexProvider(fileItems);
  const bonsai: SemTreeProvider         = new SemTreeProvider(attrs, index);
  const extMD: MarkdownProvider         = new MarkdownProvider(index);
  // wait for caudex and semtree to init...
  const initializingIndex               = await index.init();
  if (!initializingIndex) {
    logger.error('index failed to initialize');
    return;
  }
  const initializingBonsai              = await bonsai.build();
  if (!initializingBonsai) {
    logger.error('bonsai failed to initialize, are there index files?');
  }
  // ...continue init system providers
  //   note: this is a faux filewatcher, not an actual vscode filewatcher
  const fileWatcher                     = new FileWatcherProvider(config, attrs, types, index, bonsai);
  const wizard                          = new WizProvider(types, index);
  // graph
  const tree                            = new GraphTreeProvider(wsDir, types, index);
  const web                             = new GraphWebProvider(wsDir, types, index);

  logger.debug('creating TreeProviders...');
  // init document providers //
  // tab completion
  const wikiRefCompletionProvider     = new WikiRefCompletionProvider(index);
  const refTypeCompletionProvider     = new RefTypeCompletionProvider(index);
  // cmd/ctrl + click to folow
  const wikiRefLinkProvider           = new WikiRefLinkProvider(index);
  const tagLinkProvider               = new TagLinkProvider(index, bonsai);
  // hover preview
  const wikiRefHoverProvider          = new WikiRefHoverProvider(index);
  // syntax highlights
  //   note: these are faux decorationproviders, not actual vscode decorationproviders
  const wikiRefDecorationProvider     = new WikiRefDecorationProvider(types, index);
  const tagDecorationProvider         = new TagDecorationProvider(index);
  const camlDecorationProvider        = new CamlDecorationProvider();
  const renameProvider                = new RenameProvider(index);

  // init view providers //
  //   refresh on file changes
  const bonsaiTreeDataProvider        = new BonsaiTreeDataProvider(types, index);
  const orphanTreeDataProvider        = new OrphanTreeDataProvider(types, index);
  const zombieTreeDataProvider        = new ZombieTreeDataProvider(types, index);
  //   refresh on active editor
  const ancestorsTreeDataProvider     = new AncestorsTreeDataProvider(types, index);
  const childrenTreeDataProvider      = new ChildrenTreeDataProvider(types, index);
  const foreRefsTreeDataProvider      = new ForeRefsTreeDataProvider(types, index);
  const backRefsTreeDataProvider      = new BackRefsTreeDataProvider(types, index);
  logger.debug('...TreeProviders created');

  /* eslint-disable indent */
  const commands                      = new CommandProvider(
                                                            attrs,
                                                            types,
                                                            index,
                                                            bonsai,
                                                            camlDecorationProvider,
                                                            wikiRefDecorationProvider,
                                                            tagDecorationProvider,
                                                          );
  /* eslint-enable indent */
  const bonsaiTreeView = vscode.window.createTreeView('wikibonsai.panel.bonsai', {
    treeDataProvider: bonsaiTreeDataProvider,
    // showCollapseAll: true,
  });
  bonsaiTreeView.title = ts.emoji + ' Bonsai';

  const bonsaiFileNames: string[] | undefined = index.filter(ATTR_NODETYPE, NODE.TYPE.INDEX)?.map((node: Node) => node.data.filename + EXT_MD);
  // custom 'in' conditional for 'when' contexts in package.json
  vscode.commands.executeCommand(
    'setContext',
    'wikibonsai.bonsaiTrunkFiles',
    bonsaiFileNames,
  );

  logger.info('push context subscriptions...');

  ////
  // context subscriptions are loosely ordered by plugin component:
  // - debug (commands)
  // - all gui
  // - attrs
  // - bonsai
  // - graph
  // - treeview panels
  // - wikirefs
  // - wizard
  context.subscriptions.push(
    ...[
      ////
      // config updates
      // update tree species emoji
      vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
        // configs
        if (e.affectsConfiguration('wikibonsai.file.config')) {
          await config.setConfigFileUri();
          config.build();
        }
        if (e.affectsConfiguration('wikibonsai.attrs.engine')) {
          const curEngine: string = getConfigProperty('wikibonsai.attrs.engine', 'caml');
          if (curEngine !== config.garden.attrs) {
            config.updateConfigAttrs(curEngine);
          }
        }
        if (e.affectsConfiguration('wikibonsai.bonsai.root')) {
          const root: string = getConfigProperty('wikibonsai.bonsai.root', 'i.bonsai');
          if (root !== config.garden.root) {
            config.updateConfigRoot(root);
          }
        }
        // doctypes
        if (e.affectsConfiguration('wikibonsai.file.doc-types')) {
          await types.setTypesFileUri();
          types.build();
        }
        // tree species
        if (e.affectsConfiguration('wikibonsai.emoji.tree')) {
          ts.emoji = getConfigProperty('wikibonsai.emoji.tree', TREE.bamboo);
          // config
          // bonsai treeview
          bonsaiTreeView.title = ts.emoji + ' Bonsai';
          bonsaiTreeDataProvider.refresh();
          // tree graph 
          // (this is more for documentation than functionality,
          //  as the vscode panel will require a reload)
          tree.panelTitle = ts.emoji + ' Tree';
        }
      }),
      // debug
      // vscode.commands.registerCommand('wikibonsai.debug.dump.bonsai', () => {
      //   if (getConfigProperty('wikibonsai.debug.enabled', true)) {
      //     index.dumpTree();
      //   }
      // }),
      vscode.commands.registerCommand('wikibonsai.debug.dump.index', () => {
        if (getConfigProperty('wikibonsai.debug.enabled', true)) {
          index.dump();
        }
      }),
      vscode.commands.registerCommand('wikibonsai.debug.print.bonsai', () => {
        if (getConfigProperty('wikibonsai.debug.enabled', true)) {
          bonsai.print();
        }
      }),
      vscode.commands.registerCommand('wikibonsai.debug.print.index', () => {
        if (getConfigProperty('wikibonsai.debug.enabled', true)) {
          index.print();
        }
      }),
      vscode.commands.registerCommand('wikibonsai.debug.reset.index', () => {
        if (getConfigProperty('wikibonsai.debug.enabled', true)) {
          index.flushRels();
          () => {
            index.init();
            bonsai.build();
          };
        }
      }),
      // all gui
      vscode.commands.registerCommand('wikibonsai.sync.gui', () => {
        return commands.syncGUI();
      }),
      // attrs
      vscode.window.onDidChangeActiveTextEditor(async (event) => {
        if (event
        && vscode.window.activeTextEditor
        && (event.document === vscode.window.activeTextEditor.document)
        ) {
          fileWatcher.handleDidView(event);
        }
      }),
      vscode.commands.registerCommand('wikibonsai.genID', () => {
        const id = index.genID();
        return id;
      }),
      // bonsai
      vscode.commands.registerCommand('wikibonsai.sync.bonsai', () => {
        commands.syncBonsai();
      }),
      // file
      // vscode.workspace.onWillCreateFiles((e: vscode.FileWillCreateEvent) => fileWatcher.handleWillCreate(e)),
      vscode.workspace.onDidCreateFiles((e: vscode.FileCreateEvent) => fileWatcher.handleCreate(e)),
      vscode.workspace.onDidRenameFiles((e: vscode.FileRenameEvent) => fileWatcher.handleRename(e)),
      // vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => fileWatcher.handleChange(e, index)),
      vscode.workspace.onWillSaveTextDocument((e: vscode.TextDocumentWillSaveEvent) => e.waitUntil(fileWatcher.handleWillSave(e))),
      vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => fileWatcher.handleDidSave(e)),
      vscode.workspace.onWillDeleteFiles((e: vscode.FileWillDeleteEvent) => fileWatcher.handleWillDelete(e)),
      vscode.commands.registerCommand('wikibonsai.create.file', (payload: any) => {
        return commands.createDoc(payload);
      }),
      vscode.commands.registerCommand('wikibonsai.create.file.bulk', () => {
        return commands.createDocBulk();
      }),
      vscode.commands.registerCommand('wikibonsai.open.file', (uri: vscode.Uri) => {
        commands.openDoc(uri);
      }),
      vscode.commands.registerCommand('wikibonsai.name.file', (payload: any) => {
        return commands.nameFile(payload);
      }),
      // graph
      vscode.commands.registerCommand('wikibonsai.open.graph.tree', () => {
        tree.draw(context);
      }),
      vscode.commands.registerCommand('wikibonsai.open.graph.web', () => {
        web.draw(context);
      }),
      vscode.window.onDidChangeActiveTextEditor((event) => {
        if (event
        && getConfigProperty('wikibonsai.graph.ctrls.follow.enabled', true)
        && (Utils.extname(event.document.uri) === EXT_MD)
        ) {
          const vscUri: vscode.Uri = event.document.uri;
          const uri: string = vscUri.toString();
          tree.postFocusNode(uri);
          web.postFocusNode(uri);
        }
      }),
      vscode.commands.registerCommand('wikibonsai.sync.graph', () => {
        tree.postUpdateData();
        web.postUpdateData();
      }),
      vscode.commands.registerCommand('wikibonsai.toggle.graph.ctrls.dim', (value: string) => {
        updateConfigProperty('wikibonsai.graph.ctrls.dim', value);
      }),
      vscode.commands.registerCommand('wikibonsai.toggle.graph.ctrls.fix', (value: boolean) => {
        updateConfigProperty('wikibonsai.graph.ctrls.fix.enabled', value);
      }),
      vscode.commands.registerCommand('wikibonsai.toggle.graph.ctrls.follow', (value: boolean) => {
        updateConfigProperty('wikibonsai.graph.ctrls.follow.enabled', value);
      }),
      vscode.commands.registerCommand('wikibonsai.toggle.graph.ctrls.sync', (value: boolean) => {
        updateConfigProperty('wikibonsai.graph.ctrls.autosync.enabled', value);
      }),
      // treeview panels
      // bonsai
      bonsaiTreeView, // initialized above
      vscode.commands.registerCommand('wikibonsai.refresh.panel.bonsai', () => {
        if (getConfigProperty('wikibonsai.panel.bonsai.enabled', true)) {
          bonsaiTreeDataProvider.refresh();
        }
      }),
      // todo:
      // 'reveal()' recursion only supports 3 levels -- enabling treeitem
      // uncollapsing for the entire ancestry path might not be possible
      // via the vscode api...
      // https://github.com/microsoft/vscode/issues/55879#issuecomment-433939474
      // 
      // vscode.window.onDidChangeActiveTextEditor((event) => {
      //   if (event && getConfigProperty('wikibonsai.panel.bonsai.follow.enabled', true)) {
      //     const node: Node | undefined = index.find('uri', event.document.uri.toString());
      //     if (node) {
      //       bonsaiTreeView.reveal(
      //         { key: node.data.title },
      //         { focus: true, select: false, expand: true }
      //       );
      //     }
      //   }
      // }),
      // ancestors
      vscode.window.createTreeView('wikibonsai.panel.ancestors', {
        treeDataProvider: ancestorsTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('wikibonsai.refresh.panel.ancestors', () => {
        if (getConfigProperty('wikibonsai.panel.ancestors.enabled', true)) {
          ancestorsTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('wikibonsai.panel.ancestors.enabled', true)) {
          ancestorsTreeDataProvider.refresh();
        }
      }),
      // children
      vscode.window.createTreeView('wikibonsai.panel.children', {
        treeDataProvider: childrenTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('wikibonsai.refresh.panel.children', () => {
        if (getConfigProperty('wikibonsai.panel.children.enabled', true)) {
          childrenTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('wikibonsai.panel.children.enabled', true)) {
          childrenTreeDataProvider.refresh();
        }
      }),
      // forerefs
      vscode.window.createTreeView('wikibonsai.panel.forerefs', {
        treeDataProvider: foreRefsTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('wikibonsai.refresh.panel.forerefs', () => {
        if (getConfigProperty('wikibonsai.panel.forerefs.enabled', true)) {
          foreRefsTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('wikibonsai.panel.forerefs.enabled', true)) {
          foreRefsTreeDataProvider.refresh();
        }
      }),
      // backrefs
      vscode.window.createTreeView('wikibonsai.panel.backrefs', {
        treeDataProvider: backRefsTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('wikibonsai.refresh.panel.backrefs', () => {
        if (getConfigProperty('wikibonsai.panel.backrefs.enabled', true)) {
          backRefsTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('wikibonsai.panel.backrefs.enabled', true)) {
          backRefsTreeDataProvider.refresh();
        }
      }),
      // orphan
      vscode.window.createTreeView('wikibonsai.panel.orphans', {
        treeDataProvider: orphanTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('wikibonsai.refresh.panel.orphans', () => {
        if (getConfigProperty('wikibonsai.panel.orphans.enabled', true)) {
          orphanTreeDataProvider.refresh();
        }
      }),
      // zombies
      vscode.window.createTreeView('wikibonsai.panel.zombies', {
        treeDataProvider: zombieTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('wikibonsai.refresh.panel.zombies', () => {
        if (getConfigProperty('wikibonsai.panel.zombies.enabled', true)) {
          zombieTreeDataProvider.refresh();
        }
      }),
      // commands for zombies in all treeview panels (and quickpick items, etc.)
      vscode.commands.registerCommand('wikibonsai.resurrect', (treeItem: NoDocTreeItem) => {
        treeItem.createDoc();
      }),
      vscode.commands.registerCommand('wikibonsai.resurrect.tmpl', (treeItem: NoDocTreeItem) => {
        wizard.open(treeItem.filename());
      }),
      // wikirefs
      // completion
      vscode.languages.registerCompletionItemProvider(
        'markdown',
        wikiRefCompletionProvider,
        wikiRefCompletionProvider.triggerChar,
      ),
      // document links
      vscode.languages.registerDocumentLinkProvider(
        { language: 'markdown', scheme: '*' },
        wikiRefLinkProvider,
      ),
      vscode.languages.registerDocumentLinkProvider(
        { language: 'markdown', scheme: '*' },
        tagLinkProvider,
      ),
      // hover preview
      vscode.languages.registerHoverProvider('markdown', wikiRefHoverProvider),
      // rename refactors
      vscode.languages.registerRenameProvider(
        'markdown',
        renameProvider,
      ),
      // (wiki)reftype completion
      vscode.languages.registerCompletionItemProvider(
        'markdown',
        refTypeCompletionProvider,
        refTypeCompletionProvider.triggerChar,
      ),
      // sync (for refactors)
      // todo: sync #tags
      vscode.commands.registerCommand('wikibonsai.sync.wikirefs', (oldFilename: string, newFilename: string) => {
        return commands.syncWikiRefs(oldFilename, newFilename);
      }),
      vscode.commands.registerCommand('wikibonsai.sync.reftypes', (oldRefType: string, newRefType: string) => {
        return commands.syncRefTypes(oldRefType, newRefType);
      }),
      // syntax highlights (:caml:: + #tags + [[wikirefs]])
      vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
        if (getConfigProperty('wikibonsai.syntax-highlight.enabled', true)
        && editor
        && vscode.window.activeTextEditor
        ) {
          vscode.commands.executeCommand('wikibonsai.vscode.executeDecorationProvider', editor);
        }
      }),
      // only update decorations when changes are happening in the active editor
      vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
        if (getConfigProperty('wikibonsai.syntax-highlight.enabled', true)
        && event
        && vscode.window.activeTextEditor
        && (event.document === vscode.window.activeTextEditor.document)
        // the following line...
        // what: ...ensures the document uri is a uri of
        //       some file in the workspace
        // why : ...because we don't execute forever
        //       while the console or output channel is selected
        && (event.document.uri.toString().includes(wsDir.toString()))
        ) {
          vscode.commands.executeCommand('wikibonsai.vscode.executeDecorationProvider', vscode.window.activeTextEditor);
        }
      }),
      // wizard
      vscode.commands.registerCommand('wikibonsai.open.wizard', () => {
        wizard.open();
      }),
      // vscode 'override'
      vscode.commands.registerCommand('wikibonsai.vscode.executeDecorationProvider', (editor: vscode.TextEditor) => {
        if (editor) {
          return commands.executeDecoratorProvider(editor);
        }
      }),
    ].flat().filter(isDefined),
  );

  logger.info('...finished pushing context subscriptions');

  // set timeout so updates trigger after markdown
  // provider has been initialized (...hopefully)
  setTimeout(async () => {
    // re-initialize index
    index.init();
    // syntax highlights
    vscode.commands.executeCommand('wikibonsai.vscode.executeDecorationProvider', vscode.window.activeTextEditor);
  }, 1000);

  vscode.window.showInformationMessage(
    ts.emoji + ' ' +
    'wikibonsai ready for tending' + ' ' +
    WATER + ' ' + PRUNE
  );

  return {
    extendMarkdownIt(md: any) {
      return extMD.buildMarkdownIt(md);
    }
  };
};


// this method is called when your extension is deactivated
// eslint-disable-next-line
export const deactivate = async () => {};
