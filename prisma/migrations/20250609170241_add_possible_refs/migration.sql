-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "possibleRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];
