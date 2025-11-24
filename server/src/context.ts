import * as lsp from 'vscode-languageserver';

import { ProcessedDocumentStore } from './document-processor';
import { Config, mergeConfig, defaultConfig } from './config';

export interface Context {
	store: ProcessedDocumentStore;
	workspaceFolders: lsp.WorkspaceFolder[];
	logger: lsp.Logger;
	connection: lsp.Connection;
	config: Config;
}

export function createContext(
	workspaceFolders: lsp.WorkspaceFolder[],
	logger: lsp.Logger,
	connection: lsp.Connection,
	config: Partial<Config>
): Context {
	return {
		store: new Map(),
		workspaceFolders,
		logger,
		connection,
		config: mergeConfig(config, defaultConfig)
	};
}
