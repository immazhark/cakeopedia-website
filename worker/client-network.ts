// Use only with the verified edge's client IP, never with arbitrary X-Forwarded-For
// or a client-controlled identifier. Normalization is not proof of header trust.
export function canonicalClientNetwork(value:string|null):string|null{
  if(typeof value!=='string'||value.length<1||value.length>45)return null;
  if(!value.includes(':')){
    const parts=value.split('.');
    if(parts.length!==4||parts.some(part=>!/^(?:0|[1-9]\d{0,2})$/.test(part)||Number(part)>255))return null;
    return 'v4:'+parts.join('.');
  }
  if(!/^[0-9a-fA-F:.]+$/.test(value))return null;
  try{
    const normalized=new URL('http://['+value+']/').hostname.slice(1,-1);
    const halves=normalized.split('::');
    const left=halves[0]?halves[0].split(':'):[];
    const right=halves[1]?halves[1].split(':'):[];
    const groups=halves.length===2?[...left,...Array<string>(8-left.length-right.length).fill('0'),...right]:left;
    if(groups.length!==8)return null;
    const numbers=groups.map(group=>Number.parseInt(group,16));
    const high=numbers[6],low=numbers[7];
    if(numbers.slice(0,5).every(n=>n===0)&&numbers[5]===65535&&high!==undefined&&low!==undefined){
      return 'v4:'+[(high>>8)&255,high&255,(low>>8)&255,low&255].join('.');
    }
    return 'v6:'+numbers.slice(0,4).map(n=>n.toString(16)).join(':')+'::/64';
  }catch{return null;}
}
