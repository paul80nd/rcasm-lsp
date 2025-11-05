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
			return nodes.mkNode(				'Program', 0, 0	);
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
			switch (l.stmt.type) {
				case 'insn':
					n.adoptChild(this.adaptInstruction(l.stmt));
					break;
				case 'setpc':
					n.adoptChild(this.adaptSetPc(l.stmt));
					break;
				case 'data':
					n.adoptChild(this.adaptDataDirective(l.stmt));
					break;
				case 'fill':
					n.adoptChild(this.adaptFillDirective(l.stmt));
					break;
				case 'align':
					n.adoptChild(this.adaptAlignDirective(l.stmt));
					break;
				case 'for':
					n.adoptChild(this.adaptForDirective(l.stmt, l.label?.name));
					break;
				case 'if':
					n.adoptChild(this.adaptIfDirective(l.stmt, l.label?.name));
					break;
				case 'let':
					n.adoptChild(this.adaptLetDirective(l.stmt));
					break;
				case 'error':
					n.adoptChild(this.adaptErrorDirective(l.stmt));
					break;
			}
		}
		return n;
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
			ss.scopedStmts!.filter(l => l.label || l.scopedStmts || l.stmt).forEach(l => {
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
		const n = mkNode(spc, 'SetPC');
		n.adoptChild(this.adaptExpr(spc.pc));
		return n;
	}

	adaptDataDirective(d: rcasm.StmtData): IOrphanNode {
		const n = mkNode(d, 'Directive', d.dataSize === rcasm.DataSize.Byte ? '!byte' : '!word');
		d.values.forEach(v => {
			n.adoptChild(this.adaptExpr(v));
		});
		return n;
	}

	adaptFillDirective(d: rcasm.StmtFill): IOrphanNode {
		const n = mkNode(d, 'Directive', '!fill');
		n.adoptChild(this.adaptExpr(d.numBytes));
		n.adoptChild(this.adaptExpr(d.fillValue));
		return n;
	}

	adaptAlignDirective(d: rcasm.StmtAlign): IOrphanNode {
		const n = mkNode(d, 'Directive', '!align');
		n.adoptChild(this.adaptExpr(d.alignBytes));
		return n;
	}

	adaptLetDirective(d: rcasm.StmtLet): IOrphanNode {
		const n = mkNode(d, 'Directive', '!let');
		n.adoptChild(this.adaptVariable(d.name));
		n.adoptChild(this.adaptExpr(d.value));
		return n;
	}

	adaptErrorDirective(d: rcasm.StmtError): IOrphanNode {
		return mkNode(d, 'Directive', '!error');
	}

	adaptForDirective(ss: rcasm.StmtFor, lsn?: string): IOrphanNode {
		const n = mkNode(ss, 'Directive', '!for');

		n.adoptChild(this.adaptVariable(ss.index));
		n.adoptChild(this.adaptExpr(ss.list));

		// Derrive scope name
		let sn = undefined;
		if (lsn) {
			sn = `${lsn}__x`;
		}

		this.ctx.withAnonOrLabelScope(sn, () => {
			ss.body!.filter(st => st.label || st.scopedStmts || st.stmt).forEach(st =>
				n.adoptChild(this.adaptLine(st))
			);
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

	adaptExpr = (p: rcasm.Expr): IOrphanNode => {
		switch (p.type) {
			case 'binary':
				return this.adaptBinaryOp(p);
			case 'callfunc':
				return this.adaptCallFunc(p);
			case 'literal':
				return this.adaptLiteral(p);
			case 'register':
				return this.adaptRegister(p);
			case 'qualified-ident':
				return new nodes.SQRef(this.ctx, p);
			case 'ident':
				return this.adaptRef(p);
			case 'getcurpc':
				return this.adaptCurrentPc(p);
			default:
				throw 'Expr type not covered';
		}
	};

	adaptBinaryOp(bo: rcasm.BinaryOp): IOrphanNode {
		const n = mkNode(bo, 'BinaryOp', bo.op);
		n.adoptChild(this.adaptExpr(bo.left));
		n.adoptChild(this.adaptExpr(bo.right));
		return n;
	}

	adaptCallFunc(cf: rcasm.CallFunc): IOrphanNode {
		const n = mkNode(cf, 'CallFunc');
		n.adoptChild(this.adaptExpr(cf.callee));
		cf.args.forEach(c => {
			n.adoptChild(this.adaptExpr(c));
		});
		return n;
	}

	adaptCurrentPc(cpc: rcasm.GetCurPC): IOrphanNode {
		return mkNode(cpc, 'CurrentPC');
	}

	adaptVariable(i: rcasm.Ident): IOrphanNode {
		const n = mkNode(i, 'Variable', i.name);
		this.ctx.declareVar(i.name, n);
		return n;
	}

	adaptRef(i: rcasm.Ident): IOrphanNode {
		return mkNode(i, 'Ref');
	}

	adaptRegister(r: rcasm.Register) : IOrphanNode {
		return mkNode(r, 'Register', r.value);
	}

	adaptLiteral(l: rcasm.Literal) : IOrphanNode {
		return mkNode(l, 'Literal', l.lit);
	}
	
}

const mkNode = (rn: rcasm.Node, type: nodes.NodeType, value?: string | number): IOrphanNode => nodes.mkNode(type, rn.loc.start.offset, rn.loc.end.offset - rn.loc.start.offset, value);

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
