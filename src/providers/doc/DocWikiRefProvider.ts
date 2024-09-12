import * as vscode from 'vscode';

import { Node, NODE } from 'caudex';
import * as wikirefs from 'wikirefs';

import { getConfigProperty } from '../../config';
import { IndexProvider } from '../sys/IndexProvider';


export class WikiRefLinkProvider implements vscode.DocumentLinkProvider {
  private index: IndexProvider;

  constructor(index: IndexProvider) {
    this.index = index;
  }

  private buildDocLink(fnameText: string, range: vscode.Range): vscode.DocumentLink | undefined {
    if (!getConfigProperty('tendr.wikiref.goto.enabled', true)) { return; }
    let docLink: vscode.DocumentLink;
    // file uri
    const node: Node | undefined = this.index.find('filename', fnameText);
    if (node === undefined) { return undefined; }
    // zombie
    if (node.kind === NODE.KIND.ZOMBIE) {
      docLink = new vscode.DocumentLink(
        range,
        // 🦨
        vscode.Uri.parse('command:tendr.create.file').with({
          query: JSON.stringify({
            filename: fnameText,
          }),
        }),
      );
    // not zombie
    } else {
      const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
      docLink = new vscode.DocumentLink(range, vscUri);
    }
    return docLink;
  }

  public async provideDocumentLinks(
    document: vscode.TextDocument,
    // eslint-disable-next-line
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentLink[]> {
    if (!getConfigProperty('tendr.wikiref.goto.enabled', true)) { return []; }
    const docLinks: vscode.DocumentLink[] = [];
    for (const payload of wikirefs.scan(document.getText())) {
      if (payload.kind === wikirefs.CONST.WIKI.ATTR) {
        // @ts-expect-error: 'WIKIATTR' will ensure 'payload' is the correct result type
        for (const fnamePayload of payload.filenames) {
          const fnameText: string = fnamePayload[0];
          const fnamePos: number = fnamePayload[1];
          // positions
          const range: vscode.Range = new vscode.Range(
            document.positionAt(fnamePos),
            document.positionAt(fnamePos + fnameText.length),
          );
          const docLink: vscode.DocumentLink | undefined = this.buildDocLink(fnameText, range);
          if (docLink !== undefined) { docLinks.push(docLink); }
        }
      }
      if (payload.kind === wikirefs.CONST.WIKI.LINK) {
        // @ts-expect-error: 'WIKILINK' will ensure 'payload' is the correct result type
        const fnameText: string = payload.filename[0];
        // @ts-expect-error: 'WIKILINK' will ensure 'payload' is the correct result type
        const fnamePos: number = payload.filename[1];
        // @ts-expect-error: 'WIKILINK' will ensure 'payload' is the correct result type
        const labelText: string = (payload.label.length === 0) ? '' : payload.label[0];
        const barOffset: number = 1; // '|' char
        const fullOffset: number = (labelText.length === 0) ? fnameText.length : fnameText.length + barOffset + labelText.length;
        // positions
        const range: vscode.Range = new vscode.Range(
          document.positionAt(fnamePos),
          document.positionAt(fnamePos + fullOffset),
        );
        const docLink: vscode.DocumentLink | undefined = this.buildDocLink(fnameText, range);
        if (docLink !== undefined) { docLinks.push(docLink); }
      }
      if (payload.kind === wikirefs.CONST.WIKI.EMBED) {
        // @ts-expect-error: 'WIKIEMBED' will ensure 'payload' is the correct result type
        const fnameText: string = payload.filename[0];
        // @ts-expect-error: 'WIKIEMBED' will ensure 'payload' is the correct result type
        const fnamePos: number = payload.filename[1];
        // positions
        const range: vscode.Range = new vscode.Range(
          document.positionAt(fnamePos),
          document.positionAt(fnamePos + fnameText.length),
        );
        const docLink: vscode.DocumentLink | undefined = this.buildDocLink(fnameText, range);
        if (docLink !== undefined) { docLinks.push(docLink); }
      }
    }
    return docLinks;
  }

  // public resolveDocumentLink(link: vscode.DocumentLink, token: vscode.CancellationToken): Promise<vscode.DocumentLink> {
  // }
}
