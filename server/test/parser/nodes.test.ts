import { Parser } from '../../src/parser';
import * as nodes from '../../src/parser/nodes';

describe('nodes', () => {
	let parser: Parser;

	beforeAll(() => {
		parser = new Parser();
	});

	describe('getNodeAtOffet', () => {
		it('finds nodes in a complete instruction line', () => {
			const given = parsing('label: mov a,b    ; comment here');
			given.nodeAt(3).is(label.at(0, 5).withInfo('label'));
			given.nodeAt(8).is(instr.at(7, 18).withInfo('mov'));
			given.nodeAt(11).is(register.at(11, 12).withInfo('a'));
			given.nodeAt(13).is(register.at(13, 18).withInfo('b'));
		});

		it('finds symbols in a forward jump', () => {
			const given = parsing('jmp start\n; comment\nstart:  add');
			given.nodeAt(4).is(ref.at(4, 9).withInfo('start'));
			given.nodeAt(20).is(label.at(20, 25).withInfo('start'));
		});

		it('finds symbols in a scoped forward jump', () => {
			const given = parsing('jmp test::start\ntest: {\nstart:  add\n}');
			given.nodeAt(4).is(ref.at(4, 15).withInfo('test,start'));
			given.nodeAt(12).is(ref.at(4, 15).withInfo('test,start'));
			given.nodeAt(24).is(label.at(24, 29).withInfo('start'));
		});
	});

	// Test Director
	const parsing = (code: string) => {
		const { tree } = parser.parse(code);
		return {
			nodeAt: (offset: number) => {
				const node = nodes.getNodeAtOffset(tree, offset);
				return {
					is: <E>(expected: E) =>
						expect({
							offset: node?.offset,
							length: node?.length,
							type: node?.type,
							info: node?.info
						}).toEqual(expected)
				};
			}
		};
	};

	const node = {
		ofType: (type: nodes.NodeType) => ({
			at: (start: number, end: number) => ({
				withInfo: (info: string) => ({
					offset: start,
					length: end - start,
					type,
					info
				})
			})
		})
	};
	const label = node.ofType(nodes.NodeType.Label);
	const instr = node.ofType(nodes.NodeType.Instruction);
	const ref = node.ofType(nodes.NodeType.SQRef);
	const register = node.ofType(nodes.NodeType.Register);
});
