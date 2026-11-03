import {Component} from '@angular/core';
import {RouterLink} from '@angular/router';
@Component({selector:'app-home',standalone:true,imports:[RouterLink],template:`
 <section class="page home">
  <div class="tile-grid">
   <a class="tool-tile" routerLink="/finder"><span class="tile-icon" aria-hidden="true">01</span>
    <span class="tile-title">Fiberfinder</span><span class="tile-sub">Finn rør, fiberfarge og posisjon fra fibernummeret.</span>
    <span class="tile-action">Åpne Fiberfinder <span aria-hidden="true">→</span></span>
   </a>
   <a class="tool-tile" routerLink="/planner"><span class="tile-icon" aria-hidden="true">02</span>
    <span class="tile-title">Fiber Planner</span><span class="tile-sub">Prosjekter boligblokker, oppganger, leiligheter, utstyr og fiberforbindelser.</span>
    <span class="tile-action">Åpne Fiber Planner <span aria-hidden="true">→</span></span>
   </a>
  </div>
 </section>`})
export class HomeComponent {}
