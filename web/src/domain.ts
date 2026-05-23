const COMMON_TWO_PART_TLDS = new Set([
  'co.uk', 'com.cn', 'co.jp', 'com.au', 'co.nz',
  'ac.uk', 'or.jp', 'ne.jp', 'go.jp', 'net.cn',
  'gov.cn', 'org.cn', 'com.tw', 'co.kr', 'com.br',
  'co.in', 'com.mx', 'com.hk', 'co.id', 'co.th',
  'com.sg', 'co.za', 'com.my', 'com.vn', 'co.il',
  'org.uk', 'net.uk', 'gov.uk', 'org.au', 'net.au',
  'com.ar', 'com.tr', 'com.ua', 'co.ve', 'com.co',
  'com.ve', 'com.ec', 'com.pe', 'com.bo', 'com.py',
  'org.br', 'net.br', 'gov.br', 'com.ph', 'com.ng',
  'co.ke', 'co.ug', 'co.tz', 'com.gh', 'com.pk',
  'com.bd', 'com.np', 'com.lk', 'com.mm', 'com.kh',
]);

/**
 * Strip port number from a hostname if present.
 */
function stripPort(host: string): string {
  const colon = host.lastIndexOf(':');
  if (colon === -1) return host;
  // IPv6 bracket notation — ignore
  if (host.startsWith('[')) return host;
  const after = host.slice(colon + 1);
  if (/^\d+$/.test(after)) return host.slice(0, colon);
  return host;
}

/**
 * Check if a string looks like an IPv4 address.
 */
function isIPv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Extract the main domain (eTLD+1 simplified) from a hostname.
 *
 * Examples:
 *   - "example.com" → "example.com"
 *   - "www.example.com" → "example.com"
 *   - "blog.example.co.uk" → "example.co.uk"
 *   - null | "" → ""
 */
export function getMainDomain(host: string | null): string {
  if (!host) return '';
  let h = stripPort(host.trim().toLowerCase());
  if (!h || isIPv4(h)) return h;

  const parts = h.split('.');
  if (parts.length <= 1) return h;

  // Check for common two-part TLDs (e.g. co.uk, com.cn)
  if (parts.length >= 3) {
    const tld2 = parts.slice(-2).join('.');
    if (COMMON_TWO_PART_TLDS.has(tld2)) {
      return parts.slice(-3).join('.');
    }
  }

  return parts.slice(-2).join('.');
}

/**
 * Get the subdomain label relative to the main domain.
 * Returns null if the host itself is the main domain (no subdomain).
 */
export function getSubdomainLabel(host: string | null): string | null {
  if (!host) return null;
  const main = getMainDomain(host);
  let h = stripPort(host.trim().toLowerCase());
  if (!h || isIPv4(h)) return null;
  if (h === main) return null;
  const prefix = h.slice(0, -main.length - 1); // remove ".${main}"
  return prefix || null;
}
