// ORQ052 synthetic fixtures: no network, credentials, provider, React DOM or external effect.
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

const originalLegalHash = "551645da5f6be9d6b1fa767999cfdcaf217ce3cc6da3f9bc7a94e702450dc346";
const org=id(10), orgB=id(11);
const response=(data,status=200)=>({ok:status===200,status,json:async()=>status===200?{success:true,data}:{success:false,error:data}});
const status={connection:null,mode:'live',capabilities:[]};
const validUrl='https://www.instagram.com/oauth/authorize?state=fixture';
const authorization=(url=validUrl)=>({authorizationUrl:url,expiresAt:'2099-01-01T00:00:00Z'});
function transport(fetch){return load('src/services/metaApi.ts',{'../auth/session':{ensureValidAuthSession:async()=>({accessToken:'fixture-only'})},'./appApi':{AppApiError}},{fetch});}
function marketing(api, props={}, assign=()=>{}) {
  const mod=load('src/app/pages/MarketingPage.tsx',{react,'react/jsx-runtime':runtime,'../../services/appApi':{AppApiError},'../../services/metaApi':api,'./meta.css':{},'./MetaAutomationSection':{MetaAutomationSection:()=>null},'./MetaCampaignSection':{MetaCampaignSection:()=>null},'./MetaInsightsSection':{MetaInsightsSection:()=>null}},{location:{pathname:'/app/marketing/',assign}});
  const outer=mod.MarketingPage({organizationId:org,canManage:true,canReadAutomation:false,automationGrants:{},canReadInsights:false,canReadCampaigns:false,canWriteCampaigns:false,...props});
  return {outer,u:instance(outer)};
}
const selectInstagram=tree=>find(tree,e=>e.type==='input'&&e.props.type==='radio'&&!e.props.checked).props.onChange();
async function ready(u){u.render();await settle();return u.render();}
function stub(overrides={}){return {getMetaStatus:async()=>status,startMetaOAuth:async()=>authorization(),...overrides};}

test('ORQ052 legal: original body byte-for-byte after heading abstraction; single source for modal and pages',()=>{
  const source=fs.readFileSync(path.join(root,'src/components/legal/LegalContent.tsx'),'utf8');
  const body=source.slice(source.indexOf('export const WHATSAPP_DISPLAY'),source.indexOf('export function LegalContent')).trim().replace('export const WHATSAPP_DISPLAY','const WHATSAPP_DISPLAY').replaceAll('({ heading: Heading }: { heading: "h2" | "h3" })','()').replaceAll('<Heading>','<h3>').replaceAll('</Heading>','</h3>');
  assert.equal(require('node:crypto').createHash('sha256').update(body).digest('hex'),originalLegalHash);
  const mod=load('src/components/legal/LegalContent.tsx',{'react/jsx-runtime':runtime});
  const page=load('src/components/legal/LegalPage.tsx',{'react/jsx-runtime':runtime,'./LegalContent':mod,'../../assets/brand/escala-imob-white.png':{default:'fixture-brand'}});
  const modal=load('src/components/legal/LegalModal.tsx',{react,'react/jsx-runtime':runtime,'./LegalContent':mod},{window:{document:{body:{style:{overflow:''}}},addEventListener(){},removeEventListener(){}}});
  for(const doc of ['privacy','terms']){
    const p=page.LegalPage({document:doc}), m=instance(jsx(modal.LegalModal,{document:doc,onClose(){}}));
    const modalTree=m.render();const pageContent=find(p,e=>e.type===mod.LegalContent);const modalContent=find(modalTree,e=>e.type===mod.LegalContent);
    assert.equal(pageContent.props.document,doc);assert.equal(pageContent.props.heading,'h2');assert.equal(modalContent.props.document,doc);
    assert.equal(find(p,e=>e.type==='h1').props.id,'legal-page-title');assert.equal(find(modalTree,e=>e.props.role==='dialog').props['aria-modal'],'true');
    const content=(props)=>mod.LegalContent(props);const h2=content(pageContent.props), h3=content(modalContent.props);
    const expanded=(node)=>node.type(node.props);
    assert.equal(text(expanded(h2)),text(expanded(h3)));assert.equal(flatten(expanded(h2)).filter(e=>e.type==='h2').length,doc==='privacy'?11:9);
    assert.equal(find(modalTree,e=>e.type==='a'&&e.props.href===mod.legalDocuments[doc].path).props.target,'_blank');m.unmount();
  }
  const del=page.LegalPage({document:'deletion'});const instructions=find(del,e=>typeof e.type==='function'&&e.type.name==='DeletionInstructions');const tree=instructions.type();assert.match(text(tree),/não é uma exclusão automática/);assert.match(text(tree),/\+55 48 9995-7901/);assert.match(text(tree),/não coleta dados/);assert.equal(find(tree,e=>['form','input','textarea','button'].includes(e.type)),undefined);
  for(const doc of ['privacy','terms','deletion']) {const t=page.LegalPage({document:doc});assert.equal(flatten(t).filter(e=>e.props?.['aria-current']==='page').length,1);}
});
test('ORQ052 legal: independent HTML inputs, no app/auth/API entry, landing retains modal buttons and real links',()=>{
  const content=load('src/components/legal/LegalContent.tsx',{'react/jsx-runtime':runtime});const mockModal=()=>null;
  const notice=load('src/components/legal/LegalNotice.tsx',{react,'react/jsx-runtime':runtime,'./LegalContent':content,'./LegalModal':{LegalModal:mockModal}});
  const u=instance(jsx(notice.LegalNotice,{}));let tree=u.render();button(tree,'Termos de Uso').props.onClick();tree=u.render();assert.equal(find(tree,e=>e.type===mockModal).props.document,'terms');find(tree,e=>e.type===mockModal).props.onClose();tree=u.render();button(tree,'Política de Privacidade').props.onClick();assert.equal(find(u.render(),e=>e.type===mockModal).props.document,'privacy');
  const config=fs.readFileSync(path.join(root,'vite.config.ts'),'utf8');
  for(const [route,doc] of [[content.legalDocuments.privacy.path,'privacy'],[content.legalDocuments.terms.path,'terms'],[content.dataDeletionPath,'deletion']]){
    assert.ok(config.includes(`"${route.slice(1)}index.html"`));const html=fs.readFileSync(path.join(root,route.slice(1),'index.html'),'utf8');assert.ok(html.includes(`data-legal-document="${doc}"`));assert.ok(html.includes('/src/components/legal/legal-entry.tsx'));assert.ok(!html.includes('/src/main.tsx'));assert.ok(find(tree,e=>e.type==='a'&&e.props.href===route&&e.props.rel==='noopener noreferrer'));
  }
  const entry=fs.readFileSync(path.join(root,'src/components/legal/legal-entry.tsx'),'utf8');assert.ok(!/auth|services|fetch\(/i.test(entry));
  const css=fs.readFileSync(path.join(root,'src/components/legal/legal-page.css'),'utf8');assert.ok(!/@import|https?:\/\//.test(css));assert.match(css,/focus-visible/);assert.match(css,/flex-wrap: wrap/);u.unmount();
});
test('ORQ052 HTTP: explicit instagram and previous null, Bearer + organization header, errors 403/503 unchanged',async()=>{
  const calls=[];let next=response(authorization());const api=transport(async(url,init)=>{calls.push({url,init});return next;});
  await api.startMetaOAuth(org,'instagram');await api.startMetaOAuth(orgB,null);
  assert.deepEqual(calls.map(c=>JSON.parse(c.init.body)),[{channel:'instagram'},{channel:null}]);
  for(const [i,c] of calls.entries()){assert.equal(c.url,'https://fixture.invalid/meta/oauth/start');assert.equal(c.init.method,'POST');assert.equal(c.init.headers.authorization,'Bearer fixture-only');assert.equal(c.init.headers['x-organization-id'],i===0?org:orgB);assert.equal(c.init.cache,'no-store');}
  for(const [code,http] of [['FORBIDDEN',403],['META_PERMISSION_REQUIRED',503]]){next=response({code,message:'fixture'},http);await assert.rejects(api.startMetaOAuth(org,'instagram'),e=>e.code===code&&e.status===http);}
});
test('ORQ052 UI: Facebook default and explicit Instagram; no redirect on different provider, expired or insecure URL',async()=>{
  const calls=[],dest=[];let reply=authorization('https://www.facebook.com/v27.0/dialog/oauth?state=fixture');const api=stub({startMetaOAuth:async(o,c,s)=>{calls.push({o,c,s});return reply;}});
  const {u}=marketing(api,{},url=>dest.push(url));let tree=await ready(u);assert.equal(calls.length,0);button(tree,'Conectar Meta').props.onClick();await settle();assert.equal(calls[0].c,null);assert.equal(dest.length,1);
  tree=u.render();selectInstagram(tree);tree=u.render();assert.equal(calls.length,1);
  for(const r of [reply,authorization('https://instagram.com.evil.invalid/oauth/authorize'),authorization('https://www.instagram.com:444/oauth/authorize'),authorization('http://www.instagram.com/oauth/authorize'),{...authorization(),expiresAt:'2000-01-01T00:00:00Z'}]){reply=r;button(u.render(),'Conectar Instagram').props.onClick();await settle();assert.equal(dest.length,1);assert.ok(find(u.render(),e=>e.props.role==='alert'));}
  reply=authorization();button(u.render(),'Conectar Instagram').props.onClick();await settle();assert.equal(dest.at(-1),validUrl);assert.equal(dest.length,2);assert.ok(calls.slice(1).every(c=>c.c==='instagram'&&c.o===org));assert.match(text(u.render()),/Nenhuma conexão registrada/);u.unmount();
});
test('ORQ052 UI: 403/503 distinct, deny retry until refresh, no mock or other product gate; test mode and read-only disabled',async()=>{
  for(const [http,code,label] of [[403,'FORBIDDEN','Acesso não autorizado'],[503,'META_PERMISSION_REQUIRED','Integração indisponível']]){
    let calls=0;const {u}=marketing(stub({startMetaOAuth:async()=>{calls++;throw new AppApiError('fixture',code,http);}}));let tree=await ready(u);selectInstagram(tree);button(u.render(),'Conectar Instagram').props.onClick();await settle();tree=u.render();assert.match(text(tree),new RegExp(label));assert.equal(button(tree,'Conectar Instagram').props.disabled,true);button(tree,'Conectar Instagram').props.onClick();assert.equal(calls,1);assert.match(text(tree),/Nenhuma conexão registrada/);assert.doesNotMatch(text(tree),/Operação recebida/);button(tree,'Atualizar estado').props.onClick();u.render();await settle();assert.equal(button(u.render(),'Conectar Instagram').props.disabled,false);u.unmount();
  }
  for(const [mode,canManage] of [['test',true],['live',false]]){let calls=0;const {u}=marketing(stub({getMetaStatus:async()=>({...status,mode}),startMetaOAuth:async()=>{calls++;return authorization();}}),{canManage});const tree=await ready(u);assert.equal(find(tree,e=>e.type==='fieldset').props.disabled,true);assert.equal(button(tree,'Conectar Meta').props.disabled,true);button(tree,'Conectar Meta').props.onClick();assert.equal(calls,0);u.unmount();}
});
test('ORQ052 isolation: tenant and permission keyed reset; in-flight OAuth aborted; late result ignored; no duplicate request',async()=>{
  const d=deferred();const calls=[],dest=[];const api=stub({startMetaOAuth:(o,c,s)=>{calls.push({o,c,s});return d.promise;}});
  const a=marketing(api,{},url=>dest.push(url));let tree=await ready(a.u);selectInstagram(tree);tree=a.u.render();const click=button(tree,'Conectar Instagram').props.onClick;click();click();assert.equal(calls.length,1);assert.equal(calls[0].s.aborted,false);
  const b=marketing(api,{organizationId:orgB},url=>dest.push(url));assert.notEqual(a.outer.key,b.outer.key);const readOnly=marketing(api,{canManage:false});assert.notEqual(a.outer.key,readOnly.outer.key);a.u.unmount();assert.equal(calls[0].s.aborted,true);await ready(b.u);d.resolve(authorization());await settle();assert.deepEqual(dest,[]);assert.equal(button(b.u.render(),'Conectar Meta').props.disabled,false);assert.doesNotMatch(text(b.u.render()),/Operação recebida/);b.u.unmount();
  const read=deferred();let signal;const waiting=marketing(stub({getMetaStatus:(o,s)=>{signal=s;return read.promise;}}));waiting.u.render();waiting.u.unmount();assert.equal(signal.aborted,true);read.resolve(status);await settle();
});
