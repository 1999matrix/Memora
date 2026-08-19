import { createHash } from 'crypto';

import { hashToken } from './token.util';

describe('token.util', () => {
  it('hashes tokens with sha256', () => {
    const token = 'refresh-token';
    expect(hashToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });
});
