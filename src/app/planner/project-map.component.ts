import {CommonModule} from '@angular/common';
import {AfterViewInit,Component,ElementRef,HostListener,Input,OnDestroy,ViewChild} from '@angular/core';

interface ProjectMapItem {
  id:string;
  projectId:string;
  kind:'address'|'equipment';
  name:string;
  latitude?:number;
  longitude?:number;
}
const ITEM_KEY='fiberapp.planner.items.v1';
const KARTVERKET_WMTS='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';

@Component({
  selector:'app-project-map',
  standalone:true,
  imports:[CommonModule],
  template:`
    <section class="planner-map-section" aria-labelledby="ng-planner-map-heading">
      <div class="planner-map-header">
        <h3 id="ng-planner-map-heading">Kart</h3>
        <span>Topografisk kart fra Kartverket</span>
      </div>
      <div class="planner-map" #mapHost role="region" aria-label="Prosjektkart"></div>
      <p class="planner-map-message" role="status" #message>
        Naviger i kartet. Plasser adresser eller utstyr via + i headeren.
      </p>
    </section>
  `
})
export class ProjectMapComponent implements AfterViewInit,OnDestroy {
  @Input({required:true}) projectId!:string;
  @ViewChild('mapHost') mapHost!:ElementRef<HTMLElement>;
  @ViewChild('message') message!:ElementRef<HTMLElement>;
  private map:any=null;
  private pins:any=null;
  private picking=false;
  private destroyed=false;
  private readonly instruction='Naviger i kartet. Plasser adresser eller utstyr via + i headeren.';
  private onScriptLoad=()=>this.createMap();

  ngAfterViewInit():void {
    if(typeof window==='undefined')return;
    if((window as any).L){
      this.createMap();
      return;
    }
    const script=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
    if(script){
      script.addEventListener('load',this.onScriptLoad,{once:true});
      script.addEventListener('error',()=>{
        if(!this.destroyed)this.message.nativeElement.textContent='Kartbiblioteket kunne ikke lastes.';
      },{once:true});
    }else{
      this.message.nativeElement.textContent='Kartbiblioteket ble ikke funnet.';
    }
  }

  private createMap():void {
    if(this.destroyed || this.map || !(window as any).L)return;
    const L=(window as any).L;
    this.map=L.map(this.mapHost.nativeElement,{zoomControl:true,scrollWheelZoom:true});
    L.tileLayer(KARTVERKET_WMTS,{
      attribution:'&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener noreferrer">Kartverket</a>',
      minZoom:3,maxZoom:19,maxNativeZoom:18
    }).addTo(this.map);
    this.pins=L.layerGroup().addTo(this.map);
    this.map.on('click',(event:any)=>{
      if(!this.picking)return;
      this.picking=false;
      this.mapHost.nativeElement.classList.remove('picking-position');
      this.message.nativeElement.textContent=this.instruction;
      window.dispatchEvent(new CustomEvent('fiberapp:planner-map-picked',{
        detail:{projectId:this.projectId,latitude:event.latlng.lat,longitude:event.latlng.lng}
      }));
    });
    this.refreshPins(true);
    requestAnimationFrame(()=>this.map?.invalidateSize());
  }

  private refreshPins(fit:boolean):void {
    if(!this.map || !this.pins)return;
    this.pins.clearLayers();
    let parsed:unknown=[];
    try {
      const raw=localStorage.getItem(ITEM_KEY);
      parsed=raw?JSON.parse(raw):[];
    }catch{
      this.message.nativeElement.textContent='Kunne ikke lese lagrede kartpunkter.';
      return;
    }
    if(!Array.isArray(parsed))return;
    const L=(window as any).L;
    const bounds:number[][]=[];
    for(const value of parsed as ProjectMapItem[]){
      if(!value || value.projectId!==this.projectId ||
         !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude))continue;
      const latitude=value.latitude as number,longitude=value.longitude as number;
      if(Math.abs(latitude)>90 || Math.abs(longitude)>180)continue;
      const dot=L.circleMarker([latitude,longitude],{
        radius:8,color:'#fff',weight:2,
        fillColor:value.kind==='address'?'#1a6dab':'#d47c16',fillOpacity:1
      });
      const popup=document.createElement('div');
      const label=document.createElement('strong');
      label.textContent=value.name;
      const type=document.createElement('p');
      type.textContent=value.kind==='address'?'Adresse':'Utstyr';
      popup.append(label,type);
      dot.bindPopup(popup).addTo(this.pins);
      bounds.push([latitude,longitude]);
    }
    if(fit){
      if(bounds.length===1)this.map.setView(bounds[0],14);
      else if(bounds.length>1)this.map.fitBounds(bounds,{padding:[40,40],maxZoom:15});
      else this.map.setView([64,11],5);
    }
  }

  @HostListener('window:fiberapp:planner-map-select-start',['$event'])
  onSelectStart(event:Event):void {
    const detail=(event as CustomEvent<{projectId:string}>).detail;
    if(detail?.projectId!==this.projectId)return;
    if(!this.map){
      this.message.nativeElement.textContent='Kartet er ikke klart for å velge posisjon.';
      return;
    }
    this.picking=true;
    this.mapHost.nativeElement.classList.add('picking-position');
    this.message.nativeElement.textContent='Klikk eller trykk i kartet der punktet skal plasseres.';
    this.mapHost.nativeElement.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  @HostListener('window:fiberapp:planner-items-changed')
  onItemsChanged():void {this.refreshPins(false);}

  ngOnDestroy():void {
    this.destroyed=true;
    if(typeof document!=='undefined'){
      const script=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
      script?.removeEventListener('load',this.onScriptLoad);
    }
    this.map?.remove();
    this.map=null;
  }
}
