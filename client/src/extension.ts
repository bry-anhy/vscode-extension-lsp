/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	console.log('LOG: REGISTER context custom context menu');
	const disposable = vscode.commands.registerCommand('extension.generateTestCode', () => {
		vscode.window.showInformationMessage('Function detected! Custom action triggered!');
	});

	context.subscriptions.push(disposable);

	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for php documents
		documentSelector: [{ scheme: 'file', language: 'php' }],
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();

	// Register the event ChangeTextEditorSelection
	vscode.window.onDidChangeTextEditorSelection(async (event) => {
		console.log('LOG: onDidChangeTextEditorSelection');

		const editor = event.textEditor;
		if (!editor || editor.document.languageId !== 'php') { return; }

		const position = editor.selection.active;
		const response = await client.sendRequest('custom/functionDetection', {
			textDocument: { uri: editor.document.uri.toString() },
			position: { line: position.line, character: position.character }
		});
		
		console.log('LOG: response[vscode-lsp.function]', response['vscode-lsp.function']);
		if (response && response['vscode-lsp.function']) {
			vscode.commands.executeCommand('setContext', 'vscode-lsp.function', true);
		} else {
			vscode.commands.executeCommand('setContext', 'vscode-lsp.function', false);
		}
	});

	
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
