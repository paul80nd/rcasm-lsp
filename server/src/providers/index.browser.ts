import { ClientCapabilities, Connection, ServerCapabilities } from 'vscode-languageserver';
import { Context } from '../context';

import CompletionProvider from './completion-provider';
import TextDocumentSyncProvider from './text-document-sync-provider';
import HoverProvider from './hover-provider';
import DefinitionProvider from './definition-provider';
import FoldingRangeProvider from './folding-range-provider';
import ReferencesProvider from './references-provider';
import DocumentHighlightProvider from './document-highlight-provider';
import DocumentSymbolProvider from './document-symbol-provider';
import RenameProvider from './rename-provider';

export interface Provider {
	register(connection: Connection, clientCapabilities: ClientCapabilities): ServerCapabilities;
}

const providers = [
	CompletionProvider,
	DefinitionProvider,
	DocumentHighlightProvider,
	DocumentSymbolProvider,
	FoldingRangeProvider,
	HoverProvider,
	ReferencesProvider,
	RenameProvider,
	TextDocumentSyncProvider
];

export default function registerProviders(
	connection: Connection,
	ctx: Context
): ServerCapabilities {
	return providers.reduce((acc, P) => {
		const p = new P(ctx);
		const c = p.register(connection);
		return Object.assign(acc, c);
	}, {});
}
