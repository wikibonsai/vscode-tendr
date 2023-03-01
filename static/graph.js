window.onload = () => {
  try {
    const vscode = acquireVsCodeApi();
    var activeDocURI = undefined;

    // from: 
    //   - json file: https://github.com/Microsoft/vscode/blob/31f86f72bd027dc90347bf7459111550604582b4/extensions/theme-monokai/themes/monokai-color-theme.json
    //   - builder: https://github.com/microsoft/vscode/blob/5f3e9c120a4407de3e55465588ce788618526eb0/src/vs/platform/theme/common/colorRegistry.ts#L34
    // export function asCssVariableName(colorIdent: ColorIdentifier): string {
    //   return `--vscode-${colorIdent.replace(/\./g, '-')}`;
    // }

    var graphOpts = {
      ctrls: {
        exclude: ['kind'],
      },
      current: (node) => node.uri === activeDocURI,
      colors: {
        background: getComputedStyle(document.documentElement).getPropertyValue('--vscode-editorHoverWidget-background'),
        text      : getComputedStyle(document.documentElement).getPropertyValue('--vscode-editorLineNumber-activeForeground'),
        band      : getComputedStyle(document.documentElement).getPropertyValue('--vscode-editorLineNumber-foreground'),
        current   : getComputedStyle(document.documentElement).getPropertyValue('--vscode-panelTitle-activeBorder'),
        link      : getComputedStyle(document.documentElement).getPropertyValue('--vscode-editorLineNumber-foreground'),
        particle  : getComputedStyle(document.documentElement).getPropertyValue('--vscode-terminal-ansiBlue'),
      },
    };

    class VSCodeGraph extends TreeHouze {

      isZombie(node) {
        return node.kind === 'zombie';
      }

      // actions

      updateDim(value) {
        super.updateDim(value);
        vscode.postMessage({
          type: 'updateDim',
          payload: this.dim, // should equal 'value' now
        });
      }

      updateFixActive(value) {
        super.updateFixActive(value);
        vscode.postMessage({
          type: 'updateFix',
          payload: this.isFixActive, // should equal 'value' now
        });
      }

      updateFollowActive(value) {
        super.updateFollowActive(value);
        vscode.postMessage({
          type: 'updateFollow',
          payload: this.isFollowActive, // should equal 'value' now
        });
      }

      updateSyncActive(value) {
        super.updateSyncActive(value);
        vscode.postMessage({
          type: 'updateSync',
          payload: this.isSyncActive, // should equal 'value' now
        });
      }

      autosync() {
        if (this.kind === 'tree') {
          vscode.postMessage({
            type: 'syncTree',
          });
        }
        if (this.kind === 'web') {
          vscode.postMessage({
            type: 'syncWeb',
          });
        }
      }

      save() {
        let data = {};
        for (let node of this.dataCache['nodes']) {
          if (node.coord && !this.isZombie(node)) {
            data[node.filename] = node.coord;
          }
        }
        vscode.postMessage({
          type: 'saveCoords',
          payload: {
            data: data,
            filename: this.coordCacheFileName,
          }
        });
      }

      sync() {
        if (this.kind === 'tree') {
          vscode.postMessage({
            type: 'syncTree',
          });
        }
        if (this.kind === 'web') {
          vscode.postMessage({
            type: 'syncWeb',
          });
        }
      }

      onClickNode(d, e) {
        // ar/vr do not emit 'e' events
        if (this.isClickActive && e) {
          const macKey = (e.metaKey);
          const winKey = (e.ctrlKey);
          // (de)select node
          if (this.isSelectActive && e.shiftKey) {
            if (!this.selectedNodes.has(d)) {
              this.selectedNodes.add(d);
            } else {
              this.selectedNodes.delete(d);
            }
          // cmd/ctrl+click to open node's document
          } else if (macKey || winKey) {
            // ctrl/cmd+click click creates new doc from zombie
            if (this.isZombie(d)) {
              vscode.postMessage({
                type: 'createNode',
                payload: d.label,
              });
            // ctrl/cmd+click click opens existing doc
            } else {
              vscode.postMessage({
                type: 'openNode',
                payload: d.uri,
              });
            }
          // default: center node in graph
          } else {
            this.centerNode(d);
          }
          return true;
        }
      }

      getNodeFromURI(uri) {
        let { nodes, links } = this.graph.graphData();
        return nodes.find((n) => n.uri === uri);
      }
    }

    const elementWrap = document.getElementById('graph-view');
    const elementGraph = document.getElementById('graph');
    var graph = new VSCodeGraph(elementWrap, elementGraph, graphOpts);

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
      // draw graph messages
      case 'drawWeb': {
        graph.kind = 'web';
        graph.dim = message.payload.dim;
        graph.draw(message.payload.data, message.payload.opts);
        graph.coordCacheFileName = message.payload.coordFileName;
        break;
      }
      case 'drawTree': {
        graph.kind = 'tree';
        graph.dim = message.payload.dim;
        graph.draw(message.payload.data, message.payload.opts);
        graph.coordCacheFileName = message.payload.coordFileName;
        break;
      }
      // commands
      case 'toggleDim': {
        graph.dim = message.payload;
        break;
      }
      case 'toggleFix': {
        graph.updateFixActive(message.payload);
        // todo: update tweakpane input too
        // graph.fixInput.dispatchEvent('change');
        break;
      }
      case 'toggleFollow': {
        graph.updateFollowActive(message.payload);
        // todo: update tweakpane input too
        // graph.followInput.dispatchEvent('change');
        break;
      }
      // graph action messages
      case 'updateFocusNode': {
        activeDocURI = message.payload;
        let node = graph.getNodeFromURI(message.payload);
        if (node && graph.isFollowActive) { graph.centerNode(node); }
        break;
      }
      case 'updateData': {
        // todo: update data without redrawing entire graph
        // graph.graphData(message.payload);
        graph.draw(message.payload);
        // todo: granular updates
        break;
      }
      default: {
        console.warn(`unknown message type: ${message.type}`);
        break;
      }
      }
    });
  } catch (e) {
    console.error(`graph assets failed to load: ${JSON.stringify(e)}`);
    console.error(e);
  }
};
