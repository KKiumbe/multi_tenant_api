-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PREPAID', 'POSTPAID');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customerType" "CustomerType" NOT NULL DEFAULT 'PREPAID';
