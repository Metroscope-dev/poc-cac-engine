/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "@prisma/client";
export type ChangeType = "create" | "update" | "delete";

/**
 * A Scope is a composite key for uniquely identifying a collection of a given entity type.
 * Ex: { userName : "toto" } applied to User will match 1 User,
 *     { userName : "toto", serieName : undefined } applied to Report will match N Reports (1 report per Serie).
 */
export type Scope = {
  userName?: string;
  serieName?: string;
  date?: Date;
};

/** A batch change of some properties within a collection of Entity.*/
export abstract class ChangeEvent<T extends Scope> {
  scope: T;
  /** The Computations that are impacted by this Event */
  abstract impactedComputations: Computation<Scope, any, any>["constructor"][];
  changeType: ChangeType;
  constructor(scope: T, changeType: ChangeType) {
    this.scope = scope;
    this.changeType = changeType;
  }
  description() {
    return `${this.constructor.name}[${JSON.stringify(this.scope)}]`;
  }
}

/** Describes how a computation should be performed.
 * A computation has a fixed scope.
 */
export abstract class Computation<ComputationScope extends Scope, Input, Output> {
  /** Compute the list of ComputationScope that are resolved from the Scope of triggering event  */
  abstract computeScopes: (
    prisma: Prisma.TransactionClient,
    scopeRequest: Scope
  ) => Promise<ComputationScope[]>;
  /** Find the input for a given ComputationScope */
  abstract findInput: (prisma: Prisma.TransactionClient, scope: ComputationScope) => Promise<Input>;
  /** Actual computation logic */
  abstract compute: (input: Input) => Promise<Output>;
  /** Save the output to the DB */
  abstract saveOutput: (prisma: Prisma.TransactionClient, output: Output) => Promise<void>;
  /** The event that should be emitted when the computation is done */
  abstract createOutputChangeEvent: ChangeEvent<Scope>["constructor"];
  /** Mark the existing ComputedEntity as outdated */
  abstract outdateExistingComputedEntity(
    prisma: Prisma.TransactionClient,
    scope: ComputationScope,
    outdatedAt: Date | null
  ): Promise<void>;

  async restoreExistingComputedEntity(prisma: Prisma.TransactionClient, scope: ComputationScope) {
    return this.outdateExistingComputedEntity(prisma, scope, null);
  }

  /** Returns a short string for logging computation tasks*/
  taskDescription(scope: ComputationScope | undefined) {
    return `${this.constructor.name}[${JSON.stringify(scope)}]`;
  }
}
