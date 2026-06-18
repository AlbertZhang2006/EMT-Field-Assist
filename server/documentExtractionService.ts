// Document extraction abstraction for protocol import pipeline.
//
// Sits between "fetch the document" and "parse into ProtocolSections."
// Extracts raw text and detects metadata (title, version, effective date)
// from various source formats.
//
// Extraction methods:
//   extractFromPastedText(text)    — fully implemented, local
//   extractFromPdfUrl(url)         — mock; TODO: pdf-parse / pdfjs-dist / cloud OCR
//   extractFromHtmlUrl(url)        — mock; TODO: cheerio / Playwright
//   extractFromUploadedPdf(buffer) — mock; TODO: pdf-parse on raw buffer

// ============================================================
// Public types
// ============================================================

type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractionResult {
  rawText: string;
  title: string | null;
  detectedVersion: string | null;
  detectedEffectiveDate: string | null;
  extractionConfidence: ExtractionConfidence;
  sourceFormat: 'pdf_url' | 'html_url' | 'uploaded_pdf' | 'pasted_text';
  pageCount?: number;
  wordCount: number;
}

export class ExtractionError extends Error {
  constructor(message: string, public readonly userMessage: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// ============================================================
// Metadata detection — shared across all extraction methods
// ============================================================

const VERSION_PATTERNS = [
  /\bv(?:ersion)?\s*(\d+(?:\.\d+){0,3})\b/i,
  /\brev(?:ision)?\s*(\d+(?:\.\d+){0,3})\b/i,
  /\bedition\s*(\d+(?:\.\d+){0,2})\b/i,
  /\b(\d{4})[.\-]([A-Z]\d?)\b/,
  /\b(\d{4}(?:\.\d+){1,2})\b/,
];

const DATE_PATTERNS = [
  /\beffective\s*(?:date)?[:\s]*(\w+\s+\d{1,2},?\s+\d{4})\b/i,
  /\beffective\s*(?:date)?[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i,
  /\beffective\s*(?:date)?[:\s]*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i,
  /\bupdated?\s*[:\s]*(\w+\s+\d{1,2},?\s+\d{4})\b/i,
  /\bdate[:\s]+(\w+\s+\d{1,2},?\s+\d{4})\b/i,
  /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i,
];

const TITLE_STOP_PATTERNS = [
  /^table of contents/i,
  /^copyright/i,
  /^\d+\./,
  /^page\s+\d/i,
  /^section\s+\d/i,
  /^chapter\s+\d/i,
];

function detectVersion(text: string): string | null {
  const header = text.slice(0, 2000);
  for (const re of VERSION_PATTERNS) {
    const m = header.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

function detectEffectiveDate(text: string): string | null {
  const header = text.slice(0, 3000);
  for (const re of DATE_PATTERNS) {
    const m = header.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function detectTitle(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines.slice(0, 10)) {
    if (TITLE_STOP_PATTERNS.some(re => re.test(line))) continue;
    if (line.length < 5 || line.length > 120) continue;
    if (/^[-=_*#]{3,}$/.test(line)) continue;

    const cleaned = line.replace(/^#{1,3}\s*/, '').trim();
    if (cleaned.length >= 5) return cleaned;
  }

  return null;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ============================================================
// extractFromPastedText — fully implemented
// ============================================================

export function extractFromPastedText(text: string): ExtractionResult {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new ExtractionError(
      'Empty text input',
      'No text provided. Please paste protocol text and try again.',
    );
  }

  if (trimmed.length < 20) {
    throw new ExtractionError(
      `Text too short: ${trimmed.length} chars`,
      'Text is too short to extract a protocol. Please paste the full protocol content.',
    );
  }

  const title = detectTitle(trimmed);
  const version = detectVersion(trimmed);
  const effectiveDate = detectEffectiveDate(trimmed);
  const wordCount = countWords(trimmed);

  let confidence: ExtractionConfidence;
  let signals = 0;
  if (title) signals++;
  if (version) signals++;
  if (effectiveDate) signals++;
  if (wordCount > 200) signals++;
  if (/\b(?:ems|protocol|treatment|pre-?hospital)\b/i.test(trimmed)) signals++;

  if (signals >= 4) {
    confidence = 'high';
  } else if (signals >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    rawText: trimmed,
    title,
    detectedVersion: version,
    detectedEffectiveDate: effectiveDate,
    extractionConfidence: confidence,
    sourceFormat: 'pasted_text',
    wordCount,
  };
}

// ============================================================
// extractFromPdfUrl — mock
//
// TODO: Implement real PDF extraction:
//   1. Fetch the PDF with fetch() / undici (respect robots.txt, rate limit)
//   2. Extract text with pdf-parse or pdfjs-dist
//   3. For scanned PDFs, use cloud OCR (Google Document AI, AWS Textract)
//   4. Detect page count, title from PDF metadata, version/date from text
//   5. Set confidence based on text quality (OCR confidence, character noise)
// ============================================================

export async function extractFromPdfUrl(url: string): Promise<ExtractionResult> {
  if (!url || !url.startsWith('http')) {
    throw new ExtractionError(
      `Invalid PDF URL: ${url}`,
      'Invalid URL. Please provide a direct link to a PDF document.',
    );
  }

  await new Promise(r => setTimeout(r, 400));

  const filename = decodeURIComponent(url.split('/').pop() ?? 'document.pdf')
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  return {
    rawText: [
      `[Mock PDF extraction from ${url}]`,
      '',
      `${filename}`,
      'Version 2024.1',
      'Effective Date: January 1, 2024',
      '',
      'CHEST PAIN / ACS',
      'Consider 12-lead ECG if available.',
      'Consider aspirin 324 mg PO if no contraindications.',
      'Consider nitroglycerin if SBP > 100 — verify per local protocol.',
      '',
      'RESPIRATORY DISTRESS',
      'Consider O2 to maintain SpO2 > 94%.',
      'Consider nebulized albuterol for bronchospasm.',
      '',
      'TRAUMA',
      'Consider primary survey: ABCDE.',
      'Consider direct pressure for hemorrhage.',
      '',
      '[End of mock extraction — replace with real PDF parsing]',
    ].join('\n'),
    title: filename || null,
    detectedVersion: '2024.1',
    detectedEffectiveDate: 'January 1, 2024',
    extractionConfidence: 'low',
    sourceFormat: 'pdf_url',
    pageCount: 12,
    wordCount: 65,
  };
}

// ============================================================
// extractFromHtmlUrl — mock
//
// TODO: Implement real HTML extraction:
//   1. Fetch the page with fetch() (or Playwright for JS-rendered pages)
//   2. Parse with cheerio or JSDOM
//   3. Strip nav/header/footer/sidebar — extract main content
//   4. Convert tables to text, preserve heading hierarchy
//   5. Detect title from <title> or <h1>, version/date from content
//   6. Set confidence based on content structure quality
// ============================================================

export async function extractFromHtmlUrl(url: string): Promise<ExtractionResult> {
  if (!url || !url.startsWith('http')) {
    throw new ExtractionError(
      `Invalid HTML URL: ${url}`,
      'Invalid URL. Please provide a link to a protocol webpage.',
    );
  }

  await new Promise(r => setTimeout(r, 400));

  const hostname = new URL(url).hostname.replace('www.', '');

  return {
    rawText: [
      `[Mock HTML extraction from ${url}]`,
      '',
      `EMS Protocols — ${hostname}`,
      'Updated 2024',
      '',
      'CHEST PAIN / ACS',
      'Consider 12-lead ECG.',
      'Consider aspirin 324 mg PO.',
      '',
      'RESPIRATORY DISTRESS',
      'Consider supplemental oxygen.',
      'Consider albuterol nebulizer.',
      '',
      '[End of mock extraction — replace with real HTML parsing]',
    ].join('\n'),
    title: `EMS Protocols — ${hostname}`,
    detectedVersion: null,
    detectedEffectiveDate: null,
    extractionConfidence: 'low',
    sourceFormat: 'html_url',
    wordCount: 40,
  };
}

// ============================================================
// extractFromUploadedPdf — mock
//
// TODO: Implement real uploaded PDF extraction:
//   1. Accept Buffer or Uint8Array from multipart upload
//   2. Extract text with pdf-parse or pdfjs-dist
//   3. For scanned documents, route to cloud OCR
//   4. Same metadata detection as extractFromPdfUrl
//   5. Validate file size (reject > 50MB), page count (warn > 100 pages)
// ============================================================

export async function extractFromUploadedPdf(
  buffer: Buffer | Uint8Array,
  filename?: string,
): Promise<ExtractionResult> {
  if (!buffer || buffer.byteLength === 0) {
    throw new ExtractionError(
      'Empty PDF buffer',
      'The uploaded file appears to be empty. Please try uploading again.',
    );
  }

  if (buffer.byteLength > 50 * 1024 * 1024) {
    throw new ExtractionError(
      `PDF too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`,
      'File is too large (max 50MB). Try a smaller document or paste the text directly.',
    );
  }

  await new Promise(r => setTimeout(r, 400));

  const name = filename?.replace(/\.pdf$/i, '') ?? 'Uploaded Protocol';

  return {
    rawText: [
      `[Mock PDF upload extraction: ${name}]`,
      '',
      `${name}`,
      '',
      'CHEST PAIN / ACS',
      'Consider 12-lead ECG if available.',
      'Consider aspirin 324 mg PO if no contraindications.',
      '',
      'RESPIRATORY DISTRESS',
      'Consider O2 to maintain SpO2 > 94%.',
      '',
      '[End of mock extraction — replace with real PDF parsing]',
    ].join('\n'),
    title: name,
    detectedVersion: null,
    detectedEffectiveDate: null,
    extractionConfidence: 'low',
    sourceFormat: 'uploaded_pdf',
    pageCount: 1,
    wordCount: 35,
  };
}
