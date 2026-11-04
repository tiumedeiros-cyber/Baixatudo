import {
  ProviderError,
  phoneVariants,
  toJid,
  type ProviderStatus,
  type WhatsAppProvider,
} from "./provider";

/**
 * Cliente do GOWA (go-whatsapp-web-multidevice, em cima da biblioteca whatsmeow, em Go).
 * Endpoints conferidos no openapi.yaml do projeto em 2026-10-22:
 *   GET  /app/status        → { results: { is_connected, is_logged_in, device_id, jid } }
 *   POST /send/message      → { phone, message }  → { results: { message_id } }
 *   POST /send/chat-presence→ { phone, action: "start" | "stop" }
 *   GET  /user/check?phone= → { results: { is_on_whatsapp } }
 * Autenticação: Basic (opcional) e cabeçalho X-Device-Id quando há mais de um aparelho.
 */

export interface GowaOptions {
  baseUrl: string;
  /** "usuario:senha", se o GOWA foi iniciado com --basic-auth. */
  basicAuth?: string | null;
  deviceId?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface Envelope {
  code?: string;
  message?: string;
  results?: Record<string, unknown>;
}

export class GowaProvider implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  /** número que o painel guardou → forma registrada no WhatsApp (vale só durante este envio) */
  private readonly resolved = new Map<string, string>();

  constructor(private readonly opts: GowaOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { accept: "application/json" };
    if (json) h["content-type"] = "application/json";
    if (this.opts.basicAuth) h.authorization = `Basic ${Buffer.from(this.opts.basicAuth).toString("base64")}`;
    if (this.opts.deviceId) h["x-device-id"] = this.opts.deviceId;
    return h;
  }

  private async call(path: string, init: RequestInit = {}, json = false): Promise<Envelope> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}${path}`, {
        ...init,
        headers: { ...this.headers(json), ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError(`Não consegui falar com o GOWA em ${this.base}: ${message}`, true);
    }

    const text = await res.text();
    let body: Envelope = {};
    try {
      body = text ? (JSON.parse(text) as Envelope) : {};
    } catch {
      /* corpo não era JSON */
    }
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
      const detail = body.message ?? (text.slice(0, 160) || `HTTP ${res.status}`);
      if (res.status === 401) throw new ProviderError("O GOWA recusou o usuário e a senha (GOWA_BASIC_AUTH).", false);
      throw new ProviderError(`GOWA respondeu ${res.status}: ${detail}`, retryable);
    }
    return body;
  }

  async status(): Promise<ProviderStatus> {
    try {
      const body = await this.call("/app/status");
      const r = body.results ?? {};
      const connected = r.is_connected === true;
      const loggedIn = r.is_logged_in === true;
      return {
        connected: connected && loggedIn,
        loggedIn,
        mode: this.mode,
        detail: !connected
          ? "GOWA no ar, mas desconectado do WhatsApp"
          : !loggedIn
            ? "GOWA no ar, falta escanear o QR code"
            : "WhatsApp conectado",
      };
    } catch (error) {
      // Sem nenhum aparelho conectado a API do GOWA 9.x responde 400 em /app/status: ele está no ar,
      // só falta ler o QR code. Dizer isso em vez de mostrar o erro cru.
      const noDevice = error instanceof ProviderError && /respondeu 400/.test(error.message);
      // 404 com aparelho indicado: ele foi apagado no GOWA (a sessão sumiu junto). Só uma conexão nova resolve.
      const missing = !!this.opts.deviceId && error instanceof ProviderError && /respondeu 404/.test(error.message);
      if (missing) {
        return { connected: false, loggedIn: false, mode: this.mode, missing: true, detail: "O aparelho deste número foi apagado do GOWA" };
      }
      return {
        connected: false,
        loggedIn: false,
        mode: this.mode,
        detail: noDevice
          ? `GOWA no ar, mas nenhum WhatsApp conectado: abra ${this.base} e leia o QR code`
          : error instanceof ProviderError
            ? error.message
            : "GOWA indisponível",
      };
    }
  }

  /**
   * Descobre o endereço REAL do número no WhatsApp. O mesmo celular brasileiro pode estar registrado
   * com ou sem o "9" depois do DDD, e o GOWA só consegue enviar para a forma exata ("no LID found"
   * se errar). Pergunta ao GOWA, pela consulta de contato, qual forma tem aparelhos registrados.
   *  - `{ found: "+55…" }`: achou a forma certa;
   *  - `{ found: null }`: o GOWA respondeu e nenhuma forma está registrada;
   *  - `null`: não deu para saber (GOWA fora do ar etc.); quem chama segue com o número original.
   */
  private async resolve(phoneE164: string): Promise<{ found: string | null } | null> {
    const cached = this.resolved.get(phoneE164);
    if (cached) return { found: cached };
    let answered = 0;
    for (const candidate of phoneVariants(phoneE164)) {
      try {
        const body = await this.call(`/user/info?phone=${candidate.replace(/\D/g, "")}`);
        answered++;
        const data = (body.results as { data?: { devices?: unknown[] | null }[] } | undefined)?.data?.[0];
        if (Array.isArray(data?.devices) && data.devices.length > 0) {
          this.resolved.set(phoneE164, candidate);
          return { found: candidate };
        }
      } catch {
        /* tenta a outra forma; se nenhuma responder, devolve "não sei" */
      }
    }
    return answered > 0 ? { found: null } : null;
  }

  async typing(phoneE164: string, on: boolean): Promise<void> {
    try {
      const phone = (await this.resolve(phoneE164))?.found ?? phoneE164;
      await this.call(
        "/send/chat-presence",
        { method: "POST", body: JSON.stringify({ phone: toJid(phone), action: on ? "start" : "stop" }) },
        true,
      );
    } catch {
      /* "digitando…" é cosmético: se falhar, o envio segue */
    }
  }

  /** Pergunta ao GOWA, pela consulta simples, se o número tem WhatsApp. null = não deu para saber. */
  private async check(phoneE164: string): Promise<boolean | null> {
    try {
      const body = await this.call(`/user/check?phone=${encodeURIComponent(phoneE164.replace(/\D/g, ""))}`);
      const v = body.results?.is_on_whatsapp ?? body.results?.IsOnWhatsApp ?? body.results?.isOnWhatsApp;
      return typeof v === "boolean" ? v : null;
    } catch {
      return null;
    }
  }

  async sendText(phoneE164: string, text: string): Promise<{ id: string | null }> {
    const r = await this.resolve(phoneE164);
    if (r && r.found === null && (await this.check(phoneE164)) === false) {
      // as duas consultas concordam: o número não está no WhatsApp (nem com, nem sem o 9). Não repete.
      throw new ProviderError(`O número ${phoneE164} não aparece no WhatsApp (testei com e sem o 9).`, false);
    }
    const phone = r?.found ?? phoneE164;
    const body = await this.call(
      "/send/message",
      { method: "POST", body: JSON.stringify({ phone: toJid(phone), message: text }) },
      true,
    );
    const id = body.results?.message_id;
    return { id: typeof id === "string" && id ? id : null };
  }

  async isOnWhatsApp(phoneE164: string): Promise<boolean | null> {
    const r = await this.resolve(phoneE164);
    if (r?.found) return true;
    return this.check(phoneE164);
  }
}
