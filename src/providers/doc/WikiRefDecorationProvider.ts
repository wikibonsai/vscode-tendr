import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import * as wikirefs from 'wikirefs';

import { NODE, Node } from 'caudex';

import logger from '../../util/logger';
import {
  BRACKET,
  EXCLAMATION,
  EXT_MD,
  FALLBACK,
} from '../../util/const';
import { IndexProvider } from '../sys/IndexProvider';
import { TypeProvider } from '../sys/TypeProvider';


export class WikiRefDecorationProvider {
  private decorations: Record<string, vscode.TextEditorDecorationType> = {
    [BRACKET]: vscode.window.createTextEditorDecorationType({
      // matches graph link color
      color: new vscode.ThemeColor('editorLineNumber.foreground'),
    }),
    [EXCLAMATION]: vscode.window.createTextEditorDecorationType({
      // matches graph link color
      color: new vscode.ThemeColor('editorLineNumber.foreground'),
    }),
    [wikirefs.CONST.TYPE.LINK]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiBlue'),
    }),
    [wikirefs.CONST.WIKI.REF]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiGreen'),
    }),
    [NODE.KIND.ZOMBIE]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('descriptionForeground'),
    }),
    [NODE.TYPE.INDEX]: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiYellow'),
    }),
    // [NODE.TYPE.ENTRY]: vscode.window.createTextEditorDecorationType({
    //   color: new vscode.ThemeColor('terminal.ansiBrightGreen'),
    // }),
    // 'fallback' often ends up being valid media for wikiembeds
    fallback: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('terminal.ansiBrightGreen'),
    }),
  };
  public index: IndexProvider;
  public types: TypeProvider;

  constructor(types: TypeProvider, index: IndexProvider) {
    this.types = types;
    this.index = index;
  }

  public async whichDecorator(filename: string): Promise<string> {
    // media embeds
    if (wikirefs.isMedia(filename)) {
      if (Object.keys(this.index.cacheMedia).includes(filename)) {
        return FALLBACK;
      } else {
        return NODE.KIND.ZOMBIE;
      }
    // markdown
    } else {
      const node: Node | undefined = this.index.find('filename', filename);
      if (node) {
        // zombie
        if (node.kind === NODE.KIND.ZOMBIE) {
          return NODE.KIND.ZOMBIE;
        // index
        } else if (node.type === NODE.TYPE.INDEX) {
          return NODE.TYPE.INDEX;
        // todo: dynamic color definition based on types file
        // note: default type should be placed after other valid types --
        // since we want to allow dots that aren't valid extensions to pass through as a markdown wikiref
        // doc/default
        } else if ((node.kind === NODE.KIND.DOC) &&
          (node.type &&
          this.types.typeNames().includes(node.type) || NODE.TYPE.DEFAULT)
        ) {
          return wikirefs.CONST.WIKI.REF;
        }
      }
      // other
      return FALLBACK;
    }
  }

  public async updateDecorations(activeEditor: vscode.TextEditor): Promise<void> {
    logger.verbose('WikiRefDecorationProvider.updateDecorations()...');
    const editors: vscode.TextEditor[] = vscode.window.visibleTextEditors.concat(activeEditor);
    for (const editor of editors) {
      if (Utils.extname(editor.document.uri) !== EXT_MD) { continue; }
      const content = editor.document.getText();
      // init
      const decorations: Record<string, any[]> = {};
      decorations[BRACKET] = [];
      decorations[EXCLAMATION] = [];
      decorations[wikirefs.CONST.WIKI.REF] = [];
      decorations[NODE.KIND.ZOMBIE] = [];
      decorations[NODE.TYPE.INDEX] = [];
      decorations[wikirefs.CONST.TYPE.LINK] = [];
      decorations[FALLBACK] = [];
      // populate
      for (const payload of wikirefs.scan(content)) {
        // @ts-expect-error: 'payload.type' check should take care of this
        if (payload.type && payload.type.length !== 0) {
          // @ts-expect-error: confirmed in if-check
          const typeText: string = payload.type[0];
          // @ts-expect-error: confirmed in if-check
          const typePos: number = payload.type[1];
          decorations[wikirefs.CONST.TYPE.LINK].push(new vscode.Range(
            editor.document.positionAt(typePos),
            editor.document.positionAt(typePos + typeText.length),
          ));
        }
        if (payload.kind === wikirefs.CONST.WIKI.ATTR) {
          // @ts-expect-error: validated via wikirefs.CONST.WIKI.ATTR
          for (const fnamePayload of payload.filenames) {
            const fnameText: string = fnamePayload[0];
            const fnamePos: number = fnamePayload[1];
            const decType = await this.whichDecorator(fnameText);
            decorations[decType].push(new vscode.Range(
              editor.document.positionAt(fnamePos),
              editor.document.positionAt(fnamePos + fnameText.length),
            ));
            // left bracket
            decorations[BRACKET].push(new vscode.Range(
              editor.document.positionAt(fnamePos - 2),
              editor.document.positionAt(fnamePos),
            ));
            // right bracket
            decorations[BRACKET].push(new vscode.Range(
              editor.document.positionAt(fnamePos + fnameText.length),
              editor.document.positionAt(fnamePos + fnameText.length + 2),
            ));
          }
        }
        if (payload.kind === wikirefs.CONST.WIKI.LINK) {
          // @ts-expect-error: validated via wikirefs.CONST.WIKI.LINK
          const fnameText: string = payload.filename[0];
          // @ts-expect-error: validated via wikirefs.CONST.WIKI.LINK
          const fnamePos: number = payload.filename[1];
          // @ts-expect-error: validated via wikirefs.CONST.WIKI.LINK
          const labelText: string = (payload.label.length === 0) ? '' : payload.label[0];
          const barOffset: number = 1; // '|' char
          const fullOffset: number = (labelText.length === 0) ? fnameText.length : fnameText.length + barOffset + labelText.length;
          const decType = await this.whichDecorator(fnameText);
          decorations[decType].push(new vscode.Range(
            editor.document.positionAt(fnamePos),
            editor.document.positionAt(fnamePos + fullOffset),
          ));
          // left bracket
          decorations[BRACKET].push(new vscode.Range(
            editor.document.positionAt(fnamePos - 2),
            editor.document.positionAt(fnamePos),
          ));
          // right bracket
          decorations[BRACKET].push(new vscode.Range(
            editor.document.positionAt(fnamePos + fnameText.length),
            editor.document.positionAt(fnamePos + fnameText.length + 2),
          ));
        }
        if (payload.kind === wikirefs.CONST.WIKI.EMBED) {
          // @ts-expect-error: validated via wikirefs.CONST.WIKI.EMBED
          const fnameText: string = payload.filename[0];
          // @ts-expect-error: validated via wikirefs.CONST.WIKI.EMBED
          const fnamePos: number = payload.filename[1];
          const decType = await this.whichDecorator(fnameText);
          decorations[decType].push(new vscode.Range(
            editor.document.positionAt(fnamePos),
            editor.document.positionAt(fnamePos + fnameText.length),
          ));
          // !
          decorations[EXCLAMATION].push(new vscode.Range(
            editor.document.positionAt(fnamePos - 3),
            editor.document.positionAt(fnamePos - 2),
          ));
          // left bracket
          decorations[BRACKET].push(new vscode.Range(
            editor.document.positionAt(fnamePos - 2),
            editor.document.positionAt(fnamePos),
          ));
          // right bracket
          decorations[BRACKET].push(new vscode.Range(
            editor.document.positionAt(fnamePos + fnameText.length),
            editor.document.positionAt(fnamePos + fnameText.length + 2),
          ));
        }
      }
      // initialize
      for (const [type, decs] of Object.entries(decorations)) {
        editor.setDecorations(this.decorations[type], decs);
      }
    }
  }
}