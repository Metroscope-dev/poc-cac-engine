import { ComputationTask, Prisma, PrismaClient, Progress } from "@prisma/client";
import stringify from "fast-json-stable-stringify";

const prisma = new PrismaClient();

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
}

export async function findExistingComputationTask(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope, any, any>,
  scope: Scope
) {
  return await prisma.computationTask.findFirst({
    where: {
      ...serializeScope(scope),
      computationName: computation.constructor.name,
    },
  });
}

export async function dbUpsertComputationTask(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope, any, any>,
  scope: Scope,
  outdatedAt: Date | null,
  progress: Progress,
  inputHash: string | null
) {
  const serializedScope = serializeScope(scope);
  await prisma.computationTask.upsert({
    create: {
      ...serializedScope,
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
        ...serializedScope,
        computationName: computation.constructor.name,
      },
    },
  });
}

export async function computationSuccess<Output>(
  computation: Computation<Scope, any, Output>,
  scope: Scope,
  inputHash: string,
  output: Output
) {
  return await prisma.$transaction(async prisma => {
    await computation.saveOutput(prisma, output);
    //TODO on doit check le hash d'origine qui revient avec l'output
    //et s'en servir comme d'un optimistic lock
    const existingTask = await findExistingComputationTask(prisma, computation, scope);
    if (existingTask?.inputHash !== inputHash) {
      return false;
    }
    await dbUpsertComputationTask(prisma, computation, scope, null, Progress.SUCCESS, inputHash);
    await cascade(prisma, new computation.computedEntityOperation(scope, "created"));
    return true;
  });
}

export async function computationError(
  computation: Computation<Scope, any, any>,
  scope: Scope,
  inputHash: string,
  error: unknown
) {
  await dbUpsertComputationTask(prisma, computation, scope, new Date(), Progress.ERROR, inputHash);
  console.error(`Computation failed for task ${computation.taskDescription(scope)}.`, error);
}

export function unserializeScope(task: ComputationTask) {
  const scope: Scope = {
    userName: task.userName === "*" ? undefined : task.userName,
    serieName: task.serieName === "*" ? undefined : task.serieName,
    dates: task.dates === "*" ? undefined : parseJsonDates(task.dates),
  };
  return scope;
}

function serializeScope(scope: Scope) {
  return {
    userName: scope.userName ?? "*",
    serieName: scope.serieName ?? "*",
    dates: scope.dates ? stringify(scope.dates) : "*",
  };
}

function parseJsonDates(dates: string) {
  const stringDates = JSON.parse(dates) as string[];
  return stringDates.map(d => new Date(d));
}
