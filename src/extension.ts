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
import { DanglerTreeDataProvider, ZombieTreeDataProvider } from './providers/views/RelPartTreeViewProvider';
// utils
import logger from './util/logger';
import { getWorkspaceDir } from './util/wrapVSCode';
import { PRUNE, TREE, WATER, ts } from './util/emoji';
import { ATTR_NODETYPE, EXT_MD } from './util/const';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export const activate = async (context: vscode.ExtensionContext) => {
  context.subscriptions.push(logger.logger);
  logger.info('tendr: start activation');
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
  const danglerTreeDataProvider       = new DanglerTreeDataProvider(types, index);
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
  const bonsaiTreeView = vscode.window.createTreeView('tendr.panel.bonsai', {
    treeDataProvider: bonsaiTreeDataProvider,
    // showCollapseAll: true,
  });
  bonsaiTreeView.title = ts.emoji + ' Bonsai';

  const bonsaiFileNames: string[] | undefined = index.filter(ATTR_NODETYPE, NODE.TYPE.INDEX)?.map((node: Node) => node.data.filename + EXT_MD);
  // custom 'in' conditional for 'when' contexts in package.json
  vscode.commands.executeCommand(
    'setContext',
    'tendr.bonsaiTrunkFiles',
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
        if (e.affectsConfiguration('tendr.file.config')) {
          await config.setConfigFileUri();
          config.build();
        }
        if (e.affectsConfiguration('tendr.attrs.engine')) {
          const curEngine: string = getConfigProperty('tendr.attrs.engine', 'caml');
          if (curEngine !== config.garden.attrs) {
            config.updateConfigAttrs(curEngine);
          }
        }
        if (e.affectsConfiguration('tendr.bonsai.root')) {
          const root: string = getConfigProperty('tendr.bonsai.root', 'i.bonsai');
          if (root !== config.garden.root) {
            config.updateConfigRoot(root);
          }
        }
        // doctypes
        if (e.affectsConfiguration('tendr.file.doc-types')) {
          await types.setTypesFileUri();
          types.build();
        }
        // lint
        if (e.affectsConfiguration('tendr.lint.indentKind')) {
          config.lint.indent_kind = getConfigProperty('tendr.lint.indentKind', 'space');
          config.updateConfigLint('indent_kind', getConfigProperty('tendr.lint.indentKind', config.lint.indent_kind));
          bonsai.opts.indentKind = config.lint.indent_kind;
        }
        if (e.affectsConfiguration('tendr.lint.indentSize')) {
          config.lint.indent_size = getConfigProperty('tendr.lint.indentSize', 2);
          config.updateConfigLint('indent_size', getConfigProperty('tendr.lint.indentSize', config.lint.indent_size));
          bonsai.opts.indentSize = config.lint.indent_size;
        }
        if (e.affectsConfiguration('tendr.lint.mkdnBullet')) {
          config.lint.mkdn_bullet = getConfigProperty('tendr.lint.mkdnBullet', true);
          config.updateConfigLint('mkdn_bullet', getConfigProperty('tendr.lint.mkdnBullet', config.lint.mkdn_bullet));
          bonsai.opts.mkdnBullet = config.lint.mkdn_bullet;
        }
        if (e.affectsConfiguration('tendr.lint.wikiLink')) {
          config.lint.wikilink = getConfigProperty('tendr.lint.wikiLink', true);
          config.updateConfigLint('wikilink', getConfigProperty('tendr.lint.wikiLink', config.lint.wikiLink));
          bonsai.opts.wikiLink = config.lint.wikilink;
        }
        // tree species
        if (e.affectsConfiguration('tendr.emoji.tree')) {
          ts.emoji = getConfigProperty('tendr.emoji.tree', TREE.bamboo);
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
      // lint
      vscode.commands.registerCommand('tendr.debug.lint.bonsai', () => {
        if (getConfigProperty('tendr.debug.enabled', true)) {
          bonsai.lint();
        }
      }),
      // debug
      //   dump
      // vscode.commands.registerCommand('tendr.debug.dump.bonsai', () => {
      //   if (getConfigProperty('tendr.debug.enabled', true)) {
      //     index.dumpTree();
      //   }
      // }),
      vscode.commands.registerCommand('tendr.debug.dump.index', () => {
        if (getConfigProperty('tendr.debug.enabled', true)) {
          index.dump();
        }
      }),
      //   print
      vscode.commands.registerCommand('tendr.debug.print.bonsai', () => {
        if (getConfigProperty('tendr.debug.enabled', true)) {
          index.printIndexTree();
          bonsai.print();
        }
      }),
      vscode.commands.registerCommand('tendr.debug.print.index', () => {
        if (getConfigProperty('tendr.debug.enabled', true)) {
          index.printIndex();
        }
      }),
      //   reset
      vscode.commands.registerCommand('tendr.debug.reset.index', () => {
        if (!getConfigProperty('tendr.debug.enabled', true)) {
          vscode.window.showWarningMessage('debug features are disabled, turn them on in vscode\'s tendr settings to enable.');
        } else {
          vscode.window.showInformationMessage('resetting index...');
          index.flushRels();
          () => {
            index.init();
            bonsai.build();
          };
        }
      }),
      // all gui
      vscode.commands.registerCommand('tendr.sync.gui', () => {
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
      vscode.commands.registerCommand('tendr.genID', () => {
        const id = index.genID();
        return id;
      }),
      // bonsai
      vscode.commands.registerCommand('tendr.sync.bonsai', () => {
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
      vscode.commands.registerCommand('tendr.create.file', (payload: any) => {
        return commands.createDoc(payload);
      }),
      vscode.commands.registerCommand('tendr.create.file.bulk', () => {
        return commands.createDocBulk();
      }),
      vscode.commands.registerCommand('tendr.open.file', (uri: vscode.Uri) => {
        commands.openDoc(uri);
      }),
      vscode.commands.registerCommand('tendr.name.file', (payload: any) => {
        return commands.nameFile(payload);
      }),
      // graph
      vscode.commands.registerCommand('tendr.open.graph.tree', () => {
        tree.draw(context);
      }),
      vscode.commands.registerCommand('tendr.open.graph.web', () => {
        web.draw(context);
      }),
      vscode.window.onDidChangeActiveTextEditor((event) => {
        if (event
        && getConfigProperty('tendr.graph.ctrls.follow.enabled', true)
        && (Utils.extname(event.document.uri) === EXT_MD)
        ) {
          const vscUri: vscode.Uri = event.document.uri;
          const uri: string = vscUri.toString();
          tree.postFocusNode(uri);
          web.postFocusNode(uri);
        }
      }),
      vscode.commands.registerCommand('tendr.sync.graph', () => {
        tree.postUpdateData();
        web.postUpdateData();
      }),
      vscode.commands.registerCommand('tendr.toggle.graph.ctrls.dim', (value: string) => {
        updateConfigProperty('tendr.graph.ctrls.dim', value);
      }),
      vscode.commands.registerCommand('tendr.toggle.graph.ctrls.fix', (value: boolean) => {
        updateConfigProperty('tendr.graph.ctrls.fix.enabled', value);
      }),
      vscode.commands.registerCommand('tendr.toggle.graph.ctrls.follow', (value: boolean) => {
        updateConfigProperty('tendr.graph.ctrls.follow.enabled', value);
      }),
      vscode.commands.registerCommand('tendr.toggle.graph.ctrls.sync', (value: boolean) => {
        updateConfigProperty('tendr.graph.ctrls.autosync.enabled', value);
      }),
      // treeview panels
      // bonsai
      bonsaiTreeView, // initialized above
      vscode.commands.registerCommand('tendr.refresh.panel.bonsai', () => {
        if (getConfigProperty('tendr.panel.bonsai.enabled', true)) {
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
      //   if (event && getConfigProperty('tendr.panel.bonsai.follow.enabled', true)) {
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
      vscode.window.createTreeView('tendr.panel.ancestors', {
        treeDataProvider: ancestorsTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('tendr.refresh.panel.ancestors', () => {
        if (getConfigProperty('tendr.panel.ancestors.enabled', true)) {
          ancestorsTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('tendr.panel.ancestors.enabled', true)) {
          ancestorsTreeDataProvider.refresh();
        }
      }),
      // children
      vscode.window.createTreeView('tendr.panel.children', {
        treeDataProvider: childrenTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('tendr.refresh.panel.children', () => {
        if (getConfigProperty('tendr.panel.children.enabled', true)) {
          childrenTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('tendr.panel.children.enabled', true)) {
          childrenTreeDataProvider.refresh();
        }
      }),
      // forerefs
      vscode.window.createTreeView('tendr.panel.forerefs', {
        treeDataProvider: foreRefsTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('tendr.refresh.panel.forerefs', () => {
        if (getConfigProperty('tendr.panel.forerefs.enabled', true)) {
          foreRefsTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('tendr.panel.forerefs.enabled', true)) {
          foreRefsTreeDataProvider.refresh();
        }
      }),
      // backrefs
      vscode.window.createTreeView('tendr.panel.backrefs', {
        treeDataProvider: backRefsTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('tendr.refresh.panel.backrefs', () => {
        if (getConfigProperty('tendr.panel.backrefs.enabled', true)) {
          backRefsTreeDataProvider.refresh();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (getConfigProperty('tendr.panel.backrefs.enabled', true)) {
          backRefsTreeDataProvider.refresh();
        }
      }),
      // dangling
      vscode.window.createTreeView('tendr.panel.danglers', {
        treeDataProvider: danglerTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('tendr.refresh.panel.danglers', () => {
        if (getConfigProperty('tendr.panel.danglers.enabled', true)) {
          danglerTreeDataProvider.refresh();
        }
      }),
      // zombies
      vscode.window.createTreeView('tendr.panel.zombies', {
        treeDataProvider: zombieTreeDataProvider,
        // showCollapseAll: true,
      }),
      vscode.commands.registerCommand('tendr.refresh.panel.zombies', () => {
        if (getConfigProperty('tendr.panel.zombies.enabled', true)) {
          zombieTreeDataProvider.refresh();
        }
      }),
      // commands for zombies in all treeview panels (and quickpick items, etc.)
      vscode.commands.registerCommand('tendr.resurrect', (treeItem: NoDocTreeItem) => {
        treeItem.createDoc();
      }),
      vscode.commands.registerCommand('tendr.resurrect.tmpl', (treeItem: NoDocTreeItem) => {
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
      vscode.commands.registerCommand('tendr.sync.wikirefs', (oldFilename: string, newFilename: string) => {
        return commands.syncWikiRefs(oldFilename, newFilename);
      }),
      vscode.commands.registerCommand('tendr.sync.reftypes', (oldRefType: string, newRefType: string) => {
        return commands.syncRefTypes(oldRefType, newRefType);
      }),
      // syntax highlights (:caml:: + #tags + [[wikirefs]])
      vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
        if (getConfigProperty('tendr.syntax-highlight.enabled', true)
        && editor
        && vscode.window.activeTextEditor
        ) {
          vscode.commands.executeCommand('tendr.vscode.executeDecorationProvider', editor);
        }
      }),
      // only update decorations when changes are happening in the active editor
      vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
        if (getConfigProperty('tendr.syntax-highlight.enabled', true)
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
          vscode.commands.executeCommand('tendr.vscode.executeDecorationProvider', vscode.window.activeTextEditor);
        }
      }),
      // wizard
      vscode.commands.registerCommand('tendr.open.wizard', () => {
        wizard.open();
      }),
      // vscode 'override'
      vscode.commands.registerCommand('tendr.vscode.executeDecorationProvider', (editor: vscode.TextEditor) => {
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
    vscode.commands.executeCommand('tendr.vscode.executeDecorationProvider', vscode.window.activeTextEditor);
  }, 1000);

  vscode.window.showInformationMessage(
    ts.emoji + ' ' +
    'tendr ready for tending' + ' ' +
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
