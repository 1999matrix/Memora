import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('normalizes names', () => {
    expect(generateSlug(' Acme Corp! ')).toBe('acme-corp');
  });
});
