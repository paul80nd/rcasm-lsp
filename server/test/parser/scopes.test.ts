import * as parser from '../../src/parser';
import * as nodes from '../../src/parser/nodes';
import assert from 'assert';

describe('scopes', () => {
	describe('findSymbolFromNode', () => {
		it('finds a forward jump', () =>
			parsing('jmp start', '; comment', 'start:  add')
				.symbolAt(6)
				.is(label.at(20).withName('start')));

		it('finds a scoped forward jump at rhs', () =>
			parsing('jmp scp::start', 'scp: {', 'start:  add', '}')
				.symbolAt(10)
				.is(label.at(22).withName('start')));

		it('finds a let directive ref', () =>
			parsing('!let CPLAN_SIZE = 3', 'ldi a,CPLAN_SIZE')
				.symbolAt(27)
				.is(variable.at(5).withName('CPLAN_SIZE')));

		it('finds a for directive ref', () =>
			parsing('!for k in range(16) {', 'ldi b,k', '}')
				.symbolAt(28)
				.is(variable.at(5).withName('k')));

		it('finds refs split on §', () => {
			const given = parsing('fra: inc', 'ldi m,fra§parr', 'parr: add');
			given.symbolAt(16).is(label.at(0).withName('fra'));
			given.symbolAt(20).is(label.at(24).withName('parr'));
		});
	});

	// Test Director
	const parsing = (...code: string[]) => {
		const { tree, scopes } = parser.parse(code.join('\n'));
		return {
			symbolAt: (offset: number) => {
				const node = nodes.getNodeAtOffset(tree, offset);
				assert(node?.ref, 'No ref node found at offset');
				const symbol = scopes.findQualifiedSymbol(node.ref);
				return {
					is: <E>(expected: E) => expect(symbol).toEqual(expected)
				};
			}
		};
	};

	const symbol = {
		ofType: (type: string) => ({
			at: (offset: number) => ({
				withName: (name: string) => ({
					node: expect.objectContaining({
						offset
					}),
					type,
					name
				})
			})
		})
	};
	const label = symbol.ofType('label');
	const variable = symbol.ofType('var');
});
