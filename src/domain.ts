import { PrismaClient } from "@prisma/client";
import {
  cascade,
  ComputedSerieFormulaChanged,
  UserSettingsChanged,
  ValueNumberChanged,
  StatsCountChanged,
  ReportContentChanged,
  waitingComputations,
} from "./cac";
import * as db from "./db";
import { Sql } from "@prisma/client/runtime";

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
  const task = waitingComputations.shift();
  if (!task) {
    setTimeout(computationWorker, 200);
    return;
  }

  const { scope, computation } = task;

  console.log(`-- ${computation.toString(scope)} starting.`);
  await computation.compute(scope);
  await prisma.$transaction(async prisma => {
    await cascade(prisma, new computation.entityOperation(scope, "created"));
  });
  console.log(`-- ${computation.toString(scope)} done.`);

  setTimeout(computationWorker, 200);
}

setTimeout(computationWorker, 5000);

export async function createUser(userName: string, reportSettings: string) {
  const operation = new UserSettingsChanged({ userName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createUser(prisma, userName, reportSettings);
    await cascade(prisma, operation);
  });
}

export async function deleteUser(userName: string) {
  const operation = new UserSettingsChanged({ userName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteUser(prisma, userName);
    await cascade(prisma, operation);
  });
}

export async function createSerie(serieName: string, description: string) {
  return prisma.$transaction(async prisma => {
    await db.createSerie(prisma, serieName, description);
    //No computation are directly using a Serie property
  });
}

export async function createValues(serieName: string, values: { date: Date; number: number }[]) {
  const scope = { serieName, dates: values.map(v => v.date) };
  const operation = new ValueNumberChanged(scope, "create");
  return prisma.$transaction(async prisma => {
    await db.createValues(prisma, serieName, values);
    await cascade(prisma, operation);
  });
}

export async function createValue(serieName: string, date: Date, number: number) {
  const operation = new ValueNumberChanged({ serieName, dates: [date] }, "create");
  return prisma.$transaction(async prisma => {
    await db.createValue(prisma, serieName, date, number);
    await cascade(prisma, operation);
  });
}

export async function update(serieName: string, date: Date, number: number) {
  const operation = new ValueNumberChanged({ serieName, dates: [date] }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateValue(prisma, serieName, date, number);
    await cascade(prisma, operation);
  });
}

export async function deleteValue(serieName: string, date: Date) {
  const operation = new ValueNumberChanged({ serieName, dates: [date] }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteValue(prisma, serieName, date);
    await cascade(prisma, operation);
  });
}

export async function createComputedSerie(
  serieName: string,
  description: string,
  formula: string,
  dependingOnSerieName: string
) {
  const operation = new ComputedSerieFormulaChanged({ serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createComputedSerie(prisma, serieName, dependingOnSerieName, formula, description);
    await cascade(prisma, operation);
  });
}

export async function updateComputedSerieFormula(serieName: string, formula: string) {
  const operation = new ComputedSerieFormulaChanged({ serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateComputedSerie(prisma, serieName, formula, undefined);
    await cascade(prisma, operation);
  });
}

export async function deleteComputedSerie(serieName: string) {
  const operation = new ComputedSerieFormulaChanged({ serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteComputedSerie(prisma, serieName);
    await cascade(prisma, operation);
  });
}

export async function createStats(serieName: string, valueCount: number) {
  const operation = new StatsCountChanged({ serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createStats(prisma, serieName, valueCount);
    await cascade(prisma, operation);
  });
}

export async function updateStats(serieName: string, valueCount: number) {
  const operation = new StatsCountChanged({ serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateStats(prisma, serieName, valueCount);
    await cascade(prisma, operation);
  });
}

export async function deleteStats(serieName: string) {
  const operation = new StatsCountChanged({ serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteStats(prisma, serieName);
    await cascade(prisma, operation);
  });
}

export async function createReport(userName: string, serieName: string, file: string) {
  const operation = new ReportContentChanged({ userName, serieName }, "create");
  return prisma.$transaction(async prisma => {
    await db.createReport(prisma, userName, serieName, file);
    await cascade(prisma, operation);
  });
}

export async function updateReport(userName: string, serieName: string, file: string) {
  const operation = new ReportContentChanged({ userName, serieName }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateReport(prisma, userName, serieName, file);
    await cascade(prisma, operation);
  });
}

export async function deleteReport(userName: string, serieName: string) {
  const operation = new ReportContentChanged({ userName, serieName }, "delete");
  return prisma.$transaction(async prisma => {
    await db.deleteReport(prisma, userName, serieName);
    await cascade(prisma, operation);
  });
}

export async function computeReport(userName: string, serieName: string) {
  prisma.$transaction(async prisma => {
    const stats = await prisma.stats.findUnique({
      where: {
        serieName,
      },
    });
    if (!stats)
      throw new Error(
        `Cannot compute report ${serieName} for user ${userName} because the corresponding Stats is missing.`
      );

    const content = `Report for Mr ${userName}. The serie ${serieName} has ${stats.valueCount} values. Best regards.`;

    await prisma.report.upsert({
      where: {
        serieName_userName: {
          serieName,
          userName,
        },
      },
      create: {
        serieName,
        userName,
        content,
      },
      update: {
        content,
      },
    });
  });
}

export async function computeStats(serieName: string) {
  prisma.$transaction(async prisma => {
    const count = await prisma.value.count({
      where: {
        serieName,
      },
    });
    await prisma.stats.upsert({
      where: {
        serieName,
      },
      update: {
        valueCount: count,
      },
      create: {
        serieName,
        valueCount: count,
      },
    });
  });
}

export async function computeFormula(serieName: string, dates: Date[]) {
  prisma.$transaction(async prisma => {
    const computedSerie = await prisma.computedSerie.findUnique({
      where: {
        serieName,
      },
    });
    if (!computedSerie)
      throw new Error(`Cannot compute formula for missing computeSerie ${serieName}.`);

    const childSerieNames = findSerieNames(computedSerie.formula);

    const childrenSeriesNumbersByDate: { [key: string]: { [key: string]: number } } = {};
    for (const childSerieName of childSerieNames) {
      const childSerieValues = await prisma.value.findMany({
        where: {
          serieName: childSerieName,
          date: {
            in: dates,
          },
        },
      });
      if (childSerieValues.length < dates.length)
        throw new Error(`Some date are missing for childSerie ${childSerieName}.`);
      const childSerieNumbers = childSerieValues.reduce<{ [key: string]: number }>((acc, next) => {
        acc[next.date.toISOString()] = next.number;
        return acc;
      }, {});
      childrenSeriesNumbersByDate[childSerieName] = childSerieNumbers;
    }

    const values: { [key: string]: number } = {};
    for (const date of dates) {
      values[date.toISOString()] = 0;
      for (const childSerieName of childSerieNames) {
        values[date.toISOString()] +=
          childrenSeriesNumbersByDate[childSerieName]?.[date.toISOString()] ?? 0;
      }
    }

    const sqlValues = dates
      .map(d => `('${serieName}','${d.toISOString()}',${values[d.toISOString()]})`)
      .join(",");

    const sql = `INSERT INTO "value"("serieName","date","number") 
    VALUES${sqlValues}
    ON CONFLICT("serieName","date") DO UPDATE SET "number" = excluded."number";`;

    console.log(sql);

    await prisma.$executeRaw(new Sql([sql], []));
  });
}

function findSerieNames(formula: string) {
  const re = /\$\{([^}]+)\}/g;
  const results: string[] = [];
  let match = null;
  do {
    match = re.exec(formula);
    if (!match || !match[1]) break;
    results.push(match[1]);
  } while (match);

  return results;
}
