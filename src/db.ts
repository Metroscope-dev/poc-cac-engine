import { Prisma } from "@prisma/client";

export async function upsertUser(
  prisma: Prisma.TransactionClient,
  name: string,
  reportSettings: string
) {
  await prisma.user.upsert({
    where: {
      name,
    },
    update: {
      reportSettings,
    },
    create: {
      name: name,
      reportSettings,
    },
  });
}

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

export async function upsertValues(
  prisma: Prisma.TransactionClient,
  serie_name: string,
  values: { date: Date; number: number }[]
) {
  await assertSerieExists(prisma, serie_name);
  const sqlValues = values
    .map(v => `('${v.date.toISOString()}', '${serie_name}', ${v.number})`)
    .join(", ");

  await prisma.$executeRaw`
    INSERT INTO value (date, serie_name, number)
    VALUES ${sqlValues}
    ON CONFLICT (date, serie_name) DO UPDATE SET number = EXCLUDED.number;
  `;
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

export async function upsertReport(
  prisma: Prisma.TransactionClient,
  userName: string,
  serieName: string,
  content: string
) {
  await assertSerieExists(prisma, serieName);
  await prisma.report.upsert({
    where: {
      serie_name_user_name: {
        user_name: userName,
        serie_name: serieName,
      },
    },
    update: {
      content,
    },
    create: {
      user_name: userName,
      serie_name: serieName,
      content,
    },
  });
}
