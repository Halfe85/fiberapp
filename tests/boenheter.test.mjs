import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../planner/project-items.js',import.meta.url),'utf8');
const polygon={type:'Polygon',coordinates:[[[11,59],[11.1,59],[11.1,59.1],[11,59.1],[11,59]]]};
const originals=[
  {id:'a1',projectId:'p',kind:'address',name:'Storgata 12B',
    addressKey:'0301|100|12|B|0123',postcode:'0123',
    area:{kind:'building',geometry:polygon},
    boenheter:[{adresse:'Storgata',adresseNr:12,adresseBokstav:'B',
      etasje:'H01',leilighetsnummer:'H0102',source:'Kartverket'}]},
  {id:'a2',projectId:'p',kind:'address',name:'Storgata 12A',postcode:'0123'},
  {id:'eq',projectId:'p',kind:'equipment',name:'ODF 1'},
  {id:'other',projectId:'q',kind:'address',name:'Storgata 12B',postcode:'0123'}
];

class Element {
  constructor(name){
    this.name=name;this.children=[];this.events=new Map();this.dataset={};
    this.hidden=false;this.open=false;this.disabled=false;this.checked=false;
    this.value='';this.textContent='';this.isConnected=true;
    const classes=new Set();
    this.classList={
      add:x=>classes.add(x),remove:x=>classes.delete(x),
      contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)
    };
  }
  addEventListener(name,fn){
    const handlers=this.events.get(name)||[];
    handlers.push(fn);this.events.set(name,handlers);
  }
  click(){
    for(const fn of this.events.get('click')||[])
      fn({target:this,detail:1,preventDefault(){},stopPropagation(){}});
  }
  change(){
    for(const fn of this.events.get('change')||[])fn({target:this});
  }
  append(...children){for(const c of children){c.parentElement=this;this.children.push(c)}}
  replaceChildren(){this.children=[]}
  setAttribute(key,value){this[key]=value}
  querySelector(selector){
    return selector==='.project-item-focus'
      ? this.children.find(c=>c.className==='project-item-focus')||null:null;
  }
  contains(node){return this===node}
  showModal(){this.open=true}
  close(){
    this.open=false;
    for(const fn of this.events.get('close')||[])fn({target:this});
  }
  focus(){}blur(){}reset(){}scrollIntoView(){}
}

function setup(apiResponse,ok=true){
  const ids=[...new Set([...source.matchAll(/document\.getElementById\('([^']+)'\)/g)]
    .map(match=>match[1]))];
  const els=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  const document={
    getElementById:id=>els[id]||null,
    createElement:name=>new Element(name),
    addEventListener(){}
  };
  const state=new Map([
    ['fiberapp.planner.items.v1',JSON.stringify(originals)],
    ['fiberapp.planner.projects.v1','[{"id":"p","postcode":"0123"}]']
  ]);
  const localStorage={
    getItem:key=>state.get(key)??null,
    setItem:(key,value)=>state.set(key,value)
  };
  const callbacks=new Map(),events=[];
  const window={
    addEventListener(name,fn){
      const list=callbacks.get(name)||[];
      list.push(fn);callbacks.set(name,list);
    },
    dispatchEvent(event){
      events.push(event);
      for(const fn of callbacks.get(event.type)||[])fn(event);
    }
  };
  class CustomEvent {
    constructor(type,init){this.type=type;this.detail=init?.detail}
  }
  const requested=[];
  const fetch=async url=>{
    requested.push(String(url));
    return {ok,status:503,json:async()=>apiResponse};
  };
  runInNewContext(source,{
    window,document,localStorage,fetch,
    location:{href:'https://example.test/planner/?project=p'},
    URL,URLSearchParams,AbortController,CustomEvent,console,
    crypto:{randomUUID:()=> 'new-id'},
    setTimeout:()=>1,clearTimeout:()=>{}
  });
  return {els,state,events,requested};
}
async function flush(){
  for(let n=0;n<12;n++)await Promise.resolve();
}

test('unit lookup uses exact address and only persists checked units on OK',async()=>{
  const result=setup({adresser:[
    {objtype:'Vegadresse',adressenavn:'Storgata',nummer:12,bokstav:'B',
      kommunenummer:'0301',postnummer:'0123',
      bruksenhetsnummer:['H0101','H0102','H0201','H0201','not-a-unit']},
    {objtype:'Vegadresse',adressenavn:'Storgata',nummer:12,bokstav:'A',
      kommunenummer:'0301',postnummer:'0123',bruksenhetsnummer:['H9901']},
    {objtype:'Vegadresse',adressenavn:'Annen gate',nummer:12,bokstav:'B',
      kommunenummer:'0301',postnummer:'0123',bruksenhetsnummer:['H8801']}
  ]});
  const {els,state,requested,events}=result;
  const before=state.get('fiberapp.planner.items.v1');
  els['project-addresses'].children[0].children[1].click();
  assert.equal(els['project-address-edit-dialog'].open,true);
  assert.equal(els['project-address-units-panel'].hidden,true);
  els['project-address-units-search'].click();
  await flush();
  assert.match(requested[0],/adressenavn=Storgata/);
  assert.match(requested[0],/nummer=12/);
  assert.match(requested[0],/bokstav=B/);
  assert.match(requested[0],/kommunenummer=0301/);
  const rows=els['project-address-units-rows'].children;
  assert.deepEqual(rows.map(r=>r.children[5].textContent),['H0101','H0102','H0201']);
  assert.deepEqual(rows.map(r=>r.children[0].children[0].checked),[false,true,false]);
  assert.equal(state.get('fiberapp.planner.items.v1'),before);
  rows[1].children[0].children[0].checked=false;
  rows[1].children[0].children[0].change();
  rows[2].children[0].children[0].checked=true;
  rows[2].children[0].children[0].change();
  els['project-address-units-ok'].click();
  const updated=JSON.parse(state.get('fiberapp.planner.items.v1'));
  assert.equal(els['project-address-edit-dialog'].open,false);
  assert.deepEqual(updated[0].boenheter.map(unit=>unit.leilighetsnummer),['H0201']);
  assert.deepEqual(updated[0].area,originals[0].area);
  assert.deepEqual(updated.slice(1),originals.slice(1));
  assert.ok(events.some(e=>e.type==='fiberapp:planner-items-changed'&&e.detail.projectId==='p'));
  els['project-addresses'].children[0].children[1].click();
  els['project-address-units-search'].click();
  await flush();
  assert.deepEqual(els['project-address-units-rows'].children
    .map(r=>r.children[0].children[0].checked),[false,false,true]);
});

test('failed lookup never overwrites stored units',async()=>{
  const {els,state}=setup({},false);
  const before=state.get('fiberapp.planner.items.v1');
  els['project-addresses'].children[0].children[1].click();
  els['project-address-units-search'].click();
  await flush();
  assert.equal(els['project-address-units-ok'].disabled,true);
  assert.match(els['project-address-units-status'].textContent,/Kunne ikke hente/);
  els['project-address-edit-close'].click();
  assert.equal(state.get('fiberapp.planner.items.v1'),before);
});
