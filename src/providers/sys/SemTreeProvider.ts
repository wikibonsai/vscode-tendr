import * as vscode from 'vscode';

import type { SemTree, SemTreeOpts, TreeNode } from 'semtree';
import * as semtree from 'semtree';

import { NODE, Node } from 'caudex';

import { getConfigProperty } from '../../config';
import logger from '../../util/logger';
import { ATTR_NODETYPE, DEFAULT_DOCTYPE_FILE } from '../../util/const';
import { getFileContent } from '../../util/wrapVSCode';
import { ts } from '../../util/emoji';

import { AttributesProvider } from './AttributesProvider';
import { IndexProvider } from './IndexProvider';


export class SemTreeProvider {
  private attrs: AttributesProvider;
  private index: IndexProvider;
  private tree: SemTree | undefined;
  public opts: SemTreeOpts;
  // 
  protected panel: vscode.WebviewPanel | undefined = undefined;
  protected disposables: vscode.Disposable[] = [];

  constructor(attrs: AttributesProvider, index: IndexProvider) {
    logger.debug('creating SemTreeProvider...');
    this.opts = {
      indentKind: getConfigProperty('wikibonsai.lint.indentKind', 'space'),
      indentSize: getConfigProperty('wikibonsai.lint.indentSize', 2),
      mkdnBullet: getConfigProperty('wikibonsai.lint.mkdnBullet', true),
      wikiLink: getConfigProperty('wikibonsai.lint.wikiLink', true),
      setRoot: function (fname: string) {
        const node: Node | undefined = index.find('filename', fname);
        if (!node) {
          logger.warn(`No node with 'filename' "${fname}" in index`);
          return;
        }
        index.setRoot(node.id);
      },
      graft: function (parentName: string, childName: string) {
        // child node
        let childNode: Node | undefined = index.find('filename', childName);
        if (!childNode) { childNode = index.add(childName); }
        if (!childNode) { logger.warn(`encountered error with childNode with fname "${childName}" -- abort graft`); return; }
        // parent node
        let parentNode: Node | undefined = index.find('filename', parentName);
        if (!parentNode) { parentNode = index.add(parentName); }
        if (!parentNode) { logger.warn(`encountered error with parentNode with fname "${parentName}" -- abortin graft`); return; }
        // graft
        const grafted: boolean = index.graft(parentNode.id, childNode.id, true);
        if (!grafted) { logger.warn(`grafting "${childName}" to "${parentName}" failed`); return; }
      },
      prune: function (parentName: string, childName: string) {
        // child node
        let childNode: Node | undefined = index.find('filename', childName);
        if (!childNode) { childNode = index.add(childName); }
        if (!childNode) { logger.warn(`encountered error with childNode with fname "${childName}" -- abort graft`); return; }
        // parent node
        let parentNode: Node | undefined = index.find('filename', parentName);
        if (!parentNode) { parentNode = index.add(parentName); }
        if (!parentNode) { logger.warn(`encountered error with parentNode with fname "${parentName}" -- abortin graft`); return; }
        // graft
        const pruned: boolean = index.prune(parentNode.id, childNode.id, true);
        if (!pruned) { logger.warn(`pruning "${childName}" to "${parentName}" failed`); return; }
      }
    };
    this.attrs = attrs;
    this.index = index;
    logger.debug('...SemTreeProvider created');
  }

  // tree access

  public petiole(fname: string): string | undefined {
    if (this.tree === undefined) {
      logger.warn('SemTreeProvider.petioleMap() -- tree is undefined -- aborting');
      return;
    }
    return this.tree.petioleMap[fname];
  }

  public hasPetiole(fname: string): boolean {
    if (this.tree === undefined) {
      logger.warn('SemTreeProvider.petioleMap() -- tree is undefined -- aborting');
      return false;
    }
    return Object.keys(this.tree.petioleMap).includes(fname);
  }

  public isTrunk(fname: string): boolean | undefined {
    if (this.tree === undefined) {
      logger.warn('SemTreeProvider.petioleMap() -- tree is undefined -- aborting');
      return;
    }
    return this.tree.trunk.includes(fname);
  }

  // tree-building

  public async build(): Promise<boolean> {
    logger.debug('SemTreeProvider.build() -- start...');
    try {
      // { filename: content } hash
      const bonsaiText: Record<string, string> = await this.getTreeContent();
      // root
      const rootBonsaiFilename: string | undefined = getConfigProperty('wikibonsai.bonsai.root', 'i.bonsai');
      if (!rootBonsaiFilename) {
        vscode.window.showErrorMessage(`no root filename given in ${getConfigProperty('wikibonsai.file.doc-types', DEFAULT_DOCTYPE_FILE)} file`);
        return false;
      }
      const buildRes: SemTree | string = semtree.create(rootBonsaiFilename, bonsaiText, this.opts);
      if (typeof buildRes === 'string') {
        vscode.window.showWarningMessage('bonsai did not build:\n\n' + buildRes);
      } else {
        this.tree = buildRes;
        logger.debug('SemTreeProvider.build() -- \n'
          + '\n---\n'
          + 'root: ' + this.tree.root
          + '\n---\n'
          + 'trunk: ' + this.tree.trunk
          + '\n---\n'
          + 'petioleMap: ' + JSON.stringify(this.tree.petioleMap)
          + '\n---\n'
          + 'orphans: ' + this.tree.orphans
          + '\n---\n'
          + 'nodes: ' + JSON.stringify(this.tree.nodes)
          + '\n---\n'
        );
      }
    } catch (error: any) {
      logger.error(`SemTreeProvider.build() -- \n\n${error}`);
      return false;
    }
    logger.debug('SemTreeProvider.build() -- ...finished');
    return true;
  }

  // todo: recurse through and
  //  - add linked file descendents
  //  - remove linked file descendents
  public async update(subroot: string, content: string): Promise<boolean> {
    logger.debug('SemTreeProvider.update() -- start...');
    // do not update if tree is undefined or an error string
    if ((this.tree === undefined) || (typeof this.tree === 'string')) {
      logger.warn('SemTreeProvider.update() -- tree is a string -- aborting update');
      return false;
    }
    // do not update index file if it's not connected to the tree
    if (this.tree.orphans.includes(subroot)) {
      logger.warn(`SemTreeProvider.update() -- subroot "${subroot}" is an orphan -- aborting update`);
      return false;
    }
    try {
      ////
      // build linked file content from index docs
      let updatedContent: Record<string, string> | undefined = { [subroot]: content };
      updatedContent = await this.getLinkedFileContent(subroot, updatedContent);
      if (!updatedContent) {
        logger.warn(`SemTreeProvider.update() -- failed to get linked file content for subroot "${subroot}"`);
        return false;
      }
      ////
      // update tree
      const updateResult: TreeNode[] | string = semtree.update(this.tree, subroot, updatedContent, this.opts);
      if ((updateResult === undefined) || (typeof updateResult === 'string')) {
        const errorMsg: string = updateResult;
        logger.warn('failed to update tree: \n\n', errorMsg);
        return false;
      }
      // vscode.commands.executeCommand('wikibonsai.refresh.panel.bonsai');
      logger.debug('SemTreeProvider.update() -- finished successfully');
      return true;
    } catch (error: any) {
      logger.error(`SemTreeProvider.update() -- error updating subtree with subroot "${subroot}": ${error.message}`);
      return false;
    }
  }

  public async lint(): Promise<void> {
    try {
      const bonsaiText: Record<string, string> = await this.getTreeContent();
      const lintResults: { warn: string; error: string; } | undefined | void = semtree.lint(bonsaiText, this.opts);
      // Create and show a new webview
      this.panel = vscode.window.createWebviewPanel(
        'lintResults', // Identifies the type of the webview. Used internally
        'Lint Results', // Title of the panel displayed to the user
        vscode.ViewColumn.Beside, // Editor column to show the new webview panel in
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
      // Set the HTML content
      this.panel.webview.html = this.getLintResultsHtml(lintResults);
      // Handle closing of the panel
      this.panel.onDidDispose(() =>
        this.dispose(), null, this.disposables
      );
    } catch (error) {
      console.error('Error displaying lint results:', error);
      vscode.window.showErrorMessage('Failed to display lint results.');
    }
  }

  public print(): void {
    if (this.tree === undefined) {
      logger.warn('SemTreeProvider.print() -- tree is undefined -- aborting');
      return;
    }
    // const treeText: string | undefined = this.index.printTree('filename');
    const treeText: string | undefined = semtree.print(this.tree);
    if (treeText === undefined) {
      logger.warn('SemTreeProvider.print() -- failed to print tree');
      return;
    }
    logger.debug('SemTreeProvider.print() -- tree:\n\n' + treeText);
  }

  // util

  private async getTreeContent(): Promise<Record<string, string>> {
    // { filename: content } hash
    const bonsaiText: Record<string, string> = {};
    // index/trunk
    const indexNodes: Node[] | undefined = this.index.filter(ATTR_NODETYPE, NODE.TYPE.INDEX);
    if (!indexNodes || (indexNodes.length === 0)) {
      vscode.window.showErrorMessage('unable to find index nodes');
      return {};
    }
    for (const node of indexNodes) {
      const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
      const document = await vscode.workspace.openTextDocument(vscUri);
      const attrPayload: any = await this.attrs.load(document.getText());
      // strip preceding newlines
      const cleanContent: string = attrPayload.content.replace(/^\n*/, '');
      bonsaiText[node.data.filename] = cleanContent;
    }
    return bonsaiText;
  }

  private async getLinkedFileContent(
    indexFname: string,
    content: Record<string, string>,
    indexFnames: string[] = [],
  ): Promise<Record<string, string> | undefined> {
    if (indexFnames.includes(indexFname)) {
      logger.warn(`SemTreeProvider.getLinkedFileContent(): infinite loop detected for filename "${indexFname}"`);
      return undefined;
    }
    indexFnames.push(indexFname);

    const entries = content[indexFname].split('\n');
    for (const entry of entries) {
      const mkdn: boolean = /[-+*] /.test(entry);
      const wiki: boolean = /\[\[.*\]\]/.test(entry);
      const maybeBranch: string = semtree.rawText(entry.trim(), { hasBullets: mkdn, hasWiki: wiki });
      const node: Node | undefined = this.index.find('filename', maybeBranch);
      if (node && (node.type === NODE.TYPE.INDEX)) {
        const branchUri: string | undefined = node.data.uri;
        if (branchUri !== undefined) {
          try {
            const branchContent = await getFileContent(branchUri);
            if (branchContent !== undefined) {
              const attrPayload = await this.attrs.load(branchContent);
              if (attrPayload) {
                const cleanContent: string = attrPayload.content.replace(/^\n*/, '');
                content[maybeBranch] = cleanContent;
                await this.getLinkedFileContent(maybeBranch, content, indexFnames);
              }
            }
          } catch (error) {
            logger.warn(`Error processing branch content for "${branchUri}": ${error}`);
            // Handle the error appropriately
          }
        }
      }
    }
    return content;
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

  private getLintResultsHtml(results: { warn: string; error: string; } | undefined | void): string {
    let content: string = '<h1>Lint Results</h1>';
    if (!results) {
      return content += '<h2>✅ All good ' + ts.emoji + '</h2>';
    } else {
      if (results.warn) {
        content += '<h2 class="warn">Warnings</h2><pre>' + this.escapeHtml(results.warn) + '</pre>';
      }
      if (results.error) {
        content += '<h2 class="error">Errors</h2><pre>' + this.escapeHtml(results.error) + '</pre>';
      }
    }
    return this.getHtmlTemplate(content);
  }

  private getHtmlTemplate(content: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lint Results</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #fff; }
          .error { color: #a65050; }
          .warn { color: #bfb760; }
          pre { background-color: #24292f; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}