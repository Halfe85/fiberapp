/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {SCHEMA} from './schema';
type Payload={id:number;method:string;data?:Record<string,any>;base?:string};
let db:any;let pool:any;
const FILE='/fiberplan.sqlite3';
const str=(v:any)=>String(v??'').trim();
const id=()=>crypto.randomUUID();
function ok(check:unknown,message:string):asserts check{if(!check)throw Error(message);}
function exec(sql:string,bind:any[]=[]){db.exec({sql,bind});}
function query(sql:string,bind:any[]=[]):any[]{return db.selectObjects(sql,bind);}
function scalar(sql:string,bind:any[]=[]):number{return Number(db.selectValue(sql,bind)??0);}
function validProject(project:string){ok(scalar('SELECT COUNT(*) FROM projects WHERE id=?',[project])>0,'Prosjektet finnes ikke.');}
function belongs(project:string,port:string){return scalar('SELECT COUNT(*) FROM ports p JOIN equipment e ON e.id=p.equipment_id WHERE p.id=? AND e.project_id=?',[port,project])>0;}
function snapshot(project:string){
 const projects=query('SELECT * FROM projects ORDER BY name COLLATE NOCASE');
 const empty={projects,buildings:[],entrances:[],apartments:[],equipment:[],ports:[],links:[],stats:{buildings:0,entrances:0,apartments:0,equipment:0,links:0,ports:0,freePorts:0}};
 if(!projects.some(p=>p.id===project))return empty;
 const buildings=query('SELECT b.*,COUNT(DISTINCT e.id) entrances,COUNT(DISTINCT a.id) apartments FROM buildings b LEFT JOIN entrances e ON e.building_id=b.id LEFT JOIN apartments a ON a.entrance_id=e.id WHERE b.project_id=? GROUP BY b.id ORDER BY b.name',[project]);
 const entrances=query('SELECT e.*,b.name building_name,COUNT(a.id) apartments FROM entrances e JOIN buildings b ON b.id=e.building_id LEFT JOIN apartments a ON a.entrance_id=e.id WHERE b.project_id=? GROUP BY e.id ORDER BY b.name,e.code',[project]);
 const apartments=query('SELECT a.*,e.code entrance_code,b.name building_name FROM apartments a JOIN entrances e ON e.id=a.entrance_id JOIN buildings b ON b.id=e.building_id WHERE b.project_id=? ORDER BY b.name,e.code,a.number',[project]);
 const equipment=query('SELECT * FROM equipment WHERE project_id=? ORDER BY kind,code',[project]);
 const ports=query('SELECT p.id,p.label,p.equipment_id,e.code equipment_code,e.kind equipment_kind,(SELECT COUNT(*) FROM links l WHERE l.from_port_id=p.id OR l.to_port_id=p.id) link_count FROM ports p JOIN equipment e ON e.id=p.equipment_id WHERE e.project_id=? ORDER BY e.code,p.position',[project]);
 const links=query("SELECT l.*,f.code || ' / ' || fp.label from_label,t.code || ' / ' || tp.label to_label FROM links l JOIN ports fp ON fp.id=l.from_port_id JOIN equipment f ON f.id=fp.equipment_id JOIN ports tp ON tp.id=l.to_port_id JOIN equipment t ON t.id=tp.equipment_id WHERE l.project_id=? ORDER BY l.rowid DESC",[project]);
 return {projects,buildings,entrances,apartments,equipment,ports,links,stats:{buildings:buildings.length,entrances:entrances.length,apartments:apartments.length,equipment:equipment.length,links:links.length,ports:ports.length,freePorts:ports.filter(p=>p.link_count===0).length}};
}
function action(method:string,v:Record<string,any>){
 const project=str(v.project_id);
 if(method==='snapshot')return snapshot(project);
 if(method==='project.create'){ok(str(v.name),'Prosjektnavn mangler');const key=id();exec('INSERT INTO projects(id,name,customer,reference) VALUES(?,?,?,?)',[key,str(v.name),str(v.customer),str(v.reference)]);return key;}
 if(method==='project.delete'){validProject(str(v.id));exec('DELETE FROM projects WHERE id=?',[str(v.id)]);return true;}
 if(method==='building.create'){validProject(project);ok(str(v.name),'Byggnavn mangler');exec('INSERT INTO buildings(id,project_id,name,address) VALUES(?,?,?,?)',[id(),project,str(v.name),str(v.address)]);return true;}
 if(method==='entrance.create'){const building=str(v.building_id);ok(str(v.code),'Oppgang mangler');ok(scalar('SELECT COUNT(*) FROM buildings WHERE id=? AND project_id=?',[building,project])>0,'Ugyldig bygg');exec('INSERT INTO entrances(id,building_id,code) VALUES(?,?,?)',[id(),building,str(v.code)]);return true;}
 if(method==='apartment.create'){
  const entrance=str(v.entrance_id);ok(str(v.number),'Leilighetsnummer mangler');
  ok(scalar('SELECT COUNT(*) FROM entrances e JOIN buildings b ON b.id=e.building_id WHERE e.id=? AND b.project_id=?',[entrance,project])>0,'Ugyldig oppgang');
  db.transaction(()=>{const apartment=id(),equipment=id(),code='UTT-'+apartment.slice(0,8).toUpperCase();
   exec('INSERT INTO apartments(id,entrance_id,number,floor,note) VALUES(?,?,?,?,?)',[apartment,entrance,str(v.number),str(v.floor),str(v.note)]);
   exec("INSERT INTO equipment(id,project_id,entrance_id,apartment_id,code,kind,place,port_count) VALUES(?,?,?,?,?,'OUTLET',?,1)",[equipment,project,entrance,apartment,code,'Leilighet '+str(v.number)]);
   exec('INSERT INTO ports(id,equipment_id,label,position) VALUES(?,?,?,1)',[id(),equipment,'Fiber 1']);
  });return true;
 }
 if(method==='equipment.create'){
  validProject(project);const code=str(v.code),kind=str(v.kind),count=Number(v.port_count);
  ok(code,'Utstyr-ID mangler');ok(['SWITCH','ODF','SPLICE_BOX','DISTRIBUTION_BOX'].includes(kind),'Ugyldig utstyrstype');
  ok(Number.isSafeInteger(count)&&count>=1&&count<=4096,'Portantall må være 1–4096');
  db.transaction(()=>{const equipment=id();exec('INSERT INTO equipment(id,project_id,code,kind,place,port_count) VALUES(?,?,?,?,?,?)',[equipment,project,code,kind,str(v.place),count]);for(let pos=1;pos<=count;pos++)exec('INSERT INTO ports(id,equipment_id,label,position) VALUES(?,?,?,?)',[id(),equipment,String(pos).padStart(2,'0'),pos]);});return true;
 }
 if(method==='link.create'){
  validProject(project);const from=str(v.from_port_id),to=str(v.to_port_id),kind=str(v.kind),cable=str(v.cable_id),fiber=str(v.fiber_no);
  ok(from&&to&&from!==to,'Velg to forskjellige porter');
  ok(belongs(project,from)&&belongs(project,to),'Portene tilhører ikke valgt prosjekt');
  ok(['CABLE','PATCH','SPLICE'].includes(kind),'Ugyldig forbindelsestype');
  if(kind==='CABLE')ok(cable&&fiber,'Kabel-ID og fibernummer kreves');
  exec('INSERT INTO links(id,project_id,from_port_id,to_port_id,kind,cable_id,fiber_no,note) VALUES(?,?,?,?,?,?,?,?)',[id(),project,from,to,kind,cable,fiber,str(v.note)]);return true;
 }
 if(method==='link.delete'){exec('DELETE FROM links WHERE id=? AND project_id=?',[str(v.id),project]);return true;}
 throw Error('Ukjent operasjon: '+method);
}
async function init(base:string){
 if(db)return true;
 ok(typeof navigator.storage?.getDirectory==='function','Nettleseren støtter ikke lokal OPFS-lagring.');
 const sqlite3=await sqlite3InitModule({locateFile:(filename:string)=>new URL('assets/'+filename,base).toString()} as any);
 pool=await sqlite3.installOpfsSAHPoolVfs({initialCapacity:8,preserveOnInitFailure:true});
 db=new pool.OpfsSAHPoolDb(FILE);
 const version=scalar('PRAGMA user_version');ok(version===0||version===1,'Ukjent databaseversjon');
 if(version===0)exec(SCHEMA);else exec('PRAGMA foreign_keys=ON');
 return true;
}
self.onmessage=async(ev:MessageEvent<Payload>)=>{
 const m=ev.data;
 try {
  let result:any;
  if(m.method==='initialize')result=await init(String(m.base||''));
  else {
   ok(db,'Databasen er ikke initialisert.');
   if(m.method==='backup.export'){const b=pool.exportFile(FILE) as Uint8Array;const copy=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;self.postMessage({id:m.id,ok:true,data:copy},[copy]);return;}
   if(m.method==='backup.import'){
    const b=m.data?.bytes;ok(b instanceof ArrayBuffer,'Mangler databasefil');
    const bytes=new Uint8Array(b);ok(bytes.length>=100 && new TextDecoder().decode(bytes.slice(0,16))==='SQLite format 3\0','Ikke en SQLite-fil');
    const original=pool.exportFile(FILE) as Uint8Array;db.close();db=undefined;
    try{pool.importDb(FILE,bytes);db=new pool.OpfsSAHPoolDb(FILE);ok(db.selectValue('PRAGMA integrity_check')==='ok','Ugyldig SQLite-fil');ok(Number(db.selectValue('PRAGMA user_version'))===1,'Ukjent versjon');ok(scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'")===1,'Ikke en Fiberplaner-database');exec('PRAGMA foreign_keys=ON');ok(query('PRAGMA foreign_key_check').length===0,'Ugyldige referanser');}
    catch(e){if(db)db.close();pool.importDb(FILE,original);db=new pool.OpfsSAHPoolDb(FILE);exec('PRAGMA foreign_keys=ON');throw e;}
    result=true;
   }else result=action(m.method,m.data??{});
  }
  self.postMessage({id:m.id,ok:true,data:result});
 }catch(e){self.postMessage({id:m.id,ok:false,error:e instanceof Error?e.message:String(e)});}
};
