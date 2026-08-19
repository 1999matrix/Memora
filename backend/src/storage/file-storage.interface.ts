export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface StoredFile {
  key: string;
  absolutePath: string;
}

export interface FileStorage {
  save(
    workspaceId: string,
    originalName: string,
    buffer: Buffer,
  ): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  absolutePath(key: string): string;
  delete(key: string): Promise<void>;
}
