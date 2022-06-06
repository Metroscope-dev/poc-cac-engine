import { Prisma } from "@prisma/client";

export type ChangeType = "create" | "update" | "delete";

/**
 * A Scope is a composite key for uniquely identifying a set of a given entity type.
 * Ex: { user_name : "toto" } applied to User will match 1 User,
 *     { user_name : "toto", serie_name : undefined } applied to Report will match N Reports (1 report per Serie).
 */
export type Scope = { user_name?: string; serie_name?: string; date?: Date; dates?: Date[] };

/**
 * A queue that will contain the computation that are ready to recompute.
 * This queue should be populated at startup by looking at the Computation table for rows with progress==='WAITING'.
 * Then is should be incrementally updated after each Operation.
 */
export const waitingComputations: Computation<Scope>[] = [];

abstract class Scopable<T extends Scope> {
  scope: T;
  constructor(scope: T) {
    this.scope = scope;
  }
}

/** A change of all or part of the properties of of the Entity over the multiple instances contained within the Scope  */
abstract class EntityOperation<T extends Scope> extends Scopable<T> {
  /** The Computations that are impacted by this Operation */
  abstract impactedComputations: Computation<T>["constructor"][];
  type: ChangeType;
  constructor(scope: T, op: ChangeType) {
    super(scope);
    this.type = op;
  }
}

export class UserSettingsChanged extends EntityOperation<{ user_name: string }> {
  impactedComputations = [ReportComputation];
}
export class ComputedSerieFormulaChanged extends EntityOperation<{ serie_name: string }> {
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

abstract class Computation<T extends Scope> extends Scopable<T> {
  abstract functionName: string;
  abstract compute: () => Promise<void>;
  abstract entityOperation: EntityOperation<T>["constructor"];
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

export type FormulaScope =
  | { serie_name: string }
  | { serie_name: string; date: Date }
  | { serie_name: string; dates: Date[] };
export class FormulaComputation extends Computation<FormulaScope> {
  functionName = "formula";
  entityOperation = ValueNumberChanged.constructor;
  prismaUpdateMany = (prisma: Prisma.TransactionClient) => prisma.value.updateMany;
  compute = () => {
    return Promise.reject(new Error("Not implemented yet!"));
  };
}
export type StatsScope = { serie_name: string };
export class StatsComputation extends Computation<StatsScope> {
  functionName = "stats";
  entityOperation = StatsCountChanged;
  prismaUpdateMany = (prisma: Prisma.TransactionClient) => prisma.stats.updateMany;
  compute = () => {
    return Promise.reject(new Error("Not implemented yet!"));
  };
}
export type ReportScope =
  | {
      user_name: string;
      serie_name: string;
    }
  | { user_name: string };
export class ReportComputation extends Computation<ReportScope> {
  functionName = "report";
  entityOperation = ReportContentChanged;
  prismaUpdateMany = (prisma: Prisma.TransactionClient) => prisma.report.updateMany;
  compute = () => {
    return Promise.reject(new Error("Not implemented yet!"));
  };
}

export async function cascade(
  operation: EntityOperation<Scope>,
  prisma: Prisma.TransactionClient,
  rootOperation = true
) {
  const computations = await findImpactedComputations(operation);

  console.log(
    `${rootOperation ? "Root" : "Child"}-Operation : ${
      operation.constructor.name
    } with scope ${JSON.stringify(operation.scope)}`
  );
  console.log(`> Impacted computations : ${computations.map(c => c.functionName)}`);

  const outdatedAt = new Date();
  for (const computation of computations) {
    if (computation.type === "create") continue;
    const childOperation = await outdateComputedEntities(prisma, computation, outdatedAt);
    if (childOperation) await cascade(childOperation, prisma, false);
    await outdateComputation(prisma, computation, outdatedAt);
  }

  if (rootOperation) {
    await triggerAutoComplete(prisma, computations);
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

async function findImpactedComputations(
  operation: EntityOperation<Scope>
): Promise<Computation<Scope>[]> {
  const impactedComputations: Computation<Scope>[] = [];
  for (const computationConstructor of operation.impactedComputations) {
    const computation = new computationConstructor(operation.scope, operation.type);
    impactedComputations.push(computation);
  }
  return impactedComputations;
}

async function outdateComputedEntities(
  prisma: Prisma.TransactionClient,
  computation: Computation<Scope>,
  outdatedAt: Date
) {
  console.log(
    `Outdating ${computation.entityOperation.name} with scope ${JSON.stringify(computation.scope)}`
  );
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
  console.log(
    `Outdating ${computation.functionName} with scope ${JSON.stringify(computation.scope)}`
  );
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
  console.log(
    `Requesting computation for ${computation.functionName} with scope ${JSON.stringify(
      computation.scope
    )}`
  );
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

  //Todo should be on post transaction success
  waitingComputations.push(computation);
}
