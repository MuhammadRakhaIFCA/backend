/*
  Warnings:

  - You are about to drop the column `gender` on the `sysuser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "sysuser" DROP COLUMN "gender";

-- CreateTable
CREATE TABLE "balance" (
    "id" SERIAL NOT NULL,
    "company_cd" VARCHAR(10) NOT NULL,
    "nama_company" VARCHAR(100) NOT NULL,
    "transaction_id" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "kuota" INTEGER NOT NULL,
    "audit_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "company_cd" TEXT NOT NULL,
    "sn" TEXT,
    "token" TEXT,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);
