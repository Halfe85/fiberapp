import {CommonModule} from '@angular/common';
import {AfterViewInit,Component,ElementRef,HostListener,Input,OnChanges,OnDestroy,SimpleChanges,ViewChild} from '@angular/core';

interface ProjectMapItem {
  id:string;
  projectId:string;
  kind:'address'|'equipment';
  name:string;
  latitude?:number;
  longitude?:number;
}
const ITEM_KEY='fiberapp.planner.items.v1';
const POSTCODE_API='https://api.kartverket.no/adresser/v1/sok';
const POSTCODE_PAGE_SIZE=50;
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
export class ProjectMapComponent implements AfterViewInit,OnChanges,OnDestroy {
  @Input({required:true}) projectId!:string;
  @Input() postcode='';
  @ViewChild('mapHost') mapHost!:ElementRef<HTMLElement>;
  @ViewChild('message') message!:ElementRef<HTMLElement>;
  private map:any=null;
  private pins:any=null;
  private picking=false;
  private destroyed=false;
  private postcodeRequest=0;
  private readonly postcodeCache=new Map<string,number[][]>();
  private readonly instruction='Naviger i kartet. Plasser adresser eller utstyr via + i headeren.';
  private onScriptLoad=()=>this.createMap();

  ngOnChanges(changes:SimpleChanges):void {
    if(this.map && (changes['postcode'] || changes['projectId'])){
      this.refreshPins(true);
      void this.focusPostcode();
    }
  }

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
    void this.focusPostcode();
    requestAnimationFrame(()=>this.map?.invalidateSize());
  }

  private async lookupPostcode(postcode:string):Promise<number[][]|null> {
    if(this.postcodeCache.has(postcode))return this.postcodeCache.get(postcode)!;
    async function page(side:number):Promise<any> {
      const params=new URLSearchParams({
        postnummer:postcode,
        treffPerSide:String(POSTCODE_PAGE_SIZE),
        side:String(side),
        utkoordsys:'4258'
      });
      const response=await fetch(POSTCODE_API+'?'+params.toString(),{
        headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Adresse-API feilet: '+response.status);
      return response.json();
    }
    const first=await page(0);
    if(!Array.isArray(first?.adresser) || first.adresser.length===0)return null;
    const total=Number(first?.metadata?.totaltAntallTreff)||0;
    const lastPage=Math.max(0,Math.ceil(Math.min(total,10000)/POSTCODE_PAGE_SIZE)-1);
    const pages=[...new Set([
      Math.floor(lastPage/4),Math.floor(lastPage/2),
      Math.floor(lastPage*3/4),lastPage
    ])].filter(n=>n>0);
    const results=await Promise.allSettled(pages.map(page));
    const addresses:any[]=[...first.adresser];
    for(const result of results){
      if(result.status==='fulfilled' && Array.isArray(result.value?.adresser)){
        addresses.push(...result.value.adresser);
      }
    }
    const coords:number[][]=addresses
      .map(item=>item?.representasjonspunkt)
      .filter(point=>point && Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
        Math.abs(point.lat)<=90 && Math.abs(point.lon)<=180)
      .map(point=>[point.lat,point.lon]);
    if(!coords.length)return null;
    const south=Math.min(...coords.map(p=>p[0])),north=Math.max(...coords.map(p=>p[0]));
    const west=Math.min(...coords.map(p=>p[1])),east=Math.max(...coords.map(p=>p[1]));
    const bounds=[[south,west],[north,east]];
    this.postcodeCache.set(postcode,bounds);
    return bounds;
  }
  private async focusPostcode():Promise<void> {
    const request=++this.postcodeRequest;
    const postcode=this.postcode;
    const id=this.projectId;
    if(!this.map || !/^[0-9]{4}$/.test(postcode))return;
    this.message.nativeElement.textContent='Finner kartutsnitt for postnummer '+postcode+' …';
    try{
      const bounds=await this.lookupPostcode(postcode);
      if(this.destroyed || request!==this.postcodeRequest ||
         id!==this.projectId || postcode!==this.postcode || !this.map || this.picking)return;
      if(!bounds){
        this.message.nativeElement.textContent='Ingen kartfestede vegadresser funnet for postnummer '+
          postcode+'. Du kan navigere manuelt i kartet.';
        return;
      }
      // Estimert geografisk område fra adresser, ikke den offisielle postnummergrensen.
      this.map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
      this.message.nativeElement.textContent='Kartet viser et omtrentlig utsnitt for postnummer '+
        postcode+'. Dette er ikke en fastsatt prosjektgrense.';
    }catch{
      if(this.destroyed || request!==this.postcodeRequest || id!==this.projectId)return;
      this.message.nativeElement.textContent='Kunne ikke slå opp postnummer '+postcode+
        ' hos Kartverket. Kartet kan brukes manuelt.';
    }
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
    // A delayed address lookup must not override the user picking an exact location.
    this.postcodeRequest++;
    this.mapHost.nativeElement.classList.add('picking-position');
    this.message.nativeElement.textContent='Klikk eller trykk i kartet der punktet skal plasseres.';
    this.mapHost.nativeElement.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  @HostListener('window:fiberapp:planner-items-changed')
  onItemsChanged():void {this.refreshPins(false);}

  ngOnDestroy():void {
    this.destroyed=true;
    this.postcodeRequest++;
    if(typeof document!=='undefined'){
      const script=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
      script?.removeEventListener('load',this.onScriptLoad);
    }
    this.map?.remove();
    this.map=null;
  }
}
