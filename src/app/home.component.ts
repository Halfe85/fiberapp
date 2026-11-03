import {Component} from '@angular/core';
import {RouterLink} from '@angular/router';
@Component({selector:'app-home',standalone:true,imports:[RouterLink],template:`
 <section class="page home">
  <div class="eyebrow">FIBERAPP / FELTVERKTØY</div>
  <h1>Fiberverktøy samlet på ett sted.</h1>
  <p class="lead">Raskt oppslag og strukturert dokumentasjon for fiberanlegg – tilpasset mobil og PC.</p>
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
  <div class="home-note"><strong>Lokal datalagring</strong><p>Fiber Planner lagrer prosjekter i SQLite på enheten. Ta jevnlige sikkerhetskopier. GitHub brukes kun til å publisere applikasjonen.</p></div>
 </section>`})
export class HomeComponent {}
