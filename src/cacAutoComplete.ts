import {
  dbUpsertComputationTask,
  findExistingComputationTask,
  Scope,
  unserializeScope,
} from "./cacEngine";
import { computationConstructorOf } from "./cacSetup";
import * as crypto from "crypto";
import { waitingComputationTasks } from "./taskRunner";
import { PrismaClient, Progress } from "@prisma/client";
import stringify from "fast-json-stable-stringify";

const prisma = new PrismaClient();

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
    const computationConstructor = computationConstructorOf(task.computationName);
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
