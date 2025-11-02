import * as rcasm from '@paul80nd/rcasm';
import * as nodes from './nodes';

export class Parser {
	parse(text: string): nodes.Program {
		const program = rcasm.parseOnly(text);
		const root = new nodes.Program(program);

		root.textProvider = (offset: number, length: number) => text.substring(offset, offset + length);

		return root;
	}
}
