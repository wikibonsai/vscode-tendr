import * as vscode from 'vscode';
import { getConfigProperty } from '../config';


export const GARDEN   = '🪴'; // ...'🎍'?
export const LEAF     = '🍃';
export const PRUNE    =  '✂️';
export const TRUNK    = '🪵';
export const SEED     = '🌰';
export const WATER    = '🚰';
export const WEB      = '🕸';
export const ZOMBIE   = '🧟';
export const TEMPLATE = '🧩';

export const enum TREE {
  bamboo    = '🎋',
  evergreen = '🌲',
  maple     = '🌳',
  palm      = '🌴',
  xmas      = '🎄',
}

export class TreeSpecies {
  public emoji: TREE = TREE.bamboo;

  public async init(workspaceState: vscode.Memento) {
    if (TreeSpecies.isXmas()) {
      this.emoji = TREE.xmas;
    } else {
      let treeEmoji: TREE | typeof SEED | undefined = getConfigProperty('wikibonsai.emoji.tree', SEED);
      if (treeEmoji === SEED) {
        treeEmoji = await vscode.window.showInformationMessage(
          `please select a species of bonsai to tend:
          (this determines which emoji to display)`,
          TREE.bamboo,
          TREE.evergreen,
          TREE.maple,
          TREE.palm,
        );
        if (!treeEmoji) { treeEmoji = TREE.bamboo; }
        await workspaceState.update('beenOpened', true);
        await vscode.workspace.getConfiguration().update('wikibonsai.emoji.tree', this.emoji, vscode.ConfigurationTarget.Workspace);
      }
      this.emoji = getConfigProperty('wikibonsai.emoji.tree', TREE.bamboo);
    }
  }

  public static isXmas(): boolean {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
    const dd = String(today.getDate()).padStart(2, '0');
    const isXmas = (mm === '12') && (dd === '25');
    return isXmas;
  }

  // for testing
  public reset(): void {
    this.emoji = TREE.bamboo;
  }
}

export const ts = new TreeSpecies();
