import instructionsJson from './instructions.json';
import directivesJson from './directives.json';
import { AddressingMode, RegisterName } from '../syntax';
import { integer } from 'vscode-languageserver';

export type AluFlag = 'z' | 'c' | 's';

/**
 * ALU flag register states
 *
 * - The bit remains unchanged by the execution of the instruction
 * * The bit is set or cleared according to the outcome of the instruction.
 */
export type AluFlagState = '-' | '*' | '0' | 'U' | '1';

export type AluFlags = Record<AluFlag, AluFlagState>;

export type InstructionClass = 'ALU' | 'GOTO' | 'MOV8';

/**
 * Supported addressing modes for operand
 */
export type AddressingModes = Record<AddressingMode, boolean>;

export interface MnemonicDoc {
	title: string;
	summary: string;
	syntax: string[];
	description?: string;
	snippet?: string;
}

export interface InstructionDoc extends MnemonicDoc {
	class: InstructionClass;
	cycles: integer;
	operation?: string;
	flags?: AluFlags;
	src?: AddressingModes;
	dest?: AddressingModes;
	procs: Processors;
	variant?: string;
	variants?: InstructionVariant[];
}

export interface InstructionVariant {
	class: InstructionClass;
	cycles: integer;
	variant: string;
	description?: string;
	syntax: string[];
	src?: AddressingModes;
	dest?: AddressingModes;
}

export type Processor = 'rcasm' | 'rcasm+div';

export type Processors = Record<Processor, boolean>;

export const isInstructionDoc = (doc: MnemonicDoc): doc is InstructionDoc =>
	(doc as InstructionDoc).operation !== undefined;

export const instructionDocs = instructionsJson as Record<string, InstructionDoc>;
export const directiveDocs = directivesJson as Record<string, MnemonicDoc>;

export const mnemonicDocs = {
	...instructionDocs,
	...directiveDocs
};

// export const addressingModeDocs: Record<AddressingMode, string> = {
//   dr: "Dr",
//   ar: "Ar",
//   mIndirect: "(m)",
//   imm: "imm",
// };

export const registerDocs: Record<RegisterName, string> = {
	pc: 'Program Counter',
	as: 'Address Switches',
	ds: 'Data Switches'
};
