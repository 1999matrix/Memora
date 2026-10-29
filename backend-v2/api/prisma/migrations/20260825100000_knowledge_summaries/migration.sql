-- CreateEnum
CREATE TYPE "KnowledgeSummaryKind" AS ENUM ('DOCUMENT', 'WORKSPACE', 'CONNECTOR');

-- CreateTable
CREATE TABLE "KnowledgeSummary" (
    "id" TEXT NOT NULL,
    "kind" "KnowledgeSummaryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceHash" TEXT,
    "embedding" vector(1536),
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT,
    "connectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSummary_documentId_key" ON "KnowledgeSummary"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSummary_connectorId_key" ON "KnowledgeSummary"("connectorId");

-- CreateIndex
CREATE INDEX "KnowledgeSummary_workspaceId_kind_idx" ON "KnowledgeSummary"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "KnowledgeSummary_organizationId_idx" ON "KnowledgeSummary"("organizationId");

-- AddForeignKey
ALTER TABLE "KnowledgeSummary" ADD CONSTRAINT "KnowledgeSummary_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSummary" ADD CONSTRAINT "KnowledgeSummary_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSummary" ADD CONSTRAINT "KnowledgeSummary_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
