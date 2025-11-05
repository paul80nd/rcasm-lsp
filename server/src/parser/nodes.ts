import * as ast from '@paul80nd/rcasm';
import { SymbolScope } from './scopes';
import { IParseContext } from './parser';

export type NodeType =
	| 'BinaryOp'
	| 'CallFunc'
	| 'ConditionalBlock'
	| 'CurrentPC'
	| 'Directive'
	| 'Expression'
	| 'Instruction'
	| 'Label'
	| 'Line'
	| 'Literal'
	| 'Program'
	| 'Ref'
	| 'Register'
	| 'Scope'
	| 'SetPC'
	| 'SQRef'
	| 'Variable';

export enum ReferenceType {
	Label,
	Variable
}

export function getNodeAtOffset(node: INode, offset: number): INode | undefined {
	let candidate: INode | undefined = undefined;
	if (!node || offset < node.offset || offset > node.end) {
		return undefined;
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

export function getNodePath(node: INode, offset: number): INode[] {
	let candidate = getNodeAtOffset(node, offset);
	const path: INode[] = [];

	while (candidate) {
		path.unshift(candidate);
		candidate = candidate.parent;
	}

	return path;
}

export function mkNode(type: NodeType, offset: number, length: number, value?: string | number) {
	return new Node(type, offset, length, value);
}

export interface INode {
	readonly type: NodeType;
	readonly offset: number;
	readonly length: number;
	readonly value?: string | number;
	readonly end: number;

	readonly parent?: INode;

	accept(visitor: IVisitorFunction): void;
	acceptVisitor(visitor: IVisitor): void;
}
export interface IOrphanNode extends INode {
	parent?: INode;
	adoptChild(node: IOrphanNode): void
	length: number;
}

class Node implements INode, IOrphanNode {
	public readonly type: NodeType;
	public readonly offset: number;
	public length: number;
	public readonly value?: string | number;

	public get end() {
		return this.offset + this.length;
	}

	public parent?: INode;
	private children?: INode[];

	public scope?: SymbolScope;

	constructor(type: NodeType, offset: number, length: number, value?: string | number) {
		this.type = type;
		this.offset = offset;
		this.length = length;
		this.value = value;
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

	public adoptChild(node: IOrphanNode): void {
		node.parent = this;
		this.children = this.children || [];
		this.children.push(node);
	}
}

export class SQRef extends Node {
	public path: string[];
	public absolute: boolean;
	constructor(ctx: IParseContext, sqi: ast.ScopeQualifiedIdent) {
		super('SQRef', sqi.loc.start.offset, sqi.loc.end.offset - sqi.loc.start.offset, `${sqi.path}${sqi.absolute ? ' (abs)' : ''}`);
		this.path = sqi.path;
		this.absolute = sqi.absolute;
		this.scope = ctx.scope;
	}
}

export interface IVisitor {
	visitNode: (node: Node) => boolean;
}

export type IVisitorFunction = (node: Node) => boolean;
