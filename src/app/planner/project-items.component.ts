import {CommonModule} from '@angular/common';
import {Component,ElementRef,HostListener,Input,OnChanges,OnDestroy,OnInit,SimpleChanges,ViewChild} from '@angular/core';
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
  boenheter?:UnitRecord[];
  latitude?:number;
  longitude?:number;
  createdAt:string;
}
interface UnitRecord {
  adresse:string;
  adresseNr:number;
  adresseBokstav:string;
  etasje:string;
  leilighetsnummer:string;
  source:'Kartverket';
}
interface UnitAddressIdentity {
  street:string;number:number;letter:string;municipality:string;postcode:string;
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
  bruksenhetsnummer?:string[];
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
          <article class="planner-item-row planner-address-row" *ngFor="let item of addressItems; trackBy:trackId"
                   [attr.data-address-id]="item.id"
                   [class.is-selected]="selectedAddressId===item.id"
                   [class.address-tool-modal-open]="editingAddress?.id===item.id"
                   [class.address-tool-dismissed]="dismissedAddressTools.has(item.id)"
                   (pointerenter)="onAddressRowPointerLeave(item)"
                   (pointerleave)="onAddressRowPointerLeave(item)">
            <button type="button" class="planner-address-focus"
                    [disabled]="!hasAddressLocation(item)"
                    [attr.aria-label]="'Vis '+item.name+' på kartet'"
                    [attr.aria-pressed]="selectedAddressId===item.id"
                    (click)="focusAddress(item)">
              <strong>{{item.name}}</strong>
              <span class="project-item-parcel" *ngIf="item.area || item.parcel">
                {{item.area?.kind==='building' ? 'Bygg' : 'Tomt'}}:
                {{item.area?.propertyLabel || item.parcel?.propertyLabel || 'tegnet område'}}
              </span>
              <span class="planner-item-note" *ngIf="item.note">{{item.note}}</span>
              <span class="planner-item-units-count" *ngIf="item.boenheter?.length">
                {{item.boenheter?.length}} valgte bruksenheter
              </span>
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
        <div class="address-edit-layout" [class.with-units]="unitsPanelOpen">
          <div class="address-edit-left">
            <div class="address-edit-actions" *ngIf="!confirmingAddressDelete">
              <button type="button" class="secondary" (click)="searchBoenheter()">Søk boenheter</button>
              <p class="address-units-saved" *ngIf="editingAddress.boenheter?.length">
                {{editingAddress.boenheter?.length}} valgte bruksenheter i prosjektet
              </p>
              <button type="button" class="delete-open-button" (click)="requestAddressDelete()">
                Slett adresse
              </button>
            </div>
            <section class="address-delete-confirmation" *ngIf="confirmingAddressDelete"
                     aria-label="Bekreft sletting av adresse">
              <p>Vil du slette <strong>{{editingAddress.name}}</strong> fra prosjektet?</p>
              <div class="notice error" *ngIf="deleteAddressError" role="alert">
                {{deleteAddressError}}
              </div>
              <div class="dialog-actions">
                <button type="button" class="secondary" (click)="cancelAddressDelete()">Avbryt</button>
                <button type="button" class="delete-confirm-button" (click)="deleteAddress()">Slett</button>
              </div>
            </section>
          </div>
          <section class="address-units-panel" *ngIf="unitsPanelOpen"
                   aria-labelledby="ng-address-units-title">
            <h3 id="ng-address-units-title">Registrerte bruksenheter</h3>
            <p class="address-units-status" role="status" aria-live="polite">{{unitsStatus}}</p>
            <div class="address-units-table-wrap" *ngIf="foundUnits.length">
              <table class="address-units-table">
                <thead>
                  <tr>
                    <th scope="col">Velg</th>
                    <th scope="col">Adresse</th>
                    <th scope="col">Nr.</th>
                    <th scope="col">Bokstav</th>
                    <th scope="col">Etasje</th>
                    <th scope="col">Leilighetsnummer</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let unit of foundUnits; trackBy:trackUnitNumber">
                    <td>
                      <input type="checkbox" [checked]="unitSelection.has(unit.leilighetsnummer)"
                             [attr.aria-label]="'Velg '+unit.leilighetsnummer+' i '+unit.adresse+' '+unit.adresseNr+unit.adresseBokstav"
                             (change)="changeUnitSelection(unit.leilighetsnummer,$event)">
                    </td>
                    <td>{{unit.adresse}}</td>
                    <td>{{unit.adresseNr}}</td>
                    <td>{{unit.adresseBokstav || '–'}}</td>
                    <td>{{unit.etasje}}</td>
                    <td>{{unit.leilighetsnummer}}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="address-units-hint">
              Kartverkets adresse-API oppgir bruksenhetsnummer, men ikke om enheten er godkjent bolig.
            </p>
            <div class="dialog-actions address-units-footer">
              <button type="button" [disabled]="!unitsReady || unitsLoading || !foundUnits.length || !canSave"
                      (click)="saveBoenheter()">OK</button>
            </div>
          </section>
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
export class ProjectItemsComponent implements OnInit,OnChanges,OnDestroy {
  @Input({required:true}) projectId!:string;
  items:ProjectItem[]=[];
  selectedAddressId:string|null=null;
  editingAddress:ProjectItem|null=null;
  unitsPanelOpen=false;
  unitsLoading=false;
  unitsReady=false;
  unitsStatus='';
  foundUnits:UnitRecord[]=[];
  readonly unitSelection=new Set<string>();
  private unitsSequence=0;
  private unitsAbort:AbortController|null=null;
  confirmingAddressDelete=false;
  deleteAddressError='';
  readonly dismissedAddressTools=new Set<string>();
  private editorOpenedByPointer=false;
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
    this.editorOpenedByPointer=event.detail!==0;
    if(this.editorOpenedByPointer)this.dismissedAddressTools.add(item.id);
    this.confirmingAddressDelete=false;
    this.deleteAddressError='';
    this.resetBoenheterSearch();
    this.editingAddress=item;
  }

  private resetBoenheterSearch():void {
    this.unitsSequence++;
    this.unitsAbort?.abort();
    this.unitsAbort=null;
    this.unitsPanelOpen=false;
    this.unitsLoading=false;
    this.unitsReady=false;
    this.unitsStatus='';
    this.foundUnits=[];
    this.unitSelection.clear();
  }
  private addressIdentity(item:ProjectItem):UnitAddressIdentity|null {
    const match=/^(.+?)\s+(\d+)([A-Za-zÆØÅæøå]?)$/u.exec(String(item.name||'').trim());
    if(!match)return null;
    const parts=String(item.addressKey||'').split('|');
    const number=parts.length===5 && /^\d+$/.test(parts[2])
      ? Number(parts[2]):Number(match[2]);
    const letter=(parts.length===5?parts[3]:match[3]||'').trim().toLocaleUpperCase('nb-NO');
    return {
      street:match[1].trim(),number,letter,
      municipality:parts.length===5 && /^\d{4}$/.test(parts[0])?parts[0]:'',
      postcode:String(item.postcode||'').trim()
    };
  }
  private normalizeBoenheter(data:unknown,identity:UnitAddressIdentity):UnitRecord[] {
    const entries=(data as {adresser?:KartverketAddress[]}|null)?.adresser;
    const numbers=new Set<string>();
    for(const entry of Array.isArray(entries)?entries:[]){
      if(entry?.objtype!=='Vegadresse' ||
         String(entry.adressenavn||'').trim().toLocaleLowerCase('nb-NO')!==
           identity.street.toLocaleLowerCase('nb-NO') ||
         Number(entry.nummer)!==identity.number ||
         String(entry.bokstav||'').trim().toLocaleUpperCase('nb-NO')!==identity.letter ||
         (identity.postcode && String(entry.postnummer||'')!==identity.postcode) ||
         (identity.municipality && String(entry.kommunenummer||'')!==identity.municipality))continue;
      for(const value of Array.isArray(entry.bruksenhetsnummer)?entry.bruksenhetsnummer:[]){
        if(typeof value!=='string')continue;
        const number=value.trim().toUpperCase();
        if(/^[HKUL]\d{4}$/.test(number))numbers.add(number);
      }
    }
    return [...numbers].sort((a,b)=>a.localeCompare(b,'nb-NO')).map(number=>({
      adresse:identity.street,adresseNr:identity.number,adresseBokstav:identity.letter,
      etasje:number.slice(0,3),leilighetsnummer:number,source:'Kartverket'
    }));
  }
  trackUnitNumber(_index:number,unit:UnitRecord):string{return unit.leilighetsnummer;}
  changeUnitSelection(number:string,event:Event):void {
    if((event.target as HTMLInputElement).checked)this.unitSelection.add(number);
    else this.unitSelection.delete(number);
  }
  async searchBoenheter():Promise<void> {
    const item=this.editingAddress,projectId=this.projectId;
    if(!item || item.projectId!==projectId || item.kind!=='address')return;
    this.resetBoenheterSearch();
    this.unitsPanelOpen=true;
    this.unitsLoading=true;
    this.unitsStatus='Søker etter registrerte bruksenhetsnummer hos Kartverket …';
    const identity=this.addressIdentity(item);
    if(!identity){
      this.unitsLoading=false;
      this.unitsStatus='Adressen kunne ikke tolkes til gatenavn og husnummer.';
      return;
    }
    const params=new URLSearchParams({
      adressenavn:identity.street,nummer:String(identity.number),bokstav:identity.letter,
      objtype:'Vegadresse',treffPerSide:'100',side:'0'
    });
    if(identity.postcode)params.set('postnummer',identity.postcode);
    if(identity.municipality)params.set('kommunenummer',identity.municipality);
    const token=++this.unitsSequence;
    const controller=new AbortController();
    this.unitsAbort=controller;
    try{
      const response=await fetch(ADDRESS_API+'?'+params.toString(),{
        signal:controller.signal,headers:{Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Kartverket: '+response.status);
      const data:unknown=await response.json();
      if(token!==this.unitsSequence || controller.signal.aborted ||
         this.editingAddress?.id!==item.id || this.projectId!==projectId)return;
      this.foundUnits=this.normalizeBoenheter(data,identity);
      const saved=new Set((Array.isArray(item.boenheter)?item.boenheter:[])
        .map(unit=>unit?.leilighetsnummer).filter((v):v is string=>typeof v==='string'));
      this.unitSelection.clear();
      for(const unit of this.foundUnits)
        if(saved.has(unit.leilighetsnummer))this.unitSelection.add(unit.leilighetsnummer);
      this.unitsReady=true;
      this.unitsStatus=this.foundUnits.length
        ? 'Fant '+this.foundUnits.length+
          ' registrerte bruksenhetsnummer. Huk av enhetene som skal inngå i prosjektet.'
        : 'Ingen registrerte bruksenhetsnummer funnet for denne vegadressen. Ingen enheter er lagt til.';
    }catch{
      if(token!==this.unitsSequence || controller.signal.aborted)return;
      this.unitsStatus='Kunne ikke hente bruksenheter fra Kartverket. Prøv søket på nytt.';
    }finally{
      if(token===this.unitsSequence){
        this.unitsAbort=null;
        this.unitsLoading=false;
      }
    }
  }
  saveBoenheter():void {
    const item=this.editingAddress,projectId=this.projectId;
    if(!item || item.projectId!==projectId || item.kind!=='address' ||
       !this.unitsReady || this.unitsLoading || !this.foundUnits.length || !this.canSave)return;
    try{
      const raw=localStorage.getItem(KEY);
      const data:unknown=raw?JSON.parse(raw):[];
      if(!Array.isArray(data))throw new Error('Ugyldig lagring');
      const idx=data.findIndex((row:unknown)=>row!==null && typeof row==='object' &&
        (row as Partial<ProjectItem>).id===item.id &&
        (row as Partial<ProjectItem>).projectId===projectId &&
        (row as Partial<ProjectItem>).kind==='address');
      if(idx<0){
        this.unitsStatus='Adressen finnes ikke lenger i prosjektet.';
        return;
      }
      const selected=this.foundUnits.filter(unit=>this.unitSelection.has(unit.leilighetsnummer));
      const next=data.slice();
      next[idx]={...next[idx],boenheter:selected};
      localStorage.setItem(KEY,JSON.stringify(next));
      this.items=next.filter((row:unknown):row is ProjectItem=>{
        if(!row || typeof row!=='object')return false;
        const rec=row as Partial<ProjectItem>;
        return typeof rec.id==='string' && typeof rec.projectId==='string' &&
          (rec.kind==='address'||rec.kind==='equipment') && typeof rec.name==='string';
      });
      this.storageError='';
      this.closeAddressEditor();
      window.dispatchEvent(new CustomEvent('fiberapp:planner-items-changed',{
        detail:{projectId}
      }));
    }catch{
      this.unitsStatus='Kunne ikke lagre boenhetene i nettleseren. Ingen endringer ble lagret.';
    }
  }

  onAddressRowPointerLeave(item:ProjectItem):void {
    // Do not clear this just because the overlay obscured the row on open.
    if(this.editingAddress?.id!==item.id)this.dismissedAddressTools.delete(item.id);
  }
  requestAddressDelete():void {
    if(!this.editingAddress)return;
    this.resetBoenheterSearch();
    this.deleteAddressError='';
    this.confirmingAddressDelete=true;
  }
  cancelAddressDelete():void {
    this.confirmingAddressDelete=false;
    this.deleteAddressError='';
  }
  deleteAddress():void {
    const address=this.editingAddress;
    if(!address || !this.confirmingAddressDelete || !this.canSave ||
       address.kind!=='address' || address.projectId!==this.projectId)return;
    try{
      // Re-read storage so unrelated equipment and address records are preserved.
      const raw=localStorage.getItem(KEY);
      const stored:unknown=raw?JSON.parse(raw):[];
      if(!Array.isArray(stored))throw new Error('Ugyldig lagring');
      const exists=stored.some((item:unknown)=>item!==null && typeof item==='object' &&
        (item as Partial<ProjectItem>).id===address.id &&
        (item as Partial<ProjectItem>).projectId===this.projectId &&
        (item as Partial<ProjectItem>).kind==='address');
      if(!exists){
        this.deleteAddressError='Adressen finnes ikke lenger i prosjektet.';
        return;
      }
      const next=stored.filter((item:unknown)=>!(
        item!==null && typeof item==='object' &&
        (item as Partial<ProjectItem>).id===address.id &&
        (item as Partial<ProjectItem>).projectId===this.projectId &&
        (item as Partial<ProjectItem>).kind==='address'
      ));
      localStorage.setItem(KEY,JSON.stringify(next));
      if(this.selectedAddressId===address.id)this.selectedAddressId=null;
      this.items=next.filter((item:unknown):item is ProjectItem=>{
        if(!item || typeof item!=='object')return false;
        const candidate=item as Partial<ProjectItem>;
        return typeof candidate.id==='string' &&
          typeof candidate.projectId==='string' &&
          (candidate.kind==='address'||candidate.kind==='equipment') &&
          typeof candidate.name==='string';
      });
      this.storageError='';
      this.closeAddressEditor();
      window.dispatchEvent(new CustomEvent('fiberapp:planner-items-changed',{
        detail:{projectId:this.projectId}
      }));
    }catch{
      this.deleteAddressError='Kunne ikke slette adressen. Kontroller nettleserlagringen.';
    }
  }
  closeAddressEditor():void {
    this.resetBoenheterSearch();
    this.editingAddress=null;
    this.confirmingAddressDelete=false;
    this.deleteAddressError='';
    const trigger=this.editorTrigger;
    this.editorTrigger=null;
    if(trigger?.isConnected){
      if(this.editorOpenedByPointer)trigger.blur();
      else trigger.focus(); // Keyboard users keep their place in the list.
    }
    this.editorOpenedByPointer=false;
  }
  focusAddress(item:ProjectItem):void {
    if(item.projectId!==this.projectId || !this.hasAddressLocation(item))return;
    this.selectedAddressId=item.id;
    window.dispatchEvent(new CustomEvent('fiberapp:planner-address-focus',{
      detail:{projectId:this.projectId,itemId:item.id}
    }));
  }
  @HostListener('window:fiberapp:planner-main-address-selected',['$event'])
  onMainMapAddressSelected(event:Event):void {
    const detail=(event as CustomEvent<{projectId:string;itemId:string}>).detail;
    if(!detail || detail.projectId!==this.projectId ||
       !this.items.some(item=>item.projectId===this.projectId &&
         item.kind==='address' && item.id===detail.itemId))return;
    this.selectedAddressId=detail.itemId;
    // The selected row may be below the fold in long project lists.
    const rows=document.querySelectorAll<HTMLElement>('.planner-address-row');
    for(const row of rows){
      if(row.dataset['addressId']===detail.itemId){
        row.scrollIntoView?.({behavior:'smooth',block:'nearest'});
        break;
      }
    }
  }
  ngOnChanges(changes:SimpleChanges):void {
    if(changes['projectId']){
      this.selectedAddressId=null;
      // The address editor must not remain open for a different project.
      if(this.editingAddress && this.editingAddress.projectId!==this.projectId)
        this.closeAddressEditor();
    }
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
    this.resetBoenheterSearch();
    this.editingAddress=null;
    this.confirmingAddressDelete=false;
    this.deleteAddressError='';
    this.editorTrigger=null;
    this.editorOpenedByPointer=false;
    this.dismissedAddressTools.clear();
    this.selectedAddressId=null;
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
