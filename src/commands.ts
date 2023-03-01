// commands
// note:
// - keep in sync with package.json manually
// - configs are verb.first. (as opposed to configs which are noun.first.)


export type WikiBonsaiCommands = 
  ////
  // debug commands
  // dump
  | 'wikibonsai.debug.dump.index'
  | 'wikibonsai.debug.dump.bonsai'
  // print
  | 'wikibonsai.debug.print.index'
  | 'wikibonsai.debug.print.bonsai'
  // reset
  | 'wikibonsai.debug.reset.index'
  ////
  // other commands
  // (includes both commands meant to be accessible to the end-user
  //  and commands that need to be programmatically executable internally;
  //  there's no good way to separate these as far as i can tell)
  // create
  | 'wikibonsai.create.file'
  | 'wikibonsai.create.file.bulk'
  // generate id
  | 'wikibonsai.genID.attrs'
  | 'wikibonsai.genID.fname'
  // name
  | 'wikibonsai.name.file'
  // open
  | 'wikibonsai.open.file'
  | 'wikibonsai.open.graph.tree'
  | 'wikibonsai.open.graph.web'
  | 'wikibonsai.open.wizard'
  // toggle
  | 'wikibonsai.toggle.graph.ctrls.dim'
  | 'wikibonsai.toggle.graph.ctrls.fix'
  | 'wikibonsai.toggle.graph.ctrls.follow'
  // refresh
  | 'wikibonsai.refresh.panel.bonsai'
  | 'wikibonsai.refresh.panel.ancestors'
  | 'wikibonsai.refresh.panel.children'
  | 'wikibonsai.refresh.panel.forerefs'
  | 'wikibonsai.refresh.panel.backrefs'
  | 'wikibonsai.refresh.panel.orphans'
  | 'wikibonsai.refresh.panel.zombies'
  // 'resurrect' (create doc from zombie [[ref]] in treeview panel)
  | 'wikibonsai.resurrect.tmpl'
  | 'wikibonsai.resurrect'
  // sync
  | 'wikibonsai.sync.bonsai'
  | 'wikibonsai.sync.graph'
  | 'wikibonsai.sync.gui'
  | 'wikibonsai.sync.reftypes'
  | 'wikibonsai.sync.wikirefs'
  // vscode
  | 'wikibonsai.vscode.executeDecorationProvider'
  ;
