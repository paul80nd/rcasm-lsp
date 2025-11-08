import { INode } from './nodes';

export type SymbolScope = NamedScope<SymEntry>;

export interface SymbolReference {
	path: string[];
	absolute: boolean;
	scope: SymbolScope;
}

export class NamedScope<T> {
	syms = new Map<string, T>();
	readonly parent: NamedScope<T> | null = null;
	readonly name: string;
	children = new Map<string, NamedScope<T>>();

	constructor(parent: NamedScope<T> | null, name: string) {
		this.parent = parent;
		this.name = name;
	}

	newScope(name: string, parent: NamedScope<T>): NamedScope<T> {
		const s = this.children.get(name);
		if (s !== undefined) {
			return s;
		}
		const newScope = new NamedScope<T>(parent, name);
		this.children.set(name, newScope);
		return newScope;
	}

	addSymbol(name: string, val: T): void {
		this.syms.set(name, val);
	}
}

export type SymEntry = SymLabel | SymVar;

export interface SymLabel {
	type: 'label';
	name: string;
	node: INode;
}

export interface SymVar {
	type: 'var';
	name: string;
	node: INode;
}
