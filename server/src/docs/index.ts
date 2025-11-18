import { instructionDocs } from './instructions';
import { directiveDocs } from './directives';

export * from './instructions';
export * from './directives';
export * from './registers';

export interface MnemonicDoc {
	title: string;
	summary: string;
	syntax: string[];
	description?: string[];
	snippet?: string;
}

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
