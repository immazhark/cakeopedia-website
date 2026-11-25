import type { Database } from './store.ts';

type Scope='enquiry'|'upload'|'delete';
type Policy=Readonly<{clientLimit:number;globalLimit:number}>;
const windowMs=60_000;
const scopes=new Set<string>(['enquiry','upload','delete']);
const unavailable=()=>Error('Rate limit unavailable');

function windowStart(now:number):number{
  if(!Number.isSafeInteger(now)||now<0)throw unavailable();
  return Math.floor(now/windowMs)*windowMs;
}

// The caller MUST derive a canonical identity from a trusted edge context, not
// arbitrary forwarded headers. Apply coarse edge abuse protection before this DB
// limiter. No live routing or default production thresholds are enabled here.
export function createRateLimiter(db:Database,secret:string,clock:()=>number=Date.now):
  (scope:Scope,trustedClientKey:string,policy:Policy)=>Promise<boolean>{
  if(secret.length!==64||!/^[0-9a-f]{64}$/.test(secret))throw Error('Invalid rate limit secret');
  const key=crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return async(scope,identity,policy)=>{
    if(!scopes.has(scope)||typeof identity!=='string'||identity.length<1||identity.length>256||/[^\x21-\x7e]/.test(identity))return false;
    const {clientLimit,globalLimit}=policy;
    if(!Number.isInteger(clientLimit)||!Number.isInteger(globalLimit)||clientLimit<1||clientLimit>globalLimit||globalLimit>10000)throw Error('Invalid rate limit policy');
    try{
      const start=windowStart(clock());
      // The global gate bounds the number of distinct rows attackers can create.
      // Attempts rejected by the client gate still consume the global allowance.
      const consume=async(subject:string,cap:number)=>db.prepare(
        "INSERT INTO request_rate_windows (scope,window_start,subject,hits) VALUES (?,?,?,1) "+
        "ON CONFLICT(scope,window_start,subject) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits"
      ).bind(scope,start,subject,cap).first<{hits:number}>();
      if(!await consume('global',globalLimit))return false;
      const digest=await crypto.subtle.sign('HMAC',await key,new TextEncoder().encode(JSON.stringify([scope,start,identity])));
      const pseudonym=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      return !!await consume(pseudonym,clientLimit);
    }catch{throw unavailable();}
  };
}

// Bounded batches, keeping current and previous windows. Invoke only from an
// approved maintenance scheduler; no cron or provider mutation here.
export async function purgeRateWindows(db:Database,now:number,limit=200):Promise<void>{
  if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid rate cleanup limit');
  const cutoff=windowStart(now)-windowMs;
  if(cutoff<=0)return;
  try{
    await db.prepare("DELETE FROM request_rate_windows WHERE (scope,window_start,subject) IN "+
      "(SELECT scope,window_start,subject FROM request_rate_windows WHERE window_start<? ORDER BY window_start,scope,subject LIMIT ?) RETURNING scope")
      .bind(cutoff,limit).first<{scope:string}>();
  }catch{throw unavailable();}
}
