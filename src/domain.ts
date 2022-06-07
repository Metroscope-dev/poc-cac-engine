import { PrismaClient, Value } from "@prisma/client";
import {
  cascade,
  ComputedSerieFormulaChanged,
  UserSettingsChanged,
  ValueNumberChanged,
} from "./cac";
import * as db from "./db";
import { StatsCountChanged, ReportContentChanged, waitingComputations } from "./cac";

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
  if (!computation) {
    setTimeout(computationWorker, 200);
    return;
  }

  console.log(
    `Starting computation ${computation.functionName} with scope ${JSON.stringify(
      computation.scopeRequest
    )}`
  );
  const scopes = await computation.resolveScopeSlices(prisma, computation.scopeRequest);
  for (const scope of scopes) await computation.compute(scope);

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
  const operation = new ValueNumberChanged({ serie_name: serieName, dates: [date] }, "create");
  return prisma.$transaction(async prisma => {
    await db.createValue(prisma, serieName, date, number);
    await cascade(operation, prisma);
  });
}

export async function update(serieName: string, date: Date, number: number) {
  const operation = new ValueNumberChanged({ serie_name: serieName, dates: [date] }, "update");
  return prisma.$transaction(async prisma => {
    await db.updateValue(prisma, serieName, date, number);
    await cascade(operation, prisma);
  });
}

export async function deleteValue(serieName: string, date: Date) {
  const operation = new ValueNumberChanged({ serie_name: serieName, dates: [date] }, "delete");
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

export async function computeReport(userName: string, serieName: string) {
  prisma.$transaction(async prisma => {
    const stats = await prisma.stats.findUnique({
      where: {
        serie_name: serieName,
      },
    });
    if (!stats)
      throw new Error(
        `Cannot compute report ${serieName} for user ${userName} because the corresponding Stats is missing.`
      );

    const content = `Report for Mr ${userName}. The serie ${serieName} has ${stats.valueCount} values. Best regards.`;

    await prisma.report.upsert({
      where: {
        serie_name_user_name: {
          serie_name: serieName,
          user_name: userName,
        },
      },
      create: {
        serie_name: serieName,
        user_name: userName,
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
    const count = await prisma.stats.count({
      where: {
        serie_name: serieName,
      },
    });
    prisma.stats.upsert({
      where: {
        serie_name: serieName,
      },
      update: {
        valueCount: count,
      },
      create: {
        serie_name: serieName,
        valueCount: count,
      },
    });
  });
}

export async function computeFormula(serieName: string, dates: Date[]) {
  prisma.$transaction(async prisma => {
    const computedSerie = await prisma.computedSerie.findUnique({
      where: {
        serie_name: serieName,
      },
    });
    if (!computedSerie)
      throw new Error(`Cannot compute formula for missing computeSerie ${serieName}.`);

    const childSerieNames = findSerieNames(computedSerie.formula);

    const childrenSeriesNumbersByDate: { [key: string]: { [key: string]: number } } = {};
    for (const childSerieName of childSerieNames) {
      const childSerieValues = await prisma.value.findMany({
        where: {
          serie_name: childSerieName,
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
      .map(d => `(${serieName},${d.toISOString()},${values[d.toISOString()]})`)
      .join(",");

    await prisma.$executeRaw`INSERT INTO value(serie_name,"date","number") 
     VALUES ${sqlValues};
    ON CONFLICT DO UPDATE SET value."number" = excluded."number"`;
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
