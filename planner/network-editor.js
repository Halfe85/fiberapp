/* Fiber Planner standalone frontend network editor. No backend.
   All routes are stored as polyline coordinates; cables reference route IDs. */
(() => {
  'use strict';
  const PREFIX='fiberapp.planner.';
  const STORE=PREFIX+'network.v1';
  const ITEMS=PREFIX+'items.v1';
  const PROJECTS=PREFIX+'projects.v1';
  const SOSI_KEY=PREFIX+'sosi.v1';
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
  const fibers=[2,4,12,24,48,96,144,192,288,576];
  const empty=()=>({devices:[],rooms:[],racks:[],modules:[],routes:[],cables:[]});
  const areas=readArray(ITEMS).filter(item=>item &&
    item.projectId===projectId && item.kind==='address' &&
    Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
  const project=readArray(PROJECTS).find(item=>item && item.id===projectId);
  let model=empty();
  let map=null;
  let addressLayer=null,devicesLayer=null,routesLayer=null,preview=null;
  let sosiLayer=null,sosiData=[],sosiRendered=new Map();
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

  function readSosiStorage(){
    const raw=localStorage.getItem(SOSI_KEY);
    const value=raw?JSON.parse(raw):{version:1,projects:{}};
    if(!value || typeof value!=='object'||Array.isArray(value)||
       !value.projects||typeof value.projects!=='object'||Array.isArray(value.projects))
      throw Error('Ugyldig lagring for SOSI-kartlag');
    return value;
  }
  function saveSosiData(next){
    try{
      const store=readSosiStorage();
      store.projects[projectId]=next;
      const json=JSON.stringify(store);
      if(json.length>3_000_000)
        throw Error('SOSI-kartlagene er for store for nettleserlagring.');
      localStorage.setItem(SOSI_KEY,json);
      sosiData=next;
      error.hidden=true;
      renderSosi();
      return true;
    }catch(err){
      sosiMessage(err instanceof Error?err.message:
        'Kunne ikke lagre SOSI-kartlaget. Eksisterende kartlag er bevart.',true);
      return false;
    }
  }
  function sosiMessage(message,isError=false){
    const element=el('network-sosi-status');
    element.textContent=message;
    element.classList.toggle('is-error',isError);
  }
  function renderSosi(){
    if(!sosiLayer)return;
    sosiLayer.clearLayers();
    sosiRendered.clear();
    const list=el('network-sosi-layers');
    list.replaceChildren();
    if(!sosiData.length)list.textContent='Ingen kartlag importert.';
    for(const record of sosiData){
      const row=document.createElement('div');
      row.className='sosi-layer-row';
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';
      checkbox.checked=record.visible!==false;
      checkbox.setAttribute('aria-label','Vis SOSI-kartlag: '+record.filename);
      checkbox.addEventListener('change',()=>{
        const next=sosiData.map(layer=>layer.id===record.id
          ?{...layer,visible:checkbox.checked}:layer);
        saveSosiData(next);
      });
      const name=document.createElement('span');
      name.className='sosi-layer-name';
      name.textContent=record.filename;
      const meta=document.createElement('small');
      const counts=record.meta?.counts||{};
      meta.textContent='EPSG:'+record.meta.epsg+' · '+(counts.points||0)+' punkt · '+
        (counts.lines||0)+' linjer · '+(counts.polygons||0)+' flater';
      const zoom=document.createElement('button');
      zoom.type='button';zoom.className='network-secondary';zoom.textContent='Zoom';
      zoom.addEventListener('click',()=>{
        const layer=sosiRendered.get(record.id);
        if(!layer || !layer.getBounds?.().isValid()){
          sosiMessage('Vis kartlaget før du zoomer til det.',true);return;
        }
        map.fitBounds(layer.getBounds(),{padding:[40,40],maxZoom:18});
      });
      const remove=document.createElement('button');
      remove.type='button';remove.className='sosi-layer-remove';remove.textContent='×';
      remove.title='Fjern SOSI-kartlag';
      remove.setAttribute('aria-label','Fjern SOSI-kartlag: '+record.filename);
      remove.addEventListener('click',()=>{
        if(!window.confirm('Fjerne SOSI-kartlaget «'+record.filename+'» fra dette prosjektet?'))return;
        const next=sosiData.filter(layer=>layer.id!==record.id);
        if(saveSosiData(next))sosiMessage('Kartlaget ble fjernet.');
      });
      const label=document.createElement('div');
      label.className='sosi-layer-description';label.append(name,meta);
      row.append(checkbox,label,zoom,remove);
      list.append(row);
      if(record.visible===false || !Array.isArray(record.features))continue;
      try{
        const geoJSON=L.geoJSON({type:'FeatureCollection',features:record.features},{
          interactive:false,
          style:{color:'#7644ad',weight:2,opacity:.82,
            fillColor:'#a38acb',fillOpacity:.09},
          pointToLayer:(_feature,latlng)=>L.circleMarker(latlng,{
            radius:3,color:'#63399a',weight:1,fillColor:'#a68cda',
            fillOpacity:.8,interactive:false
          })
        });
        geoJSON.addTo(sosiLayer);
        sosiRendered.set(record.id,geoJSON);
      }catch{
        sosiMessage('Et lagret SOSI-kartlag kunne ikke tegnes.',true);
      }
    }
  }
  async function importSosi(){
    const file=el('network-sosi-file').files?.[0];
    if(!file){sosiMessage('Velg en SOSI-fil først.',true);return}
    if(!/\.(sos|sosi)$/i.test(file.name)){
      sosiMessage('Velg en fil med endelsen .sos eller .sosi.',true);return;
    }
    if(file.size>5_000_000){
      sosiMessage('Filen er for stor. Maksimal filstørrelse er 5 MB.',true);return;
    }
    if(!window.FiberSosi?.parse){
      sosiMessage('SOSI-leseren kunne ikke lastes.',true);return;
    }
    const button=el('network-sosi-import');
    button.disabled=true;
    sosiMessage('Leser og konverterer SOSI-filen …');
    try{
      const bytes=await file.arrayBuffer();
      const raw=new Uint8Array(bytes);
      let text='',encodingNote='';
      // SOSI headers are ASCII compatible. Choose a decoder from TEGNSETT.
      const header=new TextDecoder('windows-1252').decode(raw.slice(0,2400));
      const charset=/^\s*\.\.TEGNSETT\s+(\S+)/mi.exec(header)?.[1]?.toUpperCase()||'';
      const labels={
        'UTF-8':'utf-8','UTF8':'utf-8','ISO8859-1':'iso-8859-1',
        'ISO-8859-1':'iso-8859-1','ISO8859-10':'iso-8859-10',
        'ISO-8859-10':'iso-8859-10','ANSI':'windows-1252'
      };
      let charsetName=labels[charset]||'';
      if(!charsetName){
        // For older DOSN8 and unlabelled data, decode ASCII geometry with
        // a best effort. Non-ASCII feature names might be misdecoded.
        try{new TextDecoder('utf-8',{fatal:true}).decode(raw);
          charsetName='utf-8';}
        catch{charsetName='windows-1252'}
        if(charset && charset!=='UTF-8')encodingNote=' Tegnsett '+charset+
          ' er ikke fullstendig støttet; spesialtegn kan være feil.';
      }
      try{text=new TextDecoder(charsetName,{fatal:charsetName==='utf-8'}).decode(raw)}
      catch{
        sosiMessage('Kunne ikke lese filens tegnsett ('+charsetName+').',true);
        return;
      }
      const converted=window.FiberSosi.parse(text);
      const name=file.name.slice(0,120);
      const record={id:uid('sosi'),filename:name,visible:true,
        importedAt:new Date().toISOString(),
        meta:converted.meta,features:converted.features};
      const next=[...sosiData,record];
      if(!saveSosiData(next))return;
      el('network-sosi-file').value='';
      const n=converted.features.length;
      sosiMessage('Importerte '+n+' kartobjekter fra '+name+'. '+
        converted.meta.skipped+' grupper ble hoppet over.'+encodingNote);
      const rendered=sosiRendered.get(record.id);
      if(rendered?.getBounds?.().isValid())
        map.fitBounds(rendered.getBounds(),{padding:[45,45],maxZoom:18});
    }catch(err){
      sosiMessage(err instanceof Error?err.message:
        'Kunne ikke lese SOSI-filen.',true);
    }finally{button.disabled=false}
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
    for(const route of model.routes)for(const pt of route.points)coords.push(pt);
    if(!coords.length)map.setView([63,11],5);
    else if(coords.length===1)map.setView(coords[0],18);
    else map.fitBounds(coords,{padding:[44,44],maxZoom:17});
  }
  function renderMap(){
    if(!map)return;
    addressLayer.clearLayers();devicesLayer.clearLayers();routesLayer.clearLayers();
    for(const item of areas){
      const geo=addressGeometry(item);
      if(!geo || !['Polygon','MultiPolygon'].includes(geo.type)){
        // A small reference point on this specialist map is enough for new
        // addresses; drawing an outline is not required.
        L.circleMarker([item.latitude,item.longitude],{
          radius:5,color:'#fff',weight:2,fillColor:'#2788ab',fillOpacity:.8
        }).bindTooltip(item.name).on('click',event=>{
          L.DomEvent.stopPropagation(event);
          if(mode==='browse')setSelectedAddress(item.id);
        }).addTo(addressLayer);
        continue;
      }
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
      if(requested && !addressById(requested)){
        feedback('Velg en registrert adresse, eller Utendørs.');
        return;
      }
      const catalog=deviceTypes.find(x=>x[0]===el('network-device-type').value);
      if(!catalog)return;
      const name=el('network-device-name').value.trim()||catalog[1];
      if(storeRecord('devices',{id:uid('dev'),projectId,kind:catalog[0],name,
        addressId:requested||null,latitude:lat,longitude:lng})){
        finishMode();feedback('Utstyr plassert: '+name);
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
  function removeObject(collection,id){
    const parent=model[collection].find(x=>x.id===id);
    if(!parent)return;
    let next=normalizeProject(model);
    if(!window.confirm('Slette '+(parent.name||parent.label||parent.kind||'objekt')+' fra nettverksplanen?'))return;
    next[collection]=next[collection].filter(x=>x.id!==id);
    if(collection==='routes')next.cables=next.cables.filter(x=>x.routeId!==id);
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
    deviceList.replaceChildren();routeList.replaceChildren();
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
  }
  function render(){
    if(!map)return;
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
    for(const [value,label] of deviceTypes)option(el('network-device-type'),value,label);
    for(const n of fibers)option(el('network-cable-fibers'),String(n),n+' fibre');
    map=L.map('network-map',{zoomControl:true});
    L.tileLayer(TILE,{
      attribution:'&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener noreferrer">Kartverket</a>',
      minZoom:3,maxZoom:20,maxNativeZoom:18
    }).addTo(map);
    sosiLayer=L.layerGroup().addTo(map);
    addressLayer=L.layerGroup().addTo(map);
    routesLayer=L.layerGroup().addTo(map);
    devicesLayer=L.layerGroup().addTo(map);
    map.setView([63,11],5);
    map.on('click',onMapClick);
    render();
    try{
      const loaded=readSosiStorage().projects[projectId];
      sosiData=Array.isArray(loaded)?loaded:[];
      renderSosi();
    }catch{
      sosiMessage('Kunne ikke lese lagrede SOSI-kartlag. Eksisterende lagring er ikke overskrevet.',true);
    }
    zoomAll();
    el('network-zoom-all').addEventListener('click',zoomAll);
    document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
      finishMode();tab=button.dataset.panel;
      document.querySelectorAll('[data-panel]').forEach(b=>{
        b.classList.toggle('is-active',b===button);
        b.setAttribute('aria-selected',String(b===button));
      });
      for(const type of ['devices','routes','sosi'])
        el('network-panel-'+type).hidden=type!==tab;
      map.invalidateSize();
    }));
    el('network-device-address').addEventListener('change',e=>setSelectedAddress(e.target.value));
    el('network-place-device').addEventListener('click',()=>{
      const id=el('network-device-address').value;
      if(id && !addressById(id)){feedback('Velg en registrert adresse.');return}
      setMode('device','Trykk på kartet for å plassere utstyret'+(id?' og knytte det til valgt adresse.':'.'));
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
    el('network-sosi-import').addEventListener('click',()=>void importSosi());
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&mode!=='browse'){finishMode();feedback('Verktøy avbrutt.')}
    });
    feedback('Velg utstyr eller tegn en trasé. Byggvisning og leilighetstilkoblinger åpnes fra adresselisten.');
  }
  setup();
})();