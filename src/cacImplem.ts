import * as formula from "./computeFormula";
import * as stats from "./computeStats";
import * as report from "./computeReport";
import { Prisma } from "@prisma/client";
import { Computation, ChangeEvent, Scope } from "./cacBase";
import { registeredComputations } from "./cacEngine";

export class UserSettingsChanged extends ChangeEvent<{ userName: string }> {
  impactedComputations = [ReportComputation];
}
export class ComputedSerieFormulaChanged extends ChangeEvent<{
  serieName: string;
}> {
  impactedComputations = [FormulaComputation];
}

export class ValueNumberChanged extends ChangeEvent<FormulaScope> {
  impactedComputations = [FormulaComputation, StatsComputation];
}

export class StatsCountChanged extends ChangeEvent<StatsScope> {
  impactedComputations = [ReportComputation];
}

export class ReportContentChanged extends ChangeEvent<ReportScope> {
  impactedComputations = [];
}

export type FormulaScope = { serieName: string; date: Date };
export class FormulaComputation extends Computation<
  FormulaScope,
  formula.FormulaInput,
  formula.FormulaOutput
> {
  computationName = "formula";
  createOutputChangeEvent = ValueNumberChanged;
  outdateExistingComputedEntity = async (
    prisma: Prisma.TransactionClient,
    scope: FormulaScope,
    outdatedAt: Date | null
  ) => {
    await prisma.value.updateMany({
      where: {
        date: scope.date,
        serieName: scope.serieName,
      },
      data: {
        outdatedAt,
      },
    });
  };
  findInput = async (prisma: Prisma.TransactionClient, scope: FormulaScope) => {
    return formula.findInput(prisma, scope.serieName, scope.date);
  };
  saveOutput = formula.saveOutput;
  computeScopes = async (prisma: Prisma.TransactionClient, scope: Scope) => {
    const serieName = scope.serieName;
    if (!serieName) throw new Error("serieName is mandatory in FormulaScope");
    const dates = (
      await prisma.value.findMany({
        where: {
          serieName: scope.serieName,
        },
        select: {
          date: true,
        },
      })
    ).map(o => o.date);

    const computedSeries = await prisma.computedSerie.findMany({
      where: {
        dependingOnSerieName: serieName,
      },
      select: {
        serieName: true,
      },
    });
    const scopes = computedSeries.flatMap(cs =>
      dates.map(date => ({ serieName: cs.serieName, date }))
    );
    return scopes;
  };
  compute = formula.computeFormula;
}
export type StatsScope = { serieName: string };
export class StatsComputation extends Computation<StatsScope, stats.StatsInput, stats.StatsOutput> {
  computationName = "stats";
  createOutputChangeEvent = StatsCountChanged;
  outdateExistingComputedEntity = async (
    prisma: Prisma.TransactionClient,
    scope: StatsScope,
    outdatedAt: Date | null
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
  findInput = async (prisma: Prisma.TransactionClient, scope: StatsScope) => {
    return await stats.findInput(prisma, scope.serieName);
  };
  compute = (input: stats.StatsInput) => Promise.resolve(stats.computeStats(input));
  saveOutput = stats.saveOutput;
}
export type ReportScope = { userName: string; serieName: string };
export class ReportComputation extends Computation<
  ReportScope,
  report.ReportInput,
  report.ReportOutput
> {
  computationName = "report";
  createOutputChangeEvent = ReportContentChanged;
  outdateExistingComputedEntity = async (
    prisma: Prisma.TransactionClient,
    scope: ReportScope,
    outdatedAt: Date | null
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
  findInput = (prisma: Prisma.TransactionClient, scope: ReportScope) =>
    report.findInput(prisma, scope.userName, scope.serieName);
  compute = report.computeReport;
  saveOutput = report.saveOutput;
}

registeredComputations[FormulaComputation.name] = FormulaComputation;
registeredComputations[StatsComputation.name] = StatsComputation;
registeredComputations[ReportComputation.name] = ReportComputation;
