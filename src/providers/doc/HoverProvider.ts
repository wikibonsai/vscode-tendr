import * as vscode from 'vscode';

import { Node, NODE } from 'caudex';
import * as wikirefs from 'wikirefs';

import { getConfigProperty } from '../../config';
import { IndexProvider } from '../sys/IndexProvider';


export class WikiRefHoverProvider implements vscode.HoverProvider {
  private index: IndexProvider;

  constructor(index: IndexProvider) {
    this.index = index;
  }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    // eslint-disable-next-line
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    if (!getConfigProperty('tendr.wikiref.hover-preview.enabled', true)) { return; }
    let filename: string | undefined;
    // todo: checkout 'TextLine.text' (see note on 'getWordRangeAtPosition')
    // attr / link
    let wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position, wikirefs.RGX.WIKI.LINK);
    if (wordRange !== undefined) {
      const wikiRefMatch = wikirefs.RGX.WIKI.LINK.exec(document.getText(wordRange));
      if (!wikiRefMatch) { return undefined; }
      filename = wikiRefMatch[2];
    }
    // embed
    wordRange = document.getWordRangeAtPosition(position, wikirefs.RGX.WIKI.EMBED);
    if (wordRange !== undefined) {
      const wikiRefMatch =  wikirefs.RGX.WIKI.EMBED.exec(document.getText(wordRange));
      if (!wikiRefMatch) { return undefined; }
      filename = wikiRefMatch[1];
    }
    // no match
    if (filename === undefined) { return undefined; }
    // continue
    const node: Node | undefined = this.index.find('filename', filename);
    if (node === undefined) { return; }
    if (node.kind === NODE.KIND.ZOMBIE) {
      return new vscode.Hover('click to create new doc', wordRange);
    } else {
      const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
      const docToPreview: vscode.TextDocument = await vscode.workspace.openTextDocument(vscUri);
      return new vscode.Hover(docToPreview.getText(), wordRange);
    }
  }
}
