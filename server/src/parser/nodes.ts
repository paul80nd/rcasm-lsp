'use strict';

import * as ast from '@paul80nd/rcasm';
import * as scp from './scopes';

export enum NodeType {
	Program,
	Line,
	Label,
	Instruction,
	Literal,
	Register,
	SetPC,
	Directive,
	Scope,
	Expression,
	CurrentPC,
	BinaryOp,
	CallFunc,
	Variable,
	Ref,
	SQRef,
	ConditionalBlock
}

export enum ReferenceType {
	Label,
	Variable
}

export function getNodeAtOffset(node: Node, offset: number): Node | null {
	let candidate: Node | null = null;
	if (!node || offset < node.offset || offset > node.end) {
		return null;
	}

	// Find the shortest node at the position
	node.accept(node => {
		if (node.offset === -1 && node.length === -1) {
			return true;
		}
		if (node.offset <= offset && node.end >= offset) {
			if (!candidate) {
				candidate = node;
			} else if (node.length <= candidate.length) {
				candidate = node;
			}
			return true;
		}
		return false;
	});
	return candidate;
}

export function getNodePath(node: Node, offset: number): Node[] {
	let candidate = getNodeAtOffset(node, offset);
	const path: Node[] = [];

	while (candidate) {
		path.unshift(candidate);
		candidate = candidate.parent;
	}

	return path;
}

export class Node {
	public parent: Node | null;

	public offset: number;
	public length: number;
	public info?: string;
	public get end() {
		return this.offset + this.length;
	}

	private children: Node[] | undefined;

	constructor(
		rnode: ast.Node | undefined,
		private nodeType: NodeType,
		info: string | undefined = undefined
	) {
		this.parent = null;
		this.offset = rnode?.loc.start.offset ?? 0;
		this.length = (rnode?.loc.end.offset ?? 0) - this.offset;
		this.info = info;
	}

	public get type(): NodeType {
		return this.nodeType;
	}

	public accept(visitor: IVisitorFunction): void {
		if (visitor(this) && this.children) {
			for (const child of this.children) {
				child.accept(visitor);
			}
		}
	}

	public acceptVisitor(visitor: IVisitor): void {
		this.accept(visitor.visitNode.bind(visitor));
	}

	protected adoptChild(node: Node): Node {
		node.parent = this;
		let children = this.children;
		if (!children) {
			children = this.children = [];
		}
		children.push(node);
		return node;
	}
}

export const adapt = (s: scp.Scopes, p?: ast.Program): Node => new Program(s, p);

export class Program extends Node {
	constructor(s: scp.Scopes, p?: ast.Program) {
		super(p, NodeType.Program);
		p?.lines
			?.filter(l => l.label || l.scopedStmts || l.stmt)
			.forEach(l => this.adoptChild(new Line(s, l)));
	}
}

class Line extends Node {
	constructor(s: scp.Scopes, l: ast.Line) {
		super(l, NodeType.Line);
		if (l.label) {
			this.adoptChild(new Label(s, l.label));
		}
		if (l.scopedStmts) {
			this.adoptChild(new Scope(s, l));
		}
		if (l.stmt) {
			switch (l.stmt.type) {
				case 'insn':
					this.adoptChild(new Instruction(l.stmt));
					break;
				case 'setpc':
					this.adoptChild(new SetPC(l.stmt));
					break;
				case 'data':
					this.adoptChild(new DataDirective(l.stmt));
					break;
				case 'fill':
					this.adoptChild(new FillDirective(l.stmt));
					break;
				case 'align':
					this.adoptChild(new AlignDirective(l.stmt));
					break;
				case 'for':
					this.adoptChild(new ForDirective(s, l.stmt, l.label?.name));
					break;
				case 'if':
					this.adoptChild(new IfDirective(s, l.stmt, l.label?.name));
					break;
				case 'let':
					this.adoptChild(new LetDirective(s, l.stmt));
					break;
				case 'error':
					this.adoptChild(new ErrorDirective(l.stmt));
					break;
			}
		}
	}
}

export class Label extends Node {
	public name: string;

	constructor(s: scp.Scopes, l: ast.Label) {
		super(l, NodeType.Label, l.name);
		this.name = l.name;
		this.length = l.name.length; // Ignore colon and any whitespace

		if (!s.symbolSeen(l.name)) {
			s.declareLabelSymbol(l.name, this);
		}
	}
}

export class Scope extends Node {
	constructor(s: scp.Scopes, ss: ast.Line) {
		super(ss, NodeType.Scope);
		const label = ss.label?.name ?? '?';
		s.withLabelScope(label, () => {
			ss.scopedStmts!.filter(l => l.label || l.scopedStmts || l.stmt).forEach(l => {
				this.adoptChild(new Line(s, l));
			});
		});
	}
}

export class SetPC extends Node {
	constructor(spc: ast.StmtSetPC) {
		super(spc, NodeType.SetPC);
		this.adoptChild(parameterFromExpr(spc.pc));
	}
}

export class Directive extends Node {
	public mnemonic: string;
	constructor(d: ast.Node, mne: string) {
		super(d, NodeType.Directive, mne);
		this.mnemonic = mne.toLowerCase();
	}
}
export class DataDirective extends Directive {
	constructor(d: ast.StmtData) {
		super(d, d.dataSize === ast.DataSize.Byte ? '!byte' : '!word');
		d.values.forEach(v => {
			this.adoptChild(parameterFromExpr(v));
		});
	}
}
export class FillDirective extends Directive {
	constructor(d: ast.StmtFill) {
		super(d, '!fill');
		this.adoptChild(parameterFromExpr(d.numBytes));
		this.adoptChild(parameterFromExpr(d.fillValue));
	}
}
export class AlignDirective extends Directive {
	constructor(d: ast.StmtAlign) {
		super(d, '!align');
		this.adoptChild(parameterFromExpr(d.alignBytes));
	}
}
export class LetDirective extends Directive {
	constructor(s: scp.Scopes, d: ast.StmtLet) {
		super(d, '!let');
		this.adoptChild(new Variable(s, d.name));
		this.adoptChild(parameterFromExpr(d.value));
	}
}

export class ErrorDirective extends Directive {
	constructor(d: ast.StmtError) {
		super(d, '!error');
	}
}

export class ForDirective extends Directive {
	constructor(s: scp.Scopes, ss: ast.StmtFor, lsn?: string) {
		super(ss, '!for');

		this.adoptChild(new Variable(s, ss.index));
		this.adoptChild(parameterFromExpr(ss.list));

		// Derrive scope name
		let sn = undefined;
		if (lsn) {
			sn = `${lsn}__x`;
		}

		s.withAnonOrLabelScope(sn, () => {
			ss.body!.filter(st => st.label || st.scopedStmts || st.stmt).forEach(st =>
				this.adoptChild(new Line(s, st))
			);
		});
	}
}

export class IfDirective extends Directive {
	constructor(s: scp.Scopes, ss: ast.StmtIfElse, lsn?: string) {
		super(ss, '!if');
		ss.cases.forEach(c => {
			this.adoptChild(parameterFromExpr(c[0]));
			s.withAnonOrLabelScope(lsn, () => {
				c[1]
					.filter(st => st.label || st.scopedStmts || st.stmt)
					.forEach(st => this.adoptChild(new Line(s, st)));
			});
		});
		if (ss.elseBranch) {
			s.withAnonOrLabelScope(lsn, () => {
				ss.elseBranch
					.filter(st => st.label || st.scopedStmts || st.stmt)
					.forEach(st => this.adoptChild(new Line(s, st)));
			});
		}
	}
}

export class Instruction extends Node {
	public mnemonic: string;
	public p1?: Operand;
	public p2?: Operand;

	constructor(si: ast.StmtInsn) {
		super(si, NodeType.Instruction, si.mnemonic);
		this.mnemonic = si.mnemonic.toLowerCase();
		if (si.p1) {
			this.p1 = this.adoptChild(parameterFromExpr(si.p1));
		}
		if (si.p2) {
			this.p2 = this.adoptChild(parameterFromExpr(si.p2));
		}
	}
}

const parameterFromExpr = (p: ast.Expr): Operand => {
	switch (p.type) {
		case 'binary':
			return new BinaryOp(p) as Operand;
		case 'callfunc':
			return new CallFunc(p) as Operand;
		case 'literal':
			return new Literal(p) as Operand;
		case 'register':
			return new Register(p) as Operand;
		case 'qualified-ident':
			return new SQRef(p) as Operand;
		case 'ident':
			return new Ref(p) as Operand;
		case 'getcurpc':
			return new CurrentPC(p) as Operand;
		default:
			throw 'Expr type not covered';
	}
};

export type Operand = SQRef | Literal | Register | CallFunc | Ref | CurrentPC;

export class SQRef extends Node {
	public path: string[];
	public absolute: boolean;
	constructor(sqi: ast.ScopeQualifiedIdent) {
		super(sqi, NodeType.SQRef, `${sqi.path}${sqi.absolute ? ' (abs)' : ''}`);
		// this.length = sqi.path.at(-1)!.length;
		this.path = sqi.path;
		this.absolute = sqi.absolute;
	}
}

export class CurrentPC extends Node {
	constructor(cpc: ast.GetCurPC) {
		super(cpc, NodeType.CurrentPC);
	}
}

export class Literal extends Node {
	public value: number | string;

	constructor(l: ast.Literal) {
		super(l, NodeType.Literal, `${l.ot} ${l.lit}`);
		this.value = l.lit;
	}
}

export class Variable extends Node {
	public name: string;

	constructor(s: scp.Scopes, i: ast.Ident) {
		super(i, NodeType.Variable, i.name);
		this.name = i.name;
		s.declareVar(i.name, this);
	}
}

export class Ref extends Node {
	public name: string;

	constructor(i: ast.Ident) {
		super(i, NodeType.Ref);
		this.name = i.name;
	}
}

export class Expression extends Node {
	constructor(e: ast.Expr) {
		super(e, NodeType.Expression);
		switch (e.type) {
			case 'literal':
				this.adoptChild(new Literal(e));
				break;
			case 'register':
				this.adoptChild(new Register(e));
				break;
			case 'binary':
				this.adoptChild(new Expression(e.left));
				this.adoptChild(new Expression(e.right));
				break;
			case 'qualified-ident':
				return this.adoptChild(new SQRef(e));
			case 'ident':
				return this.adoptChild(new Ref(e));
		}
	}
}

export class BinaryOp extends Node {
	constructor(bo: ast.BinaryOp) {
		super(bo, NodeType.BinaryOp, bo.op);
		this.adoptChild(parameterFromExpr(bo.left));
		this.adoptChild(parameterFromExpr(bo.right));
	}
}

export class CallFunc extends Node {
	constructor(cf: ast.CallFunc) {
		super(cf, NodeType.CallFunc);
		this.adoptChild(parameterFromExpr(cf.callee));
		cf.args.forEach(c => {
			this.adoptChild(parameterFromExpr(c));
		});
	}
}

export class Register extends Node {
	public value: string;

	constructor(r: ast.Register) {
		super(r, NodeType.Register, r.value);
		this.value = r.value.toUpperCase();
	}
}

export interface IVisitor {
	visitNode: (node: Node) => boolean;
}

export type IVisitorFunction = (node: Node) => boolean;
