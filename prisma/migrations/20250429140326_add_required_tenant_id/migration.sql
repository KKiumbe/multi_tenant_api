/*
  Warnings:

  - Made the column `tenantId` on table `UserActivity` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable

UPDATE "UserActivity" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
ALTER TABLE "UserActivity" ALTER COLUMN "tenantId" SET NOT NULL;
	
