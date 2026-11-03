import {Component,ElementRef,HostListener,ViewChild} from '@angular/core';
import {Router,RouterLink,RouterLinkActive,RouterOutlet} from '@angular/router';

@Component({
 selector:'app-root',
 standalone:true,
 imports:[RouterLink,RouterLinkActive,RouterOutlet],
 template:`
  <header class="topbar"><div class="topinner" #navigation>
    <button type="button" class="menu-toggle header-icon"
       [attr.aria-label]="menuOpen ? 'Lukk meny' : 'Åpne meny'"
       [attr.aria-expanded]="menuOpen" aria-controls="app-menu" title="Meny"
       (click)="toggleMenu()"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
    <a routerLink="/" class="brand" aria-label="FiberApp forside" (click)="closeMenu()">FIBER<span>APP</span></a>
    <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}"
       class="home-link header-icon" aria-label="Hjem" title="Hjem" (click)="closeMenu()"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-8h6v8"/></svg></a>
    <nav id="app-menu" class="site-menu" aria-label="Verktøymeny" [hidden]="!menuOpen">
      <a routerLink="/finder" routerLinkActive="active" (click)="closeMenu()">Fiberfinder</a>
      <a routerLink="/planner" routerLinkActive="active" (click)="closeMenu()">Fiber Planner</a>
    </nav>
  </div></header>
  <main><router-outlet/></main>
  @if (router.url === '/') {
    <footer class="home-bottom-bar"><div class="footer-container"><h1>Fiberverktøy samlet på ett sted.</h1></div></footer>
  } @else {
    <footer class="footer">Fiberapp · Lokal først · Ingen brukerkonto</footer>
  }`
})
export class AppComponent {
 menuOpen=false;
 @ViewChild('navigation') navigation?:ElementRef<HTMLElement>;
 constructor(public readonly router:Router){}
 toggleMenu():void {this.menuOpen=!this.menuOpen;}
 closeMenu():void {this.menuOpen=false;}
 @HostListener('document:keydown.escape')
 onEscape():void {this.closeMenu();}
 @HostListener('document:pointerdown',['$event'])
 onOutsideClick(event:PointerEvent):void {
   if(this.menuOpen && this.navigation && !this.navigation.nativeElement.contains(event.target as Node)) this.closeMenu();
 }
}
