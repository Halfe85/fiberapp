import {CommonModule} from '@angular/common';
import {AfterViewInit,Component,ElementRef,HostListener,Input,OnChanges,OnDestroy,SimpleChanges,ViewChild} from '@angular/core';

interface ProjectMapItem {
  id:string;
  projectId:string;
  kind:'address'|'equipment';
  name:string;
  latitude?:number;
  longitude?:number;
  parcel?:{propertyId:string;propertyLabel:string;
    geometry:{type:'Polygon'|'MultiPolygon';coordinates:unknown[]}};
  area?:{kind:'building'|'parcel';source:'manual'|'kartverket';
    propertyId?:string;propertyLabel?:string;
    geometry:{type:'Polygon'|'MultiPolygon';coordinates:unknown[]}};
}
const ITEM_KEY='fiberapp.planner.items.v1';
const POSTCODE_API='https://api.kartverket.no/adresser/v1/sok';
const PARCEL_API='https://api.kartverket.no/eiendom/v1/punkt/omrader';
const POSTCODE_PAGE_SIZE=50;
const KARTVERKET_WMTS='https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';

@Component({
  selector:'app-project-map',
  standalone:true,
  imports:[CommonModule],
  template:`
    <section class="planner-map-section" aria-label="Prosjektkart">
      <div class="planner-parcel-toolbar" *ngIf="selectingParcel">
        <span role="status" aria-live="polite">{{parcelStatus}}</span>
        <button type="button" class="secondary" (click)="stopParcelSelection(true)">Avbryt tomtevalg</button>
      </div>
      <div class="planner-map" #mapHost role="region" aria-label="Kartverket prosjektkart"></div>
      <p class="planner-map-message" role="status" aria-live="polite" #message></p>
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
  private savedParcels:any=null;
  private parcelCandidates:any=null;
  selectingParcel=false;
  parcelStatus='';
  private parcelToken=0;
  private picking=false;
  private destroyed=false;
  private postcodeRequest=0;
  private lastAddressSignature='[]';
  private readonly postcodeCache=new Map<string,number[][]>();
  private readonly instruction='Naviger i kartet. Plasser adresser eller utstyr via + i headeren.';
  private onScriptLoad=()=>this.createMap();

  ngOnChanges(changes:SimpleChanges):void {
    if(this.map && (changes['postcode'] || changes['projectId'])){
      this.scheduleViewport();
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
    this.savedParcels=L.layerGroup().addTo(this.map);
    this.parcelCandidates=L.layerGroup().addTo(this.map);
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
    this.map.setView([64,11],5);
    this.scheduleViewport();
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
  private addressLocations():number[][] {
    let parsed:unknown=[];
    try {
      const raw=localStorage.getItem(ITEM_KEY);
      parsed=raw?JSON.parse(raw):[];
    }catch {return [];}
    if(!Array.isArray(parsed))return [];
    return (parsed as ProjectMapItem[])
      .filter(item=>item && item.projectId===this.projectId &&
        item.kind==='address' && Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        Math.abs(item.latitude as number)<=90 &&
        Math.abs(item.longitude as number)<=180)
      .map(item=>[item.latitude as number,item.longitude as number]);
  }
  private focusAddresses(locations:number[][]):boolean {
    if(!this.map || !locations.length)return false;
    if(locations.length===1){
      this.map.setView(locations[0],18);
      this.message.nativeElement.textContent='Viser prosjektets adresse.';
    }else{
      this.map.fitBounds(locations,{padding:[40,40],maxZoom:17});
      this.message.nativeElement.textContent=
        'Viser alle '+locations.length+' registrerte adresser i prosjektet.';
    }
    return true;
  }

  private scheduleViewport():void {
    if(!this.map || this.destroyed)return;
    const request=++this.postcodeRequest;
    // Defer until the project workspace is laid out; fitBounds needs a real size.
    requestAnimationFrame(()=>{
      if(this.destroyed || !this.map || request!==this.postcodeRequest)return;
      this.map.invalidateSize({pan:false});
      this.refreshPins(false);
      const locations=this.addressLocations();
      this.lastAddressSignature=JSON.stringify(locations);
      // A postal-code viewport is needed only before the first address exists.
      if(this.focusAddresses(locations))return;
      if(/^[0-9]{4}$/.test(this.postcode)){
        void this.focusPostcode(request);
      }else{
        this.refreshPins(true);
      }
    });
  }

  private async focusPostcode(request:number):Promise<void> {
    const postcode=this.postcode;
    const id=this.projectId;
    if(!this.map || !/^[0-9]{4}$/.test(postcode))return;
    this.message.nativeElement.textContent='Finner kartutsnitt for postnummer '+postcode+' …';
    try{
      const bounds=await this.lookupPostcode(postcode);
      if(this.destroyed || request!==this.postcodeRequest ||
         id!==this.projectId || postcode!==this.postcode ||
         this.addressLocations().length || !this.map || this.picking ||
         this.selectingParcel)return;
      if(!bounds){
        this.refreshPins(true);
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
      this.refreshPins(true);
      this.message.nativeElement.textContent='Kunne ikke slå opp postnummer '+postcode+
        ' hos Kartverket. Kartet kan brukes manuelt.';
    }
  }
  private refreshPins(fit:boolean):void {
    if(!this.map || !this.pins)return;
    this.pins.clearLayers();
    this.savedParcels?.clearLayers();
    const parcelKeys=new Set<string>();
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
      const parcel=value.area || value.parcel;
      if(value.kind==='address' && parcel?.geometry &&
         ['Polygon','MultiPolygon'].includes(parcel.geometry.type)){
        const key=parcel.propertyId || JSON.stringify(parcel.geometry);
        if(!parcelKeys.has(key)){
          parcelKeys.add(key);
          try{
            L.geoJSON({type:'Feature',properties:{},geometry:parcel.geometry},{
              style:{
                color:value.area?.kind==='building'?'#bf711b':'#267e52',weight:3,
                fillColor:value.area?.kind==='building'?'#edab62':'#5eaa7e',
                fillOpacity:.18,interactive:false
              }
            }).addTo(this.savedParcels);
          }catch{/* A malformed saved polygon cannot prevent map loading. */}
        }
      }
    }
    if(fit){
      if(bounds.length===1)this.map.setView(bounds[0],14);
      else if(bounds.length>1)this.map.fitBounds(bounds,{padding:[40,40],maxZoom:15});
      else this.map.setView([64,11],5);
    }
  }

  stopParcelSelection(notify:boolean):void {
    this.parcelToken++;
    this.selectingParcel=false;
    this.parcelCandidates?.clearLayers();
    if(notify){
      window.dispatchEvent(new CustomEvent('fiberapp:planner-parcel-cancelled',{
        detail:{projectId:this.projectId}
      }));
    }
  }
  @HostListener('window:fiberapp:planner-parcel-select-start',['$event'])
  async onParcelSelectStart(event:Event):Promise<void> {
    const detail=(event as CustomEvent<{
      projectId:string;latitude:number;longitude:number
    }>).detail;
    if(!detail || detail.projectId!==this.projectId || !this.map || !this.parcelCandidates ||
       !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude))return;
    this.picking=false;
    this.selectingParcel=true;
    this.parcelStatus='Henter eiendomsgrenser fra Kartverket …';
    const request=++this.parcelToken;
    this.postcodeRequest++; // A slow postcode response may not override the parcel viewport.
    this.parcelCandidates.clearLayers();
    this.map.invalidateSize({pan:false});
    this.map.setView([detail.latitude,detail.longitude],18);
    this.mapHost.nativeElement.scrollIntoView({behavior:'smooth',block:'nearest'});
    const params=new URLSearchParams({
      nord:String(detail.latitude),ost:String(detail.longitude),koordsys:'4258',
      utkoordsys:'4258',radius:'100',maksTreff:'40'
    });
    try{
      const response=await fetch(PARCEL_API+'?'+params.toString(),{
        headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket eiendom: '+response.status);
      const result:unknown=await response.json();
      if(this.destroyed || request!==this.parcelToken ||
         !this.selectingParcel || detail.projectId!==this.projectId)return;
      const features=(result as {features?:unknown[]})?.features;
      const L=(window as any).L;
      let count=0;
      for(const value of Array.isArray(features)?features:[]){
        if(!value || typeof value!=='object')continue;
        const feature=value as {
          geometry?:{type:string;coordinates:unknown[]};
          properties?:{matrikkelnummertekst?:unknown;lokalid?:unknown}
        };
        const geometry=feature.geometry;
        if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type) ||
           !Array.isArray(geometry.coordinates))continue;
        if(JSON.stringify(geometry).length>150000)continue;
        const label=String(feature.properties?.matrikkelnummertekst ||
          'Eiendom '+(count+1)).slice(0,120);
        const propertyId=feature.properties?.lokalid==null
          ? '':String(feature.properties.lokalid);
        try{
          const layer=L.geoJSON(value,{
            style:{color:'#087bb6',weight:2,fillColor:'#55b9e6',fillOpacity:.16}
          });
          layer.eachLayer((path:any)=>{
            path.on('mouseover',()=>path.setStyle({
              color:'#e98b17',weight:4,fillOpacity:.3
            }));
            path.on('mouseout',()=>path.setStyle({
              color:'#087bb6',weight:2,fillOpacity:.16
            }));
            path.on('click',()=>{
              const parcel={propertyId,propertyLabel:label,geometry};
              this.stopParcelSelection(false);
              window.dispatchEvent(new CustomEvent('fiberapp:planner-parcel-selected',{
                detail:{projectId:this.projectId,parcel}
              }));
            });
          });
          layer.addTo(this.parcelCandidates);
          count++;
        }catch{/* Invalid features are safely ignored. */}
      }
      this.parcelStatus=count
        ? 'Velg riktig tomt ved å trykke på en blå flate ('+count+' tilgjengelige).'
        : 'Ingen tomteflater funnet her. Avbryt og lagre adressen som punkt.';
    }catch{
      if(this.destroyed || request!==this.parcelToken)return;
      this.parcelStatus='Kunne ikke hente eiendomsgrenser. Avbryt og lagre adressen som punkt.';
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

  @HostListener('window:fiberapp:planner-items-changed',['$event'])
  onItemsChanged(event:Event):void {
    const detail=(event as CustomEvent<{projectId:string}>).detail;
    if(detail?.projectId!==this.projectId || !this.map || this.destroyed)return;
    const locations=this.addressLocations();
    const signature=JSON.stringify(locations);
    const addressesChanged=signature!==this.lastAddressSignature;
    this.lastAddressSignature=signature;
    this.refreshPins(false);
    if(!addressesChanged || this.picking || this.selectingParcel)return;
    const request=++this.postcodeRequest;
    this.map.invalidateSize({pan:false});
    if(this.focusAddresses(locations))return;
    if(/^[0-9]{4}$/.test(this.postcode))void this.focusPostcode(request);
    else this.refreshPins(true);
  }

  ngOnDestroy():void {
    this.destroyed=true;
    this.postcodeRequest++;
    this.stopParcelSelection(false);
    if(typeof document!=='undefined'){
      const script=document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
      script?.removeEventListener('load',this.onScriptLoad);
    }
    this.map?.remove();
    this.map=null;
  }
}
