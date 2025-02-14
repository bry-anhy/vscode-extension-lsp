/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	InitializeResult,
	//TextDocumentPositionParams,
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams) => {
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			executeCommandProvider: {
				commands: ['myLanguageServer.processFunction']
			  }
		}
	};

	return result;
});

// Xử lý khi nhận được request từ client
connection.onRequest("myLanguageServer.processFunction", (funcCode) => {
	console.log("Received function code:", funcCode);
	
	// Xử lý function code (có thể phân tích AST, generate code, v.v.)
	const generatedCode = `\n${funcCode}`;
  
	return generatedCode;
  });

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
