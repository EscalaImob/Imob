import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv, type Plugin } from "vite";

const endpoint = "/__local/landing-property-insights";
const servicePath = resolve(process.cwd(), "../IMOB-Backend/dist/application/property-local-insights.js");
const allowedVisibility = new Set(["neighborhood", "street", "full"]);

function isLoopback(address: string | undefined): boolean {
  return address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function localOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname); }
  catch { return false; }
}

function send(response: ServerResponse, status: number, data: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (Buffer.byteLength(body) > 4096) throw new Error("PAYLOAD_TOO_LARGE");
  }
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_PAYLOAD");
  return parsed as Record<string, unknown>;
}

function field(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

export function localPropertyInsightsPlugin(mode: string): Plugin {
  return {
    name: "local-property-insights",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(endpoint, async (request, response) => {
        if (request.method !== "POST") return send(response, 405, { error: "Método não permitido." });
        if (!isLoopback(request.socket.remoteAddress) || !localOrigin(request.headers.origin)) return send(response, 403, { error: "Acesso restrito ao ambiente local." });
        if (!request.headers["content-type"]?.startsWith("application/json")) return send(response, 415, { error: "Envie JSON." });
        const key = process.env.GEOAPIFY_API_KEY || loadEnv(mode, process.cwd(), "").GEOAPIFY_API_KEY || "";
        if (!existsSync(servicePath)) return send(response, 503, { error: "Compile o backend com npm run build antes de buscar proximidades." });
        try {
          const input = await readBody(request);
          if (!key && input.mapOnly === true) return send(response, 503, { error: "Configure GEOAPIFY_API_KEY no .env.local do frontend e reinicie o Vite para gerar mapa e proximidades." });
          const visibility = field(input.siteAddressVisibility, 24);
          if (!visibility || !allowedVisibility.has(visibility)) return send(response, 422, { error: "A localização pública do imóvel está oculta ou inválida." });
          const property = {
            latitude: field(input.latitude, 24), longitude: field(input.longitude, 24),
            street: field(input.street, 220), number: field(input.number, 40),
            postalCode: field(input.postalCode, 16), neighborhood: field(input.neighborhood, 120),
            city: field(input.city, 120), state: field(input.state, 2),
            publicLocation: field(input.publicLocation, 220), siteAddressVisibility: visibility,
          };
          const service = await import(pathToFileURL(servicePath).href) as {
            refreshPropertyLocalInsights: (input: Record<string, string | null>, apiKey: string) => Promise<unknown>;
            lookupPropertyPublicMap: (input: Record<string, string | null>, apiKey: string) => Promise<unknown>;
          };
          const data = input.mapOnly === true
            ? await service.lookupPropertyPublicMap(property, key)
            : await service.refreshPropertyLocalInsights(property, key);
          return send(response, 200, { data });
        } catch (error) {
          const code = error instanceof Error && "code" in error ? String(error.code) : "";
          const status = code === "LOCATION_PROVIDER_UNAVAILABLE" || code === "LOCATION_PROVIDER_NOT_CONFIGURED" ? 503 : code ? 422 : 400;
          return send(response, status, { error: code ? (error as Error).message : "Não foi possível consultar a região." });
        }
      });
    },
  };
}
