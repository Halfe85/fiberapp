/* Fiber Planner drawing tools: project-scoped infrastructure markers and routes. */
(() => {
  'use strict';

  const STORAGE_PREFIX = 'fiberapp.planner.mapdrawings.v1.';
  const OVERLAY_STORAGE_PREFIX = 'fiberapp.planner.maplayers.v1.';
  const OVERLAY_TYPES = ['box', 'manhole', 'underground', 'aerial'];
  const POINT_TOOLS = new Set(['box', 'manhole']);
  const ROUTE_TOOLS = new Set(['underground', 'aerial']);
  const TOOLS = new Set(['inspect', ...POINT_TOOLS, ...ROUTE_TOOLS]);
  const MAX_FEATURES = 2000;
  const MAX_VERTICES = 20000;
  const ROUTE_STYLE = {
    underground: {color: '#885323', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false},
    aerial: {color: '#1678cd', weight: 4, opacity: 1, dashArray: '2 9', lineCap: 'round', lineJoin: 'round', interactive: false}
  };
  const ICONS = {
    box: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="5" width="24" height="23" rx="4" fill="#fff" stroke="#254c64" stroke-width="2.7"/><path d="M9 12h14M16 13v10" fill="none" stroke="#254c64" stroke-width="2.2"/></svg>',
    manhole: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#fff" stroke="#334f63" stroke-width="3"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#334f63" stroke-width="1.7"/></svg>'
  };
  const HINTS = {
    inspect: 'Klikk på kartet for adresseoppslag.',
    box: 'Klikk i kartet for å plassere et skap.',
    manhole: 'Klikk i kartet for å plassere en kum.',
    underground: 'Klikk flere punkter for en brun trasé.',
    aerial: 'Klikk flere punkter for en blå stiplet trasé.'
  };

  function validPoint(point) {
    return Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
  }

  function readFeatures(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.features)) {
      throw Error('Ukjent tegningsformat');
    }
    const features = [];
    let vertices = 0;
    for (const item of parsed.features) {
      if (!item || !POINT_TOOLS.has(item.type) && !ROUTE_TOOLS.has(item.type) ||
          !Array.isArray(item.coords) || !item.coords.length ||
          !item.coords.every(validPoint) ||
          (POINT_TOOLS.has(item.type) && item.coords.length !== 1)) continue;
      vertices += item.coords.length;
      if (features.length >= MAX_FEATURES || vertices > MAX_VERTICES) break;
      features.push({
        id: typeof item.id === 'string' ? item.id : '',
        type: item.type,
        coords: item.coords.map(point => [...point])
      });
    }
    return features;
  }

  function clone(features) {
    return features.map(feature => ({
      id: feature.id, type: feature.type,
      coords: feature.coords.map(point => [...point])
    }));
  }

  function create({map, L, projectId, container, overlayContainer = container, onFeedback = () => {}}) {
    if (!map || !L || !projectId || !container) return null;
    const key = STORAGE_PREFIX + projectId;
    const overlayKey = OVERLAY_STORAGE_PREFIX + projectId;
    const layers = Object.fromEntries(OVERLAY_TYPES.map(type => [type, L.layerGroup().addTo(map)]));
    const visible = Object.fromEntries(OVERLAY_TYPES.map(type => [type, true]));
    const overlayInputs = [...overlayContainer.querySelectorAll('[data-map-overlay]')];
    const layerToggle = overlayContainer.querySelector('[data-map-layer-toggle]');
    const layerPanel = overlayContainer.querySelector('.map-overlays');
    const iconImage = overlayContainer.querySelector('.map-layer-icon-image');
    const onIconError = () => { if (iconImage) iconImage.hidden = true; };
    iconImage?.addEventListener('error', onIconError);
    let layerPanelOpen = false;
    const buttons = [...container.querySelectorAll('[data-map-tool]')];
    const finishButton = container.querySelector('[data-map-action="finish"]');
    const undoButton = container.querySelector('[data-map-action="undo"]');
    const hint = container.querySelector('.map-tools-hint');
    let features = [];
    let mode = 'inspect';
    let activeRouteIndex = null;
    const history = [];
    let nextId = 0;

    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) features = readFeatures(stored);
    } catch {
      onFeedback('Lagrede karttegninger kunne ikke leses. Nye tegninger vises bare i denne økten til de lagres.');
    }

    try {
      const stored = localStorage.getItem(overlayKey);
      if (stored !== null) {
        const settings = JSON.parse(stored);
        if (settings && settings.version === 1 && settings.visible &&
            typeof settings.visible === 'object') {
          for (const type of OVERLAY_TYPES) {
            if (typeof settings.visible[type] === 'boolean') visible[type] = settings.visible[type];
          }
        }
      }
    } catch {
      // Invalid visibility settings do not affect saved drawings.
    }
    for (const type of OVERLAY_TYPES) {
      if (!visible[type]) map.removeLayer(layers[type]);
    }

    const feedback = message => { onFeedback(message); };
    const makeId = () => 'draw-' + Date.now().toString(36) + '-' + (++nextId).toString(36);
    const vertexCount = () => features.reduce((total, feature) => total + feature.coords.length, 0);

    function render() {
      for (const layer of Object.values(layers)) layer.clearLayers();
      for (const feature of features) {
        const layer = layers[feature.type];
        if (POINT_TOOLS.has(feature.type)) {
          const icon = L.divIcon({
            className: 'fp-drawing-icon fp-drawing-icon--' + feature.type,
            html: ICONS[feature.type], iconSize: [32, 32], iconAnchor: [16, 16]
          });
          L.marker(feature.coords[0], {icon, interactive: false, keyboard: false}).addTo(layer);
        } else {
          const style = ROUTE_STYLE[feature.type];
          if (feature.coords.length >= 2) {
            L.polyline(feature.coords, style).addTo(layer);
          } else {
            L.circleMarker(feature.coords[0], {
              radius: 5, color: style.color, weight: 3,
              fillColor: '#fff', fillOpacity: 1, interactive: false
            }).addTo(layer);
          }
        }
      }
    }

    function persist() {
      try {
        localStorage.setItem(key, JSON.stringify({version: 1, features}));
      } catch {
        feedback('Karttegningen vises, men kunne ikke lagres i nettleseren.');
      }
    }

    function persistVisibility() {
      try {
        localStorage.setItem(overlayKey, JSON.stringify({version: 1, visible}));
      } catch {
        feedback('Kartlagene kunne ikke lagres i nettleseren.');
      }
    }

    function setOverlayVisible(type, enabled) {
      if (!OVERLAY_TYPES.includes(type)) return;
      const next = Boolean(enabled);
      if (visible[type] === next) return;
      visible[type] = next;
      if (next) layers[type].addTo(map);
      else map.removeLayer(layers[type]);
      if (!next && mode === type) {
        mode = 'inspect';
        activeRouteIndex = null;
      }
      persistVisibility();
      updateUi();
    }

    function updateUi() {
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-map-tool') === mode));
      }
      if (finishButton) finishButton.disabled = activeRouteIndex === null;
      if (undoButton) undoButton.disabled = history.length === 0;
      if (hint) hint.textContent = HINTS[mode];
      for (const checkbox of overlayInputs) {
        const type = checkbox.getAttribute('data-map-overlay');
        if (OVERLAY_TYPES.includes(type)) checkbox.checked = visible[type];
      }
      map.getContainer?.().classList.toggle('map-is-drawing', mode !== 'inspect');
    }

    function checkpoint() {
      history.push({features: clone(features), activeRouteIndex});
      if (history.length > 100) history.shift();
    }

    function selectTool(tool) {
      if (!TOOLS.has(tool)) return;
      mode = mode === tool && tool !== 'inspect' ? 'inspect' : tool;
      activeRouteIndex = null; // Switching tools always starts a new route.
      if (mode !== 'inspect' && !visible[mode]) setOverlayVisible(mode, true);
      updateUi();
      feedback(HINTS[mode]);
    }

    function finishRoute() {
      if (activeRouteIndex === null) return;
      activeRouteIndex = null;
      updateUi();
      feedback('Strekningen er avsluttet. Neste klikk starter en ny strekning.');
    }

    function undo() {
      const previous = history.pop();
      if (!previous) return;
      features = previous.features;
      activeRouteIndex = previous.activeRouteIndex;
      if (activeRouteIndex !== null &&
          (!features[activeRouteIndex] || features[activeRouteIndex].type !== mode)) {
        activeRouteIndex = null;
      }
      render();
      persist();
      updateUi();
      feedback('Siste kartpunkt er angret.');
    }

    function handleMapClick(position) {
      if (mode === 'inspect') return false;
      if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) ||
          Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) return true;
      if (vertexCount() >= MAX_VERTICES || (activeRouteIndex === null && features.length >= MAX_FEATURES)) {
        feedback('Kartet har nådd grensen for antall tegnede objekter.');
        return true;
      }
      checkpoint();
      const point = [position.lat, position.lng];
      if (POINT_TOOLS.has(mode)) {
        features.push({id: makeId(), type: mode, coords: [point]});
        feedback(mode === 'box' ? 'Skap plassert i kartet.' : 'Kum plassert i kartet.');
      } else if (ROUTE_TOOLS.has(mode)) {
        if (activeRouteIndex === null) {
          activeRouteIndex = features.length;
          features.push({id: makeId(), type: mode, coords: [point]});
          feedback('Startpunkt lagt til. Klikk neste punkt for å tegne linje.');
        } else {
          features[activeRouteIndex].coords.push(point);
          feedback('Nytt trasépunkt lagt til.');
        }
      }
      render();
      persist();
      updateUi();
      return true;
    }

    function onClick(event) {
      const button = event.target.closest?.('button[data-map-tool],button[data-map-action]');
      if (!button || !container.contains(button)) return;
      const tool = button.getAttribute('data-map-tool');
      const action = button.getAttribute('data-map-action');
      if (tool) selectTool(tool);
      else if (action === 'finish') finishRoute();
      else if (action === 'undo') undo();
    }

    function onOverlayChange(event) {
      const checkbox = event.target.closest?.('input[data-map-overlay]');
      if (!checkbox || !overlayContainer.contains(checkbox)) return;
      setOverlayVisible(checkbox.getAttribute('data-map-overlay'), checkbox.checked);
    }

    function setLayerPanelOpen(open) {
      layerPanelOpen = Boolean(open);
      if (layerPanel) layerPanel.hidden = !layerPanelOpen;
      layerToggle?.setAttribute('aria-expanded', String(layerPanelOpen));
      layerToggle?.setAttribute('aria-label', layerPanelOpen ? 'Skjul kartlag' : 'Vis kartlag');
    }

    function onLayerClick(event) {
      const toggle = event.target.closest?.('[data-map-layer-toggle]');
      if (!toggle || !overlayContainer.contains(toggle)) return;
      setLayerPanelOpen(!layerPanelOpen);
    }

    function onOutsidePointerDown(event) {
      if (layerPanelOpen && !overlayContainer.contains(event.target)) setLayerPanelOpen(false);
    }

    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      if (layerPanelOpen) setLayerPanelOpen(false);
      else if (mode !== 'inspect') selectTool('inspect');
    }

    L.DomEvent?.disableClickPropagation(container);
    L.DomEvent?.disableScrollPropagation(container);
    if (overlayContainer !== container) {
      L.DomEvent?.disableClickPropagation(overlayContainer);
      L.DomEvent?.disableScrollPropagation(overlayContainer);
    }
    container.addEventListener('click', onClick);
    overlayContainer.addEventListener('click', onLayerClick);
    overlayContainer.addEventListener('change', onOverlayChange);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onOutsidePointerDown);
    render();
    updateUi();
    setLayerPanelOpen(false);

    return {
      handleMapClick, selectTool, finishRoute, undo, setOverlayVisible, setLayerPanelOpen,
      isLayerPanelOpen: () => layerPanelOpen,
      isDrawing: () => mode !== 'inspect',
      getFeatures: () => clone(features),
      getOverlayVisibility: () => ({...visible}),
      destroy: () => {
        container.removeEventListener('click', onClick);
        overlayContainer.removeEventListener('click', onLayerClick);
        overlayContainer.removeEventListener('change', onOverlayChange);
        iconImage?.removeEventListener('error', onIconError);
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('pointerdown', onOutsidePointerDown);
        for (const layer of Object.values(layers)) map.removeLayer(layer);
        map.getContainer?.().classList.remove('map-is-drawing');
      }
    };
  }

  window.FiberMapTools = {create};
})();
