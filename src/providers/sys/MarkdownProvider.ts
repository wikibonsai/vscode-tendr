import * as vscode from 'vscode';

import MarkdownIt from 'markdown-it';

// import createArgdownPlugin from "@argdown/markdown-it-plugin";

import * as wikirefs from 'wikirefs';
import { NODE, Node, REL } from 'caudex';

import logger from '../../util/logger';
import { getConfigProperty } from '../../config';
import { getAbsPathInWorkspace } from '../../util/wrapVSCode';
import { IndexProvider } from './IndexProvider';


export class MarkdownProvider {
  private index: IndexProvider;

  // argdown: https://github.com/christianvoigt/argdown/tree/master/packages/argdown-markdown-it-plugin
  // private arg     = require('@argdown/markdown-it-plugin').default;
  // private arg     = createArgdownPlugin(env => {
  //                                         return env.argdownConfig;
  //                                       });
  private caml      = require('markdown-it-caml').default;
  // note: mermaid requires more setup: https://github.com/mjbvz/vscode-markdown-mermaid/
  private diagram   = require('markdown-it-textual-uml');
  // private chart     = require('markvis');
  private critic    = require('markdown-it-criticmarkup');
  private foot      = require('markdown-it-footnote');
  private highlight = require('markdown-it-highlightjs');
  // todo: "...plugin Error: jQuery requires a window with a document" in "...vextab/releases/vextab-div.js:1075:1"
  // private music     = require('markdown-it-music');
  private wiki     = require('markdown-it-wikirefs').default;

  constructor(index: IndexProvider) {
    logger.debug('creating MarkdownProvider...');
    this.index = index;
    logger.debug('...MarkdownProvider created');
  }

  public buildMarkdownIt(md: any): MarkdownIt {
    logger.debug('build MarkdownProvider');
    /* eslint-disable indent */
    return md.use(this.caml, this.optsCaml())
            //  .use(this.chart, this.optsChart(md))
             .use(this.critic, this.optsCritic())
             .use(this.diagram, this.optsDiagram())
             .use(this.foot, this.optsFootNote())
             .use(this.highlight, this.optsHighlight())
            //  .use(this.music, this.optsMusic())
             .use(this.wiki, this.optsWikiRefs(md));
    /* eslint-enable indent */
  }

  // options

  public optsCaml(): any {
    return {
      attrs: {
        render: getConfigProperty('wikibonsai.attrs.caml.opts.render.enabled', false),
      },
    };
  }

  public optsChart(): any {
    return {};
  }

  public optsCritic(): any {
    return {};
  }

  public optsDiagram(): any {
    return {};
  }

  public optsFootNote(): any {
    return {};
  }

  public optsHighlight(): any {
    return {};
  }

  public optsWikiRefs(md: any): any {
    return {
      // render
      resolveHtmlText: (env: any, filename: string): string | undefined => {
        const node: Node | undefined = this.index.find('filename', filename);
        if (node !== undefined) { return node.data.title; }
      },
      resolveHtmlHref: (env: any, filename: string): string | undefined => {
        if (!wikirefs.isMedia(filename)) {
          const node: Node | undefined = this.index.find('filename', filename);
          if (node !== undefined) {
            if (node.kind === NODE.KIND.ZOMBIE) { return; }
            const vscUri: vscode.Uri = vscode.Uri.parse(node.data.uri);
            return getAbsPathInWorkspace(vscUri);
          }
        // media for embeds
        } else {
          return this.index.cacheMedia[filename];
        }
      },
      resolveDocType: (env: any, filename: string): string | undefined => {
        const node: Node | undefined = this.index.find('filename', filename);
        return node?.type;
      },
      resolveEmbedContent: (env: any, filename: string): (string | undefined) => {
        // markdown-only
        if (wikirefs.isMedia(filename)) { return; }
        // cycle detection
        if (!env.cycleStack) {
          env.cycleStack = [];
        } else {
          if (env.cycleStack.includes(filename)) {
            delete env.cycleStack;
            return '♻️ cycle detected';
          }
        }
        env.cycleStack.push(filename);
        // get content
        let htmlContent: string | undefined;
        const node: Node | undefined = this.index.find('filename', filename);
        if (!node || (node.kind === NODE.KIND.ZOMBIE)) {
          delete env.cycleStack;
          return '🧟';
        }
        const mkdnContent: string | undefined = this.index.cacheContent[filename];
        if (mkdnContent === undefined) {
          htmlContent = undefined;
        } else if (mkdnContent.length === 0) {
          htmlContent = '';
        } else {
          htmlContent = md.render(mkdnContent, env);
        }
        delete env.cycleStack;
        return htmlContent;
      },
      // metadata
      prepFile: (env: any): void => {
        // don't perform metadata executions on embedded documents
        if (!env.cycleStack) {
          const vscUri: vscode.Uri = env.currentDocument;
          const node: Node | undefined = this.index.find('uri', vscUri.toString());
          if (node === undefined) {
            logger.warn(`node does not exist for file: ${vscUri.toString()}`);
            return;
          } else {
            this.index.flushRelRefs(node.id);
          }
        }
      },
      addAttr: (env: any, attrtype: string, target: string): void => {
        // don't perform metadata executions on embedded documents
        if (!env.cycleStack) {
          if (!wikirefs.isMedia(target)) {
            const vscUri: vscode.Uri = env.currentDocument;
            const uri: string = vscUri.toString();
            const sourceNode: Node | undefined = this.index.find('uri', uri);
            let targetNode: Node | undefined = this.index.find('filename', target);
            // if file not in index, add zombie node
            if (sourceNode && !targetNode && target) {
              targetNode = this.index.add(target);
              if (!targetNode) {
                logger.warn(`MarkdownProvider.wikirefs.addAttr: connection failed -- problem with 'target': ${target} in file: ${uri}`);
                return;
              }
            }
            if (sourceNode && targetNode) {
              if (this.index.connect(REL.REF.ATTR, sourceNode.id, targetNode.id, attrtype)) {
                logger.verbose(`MarkdownProvider.wikirefs.addAttr -- connection succeeded for 'source': "${sourceNode.data.filename}" to 'target': "${target}" with 'type': "${attrtype}"`);
                return;
              }
            }
            logger.warn(`MarkdownProvider.wikirefs.addAttr: connection failed for source 'uri': "${uri}" to target: "${target}" with 'type' "${attrtype}"`);
          }
        }
      },
      addLink: (env: any, linktype: string, target: string): void => {
        // don't perform metadata executions on embedded documents
        if (!env.cycleStack) {
          if (!wikirefs.isMedia(target)) {
            const vscUri: vscode.Uri = env.currentDocument;
            const uri: string = vscUri.toString();
            const sourceNode: Node | undefined = this.index.find('uri', uri);
            let targetNode: Node | undefined = this.index.find('filename', target);
            // if file not in index, add zombie node
            if (sourceNode && !targetNode && target) {
              targetNode = this.index.add(target);
              if (!targetNode) {
                logger.warn(`MarkdownProvider.wikirefs.addLink: connection failed -- problem with 'target': ${target} in file: ${uri}`);
                return;
              }
            }
            if (sourceNode && targetNode) {
              if (this.index.connect(REL.REF.LINK, sourceNode.id, targetNode.id, linktype)) {
                logger.verbose(`MarkdownProvider.wikirefs.addLink -- connection succeeded for 'source': "${sourceNode.data.filename}" to 'target': "${target}" with 'type': "${linktype}"`);
                return;
              }
            }
            logger.warn(`MarkdownProvider.wikirefs.addLink: connection failed for source 'uri': "${uri}" to target: "${target}" with 'type' "${linktype}"`);
          }
        }
      },
      addEmbed: (env: any, target: string): void => {
        // don't perform metadata executions on embedded documents
        // (when an embed occurs, the embedded doc is instantly added to the 'cycleStack', so that should be allowed to pass through)
        if (!env.cycleStack || ((env.cycleStack.length === 1) && env.cycleStack[0] === target)) {
          // todo: add media...?
          // note: only tracking markdown in index/graph for now.
          if (!wikirefs.isMedia(target)) {
            const vscUri: vscode.Uri = env.currentDocument;
            const uri: string = vscUri.toString();
            const sourceNode: Node | undefined = this.index.find('uri', uri);
            let targetNode: Node | undefined = this.index.find('filename', target);
            // if file not in index, add zombie node
            if (sourceNode && !targetNode && target) {
              targetNode = this.index.add(target);
              if (!targetNode) {
                logger.warn(`MarkdownProvider.wikirefs.addEmbed: connection failed -- problem with 'target': ${target} in file: ${uri}`);
                return;
              }
            }
            if (sourceNode && targetNode) {
              if (this.index.connect(REL.REF.EMBED, sourceNode.id, targetNode.id)) {
                logger.verbose(`MarkdownProvider.wikirefs.addEmbed -- connection succeeded for 'source': "${sourceNode.data.filename}" to 'target': "${target}"`);
                return;
              }
            }
            logger.warn(`MarkdownProvider.wikirefs.addEmbed -- connection failed for source 'uri': "${uri}" to target: "${target}"`);
          }
        }
      },
    };
  }
}
