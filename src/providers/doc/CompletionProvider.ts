import * as vscode from 'vscode';

import { QUERY_TYPE } from 'caudex';

import { IndexProvider } from '../sys/IndexProvider';
import { WikiRefCompletionItem } from '../../items/CompletionItem';
import { getConfigProperty } from '../../config';


export class WikiRefCompletionProvider implements vscode.CompletionItemProvider {
  public triggerChar: string = '[';
  private index: IndexProvider;

  constructor(index: IndexProvider) {
    this.index = index;
  }

  public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    if (!getConfigProperty('tendr.wikiref.completion.enabled', true)) { return []; }
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const isWikiRef = linePrefix.match(/\[\[/);
    if (!isWikiRef) { return []; }
    // trigger completion for real
    const completionItems: WikiRefCompletionItem[] = [];
    for (const node of this.index.all(QUERY_TYPE.NODE)) {
      // skip zombies
      if (!node.data.filename) { continue; }
      const cItem = new WikiRefCompletionItem(
        node.data.filename,
        vscode.CompletionItemKind.File,
        node.id,
      );
      completionItems.push(cItem);
    }
    return completionItems;
  }

  public async resolveCompletionItem(item: WikiRefCompletionItem): Promise<vscode.CompletionItem> {
    const ancestorTitles: string[] | undefined = this.index.ancestors(item.nodeID, 'title');
    if (ancestorTitles) {
      item.detail = 'ancestry: \n';
      for (const [i, a] of ancestorTitles.entries()) {
        if (i === 0) {
          item.detail += a;
        } else {
          item.detail += ' > ' + a;
        }
      }
    }
    return item;
  }
}

export class RefTypeCompletionProvider implements vscode.CompletionItemProvider {
  public triggerChar: string = ' ';
  private index: IndexProvider;

  constructor(index: IndexProvider) {
    this.index = index;
  }

  public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    if (!getConfigProperty('tendr.wikiref.type.completion.enabled', true)) { return []; }
    const text = document.lineAt(position).text;
    const linePrefix = text.slice(0, position.character);
    // todo: this will only work for prefixed, padded/pretty styled caml attrs...
    const isRefType = linePrefix.match(/^: $/);
    if (!isRefType) { return []; }
    // trigger completion for real
    const completionItems: vscode.CompletionItem[] = [];
    for (const reftype of this.index.reftypes()) {
      const cItem = new vscode.CompletionItem(
        reftype,
        vscode.CompletionItemKind.Keyword
      );
      completionItems.push(cItem);
    }
    return completionItems;
  }

  public async resolveCompletionItem(item: vscode.CompletionItem): Promise<vscode.CompletionItem> {
    return item;
  }
}