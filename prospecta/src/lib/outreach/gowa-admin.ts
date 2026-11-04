import { ProviderError } from "./provider";

/**
 * A administração de aparelhos do GOWA (um aparelho = um número de WhatsApp). Endpoints conferidos no openapi.yaml da v9.6.0:
 *   GET    /devices                      → { results: [{ id, phone_number, display_name, state, jid, created_at }] }
 *   POST   /devices  { device_id? }      → { results: { id, state, jid, ... } }
 *   GET    /devices/{id}/status          → { results: { device_id, is_connected, is_logged_in } }
 *   GET    /devices/{id}/login           → { results: { qr_link, qr_duration } }        (pareamento por QR)
 *   POST   /devices/{id}/login/code?phone→ { results: { pair_code } }                    (pareamento por código, sem câmera)
 *   POST   /devices/{id}/reconnect | /logout ; DELETE /devices/{id}
 * Só o servidor do painel fala com isto (a senha do GOWA nunca vai ao navegador).
 */

export type DeviceState = "disconnected" | "connecting" | "connected" | "logged_in";

export interface GowaDevice {
  id: string;
  /** Só os dígitos do telefone, quando o aparelho já está pareado. */
  phone: string | null;
  displayName: string | null;
  state: DeviceState | string;
  /** O endereço do aparelho no WhatsApp ("5585…@s.whatsapp.net"): é o `device_id` que chega no webhook. */
  jid: string | null;
  createdAt: string | null;
}

export interface GowaAdminOptions {
  baseUrl: string;
  basicAuth?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface Envelope {
  code?: string;
  message?: string;
  results?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function toDevice(raw: unknown): GowaDevice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id) ?? str(r.device_id);
  if (!id) return null;
  return {
    id,
    phone: str(r.phone_number)?.replace(/\D/g, "") || null,
    displayName: str(r.display_name),
    state: str(r.state) ?? "disconnected",
    jid: str(r.jid),
    createdAt: str(r.created_at),
  };
}

export class GowaAdmin {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: GowaAdminOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { accept: "application/json" };
    if (json) h["content-type"] = "application/json";
    if (this.opts.basicAuth) h.authorization = `Basic ${Buffer.from(this.opts.basicAuth).toString("base64")}`;
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
      const detail = body.message ?? (text.slice(0, 160) || `HTTP ${res.status}`);
      if (res.status === 401) throw new ProviderError("O GOWA recusou o usuário e a senha (GOWA_BASIC_AUTH).", false);
      if (res.status === 404) throw new ProviderError("O GOWA não conhece esse aparelho.", false);
      throw new ProviderError(`GOWA respondeu ${res.status}: ${detail}`, res.status >= 500 || res.status === 429);
    }
    return body;
  }

  async listDevices(): Promise<GowaDevice[]> {
    const body = await this.call("/devices");
    const list = Array.isArray(body.results) ? body.results : [];
    return list.map(toDevice).filter((d): d is GowaDevice => d !== null);
  }

  /** Cria um aparelho novo (um lugar para um número). Com `id` o GOWA usa esse nome; sem, ele sorteia um. */
  async addDevice(id?: string): Promise<GowaDevice> {
    const body = await this.call("/devices", { method: "POST", body: JSON.stringify(id ? { device_id: id } : {}) }, true);
    const device = toDevice(body.results);
    if (!device) throw new ProviderError("O GOWA criou o aparelho, mas não disse o nome dele.", false);
    return device;
  }

  async deviceStatus(id: string): Promise<{ connected: boolean; loggedIn: boolean }> {
    const body = await this.call(`/devices/${encodeURIComponent(id)}/status`);
    const r = (body.results ?? {}) as Record<string, unknown>;
    return { connected: r.is_connected === true, loggedIn: r.is_logged_in === true };
  }

  /**
   * Começa o pareamento por QR e devolve a imagem pronta para a tela (data URL). A imagem é buscada aqui, com a senha do GOWA,
   * porque o navegador não consegue pedir a imagem a um servidor protegido por senha em outra porta.
   */
  async loginQr(id: string): Promise<{ qrDataUrl: string | null; qrLink: string | null; seconds: number }> {
    const body = await this.call(`/devices/${encodeURIComponent(id)}/login`);
    const r = (body.results ?? {}) as Record<string, unknown>;
    const link = str(r.qr_link);
    const seconds = typeof r.qr_duration === "number" ? r.qr_duration : 30;
    if (!link) return { qrDataUrl: null, qrLink: null, seconds };
    // o endereço pode vir com outro anfitrião (o do GOWA para si mesmo): vale o caminho, no anfitrião que o painel usa
    let path = link;
    try {
      const u = new URL(link);
      path = `${u.pathname}${u.search}`;
    } catch {
      /* já era um caminho */
    }
    try {
      const res = await this.doFetch(`${this.base}${path}`, { headers: this.headers(), signal: AbortSignal.timeout(this.timeoutMs), cache: "no-store" });
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
        return { qrDataUrl: `data:${type};base64,${bytes.toString("base64")}`, qrLink: link, seconds };
      }
    } catch {
      /* cai no link */
    }
    return { qrDataUrl: null, qrLink: link, seconds };
  }

  /** Pareamento por código: o dono digita o código no WhatsApp do celular (Aparelhos conectados → Conectar com número). */
  async loginCode(id: string, phoneDigits: string): Promise<string> {
    const body = await this.call(`/devices/${encodeURIComponent(id)}/login/code?phone=${encodeURIComponent(phoneDigits)}`, { method: "POST" });
    const code = str(((body.results ?? {}) as Record<string, unknown>).pair_code);
    if (!code) throw new ProviderError("O GOWA não devolveu o código de pareamento.", false);
    return code;
  }

  async reconnect(id: string): Promise<void> {
    await this.call(`/devices/${encodeURIComponent(id)}/reconnect`, { method: "POST" });
  }

  /** Desconecta o número do WhatsApp mas guarda o lugar dele (dá para conectar de novo com o mesmo nome). */
  async logout(id: string): Promise<void> {
    await this.call(`/devices/${encodeURIComponent(id)}/logout`, { method: "POST" });
  }
}
