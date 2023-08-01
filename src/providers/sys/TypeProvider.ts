import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

import { merge } from 'lodash';

const luxon = require('luxon');
const toml = require('@iarna/toml');
const yaml = require('js-yaml');

import { NODE } from 'caudex';

import { getConfigProperty } from '../../config';
import logger from '../../util/logger';
import {
  ATTR_NODETYPE,
  DEFAULT_DOCTYPE_FILE,
  EXT_MD,
  EXT_TOML,
  isYaml,
} from '../../util/const';
import { ConfigProvider } from './ConfigProvider';


// precedence: prefix > attr > path
export interface DocOpts {
  path?: string;
  attr?: string; // attr value given by either caml or yaml
  prefix?: string;
  suffix?: string;
  vscUri?: vscode.Uri;
  color?: string;
  template?: string;
  emoji?: string;
  // 'index'-type-only
  root?: string;
}

interface DocOptsIndex {
  [key: string]: DocOpts;
}

export interface TemplateItem {
  type: string;
  vscUri: vscode.Uri;
}

export class TypeProvider {
  private wsDir: vscode.Uri | undefined;
  // file locations
  private tmplLocation: vscode.Uri | undefined;
  public typesFileUri: string | undefined;
  // objects
  public kindOpts: DocOptsIndex;
  public typeOpts: DocOptsIndex | undefined;

  constructor(config: ConfigProvider) {
    this.kindOpts = config.doc.kind;
  }

  public async build(wsDir?: vscode.Uri): Promise<boolean> {
    logger.debug('TypeProvider.build()');
    if (wsDir) { this.wsDir = wsDir; }
    if (!this.wsDir) { return false; }
    // prep
    this.typesFileUri = await this.setTypesFileUri();
    if (!this.typesFileUri) { return false; }
    try {
      const docVscUri: vscode.Uri = vscode.Uri.parse(this.typesFileUri);
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(docVscUri);
      const docText: string = doc.getText();
      // init
      if (Utils.extname(docVscUri) === EXT_TOML) {
        const data: any = toml.parse(docText);
        this.kindOpts = merge(this.kindOpts, data.kind);
        delete data.kind;
        this.typeOpts = data;
      }
      if (isYaml(Utils.extname(docVscUri))) {
        const data: any = yaml.load(docText);
        this.kindOpts = merge(this.kindOpts, data.kind);
        delete data.kind;
        this.typeOpts = data;
      }
      // grab template kind
      let tmplPrefix: string | undefined;
      // set location of template files
      if (this.kindOpts.template && this.kindOpts.template.path) {
        this.tmplLocation = vscode.Uri.joinPath(this.wsDir, this.kindOpts.template.path);
        tmplPrefix = this.kindOpts.template.prefix;
      }
      // setup templates for types
      if (this.typeOpts) {
        // set vscUris for each type's template location
        for (const [type, opts] of Object.entries(this.typeOpts)) {
          // set template file location (vscUri)
          let tmplPath: string = '**/**/';
          if (tmplPrefix) {
            tmplPath += tmplPrefix;
          }
          // if type has custom template
          if (opts.template) {
            tmplPath += opts.template + EXT_MD;
          // default
          } else {
            tmplPath += type + EXT_MD;
          }
          const tmplVscUri: vscode.Uri[] = await vscode.workspace.findFiles(tmplPath);
          if (tmplVscUri.length !== 0) {
            opts.vscUri = tmplVscUri[0];
          }
        }
      }
    } catch (e: any) {
      logger.error(e);
      return false;
    }
    // return
    return true;
  }

  public async setTypesFileUri(): Promise<string | undefined> {
    if (!this.wsDir) {
      logger.error('no workspace directory found');
      return;
    }
    const docTypeFileName: string = getConfigProperty('wikibonsai.file.doc-types', DEFAULT_DOCTYPE_FILE);
    const docTypeFileVscUris: vscode.Uri[] | undefined = await vscode.workspace.findFiles('**/**/' + docTypeFileName);
    if (!docTypeFileVscUris || (docTypeFileVscUris.length === 0)) { return; }
    return docTypeFileVscUris[0].toString();
  }

  public useTypes(): boolean {
    return (this.typeOpts !== undefined) && (Object.keys(this.typeOpts).length !== 0);
  }

  // properties

  private getRgxIDFormat() {
    const alphabet: string = getConfigProperty('wikibonsai.file.name.opts.id.alpha', 'abcdefghijklmnopqrstuvwxyz0123456789');
    const size: number = getConfigProperty('wikibonsai.file.name.opts.id.size', 6);
    return new RegExp('[' + alphabet + ']' + '{' + String(size) + '}');
  }

  get default(): DocOpts | undefined {
    if (!this.hasTypes()) { return; }
    // @ts-expect-error: hasTypes()
    return this.typeOpts[NODE.TYPE.DEFAULT];
  }

  public async tmplItems(): Promise<TemplateItem[]> {
    if (!this.hasTypes()) { return []; }
    if (!this.tmplLocation) {
      console.debug('no templates defined in doctype file');
      return [];
    }
    /* eslint-disable indent */
    // @ts-expect-error: hasTypes()
    return Object.keys(this.typeOpts)
                                          // @ts-expect-error: hasTypes()
                 .filter((type: string) => this.typeOpts[type].vscUri)
                 .map((type: string) => {
                    return {
                      type: type,
                              // @ts-expect-error: hasTypes()
                      vscUri: this.typeOpts[type].vscUri,
                    } as TemplateItem;
                 });
    /* eslint-enable indent */
  }

  public affixes(): string[] {
    if (!this.hasTypes()) { return []; }
    // @ts-expect-error: hasTypes()
    return ([] as string[]).concat(this.prefixes).concat(this.suffixes);
  }

  // todo: build a prefixes/suffixes regex to check for all type possibilities in a single exec

  public prefixes(): string[] {
    if (!this.hasTypes()) { return []; }
    /* eslint-disable indent */
    // @ts-expect-error: hasTypes()
    return Object.values(this.typeOpts)
                 .filter((type: DocOpts) => type.prefix)
                 .map((type: DocOpts) => type.prefix);
    /* eslint-enable indent */
  }

  public suffixes(): string[] {
    if (!this.hasTypes()) { return []; }
    /* eslint-disable indent */
    // @ts-expect-error: hasTypes()
    return Object.values(this.typeOpts)
                 .filter((type: DocOpts) => type.suffix)
                 .map((type: DocOpts) => type.suffix);
    /* eslint-enable indent */
  }

  public typeNames(): string[] {
    if (!this.hasTypes()) { return []; }
    // @ts-expect-error: hasTypes()
    return Object.keys(this.typeOpts);
  }

  // methods

  public hasKinds(): boolean {
    if (!this.kindOpts) {
      logger.warn('TypeProvider.hasKinds() -- no kinds found');
      return false;
    }
    return true;
  }

  public hasTypes(): boolean {
    if (!this.typeOpts) {
      logger.warn('TypeProvider.hasKinds() -- no types found');
      return false;
    }
    return true;
  }

  // todo: init optional params internally to method
  // precedence: prefix > attr > path
  public resolve(filename: string, uri?: string, attrs?: any): string {
    if (!this.hasTypes()) { return NODE.TYPE.DEFAULT; }
    const paths: string[][] = [];
    // order of precedence:
    // prefix > attr metadata > directory
    // @ts-expect-error: hasTypes()
    for (const [type, opts] of Object.entries(this.typeOpts)) {
      // filename prefix
      if (opts.prefix) {
        const prefix: string = opts.prefix;
        const filenameContainsPrefix: boolean = (filename.indexOf(prefix) === 0);
        const placeholderRegex: RegExp = this.convertPlaceholderToRgx(prefix);
        const filenameContainsPrefixWithPlaceholder: boolean = placeholderRegex.test(filename);
        if (filenameContainsPrefix || filenameContainsPrefixWithPlaceholder) {
          return type;
        }
      }
      // attribute
      if (attrs && opts.attr) {
        for (const key of Object.keys(attrs)) {
          if (key === ATTR_NODETYPE) {
            return type;
          }
        }
      }
      // path / directory
      // todo: globs
      if (uri && opts.path && this.wsDir) {
        const typeDirUri: string = vscode.Uri.joinPath(this.wsDir, opts.path).toString();
        if (uri.indexOf(typeDirUri) === 0) {
          paths.push([type, typeDirUri]);
        }
      }
    }
    // return 'type' whose 'path' has the most specificity
    if (paths.length > 0) {
      return paths.reduce((a, b) => a[1].length > b[1].length ? a : b)[0];
    }
    return NODE.TYPE.DEFAULT;
  }

  // affix utils

  public hasAffix(filename: string): [string, string] {
    if (!this.hasTypes()) { return ['', '']; }
    const affixedFilename: string = filename;
    let unfixedFilename: string = filename;
    for (const prefix of this.prefixes()) {
      if (filename.indexOf(prefix) === 0) {
        unfixedFilename = this.stripAffixes(filename, prefix, undefined);
        return [unfixedFilename, affixedFilename];
      }
    }
    for (const suffix of this.suffixes()) {
      if (filename.indexOf(suffix) === (filename.length - suffix.length)) {
        unfixedFilename = this.stripAffixes(filename, undefined, suffix);
        return [unfixedFilename, affixedFilename];
      }
    }
    return [unfixedFilename, affixedFilename];
  }

  public async addAffixes(filename: string, prefix: string | undefined, suffix: string | undefined): Promise<string> {
    if (!this.hasTypes()) { return ''; }
    if (prefix) { prefix = await this.fillPlaceholderData(prefix); }
    if (suffix) { suffix = await this.fillPlaceholderData(suffix); }
    const hasPrefix: boolean = ((prefix !== undefined) && (filename.indexOf(prefix) === 0));
    const hasSuffix: boolean = ((suffix !== undefined) && (filename.indexOf(suffix) > 0) && (filename.indexOf(suffix) === (filename.length - suffix.length)));
    let affixedFilename: string = filename;
    if ((prefix !== undefined) && !hasPrefix) {
      affixedFilename = prefix + affixedFilename;
    }
    if ((suffix !== undefined) && !hasSuffix) {
      affixedFilename = affixedFilename + suffix;
    }
    return affixedFilename;
  }

  public stripAffixes(filename: string, prefix: string | undefined, suffix: string | undefined): string {
    if (!this.hasTypes()) { return ''; }
    let rgxPrefix: RegExp | undefined;
    let rgxSuffix: RegExp | undefined;
    if (prefix) { rgxPrefix = this.convertPlaceholderToRgx(prefix); }
    if (suffix) { rgxSuffix = this.convertPlaceholderToRgx(suffix); }
    const hasPrefix: boolean = ((prefix !== undefined) && (filename.indexOf(prefix) === 0));
    const hasSuffix: boolean = ((suffix !== undefined) && (filename.indexOf(suffix) > 0) && (filename.indexOf(suffix) === (filename.length - suffix.length)));
    let unfixedFilename: string = filename;
    if (rgxPrefix !== undefined && hasPrefix) {
      unfixedFilename = unfixedFilename.replace(rgxPrefix, '');
    }
    if (rgxSuffix !== undefined && hasSuffix) {
      unfixedFilename = unfixedFilename.replace(rgxSuffix, '');
    }
    return unfixedFilename;
  }

  // placeholder utils

  public padZero(num: number): string {
    return (num < 10) ? '0' + num.toString() : num.toString();
  }

  public async fillPlaceholderData(str: string): Promise<string> {
    const id: string = await vscode.commands.executeCommand('wikibonsai.genID.fname');
    const now = luxon.DateTime.local(luxon.DateTime.now());
    /* eslint-disable indent */
    return str.replace(/(?::id)/, id)
              .replace(/(?::date)/, now.year.toString() + '-' + this.padZero(now.month) + '-' + this.padZero(now.day))
              .replace(/(?::year)/, now.year.toString())
              .replace(/(?::month)/, this.padZero(now.month))
              .replace(/(?::day)/, this.padZero(now.day))
              .replace(/(?::hour)/, this.padZero(now.hour))
              .replace(/(?::minute)/, this.padZero(now.minute));
    /* eslint-enable indent */
  }

  // i have a bad feeling this is going to breed bugs...👀
  public convertPlaceholderToRgx(str: string): RegExp {
    /* eslint-disable indent */
    return new RegExp(str.replace('.', '\\.')
                          .replace(/(?::id)/, this.getRgxIDFormat().source)
                          .replace(/(?::date)/, '\\d{4}-\\d{2}-\\d{2}')
                          .replace(/(?::year)/, '\\d{4}')
                          .replace(/(?::month)/, '\\d{2}')
                          .replace(/(?::day)/, '\\d{2}')
                          .replace(/(?::hour)/, '\\d{2}')
                          .replace(/(?::minute)/, '\\d{2}'));
    /* eslint-enable indent */
  }
}