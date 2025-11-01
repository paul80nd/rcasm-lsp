'use strict';

import * as rcasm from '@paul80nd/rcasm';

export enum NodeType {
	Program,
	Line,
	// 	Label,
	// 	LabelRef,
	Instruction,
	Literal,
	Register,
	SetPC,
	// 	Expr,
	Directive,
	// 	Fill,
	Scope,
	Expression
}

// export enum ReferenceType {
// 	Label
// }

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

export type ITextProvider = (offset: number, length: number) => string;

export class Node {
	public parent: Node | null;

	public offset: number;
	public length: number;
	public get end() {
		return this.offset + this.length;
	}

	// public textProvider: ITextProvider | undefined; // only set on the root node

	private children: Node[] | undefined;

	constructor(
		rnode: rcasm.Node | undefined,
		private nodeType: NodeType
	) {
		this.parent = null;
		this.offset = rnode?.loc.start.offset ?? 0;
		this.length = (rnode?.loc.end.offset ?? 0) - this.offset;
	}

	public get type(): NodeType {
		return this.nodeType;
	}

	// private getTextProvider(): ITextProvider {
	// 	// eslint-disable-next-line @typescript-eslint/no-this-alias
	// 	let node: Node | null = this;
	// 	while (node && !node.textProvider) {
	// 		node = node.parent;
	// 	}
	// 	if (node) {
	// 		return node.textProvider!;
	// 	}
	// 	return () => { return 'unknown'; };
	// }

	// public getText(): string {
	// 	return this.getTextProvider()(this.offset, this.length);
	// }

	// 	public matches(str: string): boolean {
	// 		return this.length === str.length && this.getTextProvider()(this.offset, this.length) === str;
	// 	}

	public accept(visitor: IVisitorFunction): void {
		if (visitor(this) && this.children) {
			for (const child of this.children) {
				child.accept(visitor);
			}
		}
	}

	// 	public acceptVisitor(visitor: IVisitor): void {
	// 		this.accept(visitor.visitNode.bind(visitor));
	// 	}

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

// export function adapt(p: rcasm.Program): Program {
// 	return new Program(p);
// }

export class Program extends Node {
	constructor(p: rcasm.Program | undefined) {
		super(p, NodeType.Program);
		p?.lines?.forEach(l => this.adoptChild(new Line(l)));
	}
}

class Line extends Node {
	constructor(l: rcasm.Line) {
		super(l, NodeType.Line);
		// 		if (l.label) { this.adoptChild(new Label(l.label)); }
		if (l.scopedStmts) {
			this.adoptChild(new Scope(l));
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
					this.adoptChild(new ForDirective(l.stmt));
					break;
				case 'if':
					this.adoptChild(new IfDirective(l.stmt));
					break;
				case 'let':
					this.adoptChild(new LetDirective(l.stmt));
					break;
				case 'error':
					this.adoptChild(new ErrorDirective(l.stmt));
					break;
			}
		}
	}
}

// export class Label extends Node {
// 	constructor(l: rcasm.Label) {
// 		super(l, NodeType.Label);
// 		this.length = l.name.length;	// Ignore colon and any whitespace
// 	}

// 	public getName(): string {
// 		return this.getText();
// 	}
// }

export class Scope extends Node {
	constructor(ss: rcasm.Line) {
		super(ss, NodeType.Scope);
		ss.scopedStmts!.forEach(s => {
			this.adoptChild(new Line(s));
		});
	}
}

export class SetPC extends Node {
	// public pcExpr: Expression;

	constructor(spc: rcasm.StmtSetPC) {
		super(spc, NodeType.SetPC);
		// this.pcExpr = this.adoptChild(new Expression(spc.pc));
	}
}

export class Directive extends Node {
	public mnemonic: string;
	constructor(d: rcasm.Node, mne: string) {
		super(d, NodeType.Directive);
		this.mnemonic = mne.toLowerCase();
	}
}
export class DataDirective extends Directive {
	constructor(d: rcasm.StmtData) {
		super(d, d.dataSize === rcasm.DataSize.Byte ? '!byte' : '!word');
		d.values.forEach(v => {
			this.adoptChild(new Expression(v));
		});
	}
}
export class FillDirective extends Directive {
	constructor(d: rcasm.StmtFill) {
		super(d, '!fill');
		this.adoptChild(new Expression(d.numBytes));
		this.adoptChild(new Expression(d.fillValue));
	}
}
export class AlignDirective extends Directive {
	constructor(d: rcasm.StmtAlign) {
		super(d, '!align');
		this.adoptChild(new Expression(d.alignBytes));
	}
}
export class LetDirective extends Directive {
	constructor(d: rcasm.StmtLet) {
		super(d, '!let');
	}
}
export class ErrorDirective extends Directive {
	constructor(d: rcasm.StmtError) {
		super(d, '!error');
	}
}

export class ForDirective extends Directive {
	constructor(ss: rcasm.StmtFor) {
		super(ss, '!for');
		ss.body!.forEach(s => {
			this.adoptChild(new Line(s));
		});
	}
}

export class IfDirective extends Directive {
	constructor(ss: rcasm.StmtIfElse) {
		super(ss, '!if');
		ss.cases.forEach(c => {
			c[1].forEach(s => {
				this.adoptChild(new Line(s));
			});
		});
		ss.elseBranch?.forEach(s => {
			this.adoptChild(new Line(s));
		});
	}
}

export class Instruction extends Node {
	public mnemonic: string;
	public p1?: Operand;
	public p2?: Operand;

	constructor(si: rcasm.StmtInsn) {
		super(si, NodeType.Instruction);
		const addParam = (p: rcasm.Expr): Operand | undefined => {
			switch (p.type) {
				case 'literal':
					return this.adoptChild(new Literal(p)) as Operand;
				case 'register':
					return this.adoptChild(new Register(p)) as Operand;
				// 				case 'qualified-ident':
				// 					return this.adoptChild(new LabelRef(p));
				default:
					return this.adoptChild(new Expression(p)) as Operand;
			}
		};
		this.mnemonic = si.mnemonic.toLowerCase();
		if (si.p1) {
			this.p1 = addParam(si.p1);
		}
		if (si.p2) {
			this.p2 = addParam(si.p2);
		}
	}
}

export type Operand = /*LabelRef |*/ Literal | Register;

// export class LabelRef extends Node {
// 	constructor(sqi: rcasm.ScopeQualifiedIdent) {
// 		super(sqi, NodeType.LabelRef);
// 		this.length = sqi.path.at(-1)!.length;
// 	}
// }

export class Literal extends Node {
	public value: number | string;

	constructor(l: rcasm.Literal) {
		super(l, NodeType.Literal);
		this.value = l.lit;
	}
}

export class Expression extends Node {
	constructor(e: rcasm.Expr) {
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
			// 				case 'qualified-ident':
			// 					return this.adoptChild(new LabelRef(p));
		}
	}
}

export class Register extends Node {
	public value: string;

	constructor(r: rcasm.Register) {
		super(r, NodeType.Register);
		this.value = r.value.toUpperCase();
	}
}

// export interface IVisitor {
// 	visitNode: (node: Node) => boolean;
// }

export type IVisitorFunction = (node: Node) => boolean;
