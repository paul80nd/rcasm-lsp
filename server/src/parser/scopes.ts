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
	// Source ranges (offsets) this scope covers; a scope can be reopened so there may be several
	ranges: { start: number; end: number }[] = [];
	// A labelled macro call's expansion scope stands in for the macro's body scope, so
	// `label::body_label` resolves into the definition
	expands?: NamedScope<T>;

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
				return [...this.path, path[0]]; // If not found assume ref to local undeclared
			}
		}

		// Go down the tree to match the path to a symbol
		for (let i = 0; i < path.length - 1; i++) {
			tab = tab.children.get(path[i]);
			if (tab === undefined) {
				return [...this.path, path[0]]; // If not found assume ref to local undeclared
			}
			tab = tab.expands ?? tab;
		}
		return [...tab.path, path[path.length - 1]];
	}

	// Find the scope at the given absolute path (no fallback to undeclared)
	scopeAt(path: string[]): NamedScope<T> | undefined {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		let tab: NamedScope<T> | undefined = this;
		for (const p of path) {
			tab = tab.children.get(p);
			if (tab === undefined) {
				return undefined;
			}
		}
		return tab;
	}

	// Innermost scope (this or a descendant) whose source ranges contain the offset
	scopeAtOffset(offset: number): NamedScope<T> {
		for (const c of this.children.values()) {
			if (c.ranges.some(r => r.start <= offset && offset <= r.end)) {
				return c.scopeAtOffset(offset);
			}
		}
		return this;
	}
}

export type SymEntry = SymLabel | SymVar | SymMacro;

export interface SymLabel {
	type: 'label';
	name: string;
	node: INode;
}

export interface SymVar {
	type: 'var';
	name: string;
	node: INode;
	// Set when the variable is a macro argument
	macro?: SymMacro;
}

export interface SymMacro {
	type: 'macro';
	name: string;
	node: INode;
	args: string[];
	// Stand-in scope for the body (the real scope is per expansion)
	body: SymbolScope;
}
