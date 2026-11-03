/* Fiber Planner address modal: Kartverket detail map + manual point-to-point polygons.
 * GeoJSON positions are [longitude, latitude]. Existing main-map data stays compatible.
 */
(() => {
  'use strict';
  const TILE='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
  const PARCEL_API='https://api.kartverket.no/eiendom/v1/punkt/omrader';
  const dialog=document.getElementById('project-item-dialog');
  const host=document.getElementById('project-address-mini-map');
  const status=document.getElementById('project-area-instruction');
  const useParcel=document.getElementById('project-area-use-parcel');
  const drawBuilding=document.getElementById('project-area-draw-building');
  const drawParcel=document.getElementById('project-area-draw-parcel');
  const undo=document.getElementById('project-area-undo');
  const reset=document.getElementById('project-area-reset');
  if(!dialog || !host || !status || !useParcel || !drawBuilding || !drawParcel || !undo || !reset)return;

  let map=null;
  let addressMarker=null;
  let candidates=null;
  let sketch=null;
  let saved=null;
  let current=null;
  let projectId=null;
  let mode=null;
  let points=[];
  let area=null;
  let lookupToken=0;
  let lookupController=null;
  const msg=text=>{status.textContent=text;};
  const announceProgress=()=>{
    window.dispatchEvent(new CustomEvent('fiberapp:planner-address-area-pending',{
      detail:{projectId,pending:Boolean(mode)}
    }));
  };
  const announce=()=>{
    window.dispatchEvent(new CustomEvent('fiberapp:planner-address-area-selected',{
      detail:{projectId,area}
    }));
  };
  const buttons=[useParcel,drawBuilding,drawParcel];

  function updateControls(){
    for(const button of buttons)button.disabled=!current;
    useParcel.setAttribute('aria-pressed',String(mode==='official'));
    drawBuilding.setAttribute('aria-pressed',String(mode==='building'));
    drawParcel.setAttribute('aria-pressed',String(mode==='parcel'));
    undo.disabled=!['building','parcel'].includes(mode) || points.length===0;
    reset.disabled=!area && points.length===0 && !mode;
    host.classList.toggle('is-drawing',mode==='building'||mode==='parcel');
    announceProgress();
  }
  function cancelLookup(){
    lookupToken++;
    lookupController?.abort();
    lookupController=null;
  }
  function clearLayers(){
    if(candidates)candidates.clearLayers();
    if(sketch)sketch.clearLayers();
    if(saved)saved.clearLayers();
  }
  function forgetArea(announceChange=true){
    area=null;
    points=[];
    clearLayers();
    if(announceChange)announce();
    updateControls();
  }
  function startMode(nextMode){
    if(!current || !map)return;
    cancelLookup();
    mode=nextMode;
    forgetArea();
    if(nextMode==='official'){
      msg('Henter registrerte tomtegrenser. Velg hele tomten bare når den gjelder denne ene vegadressen.');
      void showParcelCandidates();
    }else{
      if(map.doubleClickZoom)map.doubleClickZoom.disable();
      msg('Klikk hjørnene ett etter ett. Klikk første punkt for å lukke '+(nextMode==='building'?'bygget.':'tomten.'));
    }
    updateControls();
  }
  function ensureMap(){
    if(map)return true;
    if(!window.L){
      msg('Kartet kunne ikke lastes. Kontroller internettforbindelsen.');
      return false;
    }
    const L=window.L;
    map=L.map(host,{scrollWheelZoom:true,zoomControl:true,doubleClickZoom:false});
    L.tileLayer(TILE,{
      attribution:'&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener noreferrer">Kartverket</a>',
      minZoom:3,maxZoom:20,maxNativeZoom:18
    }).addTo(map);
    candidates=L.layerGroup().addTo(map);
    sketch=L.layerGroup().addTo(map);
    saved=L.layerGroup().addTo(map);
    map.setView([64,11],5);
    map.on('click',event=>{
      if(mode!=='building' && mode!=='parcel')return;
      if(points.length>=100){
        msg('Maks 100 hjørner per område. Avslutt ved å trykke første punkt.');
        return;
      }
      const lat=event.latlng.lat,lng=event.latlng.lng;
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      if(points.some(p=>Math.abs(p.lat-lat)<1e-8 && Math.abs(p.lng-lng)<1e-8)){
        msg('Punktet finnes allerede. Trykk på det første grønne punktet for å lukke området.');
        return;
      }
      points.push({lat,lng});
      redrawDraft();
    });
    return true;
  }
  function redrawDraft(){
    if(!map || !sketch)return;
    sketch.clearLayers();
    const L=window.L;
    if(points.length>=2){
      L.polyline(points,{color:'#dc721a',weight:3,dashArray:'6,5',interactive:false}).addTo(sketch);
    }
    points.forEach((position,index)=>{
      const first=index===0;
      const marker=L.circleMarker([position.lat,position.lng],{
        radius:first?11:6,color:first?'#186b49':'#fff',
        weight:3,fillColor:first?'#58c68a':'#dc721a',fillOpacity:1,
        interactive:first
      }).addTo(sketch);
      if(first){
        marker.on('click',event=>{
          if(L.DomEvent?.stopPropagation)L.DomEvent.stopPropagation(event);
          finishDraw();
        });
      }
    });
    msg(points.length>=3
      ? points.length+' punkter. Klikk på det første grønne punktet for å lukke polygonet.'
      : points.length+' punkt'+(points.length===1?'':'er')+'. Sett minst tre hjørner.');
    updateControls();
  }
  function cross(a,b,c){
    return (b.lng-a.lng)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lng-a.lng);
  }
  function intersects(a,b,c,d){
    const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
    return ab1*ab2<0 && cd1*cd2<0;
  }
  function validPolygon(vertices){
    if(vertices.length<3)return false;
    let twiceArea=0;
    for(let i=0;i<vertices.length;i++){
      const p=vertices[i],q=vertices[(i+1)%vertices.length];
      twiceArea+=p.lng*q.lat-q.lng*p.lat;
      for(let j=i+1;j<vertices.length;j++){
        const next=(i+1)%vertices.length,otherNext=(j+1)%vertices.length;
        if(j===i || j===next || otherNext===i)continue;
        if(intersects(vertices[i],vertices[next],vertices[j],vertices[otherNext]))return false;
      }
    }
    return Math.abs(twiceArea)>1e-11;
  }
  function showArea(){
    if(!map || !saved)return;
    saved.clearLayers();
    if(!area?.geometry)return;
    window.L.geoJSON({type:'Feature',properties:{},geometry:area.geometry},{
      style:{
        color:area.kind==='building'?'#d27015':'#217a51',weight:3,
        fillColor:area.kind==='building'?'#f4aa50':'#67bc8b',
        fillOpacity:.28,interactive:false
      }
    }).addTo(saved);
  }
  function finishDraw(){
    if(mode!=='building' && mode!=='parcel')return;
    if(points.length<3){
      msg('Et område må ha minst tre punkter.');
      return;
    }
    if(!validPolygon(points)){
      msg('Punktene krysser hverandre eller området er for lite. Angre eller rett opp tegningen.');
      return;
    }
    const ring=points.map(p=>[p.lng,p.lat]);
    ring.push([...ring[0]]);
    area={
      kind:mode,source:'manual',
      geometry:{type:'Polygon',coordinates:[ring]}
    };
    mode=null;
    points=[];
    sketch.clearLayers();
    showArea();
    msg((area.kind==='building'?'Bygget':'Tomten')+' er lukket og klar til å lagres med adressen.');
    announce();
    updateControls();
  }
  async function showParcelCandidates(){
    const id=projectId,address=current;
    if(!map || !address)return;
    const token=++lookupToken;
    const controller=new AbortController();
    lookupController=controller;
    const params=new URLSearchParams({
      nord:String(address.latitude),ost:String(address.longitude),
      koordsys:'4258',utkoordsys:'4258',radius:'100',maksTreff:'40'
    });
    try{
      const response=await fetch(PARCEL_API+'?'+params.toString(),{
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Eiendom API: '+response.status);
      const result=await response.json();
      if(token!==lookupToken || mode!=='official' ||
         projectId!==id || current!==address || !dialog.open)return;
      const features=Array.isArray(result?.features)?result.features:[];
      let total=0;
      for(const feature of features){
        const geo=feature?.geometry;
        if(!geo || !['Polygon','MultiPolygon'].includes(geo.type) ||
           !Array.isArray(geo.coordinates))continue;
        if(JSON.stringify(geo).length>150000)continue;
        const label=String(feature.properties?.matrikkelnummertekst ||
          'Eiendom '+(total+1)).slice(0,120);
        const propertyId=feature.properties?.lokalid==null
          ? '':String(feature.properties.lokalid);
        try{
          const layer=window.L.geoJSON(feature,{
            style:{color:'#0a7ab2',weight:2,fillColor:'#64beea',fillOpacity:.16}
          });
          layer.eachLayer(path=>{
            path.on('mouseover',()=>path.setStyle({color:'#e98b17',weight:4,fillOpacity:.33}));
            path.on('mouseout',()=>path.setStyle({color:'#0a7ab2',weight:2,fillOpacity:.16}));
            path.on('click',()=>{
              if(mode!=='official')return;
              area={
                kind:'parcel',source:'kartverket',propertyId,propertyLabel:label,geometry:geo
              };
              cancelLookup();
              mode=null;
              candidates.clearLayers();
              showArea();
              msg('Valgt tomt: '+label+'. Bekreft at den gjelder bare denne vegadressen.');
              announce();
              updateControls();
            });
          });
          layer.addTo(candidates);
          total++;
        }catch{/* Ignore bad geometries; never mistake a tile for an official parcel. */}
      }
      msg(total?'Velg en blå tomt ('+total+' forslag). Bruk bare dersom tomten har én vegadresse.'
        :'Ingen registrerte tomteflater funnet. Bruk «Tegn bygg» eller «Tegn tomt».');
    }catch{
      if(controller.signal.aborted || token!==lookupToken)return;
      msg('Kunne ikke hente tomtegrenser. Du kan fremdeles tegne bygg eller tomt manuelt.');
    }
  }
  function selectAddress(detail){
    if(!detail?.address || !dialog.open || !dialog.classList.contains('address-mode'))return;
    projectId=detail.projectId;
    current=detail.address;
    cancelLookup();
    mode=null;
    forgetArea();
    if(!ensureMap())return;
    map.invalidateSize({pan:false});
    map.setView([current.latitude,current.longitude],18);
    if(addressMarker)map.removeLayer(addressMarker);
    addressMarker=window.L.circleMarker([current.latitude,current.longitude],{
      radius:6,color:'#fff',weight:2,fillColor:'#185eae',fillOpacity:1
    }).bindTooltip(current.name).addTo(map);
    msg('Adresse funnet. Velg hel tomt ved én adresse, eller tegn bygg/tomt punkt for punkt.');
    requestAnimationFrame(()=>map?.invalidateSize({pan:false}));
    updateControls();
  }
  useParcel.addEventListener('click',()=>startMode('official'));
  drawBuilding.addEventListener('click',()=>startMode('building'));
  drawParcel.addEventListener('click',()=>startMode('parcel'));
  undo.addEventListener('click',()=>{
    if(!points.length)return;
    points.pop();
    redrawDraft();
  });
  reset.addEventListener('click',()=>{
    cancelLookup();
    mode=null;
    forgetArea();
    msg(current?'Området er nullstilt. Velg et nytt verktøy.':'Velg først en adresse.');
    updateControls();
  });
  window.addEventListener('fiberapp:planner-address-modal-open',()=>{
    projectId=null;
    current=null;
    cancelLookup();
    mode=null;
    forgetArea(false);
    if(addressMarker && map){map.removeLayer(addressMarker);addressMarker=null}
    msg('Velg en vegadresse til venstre for å laste kartutsnittet.');
    updateControls();
  });
  window.addEventListener('fiberapp:planner-address-selected',event=>selectAddress(event.detail));
  window.addEventListener('fiberapp:planner-address-clear',()=>{
    cancelLookup();
    mode=null;
    current=null;
    forgetArea(false);
    if(addressMarker && map){map.removeLayer(addressMarker);addressMarker=null}
    msg('Velg en vegadresse til venstre for å vise kartet.');
    updateControls();
  });
  window.addEventListener('fiberapp:planner-address-modal-close',()=>{
    cancelLookup();
    mode=null;
    points=[];
  });
  updateControls();
})();
