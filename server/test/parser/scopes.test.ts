import { Parser } from '../../src/parser';
import * as nodes from '../../src/parser/nodes';
import assert from 'assert';

describe('scopes', () => {
	let parser: Parser;

	beforeAll(() => {
		parser = new Parser();
	});

	describe('findSymbolFromNode', () => {
		it('finds a forward jump', () =>
			parsing('jmp start\n; comment\nstart:  add').symbolAt(6).is(label.at(20).withName('start')));

		it('finds a scoped forward jump at rhs', () =>
			parsing('jmp scp::start\nscp: {\nstart:  add\n}')
				.symbolAt(10)
				.is(label.at(22).withName('start')));

		it('finds a let directive ref', () =>
			parsing('!let CPLAN_SIZE = 3\nldi a,CPLAN_SIZE')
				.symbolAt(27)
				.is(variable.at(5).withName('CPLAN_SIZE')));

		it('finds a for directive ref', () =>
			parsing('!for k in range(16) {\nldi b,k\n}').symbolAt(28).is(variable.at(5).withName('k')));

		it('finds refs split on §', () => {
			const given = parsing('fra: inc\nldi m,fra§parr\nparr: add');
			given.symbolAt(16).is(label.at(0).withName('fra'));
			given.symbolAt(20).is(label.at(24).withName('parr'));
		});
	});

	// Test Director
	const parsing = (code: string) => {
		const { tree, scopes } = parser.parse(code);
		return {
			symbolAt: (offset: number) => {
				const node = nodes.getNodeAtOffset(tree, offset) as nodes.SQRef;
				assert(node, 'No ref node found at offset');
				const symbol = scopes.findQualifiedSym(node.path, node.absolute);
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
