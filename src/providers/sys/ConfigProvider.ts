import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

const toml = require('@iarna/toml');
const yaml = require('js-yaml');
import * as wikirefs from 'wikirefs';

import { getConfigProperty, updateConfigProperty } from '../../config';
import logger from '../../util/logger';
import { DEFAULT_CONFIG_FILE, EXT_TOML, isYaml } from '../../util/const';
import { TEMPLATE, ZOMBIE } from '../../util/emoji';


// handles configs in the garden config file
// (default: 'config.toml')
export class ConfigProvider {
  private wsDir: vscode.Uri | undefined;
  // file location
  public configFileUri: string | undefined;
  // config objects
  // default garden
  public garden: any = {
    title: 'wikibonsai',
    // include: [],
    // exclude: [],
    root: 'i.bonsai',
    attrs: 'caml',
  };
  // default doc kinds
  public doc: any = {
    kind: {
      doc: {
        path: '/',
        color: '#31AF31',
      },
      zombie: {
        emoji:  ZOMBIE,
        color: '#00000000',
      },
      template: {
        emoji: TEMPLATE,
        color: '#F8F0E3',
      },
    }
  };
  // default linting options
  public lint: any = {
    indent_kind: 'space',
    indent_size: 2,
    mkdn_bullet: true,
    wikilink: true,
  };
  private RGX_TOML_ATTRS = /attrs( +)=( +)(['"])(caml|yaml)(['"])/;
  private RGX_TOML_ROOT  = new RegExp('root( +)=( +)([\'"])(' + wikirefs.RGX.VALID_CHARS.FILENAME.source + ')([\'"])', 'i');
  private RGX_YAML_ATTRS = /attrs:( +)(['"])?(caml|yaml)(['"])?/;
  private RGX_YAML_ROOT  = new RegExp('root:( +)([\'"])?(' + wikirefs.RGX.VALID_CHARS.FILENAME.source + ')([\'"])?', 'i');

  public async build(wsDir?: vscode.Uri): Promise<boolean> {
    logger.debug('ConfigProvider.build()');
    if (wsDir) { this.wsDir = wsDir; }
    if (!this.wsDir) { return false; }
    // 
    this.configFileUri = await this.setConfigFileUri();
    if (!this.configFileUri) { return false; }
    try {
      const docVscUri: vscode.Uri = vscode.Uri.parse(this.configFileUri);
      const docText: string | undefined = await this.getText();
      // init
      let data: any;
      if (Utils.extname(docVscUri) === EXT_TOML) {
        data = toml.parse(docText);
      }
      if (isYaml(Utils.extname(docVscUri))) {
        data = yaml.load(docText);
      }
      // set
      this.garden = data.garden;
      this.doc = data.doc;
      this.lint = data.lint;
      // sync vscode configs
      const curAttrEngine: string = getConfigProperty('wikibonsai.attrs.engine', 'caml');
      if (this.garden.attrs !== curAttrEngine) {
        updateConfigProperty('wikibonsai.attrs.engine', this.garden.attrs.toLowerCase());
      }
      const curRoot: string = getConfigProperty('wikibonsai.bonsai.root', 'i.bonsai');
      if (this.garden.root !== curRoot) {
        updateConfigProperty('wikibonsai.bonsai.root', this.garden.root);
      }
      // lint options
      // todo: update bonsai opts too...
      const curLintIndentKind: string = getConfigProperty('wikibonsai.lint.indentKind', 'space');
      if (this.lint.indent_kind !== curLintIndentKind) {
        updateConfigProperty('wikibonsai.lint.indentKind', this.lint.indent_kind);
      }
      const curLintIndentSize: number = getConfigProperty('wikibonsai.lint.indentSize', 2);
      if (this.lint.indent_size !== curLintIndentSize) {
        updateConfigProperty('wikibonsai.lint.indentSize', this.lint.indent_size);
      }
      const curLintMkdnBullet: boolean = getConfigProperty('wikibonsai.lint.mkdnBullet', true);
      if (this.lint.mkdn_bullet !== curLintMkdnBullet) {
        updateConfigProperty('wikibonsai.lint.mkdnBullet', this.lint.mkdn_bullet);
      }
      const curLintWikiLink: boolean = getConfigProperty('wikibonsai.lint.wikiLink', true);
      if (this.lint.wikilink !== curLintWikiLink) {
        updateConfigProperty('wikibonsai.lint.wikiLink', this.lint.wikilink);
      }
    } catch (e: any) {
      logger.error(e);
      return false;
    }
    return true;
  }

  public async setConfigFileUri(): Promise<string | undefined> {
    if (!this.wsDir) {
      logger.error('no workspace directory found');
      return;
    }
    const configFileName: string = getConfigProperty('wikibonsai.file.config', DEFAULT_CONFIG_FILE);
    const configFileVscUris: vscode.Uri[] | undefined = await vscode.workspace.findFiles('**/**/' + configFileName);
    if (!configFileVscUris || (configFileVscUris.length === 0)) { return; }
    return configFileVscUris[0].toString();
  }

  public async getText(): Promise<string | undefined> {
    if (this.configFileUri === undefined) { return undefined; }
    const docVscUri: vscode.Uri = vscode.Uri.parse(this.configFileUri);
    const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(docVscUri);
    return doc.getText();
  }

  // update 'attrs' config in config file
  public async updateConfigAttrs(value: string): Promise<void> {
    if (this.configFileUri === undefined) { return; }
    try {
      const docVscUri: vscode.Uri = vscode.Uri.parse(this.configFileUri);
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(docVscUri);
      const docText: string | undefined = await this.getText();
      if (docText === undefined) { return; }
      const tomlMatch: RegExpExecArray | null = this.RGX_TOML_ATTRS.exec(docText);
      if (tomlMatch !== null) {
        // match values
        const pad1: string = tomlMatch[1];
        const pad2: string = tomlMatch[2];
        const quoteOpen: string = tomlMatch[3];
        const quoteClose: string = tomlMatch[5];
        // indices
        const start: vscode.Position = doc.positionAt(tomlMatch.index);
        const end: vscode.Position = doc.positionAt(tomlMatch.index + tomlMatch[0].length);
        const updatedText: string = 'attrs' + pad1 + '=' + pad2 + quoteOpen + value + quoteClose;
        // edit
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
        vscode.workspace.applyEdit(edit);
      }
      const yamlMatch: RegExpExecArray | null = this.RGX_YAML_ATTRS.exec(docText);
      if (yamlMatch !== null) {
        // match values
        const pad: string = yamlMatch[1];
        const quoteOpen: string = yamlMatch[2] ? yamlMatch[2] : '';
        const quoteClose: string = yamlMatch[4] ? yamlMatch[4] : '';
        // indices
        const start: vscode.Position = doc.positionAt(yamlMatch.index);
        const end: vscode.Position = doc.positionAt(yamlMatch.index + yamlMatch[0].length);
        const updatedText: string = 'attrs' + ':' + pad + quoteOpen + value + quoteClose;
        // edit
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
        vscode.workspace.applyEdit(edit);
      }
      await vscode.workspace.saveAll();
    } catch (e: any) {
      logger.error(e);
    }
  }

  public async updateConfigRoot(value: string): Promise<void> {
    if (this.configFileUri === undefined) { return; }
    try {
      const docVscUri: vscode.Uri = vscode.Uri.parse(this.configFileUri);
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(docVscUri);
      const docText: string | undefined = await this.getText();
      if (docText === undefined) { return; }
      const tomlMatch: RegExpExecArray | null = this.RGX_TOML_ROOT.exec(docText);
      if (tomlMatch !== null) {
        // match values
        const pad1: string = tomlMatch[1];
        const pad2: string = tomlMatch[2];
        const quoteOpen: string = tomlMatch[3];
        const quoteClose: string = tomlMatch[5];
        // indices
        const start: vscode.Position = doc.positionAt(tomlMatch.index);
        const end: vscode.Position = doc.positionAt(tomlMatch.index + tomlMatch[0].length);
        const updatedText: string = 'root' + pad1 + '=' + pad2 + quoteOpen + value + quoteClose;
        // edit
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
        vscode.workspace.applyEdit(edit);
      }
      const yamlMatch: RegExpExecArray | null = this.RGX_YAML_ROOT.exec(docText);
      if (yamlMatch !== null) {
        // match values
        const pad: string = yamlMatch[1];
        const quoteOpen: string = yamlMatch[2] ? yamlMatch[2] : '';
        const quoteClose: string = yamlMatch[4] ? yamlMatch[4] : '';
        // indices
        const start: vscode.Position = doc.positionAt(yamlMatch.index);
        const end: vscode.Position = doc.positionAt(yamlMatch.index + yamlMatch[0].length);
        const updatedText: string = 'root' + ':' + pad + quoteOpen + value + quoteClose;
        // edit
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
        vscode.workspace.applyEdit(edit);
      }
      await vscode.workspace.saveAll();
    } catch (e: any) {
      logger.error(e);
    }
  }

  // update 'lint' config in config file
  public async updateConfigLint(key: string, value: any): Promise<void> {
    if (this.configFileUri === undefined) { return; }
    try {
      const docVscUri: vscode.Uri = vscode.Uri.parse(this.configFileUri);
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(docVscUri);
      const docText: string | undefined = await this.getText();
      if (docText === undefined) { return; }
      let updatedText: string | undefined;
      let match: RegExpExecArray | null = null;
      if (Utils.extname(docVscUri) === EXT_TOML) {
        const regex: RegExp = new RegExp(`^(\\s*)${key}(\\s*)=(\\s*)(["']?)(.*?)\\4\\s*$`, 'm');
        match = regex.exec(docText);
        if (match !== null) {
          const pad1: string = match[1];
          const pad2: string = match[2];
          const pad3: string = match[3];
          const quote: string = match[4];
          updatedText = `${pad1}${key}${pad2}=${pad3}${quote}${value}${quote}`;
        }
      } else if (isYaml(Utils.extname(docVscUri))) {
        const regex: RegExp = new RegExp(`^(\\s*)${key}(\\s*):(\\s*)(["']?)(.*?)\\4\\s*$`, 'm');
        match = regex.exec(docText);
        if (match !== null) {
          const pad1: string = match[1];
          const pad2: string = match[2];
          const pad3: string = match[3];
          const quote: string = match[4] ? match[4] : '';
          updatedText = `${pad1}${key}${pad2}:${pad3}${quote}${value}${quote}`;
        }
      }
      if (match !== null && updatedText !== undefined) {
        const start: vscode.Position = doc.positionAt(match.index);
        const end: vscode.Position = doc.positionAt(match.index + match[0].length);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start, end), updatedText);
        await vscode.workspace.applyEdit(edit);
        await vscode.workspace.saveAll();
      }
    } catch (e: any) {
      logger.error(e);
    }
  }
}