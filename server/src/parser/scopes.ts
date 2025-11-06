import { INode } from './nodes';

export type SymbolScope = NamedScope<SymEntry>;

export interface SymbolReference {
	path: string[];
	absolute: boolean;
	scope: SymbolScope;
}

export class Scopes {
	constructor(readonly root: SymbolScope) {}

	findQualifiedSymbol(ref: SymbolReference) {
		if (ref.absolute || !ref.scope) {
			return this.root.findSymbolPath(ref.path);
		}
		return ref.scope.findSymbolPath(ref.path);
	}
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

	// Find symbol from current and all parent scopes
	findSymbol(name: string): T | undefined {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		for (let cur: NamedScope<T> | null = this; cur !== null; cur = cur.parent) {
			const n = cur.syms.get(name);
			if (n !== undefined) {
				return n;
			}
		}
		return undefined;
	}

	// Find relative label::path::sym style references from the symbol table
	findSymbolPath(path: string[]): T | undefined {
		if (path.length === 1) {
			return this.findSymbol(path[0]);
		}

		// Go up the scope tree until we find the start of
		// the relative path.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		let tab: NamedScope<T> | null | undefined = this;
		while (tab.children.get(path[0]) === undefined) {
			tab = tab.parent;
			if (tab === null) {
				return undefined;
			}
		}

		// Go down the tree to match the path to a symbol
		for (let i = 0; i < path.length - 1; i++) {
			tab = tab.children.get(path[i]);
			if (tab === undefined) {
				return undefined;
			}
		}
		return tab.syms.get(path[path.length - 1]);
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
