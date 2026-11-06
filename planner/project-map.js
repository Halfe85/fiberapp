/* Fiber Planner map: Kartverket address lookup and one movable Google-style pin. */
(() => {
  'use strict';
  const PROJECTS='fiberapp.planner.projects.v1';
  const API='https://api.kartverket.no/adresser/v1/sok';
  const el=id=>document.getElementById(id);
  const input=el('map-address-query');
  const list=el('map-address-results');
  const status=el('map-search-status');
  const notice=el('map-notice');
  const projectId=new URL(location.href).searchParams.get('project');
  let projects=[];
  try{
    const data=JSON.parse(localStorage.getItem(PROJECTS)||'[]');
    if(Array.isArray(data))projects=data;
  }catch{/* A missing or unreadable project is handled below. */}
  const project=projects.find(row=>row&&row.id===projectId);
  if(!project){
    el('map-project-title').textContent='Fant ikke prosjektet';
    input.disabled=true;
    status.hidden=false;
    status.classList.add('is-error');
    status.textContent='Prosjektet er ikke lagret i denne nettleseren.';
    return;
  }
  el('map-project-title').textContent=project.name;
  document.title=project.name+' | Fiber Planner';
  if(!window.L){
    input.disabled=true;
    status.hidden=false;
    status.classList.add('is-error');
    status.textContent='Kartbiblioteket kunne ikke lastes.';
    return;
  }
  const L=window.L;
  const map=L.map('project-map',{zoomControl:true}).setView([64.5,11.8],5);
  L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',{
    attribution:'© Kartverket',maxZoom:20,maxNativeZoom:18
  }).addTo(map);
  const pinIcon=L.divIcon({
    className:'fp-address-pin',
    html:'<span class="fp-pin-shape" aria-hidden="true"></span>',
    iconSize:[31,40],iconAnchor:[15,38],popupAnchor:[0,-33]
  });
  let marker=null,controller=null,timeout=null,generation=0;
  const setStatus=(message,isError=false)=>{
    status.textContent=message;status.hidden=!message;
    status.classList.toggle('is-error',isError);
  };
  const showResults=(visible)=>{
    list.hidden=!visible;
    input.setAttribute('aria-expanded',String(visible));
  };
  function cancelPending(){
    generation++;
    if(timeout!==null)clearTimeout(timeout);
    timeout=null;
    if(controller)controller.abort();
    controller=null;
  }
  function cleanResult(raw){
    if(!raw||typeof raw!=='object')return null;
    const pos=raw.representasjonspunkt;
    if(!pos||!Number.isFinite(pos.lat)||!Number.isFinite(pos.lon)||
       Math.abs(pos.lat)>90||Math.abs(pos.lon)>180)return null;
    const title=typeof raw.adressetekst==='string'&&raw.adressetekst.trim()
      ?raw.adressetekst.trim()
      :[raw.adressenavn,[raw.nummer,raw.bokstav].filter(v=>v!==null&&v!==undefined&&v!=='').join('')]
        .filter(Boolean).join(' ').trim();
    if(!title)return null;
    const postal=[raw.postnummer,raw.poststed].filter(Boolean).join(' ');
    return {title,postal,lat:pos.lat,lon:pos.lon};
  }
  function choose(address){
    cancelPending();
    showResults(false);
    list.replaceChildren();
    input.value=address.title;
    input.blur();
    setStatus('');
    if(marker)map.removeLayer(marker);
    marker=L.marker([address.lat,address.lon],{icon:pinIcon}).addTo(map);
    const popup=document.createElement('div');
    const strong=document.createElement('strong');strong.textContent=address.title;
    popup.append(strong);
    if(address.postal){
      const detail=document.createElement('div');detail.textContent=address.postal;
      popup.append(detail);
    }
    marker.bindPopup(popup).openPopup();
    map.flyTo([address.lat,address.lon],18,{duration:.65});
    notice.textContent='Valgt adresse: '+address.title+
      (address.postal?' · '+address.postal:'');
  }
  function display(response){
    const rows=(Array.isArray(response?.adresser)?response.adresser:[])
      .map(cleanResult).filter(Boolean);
    list.replaceChildren();
    for(const address of rows){
      const item=document.createElement('li');
      const button=document.createElement('button');button.type='button';
      const heading=document.createElement('strong');heading.textContent=address.title;
      const detail=document.createElement('small');detail.textContent=address.postal||'Offisiell adresse';
      button.append(heading,detail);
      button.addEventListener('click',()=>choose(address));
      item.append(button);list.append(item);
    }
    showResults(rows.length>0);
    setStatus(rows.length?rows.length+' adresser funnet. Velg en adresse.':
      'Ingen adresser funnet. Prøv et annet søk.');
  }
  async function search(term){
    cancelPending();
    const token=generation;
    const abort=new AbortController();
    controller=abort;
    setStatus('Søker etter adresser …');
    const params=new URLSearchParams({sok:term+'*',treffPerSide:'40',side:'0'});
    try{
      const response=await fetch(API+'?'+params.toString(),{
        signal:abort.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(token!==generation||abort.signal.aborted)return;
      display(data);
    }catch(error){
      if(token===generation&&!abort.signal.aborted){
        showResults(false);
        list.replaceChildren();
        setStatus('Adressesøket er utilgjengelig. Prøv igjen.',true);
      }
    }finally{
      if(token===generation)controller=null;
    }
  }
  input.addEventListener('input',()=>{
    cancelPending();
    const query=input.value.trim().replace(/\s+/g,' ');
    list.replaceChildren();
    showResults(false);
    if(query.length<2){
      setStatus(query?'Skriv minst to tegn for å søke.':'');
      return;
    }
    const expected=generation;
    timeout=setTimeout(()=>{
      if(expected===generation)void search(query);
    },280);
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      cancelPending();showResults(false);setStatus('');return;
    }
    if(event.key==='ArrowDown'&&!list.hidden){
      event.preventDefault();
      list.querySelector('button')?.focus();
    }
  });
  list.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();showResults(false);input.focus();
    }
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      const buttons=[...list.querySelectorAll('button')];
      const index=buttons.indexOf(document.activeElement);
      const next=event.key==='ArrowDown'?Math.min(index+1,buttons.length-1):Math.max(index-1,0);
      if(buttons[next]){
        event.preventDefault();buttons[next].focus();
      }
    }
  });
  document.addEventListener('pointerdown',event=>{
    if(!event.target.closest('.map-search')){
      showResults(false);
      if(input.value.length>=2)setStatus('');
    }
  });
})();
