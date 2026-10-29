export const EMBEDDING_DIMENSIONS = 1536;

export const DOCUMENT_QUEUE = 'document-processing';
export const CONNECTOR_SYNC_QUEUE = 'connector-sync';
export const SUMMARY_QUEUE = 'summary-generation';

/** Recent turns kept verbatim in the prompt (not the whole thread). */
export const RECENT_MESSAGE_LIMIT = 8;

/** Refresh rolling summary after this many new messages since last summary. */
export const SUMMARY_REFRESH_EVERY = 10;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
