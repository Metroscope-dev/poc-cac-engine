import { Prisma } from "@prisma/client";
import { computeFormula, computeReport, computeStats } from "./domain";

export type ChangeType = "create" | "update" | "delete";

/**
 * A Scope is a composite key for uniquely identifying a set of a given entity type.
 * Ex: { userName : "toto" } applied to User will match 1 User,
 *     { userName : "toto", serieName : undefined } applied to Report will match N Reports (1 report per Serie).
 */
export type Scope = {
  userName?: string;
  serieName?: string;
  dates?: Date[];
};

/**
 * A queue that will contain the computation that are ready to recompute.
 * This queue should be populated at startup by looking at the Computation table for rows with progress==='WAITING'.
 * Then is should be incrementally updated after each Operation.
 */
export const waitingComputations: ComputationRequest<Scope>[] = [];

/** A change of all or part of the properties of of the Entity over the multiple instances contained within the Scope  */
abstract class EntityOperation<T extends Scope> {
  scope: T;
  /** The Computations that are impacted by this Operation */
  abstract impactedComputations: Computation<Scope>["constructor"][];
  type: ChangeType;
  constructor(scope: T, op: ChangeType) {
    this.scope = scope;
    this.type = op;
  }
  toString() {
    return `${this.constructor.name}[${JSON.stringify(this.scope)}]`;
  }
}

export class UserSettingsChanged extends EntityOperation<{ userName: string }> {
  impactedComputations = [ReportComputation];
}
export class ComputedSerieFormulaChanged extends EntityOperation<{
  serieName: string;
}> {
  impactedComputations = [FormulaComputation];
}

export class ValueNumberChanged extends EntityOperation<FormulaScope> {
  impactedComputations = [FormulaComputation, StatsComputation];
}

export class StatsCountChanged extends EntityOperation<StatsScope> {
  impactedComputations = [ReportComputation];
}

export class ReportContentChanged extends EntityOperation<ReportScope> {
  impactedComputations = [];
}

abstract class Computation<T extends Scope> {
  //The scope that is requested has to be
  abstract computeScopes: (prisma: Prisma.TransactionClient, scopeRequest: Scope) => Promise<T[]>;
  abstract compute: (scope: T) => Promise<void>;
  abstract entityOperation: EntityOperation<T>["constructor"];
  abstract outdateComputedEntity: (
    prisma: Prisma.TransactionClient,
    scope: T,
    outdatedAt: Date
  ) => Promise<void>;

  toString(scope: T | undefined) {
    return `${this.constructor.name}[${JSON.stringify(scope)}]`;
  }
}

type ComputationRequest<T extends Scope> = {
  scope: T;
  computation: Computation<T>;
};

export type FormulaScope = { serieName: string; dates: Date[] };
export class FormulaComputation extends Computation<FormulaScope> {
  computationName = "formula";
  entityOperation = ValueNumberChanged;
  outdateComputedEntity = async (
    prisma: Prisma.TransactionClient,
    scope: FormulaScope,
    outdatedAt: Date
  ) => {
    await prisma.value.updateMany({
      where: {
        date: {
          in: scope.dates,
        },
        serieName: scope.serieName,
      },
      data: {
        outdatedAt,
      },
    });
  };
  computeScopes = async (prisma: Prisma.TransactionClient, scope: Scope) => {
    const serieName = scope.serieName;
    if (!serieName) throw new Error("serieName is mandatory in FormulaScope");
    let dates: Date[] = scope.dates ?? [];
    if (!dates) {
      dates = (
        await prisma.value.findMany({
          where: {
            serieName: scope.serieName,
          },
          select: {
            date: true,
          },
        })
      ).map(o => o.date);
    }
    const computedSeries = await prisma.computedSerie.findMany({
      where: {
        dependingOnSerieName: serieName,
      },
      select: {
        serieName: true,
      },
    });
    return computedSeries.map(cs => ({ dates, ...cs }));
  };
  compute = async (scope: FormulaScope) => {
    await computeFormula(scope.serieName, scope.dates);
  };
}
export type StatsScope = { serieName: string };
export class StatsComputation extends Computation<StatsScope> {
  computationName = "stats";
  entityOperation = StatsCountChanged;
  outdateComputedEntity = async (
    prisma: Prisma.TransactionClient,
    scope: StatsScope,
    outdatedAt: Date
  ) => {
    await prisma.stats.updateMany({
      where: {
        ...scope,
      },
      data: {
        outdatedAt,
      },
    });
  };
  computeScopes = async (_prisma: Prisma.TransactionClient, scope: Scope) => {
    if (!scope.serieName) throw new Error("serieName is mandatory in StatsScope");
    return Promise.resolve([{ serieName: scope.serieName }]);
  };
  compute = async (scope: StatsScope) => {
    await computeStats(scope.serieName);
  };
}
export type ReportScope = { userName: string; serieName: string };
export class ReportComputation extends Computation<ReportScope> {
  computationName = "report";
  entityOperation = ReportContentChanged;
  outdateComputedEntity = async (
    prisma: Prisma.TransactionClient,
    scope: ReportScope,
    outdatedAt: Date
  ) => {
    await prisma.report.updateMany({
      where: {
        ...scope,
      },
      data: {
        outdatedAt,
      },
    });
  };
  computeScopes = async (prisma: Prisma.TransactionClient, scope: Scope) => {
    const serieName = scope.serieName;
    const userName = scope.userName;

    if (!serieName && !userName)
      throw new Error("At least serieName OR userName is mandatory in ReportScope");
    if (!serieName && userName) {
      const serieNames = (await prisma.stats.findMany({ select: { serieName: true } })).map(
        o => o.serieName
      );
      return Promise.resolve(serieNames.map(serieName => ({ serieName, userName })));
    } else if (serieName && !userName) {
      const userNames = (await prisma.user.findMany({ select: { name: true } })).map(o => o.name);
      return Promise.resolve(userNames.map(userName => ({ serieName, userName })));
    }
    throw new Error("Should not happen.");
  };
  compute = async (scope: ReportScope) => {
    await computeReport(scope.userName, scope.serieName);
  };
}

export async function cascade(
  prisma: Prisma.TransactionClient,
  operation: EntityOperation<Scope>,
  depth = 1
) {
  console.log(`${indent(depth)}Cascading ${operation.toString()}`);
  const computations = operation.impactedComputations.map(
    computationConstructor => new computationConstructor(operation.scope, operation.type)
  );
  console.log(`${indent(depth)}\t${computations.length} impacted computations.`);

  const outdatedAt = new Date();
  for (const computation of computations) {
    const scopes = await computation.computeScopes(prisma, operation.scope);
    console.log(
      `${indent(depth)}\t${computation.constructor.name}: ${JSON.stringify(
        operation.scope
      )} => ${JSON.stringify(scopes)}.`
    );
    for (const scope of scopes) {
      console.log(
        `${indent(depth)}\t${
          computation.constructor.name
        }: Outdating computation db entries ${computation.toString(scope)}.`
      );
      await outdateComputation(prisma, computation, scope, outdatedAt);
      console.log(
        `${indent(depth)}\t${
          computation.constructor.name
        }: Outdating computedEntity db entries ${computation.toString(scope)}.`
      );
      await computation.outdateComputedEntity(prisma, scope, outdatedAt);
      const childOperation = new computation.entityOperation(scope, "delete");
      if (childOperation) await cascade(prisma, childOperation, depth + 1);
      if (depth === 1) {
        await requestComputation(prisma, computation, scope);
      }
    }
  }
}

function indent(depth: number) {
  return "\t".repeat(depth);
}

async function outdateComputation<T extends Scope, C extends Computation<T>>(
  prisma: Prisma.TransactionClient,
  computation: C,
  scope: T,
  outdatedAt: Date
) {
  await prisma.computation.updateMany({
    data: {
      outdatedAt,
    },
    where: {
      userName: scope.userName,
      serieName: scope.serieName,
      dates: datesAsUniqueString(scope.dates),
      computationName: computation.constructor.name,
    },
  });
}

async function requestComputation(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope>,
  scope: Scope
) {
  console.log(
    `Requesting computation for ${computation.constructor.name} with scope ${JSON.stringify(scope)}`
  );
  await prisma.computation.upsert({
    create: {
      userName: scope.userName ?? "*",
      serieName: scope.serieName ?? "*",
      dates: datesAsUniqueString(scope.dates),
      computationName: computation.constructor.name,
      outdatedAt: null,
      progress: "WAITING",
    },
    update: {
      outdatedAt: null,
      progress: "WAITING",
    },
    where: {
      userName_serieName_dates_computationName: {
        userName: scope.userName ?? "*",
        serieName: scope.serieName ?? "*",
        dates: datesAsUniqueString(scope.dates),
        computationName: computation.constructor.name,
      },
    },
  });

  //Todo should be done in transaction.onSuccess()
  waitingComputations.push({ scope, computation });
}

function datesAsUniqueString(dates: Date[] | undefined) {
  if (!dates) return "*";
  return dates
    .map(d => d.toISOString())
    .sort()
    .join(",");
}
