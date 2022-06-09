import { Prisma } from "@prisma/client";

export type StatsInput = {
  serieName: string;
  values: { [isoDate: string]: number };
};

export type StatsOutput = {
  serieName: string;
  valueCount: number;
};

export function computeStats(input: StatsInput): StatsOutput {
  return {
    serieName: input.serieName,
    valueCount: Object.keys(input.values).length,
  };
}

export async function findInput(
  prisma: Prisma.TransactionClient,
  serieName: string
): Promise<StatsInput> {
  const serieValues = await prisma.value.findMany({
    where: {
      serieName,
    },
    select: {
      date: true,
      number: true,
    },
  });

  const values = serieValues.reduce<{ [isoDate: string]: number }>((acc, next) => {
    acc[next.date.toISOString()] = next.number;
    return acc;
  }, {});

  return { serieName, values };
}

export async function saveOutput(prisma: Prisma.TransactionClient, output: StatsOutput) {
  await prisma.stats.upsert({
    where: {
      serieName: output.serieName,
    },
    update: {
      valueCount: output.valueCount,
    },
    create: {
      ...output,
    },
  });
}
