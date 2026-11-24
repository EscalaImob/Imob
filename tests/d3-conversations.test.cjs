// Explicit D3 synthetic fixtures: no network, credentials, or browser.
// Run: node --test tests/d3-conversations.test.cjs
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
  vm.runInNewContext(result.outputText, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Error, Date, Intl, URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout, ...globals }, { filename: file });
  return exports;
}
class AppApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner = id(6), other = id(7), org = id(10), orgB = id(11);
const thread = { id: id(3), channel:'instagram', assetId:id(2), externalThreadId:'fake-thread-001', contactId:null, leadId:null, opportunityId:null, propertyId:null, assigneeMembershipId:owner, status:'open', participantName:'Contato fictício', lastMessageAt:'2026-11-24T12:00:00Z', windowEndsAt:'2099-01-01T00:00:00Z', optOut:false, canSend:true, sendBlockedReason:null };
const msg = (n, extra={}) => ({ id:id(n), threadId:thread.id, externalMessageId:`fake-message-${n}`, direction:'inbound', text:`Mensagem fictícia ${n}`, status:'received', createdAt:`2026-11-24T12:00:${String(n).padStart(2,'0')}Z`, ...extra });
const page = (items, p=1, total=items.length, pages=1) => ({items,page:p,pageSize:20,totalItems:total,totalPages:pages});
const response = (data,status=200) => ({ok:status===200,status,json:async()=>status===200?{success:true,data}:{success:false,error:data}});
function transport(fetch) {
  const meta = load('src/services/metaApi.ts', {'../auth/session':{ensureValidAuthSession:async()=>({accessToken:'fixture-only'})},'./appApi':{AppApiError}}, {fetch});
  return {meta, api:load('src/services/conversationsApi.ts',{'./appApi':{AppApiError},'./metaApi':meta})};
}
test('D3 contrato HTTP: filtros/paginação, headers tenant/ator, payloads exatos, null e close',async()=>{
  const calls=[];
  const {api}=transport(async(url,init)=>{calls.push({url,init});const p=new URL(url);if(init.method==='GET')return response(p.pathname.endsWith('/messages')?page([msg(4)],2,21,2):page([thread],2,21,2));const body=JSON.parse(init.body);return response(p.pathname.endsWith('/messages')?msg(5,{direction:'outbound',status:'pending',externalMessageId:null}):p.pathname.endsWith('/assign')?{...thread,assigneeMembershipId:body.membershipId,canSend:false,sendBlockedReason:'HANDOFF_REQUIRED'}:{...thread,status:'closed',canSend:false,sendBlockedReason:'CONVERSATION_CLOSED'});});
  const controller=new AbortController();
  assert.equal((await api.listConversations(org,{channel:'instagram',status:'open',assigneeMembershipId:owner,page:2},controller.signal)).totalItems,21);
  assert.deepEqual(Object.fromEntries(new URL(calls[0].url).searchParams),{page:'2',pageSize:'20',channel:'instagram',status:'open',assigneeMembershipId:owner});
  assert.equal((await api.listMessages(org,thread.id,2,20,controller.signal)).items[0].text,'Mensagem fictícia 4');
  assert.equal((await api.sendMessage(org,thread.id,{text:'  resposta fictícia  ',idempotencyKey:'fixture-001'},controller.signal)).status,'pending');
  await api.assignConversation(org,thread.id,null,controller.signal); await api.assignConversation(org,thread.id,other,controller.signal); await api.closeConversation(org,thread.id,controller.signal);
  assert.deepEqual(calls.slice(2).map(c=>JSON.parse(c.init.body)),[{text:'resposta fictícia',idempotencyKey:'fixture-001'},{membershipId:null},{membershipId:other},{}]);
  for(const c of calls){assert.equal(c.init.headers['x-organization-id'],org);assert.equal(c.init.headers.authorization,'Bearer fixture-only');assert.equal(c.init.cache,'no-store');assert.ok(c.init.signal);}
  for(const invalid of [{text:'  ',idempotencyKey:'x'},{text:'a'.repeat(1001),idempotencyKey:'x'},{text:'x',idempotencyKey:'!'}])await assert.rejects(api.sendMessage(org,thread.id,invalid),{code:'VALIDATION_ERROR'});
  await assert.rejects(api.listConversations(org,{assigneeMembershipId:'invalid'}),{code:'VALIDATION_ERROR'});await assert.rejects(api.listMessages(org,thread.id,0),{code:'VALIDATION_ERROR'});assert.equal(calls.length,6);
});
test('D3 contrato: envelope de erro preservado, resposta inválida não vira empty, tenant/thread e cancelamento',async()=>{
  let calls=0;let next=response({code:'OPT_OUT',message:'Bloqueado'},403);
  const {api,meta}=transport(async()=>{calls++;return next;});
  for(const [code,status] of [['OPT_OUT',403],['WINDOW_CLOSED',403],['IDEMPOTENCY_CONFLICT',409],['META_UNAVAILABLE',503],['CONNECTION_REVOKED',409],['NOT_FOUND',404],['FORBIDDEN',403]]){next=response({code,message:'Fixture'},status);await assert.rejects(api.listConversations(org),e=>e instanceof meta.MetaError&&e.code===code&&e.status===status);}
  next=response({items:[]});await assert.rejects(api.listConversations(org),{code:'INVALID_API_RESPONSE'});
  next=response(page([msg(4,{threadId:id(99)})]));await assert.rejects(api.listMessages(org,thread.id),{code:'INVALID_API_RESPONSE'});
  const c=new AbortController();c.abort();const before=calls;await assert.rejects(api.listConversations(orgB,{},c.signal),{code:'REQUEST_TIMEOUT'});assert.equal(calls,before);
});
// Hook/JSX double: verifies component state transitions and request cancellation, not browser/React DOM.
let current;
const react={
  useState(initial){const c=current,i=c.index++;if(!(i in c.state))c.state[i]=typeof initial==='function'?initial():initial;return[c.state[i],v=>{c.state[i]=typeof v==='function'?v(c.state[i]):v;}];},
  useRef(initial){const c=current,i=c.index++;if(!(i in c.state))c.state[i]={current:initial};return c.state[i];},
  useEffect(fn,deps){const c=current,i=c.index++;const old=c.effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))c.queue.push(()=>{old?.cleanup?.();c.effects[i]={deps,cleanup:fn()};});},
};react.useLayoutEffect=react.useEffect;
const jsx=(type,props,key)=>({type,props,key});
function instance(element){return{element,index:0,state:[],effects:[],queue:[],render(){current=this;this.index=0;this.queue=[];const tree=this.element.type(this.element.props);current=null;this.queue.forEach(fn=>fn());return tree;},unmount(){this.effects.forEach(e=>e?.cleanup?.());}};}
function flatten(tree){if(tree==null||typeof tree==='boolean')return[];if(Array.isArray(tree))return tree.flatMap(flatten);if(typeof tree!=='object')return[tree];return[tree,...flatten(tree.props?.children)];}
const text=tree=>flatten(tree).filter(x=>typeof x==='string'||typeof x==='number').join(' ').replace(/\s+/g,' ').trim();
const find=(tree,p)=>flatten(tree).find(x=>typeof x==='object'&&p(x));
const button=(tree,label)=>find(tree,e=>e.type==='button'&&text(e)===label);
const select=(tree,label)=>find(tree,e=>e.type==='label'&&text(e).startsWith(label))?.props.children.find(e=>e?.type==='select');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function ui(opts={}){
  const calls=[];const api={
    isUuid:v=>typeof v==='string'&&v.startsWith('10000000-'),
    listConversations:(o,f,s)=>{calls.push(['list',o,f,s]);return(opts.list||(()=>Promise.resolve(page([thread]))))(o,f,s);},
    listMessages:(o,t,p,ps,s)=>{calls.push(['messages',o,t,p,s]);return(opts.history||(()=>Promise.resolve(page([msg(4)]))))(o,t,p,ps,s);},
    sendMessage:(o,t,input,s)=>{calls.push(['send',o,t,input,s]);return(opts.send||(()=>Promise.resolve(msg(8,{direction:'outbound',status:'pending'}))))(o,t,input,s);},
    assignConversation:(o,t,m,s)=>{calls.push(['assign',o,t,m,s]);return Promise.resolve({...thread,assigneeMembershipId:m});},
    closeConversation:(o,t,s)=>{calls.push(['close',o,t,s]);return Promise.resolve({...thread,status:'closed',canSend:false,sendBlockedReason:'CONVERSATION_CLOSED'});},
  };
  const meta={getMetaStatus:async()=>({connection:null,mode:'test',capabilities:[]}),requestMeta:async(o,p,s)=>{calls.push(['lookup',o,p,s]);return opts.lookup?opts.lookup(o,p,s):[];}};
  const pageApi=load('src/app/pages/ConversationsPage.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'../../services/appApi':{AppApiError},'../../services/metaApi':meta,'../../services/conversationsApi':api,'./meta.css':{}},{setInterval:()=>1,clearInterval(){},confirm:()=>opts.confirm!==false,crypto:{randomUUID:()=>`fixture-${calls.length}`}});
  const props={organizationId:org,membershipId:owner,canSend:true,canAssign:true,canReadMembers:false,canReadMeta:false,canReadContact:false,canReadOpportunity:false,canReadProperty:false,...opts.props};
  return{calls,pageApi,props,workspace:instance(pageApi.ConversationsPage(props))};
}
async function open(u){u.workspace.render();await settle();let tree=u.workspace.render();const item=find(tree,e=>e.type==='button'&&typeof e.props['aria-pressed']==='boolean');assert.ok(item);if(!item.props['aria-pressed'])item.props.onClick();tree=u.workspace.render();const detail=instance(find(tree,e=>typeof e.type==='function'&&e.type.name==='ConversationDetail'));detail.render();await settle();return detail;}
function formSubmit(tree){find(tree,e=>e.type==='form').props.onSubmit({preventDefault(){}});}
function changeDraft(tree,value){find(tree,e=>e.type==='textarea').props.onChange({target:{value}});}
test('D3 lista UI: loading, empty, filtros server-side, próxima página e 403/503 sem empty',async()=>{
  const u=ui({list:async(_o,f)=>f.channel?page([],1,0,0):page([thread],f.page,21,2)});
  assert.match(text(u.workspace.render()),/Carregando conversas/);await settle();let tree=u.workspace.render();assert.match(text(tree),/21 conversa/);
  button(tree,'Próxima').props.onClick();u.workspace.render();await settle();tree=u.workspace.render();assert.equal(u.calls.at(-1)[2].page,2);
  select(tree,'Canal').props.onChange({target:{value:'instagram'}});assert.match(text(u.workspace.render()),/Carregando conversas/);await settle();tree=u.workspace.render();assert.equal(u.calls.at(-1)[2].channel,'instagram');assert.equal(u.calls.at(-1)[2].page,1);assert.match(text(tree),/Nenhuma conversa encontrada/);
  for(const [status,code,label] of [[403,'FORBIDDEN',/não permite/],[503,'META_UNAVAILABLE',/indisponível/]]){const v=ui({list:async()=>{throw new AppApiError('fixture',code,status);}});v.workspace.render();await settle();const content=text(v.workspace.render());const err=find(v.workspace.render(),e=>typeof e.type==='function'&&e.type.name==='ErrorText');assert.match(err.props.message,label);assert.doesNotMatch(content,/Nenhuma conversa encontrada/);v.workspace.unmount();}
  u.workspace.unmount();
});
test('D3 histórico: ordem cronológica, deduplicação, paginação e statuses do servidor',async()=>{
  const u=ui({history:async(_o,_t,p)=>p===1?page([msg(8,{direction:'outbound',status:'read'}),msg(6,{direction:'outbound',status:'delivered'})],1,3,2):page([msg(6,{direction:'outbound',status:'delivered'}),msg(4)],2,3,2)});
  const d=await open(u);let tree=d.render();assert.match(text(tree),/Mensagem fictícia 6.*Entregue.*Mensagem fictícia 8.*Lida/);button(tree,'Carregar mensagens anteriores').props.onClick();await settle();tree=d.render();assert.match(text(tree),/Mensagem fictícia 4.*Mensagem fictícia 6.*Mensagem fictícia 8/);assert.equal(flatten(tree).filter(x=>x==='Mensagem fictícia 6').length,1);assert.equal(u.calls.at(-1)[3],2);d.unmount();u.workspace.unmount();
});
test('D3 bloqueios: janela, opt-out, handoff, revogação, closed, RBAC e motivos de servidor',async()=>{
  const u=ui();const f=u.pageApi.blockedReason;
  assert.equal(f(thread,true,owner),null);assert.match(f(thread,false,owner),/perfil/);assert.match(f({...thread,optOut:true},true,owner),/opt-out/);assert.match(f({...thread,status:'closed'},true,owner),/encerrada/);assert.match(f({...thread,windowEndsAt:'2026-11-24T12:00:00Z'},true,owner,Date.parse('2026-11-24T12:00:00Z')),/Janela/);assert.match(f({...thread,assigneeMembershipId:other},true,owner),/assumir/);
  for(const code of ['FORBIDDEN','CONVERSATION_CLOSED','OPT_OUT','WINDOW_CLOSED','CONNECTION_REVOKED','META_PERMISSION_REQUIRED','META_NOT_CONFIGURED','FEATURE_DISABLED','HANDOFF_REQUIRED','META_UNAVAILABLE'])assert.ok(f({...thread,canSend:false,sendBlockedReason:code},true,owner));
  const v=ui({props:{canSend:false,canAssign:false}});const d=await open(v);const tree=d.render();assert.equal(find(tree,e=>e.type==='textarea').props.disabled,true);assert.equal(button(tree,'Encerrar conversa'),undefined);formSubmit(tree);assert.equal(v.calls.filter(c=>c[0]==='send').length,0);d.unmount();v.workspace.unmount();
});
test('D3 idempotência: clique duplo, timeout ambíguo, retry manual mesma chave, pending sem sucesso otimista',async()=>{
  const first=deferred();let n=0;const u=ui({send:()=>++n===1?first.promise:Promise.resolve(msg(9,{direction:'outbound',status:'pending',externalMessageId:null,text:'Resposta fictícia'}))});
  const d=await open(u);changeDraft(d.render(),' Resposta fictícia ');let tree=d.render();formSubmit(tree);formSubmit(tree);assert.equal(u.calls.filter(c=>c[0]==='send').length,1);assert.doesNotMatch(text(d.render()),/Estado da mensagem atualizado/);
  first.reject(new AppApiError('fixture','REQUEST_TIMEOUT'));await settle();tree=d.render();assert.equal(find(tree,e=>e.type==='textarea').props.disabled,true);assert.ok(button(tree,'Tentar novamente'));assert.equal(u.calls.filter(c=>c[0]==='send').length,1);
  formSubmit(tree);await settle();tree=d.render();const sent=u.calls.filter(c=>c[0]==='send');assert.equal(sent.length,2);assert.equal(sent[0][3].idempotencyKey,sent[1][3].idempotencyKey);assert.equal(sent[1][3].text,'Resposta fictícia');assert.match(text(tree),/Pendente — confirmação não recebida/);assert.equal(button(tree,'Enviar').props.disabled,true);d.unmount();u.workspace.unmount();
});
test('D3 atribuição/encerramento: confirmação, null, estado retornado e revalidação de escopo',async()=>{
  const cancelled=ui({confirm:false});let d=await open(cancelled);button(d.render(),'Encerrar conversa').props.onClick();assert.equal(cancelled.calls.filter(c=>c[0]==='close').length,0);d.unmount();cancelled.workspace.unmount();
  const u=ui();d=await open(u);let tree=d.render();select(tree,'Responsável').props.onChange({target:{value:''}});tree=d.render();button(tree,'Confirmar atribuição').props.onClick();await settle();assert.equal(u.calls.find(c=>c[0]==='assign')[3],null);assert.match(text(u.workspace.render()),/Responsável atualizado pelo servidor/);d.unmount();await settle();d=await open(u);button(d.render(),'Encerrar conversa').props.onClick();await settle();assert.ok(u.calls.find(c=>c[0]==='close'));assert.match(text(u.workspace.render()),/Conversa encerrada pelo servidor/);d.unmount();u.workspace.unmount();
});
test('D3 isolamento: troca tenant altera key, aborta lista e histórico atrasados; ficha sem lookup não autorizado',async()=>{
  const delayed=deferred();const u=ui({list:()=>delayed.promise});u.workspace.render();const signal=u.calls[0][3];const keyA=u.workspace.element.key,keyB=u.pageApi.ConversationsPage({...u.props,organizationId:orgB}).key;assert.notEqual(keyA,keyB);u.workspace.unmount();assert.equal(signal.aborted,true);delayed.resolve(page([thread]));await settle();
  const hist=deferred();const v=ui({history:()=>hist.promise});const d=await open(v);const call=v.calls.find(c=>c[0]==='messages');d.unmount();assert.equal(call[4].aborted,true);hist.resolve(page([msg(4)]));await settle();assert.doesNotMatch(text(d.render()),/Mensagem fictícia 4/);v.workspace.unmount();
  const w=ui({list:async()=>page([{...thread,contactId:id(20)}])});const detail=await open(w);const linked=find(detail.render(),e=>typeof e.type==='function'&&e.type.name==='LinkedRecord'&&e.props.kind==='contact');const comp=instance(linked);assert.match(text(comp.render()),/Não vinculado ou indisponível/);assert.equal(w.calls.filter(c=>c[0]==='lookup').length,0);comp.unmount();detail.unmount();w.workspace.unmount();
});
test('D3 desconectado e ficha vinculada: estados separados, lookup autorizado e fallback sem nome inventado',async()=>{
  const u=ui({props:{canReadMeta:true,canReadContact:true},list:async()=>page([{...thread,contactId:id(20)}]),lookup:async(_o,p)=>({id:id(20),name:'Contato CRM fictício'})});
  const d=await open(u);const workspace=u.workspace.render();const status=find(workspace,e=>typeof e.type==='function'&&e.type.name==='ConnectionNotice');assert.match(text(status.type(status.props)),/Meta desconectada/);
  assert.equal(find(d.render(),e=>e.type==='textarea').props.disabled,true);
  const link=find(d.render(),e=>typeof e.type==='function'&&e.type.name==='LinkedRecord'&&e.props.kind==='contact');const record=instance(link);assert.match(text(record.render()),/Consultando vínculo/);await settle();assert.match(text(record.render()),/Contato CRM fictício/);assert.equal(u.calls.find(c=>c[0]==='lookup')[2],`/crm/contacts/${id(20)}`);record.unmount();d.unmount();u.workspace.unmount();
});
