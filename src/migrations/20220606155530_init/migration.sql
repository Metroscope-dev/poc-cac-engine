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
    "serie_name" TEXT NOT NULL,
    "formula" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "value" (
    "date" TIMESTAMP(3) NOT NULL,
    "serie_name" TEXT NOT NULL,
    "number" DOUBLE PRECISION NOT NULL,
    "outdatedAt" TIMESTAMP(3),

    CONSTRAINT "value_pkey" PRIMARY KEY ("date","serie_name")
);

-- CreateTable
CREATE TABLE "stats" (
    "serie_name" TEXT NOT NULL,
    "valueCount" INTEGER NOT NULL,
    "outdatedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "report" (
    "serie_name" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),

    CONSTRAINT "report_pkey" PRIMARY KEY ("serie_name","user_name")
);

-- CreateTable
CREATE TABLE "computation" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "serie_name" TEXT,
    "user_name" TEXT,
    "function_name" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),
    "progress" "Progress" NOT NULL DEFAULT E'WAITING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "computation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "computed_serie_serie_name_key" ON "computed_serie"("serie_name");

-- CreateIndex
CREATE INDEX "value_serie_name_date_idx" ON "value"("serie_name", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stats_serie_name_key" ON "stats"("serie_name");

-- CreateIndex
CREATE UNIQUE INDEX "computation_serie_name_key" ON "computation"("serie_name");

-- CreateIndex
CREATE UNIQUE INDEX "computation_date_serie_name_user_name_key" ON "computation"("date", "serie_name", "user_name");

-- AddForeignKey
ALTER TABLE "computed_serie" ADD CONSTRAINT "computed_serie_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value" ADD CONSTRAINT "value_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stats" ADD CONSTRAINT "stats_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_user_name_fkey" FOREIGN KEY ("user_name") REFERENCES "user"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computation" ADD CONSTRAINT "computation_user_name_fkey" FOREIGN KEY ("user_name") REFERENCES "user"("name") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computation" ADD CONSTRAINT "computation_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE SET NULL ON UPDATE CASCADE;
