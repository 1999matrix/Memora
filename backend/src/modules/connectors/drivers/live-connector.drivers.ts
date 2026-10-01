import { Logger } from '@nestjs/common';
import { Pool } from 'pg';

import { ConnectorType } from '../../../generated/prisma/client';
import {
  Connector,
  ConnectorContext,
  ConnectorRemoteItem,
} from '../connector.interface';
import { hasLiveConnectorConfig } from '../connector-credentials.util';

function cfgStr(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Connector config missing "${key}"`);
  }
  return v.trim();
}

function decodeBase64Content(encoded: string): string {
  return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
}

async function httpJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body) as T;
}

export abstract class LiveConnectorBase implements Connector {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly type: ConnectorType;

  canSync(ctx: ConnectorContext): boolean {
    return hasLiveConnectorConfig(this.type, ctx.config);
  }

  async connect(ctx: ConnectorContext): Promise<void> {
    this.logger.log(`connect ${this.type} connector=${ctx.connectorId}`);
  }

  async disconnect(ctx: ConnectorContext): Promise<void> {
    this.logger.log(`disconnect ${this.type} connector=${ctx.connectorId}`);
  }

  async testConnection(ctx: ConnectorContext): Promise<boolean> {
    if (!this.canSync(ctx)) {
      return false;
    }
    try {
      const result = await this.sync(ctx);
      return result.items.length >= 0;
    } catch {
      return false;
    }
  }

  abstract sync(ctx: ConnectorContext): Promise<{
    items: ConnectorRemoteItem[];
    deletedExternalIds: string[];
    nextCursor: string | null;
  }>;
}

export class GithubConnectorDriver extends LiveConnectorBase {
  readonly type = 'GITHUB' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const token = cfgStr(ctx.config, 'token');
    const owner = cfgStr(ctx.config, 'owner');
    const repo = cfgStr(ctx.config, 'repo');
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const items: ConnectorRemoteItem[] = [];

    const readme = await httpJson<{ content?: string; sha?: string }>(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers },
    );
    if (readme.content) {
      const text = decodeBase64Content(readme.content);
      items.push({
        externalId: `github-${owner}-${repo}-readme`,
        name: 'README.md',
        content: text,
        mimeType: 'text/markdown',
        externalUpdatedAt: new Date(),
        metadata: { source: 'github', sha: readme.sha },
      });
    }

    type GhFile = { name: string; path: string; sha: string; type: string };
    const tree = await httpJson<GhFile[]>(
      `https://api.github.com/repos/${owner}/${repo}/contents`,
      { headers },
    );

    for (const entry of tree.filter((e) => e.type === 'file')) {
      if (!/\.(md|txt)$/i.test(entry.name)) {
        continue;
      }
      const file = await httpJson<{ content?: string }>(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(entry.path)}`,
        { headers },
      );
      if (!file.content) continue;
      items.push({
        externalId: `github-${entry.sha}`,
        name: entry.name,
        content: decodeBase64Content(file.content),
        mimeType: entry.name.endsWith('.md') ? 'text/markdown' : 'text/plain',
        externalUpdatedAt: new Date(),
        metadata: { path: entry.path, sha: entry.sha },
      });
    }

    return {
      items,
      deletedExternalIds: [],
      nextCursor: new Date().toISOString(),
    };
  }
}

export class PostgresqlConnectorDriver extends LiveConnectorBase {
  readonly type = 'POSTGRESQL' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const connectionString = cfgStr(ctx.config, 'connectionString');
    const sql = cfgStr(ctx.config, 'sql');
    const pool = new Pool({ connectionString, max: 2 });
    try {
      const result = await pool.query(sql);
      const idCol =
        (typeof ctx.config.idColumn === 'string' && ctx.config.idColumn) ||
        'id';
      const nameCol =
        (typeof ctx.config.nameColumn === 'string' && ctx.config.nameColumn) ||
        'name';
      const contentCol =
        (typeof ctx.config.contentColumn === 'string' &&
          ctx.config.contentColumn) ||
        'content';

      const items: ConnectorRemoteItem[] = result.rows.map((row, i) => {
        const id = String(row[idCol] ?? `row-${i}`);
        const name = String(row[nameCol] ?? `record-${id}`);
        const content = String(row[contentCol] ?? JSON.stringify(row));
        return {
          externalId: `pg-${id}`,
          name: `${name}.txt`,
          content,
          mimeType: 'text/plain',
          externalUpdatedAt: new Date(),
          metadata: { tableRow: id },
        };
      });

      return {
        items,
        deletedExternalIds: [],
        nextCursor: new Date().toISOString(),
      };
    } finally {
      await pool.end();
    }
  }
}

export class NotionConnectorDriver extends LiveConnectorBase {
  readonly type = 'NOTION' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const token = cfgStr(ctx.config, 'token');
    const databaseId = cfgStr(ctx.config, 'databaseId');
    const headers = {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    const data = await httpJson<{ results: { id: string; last_edited_time: string; properties: Record<string, unknown> }[] }>(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      { method: 'POST', headers, body: JSON.stringify({ page_size: 50 }) },
    );

    const items: ConnectorRemoteItem[] = [];
    for (const page of data.results ?? []) {
      const text = JSON.stringify(page.properties, null, 2);
      items.push({
        externalId: `notion-${page.id}`,
        name: `notion-page-${page.id}.json`,
        content: text,
        mimeType: 'application/json',
        externalUpdatedAt: new Date(page.last_edited_time),
        metadata: { notionPageId: page.id },
      });
    }

    return {
      items,
      deletedExternalIds: [],
      nextCursor: new Date().toISOString(),
    };
  }
}

export class SlackConnectorDriver extends LiveConnectorBase {
  readonly type = 'SLACK' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const token = cfgStr(ctx.config, 'token');
    const channelId = cfgStr(ctx.config, 'channelId');
    const params = new URLSearchParams({
      channel: channelId,
      limit: '100',
    });
    if (ctx.syncCursor) {
      params.set('oldest', ctx.syncCursor);
    }

    const data = await httpJson<{
      messages?: { ts: string; text?: string; user?: string }[];
    }>(`https://slack.com/api/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const items: ConnectorRemoteItem[] = (data.messages ?? [])
      .filter((m) => m.text)
      .map((m) => ({
        externalId: `slack-${channelId}-${m.ts}`,
        name: `slack-${m.ts}.txt`,
        content: m.text ?? '',
        mimeType: 'text/plain',
        externalUpdatedAt: new Date(Number(m.ts) * 1000),
        metadata: { user: m.user, ts: m.ts },
      }));

    const newest = data.messages?.[0]?.ts ?? ctx.syncCursor;

    return {
      items,
      deletedExternalIds: [],
      nextCursor: newest,
    };
  }
}

export class JiraConnectorDriver extends LiveConnectorBase {
  readonly type = 'JIRA' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const baseUrl = cfgStr(ctx.config, 'baseUrl').replace(/\/$/, '');
    const email = cfgStr(ctx.config, 'email');
    const apiToken = cfgStr(ctx.config, 'apiToken');
    const jql =
      (typeof ctx.config.jql === 'string' && ctx.config.jql) ||
      'order by updated DESC';
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const data = await httpJson<{
      issues: {
        key: string;
        fields: { summary?: string; description?: unknown; updated?: string };
      }[];
    }>(
      `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
    );

    const items = (data.issues ?? []).map((issue) => {
      const desc =
        typeof issue.fields.description === 'string'
          ? issue.fields.description
          : JSON.stringify(issue.fields.description ?? {});
      const content = `${issue.fields.summary ?? issue.key}\n\n${desc}`;
      return {
        externalId: `jira-${issue.key}`,
        name: `${issue.key}.txt`,
        content,
        mimeType: 'text/plain',
        externalUpdatedAt: issue.fields.updated
          ? new Date(issue.fields.updated)
          : new Date(),
        metadata: { jiraKey: issue.key },
      };
    });

    return {
      items,
      deletedExternalIds: [],
      nextCursor: new Date().toISOString(),
    };
  }
}

export class ConfluenceConnectorDriver extends LiveConnectorBase {
  readonly type = 'CONFLUENCE' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const baseUrl = cfgStr(ctx.config, 'baseUrl').replace(/\/$/, '');
    const email = cfgStr(ctx.config, 'email');
    const apiToken = cfgStr(ctx.config, 'apiToken');
    const cql =
      (typeof ctx.config.cql === 'string' && ctx.config.cql) ||
      'type=page order by lastModified desc';
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const data = await httpJson<{
      results: {
        content: { id: string; title?: string };
        excerpt?: string;
      }[];
    }>(
      `${baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=50`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
    );

    const items: ConnectorRemoteItem[] = [];
    for (const row of data.results ?? []) {
      const pageId = row.content.id;
      const page = await httpJson<{
        title?: string;
        body?: { storage?: { value?: string } };
      }>(`${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });
      const html = page.body?.storage?.value ?? row.excerpt ?? '';
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      items.push({
        externalId: `confluence-${pageId}`,
        name: `${page.title ?? pageId}.txt`,
        content: text,
        mimeType: 'text/plain',
        externalUpdatedAt: new Date(),
        metadata: { confluencePageId: pageId },
      });
    }

    return {
      items,
      deletedExternalIds: [],
      nextCursor: new Date().toISOString(),
    };
  }
}

export class GoogleDriveConnectorDriver extends LiveConnectorBase {
  readonly type = 'GOOGLE_DRIVE' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const accessToken = cfgStr(ctx.config, 'accessToken');
    const folderId = cfgStr(ctx.config, 'folderId');
    const q = `'${folderId}' in parents and trashed=false`;
    const list = await httpJson<{
      files: { id: string; name: string; mimeType: string; modifiedTime?: string }[];
    }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const items: ConnectorRemoteItem[] = [];
    for (const file of list.files ?? []) {
      if (
        !file.mimeType.startsWith('text/') &&
        !/\.(md|txt)$/i.test(file.name)
      ) {
        continue;
      }
      const exported = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const content = exported.ok
        ? await exported.text()
        : await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          ).then((r) => r.text());

      items.push({
        externalId: `gdrive-${file.id}`,
        name: file.name,
        content,
        mimeType: file.mimeType,
        externalUpdatedAt: file.modifiedTime
          ? new Date(file.modifiedTime)
          : new Date(),
        metadata: { driveFileId: file.id },
      });
    }

    return {
      items,
      deletedExternalIds: [],
      nextCursor: new Date().toISOString(),
    };
  }
}

export class SharepointConnectorDriver extends LiveConnectorBase {
  readonly type = 'SHAREPOINT' as ConnectorType;

  async sync(ctx: ConnectorContext) {
    const accessToken = cfgStr(ctx.config, 'accessToken');
    const siteId = cfgStr(ctx.config, 'siteId');
    const driveId = cfgStr(ctx.config, 'driveId');
    const folderPath =
      (typeof ctx.config.folderPath === 'string' && ctx.config.folderPath) ||
      'root';

    const list = await httpJson<{
      value: { id: string; name: string; file?: { mimeType?: string }; lastModifiedDateTime?: string }[];
    }>(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${folderPath}:/children`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const items: ConnectorRemoteItem[] = [];
    for (const entry of list.value ?? []) {
      if (!entry.file) continue;
      const content = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${entry.id}/content`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ).then((r) => r.text());

      items.push({
        externalId: `sharepoint-${entry.id}`,
        name: entry.name,
        content,
        mimeType: entry.file.mimeType ?? 'text/plain',
        externalUpdatedAt: entry.lastModifiedDateTime
          ? new Date(entry.lastModifiedDateTime)
          : new Date(),
        metadata: { itemId: entry.id },
      });
    }

    return {
      items,
      deletedExternalIds: [],
      nextCursor: new Date().toISOString(),
    };
  }
}

export const LIVE_CONNECTOR_DRIVERS: LiveConnectorBase[] = [
  new GithubConnectorDriver(),
  new PostgresqlConnectorDriver(),
  new NotionConnectorDriver(),
  new SlackConnectorDriver(),
  new JiraConnectorDriver(),
  new ConfluenceConnectorDriver(),
  new GoogleDriveConnectorDriver(),
  new SharepointConnectorDriver(),
];
