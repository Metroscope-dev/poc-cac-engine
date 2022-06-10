import { Prisma } from "@prisma/client";
import { Sql } from "@prisma/client/runtime";

export type FormulaInput = {
  serieName: string;
  formula: string;
  childSerieNames: string[];
  date: Date;
  numbersByChildSerie: {
    [key: string]: number;
  };
};

export type FormulaOutput = {
  serieName: string;
  date: Date;
  value: number;
};

export async function computeFormula(input: FormulaInput): Promise<FormulaOutput> {
  let sum = 0;

  for (const childSerieName of input.childSerieNames) {
    sum += input.numbersByChildSerie[childSerieName] ?? 0;
  }

  return {
    serieName: input.serieName,
    date: input.date,
    value: sum,
  };
}

export async function findInput(
  prisma: Prisma.TransactionClient,
  serieName: string,
  date: Date
): Promise<FormulaInput> {
  const computedSerie = await prisma.computedSerie.findUnique({
    where: {
      serieName,
    },
  });
  if (!computedSerie)
    throw new Error(`Cannot compute formula for missing computedSerie ${serieName}.`);

  const childSerieNames = findSerieNames(computedSerie.formula);

  const numbersByChildSerie: { [key: string]: number } = {};
  for (const childSerieName of childSerieNames) {
    const value = await prisma.value.findUnique({
      where: {
        date_serieName: {
          serieName: childSerieName,
          date,
        },
      },
    });
    if (!value)
      throw new Error(
        `Cannot compute formula for ComputeSerie ${serieName} because not value found for dependant Serie ${childSerieName} at date ${date}.`
      );
    numbersByChildSerie[childSerieName] = value?.number;
  }
  return {
    serieName,
    date,
    formula: computedSerie.formula,
    childSerieNames,
    numbersByChildSerie,
  };
}

export async function saveOutput(prisma: Prisma.TransactionClient, output: FormulaOutput) {
  await prisma.value.upsert({
    where: {
      date_serieName: {
        serieName: output.serieName,
        date: output.date,
      },
    },
    create: {
      serieName: output.serieName,
      date: output.date,
      number: output.value,
      outdatedAt: null,
    },
    update: {
      number: output.value,
      outdatedAt: null,
    },
  });
}

export async function saveOutputs(prisma: Prisma.TransactionClient, outputs: FormulaOutput[]) {
  const sqlValues = outputs
    .map(output => `('${output.serieName}','${output.date}',${output.value})`)
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
