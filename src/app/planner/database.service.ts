import {Injectable} from '@angular/core';
@Injectable({providedIn:'root'})
export class DatabaseService{
 private worker=new Worker(new URL('./db.worker',import.meta.url),{type:'module',name:'fiberplaner-sqlite'});
 private serial=1;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 constructor(){
  this.worker.onmessage=(event:MessageEvent<{id:number;ok:boolean;data:any;error?:string}>)=>{const m=event.data;const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.ok?p.resolve(m.data):p.reject(new Error(m.error||'Databasefeil'));};
  this.worker.onerror=e=>{for(const p of this.pending.values())p.reject(new Error(e.message||'Worker-feil'));this.pending.clear();};
 }
 call<T=any>(method:string,data:Record<string,any>={},transfer:Transferable[]=[]):Promise<T>{
  return new Promise((resolve,reject)=>{const id=this.serial++;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,data,base:document.baseURI},transfer);});
 }
}
