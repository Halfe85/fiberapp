/* Kartverket WMTS map — local pins only, no database or location tracking. */
(() => {
  'use strict';
  const TILE='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
  const ITEMS_KEY='fiberapp.planner.items.v1';
  const PROJECTS_KEY='fiberapp.planner.projects.v1';
  const POSTCODE_API='https://api.kartverket.no/adresser/v1/sok';
  const PARCEL_API='https://api.kartverket.no/eiendom/v1/punkt/omrader';
  const parcelToolbar=document.getElementById('planner-parcel-toolbar');
  const parcelStatus=document.getElementById('planner-parcel-status');
  const parcelCancel=document.getElementById('planner-parcel-cancel');
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
  let savedParcels=null;
  let parcelCandidates=null;
  let choosing=false;
  let selectingParcel=false;
  let parcelToken=0;
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
    if(savedParcels)savedParcels.clearLayers();
    const visibleParcels=new Set();
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
      const parcel=item.area || item.parcel;
      if(item.kind==='address' && savedParcels && parcel?.geometry &&
         ['Polygon','MultiPolygon'].includes(parcel.geometry.type)) {
        const key=parcel.propertyId || JSON.stringify(parcel.geometry);
        if(!visibleParcels.has(key)){
          visibleParcels.add(key);
          try{
            const outline=window.L.geoJSON({
              type:'Feature',properties:{},geometry:parcel.geometry
            },{style:{color:'#267e52',weight:3,fillColor:'#5eaa7e',
              fillOpacity:0.18,interactive:false}});
            outline.addTo(savedParcels);
          }catch{/* An outdated or invalid polygon must not break the map. */}
        }
      }
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
    savedParcels=window.L.layerGroup().addTo(map);
    parcelCandidates=window.L.layerGroup().addTo(map);
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
    stopParcelSelection(false);
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
  // Property outlines come from Matrikkelen and may contain approximate boundary lines.
  function stopParcelSelection(notify=true){
    const id=getProjectId();
    parcelToken++;
    selectingParcel=false;
    if(parcelCandidates)parcelCandidates.clearLayers();
    if(parcelToolbar)parcelToolbar.hidden=true;
    if(notify && id){
      window.dispatchEvent(new CustomEvent('fiberapp:planner-parcel-cancelled',{
        detail:{projectId:id}
      }));
    }
  }
  async function selectParcel(event){
    const detail=event.detail || {};
    const projectId=getProjectId();
    if(!map || !parcelCandidates || !parcelToolbar || !projectId ||
       detail.projectId!==projectId ||
       !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude))return;
    choosing=false;
    selectingParcel=true;
    const request=++parcelToken;
    postcodeRequest++; // A pending postcode auto-fit must not steal focus from selection.
    parcelCandidates.clearLayers();
    parcelToolbar.hidden=false;
    parcelStatus.textContent='Henter eiendomsgrenser fra Kartverket …';
    map.invalidateSize({pan:false});
    map.setView([detail.latitude,detail.longitude],18);
    element.scrollIntoView({behavior:'smooth',block:'nearest'});
    const params=new URLSearchParams({
      nord:String(detail.latitude),ost:String(detail.longitude),
      koordsys:'4258',utkoordsys:'4258',radius:'100',maksTreff:'40'
    });
    try{
      const response=await fetch(PARCEL_API+'?'+params.toString(),{
        headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket eiendom: '+response.status);
      const result=await response.json();
      if(request!==parcelToken || !selectingParcel || projectId!==getProjectId())return;
      const features=Array.isArray(result?.features)?result.features:[];
      let count=0;
      for(const feature of features){
        if(!feature?.geometry ||
           !['Polygon','MultiPolygon'].includes(feature.geometry.type) ||
           !Array.isArray(feature.geometry.coordinates))continue;
        const label=String(feature.properties?.matrikkelnummertekst ||
          'Eiendom ' + (count+1)).slice(0,120);
        const id=feature.properties?.lokalid;
        const propertyId=id==null?'':String(id);
        const geometry=feature.geometry;
        // Keep localStorage usage bounded for exceptionally complex polygons.
        if(JSON.stringify(geometry).length>150000)continue;
        try{
          const layer=window.L.geoJSON(feature,{
            style:{color:'#087bb6',weight:2,fillColor:'#55b9e6',fillOpacity:.16}
          });
          layer.eachLayer(path=>{
            path.on('mouseover',()=>path.setStyle({color:'#e98b17',weight:4,fillOpacity:.3}));
            path.on('mouseout',()=>path.setStyle({color:'#087bb6',weight:2,fillOpacity:.16}));
            path.on('click',()=>{
              const parcel={propertyId,propertyLabel:label,geometry};
              stopParcelSelection(false);
              window.dispatchEvent(new CustomEvent('fiberapp:planner-parcel-selected',{
                detail:{projectId,parcel}
              }));
            });
          });
          layer.addTo(parcelCandidates);
          count++;
        }catch{/* Ignore malformed features rather than drawing the wrong parcel. */}
      }
      parcelStatus.textContent=count
        ? 'Velg riktig tomt ved å trykke på en blå flate ('+count+' tilgjengelige).'
        : 'Ingen tomteflater funnet her. Avbryt og lagre adressen som punkt.';
    }catch{
      if(request!==parcelToken || !selectingParcel)return;
      parcelStatus.textContent='Kunne ikke hente eiendomsgrenser. Avbryt og lagre adressen som punkt.';
    }
  }
  window.addEventListener('fiberapp:planner-parcel-select-start',selectParcel);
  if(parcelCancel)parcelCancel.addEventListener('click',()=>stopParcelSelection(true));
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
