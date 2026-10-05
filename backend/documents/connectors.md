# Connectors

Each PRD connector type is registered in `ConnectorRegistry`. **Demo mode** (default when credentials are missing): `DelegatingConnectorDriver` falls back to `StubConnectorDriver` (`config.mode: "demo"` or `config.useStub: true` forces stub).

## Live config (examples)

| Type | Required `config` fields |
|------|-------------------------|
| `GITHUB` | `token`, `owner`, `repo` |
| `POSTGRESQL` | `connectionString`, `sql` — optional `idColumn`, `nameColumn`, `contentColumn` |
| `NOTION` | `token`, `databaseId` |
| `SLACK` | `token`, `channelId` |
| `JIRA` | `baseUrl`, `email`, `apiToken` — optional `jql` |
| `CONFLUENCE` | `baseUrl`, `email`, `apiToken` — optional `cql` |
| `GOOGLE_DRIVE` | `accessToken`, `folderId` |
| `SHAREPOINT` | `accessToken`, `siteId`, `driveId` — optional `folderPath` |

Credentials are stored in connector `config` JSON (encrypt at rest in production — see PRD).

After create, call **Test connection** and **Sync**; changed items are ingested through the document pipeline (real embeddings when OpenAI is enabled).
