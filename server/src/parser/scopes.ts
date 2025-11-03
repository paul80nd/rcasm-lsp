import * as nodes from './nodes';

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

	updateSymbol(name: string, val: T) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		for (let cur: NamedScope<T> | null = this; cur !== null; cur = cur.parent) {
			const v = cur.syms.get(name);
			if (v !== undefined) {
				cur.syms.set(name, val);
				return;
			}
		}
	}
}

export type SymEntry = SymLabel | SymVar;

export interface SymLabel {
	type: 'label';
	name: string;
	node: nodes.Node;
}

export interface SymVar {
	type: 'var';
	name: string;
	node: nodes.Node;
}

export class Scopes {
	root: NamedScope<SymEntry> = new NamedScope<SymEntry>(null, '');
	curSymtab = this.root;
	private anonScopeCount = 0;

	withAnonScope(body: () => void, parent?: NamedScope<SymEntry>) {
		const anonLabel = `__anon_scope_${this.anonScopeCount}`;
		this.anonScopeCount++;
		this.withLabelScope(anonLabel, body, parent);
	}

	withLabelScope(name: string, body: () => void, parent?: NamedScope<SymEntry>) {
		const curSym = this.curSymtab;
		this.curSymtab = this.curSymtab.newScope(name, parent || curSym);
		body();
		this.curSymtab = curSym;
	}

	findPath(path: string[], absolute: boolean): SymEntry | undefined {
		if (absolute) {
			return this.root.findSymbolPath(path);
		}
		return this.curSymtab.findSymbolPath(path);
	}

	findQualifiedSym(path: string[], absolute: boolean): SymEntry | undefined {
		return this.findPath(path, absolute);
	}

	symbolSeen(name: string): boolean {
		const n = this.curSymtab.syms.get(name);
		if (n !== undefined) {
			return true;
		}
		return false;
	}

	declareLabelSymbol(name: string, node: nodes.Node) {
		// As we allow name shadowing, we must look up the name
		// only from the current scope.  If we lookup parent
		// scopes for label declarations, we end up
		// mutating some unrelated, but same-named label names.
		const prevLabel = this.curSymtab.syms.get(name);
		if (prevLabel === undefined) {
			const lblsym: SymLabel = {
				type: 'label',
				name,
				node
			};
			this.curSymtab.addSymbol(name, lblsym);
			return;
		}
		if (prevLabel.type !== 'label') {
			throw new Error('ICE: declareLabelSymbol should be called only on labels');
		}
		// Update to mark the label as "seen" in this pass
		this.curSymtab.updateSymbol(name, prevLabel);
	}

	declareVar(name: string, node: nodes.Node): void {
		this.curSymtab.addSymbol(name, { type: 'var', name, node });
	}
}
