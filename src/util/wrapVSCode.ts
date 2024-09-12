import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import { EXT_MD, VSCODE_GLOB_MEDIA } from './const';
// import { TendrCommands } from './commands';


// todo: wrap command execution so type check applies to commands
// export function execute(command: TendrCommands, val?: any) {
//   return vscode.commands.executeCommand(command, val);
// }

// why: https://code.visualstudio.com/api/references/vscode-api#ViewColumn
export const colDescrToNum: Record<string, vscode.ViewColumn | undefined> = {
  active: -1,
  beside: -2,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

export function getAbsPathInWorkspace(vscUri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
  const relFilePath = workspaceFolder ? vscUri.fsPath.replace(workspaceFolder, '') : vscUri.fsPath;
  const uriString = vscode.Uri.file(relFilePath).toString();
  const absPath = uriString ? uriString.replace('file://', '') : '';
  return absPath;
}

export function getAbsPathInWorkspaceForMedia(vscUri: vscode.Uri): string {
  const uriString = vscode.Uri.file(vscUri.fsPath).toString();
  const absPath = uriString ? uriString.replace('file://', '') : '';
  return absPath;
}

export const getMediaAbsPaths = async (): Promise<string[]> => {
  const mediaVscUris: vscode.Uri[] = await vscode.workspace.findFiles('**/*' + VSCODE_GLOB_MEDIA);
  return mediaVscUris.map((vscUri: vscode.Uri) => getAbsPathInWorkspaceForMedia(vscUri));
};

export async function getFileContent(uri: string): Promise<string | undefined> {
  const vscUri: vscode.Uri = vscode.Uri.parse(uri);
  const docToSave: vscode.TextDocument = await vscode.workspace.openTextDocument(vscUri);
  return docToSave.getText();
}

export const getWorkspaceDir = async (): Promise<vscode.Uri | undefined> => {
  try {
    return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;
  } catch (e) {
    vscode.window.showErrorMessage('could not find workspace: ', <string> e);
  }
};

export function getFilename(uri: vscode.Uri): string {
  return Utils.basename(uri).replace(Utils.extname(uri), '');
}

// all md files
export const getMDUris = async (): Promise<vscode.Uri[]> => {
  return vscode.workspace.findFiles('**/*' + EXT_MD);
};
