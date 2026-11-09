'use strict';

/**
 * Penerjemah teks ringan untuk pesan WhatsApp.
 *
 * Memakai endpoint publik Google Translate (tanpa API key) melalui `fetch`
 * bawaan Node. Hasil diterjemahkan di-cache di memori agar pengiriman pesan
 * berulang tidak memanggil jaringan berkali-kali. Semua error jaringan
 * dilempar sebagai Error biasa dengan pesan yang jelas.
 */

const MAX_CHUNK = 1800;
const CACHE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 8000;

// Kode bahasa yang didukung beserta namanya (untuk ditampilkan di dashboard).
const LANGUAGES = {
  auto: 'Deteksi otomatis',
  id: 'Indonesia',
  en: 'Inggris',
  ms: 'Melayu',
  ar: 'Arab',
  zh: 'Mandarin',
  ja: 'Jepang',
  ko: 'Korea',
  hi: 'Hindi',
  es: 'Spanyol',
  fr: 'Prancis',
  de: 'Jerman',
  pt: 'Portugis',
  ru: 'Rusia',
  tr: 'Turki',
  th: 'Thailand',
  vi: 'Vietnam',
  tl: 'Filipina',
  nl: 'Belanda',
  it: 'Italia',
};

const cache = new Map();

function isSupportedLang(code) {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, code);
}

/**
 * Memecah teks panjang menjadi potongan <= MAX_CHUNK tanpa memotong di tengah
 * kata bila memungkinkan.
 */
function splitIntoChunks(text, max = MAX_CHUNK) {
  const source = String(text == null ? '' : text);
  if (source.length <= max) return [source];

  const chunks = [];
  let rest = source;

  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function cacheGet(key) {
  return cache.get(key);
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

async function fetchTranslation(chunk, source, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}` +
    `&dt=t&q=${encodeURIComponent(chunk)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Beatles-WS/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Layanan terjemahan menolak permintaan (${response.status}).`);
    }

    const data = await response.json();

    const translated = Array.isArray(data?.[0])
      ? data[0].map((part) => (Array.isArray(part) ? part[0] : '')).join('')
      : '';
    const detectedSource = data?.[2] || source;

    if (!translated) {
      throw new Error('Layanan terjemahan tidak mengembalikan hasil.');
    }

    return { translated, detectedSource };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Waktu permintaan terjemahan habis. Coba lagi.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menerjemahkan teks ke bahasa tujuan.
 * @returns {Promise<{text:string, detectedSource:string, target:string}>}
 */
async function translateText(text, target, source = 'auto') {
  const clean = String(text == null ? '' : text);
  const targetLang = String(target || '').trim().toLowerCase();
  const sourceLang = String(source || 'auto').trim().toLowerCase();

  if (!clean.trim()) {
    throw new Error('Teks yang diterjemahkan tidak boleh kosong.');
  }

  if (!isSupportedLang(targetLang) || targetLang === 'auto') {
    throw new Error(`Bahasa tujuan tidak didukung: ${target || '(kosong)'}.`);
  }

  if (!isSupportedLang(sourceLang)) {
    throw new Error(`Bahasa sumber tidak didukung: ${source || '(kosong)'}.`);
  }

  const cacheKey = `${sourceLang}:${targetLang}:${clean}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const chunks = splitIntoChunks(clean);
  const parts = [];
  let detected = sourceLang;

  for (const chunk of chunks) {
    const result = await fetchTranslation(chunk, sourceLang, targetLang);
    parts.push(result.translated);
    detected = result.detectedSource || detected;
  }

  const output = {
    text: parts.join('\n'),
    detectedSource: detected,
    target: targetLang,
  };

  cacheSet(cacheKey, output);
  return output;
}

module.exports = {
  LANGUAGES,
  isSupportedLang,
  splitIntoChunks,
  translateText,
};
