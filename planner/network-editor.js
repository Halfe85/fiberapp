/* Fiber Planner standalone frontend network editor. No backend.
   All routes are stored as polyline coordinates; cables reference route IDs. */
(() => {
  'use strict';
  const PREFIX='fiberapp.planner.';
  const STORE=PREFIX+'network.v1';
  const ITEMS=PREFIX+'items.v1';
  const PROJECTS=PREFIX+'projects.v1';
  const TILE='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
  const L=window.L;
  const params=new URL(location.href).searchParams;
  const projectId=params.get('project')||'';
  const el=id=>document.getElementById(id);
  const status=el('network-map-status');
  const error=el('network-error');
  const mapHost=el('network-map');
  const deviceTypes=[
    ['commscope-budi','CommScope BUDI'],
    ['splice-d5','Skjøteboks D5'],
    ['splice-b2','Skjøteboks B2'],
    ['splice-b4','Skjøteboks B4'],
    ['otb','OTB'],
    ['distributor','Fordeler / fordelingspunkt']
  ];
  const panels=[
    {id:'gpon-1-2',label:'GPON splitter 1:2',kind:'gpon',ratio:2},
    {id:'gpon-1-4',label:'GPON splitter 1:4',kind:'gpon',ratio:4},
    {id:'gpon-1-16',label:'GPON splitter 1:16',kind:'gpon',ratio:16},
    {id:'gpon-1-32',label:'GPON splitter 1:32',kind:'gpon',ratio:32},
    {id:'gpon-1-64',label:'GPON splitter 1:64',kind:'gpon',ratio:64},
    {id:'switch-24',label:'Switch 24 porter + 4 uplink',kind:'switch',ports:24,uplinks:4},
    {id:'switch-48',label:'Switch 48 porter + 4 uplink',kind:'switch',ports:48,uplinks:4}
  ];
  for(const height of [1,1.5]){
    for(const fiber of ['SC','LC']){
      for(const finish of ['APC','UPC']){
        const ports=fiber==='SC'?48:96;
        const geometry=fiber==='SC'?'24 duplex':'24 quadplex';
        panels.push({
          id:'odf-'+String(height).replace('.','_')+'u-'+fiber.toLowerCase()+'-'+finish.toLowerCase(),
          label:'ODF '+height+'U · '+geometry+' '+fiber+'/'+finish+' ('+ports+' porter)',
          kind:'odf',heightU:height,connector:fiber+'/'+finish,ports
        });
      }
    }
  }
  const fibers=[2,4,12,24,48,96,144,192,288,576];
  const empty=()=>({devices:[],rooms:[],racks:[],modules:[],routes:[],cables:[]});
  const areas=readArray(ITEMS).filter(item=>item &&
    item.projectId===projectId && item.kind==='address' &&
    Boolean((item.area||item.parcel)?.geometry?.coordinates));
  const project=readArray(PROJECTS).find(item=>item && item.id===projectId);
  let model=empty();
  let map=null;
  let addressLayer=null,devicesLayer=null,roomsLayer=null,routesLayer=null,preview=null;
  let mode='browse',tab='devices',points=[],selectedAddressId='',selectedRouteId='';
  let drawingKind='underground',drawingTube='Uspesifisert';
  let counter=0;
  function readArray(key){
    try{const raw=localStorage.getItem(key),value=raw?JSON.parse(raw):[];return Array.isArray(value)?value:[]}
    catch{return []}
  }
  function readStore(){
    const raw=localStorage.getItem(STORE);
    const value=raw?JSON.parse(raw):{version:1,projects:{}};
    if(!value || typeof value!=='object' || Array.isArray(value) ||
       !value.projects || typeof value.projects!=='object' || Array.isArray(value.projects))
      throw Error('Ugyldig nettverkslagring');
    return value;
  }
  function normalizeProject(value){
    const safe=empty();
    if(value && typeof value==='object')
      for(const key of Object.keys(safe))safe[key]=Array.isArray(value[key])?value[key]:[];
    return safe;
  }
  function writeProject(next){
    try{
      const store=readStore();
      store.version=1;
      store.projects[projectId]=next;
      localStorage.setItem(STORE,JSON.stringify(store));
      model=next;
      error.hidden=true;
      render();
      window.dispatchEvent(new CustomEvent('fiberapp:planner-network-changed',{detail:{projectId}}));
      return true;
    }catch(e){
      error.textContent='Kunne ikke lagre nettverksplanen. Eksisterende data er beholdt.';
      error.hidden=false;
      return false;
    }
  }
  function uid(prefix){
    counter++;
    return prefix+'-'+(typeof crypto!=='undefined' && crypto.randomUUID?
      crypto.randomUUID():Date.now()+'-'+counter);
  }
  function feedback(message){status.textContent=message}
  function option(select,value,label){
    const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o)
  }
  function refreshSelect(select,entries,placeholder,previous){
    select.replaceChildren();
    if(placeholder)option(select,'',placeholder);
    for(const [value,label] of entries)option(select,value,label);
    if([...select.options].some(x=>x.value===previous))select.value=previous;
    else select.value=placeholder?'':(entries[0]?.[0]||'');
  }
  const coordinate=point=>Array.isArray(point)&&point.length>=2&&
    Number.isFinite(point[0])&&Number.isFinite(point[1])&&
    Math.abs(point[0])<=90&&Math.abs(point[1])<=180;
  const validAddress=item=>item && item.projectId===projectId&&item.kind==='address';
  const addressGeometry=item=>(item.area||item.parcel)?.geometry;
  function ringContains(lat,lng,ring){
    if(!Array.isArray(ring))return false;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if(!Array.isArray(a)||!Array.isArray(b))continue;
      if(((a[1]>lat)!==(b[1]>lat)) &&
         (lng<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
    }
    return inside;
  }
  function containsPolygon(lat,lng,rings){
    if(!Array.isArray(rings)||!rings.length||!ringContains(lat,lng,rings[0]))return false;
    return !rings.slice(1).some(ring=>ringContains(lat,lng,ring));
  }
  function pointInside(item,lat,lng){
    const g=addressGeometry(item);
    if(!g)return false;
    if(g.type==='Polygon')return containsPolygon(lat,lng,g.coordinates);
    if(g.type==='MultiPolygon')return Array.isArray(g.coordinates)&&
      g.coordinates.some(poly=>containsPolygon(lat,lng,poly));
    return false;
  }
  const addressById=id=>areas.find(item=>item.id===id);
  function addressForPoint(lat,lng){
    // If more than one unit shares the outline, retain the explicitly selected address.
    const selected=addressById(selectedAddressId);
    if(selected&&pointInside(selected,lat,lng))return selected.id;
    return areas.find(item=>pointInside(item,lat,lng))?.id||'';
  }
  function setSelectedAddress(id){
    selectedAddressId=id;
    el('network-device-address').value=id;
    el('network-room-address').value=id;
    renderMap();
  }
  function setMode(next,message){
    mode=next;
    document.querySelector('.network-map-area')?.classList.toggle('is-placing',next!=='browse');
    feedback(message);
  }
  function finishMode(){
    mode='browse';points=[];
    el('network-drawing-controls').hidden=true;
    if(preview){preview.remove();preview=null}
    document.querySelector('.network-map-area')?.classList.remove('is-placing');
  }
  function zoomAll(){
    const coords=[];
    for(const item of areas){
      if(Number.isFinite(item.latitude)&&Number.isFinite(item.longitude))
        coords.push([item.latitude,item.longitude]);
    }
    for(const device of model.devices)coords.push([device.latitude,device.longitude]);
    for(const room of model.rooms)coords.push([room.latitude,room.longitude]);
    for(const route of model.routes)for(const pt of route.points)coords.push(pt);
    if(!coords.length)map.setView([63,11],5);
    else if(coords.length===1)map.setView(coords[0],18);
    else map.fitBounds(coords,{padding:[44,44],maxZoom:17});
  }
  function renderMap(){
    if(!map)return;
    addressLayer.clearLayers();devicesLayer.clearLayers();roomsLayer.clearLayers();routesLayer.clearLayers();
    for(const item of areas){
      const geo=addressGeometry(item);
      if(!geo || !['Polygon','MultiPolygon'].includes(geo.type))continue;
      try{
        const selected=selectedAddressId===item.id;
        const layer=L.geoJSON({type:'Feature',geometry:geo,properties:{}},{
          style:{
            color:selected?'#e77b12':'#258263',weight:selected?5:3,
            fillColor:selected?'#ffa449':'#63b38a',fillOpacity:selected?.28:.12
          }
        });
        layer.eachLayer(part=>{
          part.on('click',e=>{
            if(mode==='browse'){L.DomEvent.stopPropagation(e);setSelectedAddress(item.id);feedback('Valgt bygg/tomt: '+item.name)}
          });
          part.bindTooltip(item.name,{sticky:true});
        });
        layer.addTo(addressLayer);
      }catch{/* Skip invalid legacy geometry. */}
    }
    for(const route of model.routes){
      if(!Array.isArray(route.points)||route.points.length<2)continue;
      const active=route.id===selectedRouteId;
      const layer=L.polyline(route.points,{
        color:active?'#ef7d0d':(route.kind==='aerial'?'#455ab1':'#8755ac'),
        weight:active?7:5,opacity:.87,dashArray:route.kind==='aerial'?'9 8':null
      });
      layer.on('click',e=>{
        L.DomEvent.stopPropagation(e);
        finishMode();selectedRouteId=route.id;render();
        feedback('Valgt '+(route.kind==='aerial'?'luftstrekk':'rørtrasé')+' – legg kabel i denne traséen.');
      });
      layer.bindTooltip((route.kind==='aerial'?'Luft':'Rør')+' · '+route.points.length+' punkter');
      layer.addTo(routesLayer);
    }
    for(const device of model.devices){
      if(!Number.isFinite(device.latitude)||!Number.isFinite(device.longitude))continue;
      const marker=L.circleMarker([device.latitude,device.longitude],{
        radius:8,color:'#fff',weight:2,fillColor:'#d58a12',fillOpacity:1
      }).bindTooltip(device.name);
      marker.on('click',e=>{L.DomEvent.stopPropagation(e);feedback('Utstyr: '+device.name)});
      marker.addTo(devicesLayer);
    }
    for(const room of model.rooms){
      if(!Number.isFinite(room.latitude)||!Number.isFinite(room.longitude))continue;
      L.circleMarker([room.latitude,room.longitude],{
        radius:9,color:'#fff',weight:2,fillColor:'#2172a3',fillOpacity:1
      }).bindTooltip('Rom/fordeler: '+room.name).addTo(roomsLayer);
    }
  }
  function storeRecord(key,row){
    const next=normalizeProject(model);
    next[key]=[...next[key],row];
    return writeProject(next);
  }
  function onMapClick(event){
    const lat=event.latlng.lat,lng=event.latlng.lng;
    if(mode==='draw'){
      points.push([lat,lng]);
      if(preview)preview.setLatLngs(points);
      el('network-point-count').textContent=points.length+' punkter';
      return;
    }
    if(mode==='device'){
      const requested=el('network-device-address').value;
      if(requested && !pointInside(addressById(requested),lat,lng)){
        feedback('Velg et punkt innenfor den merkede tomten/bygget for denne adressen.');
        return;
      }
      const catalog=deviceTypes.find(x=>x[0]===el('network-device-type').value);
      if(!catalog)return;
      const name=el('network-device-name').value.trim()||catalog[1];
      if(storeRecord('devices',{id:uid('dev'),projectId,kind:catalog[0],name,
        addressId:requested||null,latitude:lat,longitude:lng})){
        finishMode();feedback('Utstyr plassert: '+name);
      }
    }else if(mode==='room'){
      const addr=addressById(el('network-room-address').value);
      if(!addr || !pointInside(addr,lat,lng)){
        feedback('Velg rommets fordelingspunkt innenfor valgt bygg/tomt.');
        return;
      }
      const name=el('network-room-name').value.trim()||'Teknisk rom';
      const room={id:uid('room'),projectId,addressId:addr.id,name,latitude:lat,longitude:lng};
      if(storeRecord('rooms',room)){
        el('network-rack-room').value=room.id;
        finishMode();feedback('Rom/fordeler plassert: '+name);
      }
    }else{
      const found=addressForPoint(lat,lng);
      if(found){setSelectedAddress(found);feedback('Valgt: '+addressById(found).name)}
    }
  }
  function startRoute(){
    finishMode();points=[];
    drawingKind=el('network-route-kind').value;
    drawingTube=(el('network-tube-type').value.trim()||'Uspesifisert');
    preview=L.polyline([],{color:'#1283ac',weight:4,dashArray:'7 7'}).addTo(map);
    el('network-drawing-controls').hidden=false;
    el('network-point-count').textContent='0 punkter';
    setMode('draw','Trykk på kartet for å legge inn trasépunkter. Fullfør etter minst to punkter.');
  }
  function finishRoute(){
    if(mode!=='draw'||points.length<2){feedback('Traséen må ha minst to punkter.');return}
    const row={id:uid('route'),projectId,kind:drawingKind,
      tubeType:drawingKind==='underground'?drawingTube:null,points:points.map(p=>[...p])};
    if(storeRecord('routes',row)){
      selectedRouteId=row.id;finishMode();render();
      feedback('Trasé lagret. Du kan nå velge fibertall og legge kabel i ruten.');
    }
  }
  function addCable(){
    const route=model.routes.find(x=>x.id===selectedRouteId);
    if(!route){feedback('Velg først en trasé i kartet eller listen.');return}
    const fiberCount=Number(el('network-cable-fibers').value);
    if(!fibers.includes(fiberCount))return;
    if(storeRecord('cables',{id:uid('cable'),projectId,routeId:route.id,fibers:fiberCount})){
      feedback(fiberCount+'F-kabel lagt i traséen. Kabelens geometri følger traséen.');
    }
  }
  function createRack(){
    const roomId=el('network-rack-room').value;
    if(!model.rooms.some(x=>x.id===roomId)){feedback('Opprett og velg et rom først.');return}
    const kind=el('network-rack-kind').value;
    const name=el('network-rack-name').value.trim()||(kind==='cabinet'?'Skap':'Rack');
    const rack={id:uid('rack'),projectId,roomId,kind,name};
    if(storeRecord('racks',rack)){
      el('network-module-rack').value=rack.id;
      feedback('Rack/skap lagt i rommet.');
    }
  }
  function addModule(){
    const rackId=el('network-module-rack').value;
    if(!model.racks.some(x=>x.id===rackId)){feedback('Velg et rack/skap først.');return}
    const selected=panels.find(x=>x.id===el('network-module-type').value);
    if(!selected)return;
    if(storeRecord('modules',{id:uid('mod'),projectId,rackId,type:selected.id,
      label:selected.label,kind:selected.kind,ports:selected.ports||null,
      uplinks:selected.uplinks||null,splitRatio:selected.ratio||null,
      heightU:selected.heightU||null,connector:selected.connector||null})){
      feedback(selected.label+' lagt til i racket/skapet.');
    }
  }
  function removeObject(collection,id){
    const parent=model[collection].find(x=>x.id===id);
    if(!parent)return;
    let next=normalizeProject(model);
    if(!window.confirm('Slette '+(parent.name||parent.label||parent.kind||'objekt')+' fra nettverksplanen?'))return;
    next[collection]=next[collection].filter(x=>x.id!==id);
    if(collection==='routes')next.cables=next.cables.filter(x=>x.routeId!==id);
    if(collection==='rooms'){
      const racksToRemove=new Set(next.racks.filter(x=>x.roomId===id).map(x=>x.id));
      next.racks=next.racks.filter(x=>!racksToRemove.has(x.id));
      next.modules=next.modules.filter(x=>!racksToRemove.has(x.rackId));
    }
    if(collection==='racks')next.modules=next.modules.filter(x=>x.rackId!==id);
    if(collection==='routes'&&selectedRouteId===id)selectedRouteId='';
    if(writeProject(next))feedback('Objekt slettet fra nettverksplanen.');
  }
  function objectRow(list,label,detail,selected,select,remove){
    const wrap=document.createElement('div');
    wrap.className='network-object-row'+(selected?' is-selected':'');
    const action=document.createElement('button');action.type='button';
    action.dataset.action='select';
    const head=document.createElement('span');head.className='network-object-label';head.textContent=label;
    const sub=document.createElement('span');sub.className='network-object-detail';sub.textContent=detail;
    action.append(head,sub);action.addEventListener('click',select);
    const del=document.createElement('button');del.type='button';del.dataset.action='remove';
    del.textContent='×';del.setAttribute('aria-label','Slett '+label);del.addEventListener('click',remove);
    wrap.append(action,del);list.append(wrap);
  }
  function renderObjects(){
    const deviceList=el('network-device-list'),routeList=el('network-route-list');
    const buildingList=el('network-building-list');
    deviceList.replaceChildren();routeList.replaceChildren();buildingList.replaceChildren();
    for(const device of model.devices){
      const name=addressById(device.addressId)?.name||'Utendørs';
      objectRow(deviceList,device.name,name,false,()=>{
        setSelectedAddress(device.addressId||'');map.setView([device.latitude,device.longitude],19);
      },()=>removeObject('devices',device.id));
    }
    if(!model.devices.length)deviceList.textContent='Ingen utstyrspunkter.';
    for(const route of model.routes){
      const attached=model.cables.filter(x=>x.routeId===route.id);
      const name=(route.kind==='aerial'?'Luftstrekk':'Rørtrasé')+' · '+route.points.length+' punkter';
      const detail=(route.kind==='underground'?route.tubeType+' · ':'')+
        (attached.length?attached.map(c=>c.fibers+'F').join(', '):'Ingen kabler');
      objectRow(routeList,name,detail,route.id===selectedRouteId,()=>{
        selectedRouteId=route.id;finishMode();render();
        map.fitBounds(route.points,{padding:[45,45],maxZoom:18});
      },()=>removeObject('routes',route.id));
    }
    if(!model.routes.length)routeList.textContent='Ingen føringsveier.';
    for(const room of model.rooms){
      objectRow(buildingList,room.name,'Rom/fordeler · '+(addressById(room.addressId)?.name||'Ukjent adresse'),false,
        ()=>map.setView([room.latitude,room.longitude],19),()=>removeObject('rooms',room.id));
      for(const rack of model.racks.filter(x=>x.roomId===room.id)){
        objectRow(buildingList,'↳ '+rack.name,(rack.kind==='cabinet'?'Skap':'Rack')+' · '+model.modules.filter(x=>x.rackId===rack.id).length+' paneler',false,
          ()=>feedback('Valgt '+rack.name),()=>removeObject('racks',rack.id));
        for(const module of model.modules.filter(x=>x.rackId===rack.id)){
          objectRow(buildingList,'  · '+module.label, 'Panel i '+rack.name,false,
            ()=>feedback(module.label),()=>removeObject('modules',module.id));
        }
      }
    }
    if(!model.rooms.length)buildingList.textContent='Ingen rom/fordelere.';
  }
  function render(){
    if(!map)return;
    const roomSelect=el('network-rack-room'),rackSelect=el('network-module-rack');
    const oldRoom=roomSelect.value,oldRack=rackSelect.value;
    refreshSelect(roomSelect,model.rooms.map(x=>[x.id,x.name]),'Velg rom',oldRoom);
    refreshSelect(rackSelect,model.racks.map(x=>[x.id,x.name]),'Velg rack/skap',oldRack);
    if(!model.routes.some(x=>x.id===selectedRouteId))selectedRouteId='';
    const selected=model.routes.find(x=>x.id===selectedRouteId);
    el('network-selected-route').textContent=selected
      ? (selected.kind==='aerial'?'Luftstrekk':'Rørtrasé')+' valgt – '+model.cables.filter(c=>c.routeId===selected.id).length+' kabler'
      :'Velg en trasé i kartet eller listen.';
    el('network-add-cable').disabled=!selected;
    renderMap();
    renderObjects();
  }
  function setup(){
    if(!project || !window.L){
      error.hidden=false;
      error.textContent=!project
        ? 'Prosjektet finnes ikke i denne nettleseren. Åpne nettverkskartet fra prosjektoversikten.'
        : 'Kartbiblioteket kunne ikke lastes.';
      return;
    }
    try{model=normalizeProject(readStore().projects[projectId])}
    catch{
      error.hidden=false;
      error.textContent='Nettverksdata kunne ikke leses. Ingen eksisterende lagring ble overskrevet.';
      return;
    }
    el('network-project-name').textContent=project.name+' · Nettverkskart';
    el('network-back').href='./?project='+encodeURIComponent(projectId);
    refreshSelect(el('network-device-address'),
      areas.map(a=>[a.id,a.name]),'Utendørs / utenfor bygg','');
    refreshSelect(el('network-room-address'),
      areas.map(a=>[a.id,a.name]),'Velg bygg/adresse','');
    for(const [value,label] of deviceTypes)option(el('network-device-type'),value,label);
    for(const panel of panels)option(el('network-module-type'),panel.id,panel.label);
    for(const n of fibers)option(el('network-cable-fibers'),String(n),n+' fibre');
    map=L.map('network-map',{zoomControl:true});
    L.tileLayer(TILE,{
      attribution:'&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener noreferrer">Kartverket</a>',
      minZoom:3,maxZoom:20,maxNativeZoom:18
    }).addTo(map);
    addressLayer=L.layerGroup().addTo(map);
    routesLayer=L.layerGroup().addTo(map);
    devicesLayer=L.layerGroup().addTo(map);
    roomsLayer=L.layerGroup().addTo(map);
    map.setView([63,11],5);
    map.on('click',onMapClick);
    render();
    zoomAll();
    el('network-zoom-all').addEventListener('click',zoomAll);
    document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
      finishMode();tab=button.dataset.panel;
      document.querySelectorAll('[data-panel]').forEach(b=>{
        b.classList.toggle('is-active',b===button);
        b.setAttribute('aria-selected',String(b===button));
      });
      for(const type of ['devices','routes','building'])
        el('network-panel-'+type).hidden=type!==tab;
      map.invalidateSize();
    }));
    el('network-device-address').addEventListener('change',e=>setSelectedAddress(e.target.value));
    el('network-room-address').addEventListener('change',e=>setSelectedAddress(e.target.value));
    el('network-place-device').addEventListener('click',()=>{
      const id=el('network-device-address').value;
      if(id && !addressById(id)){feedback('Velg en registrert adresse.');return}
      setMode('device','Trykk på kartet for å plassere utstyret'+(id?' innenfor valgt bygg/tomt.':'.'));
    });
    el('network-place-room').addEventListener('click',()=>{
      if(!addressById(el('network-room-address').value)){
        feedback('Velg et bygg/adresse først.');return;
      }
      setMode('room','Trykk innenfor valgt bygg/tomt for å plassere rommets fordelingspunkt.');
    });
    el('network-draw-route').addEventListener('click',startRoute);
    el('network-undo-point').addEventListener('click',()=>{
      points.pop();
      preview?.setLatLngs(points);
      el('network-point-count').textContent=points.length+' punkter';
    });
    el('network-finish-route').addEventListener('click',finishRoute);
    el('network-cancel-route').addEventListener('click',()=>{
      finishMode();feedback('Tegningen er avbrutt.');
    });
    el('network-add-cable').addEventListener('click',addCable);
    el('network-add-rack').addEventListener('click',createRack);
    el('network-add-module').addEventListener('click',addModule);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&mode!=='browse'){finishMode();feedback('Verktøy avbrutt.')}
    });
    feedback('Velg en adresseflate eller et verktøy for å starte planleggingen.');
  }
  setup();
})();