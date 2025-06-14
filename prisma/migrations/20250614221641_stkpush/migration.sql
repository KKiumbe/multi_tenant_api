-- AddForeignKey
ALTER TABLE "MPESATransactions" ADD CONSTRAINT "MPESATransactions_ShortCode_fkey" FOREIGN KEY ("ShortCode") REFERENCES "MPESAConfig"("shortCode") ON DELETE CASCADE ON UPDATE CASCADE;
