/* Fiber Planner project items — UI-first localStorage storage, no SQL. */
(() => {
  'use strict';
  const KEY = 'fiberapp.planner.items.v1';
  const PROJECTS_KEY = 'fiberapp.planner.projects.v1';
  const ADDRESS_API = 'https://api.kartverket.no/adresser/v1/sok';
  const wrapper = document.getElementById('project-actions');
  const toggle = document.getElementById('project-add-toggle');
  const menu = document.getElementById('project-add-menu');
  const dialog = document.getElementById('project-item-dialog');
  const form = document.getElementById('project-item-form');
  const modalTitle = document.getElementById('project-item-title');
  const name = document.getElementById('project-item-name');
  const equipmentNameFields = document.getElementById('project-equipment-name-fields');
  const addressPanel = document.getElementById('project-address-search');
  const addressQuery = document.getElementById('project-address-query');
  const addressResults = document.getElementById('project-address-results');
  const addressStatus = document.getElementById('project-address-status');
  const addressScope = document.getElementById('project-address-scope');
  const addressSelected = document.getElementById('project-address-selected');
  const areaSelectedLabel = document.getElementById('project-address-area-selected');
  const areaPanel = document.getElementById('project-address-map-panel');
  const equipmentPositionPicker = document.getElementById('project-equipment-position-picker');
  const note = document.getElementById('project-item-note');
  const typeFields = document.getElementById('project-equipment-type-fields');
  const equipmentType = document.getElementById('project-equipment-type');
  const pickLocation = document.getElementById('project-item-pick-location');
  const positionStatus = document.getElementById('project-item-position');
  const errorBox = document.getElementById('project-item-error');
  const itemsContainer = document.getElementById('project-items');
  const addressEmpty = document.getElementById('project-addresses-empty');
  const editDialog = document.getElementById('project-address-edit-dialog');
  const editClose = document.getElementById('project-address-edit-close');
  const unitsSearch = document.getElementById('project-address-units-search');
  const unitsPanel = document.getElementById('project-address-units-panel');
  const unitsStatus = document.getElementById('project-address-units-status');
  const unitsRows = document.getElementById('project-address-units-rows');
  const unitsTableWrap = document.getElementById('project-address-units-table-wrap');
  const unitsOk = document.getElementById('project-address-units-ok');
  const unitsSaved = document.getElementById('project-address-units-saved');
  const editActions = document.getElementById('project-address-edit-actions');
  const deleteOpen = document.getElementById('project-address-delete-open');
  const deleteConfirmation = document.getElementById('project-address-delete-confirmation');
  const deleteTarget = document.getElementById('project-address-delete-target');
  const deleteError = document.getElementById('project-address-delete-error');
  const deleteCancel = document.getElementById('project-address-delete-cancel');
  const deleteConfirm = document.getElementById('project-address-delete-confirm');
  const sections = {
    address: {
      section: document.getElementById('project-addresses-section'),
      list: document.getElementById('project-addresses')
    },
    equipment: {
      section: document.getElementById('project-equipment-section'),
      list: document.getElementById('project-equipment')
    }
  };
  if (!wrapper || !toggle || !menu || !dialog || !form) return;
  let rows = [];
  let currentProjectId = null;
  let currentKind = null;
  let selectedPosition = null;
  let selectedAddress = null;
  let selectedArea = null;
  let areaPending = false;
  let searchSequence = 0;
  let searchTimer = null;
  let searchController = null;
  let canSave = true;
  let activeAddressId=null;
  let lastAddressProjectId=null;
  function selectAddressRow(projectId,itemId,scroll=false){
    if(!projectId || projectId!==selectedProject() ||
       !rows.some(item=>item.projectId===projectId &&
         item.kind==='address' && item.id===itemId))return;
    activeAddressId=itemId;
    const addressRows=sections.address.list.children;
    for(const element of addressRows){
      const selected=element.dataset.addressId===itemId;
      element.classList.toggle('is-selected',selected);
      const button=element.querySelector('.project-item-focus');
      if(button)button.setAttribute('aria-pressed',String(selected));
      if(selected && scroll)element.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }
  }
  let editReturnFocus = null;
  let editActiveRow = null;
  let editOpenedByPointer = false;
  let unitsRequest=0;
  let unitsAbort=null;
  let foundUnits=[];
  let checkedUnits=new Set();
  let unitsReady=false;
  function cancelUnitsSearch(){
    unitsRequest++;
    unitsAbort?.abort();
    unitsAbort=null;
  }
  function resetUnitsSearch(){
    cancelUnitsSearch();
    foundUnits=[];
    checkedUnits=new Set();
    unitsReady=false;
    unitsRows.replaceChildren();
    unitsTableWrap.hidden=true;
    unitsOk.disabled=true;
    unitsPanel.hidden=true;
    unitsStatus.textContent='';
    editDialog.classList.remove('is-units-open');
  }
  // Unit numbers (H0102) encode the floor in the leading letter + two digits.
  function addressIdentity(item){
    const match=/^(.+?)\s+(\d+)([A-Za-zÆØÅæøå]?)$/u.exec(String(item.name||'').trim());
    if(!match)return null;
    const parts=String(item.addressKey||'').split('|');
    const houseNumber=parts.length===5 && /^\d+$/.test(parts[2])
      ? Number(parts[2]):Number(match[2]);
    const letter=(parts.length===5?parts[3]:match[3]||'').trim().toLocaleUpperCase('nb-NO');
    return {
      street:match[1].trim(),number:houseNumber,letter,
      municipality:parts.length===5 && /^\d{4}$/.test(parts[0])?parts[0]:'',
      postcode:String(item.postcode||'').trim()
    };
  }
  function normalizeUnitResults(api,identity){
    const entries=Array.isArray(api?.adresser)?api.adresser:[];
    const accepted=new Set();
    const expectedStreet=identity.street.toLocaleLowerCase('nb-NO');
    for(const entry of entries){
      if(entry?.objtype!=='Vegadresse' ||
         String(entry.adressenavn||'').trim().toLocaleLowerCase('nb-NO')!==expectedStreet ||
         Number(entry.nummer)!==identity.number ||
         String(entry.bokstav||'').trim().toLocaleUpperCase('nb-NO')!==identity.letter ||
         (identity.postcode && String(entry.postnummer||'')!==identity.postcode) ||
         (identity.municipality && String(entry.kommunenummer||'')!==identity.municipality))continue;
      for(const number of Array.isArray(entry.bruksenhetsnummer)?entry.bruksenhetsnummer:[]){
        if(typeof number!=='string')continue;
        const normalized=number.trim().toUpperCase();
        if(/^[HKUL]\d{4}$/.test(normalized))accepted.add(normalized);
      }
    }
    return [...accepted].sort((a,b)=>a.localeCompare(b,'nb-NO')).map(number=>({
      adresse:identity.street,adresseNr:identity.number,adresseBokstav:identity.letter,
      etasje:number.slice(0,3),leilighetsnummer:number,source:'Kartverket'
    }));
  }
  function renderUnits(){
    unitsRows.replaceChildren();
    for(const unit of foundUnits){
      const row=document.createElement('tr');
      const first=document.createElement('td');
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';
      checkbox.checked=checkedUnits.has(unit.leilighetsnummer);
      checkbox.setAttribute('aria-label','Velg '+unit.leilighetsnummer+' i '+unit.adresse+' '+unit.adresseNr+unit.adresseBokstav);
      checkbox.addEventListener('change',()=>{
        if(checkbox.checked)checkedUnits.add(unit.leilighetsnummer);
        else checkedUnits.delete(unit.leilighetsnummer);
      });
      first.append(checkbox);
      row.append(first);
      for(const value of [unit.adresse,unit.adresseNr,unit.adresseBokstav||'–',unit.etasje,unit.leilighetsnummer]){
        const cell=document.createElement('td');
        cell.textContent=String(value);
        row.append(cell);
      }
      unitsRows.append(row);
    }
    unitsTableWrap.hidden=!foundUnits.length;
    unitsOk.disabled=!unitsReady || !foundUnits.length;
  }
  async function searchUnits(){
    const projectId=selectedProject(),id=editDialog.dataset.addressId;
    if(!editDialog.open || !projectId || !id)return;
    const item=rows.find(row=>row && row.id===id && row.projectId===projectId && row.kind==='address');
    if(!item)return;
    resetUnitsSearch();
    unitsPanel.hidden=false;
    editDialog.classList.add('is-units-open');
    unitsStatus.textContent='Søker etter registrerte bruksenhetsnummer hos Kartverket …';
    const identity=addressIdentity(item);
    if(!identity){
      unitsStatus.textContent='Adressen kunne ikke tolkes til gatenavn og husnummer.';
      return;
    }
    const params=new URLSearchParams({
      adressenavn:identity.street,nummer:String(identity.number),bokstav:identity.letter,
      objtype:'Vegadresse',treffPerSide:'100',side:'0'
    });
    if(identity.postcode)params.set('postnummer',identity.postcode);
    if(identity.municipality)params.set('kommunenummer',identity.municipality);
    const token=++unitsRequest;
    const controller=new AbortController();
    unitsAbort=controller;
    try{
      const response=await fetch(ADDRESS_API+'?'+params.toString(),{
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket: '+response.status);
      const data=await response.json();
      if(token!==unitsRequest || controller.signal.aborted ||
         !editDialog.open || selectedProject()!==projectId ||
         editDialog.dataset.addressId!==id)return;
      foundUnits=normalizeUnitResults(data,identity);
      const existing=Array.isArray(item.boenheter)?item.boenheter:[];
      const savedNumbers=new Set(existing.map(unit=>unit?.leilighetsnummer).filter(Boolean));
      checkedUnits=new Set(foundUnits.filter(unit=>savedNumbers.has(unit.leilighetsnummer))
        .map(unit=>unit.leilighetsnummer));
      unitsReady=true;
      renderUnits();
      unitsStatus.textContent=foundUnits.length
        ? 'Fant '+foundUnits.length+' registrerte bruksenhetsnummer. Huk av enhetene som skal inngå i prosjektet.'
        : 'Ingen registrerte bruksenhetsnummer funnet for denne vegadressen. Ingen enheter er lagt til.';
    }catch(error){
      if(token!==unitsRequest || controller.signal.aborted)return;
      unitsStatus.textContent='Kunne ikke hente bruksenheter fra Kartverket. Prøv søket på nytt.';
    }finally{
      if(token===unitsRequest)unitsAbort=null;
    }
  }
  function saveUnits(){
    const projectId=selectedProject(),id=editDialog.dataset.addressId;
    if(!editDialog.open || !unitsReady || !foundUnits.length || !canSave || !projectId || !id)return;
    try{
      const raw=localStorage.getItem(KEY);
      const all=raw?JSON.parse(raw):[];
      if(!Array.isArray(all))throw new Error('Ugyldig lagring');
      const index=all.findIndex(item=>item && item.id===id &&
        item.projectId===projectId && item.kind==='address');
      if(index<0){
        unitsStatus.textContent='Adressen finnes ikke lenger i prosjektet.';
        return;
      }
      const selected=foundUnits.filter(unit=>checkedUnits.has(unit.leilighetsnummer));
      const next=all.slice();
      next[index]={...next[index],boenheter:selected};
      localStorage.setItem(KEY,JSON.stringify(next));
      rows=next;
      editDialog.close();
      render();
      window.dispatchEvent(new CustomEvent('fiberapp:planner-items-changed',{
        detail:{projectId}
      }));
    }catch{
      unitsStatus.textContent='Kunne ikke lagre boenhetene i nettleseren. Ingen endringer ble lagret.';
    }
  }
  function resetAddressDelete(){
    editActions.hidden=false;
    deleteConfirmation.hidden=true;
    deleteError.hidden=true;
    deleteError.textContent='';
    deleteTarget.textContent='';
  }
  function showAddressDeleteError(message){
    deleteError.textContent=message;
    deleteError.hidden=false;
  }
  function openAddressEditor(item,trigger,event){
    // Editing is a UI placeholder. No item is modified until an editor is built.
    if(!editDialog || !editClose || !selectedProject() ||
       item.projectId !== selectedProject() || item.kind !== 'address')return;
    const row=trigger.parentElement;
    editOpenedByPointer=event?.detail !== 0;
    editActiveRow=row;
    row?.classList.add('address-tool-modal-open');
    // Pointer-triggered focus must not keep the hover tool stuck on after closing.
    // Re-enable hover only after the pointer leaves this address row.
    if(editOpenedByPointer)row?.classList.add('address-tool-dismissed');
    editDialog.dataset.addressId = item.id;
    resetAddressDelete();
    resetUnitsSearch();
    const savedCount=Array.isArray(item.boenheter)?item.boenheter.length:0;
    unitsSaved.textContent=savedCount+' valgte bruksenheter i prosjektet';
    unitsSaved.hidden=!savedCount;
    editReturnFocus = trigger;
    editDialog.showModal();
    editClose.focus();
  }
  const showPosition = () => {
    positionStatus.textContent = selectedPosition
      ? 'Posisjon valgt: ' + selectedPosition.latitude.toFixed(6) + ', ' +
        selectedPosition.longitude.toFixed(6)
      : 'Ingen kartposisjon valgt';
  };

  function currentPostcode(id) {
    try {
      const values = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      if (!Array.isArray(values)) return '';
      const project = values.find(p => p && p.id === id);
      return typeof project?.postcode === 'string' && /^[0-9]{4}$/.test(project.postcode)
        ? project.postcode : '';
    } catch { return ''; }
  }
  function cancelSearch() {
    searchSequence++;
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = null;
    if (searchController) searchController.abort();
    searchController = null;
  }
  function resetResults(message) {
    addressResults.replaceChildren();
    addressResults.hidden = true;
    addressStatus.textContent = message;
  }
  function addressKey(raw) {
    return [raw.kommunenummer || '', raw.adressekode ?? raw.adressenavn,
      raw.nummer ?? '', raw.bokstav || '', raw.postnummer || ''].join('|').toLocaleLowerCase('nb-NO');
  }
  function normalizeAddress(raw) {
    if (!raw || raw.objtype !== 'Vegadresse' ||
        typeof raw.adressenavn !== 'string' || !Number.isInteger(raw.nummer)) return null;
    const point = raw.representasjonspunkt;
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
        Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return null;
    const road = raw.adressenavn.trim();
    if (!road) return null;
    const letter = typeof raw.bokstav === 'string' ? raw.bokstav.trim() : '';
    return {
      addressKey:addressKey(raw),
      name:road + ' ' + raw.nummer + letter,
      postcode:typeof raw.postnummer === 'string' ? raw.postnummer : '',
      poststed:typeof raw.poststed === 'string' ? raw.poststed : '',
      latitude:point.lat,longitude:point.lon
    };
  }
  async function searchAddresses(query,projectId,sequence) {
    const postcode = currentPostcode(projectId);
    const params = new URLSearchParams({
      sok:query + '*',objtype:'Vegadresse',treffPerSide:'30',side:'0',utkoordsys:'4258'
    });
    if (postcode) params.set('postnummer',postcode);
    const controller = new AbortController();
    searchController = controller;
    addressStatus.textContent = 'Søker etter vegadresser …';
    try {
      const response = await fetch(ADDRESS_API + '?' + params.toString(), {
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if (!response.ok) throw new Error('Kartverket API: ' + response.status);
      const data = await response.json();
      if (sequence !== searchSequence || projectId !== selectedProject() ||
          currentKind !== 'address' || !dialog.open) return;
      const unique = new Map();
      for (const raw of Array.isArray(data.adresser) ? data.adresser : []) {
        const candidate = normalizeAddress(raw);
        if (!candidate || unique.has(candidate.addressKey)) continue;
        if (postcode && candidate.postcode !== postcode) continue;
        unique.set(candidate.addressKey,candidate);
      }
      addressResults.replaceChildren();
      for (const candidate of unique.values()) {
        const item = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        const label = document.createElement('strong');
        label.textContent = candidate.name;
        const location = document.createElement('span');
        location.textContent = [candidate.postcode,candidate.poststed].filter(Boolean).join(' ');
        option.append(label,location);
        option.addEventListener('click', () => {
          selectedAddress = candidate;
          selectedArea = null;
          areaSelectedLabel.hidden = true;
          addressQuery.value = candidate.name;
          resetResults('');
          addressSelected.textContent = 'Valgt vegadresse: ' + candidate.name +
            (candidate.postcode ? ', ' + candidate.postcode : '');
          addressSelected.hidden = false;
          window.dispatchEvent(new CustomEvent('fiberapp:planner-address-selected',{
            detail:{projectId,address:candidate}
          }));
        });
        item.append(option);
        addressResults.append(item);
      }
      const matches = unique.size;
      addressResults.hidden = matches === 0;
      addressStatus.textContent = matches
        ? 'Velg en adresse fra listen. Viser inntil 30 treff; skriv mer for å snevre inn.'
        : 'Ingen vegadresser funnet. Kontroller gatenavn og postnummer.';
    } catch (err) {
      if (controller.signal.aborted || sequence !== searchSequence) return;
      resetResults('Adressesøket kunne ikke fullføres. Kontroller internett og prøv igjen.');
    }
  }
  function onAddressInput() {
    selectedAddress = null;
    selectedArea = null;
    areaPending = false;
    areaSelectedLabel.hidden = true;
    window.dispatchEvent(new CustomEvent('fiberapp:planner-address-clear',{
      detail:{projectId:selectedProject()}
    }));
    addressSelected.hidden = true;
    cancelSearch();
    const query = addressQuery.value.trim().replace(/\s+/g,' ');
    resetResults('Skriv minst to tegn for å søke i Kartverkets adresseregister.');
    if (query.length < 2 || !dialog.open || currentKind !== 'address') return;
    const sequence = searchSequence;
    const projectId = selectedProject();
    searchTimer = setTimeout(() => {
      if (projectId && sequence === searchSequence) void searchAddresses(query,projectId,sequence);
    },280);
  }

  function error(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }
  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  function selectedProject() {
    const projectId = new URL(location.href).searchParams.get('project');
    if (!projectId || wrapper.hidden) return null;
    return projectId;
  }
  function reload() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { rows = []; return; }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Ugyldige data');
      rows = parsed.filter(item => item && typeof item.id === 'string' &&
        typeof item.projectId === 'string' && ['address','equipment'].includes(item.kind) &&
        typeof item.name === 'string');
    } catch {
      canSave = false;
      toggle.disabled = true;
      rows = [];
      console.error('Fiber Planner: kan ikke lese lagrede adresser eller utstyr.');
    }
  }
  function render() {
    currentProjectId = selectedProject();
    if(currentProjectId!==lastAddressProjectId){
      activeAddressId=null;
      lastAddressProjectId=currentProjectId;
    }
    if(activeAddressId && !rows.some(item=>item.projectId===currentProjectId &&
        item.kind==='address' && item.id===activeAddressId))activeAddressId=null;
    closeMenu();
    if (!currentProjectId && dialog.open) dialog.close();
    if (editDialog?.open && (!currentProjectId ||
        !rows.some(item=>item.id===editDialog.dataset.addressId &&
          item.kind==='address' && item.projectId===currentProjectId))){
      editDialog.close();
    }
    for (const kind of ['address', 'equipment']) {
      const target = sections[kind];
      target.list.replaceChildren();
      const found = rows.filter(item => item.projectId === currentProjectId && item.kind === kind);
      target.section.hidden = kind === 'equipment' && !found.length;
      if (kind === 'address') addressEmpty.hidden = found.length > 0;
      for (const item of found) {
        const article = document.createElement('article');
        article.className = kind === 'address' ? 'project-item project-item-address' : 'project-item';
        if(kind==='address'){
          article.dataset.addressId=item.id;
          article.classList.toggle('is-selected',item.id===activeAddressId);
        }
        const mappedAddress = kind === 'address' &&
          Number.isFinite(item.latitude) && Number.isFinite(item.longitude) &&
          Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180;
        const content = document.createElement(mappedAddress ? 'button' : 'div');
        if (mappedAddress) {
          content.type = 'button';
          content.className = 'project-item-focus';
          content.setAttribute('aria-label', 'Vis ' + item.name + ' på kartet');
          content.setAttribute('aria-pressed',String(item.id===activeAddressId));
          content.addEventListener('click', () => {
            selectAddressRow(item.projectId,item.id);
            window.dispatchEvent(new CustomEvent('fiberapp:planner-address-focus', {
              detail:{projectId:item.projectId,itemId:item.id}
            }));
          });
        }
        const strong = document.createElement('strong');
        strong.textContent = item.name;
        content.append(strong);
        if (kind === 'equipment' && item.equipmentType) {
          const type = document.createElement('span');
          type.className = 'project-item-type';
          type.textContent = item.equipmentType;
          content.append(type);
        }
        if(kind==='address' && Array.isArray(item.boenheter) && item.boenheter.length){
          const unitsLabel=document.createElement('span');
          unitsLabel.className='project-item-units-count';
          unitsLabel.textContent=item.boenheter.length+' valgte bruksenheter';
          content.append(unitsLabel);
        }
        if (kind === 'address' && (item.area || item.parcel)) {
          const area = item.area || item.parcel;
          const areaInfo = document.createElement('span');
          areaInfo.className = 'project-item-parcel';
          areaInfo.textContent = (area.kind === 'building' ? 'Bygg' : 'Tomt') +
            (area.propertyLabel ? ': ' + area.propertyLabel : ': tegnet område');
          content.append(areaInfo);
        }
        if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
          const location = document.createElement('span');
          location.className = 'project-item-position';
          location.textContent = 'Kartposisjon registrert';
          content.append(location);
        }
        if (item.note) {
          const detail = document.createElement('span');
          detail.className = 'project-item-note';
          detail.textContent = item.note;
          content.append(detail);
        }
        article.append(content);
        if (kind === 'address') {
          const elevation=document.createElement('a');
          elevation.className='project-item-building-link';
          elevation.textContent='2D byggvisning';
          elevation.href='./building.html?project='+encodeURIComponent(item.projectId)+
            '&address='+encodeURIComponent(item.id);
          article.append(elevation);
        }
        if (kind === 'address') {
          const tool = document.createElement('button');
          tool.type = 'button';
          tool.className = 'project-item-tool';
          tool.setAttribute('aria-label','Rediger adresse: '+item.name);
          tool.title = 'Rediger adresse';
          // Static, trusted markup; the address name is only used as text elsewhere.
          tool.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" '+ 
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
            '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7.8 7.8a2.12 2.12 0 0 1-3-3l7.8-7.8a6 6 0 0 1 7.9-7.9z"/></svg>';
          tool.addEventListener('click',event=>openAddressEditor(item,tool,event));
          article.addEventListener('pointerenter',()=>{
            // If the cursor moved away while the modal was open, the first
            // real hover after closing must make the wrench available again.
            if(!editDialog?.open)article.classList.remove('address-tool-dismissed');
          });
          article.addEventListener('pointerleave',()=>{
            // A dialog opening can itself trigger pointerleave. Keep suppression
            // until the dialog is closed and the pointer genuinely exits the row.
            if(!editDialog?.open)article.classList.remove('address-tool-dismissed');
          });
          article.append(tool);
        }
        target.list.append(article);
      }
    }
    itemsContainer.hidden = !currentProjectId;
  }
  function openModal(kind) {
    closeMenu();
    const projectId = selectedProject();
    if (!projectId || !canSave) return;
    currentProjectId = projectId;
    currentKind = kind;
    selectedPosition = null;
    selectedAddress = null;
    selectedArea = null;
    areaPending = false;
    areaSelectedLabel.hidden = true;
    cancelSearch();
    addressQuery.value = '';
    addressSelected.hidden = true;
    resetResults('Skriv minst to tegn for å søke i Kartverkets adresseregister.');
    const postcode = currentPostcode(projectId);
    addressScope.textContent = postcode
      ? 'Søker kun i postnummer ' + postcode + '. Ingen leilighetsnummer.'
      : 'Prosjektet mangler postnummer. Søker i hele Norge, uten leilighetsnummer.';
    addressPanel.hidden = kind !== 'address';
    areaPanel.hidden = kind !== 'address';
    dialog.classList.toggle('address-mode',kind === 'address');
    equipmentNameFields.hidden = kind !== 'equipment';
    equipmentPositionPicker.hidden = kind !== 'equipment';
    name.required = kind === 'equipment';
    showPosition();
    form.reset();
    error('');
    modalTitle.textContent = kind === 'address' ? 'Ny adresse' : 'Nytt utstyr';
    typeFields.hidden = kind !== 'equipment';
    dialog.showModal();
    if (kind === 'address') {
      window.dispatchEvent(new CustomEvent('fiberapp:planner-address-modal-open',{
        detail:{projectId}
      }));
    }
    (kind === 'address' ? addressQuery : name).focus();
  }
  reload();
  render();
  window.addEventListener('fiberapp:planner-project-changed', render);
  window.addEventListener('popstate', render);
  window.addEventListener('fiberapp:planner-main-address-selected',event=>{
    const {projectId,itemId}=event.detail || {};
    selectAddressRow(projectId,itemId,true);
  });

  toggle.addEventListener('click', () => {
    if (!canSave || !selectedProject()) return;
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
  });
  if(editDialog && editClose){
    unitsSearch.addEventListener('click',searchUnits);
    unitsOk.addEventListener('click',saveUnits);
    deleteOpen.addEventListener('click',()=>{
      resetUnitsSearch();
      const projectId=selectedProject(),itemId=editDialog.dataset.addressId;
      const address=rows.find(item=>item.kind==='address' &&
        item.projectId===projectId && item.id===itemId);
      if(!editDialog.open || !address)return;
      deleteTarget.textContent=address.name;
      deleteError.textContent='';
      deleteError.hidden=true;
      editActions.hidden=true;
      deleteConfirmation.hidden=false;
      deleteCancel.focus();
    });
    deleteCancel.addEventListener('click',()=>{
      resetAddressDelete();
      deleteOpen.focus();
    });
    deleteConfirm.addEventListener('click',()=>{
      if(!editDialog.open || !canSave)return;
      const projectId=selectedProject(),itemId=editDialog.dataset.addressId;
      if(!projectId || !itemId){
        showAddressDeleteError('Fant ikke adressen som skal slettes.');
        return;
      }
      try{
        // Read the latest state to preserve unrelated records and changes.
        const raw=localStorage.getItem(KEY);
        const current=raw?JSON.parse(raw):[];
        if(!Array.isArray(current))throw new Error('Ugyldig lagring');
        const target=current.find(item=>item && item.id===itemId &&
          item.projectId===projectId && item.kind==='address');
        if(!target){
          showAddressDeleteError('Adressen finnes ikke lenger i prosjektet.');
          return;
        }
        const next=current.filter(item=>item!==target);
        localStorage.setItem(KEY,JSON.stringify(next));
        rows=next;
        editDialog.close();
        render();
        window.dispatchEvent(new CustomEvent('fiberapp:planner-items-changed',{
          detail:{projectId}
        }));
      }catch{
        showAddressDeleteError('Kunne ikke slette adressen. Kontroller nettleserlagringen.');
      }
    });
    editClose.addEventListener('click',()=>editDialog.close());
    editDialog.addEventListener('click',event=>{
      if(event.target===editDialog)editDialog.close();
    });
    editDialog.addEventListener('close',()=>{
      resetUnitsSearch();
      resetAddressDelete();
      delete editDialog.dataset.addressId;
      editActiveRow?.classList.remove('address-tool-modal-open');
      if(editReturnFocus?.isConnected){
        if(editOpenedByPointer)editReturnFocus.blur();
        else editReturnFocus.focus(); // Keep keyboard navigation accessible.
      }
      editReturnFocus=null;
      editActiveRow=null;
      editOpenedByPointer=false;
    });
  }
  document.getElementById('add-address').addEventListener('click', () => {
    const projectId=selectedProject();
    if(!projectId)return;
    location.assign('./add-address.html?project='+encodeURIComponent(projectId));
  });
  document.getElementById('add-equipment').addEventListener('click', () => openModal('equipment'));
  addressQuery.addEventListener('input', onAddressInput);
  window.addEventListener('fiberapp:planner-address-area-pending',event=>{
    if(currentKind==='address' && event.detail?.projectId===selectedProject()){
      areaPending=Boolean(event.detail.pending);
    }
  });
  window.addEventListener('fiberapp:planner-address-area-selected',event=>{
    if(currentKind !== 'address' || !selectedAddress ||
       event.detail?.projectId !== selectedProject())return;
    selectedArea=event.detail.area;
    areaSelectedLabel.textContent=selectedArea
      ? (selectedArea.kind === 'building' ? 'Bygg' : 'Tomt') +
        ' valgt' + (selectedArea.propertyLabel ? ': '+selectedArea.propertyLabel : '')
      : '';
    areaSelectedLabel.hidden=!selectedArea;
  });
  pickLocation.addEventListener('click', () => {
    const projectId = selectedProject();
    if (!projectId || currentKind !== 'equipment') return;
    dialog.close();
    window.dispatchEvent(new CustomEvent('fiberapp:planner-map-select-start', {
      detail: {projectId,kind:currentKind}
    }));
  });
  window.addEventListener('fiberapp:planner-map-picked', event => {
    const {projectId,latitude,longitude} = event.detail || {};
    if (currentKind !== 'equipment' || projectId !== selectedProject() ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    selectedPosition = {latitude,longitude};
    showPosition();
    dialog.showModal();
    name.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!wrapper.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      toggle.focus();
    }
  });
  dialog.addEventListener('close', ()=>{
    cancelSearch();
    window.dispatchEvent(new CustomEvent('fiberapp:planner-address-modal-close',{}));
  });
  document.getElementById('project-item-close').addEventListener('click', () => dialog.close());
  document.getElementById('project-item-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const projectId = selectedProject();
    const label = currentKind === 'address' ? selectedAddress?.name : name.value.trim().replace(/\s+/g,' ');
    const noteText = note.value.trim();
    if (!canSave || !currentKind || !projectId || projectId !== currentProjectId) return;
    if (currentKind === 'address' && !selectedAddress) {
      error('Du må velge en offisiell vegadresse fra Kartverkets treffliste.');
      return;
    }
    if(currentKind==='address' && areaPending){
      error('Fullfør området ved å klikke første punkt, eller velg Nullstill område.');
      return;
    }
    if (!label || label.length > 120 || noteText.length > 300) {
      error('Navnet må ha 1–120 tegn, beskrivelse maks 300 tegn.');
      return;
    }
    if (currentKind === 'address' && rows.some(row =>
        row.projectId === projectId && row.kind === 'address' &&
        (row.addressKey === selectedAddress.addressKey ||
        (!row.addressKey && row.name.toLocaleLowerCase('nb-NO') === label.toLocaleLowerCase('nb-NO'))))) {
      error('Denne vegadressen finnes allerede i prosjektet.');
      return;
    }
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const next = [...rows, {
      id,projectId,kind:currentKind,name:label,
      note:noteText,
      equipmentType:currentKind === 'equipment' ? equipmentType.value : '',
      ...(currentKind === 'address'
        ? {
          addressKey:selectedAddress.addressKey,postcode:selectedAddress.postcode,
          poststed:selectedAddress.poststed,
          latitude:selectedAddress.latitude,longitude:selectedAddress.longitude,
          addressSource:'Kartverket',
          ...(selectedArea ? {area:selectedArea} : {})
        } : (selectedPosition || {})),
      createdAt:new Date().toISOString()
    }];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      rows = next;
      dialog.close();
      render();
      window.dispatchEvent(new CustomEvent('fiberapp:planner-items-changed', {
        detail: {projectId}
      }));
    } catch {
      error('Kunne ikke lagre. Kontroller nettleserlagringen.');
    }
  });
})();
