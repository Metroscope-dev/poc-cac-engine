-- CreateEnum
CREATE TYPE "Progress" AS ENUM ('WAITING', 'RUNNING', 'ERROR', 'SUCCESS');

-- CreateTable
CREATE TABLE "user" (
    "name" TEXT NOT NULL,
    "reportSettings" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "serie" (
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "serie_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "computed_serie" (
    "serieName" TEXT NOT NULL,
    "dependingOnSerieName" TEXT NOT NULL,
    "formula" TEXT NOT NULL,

    CONSTRAINT "computed_serie_pkey" PRIMARY KEY ("serieName")
);

-- CreateTable
CREATE TABLE "value" (
    "date" TIMESTAMP(3) NOT NULL,
    "serieName" TEXT NOT NULL,
    "number" DOUBLE PRECISION NOT NULL,
    "outdatedAt" TIMESTAMP(3),

    CONSTRAINT "value_pkey" PRIMARY KEY ("date","serieName")
);

-- CreateTable
CREATE TABLE "stats" (
    "serieName" TEXT NOT NULL,
    "valueCount" INTEGER NOT NULL,
    "outdatedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "report" (
    "serieName" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),

    CONSTRAINT "report_pkey" PRIMARY KEY ("serieName","userName")
);

-- CreateTable
CREATE TABLE "computation" (
    "dates" TEXT NOT NULL,
    "serieName" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "computationName" TEXT NOT NULL,
    "inputHash" TEXT,
    "outdatedAt" TIMESTAMP(3),
    "progress" "Progress" NOT NULL DEFAULT E'WAITING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "computation_pkey" PRIMARY KEY ("userName","serieName","dates","computationName")
);

-- CreateIndex
CREATE INDEX "value_serieName_date_idx" ON "value"("serieName", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stats_serieName_key" ON "stats"("serieName");

-- AddForeignKey
ALTER TABLE "computed_serie" ADD CONSTRAINT "computed_serie_serieName_fkey" FOREIGN KEY ("serieName") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computed_serie" ADD CONSTRAINT "computed_serie_dependingOnSerieName_fkey" FOREIGN KEY ("dependingOnSerieName") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value" ADD CONSTRAINT "value_serieName_fkey" FOREIGN KEY ("serieName") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stats" ADD CONSTRAINT "stats_serieName_fkey" FOREIGN KEY ("serieName") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_userName_fkey" FOREIGN KEY ("userName") REFERENCES "user"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_serieName_fkey" FOREIGN KEY ("serieName") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
