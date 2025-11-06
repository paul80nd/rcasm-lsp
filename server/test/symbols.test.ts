import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Context } from '../src/context';
import DocumentProcessor from '../src/document-processor';
import { createTestContext, range } from './helpers';
import { Definition } from '../src/symbols';

describe('symbols', () => {
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
	});

	describe('#processSymbols()', () => {
		it('finds a forward jump', async () =>
			await parsing('jmp start', '; comment', 'start:  add').definitionsAre(
				label.at(range(2, 0, 2, 5)).withName('start')
			));

		it('finds a scoped forward jump', async () =>
			await parsing('jmp scp::start', 'scp: {', 'start:  add', '}')
				.definitionsAre(
					label.at(range(1, 0, 1, 3)).withName('scp'),
					label.at(range(2, 0, 2, 5)).withName('scp::start')
				));

		it('finds a let directive', async () =>
			await parsing('!let CPLAN_SIZE = 3', 'ldi a,CPLAN_SIZE')
				.definitionsAre(
					variable.at(range(0, 5, 0, 15)).withName('CPLAN_SIZE')
				));

		it('finds a for directive', async () =>
			await parsing('!for k in range(16) {', 'ldi b,k', '}')
				.definitionsAre(
					variable.at(range(0, 5, 0, 6)).withName('k')
				));

		it('finds refs split on §', async () =>
			await parsing('fra: inc', 'ldi m,fra§parr', 'parr: add')
				.definitionsAre(
					label.at(range(0, 0, 0, 3)).withName('fra'),
					label.at(range(2, 0, 2, 4)).withName('parr')
				));
	});

	// Test Director
	const parsing = (...code: string[]) => {
		// Arrange: document from code
		const symbolsProvider = async () => {
			const uri = ctx.workspaceFolders[0].uri + '/example.rcasm';
			const textDocument = TextDocument.create(uri, 'rcasm', 0, code.join('\n'));
			const processed = await processor.process(textDocument);
			return processed.symbols;
		};
		return {
			definitionsAre: async (...expected: readonly Definition[]) => {
				const expMap = new Map<string, Definition>();
				expected.forEach(e => expMap.set(e.name, e));
				expect((await symbolsProvider()).definitions).toEqual(expMap);
			}
		};
	};

	const definition = {
		ofType: (type: string) => ({
			at: (range: lsp.Range) => ({
				withName: (name: string) => ({
					location: expect.objectContaining({ range }),
					name: name,
					selectionRange: range,
					type
				} as Definition)
			})
		})
	};

	const label = definition.ofType('label');
	const variable = definition.ofType('variable');

});
