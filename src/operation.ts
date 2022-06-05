import { Prisma, PrismaClient } from "@prisma/client";
import * as db from "./db";

const prisma = new PrismaClient();

export type UserScope = { user_name: string };
export type SerieScope = { serie_name?: string };
export type SerieDateScope = { serie_name?: string; date?: Date };
export type UserSerieScope = { user_name?: string; serie_name?: string };
export type SerieDatesScope = { serie_name: string; dates: Date[] };

export type Scope = undefined | UserScope | SerieScope | SerieDateScope | UserSerieScope;

export type ChangeType = "create" | "update" | "delete";

abstract class Mutation<T extends Scope> {
  scope: T;
  constructor(scope: T) {
    this.scope = scope;
  }
}

abstract class EntityOperation<T extends Scope> extends Mutation<T> {
  type: ChangeType;
  constructor(scope: T, op: ChangeType) {
    super(scope);
    this.type = op;
  }
}

class UserSettingsChanged extends EntityOperation<UserScope> {}
class ComputeSerieFormulaChanged extends EntityOperation<SerieScope> {}
class ValueNumberChanged extends EntityOperation<SerieDateScope> {}
class StatsCountChanged extends EntityOperation<SerieScope> {}

abstract class FunctionInputChanged<T extends Scope> extends Mutation<T> {
  type: ChangeType;
  constructor(scope: T, type: ChangeType) {
    super(scope);
    this.type = type;
  }
}

class ReportFunctionInputChanged extends FunctionInputChanged<UserSerieScope> {}
class FormulaFunctionInputChanged extends FunctionInputChanged<SerieDateScope> {}
class StatsFunctionInputChanged extends FunctionInputChanged<SerieScope> {}

export const FUNCTION_STATS = "stats";
export const FUNCTION_FORMULA = "formula";
export const FUNCTION_REPORT = "report";

async function cascade(operation: EntityOperation<Scope>, prisma: Prisma.TransactionClient) {
  const functionInputChanges = await computeImpactsOnFunctions(operation);
  console.log(functionInputChanges);
}

async function invalidate(
  functionInputChange: FunctionInputChanged<Scope>,
  prisma: Prisma.TransactionClient
) {
  if (functionInputChange.type === "create") return;
  switch (functionInputChange.constructor.name) {
    case "ReportFunctionInputChanged":
      {
        await invalidateReportComputations(
          functionInputChange as ReportFunctionInputChanged,
          prisma
        );
      }
      break;
    case "StatsFunctionInputChanged":
      {
        await invalidateStatsComputations(functionInputChange as StatsFunctionInputChanged, prisma);
      }
      break;
  }
}

async function invalidateStatsComputations(
  change: StatsFunctionInputChanged,
  prisma: Prisma.TransactionClient
) {
  const outdatedAt = new Date();
  await prisma.stats.updateMany({
    data: {
      outdatedAt,
    },
    where: {
      ...change.scope,
    },
  });
  await prisma.serieComputation.updateMany({
    data: {
      outdatedAt,
      progress: change.type === "update" ? "WAITING" : undefined,
    },
    where: {
      ...change.scope,
      function_name: FUNCTION_STATS,
    },
  });
  return new StatsCountChanged(change.scope, change.type);
}

async function invalidateReportComputations(
  change: ReportFunctionInputChanged,
  prisma: Prisma.TransactionClient
) {
  const outdatedAt = new Date();
  await prisma.report.updateMany({
    data: {
      outdatedAt,
    },
    where: {
      ...change.scope,
    },
  });
  await prisma.userSerieComputation.updateMany({
    data: {
      outdatedAt,
      progress: change.type === "update" ? "WAITING" : undefined,
    },
    where: {
      ...change.scope,
      function_name: FUNCTION_REPORT,
    },
  });
}

async function computeImpactsOnFunctions(
  operation: EntityOperation<Scope>
): Promise<FunctionInputChanged<Scope>[]> {
  const directImpact: FunctionInputChanged<Scope>[] = [];
  switch (operation.constructor.name) {
    case "UserSettingsChanged":
      {
        const userOperation = operation as UserSettingsChanged;
        const reportOperation = new ReportFunctionInputChanged(
          {
            user_name: userOperation.scope.user_name,
            serie_name: undefined,
          },
          userOperation.type
        );
        directImpact.push(reportOperation);
      }
      break;
    case "ComputeSerieFormulaChanged": {
      const measuredSerieOperation = operation as ComputeSerieFormulaChanged;
      const formulaFunctionInputChanged = new FormulaFunctionInputChanged(
        {
          serie_name: measuredSerieOperation.scope.serie_name,
          date: undefined,
        },
        measuredSerieOperation.type
      );
      directImpact.push(formulaFunctionInputChanged);

      break;
    }
    case "ValueNumberChanged": {
      const valueOperation = operation as ValueNumberChanged;
      const formulaFunctionInputChanged = new FormulaFunctionInputChanged(
        {
          serie_name: undefined,
          date: valueOperation.scope.date,
        },
        valueOperation.type
      );
      directImpact.push(formulaFunctionInputChanged);

      const statsFunctionInputChanged = new StatsFunctionInputChanged(
        {
          serie_name: valueOperation.scope.serie_name,
        },
        valueOperation.type
      );
      directImpact.push(statsFunctionInputChanged);
      break;
    }
    case "StatsCountChanged":
      {
        const statsOperation = operation as StatsCountChanged;
        const reportOperation = new ReportFunctionInputChanged(
          {
            user_name: undefined,
            serie_name: statsOperation.scope.serie_name,
          },
          statsOperation.type
        );
        directImpact.push(reportOperation);
      }
      break;
    case "ReportOperation":
      //no impact
      break;
  }

  return directImpact;
}

export async function createUser(data: { name: string; reportSettings: string }) {
  const mutation = new UserSettingsChanged({ user_name: data.name }, "create");
  return prisma.$transaction(async prisma => {
    await db.upsertUser(prisma, data.name, data.reportSettings);
    await cascade(mutation, prisma);
  });
}

export async function createSerie(scope: SerieScope, data: { description: string }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertSerie(prisma, scope.serie_name, data.description);
  });
}

export async function createValues(scope: SerieScope, data: { date: Date; number: number }[]) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValues(prisma, scope.serie_name, data);
  });
}

export async function createValue(scope: SerieDateScope, data: { number: number }) {
  return prisma.$transaction(async prisma => {
    return await db.upsertValue(prisma, scope.serie_name, scope.date, data.number);
  });
}

export async function createComputedSerie(
  scope: SerieScope,
  data: { description: string; formula: string }
) {
  return prisma.$transaction(async prisma => {
    return await db.upsertComputedSerie(prisma, scope.serie_name, data.description, data.formula);
  });
}
