import * as vscode from 'vscode';

import type { SemTree, SemTreeOpts, TreeNode } from 'semtree';
import * as semtree from 'semtree';

import { NODE, QUERY_TYPE, Node } from 'caudex';

import { getConfigProperty } from '../../config';
import logger from '../../util/logger';
import { ATTR_NODETYPE, DEFAULT_DOCTYPE_FILE } from '../../util/const';
import { getFileContent } from '../../util/wrapVSCode';

import { AttributesProvider } from './AttributesProvider';
import { IndexProvider } from './IndexProvider';


export class SemTreeProvider {
  // (super) public petioleMap: Record<string, string>  = {};
  private attrs: AttributesProvider;
  private index: IndexProvider;
  private tree: SemTree | undefined;
  private opts: SemTreeOpts;

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

  constructor(attrs: AttributesProvider, index: IndexProvider) {
    logger.debug('creating SemTreeProvider...');
    this.opts = {
      strict: false,
      setRoot: function (fname: string) {
        const node: Node | undefined = index.find('filename', fname);
        if (!node) {
          logger.warn(`No node with 'filename' "${fname}" in index`);
          return;
        }
        index.setRoot(node.id);
      },
      graft: function (fname: string, ancestryFnames: string[]) {
        // child node
        let childNode: Node | undefined = index.find('filename', fname);
        if (!childNode) { childNode = index.add(fname); }
        if (!childNode) { logger.warn(`encountered error with childNode with fname "${fname}" -- abort graft`); return; }
        // parent node
        const parentFname: string = ancestryFnames[ancestryFnames.length - 1];
        let parentNode: Node | undefined = index.find('filename', parentFname);
        if (!parentNode) { parentNode = index.add(parentFname); }
        if (!parentNode) { logger.warn(`encountered error with parentNode with fname "${parentFname}" -- abortin graft`); return; }
        // graft
        const grafted: boolean = index.graft(parentNode.id, childNode.id);
        if (!grafted) { logger.warn(`grafting "${fname}" to "${parentFname}" failed`); return; }
      }
    };
    this.attrs = attrs;
    this.index = index;
    logger.debug('...SemTreeProvider created');
  }

  public async build(): Promise<boolean> {
    logger.debug('SemTreeProvider.build() -- start...');
    // { filename: content } hash
    const bonsaiText: Record<string, string> = {};
    // root
    const rootBonsaiFilename: string | undefined = getConfigProperty('wikibonsai.bonsai.root', 'i.bonsai');
    if (!rootBonsaiFilename) {
      vscode.window.showErrorMessage(`no root filename given in ${getConfigProperty('wikibonsai.file.doc-types', DEFAULT_DOCTYPE_FILE)} file`);
      return false;
    }
    // index/trunk
    const indexNodes: Node[] | undefined = this.index.filter(ATTR_NODETYPE, NODE.TYPE.INDEX);
    if (!indexNodes || (indexNodes.length === 0)) {
      vscode.window.showErrorMessage('unable to find index nodes');
      return false;
    }
    for (const node of indexNodes) {
      const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
      const document = await vscode.workspace.openTextDocument(vscUri);
      const attrPayload: any = await this.attrs.load(document.getText());
      const cleanContent: string = attrPayload.content.replace(/^\n*/, '');
      bonsaiText[node.data.filename] = cleanContent;
    }
    const buildRes: SemTree | string = semtree.parse(bonsaiText, rootBonsaiFilename, this.opts);
    if (typeof buildRes === 'string') {
      vscode.window.showWarningMessage('bonsai did not build:\n' + this.tree);
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
        + 'nodes: ' + JSON.stringify(this.tree)
        + '\n---\n'
      );
    }
    logger.debug('SemTreeProvider.build() -- ...finished');
    return true;
  }

  // todo: recurse through and
  //  - add linked file descendents
  //  - remove linked file descendents 
  public async updateSubTree(subroot: string, content: string): Promise<boolean> {
    logger.debug('SemTreeProvider.updateSubTree() -- start...');
    if ((this.tree === undefined) || (typeof this.tree === 'string')) {
      vscode.window.showErrorMessage('SemTreeProvider.updateSubTree() -- tree is a string -- aborting');
      return false;
    }
    try {
      ////
      // build linked file content from index docs
      const linkedIndexFnames: string[] = [];
      let updatedContent: Record<string, string> | undefined = {};
      updatedContent[subroot] = content;
      updatedContent = await this.getLinkedFileContent(subroot, updatedContent, linkedIndexFnames);
      if (!updatedContent) {
        logger.warn(`SemTreeProvider.updateSubTree() -- failed to get linked file content for subroot "${subroot}"`);
        return false;
      }
      ////
      // update tree
      const updateResult: TreeNode[] | string = semtree.updateSubTree(this.tree, updatedContent, subroot);
      if ((updateResult === undefined) || (typeof updateResult === 'string')) {
        const errorMsg: string = updateResult;
        logger.warn('failed to update tree because: ', errorMsg);
        return false;
      }
      ////
      // replace filenames with node ids in updateResult
      const transposedResult: { id: string, ancestors: string[], children: string[] }[] = this.transpose(updateResult);
      const subrootNode: Node | undefined = this.index.find('filename', subroot);
      if (!subrootNode) {
        logger.warn(`subroot node with filename "${subroot}" not found in index`);
        return false;
      }
      ////
      // update index
      const transplanted: boolean = this.index.transplant(subrootNode.id, transposedResult);
      if (!transplanted) {
        logger.warn('SemTreeProvider.updateSubTree() -- failed to transplant tree');
        return false;
      }
      logger.debug('SemTreeProvider.updateSubTree() -- finished successfully');
      return true;
    } catch (error: any) {
      logger.error(`Error updating subtree with subroot "${subroot}": ${error.message}`);
      return false;
    }
  }

  private async getLinkedFileContent(
    indexFname: string,
    content: Record<string, string>,
    indexFnames: string[] = [],
  ): Promise<Record<string, string> | undefined> {
    if (indexFnames.includes(indexFname)) {
      logger.warn(`SemTreeProvider.getLinkedFileContent(): infinite loop detected for filename "${indexFname}"`);
      return;
    } else {
      indexFnames.push(indexFname);
    }
    // loop through each content page
    // split content by newlines
    for (const entry of content[indexFname].split('\n')) {
      const maybeBranch: string = entry.replace(/- \[\[/, '').replace(/\]\]/, '');
      const node: Node | undefined = this.index.find('filename', maybeBranch);
      if (node && (node.type === NODE.TYPE.INDEX)) {
        const branchUri: string | undefined = node.data.uri;
        if (branchUri !== undefined) {
          const branchContent: string | undefined = await getFileContent(branchUri);
          if (branchContent !== undefined) {
            const attrPayload: any = await this.attrs.load(branchContent);
            const cleanContent: string = attrPayload.content.replace(/^\n*/, '');
            content[maybeBranch] = cleanContent;
            this.getLinkedFileContent(maybeBranch, content, indexFnames);
          }
        }
      }
    }
    return content;
  }

  private transpose(updateResult: any[]): any[] {
    const transposedResult: any[] = [];
    for (const node of updateResult) {
      if (node.text && node.ancestors && node.children) {
        const newNode: any = {
          id: this.index.find('filename', node.text)?.id,
          ancestors: node.ancestors
            .map((anode: string) => this.index.find('filename', anode)?.id)
            .filter((id: string | undefined): id is string => id !== undefined),
          children: node.children
            .map((cnode: string) => this.index.find('filename', cnode)?.id)
            .filter((id: string | undefined): id is string => id !== undefined),
        };
        if (newNode.id && newNode.ancestors && newNode.children) {
          transposedResult.push(newNode);
        } else {
          logger.warn(`SemTreeProvider.updateSubTree() -- failed to find node with filename "${node.text}"`);
        }
      }
    }
    return transposedResult;
  }

  public print(): void {
    if (this.tree === undefined) {
      logger.warn('SemTreeProvider.print() -- tree is undefined -- aborting');
      return;
    }
    const treeText: string | undefined = semtree.print(this.tree);
    if (treeText === undefined) {
      logger.warn('SemTreeProvider.print() -- failed to print tree');
      return;
    }
    logger.debug('SemTreeProvider.print() -- tree:\n\n' + treeText);
  }
}