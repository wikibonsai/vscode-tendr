// config
// note:
// - keep in sync with package.json manually
// - configs are noun.first. (as opposed to commands, which are verb.first.)

import * as vscode from 'vscode';
// import logger from './util/logger';


// config types

export type WikiBonsaiAttrs = 
  | 'wikibonsai.attrs.caml.opts.format'
  | 'wikibonsai.attrs.caml.opts.render.enabled'
  | 'wikibonsai.attrs.caml.opts.prefix'
  | 'wikibonsai.attrs.engine'
  | 'wikibonsai.attrs.id.alpha'
  | 'wikibonsai.attrs.id.size'
  // enabled
  | 'wikibonsai.attrs.mdate.enabled'
  | 'wikibonsai.attrs.mtime.enabled'
  | 'wikibonsai.attrs.vdate.enabled'
  | 'wikibonsai.attrs.vtime.enabled'
  ;

export type WikiBonsaiBonsai = 
  | 'wikibonsai.bonsai.root'
  // enabled
  | 'wikibonsai.bonsai.sync.enabled'
;

export type WikiBonsaiFile = 
  | 'wikibonsai.file.config'
  | 'wikibonsai.file.doc-types'
  | 'wikibonsai.file.name.opts.id.alpha'
  | 'wikibonsai.file.name.opts.id.size'
  | 'wikibonsai.file.open.loc'
  // enabled
  | 'wikibonsai.file.sync.enabled'
  ;

export type WikiBonsaiGraph = 
  | 'wikibonsai.graph.ctrls.dim'
  | 'wikibonsai.graph.open-loc'
  | 'wikibonsai.graph.coords.tree'
  | 'wikibonsai.graph.coords.web'
  // enabled
  | 'wikibonsai.graph.ctrls.autosync.enabled'
  | 'wikibonsai.graph.ctrls.fix.enabled'
  | 'wikibonsai.graph.ctrls.follow.enabled'
  | 'wikibonsai.graph.ctrls.autosync.enabled'
  | 'wikibonsai.graph.enabled'
  | 'wikibonsai.graph.tree.enabled'
  | 'wikibonsai.graph.web.enabled'
  ;

export type WikiBonsaiTag =
  | 'wikibonsai.tag.open-doc'
  | 'wikibonsai.tag.open-loc'
  // enabled
  | 'wikibonsai.tag.enabled'
  ;

export type WikiBonsaiTreeViewPanels = 
  // enabled
  | 'wikibonsai.panel.ancestors.enabled'
  | 'wikibonsai.panel.bonsai.enabled'
  // todo: auto-open active doc in bonsai treeview
  // | 'wikibonsai.panel.bonsai.follow.enabled'
  | 'wikibonsai.panel.backrefs.enabled'
  | 'wikibonsai.panel.children.enabled'
  | 'wikibonsai.panel.forerefs.enabled'
  | 'wikibonsai.panel.danglers.enabled'
  | 'wikibonsai.panel.zombies.enabled'
  ;

export type WikiBonsaiWikiRefs = 
  // enabled
  | 'wikibonsai.wikiref.affix-rename.enabled'
  | 'wikibonsai.wikiref.completion.enabled'
  | 'wikibonsai.wikiref.goto.enabled'
  | 'wikibonsai.wikiref.hover-preview.enabled'
  | 'wikibonsai.wikiref.refactor.enabled'
  | 'wikibonsai.wikiref.type.completion.enabled'
  ;

export type WikiBonsaiConfigs = 
  | WikiBonsaiAttrs
  | WikiBonsaiBonsai
  | 'wikibonsai.debug.enabled'
  | 'wikibonsai.emoji.tree'
  | WikiBonsaiFile
  | WikiBonsaiGraph
  | 'wikibonsai.log.level'
  | WikiBonsaiTag
  | WikiBonsaiTreeViewPanels
  | 'wikibonsai.syntax-highlight.enabled'
  | WikiBonsaiWikiRefs
  | 'wikibonsai.wizard.enabled'
  ;

// functions

export function getConfigProperty<T>(property: WikiBonsaiConfigs, fallback: T): T {
  return vscode.workspace.getConfiguration().get(property, fallback);
}

export async function updateConfigProperty<T>(property: WikiBonsaiConfigs, value: T,): Promise<void> {
  return vscode.workspace.getConfiguration().update(property, value);
}

// from: https://github.com/svsool/memo/blob/master/src/extension.ts#L22
// interface Fn<T> {
//   (): T;
// }
// export function when<R>(configKey: WikiBonsaiConfigs, cbs: Fn<R> | Fn<R>[]): undefined | R | (undefined | R)[] {
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
