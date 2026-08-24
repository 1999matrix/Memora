# Connector stubs (Phase 5)

Drivers live in `src/modules/connectors/drivers/stub-connector.driver.ts`.

Replace per `ConnectorType` with real clients:

| Type | Hint |
|------|------|
| GITHUB | Octokit; list repo files / issues; use `updated_at` + content hash |
| GOOGLE_DRIVE | Drive API v3; changes.list for incremental cursor |
| NOTION | Notion API search + block children |
| CONFLUENCE | REST content search with `next` cursor |
| JIRA | JQL + changelog since timestamp |
| SLACK | conversations.history; respect retention |
| SHAREPOINT | Microsoft Graph drives/items delta |
| POSTGRESQL | read-only SQL views; watermark on `updated_at` |

Keep returning `{ items, deletedExternalIds, nextCursor }` so `ConnectorSyncService` incremental logic stays unchanged.

Never put API tokens in `config` JSON long-term — use a secrets vault / env mapping keyed by connector id.
