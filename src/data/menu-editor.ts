import { parseMenu, type MenuItem } from './menu.ts';

// Pure editorial boundary. Caller must authenticate the owner and persist with
// an atomic compare-and-set on expectedRevision; this function is not a DB lock.
export function editMenuItem(current:MenuItem|null,expectedRevision:number|null,editorInput:unknown,serverTime:string):MenuItem{
  const previous=current===null?null:parseMenu([current])[0]!;
  if(expectedRevision!==(previous?.revision??null))throw Error('Menu revision conflict');
  if(!editorInput||typeof editorInput!=='object'||Array.isArray(editorInput)||
     Object.hasOwn(editorInput,'revision')||Object.hasOwn(editorInput,'updatedAt'))throw Error('Invalid menu edit');
  const input=editorInput as Record<string,unknown>;
  if(previous&&input.id!==previous.id)throw Error('Menu identity cannot change');
  const next=parseMenu([{...input,revision:(previous?.revision??0)+1,updatedAt:serverTime}])[0]!;
  if(previous&&next.updatedAt<previous.updatedAt)throw Error('Menu timestamp cannot move backwards');
  return next;
}

// Use only after owner review. This export removes drafts, archived and
// unavailable entries before writing to the public repository. Invalid source
// content fails as a whole instead of publishing a partial, misleading menu.
export function approvedMenuExport(editorial:unknown):MenuItem[]{
  return parseMenu(editorial).filter(item=>item.status==='published'&&item.availability==='available');
}

// Static builds reject unpublished content accidentally committed to the public
// dataset rather than silently hiding it in rendered output.
export function parseApprovedMenu(dataset:unknown):MenuItem[]{
  const entries=parseMenu(dataset);
  if(entries.some(item=>item.status!=='published'||item.availability!=='available'))throw Error('Non-public entry in approved menu dataset');
  return entries;
}
