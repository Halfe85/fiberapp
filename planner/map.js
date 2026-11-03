/* Kartverket WMTS map — local pins only, no database or location tracking. */
(() => {
  'use strict';
  const TILE='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
  const ITEMS_KEY='fiberapp.planner.items.v1';
  const PROJECTS_KEY='fiberapp.planner.projects.v1';
  const POSTCODE_API='https://api.kartverket.no/adresser/v1/sok';
  const POSTCODE_PAGE_SIZE=50;
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
  let choosing=false;
  let ready=false;
  let postcodeRequest=0;
  const postcodeCache=new Map();

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
  function getPostcode(id){
    if(!id)return '';
    try{
      const raw=localStorage.getItem(PROJECTS_KEY);
      const data=raw?JSON.parse(raw):[];
      if(!Array.isArray(data))return '';
      const project=data.find(p=>p && p.id===id);
      return typeof project?.postcode==='string' && /^[0-9]{4}$/.test(project.postcode)
        ? project.postcode : '';
    }catch{return '';}
  }
  async function lookupPostcode(postcode){
    if(postcodeCache.has(postcode))return postcodeCache.get(postcode);
    async function page(side){
      const params=new URLSearchParams({
        postnummer:postcode,treffPerSide:String(POSTCODE_PAGE_SIZE),
        side:String(side),utkoordsys:'4258'
      });
      const response=await fetch(POSTCODE_API+'?'+params.toString(),{
        headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket adresseoppslag feilet: '+response.status);
      return response.json();
    }
    const first=await page(0);
    const total=Number(first?.metadata?.totaltAntallTreff)||0;
    if(!Array.isArray(first?.adresser) || !first.adresser.length)return null;
    const lastPage=Math.max(0,Math.ceil(Math.min(total,10000)/POSTCODE_PAGE_SIZE)-1);
    const samplePages=[...new Set([Math.floor(lastPage/4),Math.floor(lastPage/2),
      Math.floor(lastPage*3/4),lastPage])].filter(n=>n>0);
    const samples=await Promise.allSettled(samplePages.map(page));
    const points=[...first.adresser];
    for(const result of samples){
      if(result.status==='fulfilled' && Array.isArray(result.value?.adresser)){
        points.push(...result.value.adresser);
      }
    }
    const coords=points.map(item=>item?.representasjonspunkt).filter(point=>
      point && Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
      Math.abs(point.lat)<=90 && Math.abs(point.lon)<=180
    ).map(point=>[point.lat,point.lon]);
    if(!coords.length)return null;
    const south=Math.min(...coords.map(p=>p[0])),north=Math.max(...coords.map(p=>p[0]));
    const west=Math.min(...coords.map(p=>p[1])),east=Math.max(...coords.map(p=>p[1]));
    const bounds=[[south,west],[north,east]];
    postcodeCache.set(postcode,bounds);
    return bounds;
  }
  async function zoomToPostcode(id,postcode,request){
    message.textContent='Finner kartutsnitt for postnummer '+postcode+' …';
    try{
      const bounds=await lookupPostcode(postcode);
      if(request!==postcodeRequest || id!==getProjectId() ||
         postcode!==getPostcode(id) || !map || choosing)return;
      if(!bounds){
        updatePins(true);
        message.textContent='Ingen kartfestede vegadresser funnet for postnummer '+postcode+
          '. Du kan navigere manuelt i kartet.';
        return;
      }
      // Geografisk estimat fra adressepunkter, ikke offisiell postnummergrense.
      map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
      message.textContent='Kartet viser et omtrentlig utsnitt for postnummer '+postcode+
        '. Dette er ikke en fastsatt prosjektgrense.';
    }catch{
      if(request!==postcodeRequest || id!==getProjectId())return;
      updatePins(true);
      message.textContent='Kunne ikke slå opp postnummer '+postcode+
        ' hos Kartverket. Kartet kan brukes manuelt.';
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
  function updatePins(fit=false){
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
    // Only use marker bounds when there is no valid postcode (or lookup fails).
    // Otherwise this would overwrite the postcode zoom on project re-entry.
    if(fit){
      if(bounds.length===1)map.setView(bounds[0],14);
      else if(bounds.length>1)map.fitBounds(bounds,{padding:[40,40],maxZoom:15});
      else map.setView([64,11],5);
    }
  }
  function ensureMap(){
    if(!getProjectId())return;
    if(map)return; // The caller will handle resize, pins and zoom in that order.
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
    map.setView([64,11],5); // Leaflet needs an initial view before its tiles load.
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
    updatePins(false);
  }
  function updateProject(){
    choosing=false;
    element.classList.remove('picking-position');
    message.textContent=defaultMessage;
    const projectId=getProjectId();
    const postcode=getPostcode(projectId);
    // Incrementing invalidates delayed replies from the project we just left.
    const request=++postcodeRequest;
    if(!projectId)return;
    // The workspace was just unhidden. Let layout settle before fitting the map.
    // On a cached postcode lookup, a Promise can settle before this frame;
    // invalidateSize must therefore run first.
    requestAnimationFrame(()=>{
      if(request!==postcodeRequest || projectId!==getProjectId())return;
      ensureMap();
      if(!map)return;
      map.invalidateSize({pan:false});
      updatePins(false);
      if(postcode)void zoomToPostcode(projectId,postcode,request);
      else updatePins(true);
    });
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
