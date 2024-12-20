-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "expiry_date" TIMESTAMP(3),
ADD COLUMN     "payment_method" TEXT;
