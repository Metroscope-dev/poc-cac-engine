import { Prisma, PrismaClient, Progress, Value } from "@prisma/client";
import stringify from "fast-json-stable-stringify";
import * as crypto from "crypto";

export type OperationType = "create" | "update" | "delete";

/**
 * A Scope is a composite key for uniquely identifying a collection of a given entity type.
 * Ex: { userName : "toto" } applied to User will match 1 User,
 *     { userName : "toto", serieName : undefined } applied to Report will match N Reports (1 report per Serie).
 */
export type Scope = {
  userName?: string;
  serieName?: string;
  dates?: Date[];
};

/** A batch change of some properties within a collection of Entity.*/
export abstract class BatchOperation<T extends Scope> {
  scope: T;
  /** The Computations that are impacted by this Operation */
  abstract impactedComputations: Computation<Scope, any, any>["constructor"][];
  type: OperationType;
  constructor(scope: T, type: OperationType) {
    this.scope = scope;
    this.type = type;
  }
  description() {
    return `${this.constructor.name}[${JSON.stringify(this.scope)}]`;
  }
}

/** Describes how a computation should be performed.
 * A computation has a fixed scope.
 */
export abstract class Computation<ComputationScope extends Scope, Input, Output> {
  /** Compute the list of ComputationScope that are resolved from the Scope of triggering operation  */
  abstract computeScopes: (
    prisma: Prisma.TransactionClient,
    scopeRequest: Scope
  ) => Promise<ComputationScope[]>;
  /** Find the input for a given ComputationScope */
  abstract findInput: (prisma: Prisma.TransactionClient, scope: ComputationScope) => Promise<Input>;
  /** Actual computation logic */
  abstract compute: (input: Input) => Promise<Output>;
  /** Save the output to the DB */
  abstract saveOutput: (prisma: Prisma.TransactionClient, output: Output) => Promise<void>;
  /** The operation that should be emitted when the computation is done */
  abstract computedEntityOperation: BatchOperation<ComputationScope>["constructor"];
  /** Mark the existing ComputedEntity as outdated */
  abstract outdateExistingComputedEntity: (
    prisma: Prisma.TransactionClient,
    scope: ComputationScope,
    outdatedAt: Date
  ) => Promise<void>;

  /** Returns a short string for logging computation tasks*/
  taskDescription(scope: ComputationScope | undefined) {
    return `${this.constructor.name}[${JSON.stringify(scope)}]`;
  }
}

type ComputationRequest<T extends Scope, Input, Output> = {
  scope: T;
  computation: Computation<T, Input, Output>;
};

export async function cascade(
  prisma: Prisma.TransactionClient,
  operation: BatchOperation<Scope>,
  depth = 1
) {
  console.log(`${indent(depth)}Cascading ${operation.description()}`);
  const computations = operation.impactedComputations.map(
    computationConstructor => new computationConstructor(operation.scope, operation.type)
  );
  console.log(`${indent(depth)}\t${computations.length} impacted computations.`);

  const outdatedAt = new Date();
  for (const computation of computations) {
    const scopes = await computation.computeScopes(prisma, operation.scope);
    console.log(
      `${indent(depth)}\t${computation.constructor.name}: ${JSON.stringify(
        operation.scope
      )} => ${JSON.stringify(scopes)}.`
    );
    for (const scope of scopes) {
      console.log(
        `${indent(depth)}\t${
          computation.constructor.name
        }: Outdating computation db entries ${computation.taskDescription(scope)}.`
      );
      await outdateComputationTask(prisma, computation, scope, outdatedAt);
      console.log(
        `${indent(depth)}\t${
          computation.constructor.name
        }: Outdating computedEntity db entries ${computation.taskDescription(scope)}.`
      );
      await computation.outdateExistingComputedEntity(prisma, scope, outdatedAt);
      const childOperation = new computation.computedEntityOperation(scope, "delete");
      if (childOperation) await cascade(prisma, childOperation, depth + 1);
      if (depth === 1) {
        console.log(
          `${indent(depth)}\t${
            computation.constructor.name
          }: Requesting computation for ${computation.taskDescription(scope)}`
        );
        await requestComputationTask(prisma, computation, scope);
      }
    }
  }
}

function indent(depth: number) {
  return "\t".repeat(depth);
}

async function outdateComputationTask(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope, any, any>,
  scope: Scope,
  outdatedAt: Date
) {
  await dbUpsertComputationTask(prisma, computation, scope, outdatedAt, Progress.OUTDATED, null);
}

async function requestComputationTask(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope, any, any>,
  scope: Scope
) {
  await dbUpsertComputationTask(prisma, computation, scope, null, Progress.WAITING, null);
  //Todo should be done in transaction.onSuccess()
  waitingComputationTasks.push({ scope, computation });
}

async function findExistingComputationTask(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope, any, any>,
  scope: Scope
) {
  return await prisma.computationTask.findFirst({
    where: {
      userName: scope.userName ?? "*",
      serieName: scope.serieName ?? "*",
      dates: datesAsUniqueString(scope.dates) ?? "*",
      computationName: computation.constructor.name,
    },
  });
}

async function dbUpsertComputationTask(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope, any, any>,
  scope: Scope,
  outdatedAt: Date | null,
  progress: Progress,
  inputHash: string | null
) {
  await prisma.computationTask.upsert({
    create: {
      userName: scope.userName ?? "*",
      serieName: scope.serieName ?? "*",
      dates: datesAsUniqueString(scope.dates) ?? "*",
      computationName: computation.constructor.name,
      outdatedAt,
      progress,
      inputHash,
    },
    update: {
      outdatedAt,
      progress,
      inputHash,
    },
    where: {
      userName_serieName_dates_computationName: {
        userName: scope.userName ?? "*",
        serieName: scope.serieName ?? "*",
        dates: datesAsUniqueString(scope.dates) ?? "*",
        computationName: computation.constructor.name,
      },
    },
  });
}

function datesAsUniqueString(dates: Date[] | undefined) {
  if (!dates) return undefined;
  return dates
    .map(d => d.toISOString())
    .sort()
    .join(",");
}

function hash(object: any) {
  return crypto.createHash("md5").update(stringify(object)).digest("hex");
}

/**
 * A queue that will contain the computation that are ready to recompute.
 * This queue should be populated at startup by looking at the Computation table for rows with progress==='WAITING'.
 * Then is should be incrementally updated after each Operation.
 */
export const waitingComputationTasks: ComputationRequest<Scope, any, any>[] = [];
const prisma = new PrismaClient();

async function computationWorker() {
  const task = waitingComputationTasks.shift();
  if (!task) {
    setTimeout(computationWorker, 200);
    return;
  }

  const { scope, computation } = task;

  console.log(`-- ${computation.taskDescription(scope)} starting.`);

  const input = await computation.findInput(prisma, scope);
  const inputHash = hash(input);
  const existingTask = await findExistingComputationTask(prisma, computation, scope);
  if (existingTask && existingTask.inputHash === inputHash) {
    await dbUpsertComputationTask(prisma, computation, scope, null, Progress.SUCCESS, inputHash);
    console.log(`-- ${computation.taskDescription(scope)} success (ALREADY PRESENT).`);
  } else {
    await dbUpsertComputationTask(prisma, computation, scope, null, Progress.RUNNING, inputHash);
    computation
      .compute(input)
      .then(async output => {
        prisma.$transaction(async prisma => {
          await computation.saveOutput(prisma, output);
          await dbUpsertComputationTask(
            prisma,
            computation,
            scope,
            null,
            Progress.SUCCESS,
            inputHash
          );
          await cascade(prisma, new computation.computedEntityOperation(scope, "created"));
          console.log(`-- ${computation.taskDescription(scope)} success.`);
        });
      })
      .catch(async error => {
        await dbUpsertComputationTask(
          prisma,
          computation,
          scope,
          new Date(),
          Progress.ERROR,
          inputHash
        );
        console.error(`Computation failed for task ${computation.taskDescription(scope)}.`, error);
      });
  }

  setTimeout(computationWorker, 200);
}

setTimeout(computationWorker, 5000);
