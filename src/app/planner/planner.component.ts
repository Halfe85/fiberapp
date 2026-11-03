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
      <article class="panel project-row" *ngFor="let item of sortedProjects; trackBy:trackId">
        <div class="project-info">
          <strong>{{item.name}}</strong>
          <p *ngIf="item.description">{{item.description}}</p>
        </div>
        <time class="project-created" [attr.datetime]="item.createdAt">{{formatDate(item.createdAt)}}</time>
      </article>
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
        <h2 id="planner-dialog-title">Nytt prosjekt</h2>
        <button type="button" class="close-button" aria-label="Lukk" (click)="close()">×</button>
      </div>
      <form (ngSubmit)="createProject()">
        <label for="ng-project-name">Prosjektnavn *</label>
        <input id="ng-project-name" name="name" type="text" required maxlength="80"
               [(ngModel)]="name" autocomplete="off" autofocus placeholder="F.eks. Solsiden borettslag">
        <label for="ng-project-description">Beskrivelse (valgfritt)</label>
        <textarea id="ng-project-description" name="description" [(ngModel)]="description"
                  maxlength="300" rows="3" placeholder="Kort beskrivelse av prosjektet"></textarea>
        <div class="notice error" *ngIf="formError" role="alert">{{formError}}</div>
        <div class="dialog-actions">
          <button type="button" class="secondary" (click)="close()">Avbryt</button>
          <button type="submit" [disabled]="!name.trim() || !storageAvailable">Opprett prosjekt</button>
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
  constructor(public readonly ui:PlannerUiService){}
  get sortedProjects():Project[]{
    return [...this.projects].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
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
  close():void{
    this.ui.closeCreate();
    this.name='';
    this.description='';
    this.formError='';
  }
  @HostListener('document:keydown.escape')
  onEscape():void{if(this.ui.createOpen())this.close();}
  createProject():void{
    if(!this.storageAvailable)return;
    const name=this.name.trim().replace(/\s+/g,' ');
    const description=this.description.trim();
    if(!name || name.length>80 || description.length>300){
      this.formError='Prosjektnavn må ha 1–80 tegn; beskrivelse maks 300.';
      return;
    }
    if(this.projects.some(p=>p.name.toLocaleLowerCase('nb-NO')===name.toLocaleLowerCase('nb-NO'))){
      this.formError='Prosjektnavnet er allerede i bruk.';
      return;
    }
    const now=new Date().toISOString();
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID()
      :'project-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const next:Project[]=[{id,name,description,createdAt:now,updatedAt:now},...this.projects];
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      this.projects=next;
      this.error='';
      this.close();
    }catch{
      this.formError='Kunne ikke lagre prosjektet. Kontroller nettleserlagringen.';
    }
  }
}
