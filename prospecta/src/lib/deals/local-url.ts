/** Endereço que só funciona neste computador (localhost, rede interna). O lead não consegue abrir. */
export function isLocalUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
    if (/\.(local|localhost|test|internal|lan)$/.test(host)) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    return /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return true;
  }
}
