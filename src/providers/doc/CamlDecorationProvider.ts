import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import * as caml from 'caml-mkdn';

import logger from '../../util/logger';
import { EXT_MD } from '../../util/const';


export class CamlDecorationProvider {
  // yaml colors:
  // green: mtk6
  // light blue: mkt4
  // dark blue: mtk8
  private decorations: Record<string, vscode.TextEditorDecorationType> = {
    attrKey:  vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiBlue'),
    }),
    attrValNum:  vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiCyan'),
      // color: new vscode.ThemeColor('terminal.ansiBrightBlue'),
      // color: new vscode.ThemeColor('editorBracketHighlight.foreground1'),
    }),
    attrValStr:  vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiBrightCyan'),
      // color: new vscode.ThemeColor('terminal.ansiBrightGreen'),
      // color: new vscode.ThemeColor('editorBracketHighlight.foreground2'),
    }),
  };

  public async updateDecorations(activeEditor: vscode.TextEditor): Promise<void> {
    logger.verbose('CamlDecorationProvider.updateDecorations()...');
    const editors: vscode.TextEditor[] = vscode.window.visibleTextEditors.concat(activeEditor);
    for (const editor of editors) {
      if (Utils.extname(editor.document.uri) !== EXT_MD) { continue; }
      const content = editor.document.getText();
      // init
      const decorations: Record<string, any[]> = {};
      decorations['attrKey'] = [];
      decorations['attrValNum'] = [];
      decorations['attrValStr'] = [];
      const results = caml.scan(content);
      for (const payload of results) {
        let decKey: string | undefined;
        let start, end: number | undefined;
        // key
        // @ts-expect-error: 'payload.key' verifies correct result type
        if (payload.key) {
          decKey = 'attrKey';
          // @ts-expect-error: 'payload.key' verifies correct result type
          start = payload.key[1];
          // @ts-expect-error: 'payload.key' verifies correct result type
          end = payload.key[1] + payload.key[0].length;
        }
        // val ('type' of value)
        // @ts-expect-error: 'payload.val' verifies correct result type
        if (payload.type) {
          // val
          // @ts-expect-error: 'payload.val' verifies correct result type
          if (payload.type !== 'string') {
            decKey = 'attrValNum';
            // @ts-expect-error: 'payload.val' verifies correct result type
            start = payload.val[1];
            // @ts-expect-error: 'payload.val' verifies correct result type
            end = payload.val[1] + payload.val[0].length;
          }
          // @ts-expect-error: 'payload.val' verifies correct result type
          if (payload.type === 'string') {
            decKey = 'attrValStr';
            // @ts-expect-error: 'payload.val' verifies correct result type
            start = payload.val[1];
            // @ts-expect-error: 'payload.val' verifies correct result type
            end = payload.val[1] + payload.val[0].length;
          }
        }
        if (!decKey || (start === undefined) || (end === undefined)) {
          console.warn(`Unknown payload format: ${JSON.stringify(payload)}`);
          return;
        } else {
          decorations[decKey].push(new vscode.Range(
            editor.document.positionAt(start),
            editor.document.positionAt(end),
          ));
        }
      }
      // execute
      for (const [type, decs] of Object.entries(decorations)) {
        editor.setDecorations(this.decorations[type], decs);
      }
    }
  }
}