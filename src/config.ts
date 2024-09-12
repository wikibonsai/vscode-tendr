// config
// note:
// - keep in sync with package.json manually
// - configs are noun.first. (as opposed to commands, which are verb.first.)

import * as vscode from 'vscode';
// import logger from './util/logger';


// config types

export type TendrAttrs = 
  | 'tendr.attrs.caml.opts.format'
  | 'tendr.attrs.caml.opts.render.enabled'
  | 'tendr.attrs.caml.opts.prefix'
  | 'tendr.attrs.engine'
  | 'tendr.attrs.id.alpha'
  | 'tendr.attrs.id.size'
  // enabled
  | 'tendr.attrs.mdate.enabled'
  | 'tendr.attrs.mtime.enabled'
  | 'tendr.attrs.vdate.enabled'
  | 'tendr.attrs.vtime.enabled'
  ;

export type TendrBonsai = 
  | 'tendr.bonsai.root'
  // enabled
  | 'tendr.bonsai.sync.enabled'
  ;

export type TendrFile = 
  | 'tendr.file.config'
  | 'tendr.file.doc-types'
  | 'tendr.file.name.opts.id.alpha'
  | 'tendr.file.name.opts.id.size'
  | 'tendr.file.open.loc'
  // enabled
  | 'tendr.file.sync.enabled'
  ;

export type TendrLint = 
  | 'tendr.lint.indentKind'
  | 'tendr.lint.indentSize'
  | 'tendr.lint.mkdnBullet'
  | 'tendr.lint.wikiLink'
  ;
  
export type TendrGraph = 
  | 'tendr.graph.ctrls.dim'
  | 'tendr.graph.open-loc'
  | 'tendr.graph.coords.tree'
  | 'tendr.graph.coords.web'
  // enabled
  | 'tendr.graph.ctrls.autosync.enabled'
  | 'tendr.graph.ctrls.fix.enabled'
  | 'tendr.graph.ctrls.follow.enabled'
  | 'tendr.graph.ctrls.autosync.enabled'
  | 'tendr.graph.enabled'
  | 'tendr.graph.tree.enabled'
  | 'tendr.graph.web.enabled'
  ;

export type TendrTag =
  | 'tendr.tag.open-doc'
  | 'tendr.tag.open-loc'
  // enabled
  | 'tendr.tag.enabled'
  ;

export type TendrTreeViewPanels = 
  // enabled
  | 'tendr.panel.ancestors.enabled'
  | 'tendr.panel.bonsai.enabled'
  // todo: auto-open active doc in bonsai treeview
  // | 'tendr.panel.bonsai.follow.enabled'
  | 'tendr.panel.backrefs.enabled'
  | 'tendr.panel.children.enabled'
  | 'tendr.panel.forerefs.enabled'
  | 'tendr.panel.danglers.enabled'
  | 'tendr.panel.zombies.enabled'
  ;

export type TendrWikiRefs = 
  // enabled
  | 'tendr.wikiref.affix-rename.enabled'
  | 'tendr.wikiref.completion.enabled'
  | 'tendr.wikiref.goto.enabled'
  | 'tendr.wikiref.hover-preview.enabled'
  | 'tendr.wikiref.refactor.enabled'
  | 'tendr.wikiref.type.completion.enabled'
  ;

export type TendrConfigs = 
  | TendrAttrs
  | TendrBonsai
  | TendrLint
  | 'tendr.debug.enabled'
  | 'tendr.emoji.tree'
  | TendrFile
  | TendrGraph
  | 'tendr.log.level'
  | TendrTag
  | TendrTreeViewPanels
  | 'tendr.syntax-highlight.enabled'
  | TendrWikiRefs
  | 'tendr.wizard.enabled'
  ;

// functions

export function getConfigProperty<T>(property: TendrConfigs, fallback: T): T {
  return vscode.workspace.getConfiguration().get(property, fallback);
}

export async function updateConfigProperty<T>(property: TendrConfigs, value: T,): Promise<void> {
  return vscode.workspace.getConfiguration().update(property, value);
}

// from: https://github.com/svsool/memo/blob/master/src/extension.ts#L22
// interface Fn<T> {
//   (): T;
// }
// export function when<R>(configKey: TendrConfigs, cbs: Fn<R> | Fn<R>[]): undefined | R | (undefined | R)[] {
//   const enableStr: string = '.enabled';
//   const isEnableConfig: boolean = (configKey.indexOf(enableStr) === (configKey.length - enableStr.length));
//   if (isEnableConfig) {
//     if (typeof cbs === 'function') {
//       getConfigProperty(configKey, true) ? cbs() : undefined;
//     } else {
//       return cbs.map((cb) => getConfigProperty(configKey, true) ? cb() : undefined);
//     }
//   }
//   logger.error(`Config key "${configKey}" is not an enable toggle.`);
// }

export const isDefined = <T>(argument: T | undefined): argument is T => 
  argument !== undefined;
