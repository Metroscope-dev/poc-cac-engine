import { Prisma } from "@prisma/client";
import { Sql } from "@prisma/client/runtime";

export type FormulaInput = {
  serieName: string;
  formula: string;
  childSerieNames: string[];
  dates: Date[];
  numbersByDateByChildSerie: {
    [key: string]: {
      [key: string]: number;
    };
  };
};

export type FormulaOutput = {
  serieName: string;
  values: { [isoDate: string]: number };
};

export async function computeFormula(input: FormulaInput): Promise<FormulaOutput> {
  const values: { [key: string]: number } = {};
  for (const date of input.dates) {
    values[date.toISOString()] = 0;
    for (const childSerieName of input.childSerieNames) {
      values[date.toISOString()] +=
        input.numbersByDateByChildSerie[childSerieName]?.[date.toISOString()] ?? 0;
    }
  }
  return {
    serieName: input.serieName,
    values,
  };
}

export async function findInput(
  prisma: Prisma.TransactionClient,
  serieName: string,
  dates: Date[]
): Promise<FormulaInput> {
  const computedSerie = await prisma.computedSerie.findUnique({
    where: {
      serieName,
    },
  });
  if (!computedSerie)
    throw new Error(`Cannot compute formula for missing computeSerie ${serieName}.`);

  const childSerieNames = findSerieNames(computedSerie.formula);

  const numbersByDateByChildSerie: { [key: string]: { [key: string]: number } } = {};
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
    const numbersByDate = childSerieValues.reduce<{ [key: string]: number }>((acc, next) => {
      acc[next.date.toISOString()] = next.number;
      return acc;
    }, {});
    numbersByDateByChildSerie[childSerieName] = numbersByDate;
  }
  return {
    serieName,
    formula: computedSerie.formula,
    childSerieNames,
    dates,
    numbersByDateByChildSerie,
  };
}

export async function saveOutput(prisma: Prisma.TransactionClient, output: FormulaOutput) {
  const sqlValues = Object.keys(output.values)
    .map(isoDate => `('${output.serieName}','${isoDate}',${output.values[isoDate]})`)
    .join(",");

  const sql = `INSERT INTO "value"("serieName","date","number") 
  VALUES${sqlValues}
  ON CONFLICT("serieName","date") DO UPDATE SET "number" = excluded."number";`;

  console.log(sql);

  await prisma.$executeRaw(new Sql([sql], []));
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
