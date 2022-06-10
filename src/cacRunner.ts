/* eslint-disable @typescript-eslint/no-explicit-any */
import { Computation, Scope } from "./cacBase";
import { computationError, computationSuccess } from "./cacEngine";

export type ComputationRequest<T extends Scope, Input, Output> = {
  computation: Computation<T, Input, Output>;
  scope: T;
  input: Input;
  inputHash: string;
};

export type ComputationResponse<T extends Scope, Input, Output> = {
  computation: Computation<T, Input, Output>;
  scope: T;
  output: Output;
  inputHash: string;
};

/**
 * A queue that will contain the computation that are scheduled for recomputation.
 */
export const waitingComputationTasks: ComputationRequest<Scope, any, any>[] = [];

async function computationTasksRunner() {
  let request = waitingComputationTasks.shift();
  while (request) {
    try {
      console.log(`-- RUNNING ${request.computation.taskDescription(request.scope)}.`);
      const output = await request.computation.compute(request.input);
      console.log(`-- SUCCESS ${request.computation.taskDescription(request.scope)}.`);
      const committed = await computationSuccess(
        request.computation,
        request.scope,
        request.inputHash,
        output
      );
      if (!committed)
        console.log(
          `-- REJECTED (hash mismatch) ${request.computation.taskDescription(request.scope)}.`
        );
    } catch (error) {
      console.log(`-- FAILURE ${request.computation.taskDescription(request.scope)}.`);
      await computationError(request.computation, request.scope, request.inputHash, error);
    }
    request = waitingComputationTasks.shift();
  }
  setTimeout(computationTasksRunner, 200);
}

export function startComputationTaskRunner() {
  void computationTasksRunner();
}
