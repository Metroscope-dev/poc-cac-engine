import { Prisma, PrismaClient } from "@prisma/client";
import * as db from "./db";

const prisma = new PrismaClient();

export type UserScope = { userName: string };
export type SerieScope = { serieName: string };
export type SerieDateScope = { serieName: string; date: Date };
export type SerieDatesScope = { serieName: string; dates: Date[] };
export type UserSerieScope = { userName: string; serieName: string };

export type Scope = undefined | UserScope | SerieScope | SerieDateScope | UserSerieScope;

abstract class Mutation<T extends Scope> {
  scope: T;
  constructor(scope: T) {
    this.scope = scope;
  }
  abstract key: string;
}

class MutationUserReportSettingsChanged extends Mutation<UserScope> {
  key = "MutationUserReportSettingsChanged";
}
class MutationSerieCreated extends Mutation<SerieScope> {
  key = "MutationSerieCreated";
}
class MutationSerieValuesChanged extends Mutation<SerieDatesScope> {
  key = "MutationSerieValuesChanged";
}
class MutationSerieValueChanged extends Mutation<SerieDateScope> {
  key = "MutationSerieValueChanged";
}
class MutationComputedSerieCreated extends Mutation<SerieScope> {
  key = "MutationComputedSerieCreated";
}
class MutationComputedSerieFormulaChanged extends Mutation<SerieScope> {
  key = "MutationComputedSerieFormulaChanged";
}

abstract class Computation<T extends Scope> {
  scope: T;
  constructor(scope: T) {
    this.scope = scope;
  }
  abstract key: string;
}

async function cascade(mutations: Mutation<Scope>[], prisma: Prisma.TransactionClient) {
  const impactedComputations = await computeImpactedComputations(mutations);
  await invalidateComputations(impactedComputations, prisma);
  //TODO trigger autoComplete from here
}

async function invalidateComputations(
  computations: Computation<Scope>[],
  prisma: Prisma.TransactionClient
) {
  console.log(computations);
}

async function computeImpactedComputations(
  mutations: Mutation<Scope>[]
): Promise<Computation<Scope>[]> {
  return [];
}

export async function createOrUpdateUser(data: { name: string; reportSettings: string }) {
  const mutation = new MutationUserReportSettingsChanged({ userName: data.name });
  return prisma.$transaction(async prisma => {
    await db.upsertUser(prisma, data.name, data.reportSettings);
    await cascade([mutation], prisma);
  });
}

export async function createOrUpdateSerie(scope: SerieScope, data: { description: string }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertSerie(prisma, scope.serieName, data.description);
  });
}

export async function createOrUpdateValues(
  scope: SerieScope,
  data: { date: Date; number: number }[]
) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValues(prisma, scope.serieName, data);
  });
}

export async function createOrUpdateValue(scope: SerieDateScope, data: { number: number }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValue(prisma, scope.serieName, scope.date, data.number);
  });
}

export async function createOrUpdateComputedSerie(
  scope: SerieScope,
  data: { description: string; formula: string }
) {
  return prisma.$transaction(async prisma => {
    return await db.upsertComputedSerie(prisma, scope.serieName, data.description, data.formula);
  });
}
