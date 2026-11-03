import {Injectable,signal} from '@angular/core';

/** Header action and Planner dialog state. Persistence is intentionally separate. */
@Injectable({providedIn:'root'})
export class PlannerUiService {
  readonly createOpen=signal(false);
  readonly projectOpen=signal(false);
  readonly itemModal=signal<'address'|'equipment'|null>(null);
  openItem(kind:'address'|'equipment'):void{this.itemModal.set(kind);}
  closeItem():void{this.itemModal.set(null);}
  openCreate():void{this.createOpen.set(true);}
  closeCreate():void{this.createOpen.set(false);}
}
