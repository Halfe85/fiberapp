import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(
  new URL('../src/components/maptools/map-tools.js',import.meta.url),'utf8'
);

class Button {
  constructor(kind,name) {
    this.attrs={[kind]:name};
    this.disabled=false;
  }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key,value) { this.attrs[key]=value; }
}

function setup(projectId='p',storage=new Map()) {
  const buttons=['inspect','box','manhole','underground','aerial']
    .map(name=>new Button('data-map-tool',name));
  const overlayInputs=['box','manhole','underground','aerial']
    .map(name=>Object.assign(new Button('data-map-overlay',name),{checked:true}));
  const finish=new Button('data-map-action','finish');
  const undo=new Button('data-map-action','undo');
  const hint={textContent:''};
  const events=new Map();
  const toolbar={
    querySelectorAll:selector=>selector==='[data-map-overlay]'?overlayInputs:buttons,
    querySelector:selector=>selector.includes('"finish"')?finish:
      selector.includes('"undo"')?undo:hint,
    addEventListener:(event,handler)=>events.set(event,handler),
    removeEventListener:(event)=>events.delete(event),
    contains:button=>[...buttons,finish,undo,...overlayInputs].includes(button),
    click:button=>events.get('click')?.({
      target:{closest:()=>button}
    }),
    change:(checkbox,checked)=>{
      checkbox.checked=checked;
      events.get('change')?.({target:{closest:()=>checkbox}});
    }
  };
  const keyboard=new Map(),feedback=[];
  const document={
    addEventListener:(event,handler)=>keyboard.set(event,handler),
    removeEventListener:event=>keyboard.delete(event)
  };
  const localStorage={
    getItem:key=>storage.get(key)??null,
    setItem:(key,value)=>storage.set(key,value)
  };
  const groups=[];
  let drawing=false;
  const map={
    addLayer:layer=>{layer.visible=true;return map},
    removeLayer:layer=>{layer.visible=false;return map},
    getContainer:()=>({classList:{
      toggle:(_name,enabled)=>drawing=enabled,
      remove:()=>drawing=false
    }})
  };
  const add=(type,coords,style)=>({
    addTo(group){group.items.push({type,coords,style});return this}
  });
  const L={
    layerGroup:()=>{
      const group={
        items:[],visible:false,
        addTo(map){map.addLayer(this);return this},
        clearLayers(){this.items=[]}
      };
      groups.push(group);
      return group;
    },
    divIcon:options=>options,
    marker:(coords,style)=>add('marker',coords,style),
    polyline:(coords,style)=>add('polyline',coords,style),
    circleMarker:(coords,style)=>add('circleMarker',coords,style),
    DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}}
  };
  const window={};
  runInNewContext(source,{window,document,localStorage});
  const api=window.FiberMapTools.create({
    map,L,projectId,container:toolbar,
    onFeedback:message=>feedback.push(message)
  });
  const button=name=>buttons.find(item=>item.getAttribute('data-map-tool')===name);
  const click=(lat,lng)=>api.handleMapClick({lat,lng});
  const features=()=>JSON.parse(JSON.stringify(api.getFeatures()));
  return {api,toolbar,button,click,features,storage,feedback,finish,undo,
    get layers(){return groups.flatMap(group=>group.items)},
    get visibleLayers(){return groups.filter(group=>group.visible).flatMap(group=>group.items)},
    overlay:type=>overlayInputs.find(input=>input.getAttribute('data-map-overlay')===type),
    escape:()=>keyboard.get('keydown')?.({key:'Escape'}),
    isCursorDrawing:()=>drawing
  };
}

test('placing boxes and manholes saves project-local infrastructure markers',()=>{
  const env=setup();
  assert.equal(env.click(59.9,10.7),false);
  env.toolbar.click(env.button('box'));
  assert.equal(env.button('box').getAttribute('aria-pressed'),'true');
  assert.equal(env.isCursorDrawing(),true);
  assert.equal(env.click(59.9,10.7),true);
  env.toolbar.click(env.button('manhole'));
  env.click(59.8,10.6);
  assert.deepEqual(env.features().map(feature=>feature.type),['box','manhole']);
  assert.equal(env.layers.length,2);
  assert.equal(env.layers.every(item=>item.type==='marker'),true);
  const saved=JSON.parse(env.storage.get('fiberapp.planner.mapdrawings.v1.p'));
  assert.equal(saved.version,1);
  assert.equal(saved.features.length,2);
  env.escape();
  assert.equal(env.api.isDrawing(),false);
  assert.equal(env.click(59.7,10.5),false);
});

test('underground and aerial routes connect successive points with distinct styles',()=>{
  const env=setup();
  env.api.selectTool('underground');
  env.click(59.1,10.1);
  env.click(59.2,10.2);
  env.click(59.3,10.3);
  assert.equal(env.features().length,1);
  assert.equal(env.features()[0].coords.length,3);
  assert.equal(env.layers[0].type,'polyline');
  assert.equal(env.layers[0].style.color,'#885323');
  assert.equal(env.layers[0].style.dashArray,undefined);

  env.toolbar.click(env.finish);
  assert.equal(env.finish.disabled,true);
  env.click(59.4,10.4);
  env.click(59.5,10.5);
  assert.equal(env.features().length,2);
  assert.equal(env.features()[1].coords.length,2);

  env.api.selectTool('aerial');
  env.click(59.6,10.6);
  env.click(59.7,10.7);
  assert.equal(env.features()[2].type,'aerial');
  assert.equal(env.layers[2].style.color,'#1678cd');
  assert.equal(env.layers[2].style.dashArray,'2 9');

  env.toolbar.click(env.undo);
  assert.equal(env.features()[2].coords.length,1);
  assert.equal(env.layers[2].type,'circleMarker');
  env.click(59.8,10.8);
  assert.equal(env.features()[2].coords.length,2);
});

test('saved drawings restore per project; other projects remain empty',()=>{
  const storage=new Map();
  const first=setup('first',storage);
  first.api.selectTool('box');
  first.click(60,11);
  const reopened=setup('first',storage);
  assert.equal(reopened.features().length,1);
  assert.equal(reopened.features()[0].coords[0][0],60);
  assert.equal(setup('second',storage).features().length,0);
});

test('rejects invalid map coordinates and malformed persisted data',()=>{
  const storage=new Map([['fiberapp.planner.mapdrawings.v1.bad','{not-json']]);
  const env=setup('bad',storage);
  assert.equal(env.features().length,0);
  assert.match(env.feedback[0],/kunne ikke leses/);
  env.api.selectTool('box');
  assert.equal(env.click(200,400),true);
  assert.equal(env.features().length,0);
  assert.equal(env.click(59.1,10.1),true);
  assert.equal(env.features().length,1);
  assert.equal(env.undo.disabled,false);
  env.api.undo();
  assert.equal(env.features().length,0);
});

test('each infrastructure and route overlay can hide independently without deleting features',()=>{
  const env=setup();
  env.api.selectTool('box'); env.click(59.1,10.1);
  env.api.selectTool('manhole'); env.click(59.2,10.2);
  env.api.selectTool('underground'); env.click(59.3,10.3); env.click(59.4,10.4);
  env.api.selectTool('aerial'); env.click(59.5,10.5); env.click(59.6,10.6);
  assert.equal(env.visibleLayers.length,4);
  env.toolbar.change(env.overlay('box'),false);
  env.toolbar.change(env.overlay('underground'),false);
  assert.equal(env.visibleLayers.length,2);
  assert.equal(env.features().length,4);
  assert.equal(env.overlay('box').checked,false);
  assert.equal(env.overlay('underground').checked,false);
  assert.equal(env.overlay('manhole').checked,true);
  assert.equal(env.overlay('aerial').checked,true);
});

test('overlay visibility is restored per project and a hidden drawing tool reveals its overlay',()=>{
  const storage=new Map();
  const first=setup('first',storage);
  first.toolbar.change(first.overlay('aerial'),false);
  first.toolbar.change(first.overlay('box'),false);
  const reopened=setup('first',storage);
  assert.equal(reopened.api.getOverlayVisibility().aerial,false);
  assert.equal(reopened.api.getOverlayVisibility().box,false);
  assert.equal(reopened.api.getOverlayVisibility().manhole,true);
  assert.equal(setup('second',storage).api.getOverlayVisibility().box,true);
  reopened.api.selectTool('aerial');
  assert.equal(reopened.api.getOverlayVisibility().aerial,true);
  assert.equal(reopened.overlay('aerial').checked,true);
  reopened.click(59.9,10.7);
  reopened.toolbar.change(reopened.overlay('aerial'),false);
  assert.equal(reopened.api.isDrawing(),false);
  assert.equal(reopened.features().length,1);
});
