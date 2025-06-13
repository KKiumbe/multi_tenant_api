-- AlterTable
ALTER TABLE "MPESAConfig" ADD COLUMN     "secretKey" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_merchantRequestId_key" ON "PaymentLink"("merchantRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_checkoutRequestId_key" ON "PaymentLink"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "PaymentLink_customerId_idx" ON "PaymentLink"("customerId");

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
