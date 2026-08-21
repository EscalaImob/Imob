const API = process.env.SEED_API_URL;
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const TAG = "DEMO-2026";
if (!API || !EMAIL || !PASSWORD) throw new Error("Informe SEED_API_URL, SEED_EMAIL e SEED_PASSWORD.");

let token = "";
let organizationId = "";
let membershipId = "";
const report = {};

async function call(path, { method = "GET", body, tenant = true } = {}) {
  if (body && (path === "/portfolio/authorizations" || path === "/corporate/contracts")) {
    body = { ...body, startsAt: body.startsAt?.slice(0, 10) ?? null, endsAt: body.endsAt?.slice(0, 10) ?? null };
  }
  if (body && path === "/corporate/finance/transactions" && body.status === "partial" && !body.settlementDate) {
    body = { ...body, settlementDate: body.competenceDate };
  }
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
  if (!response.ok || payload?.success !== true) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    const issues = payload?.error?.issues ? ` ${JSON.stringify(payload.error.issues)}` : "";
    throw new Error(`${method} ${path}: ${message}${issues}`);
  }
  return payload.data;
}

const iso = (month, day, hour = 10) => new Date(Date.UTC(2026, month - 1, day, hour, 0, 0)).toISOString();
const date = (month, day) => iso(month, day).slice(0, 10);
const pick = (items, index) => items[index % items.length];

async function list(path) {
  const data = await call(path);
  return Array.isArray(data) ? data : data.items ?? [];
}

async function ensureMany(name, desired, existing, keyOf, create) {
  const items = [];
  let created = 0;
  for (let index = 0; index < desired; index += 1) {
    const key = keyOf(index);
    const found = existing.find((item) => String(item.name ?? item.title ?? item.description ?? "").includes(key));
    if (found) items.push(found);
    else { items.push(await create(index, key)); created += 1; }
  }
  report[name] = { total: items.length, created, reused: items.length - created };
  return items;
}

const login = await call("/auth/login", { method: "POST", tenant: false, body: { email: EMAIL, password: PASSWORD } });
token = login.session.accessToken;
const bootstrap = await call("/app/bootstrap", { tenant: false });
organizationId = bootstrap.activeOrganization?.id;
membershipId = bootstrap.activeOrganization?.membershipId;
if (!organizationId || !membershipId) throw new Error("A conta não possui organização ativa.");

const people = [
  ["Marina Albuquerque", "marina.albuquerque@example.com", "61991230001", "Brasília"],
  ["Carlos Eduardo Nunes", "carlos.nunes@example.com", "61991230002", "Águas Claras"],
  ["Patrícia Gomes", "patricia.gomes@example.com", "61991230003", "Taguatinga"],
  ["Renato Oliveira", "renato.oliveira@example.com", "61991230004", "Guará"],
  ["Fernanda Lima", "fernanda.lima@example.com", "61991230005", "Samambaia"],
  ["Lucas Martins", "lucas.martins@example.com", "61991230006", "Ceilândia"],
  ["Juliana Ribeiro", "juliana.ribeiro@example.com", "61991230007", "Sobradinho"],
  ["Rafael Costa", "rafael.costa@example.com", "61991230008", "Gama"],
  ["Camila Fernandes", "camila.fernandes@example.com", "61991230009", "Lago Sul"],
  ["Gustavo Rocha", "gustavo.rocha@example.com", "61991230010", "Asa Norte"],
];
const contacts = await ensureMany("clientes", 10, await list(`/crm/contacts?search=${TAG}&pageSize=100`), (i) => `${TAG}-CLI-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/crm/contacts", { method: "POST", body: { kind: "person", name: `${key} ${people[i][0]}`, email: people[i][1], phone: people[i][2], whatsapp: people[i][2], city: people[i][3], state: "DF", source: "Carga demonstrativa", profiles: i % 2 ? ["buyer", "investor"] : ["owner", "seller"] } }));

const propertyNames = ["Apartamento Vista Parque", "Casa Jardim das Acácias", "Cobertura Horizonte", "Loja Comercial Central", "Apartamento Alameda", "Casa Reserva Verde", "Sala Business Tower", "Apartamento Estação", "Terreno Portal do Lago", "Casa Alto Padrão" ];
const propertyTypes = ["apartment", "house", "apartment", "commercial", "apartment", "house", "room", "apartment", "land", "house"];
const properties = await ensureMany("imoveis", 10, await list(`/portfolio/properties?search=${TAG}&pageSize=100`), (i) => `${TAG}-IMO-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/portfolio/properties", { method: "POST", body: {
  externalReference: key, title: `${key} ${propertyNames[i]}`, type: propertyTypes[i], purpose: i % 3 === 1 ? "rent" : "sale", situation: "ocupado", status: "active", responsibleMembershipId: membershipId, sourceOpportunityId: null,
  postalCode: `7000${i}000`, street: `Rua Demonstrativa ${i + 1}`, number: String(100 + i), complement: i % 2 ? `Apto ${101 + i}` : null, neighborhood: people[i][3], city: "Brasília", state: "DF", latitude: null, longitude: null, publicLocation: `${people[i][3]}, Brasília - DF`,
  salePrice: i % 3 === 1 ? null : String(420000 + i * 85000), rentPrice: i % 3 === 1 ? String(2400 + i * 180) : null, condominiumFee: String(480 + i * 25), iptuAnnual: String(1200 + i * 90), otherFees: null, priceNotes: "Valores fictícios para demonstração", totalArea: String(70 + i * 18), usefulArea: String(62 + i * 15), landArea: propertyTypes[i] === "land" ? "800" : null, builtArea: propertyTypes[i] === "house" ? String(150 + i * 12) : null, areaUnit: "m2",
  bedrooms: propertyTypes[i] === "commercial" || propertyTypes[i] === "room" || propertyTypes[i] === "land" ? null : 2 + (i % 3), suites: propertyTypes[i] === "house" ? 1 : 0, bathrooms: propertyTypes[i] === "land" ? null : 2, toilets: 1, parkingSpaces: propertyTypes[i] === "land" ? null : 1 + (i % 2), amenities: [], condominiumAmenities: [],
  description: "Imóvel fictício cadastrado para demonstração completa dos módulos da plataforma.", internalNotes: `Registro de carga ${TAG}.`, registryNumber: `MAT-${2026000 + i}`, registryOffice: "Cartório de Registro de Imóveis - demonstração", captureDate: date(4 + (i % 5), 2 + i), authorizationStartsAt: date(4, 1), authorizationEndsAt: date(12, 31), commissionPercent: "5.0000", exclusive: i % 2 === 0, financed: i % 3 === 0, paidOff: i % 3 !== 0, documentationOk: true, authorizationNotes: "Documentação fictícia conferida.", siteTitle: propertyNames[i], siteDescription: "Excelente oportunidade imobiliária em localização estratégica.", siteLocationText: `${people[i][3]} - Brasília/DF`, siteAddressVisibility: "neighborhood", owners: [{ contactId: contacts[i].id, ownershipPercentage: "100.0000", primary: true }]
} }));

const authorizations = await ensureMany("autorizacoes", 11, await list(`/portfolio/authorizations?search=${TAG}&pageSize=100`), (i) => `${TAG}-AUT-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/portfolio/authorizations", { method: "POST", body: { propertyId: pick(properties, i).id, type: pick(properties, i).purpose === "rent" ? "rent" : "sale", status: i < 8 ? "active" : i < 10 ? "signed" : "draft", exclusive: i % 2 === 0, commissionPercent: "5.0000", startsAt: iso(4 + (i % 5), 1 + (i % 20)), endsAt: iso(9 + (i % 4), 10 + (i % 15)), responsibleMembershipId: membershipId, notes: `${key} autorização fictícia de comercialização.`, cancelReason: null } }));

const demoImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
for (const property of properties) {
  const imagePath = "/portfolio/properties/" + encodeURIComponent(property.id) + "/images";
  const currentImages = await call(imagePath);
  if (currentImages.length === 0) {
    const ready = await call(imagePath + "/upload-url", { method: "POST", body: { originalName: "imovel-demonstrativo.png", contentType: "image/png", sizeBytes: demoImage.length } });
    const upload = await fetch(ready.uploadUrl, { method: "PUT", headers: { "content-type": ready.requiredHeaders["content-type"] }, body: demoImage });
    if (!upload.ok) throw new Error("Falha no upload da imagem demonstrativa: HTTP " + upload.status);
    await call(imagePath + "/confirm", { method: "POST", body: { imageId: ready.imageId, originalName: "imovel-demonstrativo.png", contentType: "image/png", sizeBytes: demoImage.length } });
  }
}

const publicationDates = [[4,5],[4,22],[5,8],[5,27],[6,11],[6,29],[7,7],[7,25],[8,8],[8,19]];
const publications = await ensureMany("publicacoes", 10, await list(`/portfolio/publications?search=${TAG}&pageSize=100`), (i) => `${TAG}-PUB-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/portfolio/publications", { method: "POST", body: { propertyId: properties[i].id, objective: properties[i].purpose === "rent" ? "rent" : "sell", channel: ["instagram", "facebook", "whatsapp"][i % 3], format: ["feed", "carousel", "story"][i % 3], status: "published", title: `${key} ${propertyNames[i]}`, caption: `Conheça esta oportunidade fictícia em ${people[i][3]}. Entre em contato para mais informações.`, cta: "Agende uma visita", hashtags: ["imoveis", "brasilia", "escalaimob"], campaignName: `${TAG} Campanha ${i + 1}`, trackingLink: null, scheduledAt: iso(publicationDates[i][0], publicationDates[i][1], 14) } }));

const taskDates = [[2,10],[2,25],[3,9],[3,28],[4,12],[4,27],[5,5],[5,21],[6,3],[6,18],[7,4],[7,19],[8,5],[8,18],[8,24],[9,2],[9,8],[9,14],[9,22],[9,29]];
const tasks = await ensureMany("tarefas", 20, await list(`/productivity/tasks?search=${TAG}&pageSize=100`), (i) => `${TAG}-TAR-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/productivity/tasks", { method: "POST", body: { title: `${key} ${["Retornar cliente", "Conferir documentação", "Preparar proposta", "Atualizar anúncio"][i % 4]}`, description: "Tarefa fictícia da operação imobiliária.", status: i < 10 ? "completed" : i < 15 ? "in_progress" : "todo", priority: ["normal", "high", "low", "urgent"][i % 4], dueAt: iso(taskDates[i][0], taskDates[i][1], 15), scheduledStartAt: iso(taskDates[i][0], taskDates[i][1], 14), scheduledEndAt: iso(taskDates[i][0], taskDates[i][1], 15), responsibleMembershipId: membershipId, contactId: pick(contacts, i).id, origin: TAG } }));

const agendaDates = [[3,12],[3,26],[4,9],[4,23],[5,14],[5,28],[6,10],[6,24],[7,9],[7,23],[8,13],[8,27],[9,17],[10,8],[10,22]];
const agendaExisting = (await call(`/productivity/calendar?from=${encodeURIComponent(iso(3,1,0))}&to=${encodeURIComponent(iso(11,1,0))}`)).items;
const agenda = await ensureMany("agenda", 15, agendaExisting, (i) => `${TAG}-AGE-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/productivity/calendar", { method: "POST", body: { type: ["meeting", "evaluation", "signature", "inspection"][i % 4], title: `${key} ${["Reunião comercial", "Avaliação do imóvel", "Assinatura contratual", "Revisão de carteira"][i % 4]}`, description: "Compromisso fictício da agenda demonstrativa.", startsAt: iso(agendaDates[i][0], agendaDates[i][1], 10), endsAt: iso(agendaDates[i][0], agendaDates[i][1], 11), status: agendaDates[i][0] < 8 ? "completed" : "scheduled", private: false, responsibleMembershipId: membershipId, contactId: pick(contacts, i).id } }));

const visitDates = [[3,18],[4,4],[4,25],[5,16],[6,6],[6,27],[7,18],[8,1],[8,29],[9,12],[9,26],[10,10],[10,24]];
const visits = await ensureMany("gestao_de_visitas", 13, await list(`/productivity/visits?search=${TAG}&pageSize=100`), (i) => `${TAG}-VIS-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/productivity/visits", { method: "POST", body: { title: `${key} Visita ao ${propertyNames[i % 10]}`, notes: "Visita fictícia para demonstração.", location: `${people[i % 10][3]}, Brasília - DF`, status: visitDates[i][0] < 8 ? "completed" : "scheduled", startsAt: iso(visitDates[i][0], visitDates[i][1], 16), endsAt: iso(visitDates[i][0], visitDates[i][1], 17), responsibleMembershipId: membershipId, contactId: pick(contacts, i).id, propertyId: pick(properties, i).id, ...(visitDates[i][0] < 8 ? { feedbackRating: 4 + (i % 2), feedbackNotes: "Cliente demonstrou interesse e solicitou acompanhamento." } : {}) } }));

const contractDates = Array.from({ length: 23 }, (_, i) => [3 + Math.floor(i / 3), 3 + ((i * 5) % 24)]);
const contracts = await ensureMany("contratos", 23, await list(`/corporate/contracts?search=${TAG}&pageSize=100`), (i) => `${TAG}-CON-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/corporate/contracts", { method: "POST", body: { propertyId: pick(properties, i).id, counterpartyContactId: pick(contacts, i + 3).id, opportunityId: null, authorizationId: pick(authorizations, i).property?.id === pick(properties, i).id ? pick(authorizations, i).id : null, type: pick(properties, i).purpose === "rent" ? "rent" : "sale_purchase", status: contractDates[i][0] < 7 ? "closed" : contractDates[i][0] < 9 ? "active" : "approved", title: `${key} ${pick(properties, i).title}`, amount: pick(properties, i).purpose === "rent" ? pick(properties, i).rentPrice : pick(properties, i).salePrice, commissionPercent: "5.0000", startsAt: iso(contractDates[i][0], contractDates[i][1]), endsAt: iso(Math.min(12, contractDates[i][0] + 2), contractDates[i][1]), renewalAt: null, responsibleMembershipId: membershipId, paymentTerms: "Pagamento conforme cronograma contratual fictício.", conditions: "Sujeito à conferência documental e aprovação das partes.", notes: "Contrato gerado para carga demonstrativa.", cancelReason: null } }));

const inspectionDates = [[4,12],[4,30],[5,18],[6,5],[6,22],[7,10],[7,28],[8,14],[8,31],[9,15],[9,30],[10,14],[10,28]];
const inspections = await ensureMany("laudos_e_vistorias", 13, await list(`/corporate/inspections?search=${TAG}&pageSize=100`), (i) => `${TAG}-LAU-${String(i + 1).padStart(2, "0")}`, async (i, key) => call("/corporate/inspections", { method: "POST", body: { propertyId: pick(properties, i).id, visitId: pick(visits, i).property?.id === pick(properties, i).id ? pick(visits, i).id : null, contractId: pick(contracts, i).property?.id === pick(properties, i).id ? pick(contracts, i).id : null, type: ["valuation", "entry", "technical", "exit"][i % 4], status: inspectionDates[i][0] < 8 ? "completed" : inspectionDates[i][0] < 9 ? "review" : "draft", title: `${key} Laudo do ${propertyNames[i % 10]}`, scheduledAt: iso(inspectionDates[i][0], inspectionDates[i][1], 9), responsibleMembershipId: membershipId, summary: "Laudo fictício: imóvel em condições adequadas, com observações de manutenção preventiva.", checklist: [{ id: `amb-${i}-1`, name: "Sala e áreas comuns", items: [{ id: `item-${i}-1`, name: "Paredes e pintura", condition: i % 3 === 0 ? "excellent" : "good", observation: "Sem avarias relevantes.", measurement: null }, { id: `item-${i}-2`, name: "Instalações elétricas", condition: "good", observation: "Funcionamento normal.", measurement: "220 V" }] }, { id: `amb-${i}-2`, name: "Cozinha e área de serviço", items: [{ id: `item-${i}-3`, name: "Piso e revestimentos", condition: "good", observation: "Conservação compatível com o uso.", measurement: null }] }], cancelReason: null } }));

const financialOptions = await call("/corporate/finance/options");
const financeExisting = await list(`/corporate/finance/transactions?search=${TAG}&pageSize=100`);
const financial = await ensureMany("financeiro", 33, financeExisting, (i) => `${TAG}-FIN-${String(i + 1).padStart(2, "0")}`, async (i, key) => {
  const income = i < 23;
  const linkedContract = income ? contracts[i] : null;
  const month = income ? contractDates[i][0] : 4 + ((i - 23) % 7);
  const day = income ? contractDates[i][1] : 8 + ((i * 3) % 18);
  const amount = income ? String(Math.max(1800, Number(linkedContract.amount ?? 60000) * .05)) : String(350 + (i - 23) * 125);
  const status = month < 8 ? "settled" : month === 8 ? "partial" : "pending";
  const category = financialOptions.categories.find((item) => item.direction === (income ? "income" : "expense") || item.direction === "both");
  return call("/corporate/finance/transactions", { method: "POST", body: { direction: income ? "income" : "expense", status, description: `${key} ${income ? "Comissão imobiliária" : ["Marketing", "Fotografia", "Manutenção", "Taxa cartorial"][i % 4]}`, amount, settledAmount: status === "settled" ? amount : status === "partial" ? String(Number(amount) / 2) : "0", competenceDate: date(month, day), dueDate: date(month, Math.min(28, day + 5)), settlementDate: status === "settled" ? date(month, Math.min(28, day + 6)) : null, categoryId: category?.id ?? null, accountId: financialOptions.accounts[0]?.id ?? null, costCenterId: financialOptions.costCenters[0]?.id ?? null, contractId: linkedContract?.id ?? null, opportunityId: null, propertyId: linkedContract?.property?.id ?? pick(properties, i).id, contactId: income ? linkedContract?.counterparty?.id ?? pick(contacts, i).id : null, responsibleMembershipId: membershipId, supplierName: income ? null : "Fornecedor demonstrativo", notes: "Lançamento financeiro fictício e coerente com a carga DEMO-2026." } });
});

console.log(JSON.stringify({ organization: bootstrap.activeOrganization.name, organizationId, report }, null, 2));
