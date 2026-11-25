type Config = Readonly<{secret:string;hostname:string;action:string}>;
const endpoint='https://challenges.cloudflare.com/turnstile/v0/siteverify';
const maxResponseBytes=16_384;
const unavailable=()=>new Error('Bot verification unavailable');

async function readResult(response:Response,signal:AbortSignal):Promise<Record<string,unknown>> {
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(()=>{});
    throw unavailable();
  }
  const reader=response.body.getReader();
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    if(signal.aborted) throw unavailable();
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let bytes=0, body='';
    for (;;) {
      const chunk=await reader.read();
      if(signal.aborted) throw unavailable();
      if(chunk.done) break;
      bytes+=chunk.value.byteLength;
      if(bytes>maxResponseBytes) throw unavailable();
      body+=decoder.decode(chunk.value,{stream:true});
    }
    const result:unknown=JSON.parse(body+decoder.decode());
    if(!result || typeof result!=='object' || Array.isArray(result)) throw unavailable();
    return result as Record<string,unknown>;
  } finally {
    signal.removeEventListener('abort',cancel);cancel();
  }
}

// No live binding until approved hostname, widget and abuse controls are configured.
// Return false only for a rejected challenge; throw a generic error for infrastructure
// failures so the enquiry handler retains its safe 503 retry response.
export function createTurnstileVerifier(config:Config,transport:typeof fetch,timeoutMs=5_000):(token:string)=>Promise<boolean> {
  const {secret,hostname,action}=config;
  if(!/^[\x21-\x7e]{1,512}$/.test(secret) ||
     hostname.length>253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname) ||
     !/^[A-Za-z0-9_-]{1,32}$/.test(action) || !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>10_000) {
    throw Error('Invalid bot verification configuration');
  }
  return async token=>{
    if(typeof token!=='string' || !/^[\x21-\x7e]{1,2048}$/.test(token)) return false;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(unavailable());},timeoutMs);
    });
    const request=async()=>{
      const response=await transport(endpoint,{
        method:'POST',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({secret,response:token}).toString(),
      });
      if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw unavailable();}
      const result=await readResult(response,controller.signal);
      if(result.success===true) return result.hostname===hostname && result.action===action;
      if(result.success!==false) throw unavailable();
      const codes=result['error-codes'];
      if(!Array.isArray(codes) || codes.length===0 ||
         codes.some(code=>!['missing-input-response','invalid-input-response','timeout-or-duplicate'].includes(code))) throw unavailable();
      return false;
    };
    try{return await Promise.race([request(),deadline]);}
    catch{throw unavailable();}
    finally{clearTimeout(timer);}
  };
}
