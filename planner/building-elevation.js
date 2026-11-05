/* Logical facade: one rectangle per selected official unit.
   Bulk outlet/cable/device assignments are stored on their parent address. */
(() => {
 'use strict';
 const KEY='fiberapp.planner.items.v1';
 const query=new URL(location.href).searchParams;
 const projectId=query.get('project')||'',addressId=query.get('address')||'';
 const el=id=>document.getElementById(id);
 const facade=el('building-facade'),status=el('building-status');
 let selected=new Set(),address=null,items=null;
 function read(){
  try{const values=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(values)?values:null}
  catch{return null}
 }
 const known=/^[HKUL]\d{4}$/;
 const ordered=(arr)=>[...arr].sort((a,b)=>a.localeCompare(b,'nb-NO'));
 const unitCodes=()=>ordered([...new Set((Array.isArray(address?.boenheter)?address.boenheter:[])
  .map(x=>x?.leilighetsnummer).filter(x=>typeof x==='string'&&known.test(x)))]);
 function floorRank(floor){
  const section=floor[0],number=Number(floor.slice(1));
  if(section==='L')return 200+number; // Lofts above hovedetasjer
  if(section==='H')return 100+number;
  if(section==='U')return 0-number;
  if(section==='K')return -100-number;
  return -999;
 }
 function groups(){
  const map=new Map();
  for(const code of unitCodes()){
   const floor=code.slice(0,3);
   if(!map.has(floor))map.set(floor,[]);
   map.get(floor).push(code);
  }
  return [...map].sort((a,b)=>floorRank(b[0])-floorRank(a[0]))
   .map(([floor,units])=>({floor,units:ordered(units)}));
 }
 function labelOf(floor){
  const k={H:'Hovedetasje',K:'Kjeller',U:'Underetasje',L:'Loft'};
  return (k[floor[0]]||'Etasje')+' '+floor.slice(1);
 }
 function describe(config){
  return [config?.cable,config?.outlet,config?.device].filter(Boolean).join(' · ');
 }
 function controls(){
  const n=selected.size;
  el('building-apply').disabled=!n;
  el('building-remove-connections').disabled=!n;
  el('building-apply').textContent='Bruk på valgte ('+n+')';
 }
 function render(){
  facade.replaceChildren();
  const floors=groups(),connections=address.unitConnections||{};
  if(!floors.length){
   const empty=document.createElement('div');empty.className='wf-empty';
   empty.textContent='Ingen bruksenheter er valgt på denne adressen. Gå tilbake til adresseverktøyet og legg til bruksenheter.';
   facade.append(empty);controls();return;
  }
  for(const group of floors){
   const floor=document.createElement('div');floor.className='wf-floor';
   const title=document.createElement('div');title.className='wf-floor-label';
   title.textContent=labelOf(group.floor);
   const units=document.createElement('div');units.className='wf-floor-units';
   for(const code of group.units){
    const btn=document.createElement('button');btn.type='button';
    btn.className='wf-unit';
    const c=connections[code];
    if(selected.has(code))btn.classList.add('is-selected');
    if(c&&(c.cable||c.outlet||c.device))btn.classList.add('is-connected');
    btn.setAttribute('aria-pressed',String(selected.has(code)));
    btn.setAttribute('aria-label',code+(describe(c)?', '+describe(c):', ingen tilkobling planlagt'));
    const number=document.createElement('strong');number.textContent=code;
    const sub=document.createElement('small');
    sub.textContent=describe(c)||'Ikke tilkoblet';
    btn.append(number,sub);
    btn.addEventListener('click',()=>{
     if(selected.has(code))selected.delete(code);else selected.add(code);
     render();
    });
    units.append(btn);
   }
   floor.append(title,units);facade.append(floor);
  }
  const basement=document.createElement('div');basement.className='wf-foundation';
  basement.setAttribute('aria-hidden','true');facade.append(basement);
  controls();
 }
 function saveChanges(next){
  const values=read();
  if(!values){status.textContent='Lagringsdata kunne ikke leses. Ingen endringer lagret.';return false}
  const idx=values.findIndex(x=>x&&x.id===addressId&&x.projectId===projectId&&x.kind==='address');
  if(idx<0){status.textContent='Adressen er ikke lenger registrert i prosjektet.';return false}
  const updated=values.slice();
  updated[idx]={...updated[idx],unitConnections:next};
  try{
   localStorage.setItem(KEY,JSON.stringify(updated));
   items=updated;address=updated[idx];
   render();
   return true;
  }catch{status.textContent='Kunne ikke lagre tilkoblingene. Ingen eksisterende data ble overskrevet.';return false}
 }
 function bulkAssign(){
  if(!selected.size)return;
  const cable=el('building-cable').value,outlet=el('building-outlet').value,device=el('building-device').value;
  if(!cable && !outlet && !device){
   status.textContent='Velg minst én kabel, kontakt eller utstyr. Bruk «Fjern tilkobling» hvis du vil slette.';
   return;
  }
  const next={...(address.unitConnections||{})};
  const available=new Set(unitCodes());
  for(const code of selected)if(available.has(code)){
   next[code]={cable,outlet,device,updatedAt:new Date().toISOString(),status:'planned'};
  }
  const amount=selected.size;
  if(saveChanges(next))status.textContent='Planlagte tilkoblinger lagret for '+amount+' bruksenheter.';
 }
 function removeAssignments(){
  if(!selected.size)return;
  if(!window.confirm('Fjerne planlagte tilkoblinger for '+selected.size+' valgte bruksenheter?'))return;
  const next={...(address.unitConnections||{})};
  for(const code of selected)delete next[code];
  if(saveChanges(next))status.textContent='Tilkoblinger fjernet for '+selected.size+' bruksenheter.';
 }
 function init(){
  items=read();
  address=items?.find(x=>x&&x.id===addressId&&x.projectId===projectId&&x.kind==='address')||null;
  if(!address){
   facade.textContent='Adressen finnes ikke i dette prosjektet på denne nettleseren.';
   status.textContent='Fant ikke adressen. Ingen lagring er endret.';
   return;
  }
  el('building-back').href='./?project='+encodeURIComponent(projectId);
  el('building-title').textContent=address.name+' · 2D-bygg';
  el('building-subtitle').textContent=unitCodes().length+' bruksenheter i prosjektet · '+address.postcode+' '+address.poststed;
  el('building-apply').addEventListener('click',bulkAssign);
  el('building-select-all').addEventListener('click',()=>{
   selected=new Set(unitCodes());render();
  });
  el('building-clear-selection').addEventListener('click',()=>{
   selected.clear();render();
  });
  el('building-remove-connections').addEventListener('click',removeAssignments);
  render();
 }
 init();
})();