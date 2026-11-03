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
    closeMenu();
    if (!currentProjectId && dialog.open) dialog.close();
    for (const kind of ['address', 'equipment']) {
      const target = sections[kind];
      target.list.replaceChildren();
      const found = rows.filter(item => item.projectId === currentProjectId && item.kind === kind);
      target.section.hidden = !found.length;
      for (const item of found) {
        const article = document.createElement('article');
        article.className = 'project-item';
        const strong = document.createElement('strong');
        strong.textContent = item.name;
        article.append(strong);
        if (kind === 'equipment' && item.equipmentType) {
          const type = document.createElement('span');
          type.className = 'project-item-type';
          type.textContent = item.equipmentType;
          article.append(type);
        }
        if (kind === 'address' && (item.area || item.parcel)) {
          const area = item.area || item.parcel;
          const areaInfo = document.createElement('span');
          areaInfo.className = 'project-item-parcel';
          areaInfo.textContent = (area.kind === 'building' ? 'Bygg' : 'Tomt') +
            (area.propertyLabel ? ': ' + area.propertyLabel : ': tegnet område');
          article.append(areaInfo);
        }
        if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
          const location = document.createElement('span');
          location.className = 'project-item-position';
          location.textContent = 'Kartposisjon registrert';
          article.append(location);
        }
        if (item.note) {
          const detail = document.createElement('p');
          detail.textContent = item.note;
          article.append(detail);
        }
        target.list.append(article);
      }
    }
    itemsContainer.hidden = !currentProjectId ||
      (sections.address.section.hidden && sections.equipment.section.hidden);
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

  toggle.addEventListener('click', () => {
    if (!canSave || !selectedProject()) return;
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.getElementById('add-address').addEventListener('click', () => openModal('address'));
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
