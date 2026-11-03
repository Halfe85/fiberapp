import {Component} from '@angular/core';
import {RouterLink,RouterLinkActive,RouterOutlet} from '@angular/router';
@Component({selector:'app-root',standalone:true,imports:[RouterLink,RouterLinkActive,RouterOutlet],
 template:`<header class="topbar"><div class="topinner"><a routerLink="/" class="brand" aria-label="Fiberapp forside">FIBER<span>APP</span></a><nav aria-label="Hovedmeny"><a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Forside</a><a routerLink="/finder" routerLinkActive="active">Fiberfinder</a><a routerLink="/planner" routerLinkActive="active">Fiber Planner</a></nav></div></header><main><router-outlet/></main><footer class="footer">Fiberapp · Lokal først · Ingen brukerkonto</footer>`})
export class AppComponent {}
