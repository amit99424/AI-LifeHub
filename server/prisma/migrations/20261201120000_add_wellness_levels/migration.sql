-- Phase 2: self-reported wellness levels on the existing daily log.
--
-- Three nullable integer columns. Nothing is dropped, renamed or retyped, and
-- every existing row keeps its sleep, exercise, screen, meditation, social and
-- steps values untouched. NULL means "not reported", which is what every
-- existing row will read as until the person fills the form in.

-- AlterTable
ALTER TABLE "DailyActivity" ADD COLUMN     "energyLevel" INTEGER,
ADD COLUMN     "sleepQuality" INTEGER,
ADD COLUMN     "stressLevel" INTEGER;

-- Values are constrained here as well as in the API, so a bad write from any
-- future path (CSV import, a script, a device sync) cannot store a 9 on a 1-5
-- scale and silently skew every average built on it.
ALTER TABLE "DailyActivity"
  ADD CONSTRAINT "DailyActivity_stressLevel_range" CHECK ("stressLevel" IS NULL OR "stressLevel" BETWEEN 1 AND 5),
  ADD CONSTRAINT "DailyActivity_energyLevel_range" CHECK ("energyLevel" IS NULL OR "energyLevel" BETWEEN 1 AND 5),
  ADD CONSTRAINT "DailyActivity_sleepQuality_range" CHECK ("sleepQuality" IS NULL OR "sleepQuality" BETWEEN 1 AND 5);
