-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('TECHNICAL', 'COMMUNICATION', 'LEADERSHIP', 'BUSINESS', 'ACADEMIC', 'CREATIVE', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('PRACTICE', 'PROJECT', 'COURSE', 'CERTIFICATE', 'FEEDBACK', 'PORTFOLIO', 'NOTE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanItemKind" AS ENUM ('OBJECTIVE', 'ACTIVITY', 'MILESTONE', 'SKILL');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "skillId" UUID;

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "currentLevel" "SkillLevel" NOT NULL DEFAULT 'BEGINNER',
    "targetLevel" "SkillLevel",
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "motivation" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "achievedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillUpdate" (
    "id" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromLevel" "SkillLevel",
    "toLevel" "SkillLevel" NOT NULL,
    "note" TEXT,
    "minutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEvidence" (
    "id" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "EvidenceKind" NOT NULL DEFAULT 'NOTE',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "url" TEXT,
    "date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "horizonWeeks" INTEGER NOT NULL DEFAULT 4,
    "weeklyMinutes" INTEGER,
    "inputs" JSONB,
    "goalId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentPlanItem" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "PlanItemKind" NOT NULL DEFAULT 'ACTIVITY',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "week" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "successCriteria" TEXT,
    "skillId" UUID,
    "goalId" UUID,
    "milestoneId" UUID,
    "taskId" UUID,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevelopmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Skill_userId_status_idx" ON "Skill"("userId", "status");

-- CreateIndex
CREATE INDEX "Skill_userId_category_idx" ON "Skill"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_userId_name_key" ON "Skill"("userId", "name");

-- CreateIndex
CREATE INDEX "SkillUpdate_skillId_createdAt_idx" ON "SkillUpdate"("skillId", "createdAt");

-- CreateIndex
CREATE INDEX "SkillUpdate_userId_createdAt_idx" ON "SkillUpdate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SkillEvidence_skillId_idx" ON "SkillEvidence"("skillId");

-- CreateIndex
CREATE INDEX "SkillEvidence_userId_idx" ON "SkillEvidence"("userId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_userId_status_idx" ON "DevelopmentPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "DevelopmentPlanItem_planId_order_idx" ON "DevelopmentPlanItem"("planId", "order");

-- CreateIndex
CREATE INDEX "DevelopmentPlanItem_userId_idx" ON "DevelopmentPlanItem"("userId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillUpdate" ADD CONSTRAINT "SkillUpdate_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillUpdate" ADD CONSTRAINT "SkillUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidence" ADD CONSTRAINT "SkillEvidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidence" ADD CONSTRAINT "SkillEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlanItem" ADD CONSTRAINT "DevelopmentPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlanItem" ADD CONSTRAINT "DevelopmentPlanItem_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlanItem" ADD CONSTRAINT "DevelopmentPlanItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

