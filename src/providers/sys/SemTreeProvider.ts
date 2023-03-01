import * as vscode from 'vscode';

import { SemTree } from 'semtree';

import { NODE, Node } from 'caudex';

import { getConfigProperty } from '../../config';
import logger from '../../util/logger';
import { ATTR_NODETYPE, DEFAULT_DOCTYPE_FILE } from '../../util/const';

import { AttributesProvider } from './AttributesProvider';
import { IndexProvider } from './IndexProvider';


export class SemTreeProvider extends SemTree {
  // (super) public petioleMap: Record<string, string>  = {};
  private attrs: AttributesProvider;
  private index: IndexProvider;

  constructor(attrs: AttributesProvider, index: IndexProvider) {
    logger.debug('creating SemTreeProvider...');
    super({
      nanoid: {
        alphabet: getConfigProperty('wikibonsai.file.name.opts.id.alpha', 'abcdefghijklmnopqrstuvwxyz0123456789'),
        size: getConfigProperty('wikibonsai.file.name.opts.id.size', 6),
      },
      suffix: 'none',
      setRoot: function (fname: string) {
        const node = index.find('filename', fname);
        if (!node) {
          logger.warn(`No node with 'filename' "${fname}" in index`);
          return;
        }
        index.setRoot(node.id);
      },
      graft: function (fname: string, ancestryFnames: string[]) {
        let node = index.find('filename', fname);
        if (!node) { node = index.add(fname); }
        if (!node) { logger.warn(`grafting ${fname} to ${ancestryFnames} failed`); return; }
        const grafted: boolean = index.graft(node.id, ancestryFnames, 'filename');
        if (!grafted) { logger.warn(`grafting ${fname} to ${ancestryFnames} failed`); return; }
      }
    });
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
    const res: any = super.parse(bonsaiText, rootBonsaiFilename);
    if (typeof res === 'string') {
      vscode.window.showWarningMessage('bonsai did not build -- please remove duplicates:\n' + res);
    } else {
      logger.debug('SemTreeProvider.build() -- \n'
        + 'result: ' + JSON.stringify(res) + '\n'
        + 'root: ' + this.root + '\n'
        + 'duplicates: ' + this.duplicates
      );
    }
    logger.debug('SemTreeProvider.build() -- ...finished');
    return true;
  }

  public has(filename: string): boolean {
    return Object.keys(this.petioleMap).includes(filename);
  }
}
