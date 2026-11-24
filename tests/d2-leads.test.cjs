// Explicit synthetic fixtures: no network, no production credentials, no browser.
// Run: node --test tests/d2-leads.test.cjs (requires TypeScript transpileModule).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let ts;
try { ts = require('typescript'); } catch { /* fall back to installed global compiler */ }
if (!ts?.transpileModule) ts = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'typescript'));
function load(file, mocks, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const result = ts.transpileModule(source.replaceAll('import.meta.env.VITE_API_URL', '"https://fixture.invalid"'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true },
  });
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), [], file);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Error, Date, Intl, URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout, ...globals }, { filename: file });
  return exports;
}
class AppApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }
const origin = { leadId: '10000000-0000-4000-8000-000000000001', contactId: null, opportunityId: null, externalLeadId: 'fake-lead-001', assetId: '10000000-0000-4000-8000-000000000002', formId: 'fake-form-001', adId: null, campaignId: 'fake-campaign-001', propertyId: null, ingestionState: 'processed', receivedAt: '2026-11-24T12:00:00Z' };
const lead = { id: origin.leadId, intent: 'buyer', source: 'meta_lead_ads', status: 'new', name: 'Fixture fictícia', email: null, phone: null, message: null, campaign: 'Campanha fictícia', sourcePage: null, context: { relatedPropertyId: null, propertyType: null, city: null, state: null }, sla: { state: 'healthy', dueAt: origin.receivedAt, firstResponseAt: null, firstResponseMinutes: 15, notifications: {} }, responsible: null, receivedAt: origin.receivedAt, metaOrigin: origin };
const page = (items = [lead]) => ({ items, page: 1, pageSize: 20, totalItems: items.length ? 42 : 0, totalPages: items.length ? 3 : 1, summary: { pending: items.length ? 42 : 0, inProgress: 0, converted: 0, archived: 0, total: items.length ? 42 : 0, lastReceivedAt: null, averageFirstResponseMinutes: null } });
test('CRM: source, search, intent, status and page are sent to server; absent source preserves old URL; detail tenant headers', async () => {
  const requests = [];
  const api = load('src/services/crmApi.ts', { '../auth/session': { ensureValidAuthSession: async () => ({ accessToken: 'fixture-only' }) }, './appApi': { AppApiError } }, { fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ success: true, data: url.includes('/crm/leads/') ? lead : page() }) }; } });
  const result = await api.listLeads('fixture-tenant', { source: api.META_LEAD_SOURCE, search: ' x ', intent: 'buyer', status: 'new', page: 2 });
  assert.equal(result.totalItems, 42);
  assert.deepEqual(Object.fromEntries(new URL(requests[0].url).searchParams), { search: 'x', intent: 'buyer', source: 'meta_lead_ads', status: 'new', page: '2' });
  await api.listLeads('fixture-tenant', { source: '' });
  assert.equal(requests[1].url, 'https://fixture.invalid/crm/leads');
  const detail = await api.getLead('fixture-tenant', lead.id);
  assert.equal(detail.metaOrigin.formId, 'fake-form-001');
  for (const { init } of requests) assert.equal(init.headers['x-organization-id'], 'fixture-tenant');
});
// Small hook/JSX double. Tests component logic, not React DOM or visual behavior.
let current;
const react = {
  useState(initial) { const c = current, i = c.index++; if (!(i in c.state)) c.state[i] = initial; return [c.state[i], value => { c.state[i] = typeof value === 'function' ? value(c.state[i]) : value; }]; },
  useMemo(fn) { return fn(); },
  useEffect(fn, deps) { const c = current, i = c.index++; const previous = c.effects[i]; if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) { c.queue.push(() => { previous?.cleanup?.(); c.effects[i] = { deps, cleanup: fn() }; }); } },
};
const jsx = (type, props, key) => ({ type, props, key });
function instance(element) { return { element, index: 0, state: [], effects: [], queue: [], render() { current = this; this.index = 0; this.queue = []; const tree = this.element.type(this.element.props); current = null; this.queue.forEach(fn => fn()); return tree; } }; }
function flatten(tree) { if (tree == null || typeof tree === 'boolean') return []; if (Array.isArray(tree)) return tree.flatMap(flatten); if (typeof tree !== 'object') return [tree]; return [tree, ...flatten(tree.props?.children)]; }
const text = tree => flatten(tree).filter(x => typeof x === 'string' || typeof x === 'number').join(' ').replace(/\s+/g, ' ').trim();
const find = (tree, predicate) => flatten(tree).find(x => typeof x === 'object' && predicate(x));
const settle = () => new Promise(resolve => setImmediate(resolve));
function ui({ list = async () => page(), detail = async () => lead, canManage = false, distribution = async () => ({ policies: [] }) } = {}) {
  const calls = [];
  const api = load('src/app/pages/LeadsPage.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, '../../auth/session': { clearAuthSession() {} }, '../../services/appApi': { AppApiError }, '../../services/crmApi': { META_LEAD_SOURCE: 'meta_lead_ads', listLeads: (org, filters) => { calls.push({ org, filters }); return list(org, filters); }, getLead: detail }, '../../services/organizationSettingsApi': { getOrganizationLeadDistribution: distribution }, '../icons': { GlobeIcon: 'globe', SearchIcon: 'search' },
  }, { setTimeout: () => 1, clearTimeout() {} });
  return { calls, api, component: instance(api.LeadsPage({ organizationId: 'tenant-fixture', canManage })) };
}
test('UI: loading, server-filter change, page and total, empty, clear and no write controls for read-only', async () => {
  const { component, calls } = ui({ list: async (_org, f) => f.source ? page([]) : page() });
  assert.match(text(component.render()), /Carregando leads/);
  await settle(); let tree = component.render();
  assert.match(text(tree), /42 leads/); assert.match(text(tree), /Meta Lead Ads/); assert.match(text(tree), /Ingestão: Processado/);
  assert.doesNotMatch(text(tree), /Novo lead|Converter em oportunidade/);
  find(tree, e => e.type === 'button' && text(e) === 'Próxima').props.onClick();
  component.render(); await settle(); tree = component.render(); assert.equal(calls.at(-1).filters.page, 2);
  const source = find(tree, e => e.type === 'select' && text(e).includes('Meta Lead Ads'));
  source.props.onChange({ target: { value: 'meta_lead_ads' } });
  assert.match(text(component.render()), /Carregando leads/); await settle(); tree = component.render();
  assert.equal(calls.at(-1).filters.source, 'meta_lead_ads'); assert.equal(calls.at(-1).filters.page, 1);
  assert.match(text(tree), /Nenhum lead encontrado/); assert.doesNotMatch(text(tree), /Fixture fictícia/);
  find(tree, e => e.type === 'button' && text(e) === 'Limpar').props.onClick(); component.render(); await settle(); component.render();
  assert.equal(calls.at(-1).filters.source, '');
});
test('UI: read-only ficha uses detail, explicit IDs/nulls and form (not conversation); legacy source not inferred', async () => {
  const { component } = ui(); component.render(); await settle(); let tree = component.render();
  find(tree, e => e.type === 'select' && text(e).includes('Selecione um lead')).props.onChange({ target: { value: lead.id } });
  tree = component.render(); find(tree, e => e.type === 'button' && text(e) === 'Abrir ficha').props.onClick(); tree = component.render();
  const modal = instance(find(tree, e => typeof e.type === 'function' && e.type.name === 'LeadDetailModal'));
  assert.match(text(modal.render()), /Carregando ficha/); await settle();
  const edit = instance(modal.render()); const form = edit.render();
  const provenance = find(form, e => typeof e.type === 'function' && e.type.name === 'LeadMetaOrigin');
  const content = text(provenance.type(provenance.props));
  assert.match(content, /ID do formulário fake-form-001/); assert.match(content, /ID da campanha fake-campaign-001/);
  assert.match(content, /ID do anúncio Não informado/); assert.match(content, /ID do imóvel vinculado Não vinculado/);
  assert.match(content, /não representa uma conversa/); assert.match(content, /Campanha: Campanha fictícia/);
  assert.doesNotMatch(text(form), /Salvar alterações/);
  for (const metaOrigin of [undefined, null]) assert.match(text(provenance.type({ item: { ...lead, metaOrigin } })), /Detalhes da origem Meta indisponíveis/);
  for (const ingestionState of ['pending', 'failed']) assert.match(text(provenance.type({ item: { ...lead, metaOrigin: { ...origin, ingestionState } } })), ingestionState === 'pending' ? /Pendente/ : /Falhou/);
  assert.equal(provenance.type({ item: { ...lead, source: 'manual', metaOrigin: undefined } }), null);
});
test('UI: permission and generic failures distinct from empty; distribution failure does not hide readable leads', async () => {
  for (const [error, label] of [[new AppApiError('FORBIDDEN', 'FORBIDDEN', 403), /não tem permissão/], [new Error('fixture network failure'), /fixture network failure/]]) {
    const { component } = ui({ list: async () => { throw error; } }); component.render(); await settle(); const tree = component.render();
    assert.match(text(tree), label); assert.doesNotMatch(text(tree), /Nenhum lead/);
  }
  const { component, api } = ui({ canManage: true, distribution: async () => { throw new Error('fixture denied'); } });
  component.render(); await settle(); const tree = component.render();
  assert.match(text(tree), /Configuração de distribuição indisponível/); assert.match(text(tree), /Fixture fictícia/);
  assert.notEqual(api.LeadsPage({ organizationId: 'other-tenant', canManage: true }).key, component.element.key);
});
