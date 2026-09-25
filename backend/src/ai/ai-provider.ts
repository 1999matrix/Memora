export type AiProviderKind = 'stub' | 'openai';

export function resolveAiProvider(raw?: string): AiProviderKind {
  return raw === 'openai' ? 'openai' : 'stub';
}
