import path from 'path';

import * as vscode from 'vscode';

import { getFilename } from '../util/wrapVSCode';
import { ZOMBIE } from '../util/emoji';


export abstract class BaseQuickPickItem implements vscode.QuickPickItem {
  public label: string = 'BaseQuickPickItem';
  public detail?: string;
  public description?: string;
  // create
  public alwaysShow?: boolean;
  // template
  public tmplType?: string;
  public tmplVscUri?: vscode.Uri;
  // doc
  public vscUri?: vscode.Uri;
  // note: for 'WizProvider' to decide whether to search or create
  public isNode?: boolean;
}

export class SearchQuickPickItem implements BaseQuickPickItem {
  public alwaysShow: boolean = true;
  public label: string = 'search';
}

export class CreateDocQuickPickItem implements BaseQuickPickItem {
  public alwaysShow: boolean = true;
  public isNode: boolean = false;
  public label: string = 'create new doc';
  public detail: string = 'create new doc with this text as the filename';
  public tmplType: string | undefined;
  public tmplVscUri: vscode.Uri | undefined;

  constructor(tmplType?: string, tmplVscUri?: vscode.Uri) {
    // can create docs from templates even if there is no type
    if (tmplType) {
      this.tmplType = tmplType;
      this.label = tmplType;
    }
    // has template doc
    if (tmplVscUri) {
      const tmplFileName: string = getFilename(tmplVscUri);
      this.tmplVscUri = tmplVscUri;
      this.label = tmplFileName;
      this.detail = `create a new doc from template: ${tmplFileName}`;
    // does not have template doc -- use 'default'
    } else {
      this.detail = 'create a new doc from template: "default" template';
    }
  }

  public async selected(zombieText?: string) {
    // give user a chance to (re)name file before creating
    const startText: string = zombieText ? zombieText : '';
    const inputText: string = await vscode.commands.executeCommand(
      'tendr.name.file',
      {
        createFrom: this.label,
        startValue: startText,
      },
    );
    // cancel
    if (!zombieText && !inputText) { return; }
    // continue creating new doc
    const payload: any = {};
    payload.filename = inputText;
    // todo: might be able to get rid of this...
    if (this.tmplType) {
      payload.type = this.tmplType;
    }
    if (this.tmplVscUri) {
      payload.tmplVscUri = this.tmplVscUri;
    }
    // if new file is being created from a zombie
    // whose text is being changed just before creation
    if (zombieText && (zombieText.length !== 0) && (zombieText !== inputText)) {
      payload.filenameFromZombie = zombieText;
    }
    vscode.commands.executeCommand('tendr.create.file', payload);
  }
}

export class DocQuickPickItem implements BaseQuickPickItem {
  public isNode: boolean = true;
  public label: string;
  public vscUri?: vscode.Uri;
  public description?: string;
  // detail?: string;

  // todo: full details -- once vscode allows newlines or custom webview components inside
  constructor(filename: string, uri: string, title?: string, ancestors?: string[]) {
    this.label = filename;
    // this.detail = '';

    // default case
    const vscUri: vscode.Uri = vscode.Uri.parse(uri);
    this.vscUri = vscUri;
    // this.detail += 'title: ' + title + '\n';

    if (!ancestors || ancestors.length === 0) {
      this.description = title;
      // this.detail += 'path: ' + getAbsPathInWorkspace(vscUri) + '\n';
    } else {
      /* eslint-disable indent */
      // bonsai leaf
      this.description = (ancestors.length === 0)
                         ? undefined 
                         : ancestors.join(' > ') + ' > ' + title;
      /* eslint-enable indent */
      // this.detail += 'ancestors: ' + ancestorsStr + '\n';
    }
  }

  public selected() {
    vscode.commands.executeCommand('tendr.open.file', this.vscUri);
  }
}

// for zombies

// ref from: https://github.com/gitkraken/vscode-gitlens/blob/417587d0dfcda89e9e2d723f8b662d7cf9008c8f/src/commands/quickCommand.buttons.ts#L115
// export const ResurrectButton: QuickInputButton = {
//   iconPath: new vscode.ThemeIcon('add'),
//   tooltip: 'Reveal in Side Bar',
// };

export class NoDocQuickPickItem implements BaseQuickPickItem {
  public isNode: boolean = true;
  public label: string;
  public buttons?: readonly vscode.QuickInputButton[] | undefined;
  public nodeID: string;
  // detail?: string;

  constructor(text: string, nodeID: string) {
    this.label = ZOMBIE + ' ' + text;
    this.nodeID = nodeID;
    this.buttons = [createDocFromTmplBtn, createDocBtn];
  }

  public filename(): string {
    return this.label.slice(3, this.label.length);
  }

  public createDoc(): void {
    vscode.commands.executeCommand(
      'tendr.create.file',
      {
        id: this.nodeID,
        filename: this.filename(),
      },
    );
  }
}

export const createDocBtn = {
  // iconPath: new vscode.ThemeIcon('add'),
  iconPath: {
    light: vscode.Uri.parse(path.join(__filename, '..', '..', 'icons', 'light', 'add.svg')),
    dark: vscode.Uri.parse(path.join(__filename, '..', '..', 'icons', 'dark', 'add.svg')),
  },
  tooltip: 'Create Doc',
};

export const createDocFromTmplBtn = {
  // iconPath: new vscode.ThemeIcon('add'),
  iconPath: {
    light: vscode.Uri.parse(path.join(__filename, '..', '..', 'icons', 'light', 'add-circle.svg')),
    dark: vscode.Uri.parse(path.join(__filename, '..', '..', 'icons', 'dark', 'add-circle.svg')),
  },
  tooltip: 'Create Doc From Template',
};
