import * as vscode from 'vscode';

import { Node, NODE } from 'caudex';

import { TAG_RGX } from '../../util/const';
import { getConfigProperty } from '../../config';
import { IndexProvider } from '../sys/IndexProvider';
import { SemTreeProvider } from '../sys/SemTreeProvider';


export class TagLinkProvider implements vscode.DocumentLinkProvider {
  private index: IndexProvider;
  private bonsai: SemTreeProvider;

  constructor(index: IndexProvider, bonsai: SemTreeProvider) {
    this.index = index;
    this.bonsai = bonsai;
  }

  private buildDocLink(fnameText: string, range: vscode.Range): vscode.DocumentLink | undefined {
    if (!getConfigProperty('wikibonsai.tag.enabled', true)) { return; }
    const node: Node | undefined = this.index.find('filename', fnameText);
    if (node === undefined) { return undefined; }
    if ((node.kind !== NODE.KIND.ZOMBIE)) {
      const openWhich: string = getConfigProperty('wikibonsai.tag.open-doc', NODE.TYPE.INDEX);
      if (openWhich === NODE.TYPE.INDEX) {
        if (Object.keys(this.bonsai.petioleMap).includes(fnameText)) {
          const trunkFileName: string = this.bonsai.petioleMap[fnameText];
          const node: Node | undefined = this.index.find('filename', trunkFileName);
          // @ts-expect-error: 'node' is checked above
          const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
          return new vscode.DocumentLink(range, vscUri);
        }
      }
      if (openWhich === NODE.TYPE.ENTRY) {
        const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
        return new vscode.DocumentLink(range, vscUri);
      }
    }
  }

  public async provideDocumentLinks(
    document: vscode.TextDocument,
    // eslint-disable-next-line
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentLink[]> {
    if (!getConfigProperty('wikibonsai.tag.enabled', true)) { return []; }
    const docLinks: vscode.DocumentLink[] = [];
    const docTxt: string = document.getText();
    // 🦨 do-while: https://stackoverflow.com/a/6323598
    let tagMatch;
    do {
      tagMatch = TAG_RGX.exec(docTxt);
      // todo: if no node, try unslugified search
      if (tagMatch) {
        const fnameText: string = tagMatch[1];
        const fnamePosStart: number = tagMatch.index + tagMatch[0].indexOf(tagMatch[1]);
        const fnamePosEnd: number = tagMatch[0].length - tagMatch[0].indexOf(tagMatch[1]);
        // positions
        const range: vscode.Range = new vscode.Range(
          document.positionAt(fnamePosStart),
          document.positionAt(fnamePosStart + fnamePosEnd),
        );
        const docLink: vscode.DocumentLink | undefined = this.buildDocLink(fnameText, range);
        if (docLink !== undefined) { docLinks.push(docLink); }
      }
    } while (tagMatch);
    return docLinks;
  }
}
