-- CreateTable
CREATE TABLE "transaction" (
    "id" SERIAL NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "paid_date" TIMESTAMP(3),

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);
