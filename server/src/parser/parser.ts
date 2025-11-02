import * as rcasm from '@paul80nd/rcasm';
import * as nodes from './nodes';

export class Parser {
	parse(text: string): nodes.Program {
		const program = rcasm.parseOnly(text);
		const root = new nodes.Program(program);

		const textProvider = (offset: number, length: number) => {
			// 	if (textDocument.version !== versionId) {
			// 		throw new Error('Underlying model has changed, AST is no longer valid');
			// 	}
			return text.substring(offset, offset + length);
		};
		root.textProvider = textProvider;

		return root;
	}
}
