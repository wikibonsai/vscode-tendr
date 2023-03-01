# Contributing

## Project Structure

```
src
 ├── items        :: vscode items (CompletionItem, QuickPickItem, TreeItem, etc.)
 ├── providers    :: provider classes
 ├── test         :: contains some boilerplate for testing
 ├── util         :: utility functions used around the extension
 ├── config.ts    :: list of extension configs
 ├── commands.ts  :: list of extension commands
 └── extension.ts :: main extension runner
```

## Convention

`vscode-wikibonsai` abides by the [OO paradigm](https://en.wikipedia.org/wiki/Object-oriented_programming) because the vscode plugin API encourages the use of Provider classes that oversee the interactions between vscode and plugins. That said, as much functionality as possible is modularized into other packages and follows the [FP paradigm](https://en.wikipedia.org/wiki/Functional_programming) due to [its benefits in reduced complexity](https://www.youtube.com/watch?v=I845O57ZSy4&t=844s).

So in the end, `vscode-wikibonsai` acts as an OO-style adapter between vscode provider classes and FP-style mini-services.

## Commits

See [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)

## Develop

Clone repo:

```
$ git clone git@github.com:wikibonsai/vscode-wikibonsai.git
```

Install deps:

```
$ yarn install
```

Run extension from the [vscode debugger](https://code.visualstudio.com/docs/editor/debugging#:~:text=To%20bring%20up%20the%20Run,debugging%20commands%20and%20configuration%20settings.) with the following configuration:

```json
{
	"version": "0.2.0",
	"configurations": [
		{
			"name": "Run Extension",
			"type": "extensionHost",
			"request": "launch",
			"args": [
				"--extensionDevelopmentPath=${workspaceFolder}"
			],
			"outFiles": [
				"${workspaceFolder}/dist/**/*.js"
			],
			"preLaunchTask": "${defaultBuildTask}"
		},
}
```

## Packaging

[Packaging docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)

```
$ vsce package
```

## Releasing and Publishing

_You can skip this section if your contribution comes via PR from a forked repository._

[Publishing docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

```
$ vsce publish
```
