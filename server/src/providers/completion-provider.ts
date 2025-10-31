import * as lsp from 'vscode-languageserver';

import { Provider } from '.';
import * as syntax from '../syntax';
import { directiveDocs, instructionDocs, mnemonicDocs, registerDocs } from '../docs/index';
import { Definition, DefinitionType, labelBeforePosition } from '../symbols';
import { Context } from '../context';
import { Component, componentAtIndex, ComponentType, parseLine, parseSignature } from '../parse';
import { formatMnemonicDoc } from '../formatting';
//import { ProcessedDocument } from "../document-processor";

export default class CompletionProvider implements Provider {
	constructor(protected readonly ctx: Context) {
		this.namedRegs = syntax.registerNames.map(label => ({
			label,
			detail: registerDocs[label],
			kind: lsp.CompletionItemKind.Keyword
		}));
	}

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
					case '<cpu_type>':
						return enumValues(syntax.cpuTypes);
					case '<label>': {
						const symbols = await this
							.completeAllDefinitions
							// processed,
							// position
							();
						return symbols.filter(n => n.detail === '(label)');
					}
					case 'Rn':
					case 'Rx':
					case 'Ry': {
						// TODO: register defintions
						const regs = [...this.addrRegs, ...this.dataRegs];
						return this.ucItems(regs, isUpperCase);
					}
					case 'An':
					case 'Ax':
					case 'Ay':
						return this.ucItems(this.addrRegs, isUpperCase);
					case 'Dn':
					case 'Dx':
					case 'Dy':
						return this.ucItems(this.dataRegs, isUpperCase);
					default:
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
		const symbols = await this.completeAllDefinitions(/*processed, position*/);
		const registers = this.completeRegisters(isUpperCase);
		return [...symbols, ...registers];
	}

	completeRegisters(isUpperCase: boolean) {
		return this.ucItems([...this.addrRegs, ...this.dataRegs, ...this.namedRegs], isUpperCase);
	}

	async completeAllDefinitions() {
		// position: lsp.Position // processed: ProcessedDocument,
		const globals = Array.from(this.ctx.store.values()).flatMap(({ symbols }) =>
			this.completeDefinitions(symbols.definitions)
		);

		const lastLabel = labelBeforePosition(/*processed.symbols, position*/);
		const locals = lastLabel?.locals ? this.completeDefinitions(lastLabel.locals) : [];

		return [...globals, ...locals];
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

	private dataRegs: lsp.CompletionItem[] = [
		{
			label: 'd0',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd1',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd2',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd3',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd4',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd5',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd6',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'd7',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		}
	];
	private addrRegs: lsp.CompletionItem[] = [
		{ label: 'a0', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
		{ label: 'a1', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
		{ label: 'a2', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
		{
			label: 'a3',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'a4',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'a5',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'a6',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'a7',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		},
		{
			label: 'sp',
			detail: '(register)',
			kind: lsp.CompletionItemKind.Keyword
		}
	];
	private namedRegs: lsp.CompletionItem[];
}

function enumValues(values: string[]): lsp.CompletionItem[] {
	return values.map(label => ({
		label,
		kind: lsp.CompletionItemKind.Enum
	}));
}

const typeMappings: Record<DefinitionType, lsp.CompletionItemKind> = {
	[DefinitionType.Section]: lsp.CompletionItemKind.Module,
	[DefinitionType.Label]: lsp.CompletionItemKind.Field,
	[DefinitionType.Constant]: lsp.CompletionItemKind.Constant,
	[DefinitionType.Variable]: lsp.CompletionItemKind.Variable,
	[DefinitionType.Register]: lsp.CompletionItemKind.Constant,
	[DefinitionType.RegisterList]: lsp.CompletionItemKind.Constant,
	[DefinitionType.Offset]: lsp.CompletionItemKind.Constant,
	[DefinitionType.XRef]: lsp.CompletionItemKind.Field
};
