import {Component} from '@angular/core';
import {FinderComponent} from './finder/finder.component';
@Component({selector:'app-root',standalone:true,imports:[FinderComponent],template:`<header class="topbar"><div class="topinner"><b>FIBER<span>APP</span></b><span>Fiberfinder / Angular</span></div></header><app-finder/>`,styles:[`.topbar{background:#fff;border-bottom:1px solid #e0e8f1}.topinner{max-width:1160px;margin:auto;padding:17px 20px;display:flex;justify-content:space-between;align-items:center;color:#738398;font-size:13px}.topinner b{color:#133657;letter-spacing:.04em;font-size:17px}.topinner b span{color:#2476ae}`]})
export class AppComponent{}
