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
	readonly path: string[];
	children = new Map<string, NamedScope<T>>();

	constructor(parent: NamedScope<T> | null, name: string) {
		this.parent = parent;
		this.name = name;
		this.path = parent ? [...parent.path, name] : [];
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

	// Find symbol from current and all parent scopes
	findSymbol(name: string): string[] | undefined {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		for (let cur: NamedScope<T> | null = this; cur !== null; cur = cur.parent) {
			const n = cur.syms.get(name);
			if (n !== undefined) {
				return [...cur.path, name];
			}
		}
		// If not found assume ref to local undeclared
		return [...this.path, name];
	}

	// Find relative label::path::sym style references from the symbol table
	findSymbolPath(path: string[]): string[] | undefined {
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
				return [...this.path, path[0]];	// If not found assume ref to local undeclared
			}
		}

		// Go down the tree to match the path to a symbol
		for (let i = 0; i < path.length - 1; i++) {
			tab = tab.children.get(path[i]);
			if (tab === undefined) {
				return [...this.path, path[0]];	// If not found assume ref to local undeclared
			}
		}
		return [...tab.path, path[path.length - 1]];
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
