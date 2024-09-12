// commands
// note:
// - keep in sync with package.json manually
// - configs are verb.first. (as opposed to configs which are noun.first.)


export type TendrCommands = 
  ////
  // debug commands
  // dump
  | 'tendr.debug.dump.index'
  | 'tendr.debug.dump.bonsai'
  // print
  | 'tendr.debug.print.index'
  | 'tendr.debug.print.bonsai'
  | 'tendr.debug.lint.bonsai'
  // reset
  | 'tendr.debug.reset.index'
  ////
  // other commands
  // (includes both commands meant to be accessible to the end-user
  //  and commands that need to be programmatically executable internally;
  //  there's no good way to separate these as far as i can tell)
  // create
  | 'tendr.create.file'
  | 'tendr.create.file.bulk'
  // generate id
  | 'tendr.genID'
  // name
  | 'tendr.name.file'
  // open
  | 'tendr.open.file'
  | 'tendr.open.graph.tree'
  | 'tendr.open.graph.web'
  | 'tendr.open.wizard'
  // toggle
  | 'tendr.toggle.graph.ctrls.dim'
  | 'tendr.toggle.graph.ctrls.fix'
  | 'tendr.toggle.graph.ctrls.follow'
  // refresh
  | 'tendr.refresh.panel.bonsai'
  | 'tendr.refresh.panel.ancestors'
  | 'tendr.refresh.panel.children'
  | 'tendr.refresh.panel.forerefs'
  | 'tendr.refresh.panel.backrefs'
  | 'tendr.refresh.panel.danglers'
  | 'tendr.refresh.panel.zombies'
  // 'resurrect' (create doc from zombie [[ref]] in treeview panel)
  | 'tendr.resurrect.tmpl'
  | 'tendr.resurrect'
  // sync
  | 'tendr.sync.bonsai'
  | 'tendr.sync.graph'
  | 'tendr.sync.gui'
  | 'tendr.sync.reftypes'
  | 'tendr.sync.wikirefs'
  // vscode
  | 'tendr.vscode.executeDecorationProvider'
  ;
