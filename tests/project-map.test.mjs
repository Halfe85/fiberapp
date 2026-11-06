import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../planner/project-map.js',import.meta.url),'utf8');

class Element{
  constructor(tag,id=''){
    this.tag=tag;this.id=id;this.events=new Map();
    this.children=[];this.attrs={};this.value='';this.textContent='';
    this.hidden=false;this.disabled=false;this.classes=new Set();
    this.classList={
      add:name=>this.classes.add(name),
      remove:name=>this.classes.delete(name),
      contains:name=>this.classes.has(name),
      toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)
    };
  }
  addEventListener(type,fn){
    const handlers=this.events.get(type)||[];
    handlers.push(fn);this.events.set(type,handlers);
  }
  trigger(type,extra={}){
    for(const fn of this.events.get(type)||[])
      fn({target:this,preventDefault(){},stopPropagation(){},...extra});
  }
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
  replaceChildren(){this.children=[]}
  setAttribute(name,value){this.attrs[name]=value}
  querySelector(selector){
    return selector==='button'
      ?this.querySelectorAll(selector)[0]||null:null;
  }
  querySelectorAll(selector){
    return selector==='button'
      ?this.children.flatMap(child=>child.children).filter(child=>child.tag==='button'):[];
  }
  focus(){this.focused=true}
  blur(){this.blurred=true}
}

function setup(projectFound=true,results=()=>{
  return {ok:true,json:async()=>({adresser:[]})};
}){
  const ids=['map-project-title','map-address-query','map-address-results',
    'map-search-status','map-notice'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element('div',id)]));
  const document={
    getElementById:id=>elements[id]||null,
    createElement:tag=>new Element(tag),
    addEventListener(){},
    activeElement:null
  };
  const tiles=[],moves=[],markers=[],removed=[],popups=[],modalOpens=[];
  const map={
    events:{},
    on(type,fn){this.events[type]=fn;return this},
    setView(){return this},
    flyTo(point,zoom){moves.push({point,zoom});return this},
    removeLayer(layer){removed.push(layer)}
  };
  const leaflet={
    map:()=>map,
    tileLayer:url=>({addTo(){tiles.push(url);return this}}),
    divIcon:options=>options,
    popup:()=>({
      setLatLng(point){this.point=point;return this},
      setContent(content){this.content=content;return this},
      openOn(){popups.push(this);return this}
    }),
    marker:(location,options)=>{
      const point={location,options,
        addTo(){markers.push(this);return this},
        bindPopup(content){this.popup=content;return this},
        openPopup(){this.popupOpened=true;return this}
      };
      return point;
    }
  };
  const memory=new Map([['fiberapp.planner.projects.v1',
    JSON.stringify(projectFound?[{id:'p',name:'Pilotprosjekt'}]:[])]]);
  const localStorage={getItem:key=>memory.get(key)||null};
  const queue=new Map();let clock=0;
  const setTimeout=(fn,ms)=>{
    const id=++clock;queue.set(id,{fn,ms});return id;
  };
  const clearTimeout=id=>queue.delete(id);
  function nextTimer(){
    const entry=[...queue.entries()][0];
    if(!entry)throw Error('No scheduled timer');
    queue.delete(entry[0]);entry[1].fn();
    return entry[1].ms;
  }
  const requests=[];
  const fetch=(url,opts)=>{
    requests.push({url,opts});
    return Promise.resolve(results(url,opts));
  };
  runInNewContext(source,{
    document,window:{L:leaflet,FiberSearchAddressUnitsModal:{
      create:()=>({open:params=>{modalOpens.push(params)}})
    }},location:{href:'https://host.test/planner/map.html?project=p'},
    localStorage,URL,URLSearchParams,AbortController,
    setTimeout,clearTimeout,fetch
  });
  return {elements,tiles,moves,markers,removed,popups,modalOpens,map,
    requests,nextTimer,queue,memory};
}
const response=(number=12)=>({
  adresser:Array.from({length:number},(_,i)=>({
    adressetekst:'Storgata '+(i+1),postnummer:'1850',poststed:'Mysen',
    representasjonspunkt:{lat:59.5+i*.001,lon:11.3+i*.001}
  }))
});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};

test('existing project opens a full Kartverket map; missing project disables search',()=>{
  const project=setup();
  assert.equal(project.elements['map-project-title'].textContent,'Pilotprosjekt');
  assert.match(project.tiles[0],/cache.kartverket.no/);
  const missing=setup(false);
  assert.equal(missing.elements['map-address-query'].disabled,true);
  assert.match(missing.elements['map-search-status'].textContent,/Prosjektet er ikke/);
});

test('search returns over six rows with dropdown; selecting eighth moves map and replaces pin',async()=>{
  const env=setup(true,()=>({ok:true,json:async()=>response(12)}));
  const {elements,requests,moves,markers}=env;
  const query=elements['map-address-query'];
  query.value='Storgata';
  query.trigger('input');
  assert.equal(env.nextTimer(),280);
  await flush();
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/treffPerSide=40/);
  assert.match(requests[0].url,/sok=Storgata/);
  const rows=elements['map-address-results'];
  assert.equal(rows.children.length,12);
  assert.equal(rows.hidden,false);
  assert.equal(query.attrs['aria-expanded'],'true');
  rows.children[7].children[0].trigger('click');
  assert.equal(moves.length,1);
  assert.equal(moves[0].zoom,18);
  assert.ok(Math.abs(moves[0].point[0]-59.507)<1e-8);
  assert.equal(markers.length,1);
  assert.match(markers[0].options.icon.html,/<svg viewBox="0 0 36 48"/);
  assert.match(markers[0].options.icon.html,/<circle/);
  assert.equal(markers[0].popup.children[0].textContent,'Storgata 8');
  assert.equal(rows.hidden,true);
  assert.equal(query.value,'Storgata 8');
  assert.equal(env.memory.size,1);
});

test('search waits until two characters, then reports empty results',async()=>{
  const env=setup();
  const query=env.elements['map-address-query'];
  query.value='S';query.trigger('input');
  assert.equal(env.queue.size,0);
  query.value='St';query.trigger('input');
  env.nextTimer();await flush();
  assert.equal(env.elements['map-address-results'].hidden,true);
  assert.match(env.elements['map-search-status'].textContent,/Ingen adresser funnet/);
});

test('an old pending response cannot overwrite a newer address result',async()=>{
  let respondOld;
  const env=setup(true,(url)=>{
    if(url.includes('sok=Old'))return new Promise(resolve=>{respondOld=resolve});
    return {ok:true,json:async()=>response(2)};
  });
  const query=env.elements['map-address-query'];
  query.value='Old';query.trigger('input');env.nextTimer();
  await flush();
  query.value='Storgata';query.trigger('input');env.nextTimer();
  await flush();
  assert.equal(env.elements['map-address-results'].children.length,2);
  respondOld({ok:true,json:async()=>response(1)});
  await flush();
  assert.equal(env.elements['map-address-results'].children.length,2);
});

test('map click resolves nearest address and + opens read-only unit lookup',async()=>{
  const env=setup(true,()=>({ok:true,json:async()=>response(2)}));
  env.map.events.click({latlng:{lat:59.6,lng:11.4}});
  await flush();
  assert.equal(env.popups.length,1);
  assert.equal(env.popups[0].content.children[0].textContent,'Storgata 1');
  assert.match(env.requests[0].url,/punktsok/);
  assert.match(env.requests[0].url,/radius=55/);
  const plus=env.popups[0].content.children.at(-1);
  assert.equal(plus.textContent,'+');
  plus.trigger('click');
  assert.equal(env.modalOpens.length,1);
  assert.equal(env.modalOpens[0].lat,59.6);
  assert.equal(env.modalOpens[0].lng,11.4);
  assert.equal(env.modalOpens[0].address.title,'Storgata 1');
});

test('map clicks ignore out-of-order stale address lookup',async()=>{
  let finishOld;
  const env=setup(true,(url)=>{
    if(url.includes('lat=59.6'))return new Promise(done=>{finishOld=done});
    return {ok:true,json:async()=>response(2)};
  });
  env.map.events.click({latlng:{lat:59.6,lng:11.4}});
  await flush();
  env.map.events.click({latlng:{lat:59.9,lng:11.1}});
  await flush();
  const active=env.popups[1].content.children[0].textContent;
  finishOld({ok:true,json:async()=>({adresser:[{adressetekst:'Gammel adresse',
    representasjonspunkt:{lat:59.5,lon:11.3}}]})});
  await flush();
  assert.equal(env.popups[1].content.children[0].textContent,active);
  assert.equal(env.popups[0].content.children[0].textContent,'Søker adresser …');
});
