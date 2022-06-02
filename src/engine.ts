import { Scope } from "./domain";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Operation = { name: string; fun: (scope: Scope, data: any) => Promise<void> };

function computeImpact(operation: Operation) {}
