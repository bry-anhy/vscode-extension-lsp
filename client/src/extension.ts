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
	const disposable = vscode.commands.registerCommand("extension.generateTestCode", async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor!");
			return;
		}

		const document = editor.document;
		const cursorPosition = editor.selection.active; // Vị trí con trỏ
		console.log('LOG: cursorPosition', cursorPosition);

		// Tìm function chứa con trỏ
		const functionText = getFunctionAtCursor(document, cursorPosition);

		if (!functionText) {
			vscode.window.showErrorMessage("No function found!");
			return;
		}

		// Gửi nội dung function lên server LSP
		const result = await client.sendRequest("myLanguageServer.processFunction", functionText);

		vscode.window.showInformationMessage(`${result}`);
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
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

/**
 * Tìm function chứa con trỏ
 */
function getFunctionAtCursor(document: vscode.TextDocument, position: vscode.Position): string | null {
	const text = document.getText();
	//console.log('LOG: text', text);
	const lines = text.split("\n");

	let functionStart = -1;
	let functionEnd = -1;
	let bracketCount = 0;

	console.log('LOG: position', position.line);
	//const functionRegex = /^\s*(public|protected|private|static)?\s*function\s+\w+\s*\(.*\)\s*(:\s*\w+)?\s*{?$/;	
	for (let i = position.line; i >= 0; i--) {
		console.log('LOG: lines[i]', lines[i]);
		if (/^\s*(public|protected|private|static)?\s*function\s+\w+\s*\(/.test(lines[i])) {
		//if (functionRegex.test(lines[i])) {
			functionStart = i;
			break;
		}
	}

	if (functionStart === -1) { return null; }

	for (let i = functionStart; i < lines.length; i++) {
		bracketCount += (lines[i].match(/{/g) || []).length;
		bracketCount -= (lines[i].match(/}/g) || []).length;

		if (bracketCount === 0) {
			functionEnd = i;
			break;
		}
	}

	console.log('LOG: functionStart', functionStart);
	console.log('LOG: functionEnd', functionEnd);
	if (functionEnd === -1) { return null; }

	return lines.slice(functionStart, functionEnd + 1).join("\n");
}
