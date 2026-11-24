import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppApiError } from "../../services/appApi";
import type { MetaStatus } from "../../services/metaApi";
import {
  ambiguousCampaignError, canConfirmCampaign, canManageAds, canPauseCampaign, listCampaignOptions, listCampaigns,
  money, parseBudget, pauseCampaign, previewCampaign, publishCampaign, sameDraft, selectedAdAccounts,
  type Campaign, type CampaignConfirmation, type CampaignDraft, type CampaignOption, type CampaignPreview,
} from "../../services/campaignsApi";
import { Pagination } from "./MetaD4Shared";
import type { Page } from "../../services/conversationsApi";

const labels: Record<Campaign["status"],string> = {draft:"Rascunho",pending:"Pendente",active:"Ativa",paused:"Pausada",rejected:"Rejeitada",error:"Erro"};
function failureText(e: unknown) {
  if (!(e instanceof AppApiError)) return "Não foi possível concluir a operação.";
  if (e.status===401 || e.status===403) return `Acesso não autorizado (${e.code}).`;
  if (e.status===404) return "Recurso não encontrado ou indisponível para esta organização (404).";
  if (e.status===503) return `Serviço indisponível: ${e.message} (${e.code}).`;
  if (e.status===409) return `Conflito: ${e.message} (${e.code}).`;
  return `${e.message} (${e.code}).`;
}
function usePage<T>(key: string, request: (s: AbortSignal)=>Promise<Page<T>|null>) {
  const [state,setState]=useState<{key:string;data?:Page<T>|null;error?:string}>({key:""});
  useLayoutEffect(()=>{const c=new AbortController();setState({key});void request(c.signal).then(data=>{if(!c.signal.aborted)setState({key,data});}).catch(e=>{if(!c.signal.aborted)setState({key,error:failureText(e)});});return()=>c.abort();},[key]);
  return state.key===key ? {data:state.data,error:state.error,loading:state.data===undefined&&!state.error} : {data:undefined,error:undefined,loading:true};
}
function LoadState({loading,error,retry}:{loading:boolean;error?:string;retry:()=>void}) {
  return <>{loading&&<p role="status">Carregando…</p>}{error&&<div role="alert"><p>{error}</p><button type="button" className="app-secondary-button" onClick={retry}>Atualizar</button></div>}</>;
}
const pairKey=(o:CampaignOption)=>`${o.propertyId}:${o.creativeId}`;
const optionKey=(o:CampaignOption)=>`${pairKey(o)}:${o.destinationRef}`;
type Command = {kind:"publish";input:CampaignConfirmation;preview:CampaignPreview} | {kind:"pause";id:string;key:string;draft:CampaignDraft};

// Parent is keyed by authenticated organization, membership and grants. Requests are
// aborted on unmount; no command is retried automatically or transferred across contexts.
export function MetaCampaignSection({org,status,statusLoading,statusBusy,canWrite}:{org:string;status:MetaStatus|null;statusLoading:boolean;statusBusy:boolean;canWrite:boolean}) {
  const [assetId,setAssetId]=useState("");const [pair,setPair]=useState("");const [destination,setDestination]=useState("");
  const [budget,setBudget]=useState("");const [days,setDays]=useState("7");
  const [optionPage,setOptionPage]=useState(1);const [optionRefresh,setOptionRefresh]=useState(0);
  const [campaignPage,setCampaignPage]=useState(1);const [campaignRefresh,setCampaignRefresh]=useState(0);
  const [preview,setPreview]=useState<CampaignPreview|null>(null);const [consent,setConsent]=useState(false);
  const [now,setNow]=useState(Date.now);const [busy,setBusy]=useState(false);const [error,setError]=useState<string>();const [notice,setNotice]=useState<string>();
  const [uncertain,setUncertain]=useState<Command|null>(null);
  const active=useRef<{controller:AbortController;kind:"preview"|"command"}|null>(null);
  useLayoutEffect(()=>()=>{active.current?.controller.abort();active.current=null;},[]);
  useLayoutEffect(()=>{setPreview(null);setConsent(false);if(active.current?.kind==="preview"){active.current.controller.abort();active.current=null;setBusy(false);}},[status,statusLoading,statusBusy]);
  useEffect(()=>{const timer=globalThis.setInterval(()=>setNow(Date.now()),1000);return()=>globalThis.clearInterval(timer);},[]);
  const accounts=selectedAdAccounts(status);
  const hasAccount=accounts.some(a=>a.id===assetId);
  const optionsEnabled=canWrite&&hasAccount&&!statusLoading&&!statusBusy;
  const options=usePage(`${org}:${optionsEnabled}:${assetId}:${optionPage}:${optionRefresh}`,s=>optionsEnabled?listCampaignOptions(org,optionPage,s):Promise.resolve(null));
  const campaigns=usePage(`${org}:${campaignPage}:${campaignRefresh}`,s=>listCampaigns(org,campaignPage,s));
  const choices=options.data?.items??[];
  const pairs=choices.filter((o,i)=>choices.findIndex(other=>pairKey(other)===pairKey(o))===i);
  const destinations=choices.filter(o=>pairKey(o)===pair);
  const option=destinations.find(o=>optionKey(o)===destination);
  const minor=parseBudget(budget);const duration=/^\d{1,2}$/.test(days)?Number(days):0;
  const draft:CampaignDraft|null=hasAccount&&option&&minor!==null&&duration>=1&&duration<=30 ? {assetId,propertyId:option.propertyId,creativeId:option.creativeId,objective:"leads",destination:"website",destinationRef:option.destinationRef,budgetMinor:minor,currency:"BRL",durationDays:duration,housing:true}:null;
  const locked=busy||!!uncertain;const editable=canWrite&&!locked&&!statusLoading&&!statusBusy;
  const publishAllowed=editable&&canConfirmCampaign(status,canWrite,preview,draft,consent,now);
  function invalidate(){setPreview(null);setConsent(false);setError(undefined);setNotice(undefined);}
  function change(fn:()=>void){if(!editable)return;invalidate();fn();}
  function reloadCampaigns(){setCampaignRefresh(n=>n+1);}
  async function requestPreview(){
    if(!editable||!draft||active.current)return;
    invalidate();const controller=new AbortController();const operation={controller,kind:"preview" as const};active.current=operation;setBusy(true);
    try{const next=await previewCampaign(org,draft,controller.signal);if(!controller.signal.aborted){setPreview(next);setNow(Date.now());}}
    catch(e){if(!controller.signal.aborted)setError(failureText(e));}
    finally{if(active.current===operation){active.current=null;setBusy(false);}}
  }
  async function execute(command:Command){
    if(active.current||!canWrite||statusLoading||statusBusy)return;
    const controller=new AbortController();const operation={controller,kind:"command" as const};active.current=operation;setBusy(true);setError(undefined);setNotice(undefined);
    try{
      const result=command.kind==="publish"?await publishCampaign(org,command.input,controller.signal):await pauseCampaign(org,command.id,command.key,controller.signal);
      if(controller.signal.aborted)return;
      if(!sameDraft(result.draft,command.kind==="publish"?command.preview.draft:command.draft)||result.mode!=="live")throw new AppApiError("Resposta incompatível com a intenção confirmada.","INVALID_API_RESPONSE");
      setUncertain(null);setPreview(null);setConsent(false);
      setNotice(`Estado retornado pelo servidor: ${labels[result.status]}.${result.status==="pending"?" Resultado pendente; consulte o histórico antes de qualquer nova ação.":""}${result.reason?` ${result.reason}`:""}`);
      reloadCampaigns();
    }catch(e){if(!controller.signal.aborted){setError(failureText(e));setUncertain(uncertain||ambiguousCampaignError(e)?command:null);if(!uncertain&&!ambiguousCampaignError(e)){setPreview(null);setConsent(false);}reloadCampaigns();}}
    finally{if(active.current===operation){active.current=null;setBusy(false);}}
  }
  function publish(){
    if(!publishAllowed||!preview||!draft||active.current||!canConfirmCampaign(status,canWrite,preview,draft,consent,Date.now()))return;
    const idempotencyKey=globalThis.crypto.randomUUID();
    void execute({kind:"publish",preview,input:{previewId:preview.previewId,confirmedBudgetMinor:draft.budgetMinor,idempotencyKey}});
  }
  function pause(c:Campaign){
    if(locked||statusLoading||statusBusy||active.current||!canPauseCampaign(status,canWrite,c))return;
    if(!globalThis.confirm(`Confirmar solicitação de pausa da campanha ${c.id}? A pausa só será considerada concluída após confirmação do servidor.`))return;
    void execute({kind:"pause",id:c.id,key:globalThis.crypto.randomUUID(),draft:c.draft});
  }
  const retryPause=uncertain?.kind==="pause"?campaigns.data?.items.find(c=>c.id===uncertain.id):undefined;
  const retryAllowed=!!uncertain&&!busy&&!statusLoading&&!statusBusy&&(uncertain.kind==="publish"?canConfirmCampaign(status,canWrite,uncertain.preview,uncertain.preview.draft,true,now):!!retryPause&&canPauseCampaign(status,canWrite,retryPause,now));
  function retry(){if(!retryAllowed||!uncertain)return;if(uncertain.kind==="publish"?!canConfirmCampaign(status,canWrite,uncertain.preview,uncertain.preview.draft,true,Date.now()):!retryPause||!canPauseCampaign(status,canWrite,retryPause,Date.now()))return;void execute(uncertain);}
  return <section className="meta-panel meta-d5" aria-label="Campanhas">
    <div className="meta-panel-heading"><h2>Campanhas</h2><span className="meta-state">Captação por landing page</span></div>
    <p className="meta-muted">Prévia interna de moradia no Brasil. Não certifica objetivo, categoria, política, moeda, pagamento ou aprovação da Meta. A publicação e a pausa dependem da autorização efetiva do servidor.</p>
    {!canWrite&&<p>Somente leitura: a criação de prévias, publicação e pausa exigem permissões adicionais em escopo organização.</p>}
    {statusLoading?<p role="status">Consultando contas de anúncios…</p>:!status?<p role="alert">Estado da conexão indisponível. Atualize a integração acima.</p>:!accounts.length?<p>Nenhuma conta de anúncios selecionada. Conecte a Meta e selecione uma conta Ads na seção de ativos; Página e Instagram não substituem a conta Ads.</p>:<p className="meta-muted">Conta Ads selecionada não equivale a autorização de gasto.</p>}
    {canWrite&&<div className="meta-d5-form">
      <fieldset disabled={!editable}>
        <legend>1. Objetivo e conta de anúncios</legend><p>Captação de leads (objetivo interno). Moradia obrigatória; sem segmentação personalizada.</p>
        <label>Conta Ads<select value={hasAccount?assetId:""} onChange={e=>change(()=>{setAssetId(e.target.value);setPair("");setDestination("");setOptionPage(1);})}><option value="">Selecione uma conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {hasAccount&&!canManageAds(status,assetId,now)&&<p className="meta-muted">Gestão de anúncios não verificada ou indisponível. Somente validação local de prévia, sem autorização de publicação.</p>}
      </fieldset>
      {hasAccount&&<><fieldset disabled={!editable||options.loading||!!options.error}><legend>2. Imóvel e criativo</legend>
        {options.data?.items.length===0&&<p>Nenhuma combinação elegível nesta página. Prepare uma publicação com arte persistida ou Reel salvo e uma landing publicada vinculada ao imóvel ativo.</p>}
        <label>Imóvel / publicação<select value={pair} onChange={e=>change(()=>{setPair(e.target.value);setDestination("");})}><option value="">Selecione imóvel e criativo</option>{pairs.map(o=><option key={pairKey(o)} value={pairKey(o)}>{o.propertyLabel} · {o.creativeLabel}</option>)}</select></label>
        {options.data&&<Pagination page={options.data} disabled={!editable} onPage={n=>change(()=>{setPair("");setDestination("");setOptionPage(n);})}/>}</fieldset>
        <LoadState loading={options.loading} error={options.error} retry={()=>change(()=>{setPair("");setDestination("");setOptionRefresh(n=>n+1);})}/>
        <fieldset disabled={!editable||!pair||!destinations.length}><legend>3. Destino</legend><label>Landing page publicada<select value={destination} onChange={e=>change(()=>setDestination(e.target.value))}><option value="">Selecione uma landing</option>{destinations.map(o=><option key={optionKey(o)} value={optionKey(o)}>{o.destinationLabel}</option>)}</select></label><p>Website (destino interno), sem URL manual.</p></fieldset>
        <fieldset disabled={!editable||!option}><legend>4. Orçamento total e duração</legend><div className="meta-d5-line"><label>Total em BRL (R$)<input inputMode="decimal" value={budget} placeholder="500,00" onChange={e=>change(()=>setBudget(e.target.value))}/></label><label>Duração (dias)<input inputMode="numeric" value={days} onChange={e=>change(()=>setDays(e.target.value))}/></label></div>
        {budget&&minor===null&&<p role="alert">Informe um total positivo até R$ 1.000.000,00, com até duas casas decimais, sem separador de milhar.</p>}{(duration<1||duration>30)&&<p role="alert">Duração de 1 a 30 dias inteiros.</p>}
        {minor!==null&&<p><strong>Total: {money(minor)}</strong> — não é orçamento diário; não será multiplicado pelos dias.</p>}<p className="meta-muted">Limite de engenharia da prévia, não autorização de gasto. O total não garante a cobrança final.</p></fieldset></>}
      <div><h3>5. Prévia e revisão</h3><button type="button" className="app-secondary-button" disabled={!editable||!draft} onClick={()=>void requestPreview()}>Gerar prévia</button></div>
      {preview&&<div className="meta-d5-review"><p><strong>{preview.valid?"Validação local aprovada":"Validação local com pendências"}</strong> · {preview.mode==="test"?"Modo teste — não é campanha real":"Modo live informado pelo servidor"}</p>
        <dl className="meta-details"><div><dt>Conta Ads</dt><dd>{accounts.find(a=>a.id===preview.draft.assetId)?.name??"Indisponível"}</dd></div><div><dt>Imóvel</dt><dd>{preview.summary.propertyLabel}</dd></div><div><dt>Publicação (fonte do conteúdo)</dt><dd>{preview.summary.creativeLabel}</dd></div><div><dt>Landing</dt><dd>{preview.summary.destinationLabel}</dd></div><div><dt>Total</dt><dd>{money(preview.summary.totalBudgetMinor)}</dd></div><div><dt>Duração</dt><dd>{preview.draft.durationDays} dias</dd></div><div><dt>Moradia</dt><dd>Obrigatória</dd></div><div><dt>Validade</dt><dd>{new Date(preview.expiresAt).toLocaleString("pt-BR")} {Date.parse(preview.expiresAt)<=now?"(expirada)":""}</dd></div></dl>
        {preview.issues.map((i,n)=><p key={`${i.code}:${n}`}>{i.message} ({i.code})</p>)}{preview.blockingReason&&<p role="alert">Bloqueio: {preview.blockingReason}</p>}{!preview.canPublish&&<p>Publicação indisponível pelo servidor.</p>}
        <h3>6. Confirmação explícita</h3><p>Revise a publicação, a landing e as regras Meta antes de confirmar. A prévia não é aprovação externa.</p><label className="meta-d5-consent"><input type="checkbox" checked={consent} disabled={!editable||!canConfirmCampaign(status,canWrite,preview,draft,true,now)} onChange={e=>setConsent(e.target.checked)}/> Confirmo o orçamento total de {money(preview.summary.totalBudgetMinor)} por {preview.draft.durationDays} dias e solicito a publicação.</label>
        <button type="button" className="app-primary-button" disabled={!publishAllowed} onClick={publish}>Confirmar e publicar</button></div>}
    </div>}
    {busy&&<p role="status">Operação em andamento…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {uncertain&&<div className="meta-d5-review" role="alert"><strong>Resultado não confirmado</strong><p>Não inicie nova operação para esta intenção. Consulte o histórico e o operador responsável. Uma tentativa manual reutiliza a mesma chave; nenhuma repetição automática. Não feche esta tela enquanto o resultado estiver indefinido.</p><button type="button" className="app-secondary-button" disabled={!retryAllowed} onClick={retry}>Consultar/repetir a mesma solicitação</button></div>}
    <div className="meta-panel-heading"><h3>Histórico de campanhas</h3><button type="button" className="app-secondary-button" onClick={reloadCampaigns}>Atualizar lista</button></div>
    <LoadState loading={campaigns.loading} error={campaigns.error} retry={reloadCampaigns}/>
    {campaigns.data&&<>{campaigns.data.items.length===0?<p>Nenhuma campanha registrada nesta página.</p>:<div className="meta-d5-list">{campaigns.data.items.map(c=><article className="meta-asset" key={c.id}><div className="meta-panel-heading"><strong>Campanha {c.id}</strong><span className="meta-state">{labels[c.status]} · {c.mode==="test"?"Teste (não real)":"Live"}</span></div><dl className="meta-details"><div><dt>Conta Ads</dt><dd>{accounts.find(a=>a.id===c.draft.assetId)?.name??c.draft.assetId}</dd></div><div><dt>Imóvel / publicação / landing</dt><dd>{c.draft.propertyId} / {c.draft.creativeId} / {c.draft.destinationRef}</dd></div><div><dt>Total / duração</dt><dd>{money(c.draft.budgetMinor)} · {c.draft.durationDays} dias</dd></div><div><dt>ID externo</dt><dd>{c.externalCampaignId??"Não informado"}</dd></div><div><dt>Atualização</dt><dd>{new Date(c.updatedAt).toLocaleString("pt-BR")}</dd></div></dl>{c.reason&&<p>{c.reason}</p>}{c.status==="pending"&&<p>Resultado pendente; não equivale a campanha ativa.</p>}<button type="button" className="app-secondary-button" disabled={locked||statusLoading||statusBusy||!canPauseCampaign(status,canWrite,c,now)} onClick={()=>pause(c)}>Solicitar pausa</button></article>)}</div>}
      <Pagination page={campaigns.data} onPage={setCampaignPage}/></>}
  </section>;
}
