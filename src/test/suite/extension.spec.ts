import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';


const EXTENSION_ID = 'manunamz.vscode-wikibonsai';

describe('vscode-wikibonsai extension', () => {

  it('in extensions list', () => {
    console.log('extensions: ', vscode.extensions);
    assert.strictEqual(
      vscode.extensions.all.some((extension) => extension.id === EXTENSION_ID),
      true,
    );
  });

  it('active on markdown ready', () => {
    const extension = vscode.extensions.all.find(
      (extension) => extension.id === EXTENSION_ID
    );
    assert.strictEqual(extension?.isActive, true);
  });

});
