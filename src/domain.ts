import { PrismaClient } from "@prisma/client";
import {
  cascade,
  ComputedSerieFormulaChanged,
  UserSettingsChanged,
  ValueNumberChanged,
} from "./cac";
import * as db from "./db";
import {
  StatsCountChanged,
  ReportContentChanged,
  waitingComputations,
  FormulaComputation,
} from "./cac";

const prisma = new PrismaClient();

export async function resetAll() {
  console.log("Reseting the DB.");
  await prisma.$executeRaw`delete from report;`;
  await prisma.$executeRaw`delete from stats;`;
  await prisma.$executeRaw`delete from "value";`;
  await prisma.$executeRaw`delete from computation;`;
  await prisma.$executeRaw`delete from computed_serie;`;
  await prisma.$executeRaw`delete from serie;`;
  await prisma.$executeRaw`delete from "user";`;
  console.log("Reseting the DB done.");
}

async function computationWorker() {
  const computation = waitingComputations.pop();
  if (computation) {
    computation.compute();
  }

  setTimeout(computationWorker, 200);
}

setTimeout(computationWorker, 5000);

export async function createUser(name: string, reportSettings: string) {
  const operation = new UserSettingsChanged({ user_name: name }, "create");
  return prisma.$transaction(async prisma => {
    await db.createUser(prisma, name, reportSettings);
    await cascade(operation, prisma);
  });
}

export async function deleteUser(name: string) {
  const operation = new UserSettingsChanged({ user_name: name }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteUser(prisma, name);
    await cascade(operation, prisma);
  });
}

export async function createSerie(serieName: string, description: string) {
  return prisma.$transaction(async prisma => {
    await db.createSerie(prisma, serieName, description);
    //No computation are directly using a Serie property
  });
}

export async function createValues(serieName: string, values: { date: Date; number: number }[]) {
  const scope = { serie_name: serieName, dates: values.map(v => v.date) };
  const operation = new ValueNumberChanged(scope, "create");
  return prisma.$transaction(async prisma => {
    await db.createValues(prisma, serieName, values);
    await cascade(operation, prisma);
  });
}

export async function createValue(serieName: string, date: Date, number: number) {
  const operation = new ValueNumberChanged({ serie_name: serieName, date }, "create");
  return prisma.$transaction(async prisma => {
    await db.createValue(prisma, serieName, date, number);
    await cascade(operation, prisma);
  });
}

export async function update(serieName: string, date: Date, number: number) {
  const operation = new ValueNumberChanged({ serie_name: serieName, date }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateValue(prisma, serieName, date, number);
    await cascade(operation, prisma);
  });
}

export async function deleteValue(serieName: string, date: Date) {
  const operation = new ValueNumberChanged({ serie_name: serieName, date }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteValue(prisma, serieName, date);
    await cascade(operation, prisma);
  });
}

export async function createComputedSerie(serieName: string, description: string, formula: string) {
  const operation = new ComputedSerieFormulaChanged({ serie_name: serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createComputedSerie(prisma, serieName, formula, description);
    await cascade(operation, prisma);
  });
}

export async function updateComputedSerieFormula(serieName: string, formula: string) {
  const operation = new ComputedSerieFormulaChanged({ serie_name: serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateComputedSerie(prisma, serieName, formula, undefined);
    await cascade(operation, prisma);
  });
}

export async function deleteComputedSerie(serieName: string) {
  const operation = new ComputedSerieFormulaChanged({ serie_name: serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteComputedSerie(prisma, serieName);
    await cascade(operation, prisma);
  });
}

export async function createStats(serieName: string, valueCount: number) {
  const operation = new StatsCountChanged({ serie_name: serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createStats(prisma, serieName, valueCount);
    await cascade(operation, prisma);
  });
}

export async function updateStats(serieName: string, valueCount: number) {
  const operation = new StatsCountChanged({ serie_name: serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateStats(prisma, serieName, valueCount);
    await cascade(operation, prisma);
  });
}

export async function deleteStats(serieName: string) {
  const operation = new StatsCountChanged({ serie_name: serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteStats(prisma, serieName);
    await cascade(operation, prisma);
  });
}

export async function createReport(userName: string, serieName: string, file: string) {
  const operation = new ReportContentChanged(
    { user_name: userName, serie_name: serieName },
    "create"
  );
  return prisma.$transaction(async prisma => {
    await db.createReport(prisma, userName, serieName, file);
    await cascade(operation, prisma);
  });
}

export async function updateReport(userName: string, serieName: string, file: string) {
  const operation = new ReportContentChanged(
    { user_name: userName, serie_name: serieName },
    "update"
  );
  return prisma.$transaction(async prisma => {
    await db.updateReport(prisma, userName, serieName, file);
    await cascade(operation, prisma);
  });
}

export async function deleteReport(userName: string, serieName: string) {
  const operation = new ReportContentChanged(
    { user_name: userName, serie_name: serieName },
    "delete"
  );
  return prisma.$transaction(async prisma => {
    await db.deleteReport(prisma, userName, serieName);
    await cascade(operation, prisma);
  });
}
