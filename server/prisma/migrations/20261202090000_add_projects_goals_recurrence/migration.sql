-- CreateEnum
CREATE TYPE "RecurrenceRule" AS ENUM ('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('STUDY', 'WORK', 'CLIENT', 'BUSINESS', 'JOB_SEARCH', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'PAUSED', 'ABANDONED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "goalId" UUID,
ADD COLUMN     "parentId" UUID,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "recurrence" "RecurrenceRule" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "recurrenceEvery" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "recurrenceSource" UUID,
ADD COLUMN     "recurrenceUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "projectId" UUID;

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ProjectKind" NOT NULL DEFAULT 'WORK',
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "code" TEXT,
    "color" TEXT,
    "deadline" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "metric" TEXT,
    "target" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "deadline" TIMESTAMP(3),
    "achievedAt" TIMESTAMP(3),
    "projectId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionBreak" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "seconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_status_idx" ON "Project"("userId", "status");

-- CreateIndex
CREATE INDEX "Project_userId_archivedAt_idx" ON "Project"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "Project_userId_kind_idx" ON "Project"("userId", "kind");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "Goal_userId_projectId_idx" ON "Goal"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Milestone_goalId_idx" ON "Milestone"("goalId");

-- CreateIndex
CREATE INDEX "Milestone_userId_idx" ON "Milestone"("userId");

-- CreateIndex
CREATE INDEX "SessionBreak_sessionId_idx" ON "SessionBreak"("sessionId");

-- CreateIndex
CREATE INDEX "SessionBreak_userId_idx" ON "SessionBreak"("userId");

-- CreateIndex
CREATE INDEX "Task_userId_projectId_idx" ON "Task"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- CreateIndex
CREATE INDEX "Task_userId_goalId_idx" ON "Task"("userId", "goalId");

-- CreateIndex
CREATE INDEX "WorkSession_userId_projectId_idx" ON "WorkSession"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionBreak" ADD CONSTRAINT "SessionBreak_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

