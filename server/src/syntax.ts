export const sizes: Size[] = ["b", "w", "l", "q", "s", "d", "x", "p"];

export type Size = "b" | "w" | "l" | "q" | "s" | "d" | "x" | "p";

export type RegisterName = "pc" | "sr" | "ccr" | "usp" | "vbr";

export type AddressingMode =
  | "dn"
  | "an"
  | "anIndirect"
  | "anPostInc"
  | "anPreDec"
  | "anOffset"
  | "anIdx"
  | "absW"
  | "absL"
  | "pcOffset"
  | "pcIdx"
  | "imm";

export const registerNames: RegisterName[] = ["pc", "sr", "ccr", "usp", "vbr"]; // exclude sp

export const cpuTypes = [
  "rcasm",
  "rcasm+div"
];