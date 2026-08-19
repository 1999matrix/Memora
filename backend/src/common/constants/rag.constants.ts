export const EMBEDDING_DIMENSIONS = 1536;

export const DOCUMENT_QUEUE = 'document-processing';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
