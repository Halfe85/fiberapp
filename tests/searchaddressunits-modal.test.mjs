import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../src/components/modals/searchaddressunits-modal/searchaddressunits-modal.js',import.meta.url),'utf8');

class Element{
  constructor(tag='div'){
    this.tag=tag;this.children=[];this.events={};this.attrs={};
    this.textContent='';this.hidden=false;this.open=false;
    this.isConnected=true;this.type='';this.className='';this.focused=false;
    const classes=new Set();
    this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),
      toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
  }
  append(...xs){this.children.push(...xs)}
  replaceChildren(){this.children=[]}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn)}
  fire(name){
    for(const fn of this.events[name]||[])fn({
      target:this,stopPropagation(){},preventDefault(){}
    });
  }
  focus(){this.focused=true}
  showModal(){this.open=true}
  close(){this.open=false;this.fire('close')}
}
class Dialog extends Element{
  constructor(){
    super('dialog');this.nodes=Object.fromEntries(
      ['sau-title','sau-status','sau-rows','sau-close','sau-table-wrap','sau-summary']
        .map(key=>[key,new Element()]));
  }
  querySelector(selector){return this.nodes[selector.slice(1)]||null}
}
class Query{
  constructor(entries){this.entries=new Map(Object.entries(entries))}
  set(k,v){this.entries.set(k,v)}
  toString(){return [...this.entries].map(([k,v])=>
    encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')}
}
class Abort{
  constructor(){this.signal={aborted:false}}
  abort(){this.signal.aborted=true}
}
function setup(responder){
  const document={createElement:tag=>new Element(tag),activeElement:new Element('button')};
  const window={};
  runInNewContext(code,{window,document,Intl,URLSearchParams:Query,AbortController:Abort});
  const dialog=new Dialog(),calls=[];
  const http=async (url,opts)=>{
    calls.push({url:String(url),opts});
    return responder(String(url),opts);
  };
  const app=window.FiberSearchAddressUnitsModal.create({dialog,fetcher:http});
  return {app,dialog,calls,api:window.FiberSearchAddressUnitsModal};
}
const apartment=(street,number,letter,units)=>({
  objtype:'Vegadresse',adressenavn:street,adressekode:123,
  nummer:number,bokstav:letter,kommunenummer:'0301',
  gardsnummer:40,bruksnummer:8,postnummer:'0123',bruksenhetsnummer:units
});
const ok=data=>({ok:true,json:async()=>data});
const success=url=>{
  if(url.includes('/eiendom/'))return ok({eiendom:[
    {kommunenummer:'0301',gardsnummer:40,bruksnummer:8,meterFraPunkt:0}
  ]});
  return ok({adresser:[
    apartment('Storgata',12,'B',['H0202','H0101','H0201','H0101']),
    apartment('Storgata',12,'B',['H0102']),
    apartment('Storgata',12,'A',['H0101']),
    apartment('Storgata',14,'',['H0101']),
    {...apartment('Storgata',12,'B',['H9999']),bruksnummer:9}
  ]});
};
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};

test('parcel search groups, sorts and expands unit rows without storing data',async()=>{
  const {app,dialog,calls}=setup(success);
  await app.open({lat:59.9,lng:10.7,address:{title:'Storgata 12B'}});
  const addressRows=dialog.nodes['sau-rows'].children.filter(x=>x.className==='sau-address-row');
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/eiendom\/v1\/punkt/);
  assert.match(calls[0].url,/koordsys=4258/);
  assert.match(calls[1].url,/gardsnummer=40/);
  assert.equal(addressRows.length,3);
  assert.deepEqual(addressRows.map(x=>[x.children[0].children.at(-1).textContent,
    x.children[1].textContent,x.children[2].textContent]),[
    ['Storgata','12','A'],['Storgata','12','B'],['Storgata','14','–']
  ]);
  const second=addressRows[1],expand=second.children[0].children[0];
  assert.equal(expand.textContent,'+');
  assert.equal(expand.attrs['aria-expanded'],'false');
  assert.equal(dialog.nodes['sau-summary'].textContent,'3 adresser · 6 registrerte bruksenhetsnumre');
  let unitRows=dialog.nodes['sau-rows'].children.filter(x=>x.className==='sau-unit-row');
  assert.equal(unitRows.length,4);
  assert.ok(unitRows.every(x=>x.hidden));
  expand.fire('click');
  assert.equal(expand.textContent,'−');
  assert.ok(unitRows.every(x=>!x.hidden));
  assert.deepEqual(unitRows.map(x=>x.children[3].textContent),
    ['H0101','H0102','H0201','H0202']);
  assert.deepEqual(unitRows.map(x=>x.children[4].textContent),
    ['H01','H01','H02','H02']);
  expand.fire('click');
  assert.ok(unitRows.every(x=>x.hidden));
  assert.equal(dialog.open,true);
  app.close();
  assert.equal(dialog.open,false);
});

test('when parcel lookup fails, nearby addresses are clearly marked unverified',async()=>{
  const {app,dialog,calls}=setup(url=>{
    if(url.includes('/eiendom/'))throw Error('Offline');
    return ok({adresser:[apartment('Storgata',12,'', ['H0101'])]});
  });
  await app.open({lat:59.9,lng:10.7});
  assert.equal(calls.length,2);
  assert.match(calls[1].url,/punktsok/);
  assert.match(dialog.nodes['sau-status'].textContent,/ikke verifisert/);
  assert.equal(dialog.nodes['sau-rows'].children.length,1);
});

test('the dialog does not retain old results after a failed or cancelled request',async()=>{
  let resolveProperty;
  const {app,dialog}=setup(url=>{
    if(url.includes('/eiendom/')){
      return new Promise(resolve=>{resolveProperty=resolve});
    }
    return ok({adresser:[]});
  });
  const pending=app.open({lat:59.9,lng:10.7});
  await flush();
  app.close();
  resolveProperty(ok({eiendom:[
    {kommunenummer:'0301',gardsnummer:40,bruksnummer:8,meterFraPunkt:0}
  ]}));
  await pending;
  assert.equal(dialog.open,false);
  assert.equal(dialog.nodes['sau-rows'].children.length,0);
});

test('normalization rejects unknown unit numbers and merges duplicate address entries',()=>{
  const {api}=setup(success);
  const groups=api.groupAddresses([
    apartment('Storgata',12,'B',['H0201','N9999','H0102']),
    apartment('Storgata',12,'B',['H0102','H0101'])
  ]);
  assert.equal(groups.length,1);
  assert.deepEqual(groups[0].codes,['H0101','H0102','H0201']);
});
