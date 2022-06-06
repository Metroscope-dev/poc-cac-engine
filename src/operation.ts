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

abstract class Scopable<T extends Scope> {
  scope: T;
  constructor(scope: T) {
    this.scope = scope;
  }
}

abstract class EntityOperation<T extends Scope> extends Scopable<T> {
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
class ReportContentChanged extends EntityOperation<UserSerieScope> {}

abstract class Computation<T extends Scope> extends Scopable<T> {
  abstract functionName: string;
  abstract entityOperation: typeof EntityOperation.constructor;
  abstract prismaUpdateMany: (
    prisma: Prisma.TransactionClient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => (arg: { data: any; where: any }) => void;
  type: ChangeType;
  constructor(scope: T, type: ChangeType) {
    super(scope);
    this.type = type;
  }
}

class ReportComputation extends Computation<UserSerieScope> {
  functionName = "report";
  entityOperation = ReportContentChanged.constructor;
  prismaUpdateMany = (prisma: Prisma.TransactionClient) => prisma.report.updateMany;
}
class FormulaComputation extends Computation<SerieDateScope> {
  functionName = "formula";
  entityOperation = ValueNumberChanged.constructor;
  prismaUpdateMany = (prisma: Prisma.TransactionClient) => prisma.value.updateMany;
}
class StatsComputation extends Computation<SerieScope> {
  functionName = "stats";
  entityOperation = StatsCountChanged.constructor;
  prismaUpdateMany = (prisma: Prisma.TransactionClient) => prisma.stats.updateMany;
}

async function cascade(
  operation: EntityOperation<Scope>,
  prisma: Prisma.TransactionClient,
  rootOperation = true
) {
  const computations = await findImpactedComputation(operation);
  const outdatedAt = new Date();
  for (const computation of computations) {
    if (computation.type === "create") continue;
    const childOperation = await outdateComputedEntities(prisma, computation, outdatedAt);
    if (childOperation) await cascade(childOperation, prisma, false);
    outdateComputation(prisma, computation, outdatedAt);
  }

  if (rootOperation) {
    triggerAutoComplete(prisma, computations);
  }
}

async function triggerAutoComplete(
  prisma: Prisma.TransactionClient,
  computations: Computation<Scope>[]
) {
  for (const computation of computations) {
    await requestComputation(prisma, computation);
  }
}

async function findImpactedComputation(
  operation: EntityOperation<Scope>
): Promise<Computation<Scope>[]> {
  const directImpact: Computation<Scope>[] = [];
  switch (operation.constructor.name) {
    case "UserSettingsChanged":
      {
        const userOperation = operation as UserSettingsChanged;
        const reportOperation = new ReportComputation(
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
      const formulaFunctionInputChanged = new FormulaComputation(
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
      const formulaFunctionInputChanged = new FormulaComputation(
        {
          serie_name: undefined,
          date: valueOperation.scope.date,
        },
        valueOperation.type
      );
      directImpact.push(formulaFunctionInputChanged);

      const statsFunctionInputChanged = new StatsComputation(
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
        const reportOperation = new ReportComputation(
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

async function outdateComputedEntities(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope>,
  outdatedAt: Date
) {
  await computation.prismaUpdateMany(prisma)({
    data: {
      outdatedAt,
    },
    where: {
      ...computation.scope,
    },
  });
  return computation.entityOperation(computation.scope, "delete");
}

async function outdateComputation(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope>,
  outdatedAt: Date
) {
  await prisma.computation.updateMany({
    data: {
      outdatedAt,
    },
    where: {
      ...computation.scope,
      function_name: computation.functionName,
    },
  });
}

async function requestComputation(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope>
) {
  await prisma.computation.updateMany({
    data: {
      outdatedAt: null,
      progress: "WAITING",
    },
    where: {
      ...computation.scope,
      function_name: computation.functionName,
    },
  });
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
