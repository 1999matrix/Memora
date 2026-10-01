import { resolveAiProvider } from './ai-provider';

describe('resolveAiProvider', () => {
  it('forces stub', () => {
    expect(resolveAiProvider('stub', 'sk-test')).toBe('stub');
  });

  it('forces openai', () => {
    expect(resolveAiProvider('openai', '')).toBe('openai');
  });

  it('auto picks openai when key present', () => {
    expect(resolveAiProvider('auto', 'sk-test')).toBe('openai');
    expect(resolveAiProvider(undefined, 'sk-test')).toBe('openai');
  });

  it('auto picks stub without key', () => {
    expect(resolveAiProvider('auto', '')).toBe('stub');
    expect(resolveAiProvider(undefined, undefined)).toBe('stub');
  });
});
