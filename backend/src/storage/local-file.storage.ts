import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, promises as fs } from 'fs';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

import { FileStorage, StoredFile } from './file-storage.interface';

@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root =
      config.get<string>('storage.root') ||
      join(process.cwd(), 'storage');
  }

  async save(
    workspaceId: string,
    originalName: string,
    buffer: Buffer,
  ): Promise<StoredFile> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = join(workspaceId, `${randomUUID()}-${safeName}`).replace(
      /\\/g,
      '/',
    );
    const absolutePath = this.absolutePath(key);
    await fs.mkdir(dirname(absolutePath), { recursive: true });
    await pipeline(Readable.from(buffer), createWriteStream(absolutePath));
    return { key, absolutePath };
  }

  absolutePath(key: string): string {
    return join(this.root, key);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.absolutePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.absolutePath(key)).catch(() => undefined);
  }
}
