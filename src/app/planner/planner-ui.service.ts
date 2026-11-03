import {Injectable,signal} from '@angular/core';

/** Header action and Planner dialog state. Persistence is intentionally separate. */
@Injectable({providedIn:'root'})
export class PlannerUiService {
  readonly createOpen=signal(false);
  openCreate():void{this.createOpen.set(true);}
  closeCreate():void{this.createOpen.set(false);}
}
