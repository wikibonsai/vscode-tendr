import * as vscode from 'vscode';

import { cloneDeep } from 'lodash';
const caml = require('caml-mkdn');
const matter = require('gray-matter');
const yaml = require('js-yaml');

import { getFilename } from '../../util/wrapVSCode';
import { printISONowDate, printISONowTimestamp } from '../../util/wrapLuxon';
import { getConfigProperty } from '../../config';
import {
  ATTR_CDATE,
  ATTR_CTIME,
  ATTR_ENGINE_CAML,
  ATTR_ENGINE_YAML,
  ATTR_ID,
  ATTR_MDATE,
  ATTR_MTIME,
  ATTR_TITLE,
  ATTR_VDATE,
  ATTR_VTIME,
  EDIT_TEXTEDIT,
  EDIT_WORKSPACE,
  YAML_SEPERATOR,
} from '../../util/const';
import logger from '../../util/logger';


// this type and its consts exist because i can't pass an argument into
// 'vscode.WorkspaceEdit.createFile()'...
export interface AttrPayload {
  filename: string;
  // vscUri: vscode.Uri;
  // zombie
  id?: string;
  // template
  tmplVscUri?: vscode.Uri;
  type?: string;
  path?: string;
  unfixedFilename?: string;
}

export interface AttrData {
  data: any;
  content: string;
}

// todo: add links to wikiref regex in github
export class AttributesProvider {
  // todo: import from 'caml-mkdn'
  public rgxTimestampStr: string = '([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})' +                // YYYY-Mm-Dd
                                    '(?:' +                                                // (time is optional)
                                    '(?:t|T|[ \\t]+)' +                                    // t | T | whitespace
                                    '([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)' + // Hh:Mm:Ss(.ss)?
                                    '(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?' +      // Z | +5 | -03:30
                                    ')?';
  public rgxDateStr: string = '([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})'; // YYYY-Mm-Dd
  /* eslint-disable-next-line indent */
                                        // wikirefs reftype valid chars
  public rgxCamlAttrKey: RegExp = /^:? ?([^\n\r!:^|[\]]+) *::.*$/im;
  public rgxYamlAttrKey: RegExp = /^(.*):.*$/im;
  public rgxYamlMdate  : RegExp = new RegExp('mdate:( +)([\'"]?' + this.rgxDateStr + '[\'"]?)?', 'm');
  public rgxYamlVdate  : RegExp = new RegExp('vdate:( +)([\'"]?' + this.rgxDateStr + '[\'"]?)?', 'm');
  public rgxYamlMtime  : RegExp = new RegExp('mtime:( +)([\'"]?' + this.rgxTimestampStr + '[\'"]?)?', 'm');
  public rgxYamlVtime  : RegExp = new RegExp('vtime:( +)([\'"]?' + this.rgxTimestampStr + '[\'"]?)?', 'm');

  // pseudo-global consts ('global' as in, accessed by other providers around the plugin)

  // for passing attribute creation request data payloads around when templates are used
  private _payload: AttrPayload | undefined;

  // accessors

  private async getEngine(): Promise<any> {
    const engineType: string = getConfigProperty('wikibonsai.attrs.engine', ATTR_ENGINE_CAML);
    if (engineType === ATTR_ENGINE_CAML) { return caml; }
    if (engineType === ATTR_ENGINE_YAML) { return yaml; }
    logger.info('No attributes engine specified, please set to "caml" or "yaml" in settings');
  }

  // one-time call and response / send and receive
  // 
  // this method exists because i can't pass an argument into
  // 'vscode.WorkspaceEdit.createFile()'...
  // 
  // 'CommandProvider.createDoc()' sets transaction payload in 'payload()' and
  // 'FileWatcherProvider.handlecreate()' loads payload from 'init()', where
  // 'clearPayload()' is called

  get payload(): AttrPayload | undefined {
    return this._payload;
  }

  // note: typescript is forcing 'undefined' to be in the setter type...
  set payload(payload: AttrPayload | undefined) {
    this._payload = payload;
  }

  public clearPayload(): void {
    this._payload = undefined;
  }

  public typePayload(): string | undefined {
    if (this._payload) { return this._payload.type; }
  }

  // methods

  // note:
  // - contains default attr data payloads for when there is no template
  // - prints attrs as either caml or yaml depending on which engine is set
  // - if the template format does not match the the selected attr engine, default attr payload will print.
  public async init(vscUri: vscode.Uri, id?: string): Promise<[any, string] | undefined> {
    logger.debug('AttributesProvider.init()');
    const engine = await this.getEngine();
    if (!id) { id = await vscode.commands.executeCommand('wikibonsai.genID.attrs'); }
    const date: string = printISONowDate();
    const timestamp: string = printISONowTimestamp();
    const unslugifiedFileName: string = getFilename(vscUri).replaceAll('-', ' ');
    // use programmatic default attrs --- this probably shouldn't happen and only will if the user has not defined a default template
    let attrData: any = {
      id: id,
      ctime: timestamp,
      mtime: timestamp,
      vtime: timestamp,
      title: unslugifiedFileName,
      tldr: '""',
    };
    const tmplData: any = {};
    // with template
    if (this._payload) {
      const payload: AttrPayload = cloneDeep(this._payload);
      const title: string = payload.unfixedFilename ? payload.unfixedFilename.replaceAll('-', ' ') : payload.filename.replaceAll('-', ' ');
      // from zombie
      if (payload.id) {
        id = payload.id;
      }
      // template attrs
      if (!payload.tmplVscUri) {
        logger.warn('AttributesProvider.init() -- unable to find template vscode uri');
      } else {
        const tmplDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(payload.tmplVscUri);
        const tmplAttrText: string = tmplDocument.getText();
        const lines = tmplAttrText.split('\n');
        let inFrontMatter: boolean = false;
        for (const l of lines) {
          let valMatch: RegExpExecArray | null | undefined;
          if (engine === yaml) {
            if (l === YAML_SEPERATOR) {
              // begin frontmatter
              if (!inFrontMatter) {
                inFrontMatter = !inFrontMatter;
                continue;
              // end frontmatter
              } else {
                break;
              }
            }
            if (inFrontMatter) {
              valMatch = this.rgxYamlAttrKey.exec(l);
            }
          }
          if (engine === caml) {
            valMatch = this.rgxCamlAttrKey.exec(l);
          }
          if ((engine !== caml) && (engine !== yaml)) {
            logger.info('AttributesProvider.init() -- please select a valid attr engine: "caml" or "yaml"');
          }
          if (valMatch) {
            const keyMatch: string = valMatch ? valMatch[1] : '';
            const key: string = keyMatch.trim();
            switch (key) {
            case ATTR_ID:
              tmplData[key] = id;
              break;
            case ATTR_TITLE:
              tmplData[key] = title;
              break;
            // date
            case ATTR_CDATE:
              tmplData[key] = date;
              break;
            case ATTR_MDATE:
              tmplData[key] = date;
              break;
            case ATTR_VDATE:
              tmplData[key] = date;
              break;
            // time
            case ATTR_CTIME:
              tmplData[key] = timestamp;
              break;
            case ATTR_MTIME:
              tmplData[key] = timestamp;
              break;
            case ATTR_VTIME:
              tmplData[key] = timestamp;
              break;
            default:
              tmplData[key] = '""';
              break;
            }
          }
        }
      }
    }
    // if valid template data was built, reset attrData
    // so we don't accidentally carry over unintended attrs
    if (Object.keys(tmplData).length > 0) {
      attrData = tmplData;
    }
    // cleanup
    this.clearPayload();
    const attrStr: string = this.buildAttrStr(engine, attrData);
    return [attrData, attrStr];
  }

  public buildAttrStr(engine: any, attrData: any) {
    ////
    // file update
    let attrStr: string = '';
    if ((engine === yaml) && (Object.keys(attrData).length > 0)) {
      attrStr = YAML_SEPERATOR + '\n'
                  + engine.dump(attrData)
                  + YAML_SEPERATOR + '\n';
      // remove quoted values -- so iso timestamps can be handled uniformly on edit; but leave empty quotes alone
      attrStr = attrStr.replace(/(?:(?<!')'(?!'))|(?:(?<!")"(?!"))/g, '');
    }
    if (engine === caml) {
      const opts = {
        prefix: getConfigProperty('wikibonsai.attrs.caml.opts.prefix', true),
        format: getConfigProperty('wikibonsai.attrs.caml.opts.format', 'pretty'),
        listFormat: 'mkdn',
      };
      attrStr = engine.dump(attrData, opts);
    }
    if (attrStr === '') {
      logger.info('AttributesProvider.buildAttrStr() -- no attributes found for given doctype');
    }
    return attrStr;
  }

  public async load(text: string): Promise<AttrData | undefined> {
    const engineType: string = getConfigProperty('wikibonsai.attrs.engine', 'caml');
    const camlData: any = caml.load(text);
    const camlLessContent: string = camlData.content ? camlData.content : text;
    const yamlData: any = (text.substring(0,4) === '---\n') ? matter(camlLessContent) : { data: {}, content: camlLessContent };
    // merge with priority given to the selected attr engine
    if (engineType === ATTR_ENGINE_CAML) {
      if (yamlData && yamlData.data) {
        camlData.data = { ...yamlData.data, ...camlData.data };
      }
      return camlData;
    }
    if (engineType === ATTR_ENGINE_YAML) {
      if (camlData && camlData.data) {
        yamlData.data = { ...camlData.data, ...yamlData.data };
      }
      return yamlData;
    }
    logger.error('AttributesProvider.load() -- no attrs');
    return undefined;
  }

  // update file

  public async updateFileAttr(
    attrs: string[],
    vscUri: vscode.Uri,
    returnType: string = EDIT_TEXTEDIT,
  ): Promise<(vscode.TextEdit | vscode.WorkspaceEdit)[] | void> {
    const docToSave: vscode.TextDocument = await vscode.workspace.openTextDocument(vscUri);
    const edits: (vscode.TextEdit | vscode.WorkspaceEdit)[] = [];
    for (const attr of attrs) {
      let attrRgx: RegExp | undefined;
      let timeValue: string | undefined;
      if (attr.includes('date')) {
        timeValue = printISONowDate();
        if (attr === ATTR_MDATE) {
          attrRgx = this.rgxYamlMdate;
        }
        if (attr === ATTR_VDATE) {
          attrRgx = this.rgxYamlVdate;
        }
      }
      if (attr.includes('time')) {
        timeValue = printISONowTimestamp();
        if (attr === ATTR_MTIME) {
          attrRgx = this.rgxYamlMtime;
        }
        if (attr === ATTR_VTIME) {
          attrRgx = this.rgxYamlVtime;
        }
      }
      // caml
      let edit: vscode.TextEdit | vscode.WorkspaceEdit | undefined;
      if (attrRgx && timeValue) {
        edit = this.buildCamlEdit(attr, docToSave, timeValue, returnType);
      }
      if (edit) { edits.push(edit); }
      // yaml
      try {
        const matterStuff: any = matter(docToSave.getText());
        const matterData: any = matterStuff.data;
        if (attrRgx && timeValue) {
          edit = this.buildYamlEdit(attrRgx, attr, docToSave, timeValue, matterData, returnType);
          if (edit) { edits.push(edit); }
        }
      } catch (e) {
        console.warn(e);
      }
    }
    return edits;
  }

  public buildCamlEdit(
    attr: string,
    doc: vscode.TextDocument,
    newValue: string,
    returnType: string = EDIT_TEXTEDIT,
  ): (vscode.TextEdit | vscode.WorkspaceEdit | undefined) {
    const camlAttrMatch: [number, number, string] | undefined = caml.scanUpdateAttr(doc.getText(), attr, newValue, 'timestamp');
    if (camlAttrMatch === undefined) { return undefined; }
    const start: vscode.Position = doc.positionAt(camlAttrMatch[0]);
    const end: vscode.Position = doc.positionAt(camlAttrMatch[1]);
    const updatedText: string = camlAttrMatch[2];
    if (returnType === EDIT_TEXTEDIT) {
      return vscode.TextEdit.replace(new vscode.Range(start, end), updatedText);
    }
    if (returnType === EDIT_WORKSPACE) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
      return edit;
    }
  }

  public buildYamlEdit(
    attrRgx: RegExp,
    attrStr: string,
    doc: vscode.TextDocument,
    newValue: string,
    matterData: any,
    returnType: string = EDIT_TEXTEDIT,
  ): (vscode.TextEdit | vscode.WorkspaceEdit | undefined) {
    const yamlAttrMatch: RegExpExecArray | null = attrRgx.exec(doc.getText());
    if (matterData[attrStr] && (yamlAttrMatch !== null)) {
      // breakdown match
      // const fullmatch = yamlAttrMatch[0];
      const pad = yamlAttrMatch[1];
      // const oldValue = yamlAttrMatch[2];
      // edit
      const start: vscode.Position = doc.positionAt(yamlAttrMatch.index);
      const end: vscode.Position = doc.positionAt(yamlAttrMatch.index + yamlAttrMatch[0].length);
      const updatedText: string = attrStr + ':' + pad + newValue;
      if (returnType === EDIT_TEXTEDIT) {
        return vscode.TextEdit.replace(new vscode.Range(start, end), updatedText);
      }
      if (returnType === EDIT_WORKSPACE) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
        return edit;
      }
    }
  }
}
