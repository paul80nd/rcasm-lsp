import * as rcasm from '@paul80nd/rcasm';
import { INode, IOrphanNode } from './nodes';
import * as nodes from './nodes';
import { SymbolScope, NamedScope, SymEntry, SymMacro, SourceRange } from './scopes';

export interface IParseContext {
	scope: SymbolScope;
	withAnonScope(body: () => void, range?: SourceRange): void;
	withLabelScope(name: string, body: () => void, range?: SourceRange): void;
	withAnonOrLabelScope(name: string | undefined, body: () => void, range?: SourceRange): void;
	declareLabelSymbol(name: string, node: INode): void;
	declareVar(name: string, node: INode, macro?: SymMacro): void;
	declareMacro(name: string, node: INode, args: string[], body: SymbolScope): SymMacro;
	lookupMacro(ref: rcasm.ScopeQualifiedIdent): SymMacro | undefined;
}

export function parse(text: string): { tree: INode; scopes: SymbolScope; valid: boolean } {
	const ast = rcasm.parseOnly(text);
	const adapter = new AstAdapter();
	const tree = adapter.adapt(ast);
	// A syntax error anywhere leaves no AST, so the tree is empty
	return { tree, scopes: adapter.ctx.root, valid: ast !== undefined };
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
			case 'macro':
				return this.adaptMacroDirective(s);
			case 'callmacro':
				return this.adaptCallMacro(s, l?.name);
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
		this.ctx.withLabelScope(
			label,
			() => {
				ss.scopedStmts
					?.filter(l => l.label || l.scopedStmts || l.stmt)
					.forEach(l => {
						n.adoptChild(this.adaptLine(l));
					});
			},
			rangeOf(ss)
		);
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
			sn = `${lsn}__n`;
		}

		this.ctx.withAnonOrLabelScope(
			sn,
			() => {
				// rcasm numbers each iteration (`label__0`), whereas this stands in for all of them
				this.ctx.scope.nameable = false;
				n.adoptChild(this.adaptVariable(ss.index));

				if (ss.body) {
					ss.body
						.filter(st => st.label || st.scopedStmts || st.stmt)
						.forEach(st => n.adoptChild(this.adaptLine(st)));
				}
			},
			rangeOf(ss)
		);

		return n;
	}

	adaptIfDirective(ss: rcasm.StmtIfElse, lsn?: string): IOrphanNode {
		const n = mkNode(ss, 'Directive', '!if');
		ss.cases.forEach(c => {
			n.adoptChild(this.adaptExpr(c[0]));
			this.ctx.withAnonOrLabelScope(
				lsn,
				() => {
					c[1]
						.filter(st => st.label || st.scopedStmts || st.stmt)
						.forEach(st => n.adoptChild(this.adaptLine(st)));
				},
				rangeOfLines(c[1])
			);
		});
		if (ss.elseBranch) {
			this.ctx.withAnonOrLabelScope(
				lsn,
				() => {
					ss.elseBranch
						.filter(st => st.label || st.scopedStmts || st.stmt)
						.forEach(st => n.adoptChild(this.adaptLine(st)));
				},
				rangeOfLines(ss.elseBranch)
			);
		}
		return n;
	}

	adaptMacroDirective(sm: rcasm.StmtMacro): IOrphanNode {
		const n = mkNode(sm, 'Directive', '!macro');
		const nameNode = mkNode(sm.name, 'MacroName', sm.name.name);
		n.adoptChild(nameNode);

		// The body only has a real scope per expansion, so use an anonymous
		// scope per definition as a stand-in for navigation within the body
		this.ctx.withAnonScope(() => {
			const macro = this.ctx.declareMacro(
				sm.name.name,
				nameNode,
				sm.args.map(a => a.name),
				this.ctx.scope
			);
			sm.args.forEach(a => n.adoptChild(this.adaptVariable(a, macro)));
			sm.body
				.filter(st => st.label || st.scopedStmts || st.stmt)
				.forEach(st => n.adoptChild(this.adaptLine(st)));
		}, rangeOf(sm));
		return n;
	}

	adaptCallMacro(sc: rcasm.StmtCallMacro, lsn?: string): IOrphanNode {
		const n = mkNode(
			sc,
			'CallMacro',
			sc.name.path.join('::'),
			this.adaptSQIndent(sc.name),
			// Arguments are evaluated at the call site, not in the expansion scope
			...sc.args.map(a => this.adaptExpr(a))
		);

		// A label on the call names the expansion scope; point it at the macro's
		// body so `label::body_label` can be resolved
		if (lsn) {
			const macro = this.ctx.lookupMacro(sc.name);
			this.ctx.withLabelScope(lsn, () => {
				this.ctx.scope.macroBody = macro?.body;
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

	adaptVariable(i: rcasm.Ident, macro?: SymMacro): IOrphanNode {
		const n = mkNode(i, 'Variable', i.name);
		this.ctx.declareVar(i.name, n, macro);
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

const rangeOf = (rn: rcasm.Node): SourceRange => ({
	start: rn.loc.start.offset,
	end: rn.loc.end.offset
});

const rangeOfLines = (ls: rcasm.Line[]): SourceRange | undefined =>
	ls.length > 0
		? { start: ls[0].loc.start.offset, end: ls[ls.length - 1].loc.end.offset }
		: undefined;

class ParserContext implements IParseContext {
	root: SymbolScope = new NamedScope<SymEntry>(null, '');
	scope = this.root;
	private anonScopeCount = 0;
	private path: string[] = [];

	withAnonScope(body: () => void, range?: SourceRange) {
		const anonLabel = `__anon_scope_${this.anonScopeCount}`;
		this.anonScopeCount++;
		this.withLabelScope(
			anonLabel,
			() => {
				this.scope.nameable = false;
				body();
			},
			range
		);
	}

	withLabelScope(name: string, body: () => void, range?: SourceRange) {
		const curSym = this.scope;
		this.path.push(name);
		this.scope = this.scope.newScope(name, curSym);
		if (range) {
			this.scope.ranges.push(range);
		}
		body();
		this.path.pop();
		this.scope = curSym;
	}

	withAnonOrLabelScope(name: string | undefined, body: () => void, range?: SourceRange) {
		if (name) {
			return this.withLabelScope(name, body, range);
		}
		this.withAnonScope(body, range);
	}

	declareLabelSymbol(name: string, node: nodes.INode) {
		this.scope.addSymbol(name, { type: 'label', name, node });
	}

	declareVar(name: string, node: nodes.INode, macro?: SymMacro): void {
		this.scope.addSymbol(name, { type: 'var', name, node, macro });
	}

	// Declared in the enclosing scope of `body` (the definition's own stand-in scope)
	declareMacro(name: string, node: nodes.INode, args: string[], body: SymbolScope): SymMacro {
		const macro: SymMacro = { type: 'macro', name, node, args, body };
		(body.parent ?? body).addSymbol(name, macro);
		return macro;
	}

	// Resolve a macro call to its definition as seen from the current scope
	lookupMacro(ref: rcasm.ScopeQualifiedIdent): SymMacro | undefined {
		const path = (ref.absolute ? this.root : this.scope).findSymbolPath(ref.path);
		if (!path) {
			return undefined;
		}
		const sym = this.root.scopeAt(path.slice(0, -1))?.syms.get(path[path.length - 1]);
		return sym?.type === 'macro' ? sym : undefined;
	}
}
