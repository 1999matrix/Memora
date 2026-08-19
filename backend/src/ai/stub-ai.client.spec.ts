import { EMBEDDING_DIMENSIONS } from '../common/constants/rag.constants';
import { StubAiClient } from './stub-ai.client';

describe('StubAiClient', () => {
  const client = new StubAiClient();

  it('embeds to fixed dimensions', async () => {
    const [vec] = await client.embed(['hello memora']);
    expect(vec).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('chunks text into ordered windows', async () => {
    const text = 'word '.repeat(500);
    const chunks = await client.chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
  });
});
