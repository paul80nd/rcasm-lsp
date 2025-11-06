import { ClientCapabilities, Connection, ServerCapabilities } from 'vscode-languageserver';
import { Context } from '../context';

import ConfiguratonProvider from './configuration-provider';
import CompletionProvider from './completion-provider';
import TextDocumentSyncProvider from './text-document-sync-provider';
import HoverProvider from './hover-provider';
import DefinitionProvider from './definition-provider';
import FoldingRangeProvider from './folding-range-provider';

export interface Provider {
	register(connection: Connection, clientCapabilities: ClientCapabilities): ServerCapabilities;
}

const providers = [
	ConfiguratonProvider,
	CompletionProvider,
	DefinitionProvider,
	FoldingRangeProvider,
	HoverProvider,
	TextDocumentSyncProvider
];

export default function registerProviders(
	connection: Connection,
	ctx: Context,
	clientCapabilities: ClientCapabilities
): ServerCapabilities {
	return providers.reduce((acc, P) => {
		const p = new P(ctx);
		const c = p.register(connection, clientCapabilities);
		return Object.assign(acc, c);
	}, {});
}
