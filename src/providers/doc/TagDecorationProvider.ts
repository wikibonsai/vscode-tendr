import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import * as wikirefs from 'wikirefs';
import { NODE, Node } from 'caudex';

import logger from '../../util/logger';
import {
  EXT_MD,
  TAG_RGX,
} from '../../util/const';

import { IndexProvider } from '../sys/IndexProvider';


export class TagDecorationProvider {
  private decorations: Record<string, vscode.TextEditorDecorationType> = {
    [wikirefs.CONST.WIKI.REF]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiGreen'),
    }),
    [NODE.KIND.ZOMBIE]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('descriptionForeground'),
    }),
    [NODE.TYPE.INDEX]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiYellow'),
    }),
  };
  public index: IndexProvider;

  constructor(index: IndexProvider) {
    this.index = index;
  }

  public async updateDecorations(activeEditor: vscode.TextEditor): Promise<void> {
    logger.verbose('TagDecorationProvider.updateDecorations()...');
    const editors: vscode.TextEditor[] = vscode.window.visibleTextEditors.concat(activeEditor);
    for (const editor of editors) {
      if (Utils.extname(editor.document.uri) !== EXT_MD) { continue; }
      const content = editor.document.getText();
      // init
      const decorations: Record<string, any[]> = {};
      decorations[wikirefs.CONST.WIKI.REF] = [];
      decorations[NODE.KIND.ZOMBIE] = [];
      decorations[NODE.TYPE.INDEX] = [];
      // 🦨 do-while: https://stackoverflow.com/a/6323598
      let tagMatch;
      do {
        tagMatch = TAG_RGX.exec(content);
        if (tagMatch) {
          const fnameText: string = tagMatch[1];
          const node: Node | undefined = this.index.find('filename', fnameText);
          // todo: if no node, try unslugified search
          if (node && (node.type === NODE.TYPE.INDEX)) {
            decorations[NODE.TYPE.INDEX].push(new vscode.Range(
              editor.document.positionAt(tagMatch.index),
              editor.document.positionAt(tagMatch.index + tagMatch[0].length),
            ));
          } else if (node && (node.kind !== NODE.KIND.ZOMBIE)) {
            decorations[wikirefs.CONST.WIKI.REF].push(new vscode.Range(
              editor.document.positionAt(tagMatch.index),
              editor.document.positionAt(tagMatch.index + tagMatch[0].length),
            ));
          } else {
            decorations[NODE.KIND.ZOMBIE].push(new vscode.Range(
              editor.document.positionAt(tagMatch.index),
              editor.document.positionAt(tagMatch.index + tagMatch[0].length),
            ));
          }
        }
      } while (tagMatch);
      // initialize
      for (const [type, decs] of Object.entries(decorations)) {
        editor.setDecorations(this.decorations[type], decs);
      }
    }
  }
}