import { TextDocument } from 'vscode-languageserver-textdocument';
import * as parser from './parser';

import { Context } from './context';

export interface ProcessedDocument {
	document: TextDocument;
	tree: parser.INode;
	scopes: parser.Scopes;
}

export type ProcessedDocumentStore = Map<string, ProcessedDocument>;

export default class DocumentProcessor {
	constructor(protected readonly ctx: Context) {}

	async process(document: TextDocument): Promise<ProcessedDocument> {
		this.ctx.logger.log('processDocument: ' + document.uri);

		const { tree, scopes } = parser.parse(document.getText());

		const processed: ProcessedDocument = {
			document,
			tree,
			scopes
		};

		this.ctx.store.set(document.uri, processed);

		return processed;
	}
}
