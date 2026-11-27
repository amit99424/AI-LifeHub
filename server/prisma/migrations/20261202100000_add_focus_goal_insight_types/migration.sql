-- Additive: two new insight types for study/work progress and goals.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older
-- PostgreSQL, so each value is added on its own statement.
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'FOCUS';
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'GOALS';
