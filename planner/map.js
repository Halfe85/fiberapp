/* Kartverket WMTS map — local pins only, no database or location tracking. */
(() => {
  'use strict';
  const TILE='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
  const ITEMS_KEY='fiberapp.planner.items.v1';
  const element=document.getElementById('planner-map');
  const message=document.getElementById('planner-map-message');
  const workspace=document.getElementById('project-workspace');
  if(!element || !message || !workspace)return;

  const getProjectId=()=>workspace.hidden?null:new URL(location.href).searchParams.get('project');
  const isCoordinate=n=>typeof n==='number' && Number.isFinite(n);
  const valid=item=>item && isCoordinate(item.latitude) && isCoordinate(item.longitude) &&
    Math.abs(item.latitude)<=90 && Math.abs(item.longitude)<=180;
  const text=(value)=>document.createTextNode(value);
  const defaultMessage='Naviger i kartet. Plasser adresser eller utstyr via + i headeren.';
  let map=null;
  let pins=null;
  let currentProjectId=null;
  let choosing=false;
  let lastBounds=null;
  let ready=false;

  function loadItems(){
    try{
      const raw=localStorage.getItem(ITEMS_KEY);
      const values=raw?JSON.parse(raw):[];
      return Array.isArray(values)?values:[];
    }catch{
      message.textContent='Kunne ikke lese kartpunkter fra lokal lagring.';
      return [];
    }
  }
  function popupNode(item){
    const wrap=document.createElement('div');
    const label=document.createElement('strong');
    label.append(text(item.name));
    wrap.append(label);
    const category=document.createElement('div');
    category.append(text(item.kind==='address'?'Adresse':'Utstyr'));
    wrap.append(category);
    return wrap;
  }
  function updatePins(){
    if(!map || !pins)return;
    pins.clearLayers();
    const id=getProjectId();
    if(!id)return;
    const bounds=[];
    for(const item of loadItems()){
      if(!item || item.projectId!==id || !valid(item))continue;
      const color=item.kind==='address'?'#1a6dab':'#d47c16';
      const marker=window.L.circleMarker([item.latitude,item.longitude],{
        radius:8,color:'#ffffff',weight:2,fillColor:color,fillOpacity:1
      });
      marker.bindPopup(popupNode(item));
      marker.addTo(pins);
      bounds.push([item.latitude,item.longitude]);
    }
    if(lastBounds!==id){
      lastBounds=id;
      if(bounds.length===1)map.setView(bounds[0],14);
      else if(bounds.length>1)map.fitBounds(bounds,{padding:[40,40],maxZoom:15});
      else map.setView([64,11],5);
    }
  }
  function ensureMap(){
    if(!getProjectId())return;
    if(map){
      requestAnimationFrame(()=>{map.invalidateSize();updatePins();});
      return;
    }
    if(!window.L){
      message.textContent='Kartbiblioteket kunne ikke lastes. Kontroller internettforbindelsen.';
      return;
    }
    map=window.L.map(element,{zoomControl:true,scrollWheelZoom:true});
    window.L.tileLayer(TILE,{
      attribution:'&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener noreferrer">Kartverket</a>',
      minZoom:3,maxZoom:19,maxNativeZoom:18
    }).addTo(map);
    pins=window.L.layerGroup().addTo(map);
    map.on('click',e=>{
      if(!choosing || !getProjectId())return;
      choosing=false;
      element.classList.remove('picking-position');
      message.textContent=defaultMessage;
      window.dispatchEvent(new CustomEvent('fiberapp:planner-map-picked',{
        detail:{projectId:getProjectId(),latitude:e.latlng.lat,longitude:e.latlng.lng}
      }));
    });
    map.on('tileerror',()=>{
      if(!choosing)message.textContent='Noen kartfliser kunne ikke lastes fra Kartverket.';
    });
    ready=true;
    updatePins();
    requestAnimationFrame(()=>map.invalidateSize());
  }
  function updateProject(){
    choosing=false;
    element.classList.remove('picking-position');
    message.textContent=defaultMessage;
    currentProjectId=getProjectId();
    if(currentProjectId)ensureMap();
  }
  window.addEventListener('fiberapp:planner-map-select-start',event=>{
    if(!map || !ready || !getProjectId() || event.detail?.projectId!==getProjectId()){
      message.textContent='Kartet er ikke klart for å velge posisjon.';
      return;
    }
    choosing=true;
    element.classList.add('picking-position');
    message.textContent='Klikk eller trykk i kartet der punktet skal plasseres.';
    element.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  window.addEventListener('fiberapp:planner-project-changed',updateProject);
  window.addEventListener('fiberapp:planner-items-changed',updatePins);
  window.addEventListener('popstate',updateProject);
  updateProject();
})();
