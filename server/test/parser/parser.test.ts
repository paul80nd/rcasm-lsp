import { Parser } from '../../src/parser';
import * as nodes from '../../src/parser/nodes';
import * as matchers from 'jest-extended';

expect.extend(matchers);

describe('parse', () => {
	let parser: Parser;

	beforeAll(() => {
		parser = new Parser();
	});

	it('parses a complete instruction line', () => {
		parsing('label: mov a,b    ; comment here').is(`
000+032 Program
000+018 .Line
000+005 ..Label label
007+011 ..Instruction mov
011+001 ...Register a
013+005 ...Register b
`);
	});

	it('parses a complete directive line', () =>
		parsing('label: !byte 10, 0xfe, 01010101b    ; comment here').is(`
000+050 Program
000+036 .Line
000+005 ..Label label
007+029 ..Directive !byte
013+002 ...Literal d 10
017+004 ...Literal h 254
023+013 ...Literal b 85
`));

	it('parses a fill directive', () =>
		parsing('!fill 9,0xaa').is(`
000+012 Program
000+012 .Line
000+012 ..Directive !fill
006+001 ...Literal d 9
008+004 ...Literal h 170
`));

	it('parses an align directive', () =>
		parsing('!align 16').is(`
000+009 Program
000+009 .Line
000+009 ..Directive !align
007+002 ...Literal d 16
`));

	it('parses byte string', () =>
		parsing('!byte "abc"').is(`
000+011 Program
000+011 .Line
000+011 ..Directive !byte
006+005 ...Literal s abc
`));

	it('parses word string', () =>
		parsing('!word "abc"').is(`
000+011 Program
000+011 .Line
000+011 ..Directive !word
006+005 ...Literal s abc
`));

	it('parses a forward jump', () =>
		parsing('jmp start\n; comment\nstart:  add').is(`
000+031 Program
000+009 .Line
000+009 ..Instruction jmp
004+005 ...SQRef start
020+011 .Line
020+005 ..Label start
028+003 ..Instruction add
`));

	it('parses a scoped forward jump', () =>
		parsing('jmp test::start\ntest: {\nstart:  add\n}').is(`
000+037 Program
000+015 .Line
000+015 ..Instruction jmp
004+011 ...SQRef test,start
016+021 .Line
016+004 ..Label test
016+021 ..Scope
024+011 ...Line
024+005 ....Label start
032+003 ....Instruction add
`));

	it('parses an org', () =>
		parsing('org 0x07').is(`
000+008 Program
000+008 .Line
000+008 ..SetPC
004+004 ...Literal h 7
`));

	it('parses let directive and ref', () =>
		parsing('!let CPLAN_SIZE = 3\nldi a,CPLAN_SIZE').is(`
000+036 Program
000+019 .Line
000+019 ..Directive !let
005+011 ...Variable CPLAN_SIZE
018+001 ...Literal d 3
020+016 .Line
020+016 ..Instruction ldi
024+001 ...Register a
026+010 ...SQRef CPLAN_SIZE
`));

	it('parses let directive and ref expression', () =>
		parsing('!let CPLAN_SIZE = 3\nplan: !let parr = cplan + (4 * CPLAN_SIZE)').is(`
000+062 Program
000+019 .Line
000+019 ..Directive !let
005+011 ...Variable CPLAN_SIZE
018+001 ...Literal d 3
020+042 .Line
020+004 ..Label plan
026+036 ..Directive !let
031+005 ...Variable parr
038+024 ...BinaryOp +
038+006 ....SQRef cplan
047+014 ....BinaryOp *
047+002 .....Literal d 4
051+010 .....SQRef CPLAN_SIZE
`));

	it('parses for directive and ref', () =>
		parsing('!for k in range(16) {\nldi b,k\n}').is(`
000+031 Program
000+031 .Line
000+031 ..Directive !for
005+002 ...Variable k
010+010 ...CallFunc
010+005 ....SQRef range
016+002 ....Literal d 16
022+007 ...Line
022+007 ....Instruction ldi
026+001 .....Register b
028+001 .....SQRef k
`));

	it('parses for directive and ref expr', () =>
		parsing('!for k in range(4,6) {\n!let ssz = 10 - ( ( k + ( k % 2 )) / 2)\n}').is(`
000+064 Program
000+064 .Line
000+064 ..Directive !for
005+002 ...Variable k
010+011 ...CallFunc
010+005 ....SQRef range
016+001 ....Literal d 4
018+001 ....Literal d 6
023+039 ...Line
023+039 ....Directive !let
028+004 .....Variable ssz
034+028 .....BinaryOp -
034+003 ......Literal d 10
041+020 ......BinaryOp /
043+013 .......BinaryOp +
043+002 ........SQRef k
049+006 ........BinaryOp %
049+002 .........SQRef k
053+002 .........Literal d 2
060+001 .......Literal d 2
`));

	it('parses if directive', () =>
		parsing('!if (1 > 2) {\nadd\n}').is(`
000+019 Program
000+019 .Line
000+019 ..Directive !if
005+005 ...BinaryOp >
005+002 ....Literal d 1
009+001 ....Literal d 2
014+003 ...Line
014+003 ....Instruction add
`));

	it('parses if-else directive', () =>
		parsing('!if (1) {\nadd\n} else {\ninc\n}').is(`
000+028 Program
000+028 .Line
000+028 ..Directive !if
005+001 ...Literal d 1
010+003 ...Line
010+003 ....Instruction add
023+003 ...Line
023+003 ....Instruction inc
`));

	it('parses if-elif-else directive', () =>
		parsing('!if (1 == 2) {\nadd\n} elif (1 != 2) {\nnot\n} else {\ninc\n}').is(`
000+055 Program
000+055 .Line
000+055 ..Directive !if
005+006 ...BinaryOp ==
005+002 ....Literal d 1
010+001 ....Literal d 2
015+003 ...Line
015+003 ....Instruction add
027+006 ...BinaryOp !=
027+002 ....Literal d 1
032+001 ....Literal d 2
037+003 ...Line
037+003 ....Instruction not
050+003 ...Line
050+003 ....Instruction inc
`));

	it('parses pc guarded error directive', () =>
		parsing('!if (* > 0xff) { !error "Exceeded Zero Page!" }').is(`
000+047 Program
000+047 .Line
000+047 ..Directive !if
005+008 ...BinaryOp >
005+002 ....CurrentPC
009+004 ....Literal h 255
017+029 ...Line
017+029 ....Directive !error
`));

	// Test Director
	const parsing = (code: string) => {
		// Parse to AST
		const { tree } = parser.parse(code);

		// Walk AST
		const visitor = new TestVisitor();
		tree.acceptVisitor(visitor);

		const actual = visitor.doc;
		return {
			is: (expected: string) => expect(actual).toEqual(expected)
		};
	};

	class TestVisitor implements nodes.IVisitor {
		public doc = '\n';

		public visitNode(node: nodes.Node): boolean {
			// Calculate depth
			let depth = 0;
			for (let pNode = node; pNode.parent; pNode = pNode.parent) {
				depth++;
			}

			// Format the output string
			const info = node.info ? ` ${node.info}` : '';
			const formattedOffset = node.offset.toString().padStart(3, '0');
			const formattedLength = node.length.toString().padStart(3, '0');
			this.doc += `${formattedOffset}+${formattedLength} ${'.'.repeat(depth)}${nodes.NodeType[node.type]}${info}\n`;

			return true;
		}
	}
});
