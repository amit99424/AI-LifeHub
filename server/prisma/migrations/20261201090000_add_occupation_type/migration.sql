-- Occupation personalisation, phase 1.
--
-- Strictly additive: a new enum, one nullable column, one new table. No column
-- is dropped, renamed or retyped, and `Profile.occupation` keeps every word a
-- user typed. Nothing here can lose data.

-- CreateEnum
CREATE TYPE "OccupationType" AS ENUM ('STUDENT', 'WORKING_PROFESSIONAL', 'FREELANCER', 'BUSINESS_OWNER', 'ENTREPRENEUR', 'JOB_SEEKER', 'TEACHER', 'OTHER');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "occupationType" "OccupationType";

-- CreateTable
CREATE TABLE "OccupationLabel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OccupationLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OccupationLabel_userId_key" ON "OccupationLabel"("userId");

-- AddForeignKey
ALTER TABLE "OccupationLabel" ADD CONSTRAINT "OccupationLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill: classify the free-text occupation of every existing profile.
--
-- Order matters. The first rule that matches wins, and the rules run from the
-- most specific to the most generic, so "freelance designer" becomes FREELANCER
-- (not OTHER) and "teacher" beats a bare "manager" match.
--
-- A row whose text matches nothing is left NULL rather than forced into OTHER.
-- NULL means "we could not tell", which is honest; OTHER would claim the user
-- said so. The app resolves NULL to OTHER for display and lets the person
-- correct it in one tap.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "Profile" SET "occupationType" = CASE
  WHEN "occupation" IS NULL OR btrim("occupation") = '' THEN NULL

  -- Student first: "medical student" must not become OTHER.
  WHEN lower("occupation") ~ '(student|scholar|undergrad|graduate(\s|$)|learner|b\.?tech|m\.?tech|bca|mca|mba|b\.?sc|m\.?sc|neet|jee|upsc|gate|class 1[0-2])'
    THEN 'STUDENT'::"OccupationType"

  -- Teaching before generic work: "teacher" and "professor" are clear.
  WHEN lower("occupation") ~ '(teacher|tutor|professor|lecturer|educator|instructor|faculty|coach)'
    THEN 'TEACHER'::"OccupationType"

  WHEN lower("occupation") ~ '(freelanc|self[- ]?employ|contractor|consultant|independent)'
    THEN 'FREELANCER'::"OccupationType"

  WHEN lower("occupation") ~ '(founder|co-?founder|entrepreneur|startup|start-up)'
    THEN 'ENTREPRENEUR'::"OccupationType"

  WHEN lower("occupation") ~ '(business owner|businessman|businesswoman|shop owner|proprietor|merchant|trader|retailer|manufacturer)'
    THEN 'BUSINESS_OWNER'::"OccupationType"

  -- "unemployed" and "between jobs" are job seeking, not a profession.
  WHEN lower("occupation") ~ '(job seek|jobseek|unemploy|between jobs|looking for work|fresher|graduate trainee)'
    THEN 'JOB_SEEKER'::"OccupationType"

  -- The broad professional bucket, deliberately last among the named ones.
  WHEN lower("occupation") ~ '(engineer|developer|programmer|designer|manager|analyst|researcher|scientist|architect|accountant|lawyer|doctor|nurse|officer|executive|specialist|administrator|clerk|technician|marketing|sales|hr |human resources|product|operations|banker|pharmacist|writer|editor|journalist|artist|photographer|chef|pilot|government|civil service|employee|professional|working)'
    THEN 'WORKING_PROFESSIONAL'::"OccupationType"

  ELSE NULL
END
WHERE "occupationType" IS NULL AND "occupation" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- Preserve the words of anyone the backfill could not classify, so their
-- custom label is not lost when the UI switches to typed occupations.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO "OccupationLabel" ("id", "userId", "label", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."userId", btrim(p."occupation"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Profile" p
WHERE p."occupation" IS NOT NULL
  AND btrim(p."occupation") <> ''
  AND p."occupationType" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "OccupationLabel" l WHERE l."userId" = p."userId");
