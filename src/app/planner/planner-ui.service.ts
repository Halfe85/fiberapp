import {Injectable,signal} from '@angular/core';

/** Project-list creation and project settings dialog state. */
@Injectable({providedIn:'root'})
export class PlannerUiService {
  readonly createOpen=signal(false);
  openCreate():void{this.createOpen.set(true);}
  closeCreate():void{this.createOpen.set(false);}
}
