import { Global, Module } from '@nestjs/common';

import { FILE_STORAGE } from './file-storage.interface';
import { LocalFileStorage } from './local-file.storage';

@Global()
@Module({
  providers: [
    LocalFileStorage,
    { provide: FILE_STORAGE, useExisting: LocalFileStorage },
  ],
  exports: [FILE_STORAGE, LocalFileStorage],
})
export class StorageModule {}
