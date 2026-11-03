import {CommonModule} from '@angular/common';
import {Component,ElementRef,HostListener,Input,OnDestroy,OnInit,ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {PlannerUiService} from './planner-ui.service';
import {AddressAreaMapComponent,SelectedArea} from './address-area-map.component';

type ItemKind='address'|'equipment';
interface ProjectItem {
  id:string;
  projectId:string;
  kind:ItemKind;
  name:string;
  note:string;
  equipmentType:string;
  addressKey?:string;
  postcode?:string;
  poststed?:string;
  addressSource?:string;
  parcel?:PropertyParcel; // Older saved records
  area?:SelectedArea;
  latitude?:number;
  longitude?:number;
  createdAt:string;
}
interface PropertyParcel {
  propertyId:string;
  propertyLabel:string;
  geometry:{type:'Polygon'|'MultiPolygon';coordinates:unknown[]};
}
interface KartverketAddress {
  objtype?:string;
  adressenavn?:string;
  adressekode?:number;
  nummer?:number;
  bokstav?:string;
  kommunenummer?:string;
  postnummer?:string;
  poststed?:string;
  representasjonspunkt?:{lat:number;lon:number};
}
interface AddressChoice {
  addressKey:string;
  name:string;
  postcode:string;
  poststed:string;
  latitude:number;
  longitude:number;
}
const KEY='fiberapp.planner.items.v1';
const PROJECTS_KEY='fiberapp.planner.projects.v1';
const ADDRESS_API='https://api.kartverket.no/adresser/v1/sok';

@Component({
  selector:'app-project-items',
  standalone:true,
  imports:[CommonModule,FormsModule,AddressAreaMapComponent],
  template:`
    <div class="planner-item-groups">
      <section class="planner-item-section planner-address-section" aria-label="Adresser">
        <h3>Adresser</h3>
        <div class="planner-item-list">
          <article class="planner-item-row planner-address-row" *ngFor="let item of addressItems; trackBy:trackId">
            <button type="button" class="planner-address-focus"
                    [disabled]="!hasAddressLocation(item)"
                    [attr.aria-label]="'Vis '+item.name+' på kartet'"
                    (click)="focusAddress(item)">
              <strong>{{item.name}}</strong>
              <span class="project-item-parcel" *ngIf="item.area || item.parcel">
                {{item.area?.kind==='building' ? 'Bygg' : 'Tomt'}}:
                {{item.area?.propertyLabel || item.parcel?.propertyLabel || 'tegnet område'}}
              </span>
              <span class="planner-item-note" *ngIf="item.note">{{item.note}}</span>
            </button>
            <button type="button" class="planner-address-edit-tool"
                    [attr.aria-label]="'Rediger adresse: '+item.name"
                    title="Rediger adresse" (click)="openAddressEditor(item,$event)">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round"
                   stroke-linejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7.8 7.8a2.12 2.12 0 0 1-3-3l7.8-7.8a6 6 0 0 1 7.9-7.9z"/>
              </svg>
            </button>
          </article>
          <p class="planner-items-empty" *ngIf="!addressItems.length">Ingen adresser lagt til ennå.</p>
        </div>
      </section>
      <section class="planner-item-section" *ngIf="equipmentItems.length">
        <h3>Utstyr</h3>
        <div class="planner-item-list">
          <article class="planner-item-row" *ngFor="let item of equipmentItems; trackBy:trackId">
            <strong>{{item.name}}</strong>
            <span class="planner-item-type">{{item.equipmentType}}</span>
            <p *ngIf="item.note">{{item.note}}</p>
          </article>
        </div>
      </section>
    </div>
    <div class="notice error" *ngIf="storageError" role="alert">{{storageError}}</div>
    <div class="planner-modal-backdrop" *ngIf="editingAddress" (click)="closeAddressEditor()">
      <section class="planner-modal planner-address-edit-modal"
               role="dialog" aria-modal="true" aria-labelledby="ng-address-edit-title"
               (click)="$event.stopPropagation()">
        <div class="dialog-head">
          <h2 id="ng-address-edit-title">Rediger adresse</h2>
          <button #addressEditClose type="button" class="close-button" aria-label="Lukk"
                  (click)="closeAddressEditor()">×</button>
        </div>
      </section>
    </div>
    <div class="planner-modal-backdrop" *ngIf="ui.itemModal()" (click)="close()">
      <section class="planner-modal planner-item-modal"
               [class.address-mode]="ui.itemModal()==='address'"
               role="dialog" aria-modal="true"
               aria-labelledby="ng-item-dialog-title" (click)="$event.stopPropagation()">
        <div class="dialog-head">
          <h2 id="ng-item-dialog-title">{{ui.itemModal()==='address' ? 'Ny adresse' : 'Nytt utstyr'}}</h2>
          <button type="button" class="close-button" aria-label="Lukk" (click)="close()">×</button>
        </div>
        <form (ngSubmit)="create()">
          <div class="project-item-body">
            <div class="project-item-fields">
          <ng-container *ngIf="ui.itemModal()==='address'">
            <label for="ng-address-query">Søk etter vegadresse *</label>
            <input id="ng-address-query" type="search" name="addressQuery" maxlength="120"
                   [(ngModel)]="addressQuery" (ngModelChange)="onAddressQueryChanged($event)"
                   autocomplete="off" spellcheck="false" placeholder="Skriv gatenavn eller husnummer"
                   aria-describedby="ng-address-scope ng-address-status">
            <p id="ng-address-scope" class="address-search-scope">{{addressScope}}</p>
            <p id="ng-address-status" class="address-search-status" role="status" aria-live="polite">{{addressStatus}}</p>
            <ul class="address-search-results" *ngIf="addressChoices.length" aria-label="Fysiske vegadresser">
              <li *ngFor="let choice of addressChoices; trackBy:trackAddress">
                <button type="button" (click)="selectAddress(choice)">
                  <strong>{{choice.name}}</strong>
                  <span>{{choice.postcode}} {{choice.poststed}}</span>
                </button>
              </li>
            </ul>
            <p class="address-search-selected" *ngIf="selectedAddress">
              Valgt vegadresse: {{selectedAddress.name}}, {{selectedAddress.postcode}}
            </p>
            <p class="address-area-selected" *ngIf="selectedArea">
              {{selectedArea.kind==='building' ? 'Bygg' : 'Tomt'}} valgt
              {{selectedArea.propertyLabel ? ': '+selectedArea.propertyLabel : ''}}
            </p>
          </ng-container>
          <ng-container *ngIf="ui.itemModal()==='equipment'">
            <label for="ng-item-name">Utstyrsnavn / ID *</label>
            <input id="ng-item-name" type="text" name="itemName" required maxlength="120"
                   [(ngModel)]="name" autocomplete="off" placeholder="F.eks. ODF-01">
          </ng-container>
          <ng-container *ngIf="ui.itemModal()==='equipment'">
            <label for="ng-item-type">Utstyrstype</label>
            <select id="ng-item-type" name="itemType" [(ngModel)]="equipmentType">
              <option value="Annet">Annet</option>
              <option value="ODF">ODF</option>
              <option value="Skjøteboks">Skjøteboks</option>
              <option value="Fordelingsboks">Fordelingsboks</option>
              <option value="Svitsj">Svitsj</option>
            </select>
          </ng-container>
          <div class="project-position-picker" *ngIf="ui.itemModal()==='equipment'">
            <button type="button" class="secondary" (click)="pickPosition()">Velg posisjon i kartet</button>
            <span class="project-position-status" aria-live="polite">{{positionLabel}}</span>
          </div>
          <label for="ng-item-note">Beskrivelse (valgfritt)</label>
          <textarea id="ng-item-note" name="itemNote" rows="3" maxlength="300"
                    [(ngModel)]="note"></textarea>
            </div>
            <app-address-area-map *ngIf="ui.itemModal()==='address'"
              [address]="selectedAddress"
              (areaChanged)="onAreaChanged($event)"
              (pendingChange)="drawingPending=$event"></app-address-area-map>
          </div>
          <div class="notice error" *ngIf="modalError" role="alert">{{modalError}}</div>
          <div class="dialog-actions">
            <button type="button" class="secondary" (click)="close()">Avbryt</button>
            <button type="submit"
                    [disabled]="!canSave || drawingPending ||
                      (ui.itemModal()==='address' ? !selectedAddress : !name.trim())">
              Legg til
            </button>
          </div>
        </form>
      </section>
    </div>
  `
})
export class ProjectItemsComponent implements OnInit,OnDestroy {
  @Input({required:true}) projectId!:string;
  items:ProjectItem[]=[];
  editingAddress:ProjectItem|null=null;
  private editorTrigger:HTMLElement|null=null;
  @ViewChild('addressEditClose') set addressEditClose(ref:ElementRef<HTMLButtonElement>|undefined){
    if(ref)ref.nativeElement.focus();
  }
  canSave=true;
  storageError='';
  modalError='';
  name='';
  note='';
  equipmentType='Annet';
  addressQuery='';
  addressStatus='Skriv minst to tegn for å søke i Kartverkets adresseregister.';
  addressChoices:AddressChoice[]=[];
  selectedAddress:AddressChoice|null=null;
  selectedArea:SelectedArea|null=null;
  drawingPending=false;
  private addressSequence=0;
  private addressTimer:ReturnType<typeof setTimeout>|null=null;
  private addressAbort:AbortController|null=null;
  selectedPosition:{latitude:number;longitude:number}|null=null;
  pickingKind:ItemKind|null=null;
  constructor(public readonly ui:PlannerUiService){}
  get projectPostcode():string {
    try{
      const projects:unknown=JSON.parse(localStorage.getItem(PROJECTS_KEY)||'[]');
      if(!Array.isArray(projects))return '';
      const current=projects.find((p:unknown)=>p!==null && typeof p==='object' &&
        (p as {id?:string}).id===this.projectId) as {postcode?:unknown}|undefined;
      return typeof current?.postcode==='string' && /^[0-9]{4}$/.test(current.postcode)
        ? current.postcode:'';
    }catch{return '';}
  }
  get addressScope():string {
    const postcode=this.projectPostcode;
    return postcode
      ? 'Søker kun i postnummer '+postcode+'. Ingen leilighetsnummer.'
      : 'Prosjektet mangler postnummer. Søker i hele Norge, uten leilighetsnummer.';
  }
  trackAddress(_index:number,address:AddressChoice):string{return address.addressKey;}
  private cancelSearch():void {
    this.addressSequence++;
    if(this.addressTimer!==null)clearTimeout(this.addressTimer);
    this.addressTimer=null;
    this.addressAbort?.abort();
    this.addressAbort=null;
  }
  private normalizeAddress(raw:KartverketAddress):AddressChoice|null {
    if(!raw || raw.objtype!=='Vegadresse' ||
       typeof raw.adressenavn!=='string' || !Number.isInteger(raw.nummer))return null;
    const point=raw.representasjonspunkt;
    if(!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
       Math.abs(point.lat)>90 || Math.abs(point.lon)>180)return null;
    const road=raw.adressenavn.trim();
    if(!road)return null;
    const letter=typeof raw.bokstav==='string'?raw.bokstav.trim():'';
    const addressKey=[
      raw.kommunenummer||'',raw.adressekode??raw.adressenavn,raw.nummer??'',
      letter,raw.postnummer||''
    ].join('|').toLocaleLowerCase('nb-NO');
    return {
      addressKey,name:road+' '+raw.nummer+letter,
      postcode:typeof raw.postnummer==='string'?raw.postnummer:'',
      poststed:typeof raw.poststed==='string'?raw.poststed:'',
      latitude:point.lat,longitude:point.lon
    };
  }
  onAddressQueryChanged(query:string):void {
    this.selectedAddress=null;
    this.selectedArea=null;
    this.drawingPending=false;
    this.addressChoices=[];
    this.cancelSearch();
    this.addressStatus='Skriv minst to tegn for å søke i Kartverkets adresseregister.';
    const normalized=query.trim().replace(/\s+/g,' ');
    if(normalized.length<2 || this.ui.itemModal()!=='address')return;
    const sequence=this.addressSequence;
    const projectId=this.projectId;
    this.addressTimer=setTimeout(()=>{
      if(sequence===this.addressSequence)void this.searchAddresses(normalized,projectId,sequence);
    },280);
  }
  private async searchAddresses(query:string,projectId:string,sequence:number):Promise<void> {
    const postcode=this.projectPostcode;
    const params=new URLSearchParams({
      sok:query+'*',objtype:'Vegadresse',treffPerSide:'30',side:'0',utkoordsys:'4258'
    });
    if(postcode)params.set('postnummer',postcode);
    const controller=new AbortController();
    this.addressAbort=controller;
    this.addressStatus='Søker etter vegadresser …';
    try{
      const response=await fetch(ADDRESS_API+'?'+params.toString(),{
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket API: '+response.status);
      const data:unknown=await response.json();
      if(sequence!==this.addressSequence || projectId!==this.projectId ||
         this.ui.itemModal()!=='address')return;
      const addresses=(data as {adresser?:KartverketAddress[]})?.adresser;
      const unique=new Map<string,AddressChoice>();
      for(const raw of Array.isArray(addresses)?addresses:[]){
        const candidate=this.normalizeAddress(raw);
        if(!candidate || unique.has(candidate.addressKey))continue;
        if(postcode && candidate.postcode!==postcode)continue;
        unique.set(candidate.addressKey,candidate);
      }
      this.addressChoices=[...unique.values()];
      this.addressStatus=this.addressChoices.length
        ? 'Velg en adresse fra listen. Viser inntil 30 treff; skriv mer for å snevre inn.'
        : 'Ingen vegadresser funnet. Kontroller gatenavn og postnummer.';
    }catch(error:unknown){
      if(controller.signal.aborted || sequence!==this.addressSequence)return;
      this.addressStatus='Adressesøket kunne ikke fullføres. Kontroller internett og prøv igjen.';
    }
  }
  selectAddress(choice:AddressChoice):void {
    this.cancelSearch();
    this.selectedAddress=choice;
    this.selectedArea=null;
    this.drawingPending=false;
    this.addressQuery=choice.name;
    this.addressChoices=[];
    this.addressStatus='';
    this.modalError='';
  }
  get positionLabel():string {
    return this.selectedPosition
      ? 'Posisjon valgt: '+this.selectedPosition.latitude.toFixed(6)+', '+this.selectedPosition.longitude.toFixed(6)
      : 'Ingen kartposisjon valgt';
  }
  get addressItems():ProjectItem[]{
    return this.items.filter(i=>i.projectId===this.projectId && i.kind==='address');
  }
  get equipmentItems():ProjectItem[]{
    return this.items.filter(i=>i.projectId===this.projectId && i.kind==='equipment');
  }
  trackId(_index:number,item:ProjectItem):string{return item.id;}
  hasAddressLocation(item:ProjectItem):boolean {
    return item.kind==='address' &&
      Number.isFinite(item.latitude) && Number.isFinite(item.longitude) &&
      Math.abs(item.latitude as number)<=90 && Math.abs(item.longitude as number)<=180;
  }
  openAddressEditor(item:ProjectItem,event:MouseEvent):void {
    // Placeholder editor: opening the dialog never mutates the saved address.
    if(item.kind!=='address' || item.projectId!==this.projectId ||
       !this.items.some(entry=>entry.id===item.id && entry.projectId===this.projectId))return;
    const trigger=event.currentTarget;
    this.editorTrigger=trigger instanceof HTMLElement?trigger:null;
    this.editingAddress=item;
  }
  closeAddressEditor():void {
    this.editingAddress=null;
    const trigger=this.editorTrigger;
    this.editorTrigger=null;
    if(trigger?.isConnected)trigger.focus();
  }
  focusAddress(item:ProjectItem):void {
    if(item.projectId!==this.projectId || !this.hasAddressLocation(item))return;
    window.dispatchEvent(new CustomEvent('fiberapp:planner-address-focus',{
      detail:{projectId:this.projectId,itemId:item.id}
    }));
  }
  ngOnInit():void{
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw)return;
      const parsed:unknown=JSON.parse(raw);
      if(!Array.isArray(parsed))throw new Error('Ugyldige data');
      this.items=parsed.filter((v:unknown):v is ProjectItem=>{
        if(!v || typeof v!=='object')return false;
        const item=v as Partial<ProjectItem>;
        return typeof item.id==='string' && typeof item.projectId==='string' &&
          (item.kind==='address'||item.kind==='equipment') && typeof item.name==='string';
      });
    }catch{
      this.canSave=false;
      this.storageError='Kunne ikke lese lagrede adresser eller utstyr. Data er ikke overskrevet.';
    }
  }
  ngOnDestroy():void{
    this.cancelSearch();
    this.editingAddress=null;
    this.editorTrigger=null;
    this.ui.closeItem();
  }
  onAreaChanged(area:SelectedArea|null):void {
    this.selectedArea=area;
  }
  pickPosition():void {
    const kind=this.ui.itemModal();
    if(kind!=='equipment' || !this.projectId)return;
    this.pickingKind=kind;
    this.ui.closeItem();
    window.dispatchEvent(new CustomEvent('fiberapp:planner-map-select-start',{
      detail:{projectId:this.projectId,kind}
    }));
  }
  @HostListener('window:fiberapp:planner-map-picked',['$event'])
  onMapPicked(event:Event):void {
    const detail=(event as CustomEvent<{projectId:string;latitude:number;longitude:number}>).detail;
    if(!this.pickingKind || !detail || detail.projectId!==this.projectId ||
       !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude))return;
    const kind=this.pickingKind;
    this.pickingKind=null;
    this.selectedPosition={latitude:detail.latitude,longitude:detail.longitude};
    this.ui.openItem(kind);
  }
  close():void{
    this.cancelSearch();
    this.ui.closeItem();
    this.addressQuery='';
    this.addressChoices=[];
    this.selectedAddress=null;
    this.selectedArea=null;
    this.drawingPending=false;
    this.addressStatus='Skriv minst to tegn for å søke i Kartverkets adresseregister.';
    this.name='';
    this.note='';
    this.equipmentType='Annet';
    this.selectedPosition=null;
    this.pickingKind=null;
    this.modalError='';
  }
  @HostListener('document:keydown.escape')
  onEscape():void{
    if(this.editingAddress)this.closeAddressEditor();
    else if(this.ui.itemModal())this.close();
  }
  create():void{
    const kind=this.ui.itemModal();
    if(!kind || !this.projectId || !this.canSave)return;
    const name=kind==='address'?this.selectedAddress?.name:this.name.trim().replace(/\s+/g,' ');
    const note=this.note.trim();
    if(kind==='address' && !this.selectedAddress){
      this.modalError='Du må velge en offisiell vegadresse fra Kartverkets treffliste.';
      return;
    }
    if(kind==='address' && this.drawingPending){
      this.modalError='Fullfør området ved å klikke første punkt, eller velg Nullstill område.';
      return;
    }
    if(!name || name.length>120 || note.length>300){
      this.modalError='Navnet må ha 1–120 tegn, beskrivelse maks 300 tegn.';
      return;
    }
    if(kind==='address' && this.selectedAddress && this.items.some(item=>
      item.projectId===this.projectId && item.kind==='address' &&
      (item.addressKey===this.selectedAddress?.addressKey ||
       (!item.addressKey && item.name.toLocaleLowerCase('nb-NO')===name.toLocaleLowerCase('nb-NO'))))){
      this.modalError='Denne vegadressen finnes allerede i prosjektet.';
      return;
    }
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID()
      :'item-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const next:ProjectItem[]=[...this.items,{
      id,projectId:this.projectId,kind,name,note,
      equipmentType:kind==='equipment'?this.equipmentType:'',
      ...(kind==='address' && this.selectedAddress
        ? {
          addressKey:this.selectedAddress.addressKey,postcode:this.selectedAddress.postcode,
          poststed:this.selectedAddress.poststed,
          latitude:this.selectedAddress.latitude,longitude:this.selectedAddress.longitude,
          addressSource:'Kartverket',
          ...(this.selectedArea ? {area:this.selectedArea} : {})
        }:(this.selectedPosition||{})),
      createdAt:new Date().toISOString()
    }];
    try{
      localStorage.setItem(KEY,JSON.stringify(next));
      this.items=next;
      this.storageError='';
      window.dispatchEvent(new CustomEvent('fiberapp:planner-items-changed',{
        detail:{projectId:this.projectId}
      }));
      this.close();
    }catch{
      this.modalError='Kunne ikke lagre. Kontroller nettleserlagringen.';
    }
  }
}
