const REQUEST_TIMEOUT_MS = 15_000;
export interface AuthSessionPayload { accessToken: string; idToken: string; refreshToken?: string; expiresIn: number; tokenType: string }
export interface LoginResult { user: { id: string; email: string; displayName: string }; onboarding: { step: number; completed: boolean; next: string }; session: AuthSessionPayload }
export class AuthApiError extends Error {
  readonly code: string; readonly status?: number; readonly issues: Array<{ field?: string; message?: string }>;
  constructor(message: string, code: string, status?: number, issues: Array<{ field?: string; message?: string }> = []) { super(message); this.name="AuthApiError"; this.code=code; this.status=status; this.issues=issues; }
}
function apiBase(): string { const value=import.meta.env.VITE_API_URL?.trim(); if(!value) throw new AuthApiError("A autenticação ainda não está disponível.","API_NOT_CONFIGURED"); return value.replace(/\/+$/u,""); }
async function request<T>(path:string,payload:unknown,defaultError:string):Promise<T>{
  const controller=new AbortController(); const timeout=globalThis.setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try { const response=await fetch(`${apiBase()}${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),signal:controller.signal}); let body:any=null; try{body=await response.json();}catch{body=null;}
    if(!response.ok) throw new AuthApiError(body?.error?.message||defaultError,body?.error?.code||"API_ERROR",response.status,Array.isArray(body?.error?.issues)?body.error.issues:[]);
    if(body?.success!==true) throw new AuthApiError(defaultError,"INVALID_API_RESPONSE",response.status); return body.data as T;
  } catch(error){ if(error instanceof AuthApiError) throw error; if(error instanceof DOMException&&error.name==="AbortError") throw new AuthApiError("A solicitação demorou mais que o esperado. Tente novamente.","REQUEST_TIMEOUT"); throw new AuthApiError("Não foi possível conectar ao servidor.","NETWORK_ERROR"); }
  finally{globalThis.clearTimeout(timeout);}
}
function validSession(value:unknown,requireRefresh:boolean):value is AuthSessionPayload { if(typeof value!=="object"||value===null)return false; const session=value as Partial<AuthSessionPayload>; return Boolean(typeof session.accessToken==="string"&&session.accessToken&&typeof session.idToken==="string"&&session.idToken&&typeof session.expiresIn==="number"&&Number.isFinite(session.expiresIn)&&session.expiresIn>0&&typeof session.tokenType==="string"&&session.tokenType&&(!requireRefresh||(typeof session.refreshToken==="string"&&session.refreshToken))); }
function validLoginResult(value:unknown):value is LoginResult { if(typeof value!=="object"||value===null)return false; const result=value as Partial<LoginResult>; return Boolean(result.user&&typeof result.user.id==="string"&&typeof result.user.email==="string"&&typeof result.user.displayName==="string"&&result.onboarding&&typeof result.onboarding.step==="number"&&typeof result.onboarding.completed==="boolean"&&typeof result.onboarding.next==="string"&&validSession(result.session,true)); }
export async function login(email:string,password:string):Promise<LoginResult>{ const result=await request<unknown>("/auth/login",{email,password},"Não foi possível entrar."); if(!validLoginResult(result)) throw new AuthApiError("Recebemos uma resposta inesperada do servidor.","INVALID_API_RESPONSE"); return result; }
export async function refreshSession(refreshToken:string):Promise<{session:Omit<AuthSessionPayload,"refreshToken">}>{ const result=await request<unknown>("/auth/refresh",{refreshToken},"Não foi possível renovar sua sessão."); if(typeof result!=="object"||result===null||!("session" in result)||!validSession((result as {session?:unknown}).session,false)) throw new AuthApiError("Recebemos uma resposta inesperada ao renovar sua sessão.","INVALID_API_RESPONSE"); const session=(result as {session:AuthSessionPayload}).session; return {session:{accessToken:session.accessToken,idToken:session.idToken,expiresIn:session.expiresIn,tokenType:session.tokenType}}; }
export function resendEmailVerification(email:string):Promise<{accepted:true}>{return request("/auth/email/resend",{email},"Não foi possível solicitar um novo e-mail.");}
export function confirmEmailVerification(token:string):Promise<{verified:true}>{return request("/auth/email/verify",{token},"Não foi possível confirmar seu e-mail.");}
export function requestPasswordReset(email:string):Promise<{accepted:true}>{return request("/auth/password/forgot",{email},"Não foi possível solicitar a redefinição.");}
export function resetPassword(token:string,password:string):Promise<{reset:true}>{return request("/auth/password/reset",{token,password},"Não foi possível redefinir sua senha.");}
