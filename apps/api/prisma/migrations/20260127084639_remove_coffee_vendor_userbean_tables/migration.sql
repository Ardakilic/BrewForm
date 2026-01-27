/*
  Warnings:

  - You are about to drop the column `coffeeId` on the `recipe_versions` table. All the data in the column will be lost.
  - You are about to drop the `coffees` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_beans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vendors` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "coffees" DROP CONSTRAINT "coffees_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "recipe_versions" DROP CONSTRAINT "recipe_versions_coffeeId_fkey";

-- DropForeignKey
ALTER TABLE "user_beans" DROP CONSTRAINT "user_beans_coffeeId_fkey";

-- DropForeignKey
ALTER TABLE "user_beans" DROP CONSTRAINT "user_beans_userId_fkey";

-- DropIndex
DROP INDEX "recipe_versions_coffeeId_idx";

-- AlterTable
ALTER TABLE "recipe_versions" DROP COLUMN "coffeeId";

-- DropTable
DROP TABLE "coffees";

-- DropTable
DROP TABLE "user_beans";

-- DropTable
DROP TABLE "vendors";
