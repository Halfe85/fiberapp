import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../planner/network-editor.js',import.meta.url),'utf8');
const area={type:'Polygon',coordinates:[[[11,59],[11.2,59],[11.2,59.2],[11,59.2],[11,59]]]};
const projects=[
 {id:'p',name:'Pilot',createdAt:'2026-11-05'},
 {id:'q',name:'Separate project',createdAt:'2026-11-05'}
];
const addresses=[
 {id:'a',projectId:'p',kind:'address',name:'Storgata 1',
  latitude:59.1,longitude:11.1,area:{kind:'building',geometry:area}},
 {id:'other',projectId:'q',kind:'address',name:'Other 5',
  latitude:59.1,longitude:11.1,area:{kind:'building',geometry:area}}
];

class El {
 constructor(tag,id=''){
  this.tag=tag;this.id=id;this.children=[];this.events=new Map();
  this.textContent='';this.hidden=false;this.disabled=false;
  this.dataset={};this._value='';this.attrs={};
  const names=new Set();
  this.classList={
   add:x=>names.add(x),remove:x=>names.delete(x),
   toggle:(x,on)=>on?names.add(x):names.delete(x),
   contains:x=>names.has(x)
  };
 }
 get options(){return this.children.filter(x=>x.tag==='option')}
 get value(){return this._value||this.options[0]?.value||''}
 set value(v){this._value=v}
 append(...items){for(const x of items){x.parentElement=this;this.children.push(x)}}
 replaceChildren(){this.children=[];this._value=''}
 addEventListener(name,fn){
  const arr=this.events.get(name)||[];arr.push(fn);this.events.set(name,arr);
 }
 click(){
  for(const fn of this.events.get('click')||[])
   fn({target:this,stopPropagation(){},preventDefault(){}});
 }
 setAttribute(k,v){this.attrs[k]=v}
 remove(){}
}
function setup(){
 const ids=[...new Set([...script.matchAll(/el\('([^']+)'\)/g)].map(m=>m[1]))];
 const els=Object.fromEntries(ids.map(id=>[id,new El('div',id)]));
 for(const id of ['network-device-address','network-device-type','network-room-address',
  'network-route-kind','network-cable-fibers','network-rack-room',
  'network-rack-kind','network-module-rack','network-module-type'])els[id].tag='select';
 els['network-route-kind'].append(Object.assign(new El('option'),{value:'underground'}));
 els['network-rack-kind'].append(Object.assign(new El('option'),{value:'rack'}));
 els['network-tube-type'].value='Uspesifisert';
 const originalItems=JSON.stringify(addresses);
 const storage=new Map([
  ['fiberapp.planner.projects.v1',JSON.stringify(projects)],
  ['fiberapp.planner.items.v1',originalItems]
 ]);
 const localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value)
 };
 const host={classList:{add(){},remove(){},toggle(){}}};
 const document={
  getElementById:id=>els[id]||null,
  querySelector:query=>query==='.network-map-area'?host:null,
  querySelectorAll:()=>[],
  createElement:tag=>new El(tag),
  addEventListener(){}
 };
 let map;
 const groups=[],lines=[];
 const L={
  map:()=>{
   map={
    events:{},calls:[],
    on(t,fn){this.events[t]=fn},
    fitBounds(points){this.calls.push(['fitBounds',points]);return this},
    setView(point,zoom){this.calls.push(['setView',point,zoom]);return this},
    invalidateSize(){}
   };
   return map;
  },
  tileLayer:()=>({addTo(){return this}}),
  layerGroup:()=>{
   const group={layers:[],clearLayers(){this.layers=[]},addTo(){return this}};
   groups.push(group);return group;
  },
  geoJSON:()=>({
   eachLayer(fn){fn({on(){},bindTooltip(){return this}})},
   addTo(layer){layer.layers.push(this)}
  }),
  polyline:(points,style)=>{
   const route={points,style,events:{},setLatLngs(next){this.points=next},
    addTo(layer){if(layer.layers)layer.layers.push(this);lines.push(this);return this},
    bindTooltip(){return this},on(t,fn){this.events[t]=fn},remove(){}
   };
   return route;
  },
  circleMarker:()=>({bindTooltip(){return this},on(){},addTo(group){group.layers.push(this)}}),
  DomEvent:{stopPropagation(){}}
 };
 let sequence=0;
 const window={L,confirm:()=>true,dispatchEvent(){}};
 class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail}}
 runInNewContext(script,{
  window,document,localStorage,URL,
  location:{href:'https://example.test/planner/network.html?project=p'},
  CustomEvent,crypto:{randomUUID:()=>String(++sequence)}
 });
 const clickMap=(lat,lng)=>map.events.click({latlng:{lat,lng}});
 const snapshot=()=>JSON.parse(storage.get('fiberapp.planner.network.v1')).projects.p;
 return {els,map,groups,lines,storage,clickMap,snapshot,originalItems};
}

test('devices are restricted to their chosen marked building',()=>{
 const env=setup(),{els,clickMap,storage,originalItems,snapshot}=env;
 assert.ok(els['network-device-address'].options.some(x=>x.value==='a'));
 assert.ok(!els['network-device-address'].options.some(x=>x.value==='other'));
 els['network-device-address'].value='a';
 els['network-place-device'].click();
 clickMap(60,12);
 assert.equal(storage.has('fiberapp.planner.network.v1'),false);
 clickMap(59.1,11.1);
 assert.equal(snapshot().devices.length,1);
 assert.equal(snapshot().devices[0].addressId,'a');
 assert.equal(storage.get('fiberapp.planner.items.v1'),originalItems);
});

test('rooms, racks and ODF panel variants are linked, not mapped as internal cables',()=>{
 const env=setup(),{els,clickMap,snapshot}=env;
 els['network-room-address'].value='a';
 els['network-room-name'].value='Teknisk rom';
 els['network-place-room'].click();
 clickMap(59.1,11.1);
 assert.equal(snapshot().rooms.length,1);
 assert.equal(els['network-rack-room'].value,snapshot().rooms[0].id);
 els['network-rack-name'].value='Hovedrack';
 els['network-add-rack'].click();
 assert.equal(snapshot().racks.length,1);
 assert.equal(els['network-module-rack'].value,snapshot().racks[0].id);
 els['network-module-type'].value='odf-1_5u-lc-apc';
 els['network-add-module'].click();
 assert.equal(snapshot().modules.length,1);
 assert.equal(snapshot().modules[0].ports,96);
 assert.equal(snapshot().modules[0].heightU,1.5);
 assert.equal(snapshot().modules[0].rackId,snapshot().racks[0].id);
 assert.equal('points' in snapshot().rooms[0],false);
});

test('drawn underground routes own cable paths; deleting a route removes its cables',()=>{
 const env=setup(),{els,clickMap,snapshot}=env;
 els['network-draw-route'].click();
 clickMap(59.02,11.02);clickMap(59.1,11.1);clickMap(59.3,11.3);
 els['network-finish-route'].click();
 assert.equal(snapshot().routes.length,1);
 assert.equal(snapshot().routes[0].points.length,3);
 assert.equal(snapshot().routes[0].kind,'underground');
 els['network-cable-fibers'].value='576';
 els['network-add-cable'].click();
 assert.equal(snapshot().cables.length,1);
 assert.equal(snapshot().cables[0].fibers,576);
 assert.equal(snapshot().cables[0].routeId,snapshot().routes[0].id);
 assert.equal('points' in snapshot().cables[0],false);
 const routeRow=els['network-route-list'].children[0];
 routeRow.children[1].click();
 assert.equal(snapshot().routes.length,0);
 assert.equal(snapshot().cables.length,0);
});

test('an unfinished route is discarded when cancelled',()=>{
 const env=setup(),{els,clickMap,storage}=env;
 els['network-draw-route'].click();
 clickMap(59.02,11.02);
 els['network-cancel-route'].click();
 assert.equal(storage.has('fiberapp.planner.network.v1'),false);
});
