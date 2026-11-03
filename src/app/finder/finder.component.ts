import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {colorCodes,standard12ColorCodes,tubeSizes,lookupFibers,FiberResult} from './fiber-codes';

@Component({
 selector:'app-finder', standalone:true, imports:[CommonModule,FormsModule],
 template:`
 <section class="page narrow">
  <div class="eyebrow">VERKTØY / FARGEKODER</div>
  <h1>Fiberfinder</h1>
  <p class="lead">Finn røret og fiberfargen. Støtter flere fibernummer i samme søk.</p>
  <div class="panel form-grid">
   <label>Fargekode
    <select [(ngModel)]="code" (ngModelChange)="onCodeChange()">
     <option *ngFor="let name of codes" [value]="name">{{name}}</option>
    </select>
   </label>
   <div class="two-col">
    <label>Fibre per rør
     <select [(ngModel)]="perTube" (ngModelChange)="calculate()" [disabled]="fixed">
      <option *ngFor="let size of sizes" [ngValue]="size">{{size}}</option>
     </select>
    </label>
    <label>Fibernummer
     <input [(ngModel)]="numbers" (ngModelChange)="calculate()" inputmode="text" autocomplete="off" placeholder="55 eller 13,14">
    </label>
   </div>
   <p class="micro" *ngIf="fixed">Denne fargekoden har fast rørstørrelse.</p>
  </div>
  <div *ngIf="error" class="notice error" role="alert">{{error}}</div>
  <div class="result-list" aria-live="polite">
   <article class="panel result" *ngFor="let item of rows">
    <div class="eyebrow">FIBER {{item.fiber}}</div>
    <div class="result-metrics">
     <div class="tube-box"><small>RØR</small><strong>{{item.tube}}</strong></div>
     <div class="color-box" [style.--fiber-color]="item.displayColor.css" [class.striped]="item.striped" [class.clear]="item.displayColor.clear" [class.color-dark]="item.displayColor.dark">
      <small>FIBERFARGE</small><strong>{{item.displayName}}</strong>
     </div>
    </div>
    <div class="detail-grid">
     <div><span>Posisjon i rør</span><strong>{{item.position}} / {{perTube}}</strong></div>
     <div><span>Rørets fiberområde</span><strong>{{item.first}}–{{item.last}}</strong></div>
    </div>
   </article>
  </div>
  <p class="micro">Fargekoder overført fra eksisterende Fiberfinder uten endring i rekkefølgen.</p>
 </section>`
})
export class FinderComponent implements OnInit {
 codes=Object.keys(colorCodes); sizes=tubeSizes;
 code='OPGW / TIA-598'; perTube=12; numbers='55'; rows:FiberResult[]=[]; error='';
 get fixed(){return !standard12ColorCodes.has(this.code);}
 ngOnInit(){
  try {const state=JSON.parse(localStorage.getItem('fiberFinder')||'{}');
    if(colorCodes[state.colorCode])this.code=state.colorCode;
    if(tubeSizes.includes(Number(state.fibersPerTube)))this.perTube=Number(state.fibersPerTube);
    if(typeof state.fiberNumber==='string')this.numbers=state.fiberNumber;
  }catch{}
  this.onCodeChange();
 }
 onCodeChange(){if(this.fixed)this.perTube=colorCodes[this.code].length;this.calculate();}
 calculate(){
   const {rows,error}=lookupFibers(this.code,this.perTube,this.numbers);
   this.rows=rows;this.error=error;
   try{localStorage.setItem('fiberFinder',JSON.stringify({colorCode:this.code,fibersPerTube:this.perTube,fiberNumber:this.numbers}));}catch{}
 }
}
