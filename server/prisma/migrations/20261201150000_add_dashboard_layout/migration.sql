-- Phase 3: persist the user's own dashboard layout.
--
-- One nullable text column. NULL means "no custom layout", which is what every
-- existing row will read as, so the dashboard keeps rendering its occupation
-- default until someone actually reorders a widget. Nothing is dropped and no
-- row is rewritten.

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "dashboardLayout" VARCHAR(2000);
