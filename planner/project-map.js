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
    html:'<svg viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+
      '<path d="M18 2C8.6 2 2 8.9 2 18c0 13.1 16 28 16 28s16-14.9 16-28C34 8.9 27.4 2 18 2Z" fill="#e7463c" stroke="#fff" stroke-width="2.5"/>'+
      '<circle cx="18" cy="17" r="6.8" fill="#fff"/></svg>',
    iconSize:[36,48],iconAnchor:[18,45],popupAnchor:[0,-42]
  });
  const unitModal=window.FiberSearchAddressUnitsModal?.create({
    dialog:document.getElementById('searchaddressunits-modal')
  });
  let marker=null,controller=null,timeout=null,generation=0;
  let clickRequest=null,clickGeneration=0;
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

  function cancelClickRequest(){
    clickGeneration++;
    clickRequest?.abort();
    clickRequest=null;
  }
  function clickedPopupContent(heading,detail,point,address){
    const content=document.createElement('div');
    content.className='map-click-popup';
    const title=document.createElement('strong');
    title.textContent=heading;
    content.append(title);
    if(detail){
      const caption=document.createElement('small');
      caption.textContent=detail;
      content.append(caption);
    }
    if(address && unitModal){
      const add=document.createElement('button');
      add.type='button';
      add.className='map-popup-plus';
      add.textContent='+';
      add.title='Søk bruksenheter på denne eiendommen';
      add.setAttribute('aria-label','Søk bruksenheter ved '+address.title);
      add.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        void unitModal.open({lat:point.lat,lng:point.lng,address});
      });
      content.append(add);
    }
    return content;
  }
  async function inspectPoint(point){
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
    cancelClickRequest();
    const token=clickGeneration;
    const controller=new AbortController();
    clickRequest=controller;
    const popup=L.popup({autoPan:true,closeButton:true,offset:[0,-7]})
      .setLatLng([point.lat,point.lng])
      .setContent(clickedPopupContent('Søker adresser …','Kartverket',point,null))
      .openOn(map);
    const params=new URLSearchParams({
      lat:String(point.lat),lon:String(point.lng),radius:'55',
      treffPerSide:'30',side:'0'
    });
    try{
      const response=await fetch('https://api.kartverket.no/adresser/v1/punktsok?'+params.toString(),{
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(token!==clickGeneration||controller.signal.aborted)return;
      const addresses=(Array.isArray(data?.adresser)?data.adresser:[])
        .map(cleanResult).filter(Boolean);
      if(!addresses.length){
        popup.setContent(clickedPopupContent(
          'Ingen adresse funnet','Ingen registrerte adresser innen 55 meter.',point,null));
        return;
      }
      const chosen=addresses[0]; // Kartverket's punktsok is ordered by distance.
      popup.setContent(clickedPopupContent(chosen.title,chosen.postal+
        (addresses.length>1?' · '+addresses.length+' adresser i nærheten':''),point,chosen));
      notice.textContent='Nærmeste adresse ved klikkpunktet: '+chosen.title+
        '. Trykk + i kartpopupen for å undersøke eiendommen.';
    }catch(err){
      if(token!==clickGeneration||controller.signal.aborted)return;
      popup.setContent(clickedPopupContent('Oppslag mislyktes',
        'Kunne ikke hente adresser fra Kartverket. Prøv et nytt kartklikk.',point,null));
    }finally{
      if(token===clickGeneration)clickRequest=null;
    }
  }
  map.on('click',event=>void inspectPoint(event.latlng));
  document.addEventListener('pointerdown',event=>{
    if(!event.target.closest('.map-search')){
      showResults(false);
      if(input.value.length>=2)setStatus('');
    }
  });
})();
