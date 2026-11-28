import type { Jwk } from './auth.ts';

const ttlMs=60_000;
const retryMs=5_000;
const maxBytes=32_768;
const unavailable=()=>new Error('Access signing keys unavailable');
const object=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);

function parseKeys(value:unknown):Jwk[] {
  if(!object(value) || !Array.isArray(value.keys) || value.keys.length<1 || value.keys.length>8) throw unavailable();
  const ids=new Set<string>();
  return value.keys.map((key:unknown)=>{
    if(!object(key) || key.kty!=='RSA' || key.alg!=='RS256' || key.use!=='sig' ||
       typeof key.kid!=='string' || !/^[A-Za-z0-9._-]{1,128}$/.test(key.kid) || ids.has(key.kid) ||
       typeof key.n!=='string' || !/^[A-Za-z0-9_-]{342,683}$/.test(key.n) ||
       typeof key.e!=='string' || !/^[A-Za-z0-9_-]{1,8}$/.test(key.e) ||
       ['d','p','q','dp','dq','qi','oth','k'].some(field=>Object.hasOwn(key,field))) throw unavailable();
    ids.add(key.kid);
    return {kty:'RSA',alg:'RS256',use:'sig',kid:key.kid,n:key.n,e:key.e};
  });
}
async function readKeys(response:Response,signal:AbortSignal):Promise<Jwk[]> {
  if(!response.ok || !response.body || signal.aborted) {
    void response.body?.cancel().catch(()=>{});
    throw unavailable();
  }
  const reader=response.body.getReader();
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let bytes=0,body='';
    for(;;){
      const chunk=await reader.read();
      if(signal.aborted) throw unavailable();
      if(chunk.done) break;
      bytes+=chunk.value.byteLength;
      if(bytes>maxBytes) throw unavailable();
      body+=decoder.decode(chunk.value,{stream:true});
    }
    return parseKeys(JSON.parse(body+decoder.decode()));
  } finally {signal.removeEventListener('abort',cancel);cancel();}
}

// Create once per configured Access application, never from token-supplied issuer.
// Fixed TTL intentionally bounds unknown-kid refresh traffic; rotation may deny access
// for up to one minute. Failed refreshes never fall back to stale verification keys.
export function createAccessKeySource(issuer:string,transport:typeof fetch,clock:()=>number=Date.now,
  timeoutMs=5_000):()=>Promise<Jwk[]> {
  if(issuer.trim()!==issuer||!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer) ||
     !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>10_000) throw Error('Invalid Access key configuration');
  const endpoint=issuer+'/cdn-cgi/access/certs';
  let cache:{keys:Jwk[];loadedAt:number}|undefined;
  let failedAt:number|undefined;
  let generation=0,settledGeneration=0;
  const clone=(keys:Jwk[])=>keys.map(key=>({...key}));
  const now=()=>{
    const value=clock();
    if(!Number.isSafeInteger(value)||value<0)throw unavailable();
    return value;
  };
  const load=async()=>{
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(unavailable());},timeoutMs);
    });
    const request=async()=>readKeys(await transport(endpoint,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json'}}),controller.signal);
    try {
      return await Promise.race([request(),deadline]);
    } catch { throw unavailable(); }
    finally {clearTimeout(timer);}
  };
  return async()=>{
    const time=now();
    if(cache && time>=cache.loadedAt && time-cache.loadedAt<ttlMs) return clone(cache.keys);
    if(failedAt!==undefined && time>=failedAt && time-failedAt<retryMs) throw unavailable();
    // Never share request-scoped fetch promises across Worker invocations. Cold
    // concurrent callers load independently; only the newest settled refresh
    // can change the shared plain-data cache.
    const attempt=++generation;
    try {
      const keys=await load();
      if(attempt>settledGeneration){
        settledGeneration=attempt;cache={keys,loadedAt:now()};failedAt=undefined;
      }
    } catch {
      if(attempt>settledGeneration){settledGeneration=attempt;cache=undefined;failedAt=now();}
    }
    const finished=now();
    if(cache && finished>=cache.loadedAt && finished-cache.loadedAt<ttlMs)return clone(cache.keys);
    throw unavailable();
  };
}
