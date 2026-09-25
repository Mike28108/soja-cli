/** Public production SOJA API. This is configuration, not a secret. */
export const DEFAULT_SERVER_URL = 'https://soja-backend-production.up.railway.app';

/** Do not let a configured public server receive SOJA bearer credentials over cleartext HTTP. */
export function isSecureServerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const octets = hostname.split('.');
    const loopbackIpv4 = octets.length === 4 && octets[0] === '127' && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || loopbackIpv4;
  } catch {
    return false;
  }
}
