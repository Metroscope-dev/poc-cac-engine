import { Prisma } from "@prisma/client";

export async function upsertSerie(
  prisma: Prisma.TransactionClient,
  name: string,
  description: string
) {
  await prisma.serie.upsert({
    where: {
      name,
    },
    update: {
      description,
    },
    create: {
      name: name,
      description,
    },
  });
}

export async function assertSerieExists(prisma: Prisma.TransactionClient, name: string) {
  const serie = await prisma.serie.findUnique({
    where: {
      name,
    },
  });
  if (!serie) {
    throw new Error(`Serie ${name} doesn't exist.`);
  }
}

export async function insertValues(
  prisma: Prisma.TransactionClient,
  serie_name: string,
  values: { date: Date; number: number }[]
) {
  await assertSerieExists(prisma, serie_name);
  const data = values.map(v => ({ ...v, serie_name }));
  await prisma.value.createMany({
    data,
  });
}

export async function upsertValue(
  prisma: Prisma.TransactionClient,
  name: string,
  date: Date,
  number: number
) {
  await assertSerieExists(prisma, name);
  await prisma.value.upsert({
    where: {
      date_serie_name: { date, serie_name: name },
    },
    create: {
      serie_name: name,
      date,
      number,
    },
    update: {
      number,
    },
  });
}

export async function upsertComputedSerie(
  prisma: Prisma.TransactionClient,
  name: string,
  description: string,
  formula: string
) {
  await upsertSerie(prisma, name, description);
  await prisma.computedSerie.upsert({
    where: {
      serie_name: name,
    },
    update: {
      formula,
    },
    create: {
      serie_name: name,
      formula,
    },
  });
}

export async function upsertStats(
  prisma: Prisma.TransactionClient,
  name: string,
  valueCount: number
) {
  await assertSerieExists(prisma, name);
  await prisma.stats.upsert({
    where: {
      serie_name: name,
    },
    update: {
      valueCount,
    },
    create: {
      serie_name: name,
      valueCount,
    },
  });
}

export async function upsertGraph(
  prisma: Prisma.TransactionClient,
  userName: string,
  serieName: string,
  file: string
) {
  await assertSerieExists(prisma, serieName);
  await prisma.graph.upsert({
    where: {
      serie_name_user_name: {
        user_name: userName,
        serie_name: serieName,
      },
    },
    update: {
      file,
    },
    create: {
      user_name: userName,
      serie_name: serieName,
      file,
    },
  });
}
