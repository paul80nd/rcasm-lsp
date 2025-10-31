import { MarkupContent, MarkupKind } from 'vscode-languageserver-types';
import {
	//   addressingModeDocs,
	//   AddressingModes,
	isInstructionDoc,
	MnemonicDoc
} from './docs';
// import { AddressingMode } from "./syntax";

// export function formatDeclaration(definitionLine: string) {
//   return definitionLine
//     .split(/(;|\* )/)[0] // Remove comment
//     .replace(/\s+/g, " ") // Collapse whitespace
//     .trimEnd();
// }

// export function formatNumeric(text: string): string {
//   const value = Number(
//     text.replace("$", "0x").replace("%", "0b").replace("@", "0o")
//   );
//   const hex = value.toString(16);
//   const oct = value.toString(8);
//   const bin = value.toString(2);
//   const ascii = asciiValue(value);

//   return `${value} | $${hex} | %${bin} | @${oct} | "${ascii}"`;
// }

// export function asciiValue(num: number) {
//   const bytes = [
//     (num & 0xff000000) >> 24,
//     (num & 0x00ff0000) >> 16,
//     (num & 0x0000ff00) >> 8,
//     num & 0x000000ff,
//   ];
//   const firstByte = bytes.findIndex((b) => b > 0);

//   return bytes
//     .slice(firstByte)
//     .map((byte) =>
//       byte < 32 || (byte > 127 && byte < 161) || byte > 255
//         ? "."
//         : String.fromCharCode(byte)
//     )
//     .join("");
// }

export function formatMnemonicDoc(doc: MnemonicDoc): MarkupContent {
	let value = ``;

	if (isInstructionDoc(doc)) {
		const vs = doc.variants ?? [];
		const hva = vs.length > 0 ? '🄰 ' : '';
		const hvs = ['🄱 '];

		// Syntax
		value = '\n```rcasm\n';
		value += doc.syntax.map(s => hva + s).join('\n');
		vs.forEach((v, i) => {
			value += '\n' + v.syntax.map(s => hvs[i] + s).join('\n');
		});
		value += '\n```\n\n---\n';

		// Description
		value += `${hva}**${vs.length > 0 ? (doc.variant ?? doc.summary) : doc.summary}**`;
		if (doc.description) {
			value += `  \n${doc.description}`;
		}
		vs.forEach((v, i) => {
			value += `\n\n${hvs[i]}**${v.variant}**`;
			if (v.description) {
				value += `  \n${v.description}`;
			}
		});

		// Flags
		if (doc.flags) {
			const cols = Object.values(doc.flags).map(f => (f === '-' ? '-' : '`' + f + '`'));
			value += '\n\n---\n\n';
			value += '|   |   | Z | C | S |\n';
			value += '|---|---|:-:|:-:|:-:|\n';
			value += `| ${hva}\`${doc.class}\` \`${doc.cycles}\` | &nbsp;&nbsp; | ${cols.join(' | ')} |`;
			vs.forEach((v, i) => {
				value += `\n| ${hvs[i]}\`${v.class}\` \`${v.cycles}\` | &nbsp;&nbsp; | ${cols.join(' | ')} |`;
			});
		}

		const widths = [19, 34, 8, 8, 8];

		// Addressing Modes
		if (doc.src || doc.dest) {
			value += '\n\n---\n\n';
			value += '|     |  | dr&nbsp;&nbsp; | ar&nbsp;&nbsp; | (m)&nbsp; | imm |\n';
			value += '|-----|--|----|----|-----|-----|';
			if (doc.src) {
				let src =
					vs.length > 0
						? Object.values(doc.src).map(v => (v ? ' ' + hva : ''))
						: Object.values(doc.src).map(v => (v ? '  ✓' : ''));
				vs.forEach((v, i) => {
					if (v.src) {
						const vsrc = Object.values(v.src).map(v => (v ? ' ' + hvs[i] : ''));
						src = src.map((s, i) => s + vsrc[i]);
					}
				});
				const srcCols = src.map(v => (v === '' ? ' -' : v)).map((v, i) => v.padEnd(widths[i], ' '));
				value += `\n| \`src\`  |&nbsp; &nbsp;|${srcCols.join('|')}|`;
			}
			if (doc.dest) {
				let dst =
					vs.length > 0
						? Object.values(doc.dest).map(v => (v ? ' ' + hva : ''))
						: Object.values(doc.dest).map(v => (v ? '  ✓' : ''));
				vs.forEach((v, i) => {
					if (v.dest) {
						const vdest = Object.values(v.dest).map(v => (v ? ' ' + hvs[i] : ''));
						dst = dst.map((s, i) => s + vdest[i]);
					}
				});
				const destCols = dst
					.map(v => (v === '' ? ' -' : v))
					.map((v, i) => v.padEnd(widths[i], ' '));
				value += `\n| \`dst\` |&nbsp; &nbsp;|${destCols.join('|')}|`;
			}
		}
	}

	return {
		kind: MarkupKind.Markdown,
		value
	};
}

// export function formatAddressingModes(addressing: AddressingModes): string {
//   return Object.entries(addressing)
//     .map(([key, allowed]) =>
//       allowed ? addressingModeDocs[key as AddressingMode] : ""
//     )
//     .filter(Boolean)
//     .join(", ");
// }
