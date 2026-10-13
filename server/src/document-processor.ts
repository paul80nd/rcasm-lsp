import { TextDocument } from 'vscode-languageserver-textdocument';
import * as parser from './parser';

import { Context } from './context';
import { processSymbols, Symbols } from './symbols';
import { SymbolScope } from './parser/scopes';

export interface ProcessedDocument {
	document: TextDocument;
	tree: parser.INode;
	scopes: SymbolScope;
	symbols: Symbols;
	// False when the document has a syntax error (tree, scopes and symbols are then empty)
	valid: boolean;
}

export type ProcessedDocumentStore = Map<string, ProcessedDocument>;

export default class DocumentProcessor {
	constructor(protected readonly ctx: Context) {}

	async process(document: TextDocument): Promise<ProcessedDocument> {
		this.ctx.logger.log('processDocument: ' + document.uri);

		const processed = analyse(document);
		this.ctx.store.set(document.uri, processed);

		return processed;
	}

	/**
	 * Process the document as if the given line were blank, without storing the result.
	 *
	 * A line that's still being typed is usually a syntax error, which leaves the stored
	 * document empty; this recovers the rest of it. Offsets are unchanged.
	 */
	processWithoutLine(document: TextDocument, line: number): ProcessedDocument {
		const text = document.getText();
		const start = document.offsetAt({ line, character: 0 });
		const end = document.offsetAt({ line, character: Number.MAX_SAFE_INTEGER });
		const blanked = text.substring(0, start) + ' '.repeat(end - start) + text.substring(end);
		return analyse(
			TextDocument.create(document.uri, document.languageId, document.version, blanked)
		);
	}
}

function analyse(document: TextDocument): ProcessedDocument {
	const { tree, scopes, valid } = parser.parse(document.getText());
	const symbols = processSymbols(document, tree, scopes);
	return { document, tree, scopes, symbols, valid };
}
