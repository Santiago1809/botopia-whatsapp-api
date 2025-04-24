-- DropIndex
DROP INDEX "User_phoneNumber_key";

-- CreateIndex
CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key_when_not_null" ON "User"("phoneNumber") WHERE "phoneNumber" IS NOT NULL;
