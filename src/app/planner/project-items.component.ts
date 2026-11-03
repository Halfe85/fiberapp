import {CommonModule} from '@angular/common';
import {Component,HostListener,Input,OnDestroy,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {PlannerUiService} from './planner-ui.service';

type ItemKind='address'|'equipment';
interface ProjectItem {
  id:string;
  projectId:string;
  kind:ItemKind;
  name:string;
  note:string;
  equipmentType:string;
  createdAt:string;
}
const KEY='fiberapp.planner.items.v1';

@Component({
  selector:'app-project-items',
  standalone:true,
  imports:[CommonModule,FormsModule],
  template:`
    <div class="planner-item-groups" *ngIf="addressItems.length || equipmentItems.length">
      <section class="planner-item-section" *ngIf="addressItems.length">
        <h3>Adresser</h3>
        <div class="planner-item-list">
          <article class="planner-item-row" *ngFor="let item of addressItems; trackBy:trackId">
            <strong>{{item.name}}</strong>
            <p *ngIf="item.note">{{item.note}}</p>
          </article>
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
    <div class="planner-modal-backdrop" *ngIf="ui.itemModal()" (click)="close()">
      <section class="planner-modal planner-item-modal" role="dialog" aria-modal="true"
               aria-labelledby="ng-item-dialog-title" (click)="$event.stopPropagation()">
        <div class="dialog-head">
          <h2 id="ng-item-dialog-title">{{ui.itemModal()==='address' ? 'Ny adresse' : 'Nytt utstyr'}}</h2>
          <button type="button" class="close-button" aria-label="Lukk" (click)="close()">×</button>
        </div>
        <form (ngSubmit)="create()">
          <label for="ng-item-name">{{ui.itemModal()==='address' ? 'Adresse *' : 'Utstyrsnavn / ID *'}}</label>
          <input id="ng-item-name" type="text" name="itemName" required maxlength="120"
                 [(ngModel)]="name" autocomplete="off"
                 [placeholder]="ui.itemModal()==='address' ? 'Gateadresse' : 'F.eks. ODF-01'">
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
          <label for="ng-item-note">Beskrivelse (valgfritt)</label>
          <textarea id="ng-item-note" name="itemNote" rows="3" maxlength="300"
                    [(ngModel)]="note"></textarea>
          <div class="notice error" *ngIf="modalError" role="alert">{{modalError}}</div>
          <div class="dialog-actions">
            <button type="button" class="secondary" (click)="close()">Avbryt</button>
            <button type="submit" [disabled]="!name.trim() || !canSave">Legg til</button>
          </div>
        </form>
      </section>
    </div>
  `
})
export class ProjectItemsComponent implements OnInit,OnDestroy {
  @Input({required:true}) projectId!:string;
  items:ProjectItem[]=[];
  canSave=true;
  storageError='';
  modalError='';
  name='';
  note='';
  equipmentType='Annet';
  constructor(public readonly ui:PlannerUiService){}
  get addressItems():ProjectItem[]{
    return this.items.filter(i=>i.projectId===this.projectId && i.kind==='address');
  }
  get equipmentItems():ProjectItem[]{
    return this.items.filter(i=>i.projectId===this.projectId && i.kind==='equipment');
  }
  trackId(_index:number,item:ProjectItem):string{return item.id;}
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
  ngOnDestroy():void{this.ui.closeItem();}
  close():void{
    this.ui.closeItem();
    this.name='';
    this.note='';
    this.equipmentType='Annet';
    this.modalError='';
  }
  @HostListener('document:keydown.escape')
  onEscape():void{if(this.ui.itemModal())this.close();}
  create():void{
    const kind=this.ui.itemModal();
    if(!kind || !this.projectId || !this.canSave)return;
    const name=this.name.trim().replace(/\s+/g,' ');
    const note=this.note.trim();
    if(!name || name.length>120 || note.length>300){
      this.modalError='Navnet må ha 1–120 tegn, beskrivelse maks 300 tegn.';
      return;
    }
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID()
      :'item-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const next:ProjectItem[]=[...this.items,{
      id,projectId:this.projectId,kind,name,note,
      equipmentType:kind==='equipment'?this.equipmentType:'',
      createdAt:new Date().toISOString()
    }];
    try{
      localStorage.setItem(KEY,JSON.stringify(next));
      this.items=next;
      this.storageError='';
      this.close();
    }catch{
      this.modalError='Kunne ikke lagre. Kontroller nettleserlagringen.';
    }
  }
}
