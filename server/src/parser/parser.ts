import * as rcasm from '@paul80nd/rcasm';
import { INode, IOrphanNode } from './nodes';
import * as nodes from './nodes';
import { SymbolScope, NamedScope, SymEntry, Scopes } from './scopes';

export interface IParseContext {
	scope: SymbolScope;
	withAnonScope(body: () => void): void;
	withLabelScope(name: string, body: () => void): void;
	withAnonOrLabelScope(name: string | undefined, body: () => void): void;
	declareLabelSymbol(name: string, node: INode): void;
	declareVar(name: string, node: INode): void;
}

export function parse(text: string): { tree: INode; scopes: Scopes } {
	const ast = rcasm.parseOnly(text);
	const adapter = new AstAdapter();
	const tree = adapter.adapt(ast);
	return { tree, scopes: new Scopes(adapter.ctx.root) };
}

class AstAdapter {
	ctx: ParserContext = new ParserContext();

	adapt(p?: rcasm.Program): INode {
		if (!p) {
			return nodes.mkNode('Program', 0, 0);
		}
		const n = mkNode(p, 'Program');
		p.lines
			?.filter(l => l.label || l.scopedStmts || l.stmt)
			.forEach(l => n.adoptChild(this.adaptLine(l)));
		return n;
	}

	adaptLine(l: rcasm.Line): IOrphanNode {
		const n = mkNode(l, 'Line');
		if (l.label) {
			n.adoptChild(this.adaptLabel(l.label));
		}
		if (l.scopedStmts) {
			n.adoptChild(this.adaptScope(l));
		}
		if (l.stmt) {
			n.adoptChild(this.adaptStmt(l.stmt, l.label));
		}
		return n;
	}

	adaptStmt(s: rcasm.Stmt, l: rcasm.Label | null): IOrphanNode {
		switch (s.type) {
			case 'insn':
				return this.adaptInstruction(s);
			case 'setpc':
				return this.adaptSetPc(s);
			case 'data':
				return this.adaptDataDirective(s);
			case 'fill':
				return mkNode(
					s,
					'Directive',
					'!fill',
					this.adaptExpr(s.numBytes),
					this.adaptExpr(s.fillValue)
				);
			case 'align':
				return mkNode(s, 'Directive', '!align', this.adaptExpr(s.alignBytes));
			case 'for':
				return this.adaptForDirective(s, l?.name);
			case 'if':
				return this.adaptIfDirective(s, l?.name);
			case 'let':
				return this.adaptLetDirective(s);
			case 'error':
				return mkNode(s, 'Directive', '!error');
		}
	}

	adaptLabel(l: rcasm.Label): IOrphanNode {
		const n = mkNode(l, 'Label', l.name);
		n.length = l.name.length; // Ignore colon and any whitespace
		this.ctx.declareLabelSymbol(l.name, n);
		return n;
	}

	adaptScope(ss: rcasm.Line): IOrphanNode {
		const n = mkNode(ss, 'Scope', ss.label?.name);
		const label = ss.label?.name ?? '?';
		this.ctx.withLabelScope(label, () => {
			ss.scopedStmts
				?.filter(l => l.label || l.scopedStmts || l.stmt)
				.forEach(l => {
					n.adoptChild(this.adaptLine(l));
				});
		});
		return n;
	}

	adaptInstruction(si: rcasm.StmtInsn): IOrphanNode {
		const n = mkNode(si, 'Instruction', si.mnemonic.toLowerCase());
		if (si.p1) {
			n.adoptChild(this.adaptExpr(si.p1));
		}
		if (si.p2) {
			n.adoptChild(this.adaptExpr(si.p2));
		}
		return n;
	}

	adaptSetPc(spc: rcasm.StmtSetPC): IOrphanNode {
		const n = mkNode(spc, 'SetPC', undefined, this.adaptExpr(spc.pc));
		return n;
	}

	adaptDataDirective(d: rcasm.StmtData): IOrphanNode {
		const n = mkNode(
			d,
			'Directive',
			d.dataSize === rcasm.DataSize.Byte ? '!byte' : '!word',
			...d.values.map(v => this.adaptExpr(v))
		);
		return n;
	}

	adaptLetDirective(d: rcasm.StmtLet): IOrphanNode {
		const n = mkNode(d, 'Directive', '!let', this.adaptVariable(d.name), this.adaptExpr(d.value));
		return n;
	}

	adaptForDirective(ss: rcasm.StmtFor, lsn?: string): IOrphanNode {
		const n = mkNode(ss, 'Directive', '!for');

		n.adoptChild(this.adaptExpr(ss.list));

		// Derrive scope name
		let sn = undefined;
		if (lsn) {
			sn = `${lsn}__x`;
		}

		this.ctx.withAnonOrLabelScope(sn, () => {
			n.adoptChild(this.adaptVariable(ss.index));

			if (ss.body) {
				ss.body
					.filter(st => st.label || st.scopedStmts || st.stmt)
					.forEach(st => n.adoptChild(this.adaptLine(st)));
			}
		});

		return n;
	}

	adaptIfDirective(ss: rcasm.StmtIfElse, lsn?: string): IOrphanNode {
		const n = mkNode(ss, 'Directive', '!if');
		ss.cases.forEach(c => {
			n.adoptChild(this.adaptExpr(c[0]));
			this.ctx.withAnonOrLabelScope(lsn, () => {
				c[1]
					.filter(st => st.label || st.scopedStmts || st.stmt)
					.forEach(st => n.adoptChild(this.adaptLine(st)));
			});
		});
		if (ss.elseBranch) {
			this.ctx.withAnonOrLabelScope(lsn, () => {
				ss.elseBranch
					.filter(st => st.label || st.scopedStmts || st.stmt)
					.forEach(st => n.adoptChild(this.adaptLine(st)));
			});
		}
		return n;
	}

	adaptExpr = (e: rcasm.Expr): IOrphanNode => {
		switch (e.type) {
			case 'binary':
				return mkNode(e, 'BinaryOp', e.op, this.adaptExpr(e.left), this.adaptExpr(e.right));
			case 'callfunc':
				return mkNode(
					e,
					'CallFunc',
					undefined,
					this.adaptExpr(e.callee),
					...e.args.map(a => this.adaptExpr(a))
				);
			case 'literal':
				return mkNode(e, 'Literal', e.lit);
			case 'register':
				return mkNode(e, 'Register', e.value);
			case 'qualified-ident':
				return this.adaptSQIndent(e);
			case 'ident':
				return mkNode(e, 'Ref');
			case 'getcurpc':
				return mkNode(e, 'CurrentPC');
			default:
				throw 'Expr type not covered';
		}
	};

	adaptVariable(i: rcasm.Ident): IOrphanNode {
		const n = mkNode(i, 'Variable', i.name);
		this.ctx.declareVar(i.name, n);
		return n;
	}

	adaptSQIndent(sqi: rcasm.ScopeQualifiedIdent): IOrphanNode {
		const n = mkNode(sqi, 'SQRef', `${sqi.path}${sqi.absolute ? ' (abs)' : ''}`);
		n.ref = {
			path: sqi.path,
			absolute: sqi.absolute,
			scope: this.ctx.scope
		};
		return n;
	}
}

const mkNode = (
	rn: rcasm.Node,
	type: nodes.NodeType,
	value?: string | number,
	...children: IOrphanNode[]
): IOrphanNode => {
	const n = nodes.mkNode(type, rn.loc.start.offset, rn.loc.end.offset - rn.loc.start.offset, value);
	children.forEach(c => n.adoptChild(c));
	return n;
};

class ParserContext implements IParseContext {
	root: SymbolScope = new NamedScope<SymEntry>(null, '');
	scope = this.root;
	private anonScopeCount = 0;

	withAnonScope(body: () => void) {
		const anonLabel = `__anon_scope_${this.anonScopeCount}`;
		this.anonScopeCount++;
		this.withLabelScope(anonLabel, body);
	}

	withLabelScope(name: string, body: () => void) {
		const curSym = this.scope;
		this.scope = this.scope.newScope(name, curSym);
		body();
		this.scope = curSym;
	}

	withAnonOrLabelScope(name: string | undefined, body: () => void) {
		if (name) {
			return this.withLabelScope(name, body);
		}
		this.withAnonScope(body);
	}

	declareLabelSymbol(name: string, node: nodes.INode) {
		this.scope.addSymbol(name, { type: 'label', name, node });
	}

	declareVar(name: string, node: nodes.INode): void {
		this.scope.addSymbol(name, { type: 'var', name, node });
	}
}
