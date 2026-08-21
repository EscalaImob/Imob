const API = process.env.SEED_API_URL;
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const TAG = "DEMO-2026-FUN";

if (!API || !EMAIL || !PASSWORD) throw new Error("Informe SEED_API_URL, SEED_EMAIL e SEED_PASSWORD.");

let token = "";
let organizationId = "";

async function call(path, { method = "GET", body, tenant = true } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(tenant && organizationId ? { "x-organization-id": organizationId } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) throw new Error(`${method} ${path}: ${payload?.error?.message ?? `HTTP ${response.status}`}`);
  return payload.data;
}

const login = await call("/auth/login", { method: "POST", tenant: false, body: { email: EMAIL, password: PASSWORD } });
token = login.session.accessToken;
const bootstrap = await call("/app/bootstrap", { tenant: false });
organizationId = bootstrap.activeOrganization?.id;
if (!organizationId) throw new Error("A conta não possui organização ativa.");

const contactsResult = await call("/crm/contacts?search=DEMO-2026&pageSize=100");
const contacts = contactsResult.items ?? [];
if (contacts.length === 0) throw new Error("Nenhum cliente demonstrativo encontrado.");

const plans = {
  buyers: [
    "Compra de apartamento para moradia", "Busca de imóvel para investimento", "Locação próxima ao trabalho",
    "Apartamento com três quartos", "Casa em condomínio fechado", "Imóvel compacto para primeira compra",
    "Cobertura com área de lazer", "Sala comercial para consultório", "Apartamento próximo ao metrô",
    "Casa com quintal e escritório", "Imóvel para renda de aluguel", "Mudança para região central",
    "Apartamento mobiliado", "Casa térrea para família", "Terreno para construção residencial",
  ],
  capture: [
    "Captação de apartamento residencial", "Captação de casa em condomínio", "Avaliação de sala comercial",
    "Proposta de exclusividade", "Captação para locação anual", "Avaliação de cobertura",
    "Cadastro de terreno residencial", "Captação de imóvel mobiliado", "Avaliação mercadológica de casa",
    "Captação de loja comercial", "Proposta para administração de aluguel", "Captação de apartamento novo",
    "Avaliação de imóvel de alto padrão", "Captação de casa térrea", "Proposta de venda com exclusividade",
  ],
};

const report = {};
for (const funnelCode of ["buyers", "capture"]) {
  let board = await call(`/crm/opportunities?funnel=${funnelCode}&view=all`);
  const existing = board.funnel.stages.flatMap((stage) => stage.opportunities);
  let created = 0;
  for (let index = 0; index < plans[funnelCode].length; index += 1) {
    const key = `${TAG}-${funnelCode === "buyers" ? "COM" : "CAP"}-${String(index + 1).padStart(2, "0")}`;
    if (existing.some((item) => item.title.includes(key))) continue;
    const contact = contacts[index % contacts.length];
    const result = await call("/crm/opportunities", { method: "POST", body: {
      funnelCode,
      contactId: contact.id,
      title: `${key} ${plans[funnelCode][index]}`,
      description: `Oportunidade fictícia e coerente para demonstração do funil de ${funnelCode === "buyers" ? "compradores" : "captação"}.`,
      estimatedValue: String(funnelCode === "buyers" ? 320000 + index * 47000 : 410000 + index * 62000),
      probability: 10 + (index % 5) * 10,
      expectedCloseDate: new Date(Date.UTC(2026, 7 + (index % 3), 5 + (index % 20))).toISOString().slice(0, 10),
      temperature: ["cold", "warm", "hot"][index % 3],
    } });
    board = await call(`/crm/opportunities?funnel=${funnelCode}&view=all`);
    const movableStages = board.funnel.stages.filter((stage) => !stage.outcome);
    const target = movableStages[index % Math.max(1, movableStages.length)];
    if (target && target.id !== board.funnel.stages[0]?.id) await call(`/crm/opportunities/${result.id}/stage`, { method: "PATCH", body: { stageId: target.id } });
    created += 1;
  }
  board = await call(`/crm/opportunities?funnel=${funnelCode}&view=all`);
  report[funnelCode] = { created, total: board.funnel.stages.reduce((sum, stage) => sum + stage.opportunities.length, 0) };
}

console.log(JSON.stringify(report, null, 2));
