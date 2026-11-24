import { useLayoutEffect, useRef, useState } from "react";
import { AppApiError } from "../../services/appApi";
import type { Page } from "../../services/conversationsApi";
export function errorText(error:unknown) {
  if(error instanceof AppApiError) {
    if(error.status===409 && error.code==="CONFLICT") return "Versão alterada por outro operador. Atualize antes de tentar novamente.";
    if(error.status===401 || error.status===403) return "Acesso não autorizado. Verifique sua sessão e permissões.";
    if(error.code==="CONNECTION_REVOKED" || error.code==="META_PERMISSION_REQUIRED") return "Conexão ou permissão Meta indisponível. Verifique a conexão acima.";
    if(error.code==="FEATURE_DISABLED") return "Recurso desativado pelo servidor. A ativação não foi concluída.";
    return `${error.message} (${error.code})`;
  }
  return "Não foi possível concluir a operação.";
}
export function dateText(v:string|null) { return v===null ? "Indisponível" : new Date(v).toLocaleString("pt-BR"); }
// Keyed results prevent stale UI even before effect cleanup; layout cleanup aborts on key/unmount.
export function useD4Query<T>(key:string, load:(signal:AbortSignal)=>Promise<T>) {
  const [state,setState]=useState<{key:string;data?:T;error?:string}>({key:""});
  useLayoutEffect(()=>{const c=new AbortController();setState({key});void load(c.signal).then(data=>{if(!c.signal.aborted)setState({key,data});}).catch(e=>{if(!c.signal.aborted)setState({key,error:errorText(e)});});return()=>c.abort();},[key]);
  return state.key===key ? {data:state.data,error:state.error,loading:state.data===undefined && !state.error} : {data:undefined,error:undefined,loading:true};
}
export function useD4Mutation() {
  const active=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string>();
  useLayoutEffect(()=>()=>{active.current?.abort();active.current=null;},[]);
  async function run<T>(request:(s:AbortSignal)=>Promise<T>, done:(v:T)=>void, failed?:(e:unknown)=>void) {
    if(active.current)return;
    const c=new AbortController();active.current=c;setBusy(true);setError(undefined);
    try {const v=await request(c.signal);if(!c.signal.aborted)done(v);}catch(e){if(!c.signal.aborted){setError(errorText(e));failed?.(e);}}finally{if(active.current===c){active.current=null;setBusy(false);}}
  }
  return {busy,error,run};
}
export function QueryState({loading,error,retry}:{loading:boolean;error?:string;retry:()=>void}) {return <>{loading&&<p role="status">Carregando…</p>}{error&&<div role="alert"><p>{error}</p><button className="app-secondary-button" type="button" onClick={retry}>Atualizar</button></div>}</>;}
export function Pagination({page,onPage,disabled=false}:{page:Page<unknown>;onPage:(n:number)=>void;disabled?:boolean}) {return <div className="meta-actions"><button className="app-secondary-button" type="button" disabled={disabled||page.page<=1} onClick={()=>onPage(page.page-1)}>Anterior</button><span>Página {page.page} · {page.totalItems} registro(s)</span><button className="app-secondary-button" type="button" disabled={disabled||page.page>=page.totalPages} onClick={()=>onPage(page.page+1)}>Próxima</button></div>;}
