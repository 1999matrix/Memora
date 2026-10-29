export type AiProviderKind = 'stub' | 'openai';

/**
 * Resolves which AiClient implementation to use.
 * - `openai` — always OpenAI (requires API key at boot).
 * - `stub` — always stub.
 * - `auto` / unset — OpenAI when OPENAI_API_KEY is set, else stub.
 */
export function resolveAiProvider(
  raw?: string,
  apiKey?: string | null,
): AiProviderKind {
  const mode = raw?.trim().toLowerCase();
  if (mode === 'openai') {
    return 'openai';
  }
  if (mode === 'stub') {
    return 'stub';
  }
  return apiKey?.trim() ? 'openai' : 'stub';
}
