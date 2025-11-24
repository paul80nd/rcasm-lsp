import { TextDocument } from 'vscode-languageserver-textdocument';
import * as parser from './parser';

import { Context } from './context';
import { processSymbols, Symbols } from './symbols';

export interface ProcessedDocument {
	document: TextDocument;
	tree: parser.INode;
	symbols: Symbols;
}

export type ProcessedDocumentStore = Map<string, ProcessedDocument>;

export default class DocumentProcessor {
	constructor(protected readonly ctx: Context) {}

	async process(document: TextDocument): Promise<ProcessedDocument> {
		this.ctx.logger.log('processDocument: ' + document.uri);

		const { tree, scopes } = parser.parse(document.getText());
		const symbols = processSymbols(document, tree, scopes);

		const processed: ProcessedDocument = {
			document,
			tree,
			symbols
		};

		this.ctx.store.set(document.uri, processed);

		return processed;
	}
}
