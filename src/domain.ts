import { PrismaClient } from "@prisma/client";
import { cascade, cascades } from "./cacEngine";
import {
  ComputedSerieFormulaChanged,
  UserSettingsChanged,
  ValueNumberChanged,
  StatsCountChanged,
  ReportContentChanged,
} from "./cacImplem";
import * as db from "./db";

const prisma = new PrismaClient();

export async function resetAll() {
  console.log("Reseting the DB.");
  await prisma.$executeRaw`delete from report;`;
  await prisma.$executeRaw`delete from stats;`;
  await prisma.$executeRaw`delete from "value";`;
  await prisma.$executeRaw`delete from computation_task;`;
  await prisma.$executeRaw`delete from computed_serie;`;
  await prisma.$executeRaw`delete from serie;`;
  await prisma.$executeRaw`delete from "user";`;
  console.log("Reseting the DB done.");
}

export async function createUser(userName: string, reportSettings: string) {
  const event = new UserSettingsChanged({ userName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createUser(prisma, userName, reportSettings);
    await cascade(prisma, event);
  });
}

export async function deleteUser(userName: string) {
  const event = new UserSettingsChanged({ userName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteUser(prisma, userName);
    await cascade(prisma, event);
  });
}

export async function createSerie(serieName: string, description: string) {
  return prisma.$transaction(async prisma => {
    await db.createSerie(prisma, serieName, description);
    //No computation are directly using a Serie property
  });
}

export async function createValues(serieName: string, values: { date: Date; number: number }[]) {
  const scopes = values.map(v => ({ serieName, date: v.date }));
  const operations = scopes.map(scope => new ValueNumberChanged(scope, "create"));
  return prisma.$transaction(async prisma => {
    await db.createValues(prisma, serieName, values);
    await cascades(prisma, operations);
  });
}

export async function createValue(serieName: string, date: Date, number: number) {
  const event = new ValueNumberChanged({ serieName, date }, "create");
  return prisma.$transaction(async prisma => {
    await db.createValue(prisma, serieName, date, number);
    await cascade(prisma, event);
  });
}

export async function updateValue(serieName: string, date: Date, number: number) {
  const event = new ValueNumberChanged({ serieName, date }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateValue(prisma, serieName, date, number);
    await cascade(prisma, event);
  });
}

export async function deleteValue(serieName: string, date: Date) {
  const event = new ValueNumberChanged({ serieName, date }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteValue(prisma, serieName, date);
    await cascade(prisma, event);
  });
}

export async function createComputedSerie(
  serieName: string,
  description: string,
  formula: string,
  dependingOnSerieName: string
) {
  const event = new ComputedSerieFormulaChanged({ serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createComputedSerie(prisma, serieName, dependingOnSerieName, formula, description);
    await cascade(prisma, event);
  });
}

export async function updateComputedSerieFormula(serieName: string, formula: string) {
  const event = new ComputedSerieFormulaChanged({ serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateComputedSerie(prisma, serieName, formula, undefined);
    await cascade(prisma, event);
  });
}

export async function deleteComputedSerie(serieName: string) {
  const event = new ComputedSerieFormulaChanged({ serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteComputedSerie(prisma, serieName);
    await cascade(prisma, event);
  });
}

export async function createStats(serieName: string, valueCount: number) {
  const event = new StatsCountChanged({ serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createStats(prisma, serieName, valueCount);
    await cascade(prisma, event);
  });
}

export async function updateStats(serieName: string, valueCount: number) {
  const event = new StatsCountChanged({ serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateStats(prisma, serieName, valueCount);
    await cascade(prisma, event);
  });
}

export async function deleteStats(serieName: string) {
  const event = new StatsCountChanged({ serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteStats(prisma, serieName);
    await cascade(prisma, event);
  });
}

export async function createReport(userName: string, serieName: string, file: string) {
  const event = new ReportContentChanged({ userName, serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createReport(prisma, userName, serieName, file);
    await cascade(prisma, event);
  });
}

export async function updateReport(userName: string, serieName: string, file: string) {
  const event = new ReportContentChanged({ userName, serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateReport(prisma, userName, serieName, file);
    await cascade(prisma, event);
  });
}

export async function deleteReport(userName: string, serieName: string) {
  const event = new ReportContentChanged({ userName, serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteReport(prisma, userName, serieName);
    await cascade(prisma, event);
  });
}
