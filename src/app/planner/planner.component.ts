import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {DatabaseService} from './database.service';

interface Item{[key:string]:any}
interface Stats{buildings:number;entrances:number;apartments:number;equipment:number;ports:number;freePorts:number;links:number}
interface Snapshot{projects:Item[];buildings:Item[];entrances:Item[];apartments:Item[];equipment:Item[];ports:Item[];links:Item[];stats:Stats}
const blank=():Snapshot=>({projects:[],buildings:[],entrances:[],apartments:[],equipment:[],ports:[],links:[],stats:{buildings:0,entrances:0,apartments:0,equipment:0,ports:0,freePorts:0,links:0}});
@Component({selector:'app-planner',standalone:true,imports:[CommonModule,FormsModule],template:`
<section class="page">
 <div *ngIf="loading" class="notice" role="status">Åpner lokal database …</div>
 <div *ngIf="error" class="notice error" role="alert">{{error}}</div>
 <div *ngIf="ready">
  <div class="panel planner-bar">
   <label>Aktivt prosjekt
    <select [(ngModel)]="activeId" (ngModelChange)="selectProject()">
     <option value="">Velg prosjekt</option><option *ngFor="let p of state.projects" [value]="p.id">{{p.name}}</option>
    </select>
   </label>
   <form (ngSubmit)="createProject()" class="inline-form"><label>Nytt prosjekt<input name="projectName" [(ngModel)]="project.name" required placeholder="F.eks. Solsiden Borettslag"></label><button [disabled]="busy || !project.name.trim()">Opprett prosjekt</button></form>
  </div>
  <ng-container *ngIf="activeId">
   <nav class="planner-tabs" aria-label="Prosjektsider">
    <button [class.selected]="tab==='overview'" (click)="tab='overview'">Oversikt</button>
    <button [class.selected]="tab==='buildings'" (click)="tab='buildings'">Bygg og leiligheter</button>
    <button [class.selected]="tab==='equipment'" (click)="tab='equipment'">Utstyr</button>
    <button [class.selected]="tab==='links'" (click)="tab='links'">Forbindelser</button>
    <button [class.selected]="tab==='backup'" (click)="tab='backup'">Sikkerhetskopi</button>
   </nav>
   <section *ngIf="tab==='overview'">
    <div class="stat-grid">
     <div class="panel stat"><strong>{{state.stats.buildings}}</strong><span>Bygg</span></div>
     <div class="panel stat"><strong>{{state.stats.entrances}}</strong><span>Oppganger</span></div>
     <div class="panel stat"><strong>{{state.stats.apartments}}</strong><span>Leiligheter</span></div>
     <div class="panel stat"><strong>{{state.stats.equipment}}</strong><span>Utstyrsenheter</span></div>
     <div class="panel stat"><strong>{{state.stats.links}}</strong><span>Forbindelser</span></div>
     <div class="panel stat"><strong>{{state.stats.freePorts}}</strong><span>Ledige porter</span></div>
    </div>
    <div class="panel"><h2>Arbeidsflyt</h2><p>Opprett bygg, deretter oppganger og leiligheter. Registrer utstyr med porter, og dokumenter til slutt forbindelsene.</p></div>
   </section>
   <section *ngIf="tab==='buildings'" class="stack">
    <form class="panel" (ngSubmit)="create('building.create',building)"><h2>Nytt bygg</h2>
     <div class="form-row"><label>Byggnavn<input name="name" [(ngModel)]="building.name" required placeholder="Blokk A"></label><label>Adresse<input name="address" [(ngModel)]="building.address" placeholder="Gate 1"></label></div>
     <button [disabled]="busy||!building.name.trim()">Legg til bygg</button>
    </form>
    <div class="panel"><h2>Registrerte bygg</h2><div class="record" *ngFor="let b of state.buildings"><strong>{{b.name}}</strong><span>{{b.address}} · {{b.entrances}} oppganger · {{b.apartments}} leiligheter</span></div><p class="micro" *ngIf="!state.buildings.length">Ingen bygg registrert.</p></div>
    <form class="panel" (ngSubmit)="create('entrance.create',entrance)"><h2>Ny oppgang</h2><div class="form-row">
     <label>Bygg<select name="building" [(ngModel)]="entrance.building_id" required><option value="">Velg bygg</option><option *ngFor="let b of state.buildings" [value]="b.id">{{b.name}}</option></select></label>
     <label>Oppgangsnummer<input name="code" [(ngModel)]="entrance.code" required placeholder="A / 1"></label>
     </div><button [disabled]="busy||!entrance.building_id||!entrance.code.trim()">Legg til oppgang</button></form>
    <div class="panel"><h2>Oppganger</h2><div class="record" *ngFor="let e of state.entrances"><strong>{{e.building_name}} · {{e.code}}</strong><span>{{e.apartments}} leiligheter</span></div></div>
    <form class="panel" (ngSubmit)="create('apartment.create',apartment)"><h2>Ny leilighet / fiberuttak</h2>
     <div class="form-row"><label>Oppgang<select name="entrance" [(ngModel)]="apartment.entrance_id" required><option value="">Velg oppgang</option><option *ngFor="let e of state.entrances" [value]="e.id">{{e.building_name}} / {{e.code}}</option></select></label>
      <label>Leilighetsnr.<input name="number" [(ngModel)]="apartment.number" required placeholder="H0101"></label>
      <label>Etasje<input name="floor" [(ngModel)]="apartment.floor" placeholder="1"></label>
      <label>Merknad<input name="note" [(ngModel)]="apartment.note"></label></div>
     <button [disabled]="busy||!apartment.entrance_id||!apartment.number.trim()">Legg til leilighet</button>
    </form>
    <div class="panel"><h2>Leiligheter</h2><div class="record" *ngFor="let a of state.apartments"><strong>{{a.number}}</strong><span>{{a.building_name}} / {{a.entrance_code}} · etasje {{a.floor || '–'}}</span></div></div>
   </section>
   <section *ngIf="tab==='equipment'" class="stack">
    <form class="panel" (ngSubmit)="create('equipment.create',equipment)"><h2>Registrer utstyr</h2>
     <div class="form-row"><label>Type<select name="kind" [(ngModel)]="equipment.kind">
       <option value="SWITCH">Svitsj</option><option value="ODF">ODF</option><option value="SPLICE_BOX">Skjøteboks</option><option value="DISTRIBUTION_BOX">Fordelingsboks</option></select></label>
       <label>Utstyr-ID<input name="code" [(ngModel)]="equipment.code" required placeholder="ODF-01"></label>
       <label>Plassering<input name="place" [(ngModel)]="equipment.place" placeholder="Teknisk rom"></label>
       <label>Antall porter<input name="ports" [(ngModel)]="equipment.port_count" type="number" min="1" max="4096" required></label>
     </div><button [disabled]="busy||!equipment.code.trim()||equipment.port_count<1||equipment.port_count>4096">Registrer</button>
    </form>
    <div class="panel"><h2>Utstyrsregister</h2><div class="record" *ngFor="let e of state.equipment"><strong>{{e.code}}</strong><span>{{labelEquipment(e.kind)}} · {{e.port_count}} porter · {{e.place || 'Ingen plassering'}}</span></div></div>
   </section>
   <section *ngIf="tab==='links'" class="stack">
    <form class="panel" (ngSubmit)="create('link.create',link)"><h2>Ny forbindelse</h2>
     <div class="form-row"><label>Fra port<select name="from" [(ngModel)]="link.from_port_id" required><option value="">Velg ledig port</option><option *ngFor="let p of freePorts" [value]="p.id">{{p.equipment_code}} / {{p.label}}</option></select></label>
     <label>Til port<select name="to" [(ngModel)]="link.to_port_id" required><option value="">Velg ledig port</option><option *ngFor="let p of freePorts" [value]="p.id">{{p.equipment_code}} / {{p.label}}</option></select></label>
     <label>Type<select name="kind" [(ngModel)]="link.kind"><option value="CABLE">Kabel</option><option value="PATCH">Patch</option><option value="SPLICE">Skjøt</option></select></label>
     <label>Kabel-ID<input name="cable_id" [(ngModel)]="link.cable_id" placeholder="K-001"></label>
     <label>Fibernummer<input name="fiber_no" [(ngModel)]="link.fiber_no" placeholder="1"></label>
     <label>Merknad<input name="note" [(ngModel)]="link.note"></label></div>
     <p class="micro">Ved kabel er kabel-ID og fibernummer obligatorisk. Samme port kan ikke brukes i flere forbindelser.</p>
     <button [disabled]="busy||!link.from_port_id||!link.to_port_id||link.from_port_id===link.to_port_id||(link.kind==='CABLE'&&(!link.cable_id.trim()||!link.fiber_no.trim()))">Registrer forbindelse</button>
    </form>
    <div class="panel"><h2>Forbindelser</h2><div class="record row-record" *ngFor="let l of state.links"><div><strong>{{l.from_label}} → {{l.to_label}}</strong><span>{{l.kind}} · {{l.cable_id}} {{l.fiber_no}} {{l.note}}</span></div><button type="button" class="danger" (click)="deleteLink(l.id)">Slett</button></div><p class="micro" *ngIf="!state.links.length">Ingen forbindelser.</p></div>
   </section>
   <section *ngIf="tab==='backup'" class="stack">
    <div class="panel"><h2>SQLite-sikkerhetskopi</h2><p>Eksporter hele prosjektregisteret til en SQLite-fil. Lagre filen på et sikkert sted – sletting av nettleserdata kan fjerne databasen.</p>
     <button (click)="backup()">Eksporter SQLite</button>
     <label class="import-label">Importer databasefil (erstatter alle lokale data)
      <input type="file" accept=".sqlite3,.sqlite,.db,application/x-sqlite3" (change)="restore($event)">
     </label>
    </div>
   </section>
  </ng-container>
  <div class="panel empty-state" *ngIf="!activeId"><h2>Opprett eller velg et prosjekt</h2><p>Prosjektene ligger lokalt på denne enheten og sendes ikke til GitHub.</p></div>
 </div>
</section>`})
export class PlannerComponent implements OnInit{
 ready=false;loading=true;busy=false;error='';activeId='';tab='overview';
 state:Snapshot=blank();
 project={name:'',customer:'',reference:''};
 building={name:'',address:''};
 entrance={building_id:'',code:''};
 apartment={entrance_id:'',number:'',floor:'',note:''};
 equipment={kind:'ODF',code:'',place:'',port_count:24};
 link={from_port_id:'',to_port_id:'',kind:'CABLE',cable_id:'',fiber_no:'',note:''};
 constructor(private db:DatabaseService){}
 get freePorts(){return this.state.ports.filter(p=>p.link_count===0);}
 labelEquipment(k:string){return ({SWITCH:'Svitsj',ODF:'ODF',SPLICE_BOX:'Skjøteboks',DISTRIBUTION_BOX:'Fordelingsboks',OUTLET:'Fiberuttak'} as Record<string,string>)[k]||k;}
 async ngOnInit(){try{await this.db.call('initialize');this.ready=true;try{this.activeId=localStorage.getItem('fiberplan_active')||'';}catch{}await this.reload();}catch(e){this.error=this.message(e);}finally{this.loading=false;}}
 message(e:unknown){return e instanceof Error?e.message:String(e);}
 async reload(){this.state=await this.db.call<Snapshot>('snapshot',{project_id:this.activeId});if(this.activeId&&!this.state.projects.some(p=>p.id===this.activeId)){this.activeId='';this.state=await this.db.call('snapshot',{project_id:''});}}
 async selectProject(){try{localStorage.setItem('fiberplan_active',this.activeId);}catch{}await this.reload();}
 async createProject(){
  if(!this.project.name.trim())return;
  this.busy=true;this.error='';
  try{this.activeId=await this.db.call<string>('project.create',this.project);this.project={name:'',customer:'',reference:''};await this.selectProject();this.tab='overview';}catch(e){this.error=this.message(e);}finally{this.busy=false;}
 }
 async create(method:string,form:Record<string,any>){
  this.busy=true;this.error='';
  try{await this.db.call(method,{...form,project_id:this.activeId});await this.reload();
   if(method==='building.create')this.building={name:'',address:''};
   if(method==='entrance.create')this.entrance={building_id:'',code:''};
   if(method==='apartment.create')this.apartment={entrance_id:'',number:'',floor:'',note:''};
   if(method==='equipment.create')this.equipment={kind:'ODF',code:'',place:'',port_count:24};
   if(method==='link.create')this.link={from_port_id:'',to_port_id:'',kind:'CABLE',cable_id:'',fiber_no:'',note:''};
  }catch(e){this.error=this.message(e);}finally{this.busy=false;}
 }
 async deleteLink(id:string){if(!confirm('Slette forbindelsen?'))return;this.busy=true;try{await this.db.call('link.delete',{id,project_id:this.activeId});await this.reload();}catch(e){this.error=this.message(e);}finally{this.busy=false;}}
 async backup(){this.error='';try{const bytes=await this.db.call<ArrayBuffer>('backup.export');const url=URL.createObjectURL(new Blob([bytes],{type:'application/x-sqlite3'}));const link=document.createElement('a');link.href=url;link.download='fiberplan-'+new Date().toISOString().slice(0,10)+'.sqlite3';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}catch(e){this.error=this.message(e);}}
 async restore(event:Event){
  const el=event.target as HTMLInputElement;const file=el.files?.[0];if(!file)return;
  if(!confirm('Erstatt ALLE lokale prosjektdata med '+file.name+'? Ta sikkerhetskopi først.')){el.value='';return;}
  this.error='';try{const bytes=await file.arrayBuffer();await this.db.call('backup.import',{bytes},[bytes]);this.activeId='';await this.selectProject();this.tab='overview';}catch(e){this.error=this.message(e);}finally{el.value='';}
 }
}
