-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('GOOGLE_DRIVE', 'GITHUB', 'NOTION', 'CONFLUENCE', 'JIRA', 'SLACK', 'SHAREPOINT', 'POSTGRESQL');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'SYNCING', 'ERROR');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "connectorId" TEXT,
ADD COLUMN "externalId" TEXT,
ADD COLUMN "contentHash" TEXT;

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConnectorType" NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "syncCursor" TEXT,
    "lastError" TEXT,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSyncItem" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "documentId" TEXT,
    "externalId" TEXT NOT NULL,
    "externalUpdatedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorSyncItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connector_workspaceId_idx" ON "Connector"("workspaceId");

-- CreateIndex
CREATE INDEX "Connector_organizationId_type_idx" ON "Connector"("organizationId", "type");

-- CreateIndex
CREATE INDEX "ConnectorSyncItem_connectorId_lastSyncedAt_idx" ON "ConnectorSyncItem"("connectorId", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSyncItem_connectorId_externalId_key" ON "ConnectorSyncItem"("connectorId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_connectorId_externalId_key" ON "Document"("connectorId", "externalId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncItem" ADD CONSTRAINT "ConnectorSyncItem_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncItem" ADD CONSTRAINT "ConnectorSyncItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
