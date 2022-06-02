import { PrismaClient } from "@prisma/client";
import * as db from "./db";

const prisma = new PrismaClient();

export type SerieScope = { serieName: string };
export type DateSerieScope = { date: Date; serieName: string };
export type UserSerieScope = { userName: string; serieName: string };

export type Scope = SerieScope | DateSerieScope | UserSerieScope;

export async function upsertSerie(scope: SerieScope, data: { description: string }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertSerie(prisma, scope.serieName, data.description);
  });
}

export async function insertValues(
  serieName: string,
  scopesAndData: { scope: DateSerieScope; data: { number: number } }[]
) {
  //TODO check that the scopes are valid (only using the same serieName)
  return prisma.$transaction(async prisma => {
    return await db.insertValues(
      prisma,
      serieName,
      scopesAndData.map(it => ({ date: it.scope.date, number: it.data.number }))
    );
  });
}

export async function upsertValue(scope: DateSerieScope, data: { number: number }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValue(prisma, scope.serieName, scope.date, data.number);
  });
}

export async function upsertComputedSerie(
  scope: SerieScope,
  data: { description: string; formula: string }
) {
  return prisma.$transaction(async prisma => {
    return await db.upsertComputedSerie(prisma, scope.serieName, data.description, data.formula);
  });
}

export async function upsertStats(scope: SerieScope, data: { valueCount: number }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertStats(prisma, scope.serieName, data.valueCount);
  });
}

export async function upsertGraph(scope: UserSerieScope, data: { file: string }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertGraph(prisma, scope.userName, scope.serieName, data.file);
  });
}
