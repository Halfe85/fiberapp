/* Fiber Planner · Search Address Units modal
   Open Kartverket Eiendom point -> cadastral units -> official addresses.
   Read-only frontend: no project mutation, no owner data. */
(function(root){
  'use strict';
  const ADDRESS='https://api.kartverket.no/adresser/v1';
  const PROPERTY='https://api.kartverket.no/eiendom/v1/punkt';
  const collator=new Intl.Collator('nb-NO',{numeric:true,sensitivity:'base'});
  const validCode=code=>/^[HKUL]\d{4}$/.test(code);
  const text=value=>value===null||value===undefined?'':String(value).trim();
  const num=value=>value===null||value===undefined||String(value).trim()==='' ? null :
    (Number.isFinite(Number(value))?Number(value):null);

  function normalizeAddress(raw){
    if(!raw || typeof raw!=='object')return null;
    const type=raw.objtype||'Vegadresse';
    const street=text(raw.adressenavn)||text(raw.adressetekst);
    const number=num(raw.nummer);
    if(type!=='Vegadresse'||!street||number===null)return null;
    const letter=text(raw.bokstav).toLocaleUpperCase('nb-NO');
    const codes=[...new Set(
      (Array.isArray(raw.bruksenhetsnummer)?raw.bruksenhetsnummer:[])
        .filter(value=>typeof value==='string')
        .map(value=>value.trim().toUpperCase()).filter(validCode)
    )].sort(collator.compare);
    const municipality=text(raw.kommunenummer);
    const streetIdentity=raw.adressekode===undefined||raw.adressekode===null
      ?street.toLocaleLowerCase('nb-NO'):text(raw.adressekode);
    return {
      id:[municipality,streetIdentity,number,letter,text(raw.postnummer)].join('|'),
      street,number,letter,codes,municipality,
      postcode:text(raw.postnummer),poststed:text(raw.poststed)
    };
  }

  function groupAddresses(records){
    const groups=new Map();
    for(const raw of records){
      const row=normalizeAddress(raw);
      if(!row)continue;
      const prior=groups.get(row.id);
      if(prior)prior.codes=[...new Set([...prior.codes,...row.codes])].sort(collator.compare);
      else groups.set(row.id,row);
    }
    return [...groups.values()].sort((a,b)=>
      collator.compare(a.street,b.street)||a.number-b.number||
      collator.compare(a.letter,b.letter)||collator.compare(a.postcode,b.postcode));
  }

  function normalizeParcels(data){
    const source=Array.isArray(data?.eiendom)?data.eiendom:[];
    const byId=new Map();
    for(const entry of source){
      const municipality=text(entry?.kommunenummer);
      const farm=num(entry?.gardsnummer),lot=num(entry?.bruksnummer);
      const distance=num(entry?.meterFraPunkt);
      if(!/^\d{4}$/.test(municipality)||farm===null||lot===null||
         (distance!==null&&distance>3))continue;
      const tenancy=num(entry?.festenummer);
      const key=[municipality,farm,lot,tenancy??0].join('|');
      if(!byId.has(key))byId.set(key,{municipality,farm,lot,tenancy:tenancy??0});
    }
    return [...byId.values()].slice(0,8);
  }

  function addressMatchesParcel(address,parcel){
    if(text(address.kommunenummer)!==parcel.municipality||
       num(address.gardsnummer)!==parcel.farm||
       num(address.bruksnummer)!==parcel.lot)return false;
    const fest=num(address.festenummer)??0;
    return parcel.tenancy===0||parcel.tenancy===fest;
  }

  function create({dialog,fetcher}={}){
    if(!dialog)throw Error('Mangler dialog for søk etter bruksenheter.');
    const http=fetcher||root.fetch?.bind(root);
    if(!http)throw Error('Nettverksfunksjon mangler.');
    const el=id=>dialog.querySelector('#'+id);
    const title=el('sau-title'),status=el('sau-status');
    const rows=el('sau-rows'),closeButton=el('sau-close');
    const table=el('sau-table-wrap'),summary=el('sau-summary');
    let operation=0,controller=null,expanded=new Set(),lastFocus=null;
    let selectedPoint=null;

    const setStatus=(message,isWarning=false)=>{
      status.textContent=message;
      status.classList.toggle('is-warning',Boolean(isWarning));
      status.hidden=!message;
    };
    function cancel(){
      operation++;
      controller?.abort();
      controller=null;
    }
    function close(){
      cancel();
      if(dialog.open)dialog.close();
    }
    closeButton.addEventListener('click',close);
    dialog.addEventListener('click',event=>{if(event.target===dialog)close()});
    dialog.addEventListener('close',()=>{
      cancel();
      if(lastFocus?.isConnected)lastFocus.focus();
      lastFocus=null;
    });

    function render(groups){
      rows.replaceChildren();
      expanded=new Set();
      table.hidden=groups.length===0;
      const units=groups.reduce((total,group)=>total+group.codes.length,0);
      summary.textContent=groups.length+' adresser · '+units+' registrerte bruksenhetsnumre';
      for(const group of groups){
        const addressRow=document.createElement('tr');
        addressRow.className='sau-address-row';
        const first=document.createElement('td');
        first.className='sau-address-cell';
        const count=group.codes.length;
        if(count>1){
          const expand=document.createElement('button');
          expand.type='button';expand.className='sau-expand';
          expand.textContent='+';
          expand.setAttribute('aria-expanded','false');
          expand.setAttribute('aria-label','Vis '+count+' bruksenheter for '+group.street+' '+group.number+group.letter);
          first.append(expand);
          expand.addEventListener('click',()=>{
            const open=expanded.has(group.id);
            if(open)expanded.delete(group.id);else expanded.add(group.id);
            expand.textContent=open?'+':'−';
            expand.setAttribute('aria-expanded',String(!open));
            for(const child of children)child.hidden=open;
          });
        }
        const street=document.createElement('strong');street.textContent=group.street;
        first.append(street);
        const addressNumber=document.createElement('td');addressNumber.textContent=String(group.number);
        const addressLetter=document.createElement('td');addressLetter.textContent=group.letter||'–';
        const oneCode=group.codes.length===1?group.codes[0]:'';
        const number=document.createElement('td');
        number.textContent=oneCode||(count>1?count+' bruksenheter':'Ingen registrerte');
        const floor=document.createElement('td');floor.textContent=oneCode?oneCode.slice(0,3):'–';
        addressRow.append(first,addressNumber,addressLetter,number,floor);
        rows.append(addressRow);
        const children=[];
        if(count>1){
          for(const code of group.codes){
            const child=document.createElement('tr');
            child.className='sau-unit-row';child.hidden=true;
            const inset=document.createElement('td');inset.className='sau-unit-indent';
            inset.textContent='↳ '+group.street;
            const a=document.createElement('td');a.textContent=String(group.number);
            const b=document.createElement('td');b.textContent=group.letter||'–';
            const c=document.createElement('td');c.textContent=code;
            const f=document.createElement('td');f.textContent=code.slice(0,3);
            child.append(inset,a,b,c,f);children.push(child);rows.append(child);
          }
        }
      }
    }

    async function retrieve(url,signal){
      const result=await http(url,{signal,headers:{Accept:'application/json'}});
      if(!result.ok)throw Error('HTTP '+result.status);
      return result.json();
    }

    async function searchProperty(point,signal){
      const qs=new URLSearchParams({
        nord:String(point.lat),ost:String(point.lng),
        koordsys:'4258',radius:'1',side:'1',treffPerSide:'50'
      });
      return normalizeParcels(await retrieve(PROPERTY+'?'+qs,signal));
    }

    async function searchByParcel(parcel,signal){
      const qs=new URLSearchParams({
        kommunenummer:parcel.municipality,gardsnummer:String(parcel.farm),
        bruksnummer:String(parcel.lot),treffPerSide:'500',side:'0'
      });
      if(parcel.tenancy)qs.set('festenummer',String(parcel.tenancy));
      const found=await retrieve(ADDRESS+'/sok?'+qs,signal);
      const values=Array.isArray(found?.adresser)?found.adresser:[];
      const total=num(found?.metadata?.totaltAntallTreff)??values.length;
      const filtered=values.filter(value=>addressMatchesParcel(value,parcel));
      return {values:filtered,truncated:total>500};
    }

    async function nearby(point,signal){
      const params=new URLSearchParams({
        lat:String(point.lat),lon:String(point.lng),radius:'55',
        treffPerSide:'100',side:'0'
      });
      const found=await retrieve(ADDRESS+'/punktsok?'+params,signal);
      return Array.isArray(found?.adresser)?found.adresser:[];
    }

    async function open({lat,lng,address}={}){
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      cancel();
      const ticket=operation;
      const active=new AbortController();
      controller=active;
      selectedPoint={lat,lng};
      lastFocus=document.activeElement;
      title.textContent=address?.title
        ?'Bruksenheter ved '+address.title:'Søk bruksenheter';
      rows.replaceChildren();table.hidden=true;summary.textContent='';
      setStatus('Søker opp eiendom og registrerte adresser …');
      if(!dialog.open)dialog.showModal();
      try{
        let parcels=[],records=[],warning='',truncated=false;
        try{parcels=await searchProperty(selectedPoint,active.signal)}
        catch(err){
          if(active.signal.aborted)return;
          warning='Eiendomsoppslaget var utilgjengelig. ';
        }
        if(active.signal.aborted||ticket!==operation)return;
        if(parcels.length){
          const requests=await Promise.allSettled(parcels.map(parcel=>
            searchByParcel(parcel,active.signal)));
          if(active.signal.aborted||ticket!==operation)return;
          for(const result of requests){
            if(result.status==='fulfilled'){
              records.push(...result.value.values);
              truncated ||=result.value.truncated;
            }else warning='Noen eiendommer kunne ikke undersøkes. ';
          }
        }
        // Fallback must never be presented as verified membership of the lot.
        if(!parcels.length){
          records=await nearby(selectedPoint,active.signal);
          warning+='Viser adresser innen 55 meter, ikke bekreftede adresser på samme tomt. ';
        }
        if(active.signal.aborted||ticket!==operation)return;
        const grouped=groupAddresses(records);
        render(grouped);
        if(truncated)warning+='Flere enn 500 treff finnes for en eiendom; listen kan være ufullstendig. ';
        if(!grouped.length){
          setStatus((parcels.length
            ?'Ingen registrerte vegadresser eller bruksenhetsnumre ble funnet for eiendommen. '
            :'Ingen adresser ble funnet nær punktet. ')+warning,true);
        }else{
          setStatus((parcels.length
            ?'Adresser knyttet til registrert matrikkelnummer. '
            :'Nærliggende adresser – eiendomsgrense er ikke verifisert. ')+warning,
            Boolean(warning));
        }
      }catch(err){
        if(ticket!==operation||active.signal.aborted)return;
        setStatus('Kunne ikke hente adresser eller bruksenheter fra Kartverket. Prøv igjen.',true);
      }finally{
        if(ticket===operation)controller=null;
      }
    }
    return {open,close};
  }
  root.FiberSearchAddressUnitsModal={create,groupAddresses,normalizeParcels};
})(window);
