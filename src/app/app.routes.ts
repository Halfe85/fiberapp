import {Routes} from '@angular/router';
import {HomeComponent} from './home.component';
import {FinderComponent} from './finder/finder.component';
import {PlannerComponent} from './planner/planner.component';
export const routes:Routes=[
 {path:'',component:HomeComponent},
 {path:'finder',component:FinderComponent},
 {path:'planner',component:PlannerComponent},
 {path:'**',redirectTo:''}
];
