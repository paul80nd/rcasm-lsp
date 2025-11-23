import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Context } from '../src/context';
import DocumentProcessor from '../src/document-processor';
import { createTestContext, range } from './helpers';
import { Definition, NamedSymbol, Symbols } from '../src/symbols';

describe('symbols', () => {
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
	});

	describe('#processSymbols()', () => {
		it('finds a forward jump', async () =>
			await parsing('jmp start', 'start:  add').has(
				definitionsOf(label.at(range(1, 0, 1, 5)).named('start')),
				referencesOf(ref.to('start').at(range(0, 4, 0, 9)))
			));

		it('finds a scoped forward jump', async () =>
			await parsing('jmp scp::start', 'scp: {', 'start:  add', '}').has(
				definitionsOf(
					label.at(range(1, 0, 1, 3)).named('scp'),
					label.at(range(2, 0, 2, 5)).named('scp::start')
				),
				referencesOf(ref.to('scp::start').at(range(0, 4, 0, 14)))
			));

		it('finds a let directive', async () =>
			await parsing('!let CPLAN_SIZE = 3', 'ldi a,CPLAN_SIZE').has(
				definitionsOf(variable.at(range(0, 5, 0, 15)).named('CPLAN_SIZE')),
				referencesOf(ref.to('CPLAN_SIZE').at(range(1, 6, 1, 16)))
			));

		it('finds a for directive', async () =>
			await parsing('!for k in range(16) {', 'ldi b,k', '}').has(
				definitionsOf(variable.at(range(0, 5, 0, 6)).named('__anon_scope_0::k')),
				referencesOf(
					ref.to('__anon_scope_0::k').at(range(1, 6, 1, 7)),
					ref.to('range').at(range(0, 10, 0, 15))
				)
			));

		it('finds refs split on §', async () =>
			await parsing('fra: inc', 'ldi m,fra§parr', 'parr: add').has(
				definitionsOf(
					label.at(range(0, 0, 0, 3)).named('fra'),
					label.at(range(2, 0, 2, 4)).named('parr')
				),
				referencesOf(ref.to('fra').at(range(1, 6, 1, 9)), ref.to('parr').at(range(1, 10, 1, 14)))
			));

		it('picks up label inline comment', async () =>
			await parsing('jmp start', 'start:  add ; comment').has(
				definitionsOf(label.at(range(1, 0, 1, 5)).named('start', 'comment')),
				referencesOf(ref.to('start').at(range(0, 4, 0, 9)))
			));

		it('picks up label preceeding comment', async () =>
			await parsing('jmp start', '; comment', 'start:  add').has(
				definitionsOf(label.at(range(2, 0, 2, 5)).named('start', 'comment')),
				referencesOf(ref.to('start').at(range(0, 4, 0, 9)))
			));

		it('picks up label preceeding multiple comments', async () =>
			await parsing('; line 1', '	; line 2', 'label: {', ' label2: add ; stmt', '	} ; end').has(
				definitionsOf(
					label.at(range(2, 0, 2, 5)).named('label', 'line 1  \nline 2'),
					label.at(range(3, 1, 3, 7)).named('label::label2', 'stmt')
				)
			));

		it('picks up label preceeding multiple comments upto gap', async () =>
			await parsing(
				'; not me',
				'',
				'; line 1',
				'	; line 2',
				'label: {',
				' label2: add ; stmt',
				'	} ; end'
			).has(
				definitionsOf(
					label.at(range(4, 0, 4, 5)).named('label', 'line 1  \nline 2'),
					label.at(range(5, 1, 5, 7)).named('label::label2', 'stmt')
				)
			));

		it('converts horizontal rules within preceeding comments', async () =>
			await parsing('	; line x', '; ----', '; line y', 'label: add').has(
				definitionsOf(label.at(range(3, 0, 3, 5)).named('label', 'line x  \n***  \nline y'))
			));

		it('ignores converts horizontal rules around preceeding comments', async () =>
			await parsing('; ----', '	; line x', '; ----', 'label: add').has(
				definitionsOf(label.at(range(3, 0, 3, 5)).named('label', 'line x'))
			));

		it('correctly scopes labels in anon if branches', async () =>
			await parsing(
				'!if (1==0) {',
				'  l1: add',
				'} elif (1==1) {',
				'  l2: add',
				'} else {',
				'  l3: add',
				'}'
			).has(
				definitionsOf(
					label.at(range(1, 2, 1, 4)).named('__anon_scope_0::l1'),
					label.at(range(3, 2, 3, 4)).named('__anon_scope_1::l2'),
					label.at(range(5, 2, 5, 4)).named('__anon_scope_2::l3')
				)
			));

		it('correctly scopes labels in anon for block', async () =>
			await parsing('!for k in range(16) {', 'l1: add', '}').has(
				definitionsOf(
					variable.at(range(0, 5, 0, 6)).named('__anon_scope_0::k'),
					label.at(range(1, 0, 1, 2)).named('__anon_scope_0::l1')
				)
			));

		it('picks up refs to same label across scopes', async () =>
			await parsing('jmp lab', 'lab: add', 'scp: {', 'jmp ::lab', '}').has(
				definitionsOf(
					label.at(range(1, 0, 1, 3)).named('lab'),
					label.at(range(2, 0, 2, 3)).named('scp')
				),
				referencesOf(ref.to('lab').at(range(0, 4, 0, 7), range(3, 4, 3, 9)))
			));

		it('picks up refs and label both inside scope', async () =>
			await parsing('bbp: {', 'jmp init', 'init: add', '}').has(
				definitionsOf(
					label.at(range(0, 0, 0, 3)).named('bbp'),
					label.at(range(2, 0, 2, 4)).named('bbp::init')
				),
				referencesOf(ref.to('bbp::init').at(range(1, 4, 1, 8)))
			));

		it('normalises refs into for loop iteration', async () =>
			await parsing(
				'beq b_loop__4::_tst',
				'b_loop: !for i in range(8) {',
				'_tst: mov b,a',
				'}'
			).has(
				definitionsOf(
					label.at(range(1, 0, 1, 6)).named('b_loop'),
					label.at(range(2, 0, 2, 4)).named('b_loop__n::_tst'),
					variable.at(range(1, 13, 1, 14)).named('b_loop__n::i')
				),
				referencesOf(
					ref.to('b_loop__n::_tst').at(range(0, 4, 0, 19)),
					ref.to('range').at(range(1, 18, 1, 23))
				)
			));

		it('resolves labels and refs within loop', async () =>
			await parsing(
				'b_loop: !for i in range(8) {',
				'_tst: add',
				'bmi _neg',
				'jmp _set',
				'_neg: mov a,b',
				'_set: mov b,d',
				'}'
			).has(
				definitionsOf(
					label.at(range(0, 0, 0, 6)).named('b_loop'),
					label.at(range(1, 0, 1, 4)).named('b_loop__n::_tst'),
					label.at(range(4, 0, 4, 4)).named('b_loop__n::_neg'),
					label.at(range(5, 0, 5, 4)).named('b_loop__n::_set'),
					variable.at(range(0, 13, 0, 14)).named('b_loop__n::i')
				),
				referencesOf(
					ref.to('b_loop__n::_neg').at(range(2, 4, 2, 8)),
					ref.to('b_loop__n::_set').at(range(3, 4, 3, 8)),
					ref.to('range').at(range(0, 18, 0, 23))
				)
			));

		it('resolves labels and refs outside unnamed loop', async () =>
			await parsing(
				'!let CPLAN_SIZE = 3',
				'cplan: !byte 0, 9, 0x01',
				'!for k in range(16) {',
				'!let parr = cplan + (k * CPLAN_SIZE)',
				'}'
			).has(
				definitionsOf(
					variable.at(range(0, 5, 0, 15)).named('CPLAN_SIZE'),
					label.at(range(1, 0, 1, 5)).named('cplan'),
					variable.at(range(2, 5, 2, 6)).named('__anon_scope_0::k'),
					variable.at(range(3, 5, 3, 9)).named('__anon_scope_0::parr')
				),
				referencesOf(
					ref.to('range').at(range(2, 10, 2, 15)),
					ref.to('CPLAN_SIZE').at(range(3, 25, 3, 35)),
					ref.to('cplan').at(range(3, 12, 3, 17)),
					ref.to('__anon_scope_0::k').at(range(3, 21, 3, 22))
				)
			));

		it('resolves labels and refs outside named loop', async () =>
			await parsing(
				'!let CPLAN_SIZE = 3',
				'cplan: !byte 0, 9, 0x01',
				'start: !for k in range(16) {',
				'!let parr = cplan + (k * CPLAN_SIZE)',
				'}'
			).has(
				definitionsOf(
					variable.at(range(0, 5, 0, 15)).named('CPLAN_SIZE'),
					label.at(range(1, 0, 1, 5)).named('cplan'),
					label.at(range(2, 0, 2, 5)).named('start'),
					variable.at(range(2, 12, 2, 13)).named('start__n::k'),
					variable.at(range(3, 5, 3, 9)).named('start__n::parr')
				),
				referencesOf(
					ref.to('range').at(range(2, 17, 2, 22)),
					ref.to('CPLAN_SIZE').at(range(3, 25, 3, 35)),
					ref.to('cplan').at(range(3, 12, 3, 17)),
					ref.to('start__n::k').at(range(3, 21, 3, 22))
				)
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
			has: async (...assertions: ((s: Symbols) => void)[]) => {
				const s = await symbolsProvider();
				assertions.forEach(a => a(s));
			}
		};
	};

	const definitionsOf = (...expected: readonly Definition[]) => {
		const expMap = new Map<string, Definition>();
		expected.forEach(e => expMap.set(e.name, e));
		return (s: Symbols) => expect(s.definitions).toEqual(expMap);
	};

	const referencesOf = (...expected: readonly [string, NamedSymbol[]][]) => {
		const expMap = new Map<string, NamedSymbol[]>();
		expected.forEach(e => expMap.set(e[0], e[1]));
		return (s: Symbols) => expect(s.references).toEqual(expMap);
	};

	const definition = {
		ofType: (type: string) => ({
			at: (range: lsp.Range) => ({
				named: (name: string, comment?: string) =>
					({
						location: expect.objectContaining({ range }),
						name: name,
						selectionRange: range,
						type,
						comment
					}) as Definition
			})
		})
	};

	const label = definition.ofType('label');
	const variable = definition.ofType('variable');

	const ref = {
		to: (name: string) => ({
			at: (...ranges: readonly lsp.Range[]) =>
				[
					name,
					ranges.map(
						r =>
							({
								location: expect.objectContaining({ range: r }),
								name: name
							}) as NamedSymbol
					)
				] as [string, NamedSymbol[]]
		})
	};
});
