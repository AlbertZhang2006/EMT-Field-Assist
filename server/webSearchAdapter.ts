// Web search abstraction for protocol discovery.
//
// Returns raw web results that the search endpoint scores and converts
// into ProtocolSearchResult objects. The adapter doesn't know about EMS
// types — it just finds web pages matching a query.
//
// Provider selection:
//   1. PROTOCOL_SEARCH_PROVIDER=mock → always mock (no web calls)
//   2. PROTOCOL_SEARCH_PROVIDER=web + PROTOCOL_SEARCH_API_KEY + PROTOCOL_SEARCH_ENDPOINT → custom endpoint
//   3. Legacy per-provider keys (checked in order):
//      GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CSE_ID → Google Custom Search
//      BING_SEARCH_API_KEY                          → Bing Web Search v7
//      SERPAPI_API_KEY                               → SerpAPI
//   4. (none)                                        → mock results

import { getSearchConfig } from './config.ts';

// ============================================================
// Public types
// ============================================================

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  displayUrl?: string;
}

// ============================================================
// Provider detection
// ============================================================

type Provider = 'google' | 'bing' | 'serpapi' | 'custom' | 'mock';

function detectProvider(): Provider {
  const config = getSearchConfig();
  if (config.provider === 'mock') return 'mock';
  if (config.apiKey && config.endpoint) return 'custom';
  if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CSE_ID) return 'google';
  if (process.env.BING_SEARCH_API_KEY) return 'bing';
  if (process.env.SERPAPI_API_KEY) return 'serpapi';
  return 'mock';
}

// ============================================================
// Mock search
// ============================================================

const MOCK_WEB_RESULTS: Record<string, WebSearchResult[]> = {
  _default: [
    {
      url: 'https://www.health.ny.gov/professionals/ems/policy/protocols.htm',
      title: 'NYS EMS Statewide BLS & ALS Protocols — NY Department of Health',
      snippet: 'Official New York State EMS protocols for BLS and ALS providers. Updated 2024. Includes cardiac, medical, trauma, pediatric, and behavioral emergency treatment protocols.',
    },
    {
      url: 'https://www.mass.gov/lists/statewide-treatment-protocols',
      title: 'Statewide Treatment Protocols | Mass.gov',
      snippet: 'Massachusetts Office of EMS statewide pre-hospital treatment protocols. Version 7.0 effective December 2023. EMT, AEMT, and Paramedic levels.',
    },
    {
      url: 'https://portal.ct.gov/dph/ems/ems-protocols',
      title: 'EMS Protocols — Connecticut DPH',
      snippet: 'Connecticut statewide EMS protocols covering BLS and ALS operations. 2025 edition. Medical, trauma, obstetric, pediatric, and environmental emergencies.',
    },
    {
      url: 'https://www.health.pa.gov/topics/EMS/Pages/Protocols.aspx',
      title: 'EMS Protocols — PA Department of Health',
      snippet: 'Pennsylvania statewide BLS and ALS treatment protocols with standing orders and pharmacology reference. Version 2024.3.',
    },
    {
      url: 'https://emsa.ca.gov/treatment-guidelines/',
      title: 'Model Treatment Guidelines — California EMSA',
      snippet: 'California Emergency Medical Services Authority model treatment guidelines. Individual LEMSAs may adopt with modifications. Updated 2023.',
    },
    {
      url: 'https://www.dshs.texas.gov/ems/clinical-practice-guidelines',
      title: 'EMS Clinical Practice Guidelines — TX DSHS',
      snippet: 'Texas Department of State Health Services EMS clinical practice guidelines. Statewide advisory guidelines. 2024 edition.',
    },
    {
      url: 'https://file.lacounty.gov/SDSInter/dhs/1070348_EMSTreatmentGuidelines2024.pdf',
      title: 'LA County EMS Treatment Guidelines 2024 (PDF)',
      snippet: 'Los Angeles County DHS EMS Agency treatment guidelines. Revision 2024-R1. Scope of practice, treatment protocols, base hospital contact procedures.',
    },
    {
      url: 'https://www.westchesterremsco.com/protocols',
      title: 'Westchester REMSCO — Regional EMS Protocols',
      snippet: 'Westchester County Regional EMS Council protocols supplementing NY State. County-specific standing orders, destination policies, medical direction contacts. 2024.',
    },
    // Lower-quality results that scoring should penalize
    {
      url: 'https://www.reddit.com/r/ems/comments/abc123/anyone_have_ny_protocols_pdf/',
      title: 'Anyone have NY protocols PDF? : r/ems',
      snippet: 'Discussion thread asking for protocol documents. Various links shared by users, may be outdated.',
    },
    {
      url: 'https://www.scribd.com/document/123456/State-EMS-Protocols-Copy',
      title: 'State EMS Protocols (Copy) — Scribd',
      snippet: 'Uploaded copy of state EMS protocols. Unknown version, undated. May not reflect current edition.',
    },
    {
      url: 'https://www.coursehero.com/file/p123/ems-protocol-study-guide/',
      title: 'EMS Protocol Study Guide — Course Hero',
      snippet: 'Study guide and flashcards based on EMS protocols. Not an official source. For exam preparation only.',
    },
  ],
};

function buildQueryVariant(query: string): string {
  return `${query} EMS protocols site:.gov OR site:.us`;
}

async function searchMock(query: string): Promise<WebSearchResult[]> {
  await new Promise((r) => setTimeout(r, 300));

  const q = query.toLowerCase();
  const results = MOCK_WEB_RESULTS._default;

  return results.filter((r) =>
    r.title.toLowerCase().includes(q) ||
    r.snippet.toLowerCase().includes(q) ||
    r.url.toLowerCase().includes(q)
  );
}

// ============================================================
// Google Custom Search
//
// Docs: https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list
// Requires: GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_CSE_ID
// Free tier: 100 queries/day
// ============================================================

interface GoogleItem { link: string; title: string; snippet: string; displayLink?: string }
interface GoogleResponse { items?: GoogleItem[] }

async function searchGoogle(query: string): Promise<WebSearchResult[]> {
  const key = process.env.GOOGLE_SEARCH_API_KEY!;
  const cx = process.env.GOOGLE_SEARCH_CSE_ID!;
  const q = buildQueryVariant(query);

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', q);
  url.searchParams.set('num', '10');

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Google Search API error: ${res.status}`);
  }

  const data = await res.json() as GoogleResponse;

  return (data.items ?? []).map((item) => ({
    url: item.link,
    title: item.title,
    snippet: item.snippet,
    displayUrl: item.displayLink,
  }));
}

// ============================================================
// Bing Web Search v7
//
// Docs: https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/reference/endpoints
// Requires: BING_SEARCH_API_KEY
// Free tier: 1000 calls/month (S1: 1000/second)
// ============================================================

interface BingWebPage { url: string; name: string; snippet: string; displayUrl?: string }
interface BingResponse { webPages?: { value: BingWebPage[] } }

async function searchBing(query: string): Promise<WebSearchResult[]> {
  const key = process.env.BING_SEARCH_API_KEY!;
  const q = buildQueryVariant(query);

  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', q);
  url.searchParams.set('count', '10');
  url.searchParams.set('responseFilter', 'Webpages');

  const res = await fetch(url.toString(), {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Bing Search API error: ${res.status}`);
  }

  const data = await res.json() as BingResponse;

  return (data.webPages?.value ?? []).map((page) => ({
    url: page.url,
    title: page.name,
    snippet: page.snippet,
    displayUrl: page.displayUrl,
  }));
}

// ============================================================
// SerpAPI
//
// Docs: https://serpapi.com/search-api
// Requires: SERPAPI_API_KEY
// Free tier: 100 searches/month
// ============================================================

interface SerpResult { link: string; title: string; snippet: string; displayed_link?: string }
interface SerpResponse { organic_results?: SerpResult[] }

async function searchSerpApi(query: string): Promise<WebSearchResult[]> {
  const key = process.env.SERPAPI_API_KEY!;
  const q = buildQueryVariant(query);

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('api_key', key);
  url.searchParams.set('q', q);
  url.searchParams.set('num', '10');
  url.searchParams.set('engine', 'google');

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`SerpAPI error: ${res.status}`);
  }

  const data = await res.json() as SerpResponse;

  return (data.organic_results ?? []).map((item) => ({
    url: item.link,
    title: item.title,
    snippet: item.snippet,
    displayUrl: item.displayed_link,
  }));
}

// ============================================================
// Custom endpoint
//
// Uses PROTOCOL_SEARCH_API_KEY + PROTOCOL_SEARCH_ENDPOINT.
// Expects a JSON response with an array of results at the top level
// or under a "results" / "items" / "webPages.value" key.
// ============================================================

interface GenericSearchResponse {
  results?: { url: string; title: string; snippet: string }[];
  items?: { link: string; title: string; snippet: string }[];
  webPages?: { value: { url: string; name: string; snippet: string }[] };
}

async function searchCustomEndpoint(query: string): Promise<WebSearchResult[]> {
  const config = getSearchConfig();
  if (!config.apiKey || !config.endpoint) {
    throw new Error('Custom endpoint search requires PROTOCOL_SEARCH_API_KEY and PROTOCOL_SEARCH_ENDPOINT');
  }

  const q = buildQueryVariant(query);
  const url = new URL(config.endpoint);
  url.searchParams.set('q', q);

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Custom search endpoint error: ${res.status}`);
  }

  const data = await res.json() as GenericSearchResponse;

  if (data.results) {
    return data.results.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet }));
  }
  if (data.items) {
    return data.items.map((r) => ({ url: r.link, title: r.title, snippet: r.snippet }));
  }
  if (data.webPages?.value) {
    return data.webPages.value.map((r) => ({ url: r.url, title: r.name, snippet: r.snippet }));
  }

  return [];
}

// ============================================================
// Public API
// ============================================================

const PROVIDER_FNS: Record<Provider, (query: string) => Promise<WebSearchResult[]>> = {
  google: searchGoogle,
  bing: searchBing,
  serpapi: searchSerpApi,
  custom: searchCustomEndpoint,
  mock: searchMock,
};

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const provider = detectProvider();
  try {
    return await PROVIDER_FNS[provider](query);
  } catch (err) {
    if (provider !== 'mock') {
      console.warn(`Web search (${provider}) failed, falling back to mock:`, err);
      return searchMock(query);
    }
    throw err;
  }
}

export function getActiveProvider(): string {
  return detectProvider();
}
