import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editMenuItem, approvedMenuExport, parseApprovedMenu } from '../src/data/menu-editor.ts';
import { parseMenu } from '../src/data/menu.ts';

const initial={id:'synthetic-cake',title:'Synthetic test',category:'Test',status:'draft',availability:'available',kind:'custom',sizes:[],flavours:[],fillings:[],addons:[],ingredientNote:null};
const time='2026-11-25T00:00:00.000Z';
const later='2026-11-25T00:00:01.000Z';
const ready={...initial,status:'published',sizes:[{label:'Test size',layers:2,servings:{min:4,max:6},priceCents:100}]};

test('first edit assigns server revision and validates draft',()=>{
  const item=editMenuItem(null,null,initial,time);
  assert.equal(item.revision,1);
  assert.equal(item.updatedAt,time);
  assert.equal(item.status,'draft');
});
test('updates require the current revision and immutable ID',()=>{
  const previous=editMenuItem(null,null,initial,time);
  const next=editMenuItem(previous,1,ready,later);
  assert.equal(next.revision,2);
  assert.equal(next.status,'published');
  assert.throws(()=>editMenuItem(previous,0,ready,later),{message:'Menu revision conflict'});
  assert.throws(()=>editMenuItem(previous,1,{...ready,id:'new-id'},later));
  assert.throws(()=>editMenuItem(previous,1,ready,'2026-11-24T00:00:00Z'));
  assert.equal(previous.status,'draft');
});
test('rejects editor-supplied metadata and incomplete publication',()=>{
  assert.throws(()=>editMenuItem(null,null,{...initial,revision:5},time));
  assert.throws(()=>editMenuItem(null,null,{...initial,updatedAt:time},time));
  assert.throws(()=>editMenuItem(null,null,{...initial,status:'published'},time));
  assert.throws(()=>editMenuItem(null,1,initial,time),{message:'Menu revision conflict'});
});
test('only published and available records leave the private editorial source',()=>{
  const draft=editMenuItem(null,null,initial,time);
  const published=editMenuItem(draft,1,ready,later);
  const unavailable=editMenuItem(null,null,{...ready,id:'unavailable',availability:'unavailable'},time);
  const archive=editMenuItem(null,null,{...ready,id:'archived',status:'archived'},time);
  assert.deepEqual(approvedMenuExport([draft,unavailable,archive]),[]);
  const exported=approvedMenuExport([published,unavailable,archive]);
  assert.deepEqual(exported,[published]);
  exported[0]!.title='Changed';
  assert.equal(published.title,initial.title);
  assert.throws(()=>parseApprovedMenu([draft]));
  assert.throws(()=>parseApprovedMenu([unavailable]));
  assert.deepEqual(parseApprovedMenu([]),[]);
  assert.deepEqual(parseApprovedMenu([published]),[published]);
});
test('invalid private data cannot be silently exported',()=>{
  assert.throws(()=>approvedMenuExport([{...initial,revision:1,updatedAt:time,privateNote:'test'}]));
  const data=parseMenu([{...ready,revision:1,updatedAt:time}]);
  assert.throws(()=>approvedMenuExport([...data,...data]));
});
