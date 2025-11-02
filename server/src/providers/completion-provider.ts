import * as lsp from 'vscode-languageserver';

import { Provider } from '.';
import { directiveDocs, instructionDocs, mnemonicDocs, registerDocs } from '../docs/index';
import { Definition, DefinitionType } from '../symbols';
import { Context } from '../context';
import { Component, componentAtIndex, ComponentType, parseLine, parseSignature } from '../parse';
import { formatMnemonicDoc, formatRegisterDoc } from '../formatting';
import { RegisterName } from '../syntax';
//import { ProcessedDocument } from "../document-processor";

export default class CompletionProvider implements Provider {
	constructor(protected readonly ctx: Context) {}

	async onCompletion({
		position,
		textDocument
	}: lsp.CompletionParams): Promise<lsp.CompletionItem[]> {
		const processed = this.ctx.store.get(textDocument.uri);
		if (!processed) {
			return [];
		}

		const textOnLine = processed.document.getText(
			lsp.Range.create(lsp.Position.create(position.line, 0), position)
		);
		const line = parseLine(textOnLine ?? '');
		if (!line) {
			return [];
		}

		const info = componentAtIndex(line, position.character);
		const value = info?.component.value ?? '';
		let type = info?.type;

		const isUpperCase = value.length > 0 && value.toLowerCase() !== value;

		// Fallbacks when haven't started a component yet
		if (!info) {
			// Default to operand if after mnemonic and last component
			if (
				line.mnemonic &&
				position.character > line.mnemonic.end &&
				!line.comment &&
				!line.operands
			) {
				type = ComponentType.Operand;
			}
			// Default to mnemonic if not one already
			if (!line.mnemonic) {
				type = ComponentType.Mnemonic;
			}
		}

		switch (type) {
			case ComponentType.Mnemonic:
				return this.completeMnemonics(isUpperCase, position, info?.component);
			case ComponentType.Operand: {
				const mnemonic = line.mnemonic?.value.toLowerCase();
				if (!mnemonic) {
					return [];
				}
				const doc = mnemonic && mnemonicDocs[mnemonic];
				const signature = doc && doc.syntax.length ? parseSignature(doc.syntax[0]) : null; // TODO: find active
				switch (signature?.operands[info?.index ?? 0].value) {
					// case '<cpu_type>':
					// 	return enumValues(syntax.cpuTypes);
					case '<label>':
						return [];
					// 	const symbols = await this.completeAllDefinitions(processed,position);
					case '<src:Dr>':
					case '<dst:Dr>':
						return this.completeRegisters(isUpperCase, this.dataRegs);
					case '<dst:a|b>':
						return this.completeRegisters(isUpperCase, ['a', 'b']);
					case '<dst:a|d>':
						return this.completeRegisters(isUpperCase, ['a', 'd']);
					case '<src:a-d>':
					case '<dst:a-d>':
						return this.completeRegisters(isUpperCase, this.abcdRegs);
					case '<message>':
						return [];
					default:
						// Any other cases we'll put out what we can to match
						return this.completeOperands(isUpperCase /*, processed, position*/);
				}
			}
			default:
				return [];
		}
	}

	ucItems(items: lsp.CompletionItem[], uppercase: boolean) {
		return uppercase
			? items.map(reg => ({
					...reg,
					label: reg.label.toUpperCase()
				}))
			: items;
	}

	onCompletionResolve(item: lsp.CompletionItem) {
		if (item.data) {
			const doc = mnemonicDocs[item.label.toLowerCase()];
			if (doc) {
				item.documentation = formatMnemonicDoc(doc);
			} else {
				const rdoc = registerDocs[item.label.toLowerCase() as RegisterName];
				if (rdoc) {
					item.documentation = formatRegisterDoc(rdoc);
				}
			}
		}
		return item;
	}

	async completeMnemonics(
		isUpperCase: boolean,
		position: lsp.Position,
		component?: Component
	): Promise<lsp.CompletionItem[]> {
		const instructions = Object.values(instructionDocs)
			.filter(doc => this.ctx.config.processors.some(proc => doc.procs[proc]))
			.map(doc => {
				const insertText = doc.snippet ?? doc.title;
				const item: lsp.CompletionItem = {
					label: isUpperCase ? doc.title.toUpperCase() : doc.title.toLowerCase(),
					labelDetails: {
						description: doc.summary
					},
					kind: lsp.CompletionItemKind.Method,
					// When providing textEdit clients typically ignore insertText.
					// Keep insertText for clients that don't support textEdit on completions.
					insertText: isUpperCase ? insertText.toUpperCase() : insertText,
					insertTextFormat: doc.snippet
						? lsp.InsertTextFormat.Snippet
						: lsp.InsertTextFormat.PlainText,
					data: true
				};
				// If we have a component range, replace that range so the completion doesn't simply insert at
				// the cursor (which would duplicate any already-typed prefix like '!').
				if (component) {
					item.textEdit = lsp.TextEdit.replace(
						this.getCompletionRange(position, component),
						item.insertText as string
					);
				}
				return item;
			});

		const directives = Object.values(directiveDocs).map(doc => {
			const insertText = doc.snippet ?? doc.title;
			const item: lsp.CompletionItem = {
				label: isUpperCase ? doc.title.toUpperCase() : doc.title.toLowerCase(),
				labelDetails: {
					description: doc.summary
				},
				sortText: doc.title.substring(1),
				kind: lsp.CompletionItemKind.Keyword,
				insertText: isUpperCase ? insertText.toUpperCase() : insertText,
				insertTextFormat: doc.snippet
					? lsp.InsertTextFormat.Snippet
					: lsp.InsertTextFormat.PlainText,
				data: true
			};
			// Attach textEdit to directives as well if we have a range to replace.
			if (component) {
				item.textEdit = lsp.TextEdit.replace(
					this.getCompletionRange(position, component),
					item.insertText as string
				);
			}
			return item;
		});

		return [...instructions, ...directives];
	}

	private getCompletionRange = (position: lsp.Position, component: Component) =>
		lsp.Range.create(
			lsp.Position.create(position.line, component.start),
			lsp.Position.create(position.line, component.end)
		);

	completeDefinitions(definitions: Map<string, Definition>): lsp.CompletionItem[] {
		return Array.from(definitions.values()).map(def => {
			const unprefixed = def.name.replace(/^\./, '');
			return {
				label: def.name,
				kind: typeMappings[def.type],
				filterText: unprefixed,
				insertText: unprefixed,
				detail: '(' + def.type + ')',
				documentation: def.comment && {
					kind: lsp.MarkupKind.Markdown,
					value: def.comment
				}
			};
		});
	}

	async completeOperands(
		isUpperCase: boolean
		// processed: ProcessedDocument,
		// position: lsp.Position
	) {
		//const symbols = await this.completeAllDefinitions(/*processed, position*/);
		const registers = await this.completeRegisters(isUpperCase);
		return [/*...symbols, */ ...registers];
	}

	// async completeAllDefinitions() {
	// 	// position: lsp.Position // processed: ProcessedDocument,
	// 	const globals = Array.from(this.ctx.store.values()).flatMap(({ symbols }) =>
	// 		this.completeDefinitions(symbols.definitions)
	// 	);

	// 	const lastLabel = labelBeforePosition(/*processed.symbols, position*/);
	// 	const locals = lastLabel?.locals ? this.completeDefinitions(lastLabel.locals) : [];

	// 	return [...globals, ...locals];
	// }

	async completeRegisters(
		isUpperCase: boolean,
		registers?: RegisterName[]
	): Promise<lsp.CompletionItem[]> {
		const selectedRegisters = registers
			? registers.map(r => registerDocs[r])
			: Object.values(registerDocs);
		return selectedRegisters.map(
			doc =>
				({
					label: isUpperCase ? doc.title.toUpperCase() : doc.title.toLowerCase(),
					labelDetails: {
						description: doc.summary
					},
					kind: lsp.CompletionItemKind.Keyword,
					data: true
				}) as lsp.CompletionItem
		);
	}

	register(connection: lsp.Connection): lsp.ServerCapabilities {
		connection.onCompletion(this.onCompletion.bind(this));
		connection.onCompletionResolve(this.onCompletionResolve.bind(this));
		return {
			completionProvider: {
				triggerCharacters: ['!'],
				resolveProvider: true
			}
		};
	}

	private abcdRegs: RegisterName[] = ['a', 'b', 'c', 'd'];
	private dataRegs: RegisterName[] = [...this.abcdRegs, 'm1', 'm2', 'x', 'y'];
	private addrRegs: RegisterName[] = ['m', 'xy', 'j'];
}

// function enumValues(values: string[]): lsp.CompletionItem[] {
// 	return values.map(label => ({
// 		label,
// 		kind: lsp.CompletionItemKind.Enum
// 	}));
// }

const typeMappings: Record<DefinitionType, lsp.CompletionItemKind> = {
	// [DefinitionType.Section]: lsp.CompletionItemKind.Module,
	[DefinitionType.Label]: lsp.CompletionItemKind.Field
	// [DefinitionType.Constant]: lsp.CompletionItemKind.Constant,
	// [DefinitionType.Variable]: lsp.CompletionItemKind.Variable,
	// [DefinitionType.Register]: lsp.CompletionItemKind.Constant,
	// [DefinitionType.RegisterList]: lsp.CompletionItemKind.Constant,
	// [DefinitionType.Offset]: lsp.CompletionItemKind.Constant,
	// [DefinitionType.XRef]: lsp.CompletionItemKind.Field
};
