/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, ExtensionContext } from 'vscode';
import * as phpParser from 'php-parser';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

// Định nghĩa interface cho các node của AST PHP
interface PhpAstNode {
	kind: string;
	loc?: {
		start: { line: number; column: number };
		end: { line: number; column: number };
	};
	name?: string | { name: string };
	[key: string]: unknown;
}

// Hàm kiểm tra node có đúng kiểu không
function isPhpAstNode(node: unknown): node is PhpAstNode {
	return typeof node === 'object' && node !== null && 'kind' in node;
}

// Hàm lấy tên của một function/method từ node
function getFunctionName(node: PhpAstNode): string | null {
	if (node.name) {
		if (typeof node.name === 'string') {
			return node.name;
		} else if (typeof node.name === 'object' && 'name' in node.name) {
			return (node.name as { name: string }).name;
		}
	}
	return null;
}

// Tìm function chứa con trỏ hiện tại trong AST
function findFunctionAtPosition(node: unknown, currentLine: number): PhpAstNode | null {
	let found: PhpAstNode | null = null;
	function traverse(n: unknown): void {
		if (!isPhpAstNode(n)) { return; }
		if ((n.kind === 'function' || n.kind === 'method') && n.loc) {
			const startLine = n.loc.start.line;
			const endLine = n.loc.end.line;
			if (currentLine >= startLine && currentLine <= endLine) {
				found = n;
				return;
			}
		}
		for (const key in n) {
			if (Object.prototype.hasOwnProperty.call(n, key)) {
				const child = n[key];
				if (Array.isArray(child)) {
					for (const c of child) {
						traverse(c);
						if (found) { return; }
					}
				} else {
					traverse(child);
					if (found) { return; }
				}
			}
		}
	}
	traverse(node);
	return found;
}

function collectCalledFunctionNames(node: unknown): Set<string> {
	const names = new Set<string>();

	function traverse(n: unknown): void {
		if (!isPhpAstNode(n)) { return; }

		if (n.kind === 'call' && n.what) {
			// Trường hợp gọi hàm trực tiếp, ví dụ: sayHello()
			if (isPhpAstNode(n.what) && n.what.kind === 'identifier') {
				const funcName = getFunctionName(n.what);
				if (funcName) {
					names.add(funcName);
				}
			}
			// Trường hợp gọi hàm qua biến, ví dụ: $func()
			else if (isPhpAstNode(n.what) && n.what.kind === 'variable') {
				// Ở đây n.what.name có thể chứa tên biến, ví dụ: "func"
				const varName = n.what.name;
				// Thông báo hoặc xử lý theo ý bạn vì giá trị thực của biến có thể không rõ
				names.add(`[dynamic call via variable: ${varName}]`);
			}
			// Các trường hợp khác nếu có (ví dụ: gọi method thông qua $this->)
			else if (isPhpAstNode(n.what) && n.what.kind === 'propertylookup') {
				const offset = n.what.offset;
				if (offset && typeof offset === 'object' && 'name' in offset) {
					const methodName = (offset as { name: string }).name;
					if (methodName) {
						names.add(methodName);
					}
				}
			}
		}

		for (const key in n) {
			if (Object.prototype.hasOwnProperty.call(n, key)) {
				const child = n[key];
				if (Array.isArray(child)) {
					for (const c of child) {
						traverse(c);
					}
				} else {
					traverse(child);
				}
			}
		}
	}
	traverse(node);
	return names;
}

// Tìm định nghĩa của function có tên cho trước trong toàn bộ AST
function findFunctionDefinitions(ast: unknown, functionName: string): PhpAstNode[] {
	const defs: PhpAstNode[] = [];
	function traverse(n: unknown): void {
		if (!isPhpAstNode(n)) { return; }
		if ((n.kind === 'function' || n.kind === 'method') && n.loc) {
			const name = getFunctionName(n);
			if (name === functionName) {
				defs.push(n);
			}
		}
		for (const key in n) {
			if (Object.prototype.hasOwnProperty.call(n, key)) {
				const child = n[key];
				if (Array.isArray(child)) {
					for (const c of child) {
						traverse(c);
					}
				} else {
					traverse(child);
				}
			}
		}
	}
	traverse(ast);
	return defs;
}


export function activate(context: ExtensionContext) {
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
		// Register the server for plain text documents
		documentSelector: [
			{ scheme: 'file', language: 'plaintext' },
			{ scheme: 'file', language: 'php' },
			{ scheme: 'file', language: 'js' },
			{ scheme: 'file', language: 'ts' }
		],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};
	console.log('Generate Testcode PHP Sample activated!');

	const disposable = vscode.commands.registerCommand('extension.generateTestCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found!');
			return;
		}
		const document = editor.document;
		const position = editor.selection.active;

		if (document.languageId === 'php') {
			try {
				// Khởi tạo engine của php-parser với cấu hình mong muốn
				const engine = new phpParser.Engine({
					parser: { extractDoc: true },
					ast: { withPositions: true }
				});

				const sourceText = document.getText();
				// Cung cấp filename theo yêu cầu của API
				const ast = engine.parseCode(sourceText, document.fileName);

				// VS Code sử dụng chỉ số dòng bắt đầu từ 0, còn php-parser sử dụng bắt đầu từ 1
				const currentLine = position.line + 1;

				// Tìm function chứa con trỏ
				const selectedFunction = findFunctionAtPosition(ast, currentLine);
				if (!selectedFunction || !selectedFunction.loc) {
					vscode.window.showInformationMessage('No function found at cursor!');
					return;
				}
				const startPos = new vscode.Position(selectedFunction.loc.start.line - 1, selectedFunction.loc.start.column);
				const endPos = new vscode.Position(selectedFunction.loc.end.line - 1, selectedFunction.loc.end.column);
				const functionText = document.getText(new vscode.Range(startPos, endPos));

				let message = `<h3>Selected function:</h3><p>${functionText}</p>`;

				// Thu thập tên các function được gọi bên trong function đã chọn
				const calledNames = collectCalledFunctionNames(selectedFunction);
				if (calledNames.size === 0) {
					message += '<h3>No related function calls found.</h3>';
				} else {
					message += '<h3>Related function definitions found:</h3>';
					// Với mỗi tên function, tìm định nghĩa trong AST
					calledNames.forEach(name => {
						const defs = findFunctionDefinitions(ast, name);
						if (defs.length > 0) {
							defs.forEach(def => {
								if (def.loc) {
									const defStart = new vscode.Position(def.loc.start.line - 1, def.loc.start.column);
									const defEnd = new vscode.Position(def.loc.end.line - 1, def.loc.end.column);
									const defText = document.getText(new vscode.Range(defStart, defEnd));									
									message += `<p>${defText}</p>`;
								}
							});
						} else {
							message += `<p>Function ${name}: definition not found.</p>`;
						}
					});
				}
				
				const panel = vscode.window.createWebviewPanel(
					"infoPanel",
					"Thông Báo",
					vscode.ViewColumn.One,
					{}
				);

				panel.webview.html = `
			<html>
				<body>
					${message}
				</body>
			</html>`;
			} catch (err) {
				vscode.window.showErrorMessage(`Error parsing PHP: ${err}`);
			}
		} else {
			vscode.window.showWarningMessage('Generate Testcode not supported for this language yet!');
		}
	});

	context.subscriptions.push(disposable);

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
