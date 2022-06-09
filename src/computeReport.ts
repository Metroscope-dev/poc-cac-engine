import { Prisma, Stats } from "@prisma/client";

export type ReportInput = {
  userName: string;
  serieName: string;
  stats: Stats;
};

export type ReportOutput = {
  userName: string;
  serieName: string;
  content: string;
};

export async function findInput(
  prisma: Prisma.TransactionClient,
  userName: string,
  serieName: string
): Promise<ReportInput> {
  const stats = await prisma.stats.findUnique({
    where: {
      serieName,
    },
  });
  if (!stats)
    throw new Error(
      `Cannot compute report ${serieName} for user ${userName} because the corresponding Stats is missing.`
    );
  return {
    serieName,
    userName,
    stats,
  };
}

export async function saveOutput(prisma: Prisma.TransactionClient, output: ReportOutput) {
  await prisma.report.upsert({
    where: {
      serieName_userName: {
        serieName: output.serieName,
        userName: output.userName,
      },
    },
    create: {
      ...output,
    },
    update: {
      content: output.content,
    },
  });
}

export async function computeReport(input: ReportInput): Promise<ReportOutput> {
  return {
    serieName: input.serieName,
    userName: input.userName,
    content: `Report for Mr ${input.userName}. The serie ${input.serieName} has ${input.stats.valueCount} values. Best regards.`,
  };
}
