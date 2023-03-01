import * as vscode from 'vscode';

import { NODE } from 'caudex';
import * as wikirefs from 'wikirefs';

import { EXT_MD } from '../../util/const';
import logger from '../../util/logger';
import { getConfigProperty } from '../../config';
import { IndexProvider } from '../sys/IndexProvider';


export class RenameProvider implements vscode.RenameProvider {
  private index: IndexProvider;

  constructor(index: IndexProvider) {
    this.index = index;
  }

  // todo:
  // - validate filename (valid chars + not a duplicate filename)
  // - #tag handling

  public async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    // eslint-disable-next-line
    token: vscode.CancellationToken,
  ): Promise<vscode.WorkspaceEdit | undefined> {
    if (!getConfigProperty('wikibonsai.wikiref.refactor.enabled', true)) { return; }
    // position must be on a word
    const fileNameRange = document.getWordRangeAtPosition(position, wikirefs.RGX.GET.FILENAME);
    const refTypeRange = document.getWordRangeAtPosition(position, wikirefs.RGX.GET.REFTYPE);
    if (!fileNameRange && !refTypeRange) {
      logger.warn('RenameProvider.provideRenameEdits() -- no renamable symbol exists at current position');
    }
    // filename
    if (fileNameRange) {
      // extract filename from wikiref
      const fileNameMatch = wikirefs.RGX.GET.FILENAME.exec(document.getText(fileNameRange));
      if (!fileNameMatch) {
        logger.warn('RenameProvider.provideRenameEdits() -- wikirefs regex error');
        return undefined;
      }
      // file's node must exist (in index)
      const filename: string = fileNameMatch[1];
      const node = this.index.find('filename', filename);
      if (!node) {
        logger.warn(`RenameProvider.provideRenameEdits() -- index node does not exist for '${filename}'`);
        return undefined;
      }
      // zombie case -- there's no file to rename; so just rename wikirefs
      if (node.kind === NODE.KIND.ZOMBIE) {
        const success: boolean = this.index.edit(node.id, 'filename', newName);
        if (!success) { logger.error(`RenameProvider.provideRenameEdits() -- unable to update filename for zombie node from '${filename}' to ${newName}`); }
        await vscode.commands.executeCommand('wikibonsai.sync.wikirefs', filename, newName);
        return undefined;
      // default case -- rename file; 'FileWatcherProvider' will handle wikirefs sync and node update
      } else {
        // rename file
        const oldUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
        const newUriStr = oldUri.toString().replace(
          /(.*)\/.*(\.md$)/i,
          '$1/' + newName + EXT_MD,
        );
        const newUri: vscode.Uri = vscode.Uri.parse(newUriStr);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.renameFile(oldUri, newUri);
        return workspaceEdit;
      }
    }
    // reftype
    if (refTypeRange) {
      // extract reftype from wikiref
      const refTypeMatch = wikirefs.RGX.GET.REFTYPE.exec(document.getText(refTypeRange));
      if (!refTypeMatch) {
        logger.warn('RenameProvider.provideRenameEdits() -- wikirefs regex error');
        return undefined;
      }
      const reftype: string = (refTypeMatch && refTypeMatch[1]) ? refTypeMatch[1] : refTypeMatch[2];
      await vscode.commands.executeCommand('wikibonsai.sync.reftypes', reftype.trim(), newName);
      return undefined;
    }
  }

  public async prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    // eslint-disable-next-line
    token: vscode.CancellationToken,
  ): Promise<vscode.Range | undefined> {
    if (!getConfigProperty('wikibonsai.wikiref.refactor.enabled', true)) { return; }
    // doc must be saved
    if (document.isDirty) {
      logger.warn('RenameProvider.provideRenameEdits() -- cannot rename link in unsaved document');
      return undefined;
    }
    // position must be on a word
    const fileNameRange = document.getWordRangeAtPosition(position, wikirefs.RGX.GET.FILENAME);
    const refTypeRange = document.getWordRangeAtPosition(position, wikirefs.RGX.GET.REFTYPE);
    if (!fileNameRange && !refTypeRange) {
      logger.warn('RenameProvider.prepareRename() -- no renamable symbol exists at current position');
      return undefined;
    }
    // filename
    if (fileNameRange) {
      // extract filename from wikiref
      const fileNameMatch = wikirefs.RGX.GET.FILENAME.exec(document.getText(fileNameRange));
      if (!fileNameMatch) {
        logger.warn('RenameProvider.provideRenameEdits() -- wikiref regex error');
        return undefined;
      }
      // file must exist (in index)
      const filename: string = fileNameMatch[1];
      const node = this.index.find('filename', filename);
      if (!node) {
        logger.warn(`RenameProvider.prepareRename() -- index node does not exist for '${filename}'`);
      }
      // provide rename text (positions)
      const offsetByTwoBrackets: number = 2;
      return new vscode.Range(
        new vscode.Position(
          fileNameRange.start.line,
          fileNameRange.start.character + fileNameMatch.index + offsetByTwoBrackets,
        ),
        new vscode.Position(
          fileNameRange.start.line,
          fileNameRange.start.character + filename.length + offsetByTwoBrackets,
        ),
      );
    }
    // reftype
    if (refTypeRange) {
      const refTypeMatch = wikirefs.RGX.GET.REFTYPE.exec(document.getText(refTypeRange));
      if (!refTypeMatch) {
        logger.warn('RenameProvider.provideRenameEdits() -- wikirefs regex error');
        return undefined;
      }
      const isAttr: number = 1;
      const isLink: number = 2;
      /* eslint-disable indent */
      const reftype: string = (refTypeMatch && refTypeMatch[isAttr])
                                ? refTypeMatch[isAttr].trim()
                                : refTypeMatch[isLink].trim();
      /* eslint-enable indent */
      const refTypeTextOffset: number = refTypeMatch[0].indexOf(reftype);
      return new vscode.Range(
        new vscode.Position(
          refTypeRange.start.line,
          refTypeRange.start.character + refTypeMatch.index + refTypeTextOffset,
        ),
        new vscode.Position(
          refTypeRange.start.line,
          refTypeRange.start.character + refTypeTextOffset + reftype.length,
        ),
      );
    }
  }
}
