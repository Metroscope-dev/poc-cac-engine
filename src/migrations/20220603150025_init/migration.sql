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
    "description" TEXT NOT NULL,

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
CREATE TABLE "graph" (
    "serie_name" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),

    CONSTRAINT "graph_pkey" PRIMARY KEY ("serie_name","user_name")
);

-- CreateTable
CREATE TABLE "serie_computation" (
    "serie_name" TEXT NOT NULL,
    "function_name" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),
    "progress" "Progress" NOT NULL DEFAULT E'WAITING',
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "date_serie_computation" (
    "date" TIMESTAMP(3) NOT NULL,
    "serie_name" TEXT NOT NULL,
    "function_name" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),
    "progress" "Progress" NOT NULL DEFAULT E'WAITING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "date_serie_computation_pkey" PRIMARY KEY ("date","serie_name")
);

-- CreateTable
CREATE TABLE "user_serie_computation" (
    "user_name" TEXT NOT NULL,
    "serie_name" TEXT NOT NULL,
    "function_name" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outdatedAt" TIMESTAMP(3),
    "progress" "Progress" NOT NULL DEFAULT E'WAITING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_serie_computation_pkey" PRIMARY KEY ("user_name","serie_name")
);

-- CreateIndex
CREATE UNIQUE INDEX "computed_serie_serie_name_key" ON "computed_serie"("serie_name");

-- CreateIndex
CREATE INDEX "value_serie_name_date_idx" ON "value"("serie_name", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stats_serie_name_key" ON "stats"("serie_name");

-- CreateIndex
CREATE UNIQUE INDEX "serie_computation_serie_name_key" ON "serie_computation"("serie_name");

-- AddForeignKey
ALTER TABLE "computed_serie" ADD CONSTRAINT "computed_serie_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value" ADD CONSTRAINT "value_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stats" ADD CONSTRAINT "stats_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph" ADD CONSTRAINT "graph_user_name_fkey" FOREIGN KEY ("user_name") REFERENCES "user"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph" ADD CONSTRAINT "graph_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serie_computation" ADD CONSTRAINT "serie_computation_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_serie_computation" ADD CONSTRAINT "date_serie_computation_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_serie_computation" ADD CONSTRAINT "user_serie_computation_user_name_fkey" FOREIGN KEY ("user_name") REFERENCES "user"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_serie_computation" ADD CONSTRAINT "user_serie_computation_serie_name_fkey" FOREIGN KEY ("serie_name") REFERENCES "serie"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
