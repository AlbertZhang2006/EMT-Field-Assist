export type SearchProvider = 'mock' | 'web';

export interface SearchConfig {
  provider: SearchProvider;
  apiKey: string | null;
  endpoint: string | null;
  ready: boolean;
  fallbackReason: string | null;
}

export function getSearchConfig(): SearchConfig {
  const raw = (process.env.PROTOCOL_SEARCH_PROVIDER ?? 'mock').toLowerCase().trim();
  const provider: SearchProvider = raw === 'web' ? 'web' : 'mock';
  const apiKey = process.env.PROTOCOL_SEARCH_API_KEY?.trim() || null;
  const endpoint = process.env.PROTOCOL_SEARCH_ENDPOINT?.trim() || null;

  if (provider === 'mock') {
    return { provider: 'mock', apiKey: null, endpoint: null, ready: true, fallbackReason: null };
  }

  const hasLegacyKeys =
    !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CSE_ID) ||
    !!process.env.BING_SEARCH_API_KEY ||
    !!process.env.SERPAPI_API_KEY;

  if (apiKey && endpoint) {
    return { provider: 'web', apiKey, endpoint, ready: true, fallbackReason: null };
  }

  if (hasLegacyKeys) {
    return { provider: 'web', apiKey: null, endpoint: null, ready: true, fallbackReason: null };
  }

  return {
    provider: 'mock',
    apiKey: null,
    endpoint: null,
    ready: false,
    fallbackReason: 'PROTOCOL_SEARCH_PROVIDER=web but no API key/endpoint configured. Set PROTOCOL_SEARCH_API_KEY + PROTOCOL_SEARCH_ENDPOINT, or a provider-specific key (GOOGLE_SEARCH_API_KEY, BING_SEARCH_API_KEY, SERPAPI_API_KEY). Falling back to mock.',
  };
}

export function logSearchConfig(): void {
  const config = getSearchConfig();

  if (config.fallbackReason) {
    console.warn(`[config] ${config.fallbackReason}`);
    return;
  }

  if (config.provider === 'mock') {
    console.log('[config] Search provider: mock (curated index only)');
  } else {
    const source = config.endpoint ? 'custom endpoint' : 'legacy provider keys';
    console.log(`[config] Search provider: web (${source})`);
  }
}
