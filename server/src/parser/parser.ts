import * as rcasm from '@paul80nd/rcasm';
import * as nodes from './nodes';
import * as scp from './scopes';

export class Parser {
	parse(text: string): { tree: nodes.Node; scopes: scp.Scopes } {
		const ast = rcasm.parseOnly(text);
		const scopes = new scp.Scopes();
		const tree = nodes.adapt(scopes, ast);

		return { tree, scopes };
	}
}
