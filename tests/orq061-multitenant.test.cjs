// ORQ061 synthetic fixtures: no network, credentials, provider, React DOM or external effect.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require('./meta-test-compiler.cjs');
function load(file, mocks, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const result = ts.transpileModule(source.replaceAll('import.meta.env.VITE_API_URL', '"https://fixture.invalid"'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true },
  });
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), [], file);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Error, Date, Intl, URL, URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout, ...globals }, { filename: file });
  return exports;
}
class AppApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
// Hook/JSX double: verifies key cancellation and UI state, not a real browser/React DOM.
let current;
const react={useState(initial){const c=current,i=c.index++;if(!(i in c.state))c.state[i]=typeof initial==='function'?initial():initial;return[c.state[i],v=>{c.state[i]=typeof v==='function'?v(c.state[i]):v;}];},useRef(initial){const c=current,i=c.index++;if(!(i in c.state))c.state[i]={current:initial};return c.state[i];},useLayoutEffect(fn,deps){const c=current,i=c.index++;const old=c.effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))c.queue.push(()=>{old?.cleanup?.();c.effects[i]={deps,cleanup:fn()};});}};
react.useEffect=react.useLayoutEffect;
const jsx=(type,props,key)=>({type,props,key});const runtime={jsx,jsxs:jsx,Fragment:'fragment'};
function instance(element){return{element,index:0,state:[],effects:[],queue:[],render(){current=this;this.index=0;this.queue=[];const tree=this.element.type(this.element.props);current=null;this.queue.forEach(fn=>fn());return tree;},unmount(){this.effects.forEach(e=>e?.cleanup?.());}};}
function flatten(tree){if(tree==null||typeof tree==='boolean')return[];if(Array.isArray(tree))return tree.flatMap(flatten);if(typeof tree!=='object')return[tree];return[tree,...flatten(tree.props?.children)];}
const text=tree=>flatten(tree).filter(x=>typeof x==='string'||typeof x==='number').join(' ').replace(/\s+/g,' ').trim();const find=(tree,p)=>flatten(tree).find(x=>typeof x==='object'&&p(x));const button=(tree,label)=>find(tree,e=>e.type==='button'&&text(e)===label);const settle=()=>new Promise(r=>setImmediate(r));const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

const fixture = load('tests/orq061-meta-fixtures.ts', {});
const { orgA, orgB, igA, igA2, fbA, statusA, statusB, empty, v1 } = fixture;
const equal = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => status === 200 ? { success: true, data } : { success: false, error: data } });
const transport = fetch => load('src/services/metaApi.ts', {'../auth/session': {ensureValidAuthSession: async () => ({accessToken:'fixture-only'})}, './appApi': {AppApiError}}, {fetch});
const noNetwork = async () => { throw Error('Unexpected network'); };
const card = (tree, id) => find(tree, e => e.type === 'section' && e.props['aria-label'] === `Conexão ${id}`);
const checkboxes = tree => flatten(tree).filter(e => e?.type === 'input' && e.props.type === 'checkbox');
const click = (tree, label) => button(tree, label).props.onClick();
const ready = async u => {u.render(); await settle(); return u.render();};
function browser(search='?metaContractVersion=2', storage=new Map()) {
  const calls=[];const confirms=[];let allow=true;
  const location={pathname:'/app/marketing/',search,href:`https://fixture.invalid/app/marketing/${search}`,assign(url){calls.push(url);}};
  const sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const history={state:null,replaceState(_s,_t,path){const u=new URL(path,'https://fixture.invalid');location.search=u.search;location.href=u.href;}};
  return {storage,calls,confirms,setConsent:v=>allow=v,globals:{location,sessionStorage,history,confirm:t=>{confirms.push(t);return allow;}}};
}
function ui(api, props={}, b=browser()) {
  const automation=()=>null, insights=()=>null, campaigns=()=>null;
  const mod=load('src/app/pages/MarketingPage.tsx',{react,'react/jsx-runtime':runtime,'../../services/appApi':{AppApiError},'../../services/metaApi':api,'./meta.css':{},'./MetaAutomationSection':{MetaAutomationSection:automation},'./MetaCampaignSection':{MetaCampaignSection:campaigns},'./MetaInsightsSection':{MetaInsightsSection:insights}}, b.globals);
  const outer=mod.MarketingPage({organizationId:orgA,canManage:true,canReadAutomation:false,automationGrants:{},canReadInsights:false,canReadCampaigns:false,canWriteCampaigns:false,...props});
  return {outer,u:instance(outer),campaigns,insights,b};
}
function stub(overrides={}) {return {readMetaConnectionsV2:async org=>({version:2,status:org===orgA?statusA:statusB}),listMetaConnectionsV2:async org=>({contractVersion:2,items:(org===orgA?statusA:statusB).connections}),getMetaStatus:async()=>v1,startMetaOAuth:async()=>{throw new AppApiError('fixture','FEATURE_DISABLED',503);},...overrides};}

test('V2 HTTP: six approved routes only; organization header, UUID targets, exact bodies and unchanged OAuth/V1',async()=>{
  const calls=[];let data=statusA;
  const api=transport(async(url,init)=>{calls.push({url,init});return response(data);});
  equal(await api.readMetaConnectionsV2(orgA),{version:2,status:statusA});
  data={contractVersion:2,items:statusA.connections};equal((await api.listMetaConnectionsV2(orgA)).items,statusA.connections);
  data={contractVersion:2,items:igA.assets};equal((await api.listMetaAssetsV2(orgA,igA.id)).items,igA.assets);
  data=igA;await api.selectMetaAssetsV2(orgA,igA.id,[]);await api.testMetaConnectionV2(orgA,igA.id);await api.revokeMetaConnectionV2(orgA,igA.id);
  data={authorizationUrl:'https://www.instagram.com/oauth/authorize',expiresAt:'2099-01-01T00:00:00Z'};await api.startMetaOAuth(orgB,'instagram');
  data=v1;equal(await api.getMetaStatus(orgB),v1);
  data={items:[]};await api.listMetaConnections(orgB);await api.listMetaAssets(orgB,igA.id);
  data=igA;await api.selectMetaAssets(orgB,igA.id,[]);await api.testMetaConnection(orgB,igA.id);await api.revokeMetaConnection(orgB,igA.id);
  equal(calls.map(c=>new URL(c.url).pathname+new URL(c.url).search), ['/meta/status?contractVersion=2','/meta/connections?contractVersion=2',`/meta/connections/${igA.id}/assets?contractVersion=2`,`/meta/connections/${igA.id}/assets?contractVersion=2`,`/meta/connections/${igA.id}/test?contractVersion=2`,`/meta/connections/${igA.id}/revoke?contractVersion=2`,'/meta/oauth/start','/meta/status','/meta/connections',`/meta/connections/${igA.id}/assets`,`/meta/connections/${igA.id}/assets`,`/meta/connections/${igA.id}/test`,`/meta/connections/${igA.id}/revoke`]);
  equal(calls.map(c=>c.init.method),['GET','GET','GET','POST','POST','POST','POST','GET','GET','GET','POST','POST','POST']);
  equal(calls.filter(c=>c.init.body).map(c=>JSON.parse(c.init.body)),[{assetIds:[]},{},{},{channel:'instagram'},{assetIds:[]},{},{}]);
  for (const [i,c] of calls.entries()) {assert.equal(c.init.headers['x-organization-id'],i<6?orgA:orgB);assert.equal(c.init.headers.authorization,'Bearer fixture-only');assert.equal(c.init.cache,'no-store');}
});
test('V2 fallback is explicit read only; no downgrade for 401/403/404/409/422/503, timeout or malformed V2',async()=>{
  let calls=0,next=response(v1);const api=transport(async()=>{calls++;return next;});
  equal(await api.readMetaConnectionsV2(orgA),{version:1,status:v1});assert.equal(calls,1);
  for (const [http,code] of [[401,'UNAUTHORIZED'],[403,'FORBIDDEN_ORGANIZATION'],[404,'NOT_FOUND'],[409,'ASSET_CONFLICT'],[422,'VALIDATION_ERROR'],[503,'FEATURE_DISABLED'],[503,'META_NOT_CONFIGURED']]) {next=response({code,message:'fixture'},http);const before=calls;await assert.rejects(api.readMetaConnectionsV2(orgA),e=>e.status===http&&e.code===code);assert.equal(calls,before+1);}
  for (const bad of [{...v1,contractVersion:2},{...v1,contractVersion:1},{...v1,connections:[]},{...statusA,contractVersion:3},{...statusA,connections:[igA,igA]},{...statusA,connections:[{...igA,assets:[{...igA.assets[0],connectionId:igA2.id}]}]},{...statusA,connections:[{...igA,oauthProduct:'other'}]},{...statusA,connections:[{...igA,credentialState:'unknown'}]}]) {next=response(bad);await assert.rejects(api.readMetaConnectionsV2(orgA),e=>e.code==='INVALID_API_RESPONSE');}
  let network=0;const failure=transport(async()=>{network++;throw Error('fixture timeout');});await assert.rejects(failure.readMetaConnectionsV2(orgA),e=>e.code==='NETWORK_ERROR');assert.equal(network,1);
  const controller=new AbortController();controller.abort();await assert.rejects(api.readMetaConnectionsV2(orgA,controller.signal),e=>e.code==='REQUEST_TIMEOUT');
});
test('V2 mutation validates IDs, response target, no V1 or automatic retry after ambiguous result',async()=>{
  let calls=0,data=igA2;const api=transport(async()=>{calls++;return response(data);});
  for(const ids of [[igA.assets[0].id,igA.assets[0].id],['bad'],Array.from({length:501},(_,i)=>fixture.id(1000+i))])await assert.rejects(api.selectMetaAssetsV2(orgA,igA.id,ids),e=>e.status===422);
  await assert.rejects(api.testMetaConnectionV2(orgA,'external-id'),e=>e.status===422);assert.equal(calls,0);
  await assert.rejects(api.revokeMetaConnectionV2(orgA,igA.id),e=>e.code==='INVALID_API_RESPONSE');assert.equal(calls,1);
  data={...igA};delete data.oauthProduct;await assert.rejects(api.testMetaConnectionV2(orgA,igA.id),e=>e.code==='INVALID_API_RESPONSE');assert.equal(calls,2);
  data={contractVersion:2,items:igA2.assets};await assert.rejects(api.listMetaAssetsV2(orgA,igA.id),e=>e.code==='INVALID_API_RESPONSE');assert.equal(calls,3);
});
test('MT29 cards: multiple grants/products/states, independent selections, explicit revoke confirmation and no aggregate Ads permission',async()=>{
  const writes=[];let current=statusA;
  const api=stub({readMetaConnectionsV2:async()=>({version:2,status:current}),selectMetaAssetsV2:async(o,id,ids)=>{writes.push([o,id,ids]);const c=current.connections.find(c=>c.id===id);const result={...c,assets:c.assets.map(a=>({...a,selected:ids.includes(a.id)}))};current={...current,connections:current.connections.map(x=>x.id===id?result:x)};return result;},revokeMetaConnectionV2:async(o,id)=>{writes.push([o,id,'revoke']);const c=current.connections.find(c=>c.id===id);const result={...c,state:'revoked',credentialState:'revoked',assets:c.assets.map(a=>({...a,selected:false}))};current={...current,connections:current.connections.map(x=>x.id===id?result:x)};return result;}});
  const {u,b,campaigns}=ui(api,{canReadCampaigns:true,canWriteCampaigns:true});let tree=await ready(u);
  assert.match(text(tree),/Instagram A1 fictício/);assert.match(text(tree),/Instagram A2 fictício/);assert.match(text(tree),/Facebook \(fluxo manual\)/);assert.match(text(tree),/Credencial expirada/);assert.match(text(tree),/Credencial revogada/);assert.match(text(tree),/Configuração ou validade não comprovada/);assert.doesNotMatch(text(tree),/Instagram B fictício/);
  const campaign=find(tree,e=>e.type===campaigns);assert.equal(campaign.props.status,null);assert.equal(campaign.props.canWrite,false);
  assert.equal(checkboxes(card(tree,igA.id))[0].props.checked,true);assert.equal(checkboxes(card(tree,igA2.id))[0].props.checked,false);
  checkboxes(card(tree,igA2.id))[0].props.onChange({target:{checked:true}});tree=u.render();assert.equal(button(card(tree,igA.id),'Salvar seleção').props.disabled,true);assert.equal(button(card(tree,igA2.id),'Salvar seleção').props.disabled,false);
  click(card(tree,igA2.id),'Salvar seleção');await settle();tree=u.render();await settle();tree=u.render();equal(writes,[[orgA,igA2.id,[igA2.assets[0].id]]]);assert.equal(checkboxes(card(tree,igA.id))[0].props.checked,true);assert.equal(checkboxes(card(tree,igA2.id))[0].props.checked,true);
  b.setConsent(false);click(card(tree,igA.id),'Revogar localmente');assert.equal(writes.length,1);b.setConsent(true);click(card(tree,igA.id),'Revogar localmente');await settle();u.render();await settle();tree=u.render();equal(writes[1],[orgA,igA.id,'revoke']);assert.match(b.confirms[1],/revogação remota na Meta não está confirmada/);assert.match(b.confirms[1],new RegExp(igA.id));assert.equal(button(card(tree,igA.id),'Revogar localmente').props.disabled,true);assert.equal(checkboxes(card(tree,igA2.id))[0].props.checked,true);u.unmount();
});
test('MT29 read-only, explicit V1 fallback, empty V2, permissions/config errors and no fallback mutation',async()=>{
  let writes=0;const api=stub({startMetaOAuth:async()=>{writes++;throw new AppApiError('fixture','FEATURE_DISABLED',503);}});
  let {u}=ui(api,{canManage:false});let t=await ready(u);assert.equal(button(t,'Conectar Facebook').props.disabled,true);assert.equal(button(card(t,igA.id),'Revogar localmente').props.disabled,true);click(t,'Conectar Facebook');assert.equal(writes,0);u.unmount();
  ({u}=ui(stub({readMetaConnectionsV2:async()=>({version:1,status:v1})})));t=await ready(u);assert.match(text(t),/Compatibilidade V1 — somente leitura/);assert.equal(button(t,'Conectar Facebook'),undefined);u.unmount();
  ({u}=ui({...api,readMetaConnectionsV2:async()=>({version:2,status:empty})}));t=await ready(u);assert.match(text(t),/Nenhuma conexão registrada/);click(t,'Conectar Facebook');await settle();t=u.render();assert.match(text(t),/FEATURE_DISABLED/);assert.equal(writes,1);assert.equal(button(t,'Conectar Facebook'),undefined);u.unmount();
  ({u}=ui(stub({readMetaConnectionsV2:async()=>{throw new AppApiError('fixture','FORBIDDEN_ORGANIZATION',403);}})));t=await ready(u);assert.match(text(t),/Acesso não autorizado/);assert.doesNotMatch(text(t),/Nenhuma conexão registrada/);assert.equal(button(t,'Conectar Facebook'),undefined);u.unmount();
});
test('MT29 A→B: abort read/action and discard late result, no cross-tenant selection or redirect',async()=>{
  const d=deferred(),action=deferred();let signal,actionSignal;
  const api=stub({readMetaConnectionsV2:(o,s)=>{if(o===orgA){signal=s;return d.promise;}return Promise.resolve({version:2,status:statusB});}});
  const a=ui(api),b=ui(api,{organizationId:orgB});a.u.render();a.u.unmount();assert.equal(signal.aborted,true);assert.notEqual(a.outer.key,b.outer.key);let t=await ready(b.u);d.resolve({version:2,status:statusA});await settle();t=b.u.render();assert.match(text(t),/Instagram B fictício/);assert.doesNotMatch(text(t),/Instagram A1 fictício/);b.u.unmount();
  const a2=ui(stub({testMetaConnectionV2:(o,id,s)=>{assert.equal(o,orgA);assert.equal(id,igA.id);actionSignal=s;return action.promise;}}));t=await ready(a2.u);click(card(t,igA.id),'Testar conexão');a2.u.unmount();assert.equal(actionSignal.aborted,true);action.resolve(igA);await settle();
  const oauth=deferred(),a3=ui(stub({startMetaOAuth:()=>oauth.promise}));t=await ready(a3.u);click(t,'Conectar Facebook');a3.u.unmount();oauth.resolve({authorizationUrl:'https://www.facebook.com/dialog/oauth',expiresAt:'2099-01-01T00:00:00Z'});await settle();equal(a3.b.calls,[]);
});
test('MT29 callback: original tenant only, explicit fresh list, no selection, error return, absent origin fails closed in V2',async()=>{
  const reads=[],list=[];let selection=0;
  const api=stub({readMetaConnectionsV2:async(o)=>{reads.push(o);return {version:2,status:statusA};},listMetaConnectionsV2:async(o)=>{list.push(o);return {contractVersion:2,items:[igA2,igA]};},selectMetaAssetsV2:async()=>{selection++;}});
  const storage=new Map([['escala.meta.v2.oauth-origin',JSON.stringify({organizationId:orgA,expiresAt:Date.now()+60000})]]);
  const b=browser('?connection=success',storage);const other=ui(api,{organizationId:orgB},b);let t=await ready(other.u);assert.match(text(t),/Selecione a organização que iniciou/);equal(reads,[]);equal(list,[]);other.u.unmount();
  const original=ui(api,{},b);t=await ready(original.u);equal(reads,[orgA]);equal(list,[orgA]);assert.match(text(t),/nenhum ativo foi selecionado automaticamente/);assert.equal(checkboxes(card(t,igA2.id))[0].props.checked,false);assert.equal(selection,0);assert.equal(storage.size,0);assert.equal(b.globals.location.search,'?metaContractVersion=2');original.u.unmount();
  storage.set('escala.meta.v2.oauth-origin',JSON.stringify({organizationId:orgA,expiresAt:Date.now()+60000}));const err=ui(api,{},browser('?connection=error',storage));t=await ready(err.u);assert.match(text(t),/retorno OAuth informou erro/);equal(list,[orgA,orgA]);err.u.unmount();
  const missing=ui(api,{},browser('?connection=success&metaContractVersion=2'));t=await ready(missing.u);assert.match(text(t),/Origem da autorização ausente ou expirada/);equal(reads,[orgA,orgA]);missing.u.unmount();
});
test('MT29 ambiguous write blocks until explicit read; never retries or silently invokes V1',async()=>{
  let calls=0,reads=0;const api=stub({readMetaConnectionsV2:async()=>{reads++;return {version:2,status:statusA};},revokeMetaConnectionV2:async()=>{calls++;throw new AppApiError('fixture','REQUEST_TIMEOUT');},revokeMetaConnection:async()=>{throw Error('unexpected V1');}});
  const {u}=ui(api);let t=await ready(u);const revoke=button(card(t,igA.id),'Revogar localmente').props.onClick;revoke();revoke();await settle();t=u.render();assert.equal(calls,1);assert.equal(reads,1);assert.match(text(t),/Nenhuma ação foi reenviada automaticamente/);assert.equal(card(t,igA.id),undefined);click(t,'Atualizar estado');u.render();await settle();t=u.render();assert.equal(reads,2);assert.equal(calls,1);assert.equal(button(card(t,igA.id),'Revogar localmente').props.disabled,false);u.unmount();
});
test('V2 OAuth: explicit channel, tab-local origin only, trusted destination and no second start with pending origin',async()=>{
  const calls=[];let next={authorizationUrl:'https://www.instagram.com/oauth/authorize?state=fixture-only',expiresAt:'2099-01-01T00:00:00Z'};
  const api=stub({startMetaOAuth:async(o,c,s)=>{calls.push([o,c,s]);return next;}});
  const {u,b}=ui(api);let t=await ready(u);find(t,e=>e.type==='input'&&e.props.type==='radio'&&!e.props.checked).props.onChange();t=u.render();click(t,'Conectar Instagram');await settle();assert.equal(calls.length,1);equal(calls[0].slice(0,2),[orgA,'instagram']);equal(b.calls,[next.authorizationUrl]);
  const raw=b.storage.get('escala.meta.v2.oauth-origin');const marker=JSON.parse(raw);assert.equal(marker.organizationId,orgA);assert.ok(marker.expiresAt>Date.now()&&marker.expiresAt<=Date.now()+600000);equal(Object.keys(marker).sort(),['expiresAt','organizationId']);assert.doesNotMatch(raw,/state|token|fixture-only/);
  t=u.render();click(t,'Conectar Instagram');await settle();assert.equal(calls.length,1);assert.equal(b.calls.length,1);assert.match(text(u.render()),/autorização em andamento/);u.unmount();
  next={...next,authorizationUrl:'https://www.facebook.com/dialog/oauth?state=fixture'};const bad=ui(api);t=await ready(bad.u);find(t,e=>e.type==='input'&&e.props.type==='radio'&&!e.props.checked).props.onChange();click(bad.u.render(),'Conectar Instagram');await settle();assert.equal(bad.b.calls.length,0);assert.equal(bad.b.storage.size,0);assert.match(text(bad.u.render()),/autorização Instagram válida/);bad.u.unmount();
});
test('MT29 callback list delayed: unmount before completion cannot clear original marker or change tenant B',async()=>{
  const d=deferred();let signal;const reads=[];const marker=JSON.stringify({organizationId:orgA,expiresAt:Date.now()+60000});const storage=new Map([['escala.meta.v2.oauth-origin',marker]]);const b=browser('?connection=success',storage);
  const api=stub({readMetaConnectionsV2:async o=>{reads.push(o);return {version:2,status:statusA};},listMetaConnectionsV2:(o,s)=>{assert.equal(o,orgA);signal=s;return d.promise;}});
  const a=ui(api,{},b);a.u.render();await settle();assert.ok(signal);a.u.unmount();assert.equal(signal.aborted,true);const other=ui(api,{organizationId:orgB},b);await ready(other.u);d.resolve({contractVersion:2,items:[igA]});await settle();assert.equal(storage.get('escala.meta.v2.oauth-origin'),marker);assert.equal(b.globals.location.search,'?connection=success');equal(reads,[orgA]);assert.match(text(other.u.render()),/Selecione a organização que iniciou/);assert.doesNotMatch(text(other.u.render()),/Instagram A1 fictício/);other.u.unmount();
});
