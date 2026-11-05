/* SOSI (tekst) -> GeoJSON: conservative browser-side map preview.
   Only EUREF89 UTM SOSI KOORDSYS 19..26 is handled. No silent CRS guesses.
   Supports PUNKT, LINJE/KURVE and FLATE constructed from KURVE references.
   Coordinates stored as NØ, with ORIGO-NØ + ENHET from HODE. */
(function(root){
  'use strict';
  const supportedCodes=new Map([[19,29],[20,30],[21,31],[22,32],
    [23,33],[24,34],[25,35],[26,36]]);
  const MAX_GROUPS=12000, MAX_COORDS=75000, MAX_FEATURES=7000;
  function utmToWgs84(north,east,zone){
    // ETRS89 ellipsoid GRS80, with standard UTM scale k0=0.9996.
    const a=6378137,f=1/298.257222101,k0=0.9996,e2=f*(2-f);
    const ep2=e2/(1-e2),x=east-500000,M=north/k0;
    const mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256));
    const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
    const lat1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+
      (21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)+
      151*e1**3/96*Math.sin(6*mu)+1097*e1**4/512*Math.sin(8*mu);
    const sin=Math.sin(lat1),cos=Math.cos(lat1),tan=Math.tan(lat1);
    const N=a/Math.sqrt(1-e2*sin*sin),R=a*(1-e2)/(1-e2*sin*sin)**1.5;
    const T=tan*tan,C=ep2*cos*cos,D=x/(N*k0);
    const latitude=lat1-(N*tan/R)*(D*D/2-(5+3*T+10*C-4*C*C-9*ep2)*D**4/24+
      (61+90*T+298*C+45*T*T-252*ep2-3*C*C)*D**6/720);
    const longitude=(zone*6-183)*Math.PI/180+
      (D-(1+2*T+C)*D**3/6+(5-2*C+28*T-3*C*C+8*ep2+24*T*T)*D**5/120)/cos;
    const result=[longitude*180/Math.PI,latitude*180/Math.PI];
    if(!Number.isFinite(result[0])||!Number.isFinite(result[1])||
       result[0]<-180||result[0]>180||result[1]<0||result[1]>90)
      throw Error('Ugyldige projiserte koordinater.');
    return result;
  }
  function eq(a,b){
    return a&&b&&Math.abs(a[0]-b[0])<.000001&&Math.abs(a[1]-b[1])<.000001;
  }
  function assembleRing(references,lines){
    if(!references.length)return null;
    let combined=[];
    for(const ref of references){
      const raw=lines.get(Math.abs(ref));
      if(!raw || raw.length<2)return null;
      const points=ref<0?[...raw].reverse():raw;
      if(!combined.length){combined=points.slice();continue;}
      if(eq(combined.at(-1),points[0]))combined.push(...points.slice(1));
      else return null; // Never invent missing polygon boundaries.
    }
    if(!eq(combined[0],combined.at(-1)))return null;
    combined[combined.length-1]=combined[0].slice();
    return combined.length>=4?combined:null;
  }
  function collectReferences(raw){
    const outer=[],holes=[];
    let inside=false,inner=[];
    for(const token of raw.match(/\(|\)|:[+-]?\d+/g)||[]){
      if(token==='('){if(inside)return null;inside=true;inner=[]}
      else if(token===')'){if(!inside)return null;inside=false;holes.push(inner);inner=[]}
      else{
        const n=Number(token.slice(1));
        if(!Number.isSafeInteger(n)||n===0)return null;
        (inside?inner:outer).push(n);
      }
    }
    if(inside)return null;
    return {outer,holes};
  }
  function parse(text){
    if(typeof text!=='string'||text.length>5_000_000)
      throw Error('Filen er for stor. Maksimalt 5 MB tekst.');
    if(!/^\s*\.HODE\b/m.test(text))throw Error('Fant ikke SOSI-filhode (.HODE).');
    const groups=[],header={koordsys:null,unit:null,origin:null,encoding:''};
    let current=null,coordMode=false,groupCount=0,coordinateCount=0,skipped=0;
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
    function saveCurrent(){
      if(!current)return;
      if(current.type!=='HODE'&&current.type!=='SLUTT'){
        groups.push(current);groupCount++;
        if(groupCount>MAX_GROUPS)throw Error('For mange SOSI-grupper for nettleserimport.');
      }
    }
    for(const physical of lines){
      const line=physical.split('!')[0].trim();
      if(!line)continue;
      const next=/^\.([A-ZÆØÅ][A-ZÆØÅ0-9_-]*)\s*(?:(\d+):)?/iu.exec(line);
      if(next&&!line.startsWith('..')){
        saveCurrent();
        current={type:next[1].toUpperCase(),id:next[2]?Number(next[2]):null,
          coords:[],objtype:'',refs:''};
        coordMode=false;
        continue;
      }
      if(!current)continue;
      const field=/^\.+([A-ZÆØÅ][A-ZÆØÅ0-9_-]*)\s*(.*)$/iu.exec(line);
      if(field){
        const name=field[1].toUpperCase(),value=field[2].trim();
        if(current.type==='HODE'){
          if(name==='KOORDSYS')header.koordsys=Number(value.split(/\s+/)[0]);
          if(name==='ENHET')header.unit=Number(value.split(/\s+/)[0]);
          if(name==='ORIGO-NØ'){
            const parts=value.split(/\s+/).map(Number);
            if(parts.length>=2)header.origin=parts.slice(0,2);
          }
          if(name==='TEGNSETT')header.encoding=value;
        }else{
          if(name==='OBJTYPE')current.objtype=value.slice(0,90).replace(/^"|"$/g,'');
          if(name==='REF')current.refs+=' '+value;
          if(name==='NØ'||name==='NØH'||name==='NØD')coordMode=true;
          else if(name!=='REF')coordMode=false;
        }
        continue;
      }
      if(coordMode && current.type!=='HODE'){
        const values=line.split(/\s+/);
        if(values.length>=2){
          const n=Number(values[0]),e=Number(values[1]);
          if(Number.isFinite(n)&&Number.isFinite(e)){
            current.coords.push([n,e]);coordinateCount++;
            if(coordinateCount>MAX_COORDS)
              throw Error('For mange koordinatpunkter for nettleserimport.');
            continue;
          }
        }
      }
      // SOSI REF may continue onto a new line without "..REF".
      if(current.type==='FLATE' && /^(?:[:()]|\s)+[:()\s0-9+-]*$/.test(line))
        current.refs+=' '+line;
    }
    saveCurrent();
    if(!Number.isInteger(header.koordsys)||!supportedCodes.has(header.koordsys))
      throw Error('Koordinatsystem '+(header.koordsys??'mangler')+
        ' støttes ikke. Bruk EUREF89 UTM sone 29–36 (SOSI 19–26), for eksempel 22, 23 eller 25.');
    if(!Number.isFinite(header.unit)||header.unit<=0)
      throw Error('SOSI-filen mangler gyldig ...ENHET i filhodet.');
    if(!header.origin||header.origin.some(x=>!Number.isFinite(x)))
      throw Error('SOSI-filen mangler gyldig ...ORIGO-NØ i filhodet.');
    const zone=supportedCodes.get(header.koordsys);
    const transform=([north,east])=>utmToWgs84(
      header.origin[0]+north*header.unit,
      header.origin[1]+east*header.unit,zone);
    const features=[],segmentMap=new Map();
    const feature=(group,geometry)=>{
      if(features.length>=MAX_FEATURES)
        throw Error('For mange kartobjekter. Maks '+MAX_FEATURES+' per fil.');
      features.push({type:'Feature',properties:{
        sosiType:group.type,objtype:group.objtype||group.type,
        sosiId:group.id
      },geometry});
    };
    for(const group of groups){
      if(group.type==='PUNKT'){
        if(group.coords.length===1){
          try{feature(group,{type:'Point',coordinates:transform(group.coords[0])})}
          catch{skipped++}
        }else skipped++;
      }else if(group.type==='KURVE'||group.type==='LINJE'){
        if(group.coords.length<2){skipped++;continue}
        try{
          const points=group.coords.map(transform);
          segmentMap.set(group.id,points);
          feature(group,{type:'LineString',coordinates:points});
        }catch{skipped++}
      }
    }
    for(const group of groups){
      if(group.type==='FLATE'){
        const refs=collectReferences(group.refs);
        if(!refs){skipped++;continue}
        const outer=assembleRing(refs.outer,segmentMap);
        if(!outer){skipped++;continue}
        const rings=[outer];
        let bad=false;
        for(const hole of refs.holes){
          const ring=assembleRing(hole,segmentMap);
          if(!ring){bad=true;break}
          rings.push(ring);
        }
        if(!bad)feature(group,{type:'Polygon',coordinates:rings});
        else skipped++;
      }else if(!['PUNKT','KURVE','LINJE'].includes(group.type)){
        skipped++;
      }
    }
    if(!features.length)
      throw Error('Fant ingen støttede punkt-, kurve- eller flateobjekter. '+skipped+' grupper ble hoppet over.');
    const counts={points:0,lines:0,polygons:0};
    for(const item of features){
      if(item.geometry.type==='Point')counts.points++;
      if(item.geometry.type==='LineString')counts.lines++;
      if(item.geometry.type==='Polygon')counts.polygons++;
    }
    return {type:'FeatureCollection',features,meta:{
      koordsys:header.koordsys,epsg:25800+zone,encoding:header.encoding,
      skipped,groups:groupCount,vertices:coordinateCount,counts
    }};
  }
  const api={parse,utmToWgs84};
  root.FiberSosi=api;
  if(typeof module==='object' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
