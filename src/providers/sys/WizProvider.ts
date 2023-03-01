import * as vscode from 'vscode';

import { NODE, QUERY_TYPE } from 'caudex';

import { ATTR_TITLE } from '../../util/const';
import logger from '../../util/logger';
import { getConfigProperty } from '../../config';
import { TemplateItem, TypeProvider } from './TypeProvider';
import { IndexProvider } from './IndexProvider';
import {
  createDocBtn,
  createDocFromTmplBtn,
  CreateDocQuickPickItem,
  DocQuickPickItem,
  NoDocQuickPickItem,
  SearchQuickPickItem,
} from '../../items/QuickPickItems';


export class WizProvider {
  private types: TypeProvider;
  public index: IndexProvider;

  constructor(types: TypeProvider, index: IndexProvider) {
    logger.debug('creating WizProvider...');
    this.types = types;
    this.index = index;
    logger.debug('...WizProvider created');
  }

  public async open(filename?: string) {
    logger.debug('WizProvider.open()');
    if (!getConfigProperty('wikibonsai.wizard.enabled', true)) { return; }
    const quickPick = vscode.window.createQuickPick();
    if (filename) { quickPick.value = filename; }
    quickPick.placeholder = 'begin typing to search by "filename" or select a method of file creation below';
    quickPick.items = await this.createItems();
    quickPick.onDidChangeValue(async (value: string) => {
      const activeItem: any = quickPick.activeItems[0];
      logger.verbose('WizProvider.open() -- active item:' + '\n' + JSON.stringify(activeItem));
      logger.verbose('WizProvider.open() -- value: ', value);
      const isLabelItem: boolean = ((activeItem.label === 'search') || (activeItem.label === 'create a new doc'));
      const isNodeItem: boolean = activeItem.isNode;
      // const isTemplateItem: boolean = (activeItem.alwaysShow === true);
      if ((isLabelItem || isNodeItem) && (value !== '')) {
        quickPick.items = await this.docItems();
        logger.verbose('WizProvider.open() -- doc items: ', JSON.stringify(quickPick.items));
      // (isTemplateItem === true)
      } else {
        // put create items back -- vscode needs items to be populated again
        quickPick.items = await this.createItems();
        logger.verbose('WizProvider.open() -- create items: ', JSON.stringify(quickPick.items));
      }
    });
    // zombie node creation ('resurrection') buttons
    quickPick.onDidTriggerItemButton(async (e: any) => {
      if (e.button === createDocBtn) {
        e.item.createDoc();
      }
      if (e.button === createDocFromTmplBtn) {
        quickPick.value = e.item.filename();
        quickPick.items = await this.createItems();
      }
    }),
    quickPick.onDidAccept(() => {
      // using 'any' type because typescript is upset with
      // a custom property ('DocQuickPickItem.vscUri')
      const item: any = quickPick.selectedItems[0];
      item.selected(quickPick.value);
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }

  private async docItems(): Promise<vscode.QuickPickItem[]> {
    logger.verbose('WizProvider.docItems() -- start');
    // this silly business has to be done since 
    // 'QuickPickItem' arrays are immutable
    const allNodes: any[] = this.index.all(QUERY_TYPE.NODE);
    const searchItems: any[] = allNodes.map(async (node) => {
      if (node.id) {
        // calculate ancestry path
        const ancestorsPayload: any = this.index.ancestors(node.id, [ATTR_TITLE, NODE.KIND.ZOMBIE]);
        let ancestorTitles: string[] | undefined = undefined;
        if (ancestorsPayload) {
          ancestorTitles = [];
          for (const node of ancestorsPayload) {
            // zombie ancestor case
            if (!node.title) {
              ancestorTitles.push(node.zombie);
            // default ancestor case
            } else {
              ancestorTitles.push(node.title);
            }
          }
        }
        logger.verbose('WizProvider.docItems() -- an item: ', node.data.filename);
        // zombie case
        if (node.kind === NODE.KIND.ZOMBIE) {
          return new NoDocQuickPickItem(node.data.filename, node.id);
        // default case
        } else {
          return new DocQuickPickItem(
            node.data.filename,
            node.data.uri,
            node.data.title,
            // if it's a bonsai leaf, it will have 'ancestors'
            ancestorTitles,
          );
        }
      }
    });
    searchItems.unshift(new CreateDocQuickPickItem());
    logger.verbose('WizProvider.docItems() -- end');
    return await Promise.all(searchItems);
  }

  private async createItems() {
    // search
    const items: vscode.QuickPickItem[] = [new SearchQuickPickItem()];
    // create
    items.push(new CreateDocQuickPickItem());
    // create from template
    if (this.types.typeOpts !== undefined) {
      const templates: any[] = await this.types.tmplItems();
      for (const type of Object.keys(this.types.typeOpts)) {
        const correspondingTemplate: TemplateItem | undefined = templates.find((t) => t.type === type);
        if (correspondingTemplate !== undefined) {
          items.push(new CreateDocQuickPickItem(type, correspondingTemplate.vscUri));
        } else {
          items.push(new CreateDocQuickPickItem(type));
        }
      }
    }
    return items;
  }
}
