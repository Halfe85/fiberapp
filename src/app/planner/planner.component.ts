import {CommonModule} from '@angular/common';
import {Component,HostListener,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {PlannerUiService} from './planner-ui.service';

interface Project {
  id:string;
  name:string;
  description:string;
  createdAt:string;
  updatedAt:string;
}
const STORAGE_KEY='fiberapp.planner.projects.v1';

@Component({
  selector:'app-planner',
  standalone:true,
  imports:[CommonModule,FormsModule],
  template:`
  <section class="page planner-projects" aria-labelledby="planner-projects-title">
    <div class="projects-heading">
      <h2 id="planner-projects-title">Prosjekter</h2>
      <span class="project-count" aria-live="polite">
        {{projects.length}} {{projects.length===1 ? 'prosjekt' : 'prosjekter'}}
      </span>
    </div>
    <div class="notice error" *ngIf="error" role="alert">{{error}}</div>
    <div class="project-rows" *ngIf="projects.length; else emptyProjects">
      <div class="project-swipe" *ngFor="let item of sortedProjects; trackBy:trackId"
           [class.open]="openProjectId===item.id"
           (pointerdown)="onProjectPointerDown($event,item.id)"
           (pointerup)="onProjectPointerUp($event,item.id)"
           (pointercancel)="pointerStart=null">
        <button type="button" class="project-tool" title="Prosjektinnstillinger"
                [attr.aria-label]="'Innstillinger for '+item.name"
                (click)="openSettings(item)">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7.8 7.8a2.12 2.12 0 0 1-3-3l7.8-7.8a6 6 0 0 1 7.9-7.9z"/>
          </svg>
        </button>
        <article class="panel project-row">
          <div class="project-info">
            <strong>{{item.name}}</strong>
            <p *ngIf="item.description">{{item.description}}</p>
          </div>
          <time class="project-created" [attr.datetime]="item.createdAt">{{formatDate(item.createdAt)}}</time>
        </article>
      </div>
    </div>
    <ng-template #emptyProjects>
      <div class="empty-projects">
        <span class="empty-symbol" aria-hidden="true">+</span>
        <h3>Ingen prosjekter ennå</h3>
        <p>Trykk på + i headeren for å opprette et prosjekt.</p>
      </div>
    </ng-template>
  </section>
  <div class="planner-modal-backdrop" *ngIf="ui.createOpen()" (click)="close()">
    <section class="planner-modal" role="dialog" aria-modal="true"
             aria-labelledby="planner-dialog-title" (click)="$event.stopPropagation()">
      <div class="dialog-head">
        <h2 id="planner-dialog-title">{{deleting ? 'Slett prosjekt' : (editingId ? 'Prosjektinnstillinger' : 'Nytt prosjekt')}}</h2>
        <button type="button" class="close-button" aria-label="Lukk" (click)="close()">×</button>
      </div>
      <form *ngIf="!deleting" (ngSubmit)="createProject()">
        <label for="ng-project-name">Prosjektnavn *</label>
        <input id="ng-project-name" name="name" type="text" required maxlength="80"
               [(ngModel)]="name" autocomplete="off" autofocus placeholder="F.eks. Solsiden borettslag">
        <label for="ng-project-description">Beskrivelse (valgfritt)</label>
        <textarea id="ng-project-description" name="description" [(ngModel)]="description"
                  maxlength="300" rows="3" placeholder="Kort beskrivelse av prosjektet"></textarea>
        <div class="notice error" *ngIf="formError" role="alert">{{formError}}</div>
        <div class="dialog-actions">
          <button *ngIf="editingId" type="button" class="delete-open-button" (click)="requestDelete()">Slett prosjekt</button>
          <button type="button" class="secondary" (click)="close()">Avbryt</button>
          <button type="submit" [disabled]="!name.trim() || !storageAvailable">{{editingId ? 'Lagre endringer' : 'Opprett prosjekt'}}</button>
        </div>
      </form>
      <form *ngIf="deleting" class="delete-project-form" (ngSubmit)="confirmDelete()">
        <p class="delete-warning">Dette sletter prosjektet permanent fra denne nettleseren. Skriv inn prosjektets navn nøyaktig for å bekrefte.</p>
        <p class="delete-target-name"><strong id="ng-delete-project-target">{{deletionTargetName}}</strong></p>
        <label for="ng-delete-project-name">Skriv inn prosjektnavnet for å slette</label>
        <input id="ng-delete-project-name" name="confirmation" type="text"
               [(ngModel)]="deleteConfirmation" autocomplete="off" spellcheck="false"
               aria-describedby="ng-delete-project-target" required>
        <div class="notice error" *ngIf="deleteError" role="alert">{{deleteError}}</div>
        <div class="dialog-actions">
          <button type="button" class="secondary" (click)="cancelDelete()">Tilbake</button>
          <button type="submit" class="delete-confirm-button"
                  [disabled]="!storageAvailable || !deletionTargetName || deleteConfirmation !== deletionTargetName">Slett prosjekt</button>
        </div>
      </form>
    </section>
  </div>
  `
})
export class PlannerComponent implements OnInit {
  projects:Project[]=[];
  error='';
  formError='';
  name='';
  description='';
  storageAvailable=true;
  openProjectId:string|null=null;
  editingId:string|null=null;
  deleting=false;
  deleteConfirmation='';
  deleteError='';
  pointerStart:{x:number;y:number;pointerId:number;projectId:string}|null=null;
  constructor(public readonly ui:PlannerUiService){}
  get sortedProjects():Project[]{
    return [...this.projects].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  get deletionTargetName():string{
    return this.projects.find(p=>p.id===this.editingId)?.name||'';
  }
  trackId(_index:number,item:Project):string{return item.id;}
  formatDate(value:string):string{
    const date=new Date(value);
    return Number.isFinite(date.valueOf())?date.toLocaleDateString('nb-NO'):'';
  }
  ngOnInit():void{
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return;
      const parsed:unknown=JSON.parse(raw);
      if(!Array.isArray(parsed))throw Error('Ugyldige prosjektdata');
      this.projects=parsed.filter((value:unknown):value is Project=>{
        if(!value || typeof value!=='object')return false;
        const p=value as Partial<Project>;
        return typeof p.id==='string' && typeof p.name==='string' && typeof p.createdAt==='string';
      });
    }catch{
      this.storageAvailable=false;
      this.error='Kunne ikke lese lagrede prosjekter. Eksisterende data er ikke overskrevet.';
    }
  }
  onProjectPointerDown(event:PointerEvent,id:string):void{
    if(event.button!==0 || (event.target as Element).closest('.project-tool'))return;
    this.pointerStart={x:event.clientX,y:event.clientY,pointerId:event.pointerId,projectId:id};
  }
  onProjectPointerUp(event:PointerEvent,id:string):void{
    const start=this.pointerStart;
    this.pointerStart=null;
    if(!start || start.pointerId!==event.pointerId || start.projectId!==id)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dx)<35 || Math.abs(dx)<Math.abs(dy)*1.2)return;
    if(dx<0)this.openProjectId=id;
    else if(this.openProjectId===id)this.openProjectId=null;
  }
  openSettings(item:Project):void{
    this.deleting=false;
    this.deleteConfirmation='';
    this.deleteError='';
    this.editingId=item.id;
    this.name=item.name;
    this.description=item.description||'';
    this.formError='';
    this.ui.openCreate();
  }
  requestDelete():void{
    if(!this.storageAvailable || !this.editingId || !this.deletionTargetName){
      this.formError='Prosjektet finnes ikke lenger eller lokal lagring er utilgjengelig.';
      return;
    }
    this.deleteConfirmation='';
    this.deleteError='';
    this.deleting=true;
  }
  cancelDelete():void{
    this.deleting=false;
    this.deleteConfirmation='';
    this.deleteError='';
  }
  confirmDelete():void{
    const project=this.projects.find(p=>p.id===this.editingId);
    if(!this.storageAvailable || !project || this.deleteConfirmation!==project.name){
      this.deleteError='Prosjektnavnet må være identisk med det som vises over.';
      return;
    }
    const next=this.projects.filter(p=>p.id!==project.id);
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      this.projects=next;
      this.error='';
      this.openProjectId=null;
      this.close();
    }catch{
      this.deleteError='Prosjektet kunne ikke slettes. Kontroller nettleserlagringen.';
    }
  }
  close():void{
    this.ui.closeCreate();
    this.editingId=null;
    this.deleting=false;
    this.deleteConfirmation='';
    this.deleteError='';
    this.name='';
    this.description='';
    this.formError='';
  }
  @HostListener('document:keydown.escape')
  onEscape():void{
    if(this.ui.createOpen())this.close();
    else this.openProjectId=null;
  }
  @HostListener('document:pointerdown',['$event'])
  onOutside(event:PointerEvent):void{
    if(this.openProjectId && !(event.target as Element).closest('.project-swipe'))this.openProjectId=null;
  }
  createProject():void{
    if(!this.storageAvailable)return;
    const name=this.name.trim().replace(/\s+/g,' ');
    const description=this.description.trim();
    if(!name || name.length>80 || description.length>300){
      this.formError='Prosjektnavn må ha 1–80 tegn; beskrivelse maks 300.';
      return;
    }
    if(this.projects.some(p=>p.id!==this.editingId &&
      p.name.toLocaleLowerCase('nb-NO')===name.toLocaleLowerCase('nb-NO'))){
      this.formError='Prosjektnavnet er allerede i bruk.';
      return;
    }
    const now=new Date().toISOString();
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID()
      :'project-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const next:Project[]=this.editingId
      ? this.projects.map(p=>p.id===this.editingId?{...p,name,description,updatedAt:now}:p)
      : [{id,name,description,createdAt:now,updatedAt:now},...this.projects];
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      this.projects=next;
      this.error='';
      this.openProjectId=null;
      this.close();
    }catch{
      this.formError='Kunne ikke lagre prosjektet. Kontroller nettleserlagringen.';
    }
  }
}
