import {CommonModule} from '@angular/common';
import {
  AfterViewInit,Component,ElementRef,EventEmitter,Input,OnChanges,OnDestroy,
  Output,SimpleChanges,ViewChild
} from '@angular/core';

export interface MapAddress {
  name:string;
  latitude:number;
  longitude:number;
}
export interface SelectedArea {
  kind:'parcel'|'building';
  source:'manual'|'kartverket';
  geometry:{type:'Polygon'|'MultiPolygon';coordinates:unknown[]};
  propertyId?:string;
  propertyLabel?:string;
}
type DrawMode='parcel'|'building'|'official'|null;
type Point={lat:number;lng:number};
const TILE='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
const PARCEL_API='https://api.kartverket.no/eiendom/v1/punkt/omrader';

@Component({
  selector:'app-address-area-map',
  standalone:true,
  imports:[CommonModule],
  template:`
    <section class="address-area-panel" aria-label="Velg bygning eller tomt">
      <div class="address-area-heading">
        <strong>Bygg / tomt</strong>
        <span>Velg området som hører til adressen</span>
      </div>
      <div class="address-area-tools" role="group" aria-label="Kartverktøy">
        <button type="button" [disabled]="!address"
                [attr.aria-pressed]="mode==='official'"
                (click)="setMode('official')">Bruk tomt (én adresse)</button>
        <button type="button" [disabled]="!address"
                [attr.aria-pressed]="mode==='building'"
                (click)="setMode('building')">Tegn bygg</button>
        <button type="button" [disabled]="!address"
                [attr.aria-pressed]="mode==='parcel'"
                (click)="setMode('parcel')">Tegn tomt</button>
      </div>
      <div class="address-area-map" #mapHost role="region"
           [class.is-drawing]="mode==='parcel'||mode==='building'"
           aria-label="Detaljkart for valgt adresse"></div>
      <p class="address-area-instruction" role="status" aria-live="polite">{{status}}</p>
      <div class="address-area-edit">
        <button type="button" [disabled]="!points.length || (mode!=='parcel' && mode!=='building')"
                (click)="undoPoint()">Angre punkt</button>
        <button type="button" [disabled]="!selectedArea && !points.length && mode!=='official'"
                (click)="resetArea()">Nullstill område</button>
      </div>
      <p class="address-area-hint">
        Bruk hele tomten bare når den gjelder én vegadresse. Ellers tegn bygget eller den delen
        som hører til adressen. Klikk første punkt for å lukke en tegning.
      </p>
    </section>
  `
})
export class AddressAreaMapComponent implements AfterViewInit,OnChanges,OnDestroy {
  @Input() address:MapAddress|null=null;
  @Output() areaChanged=new EventEmitter<SelectedArea|null>();
  @ViewChild('mapHost') mapHost!:ElementRef<HTMLElement>;
  status='Velg en vegadresse til venstre for å vise kartet.';
  mode:DrawMode=null;
  points:Point[]=[];
  selectedArea:SelectedArea|null=null;

  private map:any=null;
  private candidates:any=null;
  private draft:any=null;
  private saved:any=null;
  private addressMarker:any=null;
  private viewReady=false;
  private destroyed=false;
  private lookupToken=0;
  private controller:AbortController|null=null;
  private onLeafletLoad=()=>this.showAddress();

  ngAfterViewInit():void {
    this.viewReady=true;
    if(this.address)this.showAddress();
  }
  ngOnChanges(changes:SimpleChanges):void {
    if(changes['address'] && this.viewReady)this.showAddress();
  }
  ngOnDestroy():void {
    this.destroyed=true;
    this.abortLookup();
    if(typeof document!=='undefined'){
      const script=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
      script?.removeEventListener('load',this.onLeafletLoad);
    }
    this.map?.remove();
    this.map=null;
  }

  private abortLookup():void {
    this.lookupToken++;
    this.controller?.abort();
    this.controller=null;
  }
  private clearLayers():void {
    this.candidates?.clearLayers();
    this.draft?.clearLayers();
    this.saved?.clearLayers();
  }
  private clearArea(emit=true):void {
    this.points=[];
    this.selectedArea=null;
    this.clearLayers();
    if(emit)this.areaChanged.emit(null);
  }
  private ensureMap():boolean {
    if(this.map)return true;
    const L=(window as any).L;
    if(!L){
      const script=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
      if(script)script.addEventListener('load',this.onLeafletLoad,{once:true});
      this.status='Kartet kunne ikke lastes ennå. Kontroller internettforbindelsen.';
      return false;
    }
    this.map=L.map(this.mapHost.nativeElement,{
      zoomControl:true,scrollWheelZoom:true,doubleClickZoom:false
    });
    L.tileLayer(TILE,{
      attribution:'&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener noreferrer">Kartverket</a>',
      minZoom:3,maxZoom:20,maxNativeZoom:18
    }).addTo(this.map);
    this.candidates=L.layerGroup().addTo(this.map);
    this.draft=L.layerGroup().addTo(this.map);
    this.saved=L.layerGroup().addTo(this.map);
    this.map.setView([64,11],5);
    this.map.on('click',(event:any)=>{
      if(this.mode!=='parcel' && this.mode!=='building')return;
      if(this.points.length>=100){
        this.status='Maks 100 hjørner per område. Avslutt ved å trykke første punkt.';
        return;
      }
      const lat=event.latlng?.lat,lng=event.latlng?.lng;
      if(!Number.isFinite(lat) || !Number.isFinite(lng))return;
      if(this.points.some(p=>Math.abs(p.lat-lat)<1e-8 && Math.abs(p.lng-lng)<1e-8)){
        this.status='Punktet finnes allerede. Trykk første grønne punkt for å lukke området.';
        return;
      }
      this.points.push({lat,lng});
      this.redrawDraft();
    });
    return true;
  }
  private showAddress():void {
    this.abortLookup();
    this.mode=null;
    this.clearArea(true);
    if(this.addressMarker && this.map){
      this.map.removeLayer(this.addressMarker);
      this.addressMarker=null;
    }
    if(!this.address){
      this.status='Velg en vegadresse til venstre for å vise kartet.';
      return;
    }
    if(!this.ensureMap())return;
    const address=this.address;
    this.map.invalidateSize({pan:false});
    this.map.setView([address.latitude,address.longitude],18);
    const L=(window as any).L;
    this.addressMarker=L.circleMarker([address.latitude,address.longitude],{
      radius:6,color:'#fff',weight:2,fillColor:'#185eae',fillOpacity:1
    }).bindTooltip(address.name).addTo(this.map);
    this.status='Adresse funnet. Velg tomt ved én adresse, eller tegn bygg/tomt punkt for punkt.';
    requestAnimationFrame(()=>{
      if(!this.destroyed)this.map?.invalidateSize({pan:false});
    });
  }
  setMode(mode:Exclude<DrawMode,null>):void {
    if(!this.address || !this.map)return;
    this.abortLookup();
    this.mode=mode;
    this.clearArea();
    if(mode==='official'){
      this.status='Henter registrerte tomtegrenser. Bruk hele tomten bare ved én vegadresse.';
      void this.loadParcels();
    }else{
      this.status='Klikk hjørnene ett etter ett. Klikk første punkt for å lukke '+
        (mode==='building'?'bygget.':'tomten.');
    }
  }
  undoPoint():void {
    if(!this.points.length)return;
    this.points.pop();
    this.redrawDraft();
  }
  resetArea():void {
    this.abortLookup();
    this.mode=null;
    this.clearArea();
    this.status=this.address?'Området er nullstilt. Velg et nytt verktøy.':
      'Velg først en vegadresse.';
  }
  private redrawDraft():void {
    if(!this.draft)return;
    this.draft.clearLayers();
    const L=(window as any).L;
    if(this.points.length>=2){
      L.polyline(this.points,{color:'#dc721a',weight:3,
        dashArray:'6,5',interactive:false}).addTo(this.draft);
    }
    this.points.forEach((p,i)=>{
      const first=i===0;
      const marker=L.circleMarker([p.lat,p.lng],{
        radius:first?11:6,color:first?'#186b49':'#fff',weight:3,
        fillColor:first?'#58c68a':'#dc721a',fillOpacity:1,interactive:first
      }).addTo(this.draft);
      if(first){
        marker.on('click',(event:any)=>{
          if(L.DomEvent?.stopPropagation)L.DomEvent.stopPropagation(event);
          this.finish();
        });
      }
    });
    this.status=this.points.length>=3
      ? this.points.length+' punkter. Klikk det første grønne punktet for å lukke polygonet.'
      : this.points.length+' punkt'+(this.points.length===1?'':'er')+'. Sett minst tre hjørner.';
  }
  private cross(a:Point,b:Point,c:Point):number {
    return (b.lng-a.lng)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lng-a.lng);
  }
  private validPolygon(points:Point[]):boolean {
    if(points.length<3)return false;
    let twiceArea=0;
    for(let i=0;i<points.length;i++){
      const p=points[i],q=points[(i+1)%points.length];
      twiceArea+=p.lng*q.lat-q.lng*p.lat;
      for(let j=i+1;j<points.length;j++){
        const next=(i+1)%points.length,otherNext=(j+1)%points.length;
        if(j===i || j===next || otherNext===i)continue;
        if(this.cross(points[i],points[next],points[j])*
           this.cross(points[i],points[next],points[otherNext])<0 &&
           this.cross(points[j],points[otherNext],points[i])*
           this.cross(points[j],points[otherNext],points[next])<0)return false;
      }
    }
    return Math.abs(twiceArea)>1e-11;
  }
  private finish():void {
    if(this.mode!=='parcel' && this.mode!=='building')return;
    if(this.points.length<3){
      this.status='Et område må ha minst tre punkter.';
      return;
    }
    if(!this.validPolygon(this.points)){
      this.status='Punktene krysser hverandre eller området er for lite. Angre eller rett opp tegningen.';
      return;
    }
    const ring=this.points.map(p=>[p.lng,p.lat]);
    ring.push([...ring[0]]);
    this.selectedArea={
      kind:this.mode,source:'manual',
      geometry:{type:'Polygon',coordinates:[ring]}
    };
    this.mode=null;
    this.points=[];
    this.draft.clearLayers();
    this.showSaved();
    this.status=(this.selectedArea.kind==='building'?'Bygget':'Tomten')+
      ' er lukket og klar til å lagres med adressen.';
    this.areaChanged.emit(this.selectedArea);
  }
  private showSaved():void {
    if(!this.map || !this.saved)return;
    this.saved.clearLayers();
    if(!this.selectedArea?.geometry)return;
    const area=this.selectedArea,L=(window as any).L;
    L.geoJSON({type:'Feature',properties:{},geometry:area.geometry},{
      style:{
        color:area.kind==='building'?'#d27015':'#217a51',weight:3,
        fillColor:area.kind==='building'?'#f4aa50':'#67bc8b',
        fillOpacity:.28,interactive:false
      }
    }).addTo(this.saved);
  }
  private async loadParcels():Promise<void> {
    const address=this.address;
    if(!address || !this.map || !this.candidates)return;
    const token=++this.lookupToken;
    const controller=new AbortController();
    this.controller=controller;
    const params=new URLSearchParams({
      nord:String(address.latitude),ost:String(address.longitude),
      koordsys:'4258',utkoordsys:'4258',radius:'100',maksTreff:'40'
    });
    try{
      const response=await fetch(PARCEL_API+'?'+params.toString(),{
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket eiendom: '+response.status);
      const result:unknown=await response.json();
      if(this.destroyed || token!==this.lookupToken ||
         this.mode!=='official' || this.address!==address)return;
      const features=(result as {features?:unknown[]})?.features;
      const L=(window as any).L;
      let count=0;
      for(const value of Array.isArray(features)?features:[]){
        if(!value || typeof value!=='object')continue;
        const feature=value as {
          geometry?:{type:'Polygon'|'MultiPolygon';coordinates:unknown[]};
          properties?:{matrikkelnummertekst?:unknown;lokalid?:unknown}
        };
        const geometry=feature.geometry;
        if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type) ||
           !Array.isArray(geometry.coordinates) || JSON.stringify(geometry).length>150000)continue;
        const label=String(feature.properties?.matrikkelnummertekst||
          'Eiendom '+(count+1)).slice(0,120);
        const propertyId=feature.properties?.lokalid==null
          ? '':String(feature.properties.lokalid);
        try{
          const layer=L.geoJSON(value,{
            style:{color:'#0a7ab2',weight:2,fillColor:'#64beea',fillOpacity:.16}
          });
          layer.eachLayer((path:any)=>{
            path.on('mouseover',()=>path.setStyle({
              color:'#e98b17',weight:4,fillOpacity:.33
            }));
            path.on('mouseout',()=>path.setStyle({
              color:'#0a7ab2',weight:2,fillOpacity:.16
            }));
            path.on('click',()=>{
              if(this.mode!=='official')return;
              this.selectedArea={
                kind:'parcel',source:'kartverket',
                propertyId,propertyLabel:label,geometry
              };
              this.abortLookup();
              this.mode=null;
              this.candidates.clearLayers();
              this.showSaved();
              this.status='Valgt tomt: '+label+'. Bekreft at den gjelder bare denne vegadressen.';
              this.areaChanged.emit(this.selectedArea);
            });
          });
          layer.addTo(this.candidates);
          count++;
        }catch{/* Invalid features must not break drawing. */}
      }
      this.status=count
        ? 'Velg en blå tomt ('+count+' forslag). Bare for tomter med én vegadresse.'
        : 'Ingen registrerte tomteflater funnet. Bruk Tegn bygg eller Tegn tomt.';
    }catch{
      if(controller.signal.aborted || token!==this.lookupToken)return;
      this.status='Kunne ikke hente tomtegrenser. Du kan fortsatt tegne manuelt.';
    }
  }
}
