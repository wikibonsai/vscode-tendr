import * as vscode from 'vscode';

import del from 'del';

import { getWorkspaceDir } from '../../../util/wrapVSCode';
import { EXT_MD } from '../../../util/const';


// export const initTestWorkspace = async () => {
//   // wsdir
//   mkdirp('test-workspace');
//   const workspaceDir: vscode.Uri | undefined = await getWorkspaceDir();
//   if (!workspaceDir) { return; }
// };

export const cleanTestWorkspace = async () => {
  // wsdir
  const workspaceDir: vscode.Uri | undefined = await getWorkspaceDir();
  if (!workspaceDir) { return; }
  del.sync(['**/!(.vscode)'], {
    force: true,
    cwd: workspaceDir.toString(),
  });
};

export const createFile = async (
  filename: string = 'test-file',
  content: string = '',
): Promise<vscode.Uri | undefined> => {
  // wsdir
  const workspaceDir: vscode.Uri | undefined = await getWorkspaceDir();
  if (!workspaceDir) { return; }
  // build
  const vscUri: vscode.Uri = vscode.Uri.joinPath(workspaceDir, filename + EXT_MD);
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(vscUri);
  edit.insert(vscUri, new vscode.Position(0, 0), content);
  await vscode.workspace.applyEdit(edit);
  return vscUri;
};
