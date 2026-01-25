/*
  Warnings:

  - The values [PENDING,CONFIRMED] on the enum `BookingStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `appointment` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `preferredAreas` on the `Guardian` table. All the data in the column will be lost.
  - Added the required column `pickupType` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scheduledAt` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PickupType" AS ENUM ('HOSPITAL', 'HOME');

-- AlterEnum
BEGIN;
CREATE TYPE "BookingStatus_new" AS ENUM ('REQUESTED', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus_new" USING ("status"::text::"BookingStatus_new");
ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
DROP TYPE "public"."BookingStatus_old";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'REQUESTED';
COMMIT;

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_guardianId_fkey";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "appointment",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION,
ADD COLUMN     "pickupType" "PickupType" NOT NULL,
ADD COLUMN     "scheduledAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'REQUESTED',
ALTER COLUMN "guardianId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Guardian" DROP COLUMN "preferredAreas";

-- CreateTable
CREATE TABLE "_GuardianPreferredHospitals" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GuardianPreferredHospitals_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_GuardianPreferredHospitals_B_index" ON "_GuardianPreferredHospitals"("B");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GuardianPreferredHospitals" ADD CONSTRAINT "_GuardianPreferredHospitals_A_fkey" FOREIGN KEY ("A") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GuardianPreferredHospitals" ADD CONSTRAINT "_GuardianPreferredHospitals_B_fkey" FOREIGN KEY ("B") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
