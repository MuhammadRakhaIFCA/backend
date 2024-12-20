-- CreateTable
CREATE TABLE "sysuser" (
    "rowId" SERIAL NOT NULL,
    "email" VARCHAR(60) NOT NULL,
    "password" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "gender" VARCHAR(60) NOT NULL,
    "userID" VARCHAR(10) NOT NULL,
    "Company_Cd" VARCHAR(10) NOT NULL,
    "UserLevel" VARCHAR(20) NOT NULL,
    "Handphone" VARCHAR(20) NOT NULL,
    "Status" CHAR(1) NOT NULL,
    "isResetLogin" CHAR(1) NOT NULL,
    "pict" VARCHAR(255),
    "audit_user" VARCHAR(10) NOT NULL,
    "audit_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sysuser_pkey" PRIMARY KEY ("rowId")
);

-- CreateTable
CREATE TABLE "company" (
    "id" SERIAL NOT NULL,
    "company_cd" VARCHAR(10) NOT NULL,
    "nama_company" VARCHAR(100) NOT NULL,
    "client_id" VARCHAR(255),
    "client_secret" VARCHAR(255),
    "kuota_email_blast" VARCHAR(10),
    "kuota_whatsapp_blast" VARCHAR(10),
    "peruri_account_username" VARCHAR(50),
    "peruri_account_password" VARCHAR(25),
    "audit_user" VARCHAR(10) NOT NULL,
    "audit_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);
