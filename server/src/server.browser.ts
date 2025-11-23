import {
	createConnection,
	BrowserMessageReader,
	BrowserMessageWriter,
	InitializeParams,
	ProposedFeatures
} from 'vscode-languageserver/browser';
import * as lsp from 'vscode-languageserver';

import registerProviders from './providers/index.browser';
import { createContext } from './context';

// Web Worker global scope
const workerCtx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// Wire up the browser transport
const reader = new BrowserMessageReader(workerCtx);
const writer = new BrowserMessageWriter(workerCtx);

// In the browser, pass ProposedFeatures to mirror the Node setup
const connection = createConnection(reader, writer, {}, ProposedFeatures.all);

connection.onInitialize((params: InitializeParams): lsp.InitializeResult => {
	const ctx = /* await */ createContext(
		params.workspaceFolders ?? [],
		connection.console,
		connection,
		params.initializationOptions
	);

	const capabilities = registerProviders(connection, ctx);
	return { capabilities };
});

// Start listening
connection.listen();
