/* Address-first workflow. Official Kartverket address point, no hand-drawn areas. */
(() => {
 'use strict';
 const API='https://api.kartverket.no/adresser/v1';
 const KEY='fiberapp.planner.items.v1',PROJECTS='fiberapp.planner.projects.v1';
 const id=new URL(location.href).searchParams.get('project')||'';
 const el=x=>document.getElementById(x);
 const info=el('address-search-status'),choices=el('address-search-choices');
 const chosenLabel=el('address-selected-label'),unitStatus=el('address-units-status');
 const unitsTbody=el('address-units-rows'),unitsWrap=el('address-units-table-wrap');
 const save=el('address-save'),postcodeBox=el('address-postcode-filter');
 const input=el('address-search-query'),selectAll=el('address-select-all');
 const read=key=>{try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
 const project=read(PROJECTS).find(x=>x && x.id===id);
 if(!project){
  info.textContent='Prosjektet finnes ikke i denne nettleseren. Gå tilbake til prosjektoversikten.';
  input.disabled=true;save.disabled=true;return;
 }
 el('back-to-project').href='./?project='+encodeURIComponent(id);
 const postcode=typeof project.postcode==='string'?project.postcode:'';
 el('address-postcode-label').textContent=postcode||'(ikke satt)';
 if(!postcode){postcodeBox.checked=false;postcodeBox.disabled=true}
 let map=null,marker=null,selected=null,found=[],included=new Set();
 let abort=null,timer=null,sequence=0;
 const L=window.L;
 const goodCoord=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 const keyOf=a=>[a.kommunenummer||'',a.adressekode??a.adressenavn,a.nummer??'',a.bokstav||'',a.postnummer||'']
  .join('|').toLocaleLowerCase('nb-NO');
 function normalized(raw){
  if(!raw || raw.objtype!=='Vegadresse'||!Number.isInteger(raw.nummer)||!raw.adressenavn)return null;
  const pos=raw.representasjonspunkt;
  if(!pos || !goodCoord(pos.lat,pos.lon))return null;
  const road=String(raw.adressenavn).trim(),letter=String(raw.bokstav||'').trim();
  if(!road)return null;
  const numbers=[...new Set((Array.isArray(raw.bruksenhetsnummer)?raw.bruksenhetsnummer:[])
    .filter(x=>typeof x==='string').map(x=>x.trim().toUpperCase())
    .filter(x=>/^[HKUL]\d{4}$/.test(x)))].sort((a,b)=>a.localeCompare(b,'nb-NO'));
  return {addressKey:keyOf(raw),name:road+' '+raw.nummer+letter,
   street:road,number:raw.nummer,letter,postcode:String(raw.postnummer||''),
   poststed:String(raw.poststed||''),municipality:String(raw.kommunenummer||''),
   latitude:pos.lat,longitude:pos.lon,numbers};
 }
 function cancel(){
  sequence++;if(timer!==null)clearTimeout(timer);timer=null;
  if(abort)abort.abort();abort=null;
 }
 const message=(value,warning=false)=>{info.textContent=value;info.classList.toggle('is-error',warning)};
 function units(){
  unitsTbody.replaceChildren();
  included=new Set();
  selectAll.checked=false;
  const numbers=selected?.numbers||[];
  for(const number of numbers){
   const row=document.createElement('tr'),first=document.createElement('td');
   const check=document.createElement('input');check.type='checkbox';
   check.setAttribute('aria-label','Velg '+number);
   check.addEventListener('change',()=>{if(check.checked)included.add(number);else included.delete(number);
     selectAll.checked=included.size===numbers.length});
   first.append(check);row.append(first);
   for(const value of [selected.street,selected.number,selected.letter||'–',number.slice(0,3),number]){
    const td=document.createElement('td');td.textContent=String(value);row.append(td);
   }
   unitsTbody.append(row);
  }
  unitsWrap.hidden=!numbers.length;
  unitStatus.textContent=numbers.length
   ? 'Fant '+numbers.length+' registrerte bruksenhetsnumre. Huk av dem som skal inngå i prosjektet.'
   : selected?'Ingen registrerte bruksenhetsnumre oppgitt for denne adressen. Du kan lagre adressen likevel.':'Velg en offisiell adresse først.';
 }
 function choose(candidate){
  cancel();selected=candidate;save.disabled=false;input.value=candidate.name;
  choices.replaceChildren();
  chosenLabel.hidden=false;
  chosenLabel.textContent='Valgt adresse: '+candidate.name+', '+candidate.postcode+' '+candidate.poststed;
  message('Offisielt adressepunkt valgt. Velg bruksenheter og lagre.');
  units();
  if(map){
   if(marker)map.removeLayer(marker);
   marker=L.circleMarker([candidate.latitude,candidate.longitude],{
     radius:9,color:'#fff',weight:3,fillColor:'#ef8127',fillOpacity:1
   }).addTo(map);
   map.flyTo([candidate.latitude,candidate.longitude],18,{duration:.5});
  }
 }
 function matches(entries){
  const result=new Map();
  for(const entry of Array.isArray(entries)?entries:[]){
   const choice=normalized(entry);
   if(!choice||result.has(choice.addressKey))continue;
   if(postcodeBox.checked && postcode && choice.postcode!==postcode)continue;
   result.set(choice.addressKey,choice);
  }
  choices.replaceChildren();
  for(const choice of result.values()){
   const button=document.createElement('button');button.type='button';
   button.className='wf-choice';
   const label=document.createElement('strong');label.textContent=choice.name;
   const detail=document.createElement('small');detail.textContent=choice.postcode+' '+choice.poststed+
     ' · '+choice.numbers.length+' registrerte bruksenheter';
   button.append(label,detail);
   button.addEventListener('click',()=>choose(choice));
   choices.append(button);
  }
  message(result.size?'Velg riktig adresse fra trefflisten.':
   'Fant ingen adresser med valgt postnummer nær dette punktet. Prøv søket eller fjern postnummerfilteret.');
 }
 async function request(path,params){
  cancel();const n=sequence,c=new AbortController();abort=c;
  message('Søker hos Kartverket …');
  try{
   const res=await fetch(API+path+'?'+params.toString(),{signal:c.signal,headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('HTTP '+res.status);
   const data=await res.json();
   if(n!==sequence || c.signal.aborted)return;
   selected=null;save.disabled=true;chosenLabel.hidden=true;
   units();matches(data?.adresser);
  }catch(error){
   if(n===sequence && !c.signal.aborted)message('Kunne ikke hente adresser fra Kartverket. Kontroller tilkoblingen og prøv igjen.',true);
  }finally{if(n===sequence)abort=null}
 }
 function searchText(){
  const query=input.value.trim().replace(/\s+/g,' ');
  cancel();selected=null;save.disabled=true;chosenLabel.hidden=true;units();
  if(query.length<2){choices.replaceChildren();message('Skriv minst to tegn eller trykk i kartet.');return}
  timer=setTimeout(()=>{
   const params=new URLSearchParams({sok:query+'*',objtype:'Vegadresse',treffPerSide:'50',side:'0'});
   if(postcodeBox.checked && postcode)params.set('postnummer',postcode);
   void request('/sok',params);
  },280);
 }
 input.addEventListener('input',searchText);
 postcodeBox.addEventListener('change',()=>{if(input.value.trim().length>=2)searchText()});
 selectAll.addEventListener('change',()=>{
  if(!selected)return;
  included=selectAll.checked?new Set(selected.numbers):new Set();
  for(const row of unitsTbody.children)row.firstElementChild.firstElementChild.checked=
    included.has(row.lastElementChild.textContent);
 });
 save.addEventListener('click',()=>{
  if(!selected || !id)return;
  const current=read(KEY);
  if(current.some(x=>x&&x.projectId===id&&x.kind==='address'&&
    (x.addressKey===selected.addressKey || x.name.toLocaleLowerCase('nb-NO')===
       selected.name.toLocaleLowerCase('nb-NO')))){
   message('Adressen finnes allerede i prosjektet. Gå tilbake og åpne byggvisningen.',true);return;
  }
  const chosen=selected.numbers.filter(n=>included.has(n)).map(number=>({
   adresse:selected.street,adresseNr:selected.number,adresseBokstav:selected.letter,
   etasje:number.slice(0,3),leilighetsnummer:number,source:'Kartverket'
  }));
  const identifier=typeof crypto.randomUUID==='function'?crypto.randomUUID():
    'address-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const item={id:identifier,projectId:id,kind:'address',name:selected.name,note:'',
    equipmentType:'',addressKey:selected.addressKey,postcode:selected.postcode,
    poststed:selected.poststed,latitude:selected.latitude,longitude:selected.longitude,
    addressSource:'Kartverket',boenheter:chosen,unitConnections:{},
    createdAt:new Date().toISOString()};
  try{
   localStorage.setItem(KEY,JSON.stringify([...current,item]));
   location.assign('./building.html?project='+encodeURIComponent(id)+'&address='+encodeURIComponent(identifier));
  }catch{message('Kunne ikke lagre adressen i nettleseren. Ingen endringer er overskrevet.',true)}
 });
 function setupMap(){
  if(!L){message('Kartbiblioteket kunne ikke lastes. Søk kan fortsatt brukes.',true);return}
  map=L.map('address-pick-map').setView([63,11],5);
  L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',{
   attribution:'© Kartverket',maxZoom:20,maxNativeZoom:18
  }).addTo(map);
  map.on('click',evt=>{
   const {lat,lng}=evt.latlng;
   const params=new URLSearchParams({lat:String(lat),lon:String(lng),radius:'60',treffPerSide:'50',side:'0'});
   void request('/punktsok',params);
  });
  const existing=read(KEY).filter(x=>x&&x.projectId===id&&x.kind==='address'&&
    goodCoord(x.latitude,x.longitude));
  if(existing.length===1)map.setView([existing[0].latitude,existing[0].longitude],16);
  else if(existing.length>1)map.fitBounds(existing.map(x=>[x.latitude,x.longitude]),{
    padding:[35,35],maxZoom:16
  });
  else if(postcode){
   // Only a representative map focus; never treat it as a building geometry.
   const params=new URLSearchParams({postnummer:postcode,objtype:'Vegadresse',treffPerSide:'30',side:'0'});
   fetch(API+'/sok?'+params.toString()).then(r=>r.ok?r.json():null).then(data=>{
    if(!data || !map || selected)return;
    const points=(Array.isArray(data.adresser)?data.adresser:[])
      .map(a=>a?.representasjonspunkt).filter(p=>p&&goodCoord(p.lat,p.lon));
    if(points.length)map.fitBounds(points.map(p=>[p.lat,p.lon]),{padding:[30,30],maxZoom:15});
   }).catch(()=>{});
  }
 }
 setupMap();
})();