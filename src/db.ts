import { Prisma } from "@prisma/client";

export async function createUser(
  prisma: Prisma.TransactionClient,
  name: string,
  reportSettings: string
) {
  await prisma.user.create({
    data: {
      name,
      reportSettings,
    },
  });
}

export async function updateUser(
  prisma: Prisma.TransactionClient,
  name: string,
  reportSettings: string
) {
  await prisma.user.update({
    where: {
      name,
    },
    data: {
      reportSettings,
    },
  });
}

export async function deleteUser(prisma: Prisma.TransactionClient, name: string) {
  await prisma.user.delete({
    where: {
      name,
    },
  });
}

export async function createSerie(
  prisma: Prisma.TransactionClient,
  name: string,
  description?: string
) {
  await prisma.serie.create({
    data: {
      name,
      description,
    },
  });
}

export async function updateSerie(
  prisma: Prisma.TransactionClient,
  name: string,
  description?: string | null
) {
  await prisma.serie.update({
    where: {
      name,
    },
    data: {
      description,
    },
  });
}

export async function deleteSerie(prisma: Prisma.TransactionClient, name: string) {
  await prisma.serie.delete({
    where: {
      name,
    },
  });
}

export async function selectValues(
  prisma: Prisma.TransactionClient,
  serieName: string,
  date: Date[]
) {
  return await prisma.value.findMany({
    where: {
      serieName,
      date: {
        in: date,
      },
    },
  });
}

export async function createValues(
  prisma: Prisma.TransactionClient,
  serieName: string,
  values: { date: Date; number: number }[]
) {
  await prisma.value.createMany({
    data: values.map(v => ({
      ...v,
      serieName,
    })),
  });
}

export async function createValue(
  prisma: Prisma.TransactionClient,
  name: string,
  date: Date,
  number: number
) {
  await prisma.value.create({
    data: {
      date,
      serieName: name,
      number,
    },
  });
}

export async function updateValue(
  prisma: Prisma.TransactionClient,
  name: string,
  date: Date,
  number: number
) {
  await prisma.value.update({
    where: {
      date_serieName: { date, serieName: name },
    },
    data: {
      number,
    },
  });
}

export async function deleteValue(prisma: Prisma.TransactionClient, name: string, date: Date) {
  await prisma.value.delete({
    where: {
      date_serieName: { date, serieName: name },
    },
  });
}

export async function createComputedSerie(
  prisma: Prisma.TransactionClient,
  serieName: string,
  dependingOnSerieName: string,
  formula: string,
  description?: string
) {
  await createSerie(prisma, serieName, description);
  await prisma.computedSerie.create({
    data: {
      serieName,
      dependingOnSerieName,
      formula,
    },
  });
}

export async function updateComputedSerie(
  prisma: Prisma.TransactionClient,
  name: string,
  formula: string,
  description?: string | null
) {
  await updateSerie(prisma, name, description);
  await prisma.computedSerie.update({
    where: {
      serieName: name,
    },
    data: {
      formula,
    },
  });
}

export async function deleteComputedSerie(prisma: Prisma.TransactionClient, name: string) {
  await deleteSerie(prisma, name);
  await prisma.computedSerie.delete({
    where: {
      serieName: name,
    },
  });
}

export async function createStats(
  prisma: Prisma.TransactionClient,
  name: string,
  valueCount: number
) {
  await prisma.stats.create({
    data: {
      serieName: name,
      valueCount,
    },
  });
}

export async function updateStats(
  prisma: Prisma.TransactionClient,
  name: string,
  valueCount: number
) {
  await prisma.stats.update({
    where: {
      serieName: name,
    },
    data: {
      valueCount,
    },
  });
}

export async function deleteStats(prisma: Prisma.TransactionClient, name: string) {
  await prisma.stats.update({
    where: {
      serieName: name,
    },
    data: {
      outdatedAt: new Date(),
    },
  });
}

export async function createReport(
  prisma: Prisma.TransactionClient,
  userName: string,
  serieName: string,
  content: string
) {
  await prisma.report.create({
    data: {
      userName: userName,
      serieName: serieName,
      content,
    },
  });
}

export async function updateReport(
  prisma: Prisma.TransactionClient,
  userName: string,
  serieName: string,
  content: string
) {
  await prisma.report.update({
    where: {
      serieName_userName: {
        userName: userName,
        serieName: serieName,
      },
    },
    data: {
      content,
    },
  });
}

export async function deleteReport(
  prisma: Prisma.TransactionClient,
  userName: string,
  serieName: string
) {
  await prisma.report.update({
    where: {
      serieName_userName: {
        userName: userName,
        serieName: serieName,
      },
    },
    data: {
      outdatedAt: new Date(),
    },
  });
}
