import * as wikirefs from 'wikirefs';


// supported file extensions
// markdown
export const EXT_MD                : string = '.md';
export const EXT_MDX               : string = '.mdx';
export const EXT_MARKDOWN          : string = '.markdown';
// toml
export const EXT_TOML              : string = '.toml';
// yaml
export const EXT_YAML              : string = '.yaml';
export const EXT_YML               : string = '.yml';


export const isMarkdown = (ext: string): boolean => {
  return ext.toLowerCase() === EXT_MD;
  // todo: flexible markdown extensions...
  // return ((ext.toLowerCase() === EXT_MD)
  //       || (ext.toLowerCase() === EXT_MARKDOWN)
  //       || (ext.toLowerCase() === EXT_MDX));
};

export const isYaml = (ext: string): boolean => {
  return ((ext === EXT_YAML) || (ext === EXT_YML));
};

export const VSCODE_GLOB_MEDIA: string = '{' + 
([] as string[])
  .concat(Array.from(wikirefs.CONST.EXTS.AUD))
  .concat(Array.from(wikirefs.CONST.EXTS.IMG))
  .concat(Array.from(wikirefs.CONST.EXTS.VID)).join(',')
+ '}';

// todo: derive from 'wikirefs.regex.usable_char.filename'
export const INVALID_FNAME_CHARS   : string = '! : ^ | [ ]';

export const DEFAULT_CONFIG_FILE   : string = 'config.toml';
export const DEFAULT_DOCTYPE_FILE  : string = 't.doc.toml';

//                                'wikirefs.RGX.VALID_CHARS.FILENAME' -- except no whitespace
export const TAG_RGX = /(?:^|\s)#([^\n\r!:^|[\] ]+)/ig;

// todo?
// export const FILENAME              : string = 'filename';
// export const URI                   : string = 'uri';

export const FALLBACK              : string = 'fallback';     // syntax for errors / media

// attr engines
export const ATTR_ENGINE_CAML      : string = 'caml';
export const ATTR_ENGINE_YAML      : string = 'yaml';
// 
export const YAML_SEPERATOR        : string = '---';
// reserved attrs
export const ATTR_ID               : string = 'id';
export const ATTR_NODETYPE         : string = 'nodetype'; // =~ 'doctype'
export const ATTR_TITLE            : string = 'title';
// export const ATTR_TLDR             : string = 'tldr'; // | 'def' | 'definition'
// date
export const ATTR_CDATE            : string = 'cdate'; // | 'created'
export const ATTR_MDATE            : string = 'mdate'; // | 'modified' | 'updated'
export const ATTR_VDATE            : string = 'vdate'; // | 'viewed'
export const ATTR_PDATE            : string = 'pdate'; // | 'published'
// time
export const ATTR_CTIME            : string = 'ctime'; // | 'created'
export const ATTR_MTIME            : string = 'mtime'; // | 'modified' | 'updated'
export const ATTR_VTIME            : string = 'vtime'; // | 'viewed'
export const ATTR_PTIME            : string = 'ptime'; // | 'published'

// from: AttributesProvider build methods
export const EDIT_TEXTEDIT         : string = 'te';
export const EDIT_WORKSPACE        : string = 'wse';

// graph
// export const GRAPH_KIND_TREE       : string = 'tree';
// export const GRAPH_KIND_WEB        : string = 'web';

// message types (graph)
// node
export const MSG_OPEN_NODE         : string = 'openNode';
export const MSG_CREATE_NODE       : string = 'createNode';
export const MSG_SAVE_COORDS       : string = 'saveCoords';
// draw
export const MSG_DRAW_TREE         : string = 'drawTree';
export const MSG_DRAW_WEB          : string = 'drawWeb';
// sync
export const MSG_SYNC_TREE         : string = 'syncTree';
export const MSG_SYNC_WEB          : string = 'syncWeb';
// settings (from vscode)
export const MSG_UPDATE_AUTO_SYNC  : string = 'updateAutoSync';
export const MSG_UPDATE_DATA       : string = 'updateData';
export const MSG_UPDATE_DIM        : string = 'updateDim';
export const MSG_UPDATE_FIX        : string = 'updateFix';
export const MSG_UPDATE_FOCUS_NODE : string = 'updateFocusNode';
export const MSG_UPDATE_FOLLOW     : string = 'updateFollow';
export const MSG_UPDATE_SYNC       : string = 'updateSync';
// toggles (from graph)
export const MSG_TOGGLE_DIM        : string = 'toggleDim';
export const MSG_TOGGLE_FIX        : string = 'toggleFix';
export const MSG_TOGGLE_FOLLOW     : string = 'toggleFollow';
