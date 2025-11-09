import * as lsp from 'vscode-languageserver';
import { Provider } from '.';
import { Context } from '../context';
import { symbolKindMappings } from '../symbols';

export default class DocumentSymbolProvider implements Provider {
	constructor(protected readonly ctx: Context) {}

	async onDocumentSymbol({
		textDocument
	}: lsp.DocumentSymbolParams): Promise<lsp.DocumentSymbol[]> {
		const docSymbols = this.ctx.store.get(textDocument.uri)?.symbols;
		if (!docSymbols) {
			return [];
		}

		const results: lsp.DocumentSymbol[] = [];

		for (const def of docSymbols.definitions.values()) {
			const symbol = lsp.DocumentSymbol.create(
				def.name,
				undefined,
				symbolKindMappings[def.type],
				def.location.range,
				def.selectionRange
			);

			results.push(symbol);
		}

		return results;
	}

	register(connection: lsp.Connection) {
		connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
		return {
			documentSymbolProvider: true
		};
	}
}
