import { ComputationTask, Prisma, PrismaClient, Progress } from "@prisma/client";
import * as crypto from "crypto";
import stringify from "fast-json-stable-stringify";
import { startComputationTaskRunner, waitingComputationTasks } from "./cacRunner";
import { Computation, BatchOperation, Scope } from "./cacBase";

const prisma = new PrismaClient();

export const registeredComputations: { [computationName: string]: Computation<Scope, any, any> } =
  {};

export async function cascade(
  prisma: Prisma.TransactionClient,
  operation: BatchOperation<Scope>,
  depth = 1
) {
  return await cascades(prisma, [operation], depth);
}

export async function cascades(
  prisma: Prisma.TransactionClient,
  operations: BatchOperation<Scope>[],
  depth = 1
) {
  for (const operation of operations) {
    logOp(depth, operation, "Cascading");
    const computations = operation.impactedComputations.map(
      computationConstructor => new computationConstructor(operation.scope, operation.type)
    );
    console.log(`${indent(depth)}\t${computations.length} impacted computations.`);

    const outdatedAt = new Date();
    for (const computation of computations) {
      const scopes = await computation.computeScopes(prisma, operation.scope);
      logOp(depth, operation, `${JSON.stringify(operation.scope)} => ${JSON.stringify(scopes)}.`);
      for (const scope of scopes) {
        log(depth, computation, scope, "Outdating computationTask in DB");
        await outdateComputationTask(prisma, computation, scope, outdatedAt);
        log(depth, computation, scope, "Outdating ComputedEntity in DB");
        await computation.outdateExistingComputedEntity(prisma, scope, outdatedAt);
        const childOperation = new computation.computedEntityOperation(scope, "delete");
        if (childOperation) await cascade(prisma, childOperation, depth + 1);
        if (depth === 1) {
          log(depth, computation, scope, "Requesting computation");
          await requestComputationTask(prisma, computation, scope);
        }
      }
    }
  }
}

function log(
  depth: number,
  computation: Computation<Scope, any, any>,
  scope: Scope,
  message: string
) {
  console.log(`${indent(depth)}\t${computation.taskDescription(scope)}: ${message}`);
}

function logOp(depth: number, batchOperation: BatchOperation<Scope>, message: string) {
  console.log(`${indent(depth)}\t${batchOperation.description()}: ${message}`);
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
      userName_serieName_date_computationName: {
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
    date: task.date === "*" ? undefined : new Date(task.date),
  };
  return scope;
}

function serializeScope(scope: Scope) {
  return {
    userName: scope.userName ?? "*",
    serieName: scope.serieName ?? "*",
    date: scope.date ? scope.date.toISOString() : "*",
  };
}

async function computationTasksRequester() {
  const waitingTasks = await prisma.computationTask.findMany({
    where: {
      progress: "WAITING",
    },
  });

  if (waitingTasks.length === 0) {
    setTimeout(computationTasksRequester, 200);
    return;
  }

  for (const task of waitingTasks) {
    const computationConstructor = registeredComputations[task.computationName];
    if (!computationConstructor)
      throw new Error(`No Computation registered for name '${task.computationName}'`);
    const scope: Scope = unserializeScope(task);
    const computation = new computationConstructor(scope, "create");

    console.log(`-- BEGIN ${computation.taskDescription(scope)} starting.`);

    const input = await computation.findInput(prisma, scope);
    const inputHash = hash(input);
    const existingTask = await findExistingComputationTask(prisma, computation, scope);
    if (existingTask && existingTask.inputHash === inputHash) {
      await dbUpsertComputationTask(prisma, computation, scope, null, Progress.SUCCESS, inputHash);
      console.log(`-- SKIPPED (hash unchanged) ${computation.taskDescription(scope)}.`);
    } else {
      await dbUpsertComputationTask(prisma, computation, scope, null, Progress.RUNNING, inputHash);
      waitingComputationTasks.push({
        computation,
        scope,
        input,
        inputHash,
      });
    }

    setTimeout(computationTasksRequester, 200);
  }
}

function hash(object: any) {
  return crypto.createHash("md5").update(stringify(object)).digest("hex");
}

export function startComputationTaskRequester() {
  void computationTasksRequester();
}

export function start() {
  startComputationTaskRequester();
  startComputationTaskRunner();
}
