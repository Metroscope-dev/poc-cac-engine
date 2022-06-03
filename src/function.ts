import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

import * as db from "./db";
import { SerieDateScope, SerieScope, UserSerieScope } from "./operation";

export async function upsertStats(scope: SerieScope, data: { valueCount: number }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertStats(prisma, scope.serieName, data.valueCount);
  });
}

export async function upsertReport(scope: UserSerieScope, data: { file: string }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertReport(prisma, scope.userName, scope.serieName, data.file);
  });
}

export async function upsertComputedValue(scope: SerieDateScope, data: { number: number }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValue(prisma, scope.serieName, scope.date, data.number);
  });
}

export async function upsertComputedValues(
  scope: SerieScope,
  data: { date: Date; number: number }[]
) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValues(prisma, scope.serieName, data);
  });
}
