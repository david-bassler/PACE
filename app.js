(() => {
  "use strict";

  const META = {
    P:{title:"Proficiency · Kompetenz",intro:"Nutze eine Fähigkeit so, dass du sie selbst spürst – nicht erst durch das Urteil anderer."},
    A:{title:"Advancement · Fortschritt",intro:"Am Abend soll etwas konkret weiter sein als am Morgen. Klein und sichtbar schlägt groß und diffus."},
    C:{title:"Capacity · Reserve",intro:"Reserve entsteht nicht zufällig. Du darfst Anforderungen entfernen, verkürzen, delegieren oder vereinfachen."},
    E:{title:"Echo · Resonanz",intro:"Resonanz lässt sich nicht erzwingen. Du kannst aber Gelegenheiten schaffen, in denen etwas lebendig werden könnte."}
  };

  const HEADERS = ["Datum","Tagesform","Kompetenz","Kompetenz_erledigt","Fortschritt","Fortschritt_erledigt","Reserve","Reserve_erledigt","Resonanz","Resonanz_erledigt","Feststecken_Anzahl","Abend_Fortschritt","Abend_Resonanz","Abend_Reserve","Abgeschlossen_um","Aktualisiert_um"];
  const DAY_KEY="pace-day-v4";
  const ENERGY_KEY="pace-energy-v4";
  const CONFIG_KEY="pace-google-config";
  const LEGACY_CONFIG_KEYS=["pace-google-config-v2","pace-google-config-v1"];
  const CONTENT_KEY="pace-private-content-v1";
  const SCOPE="https://www.googleapis.com/auth/drive.file";

  const $=id=>document.getElementById(id);
  const rows=[...document.querySelectorAll(".pace-row")];
  const energyButtons=[...document.querySelectorAll("[data-energy]")];

  let content=loadCachedContent();
  let energy=localStorage.getItem(ENERGY_KEY)||"normal";
  let config=loadConfig();
  let state=loadDay();
  let accessToken="";
  let tokenClient=null;
  let syncTimer=null;
  let installPrompt=null;
  let importButton=null;
  let importInput=null;

  function dateKey(d=new Date()){
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  }
  function nowIso(){ return new Date().toISOString(); }
  function blankDay(){ return {date:dateKey(),selections:{},done:{},stuckCount:0,rescue:"",evening:{progress:"",resonance:"",reserve:"",closedAt:""},updatedAt:nowIso()}; }
  function loadDay(){
    try{
      const x=JSON.parse(localStorage.getItem(DAY_KEY)||"null");
      if(x&&x.date===dateKey()) return Object.assign(blankDay(),x);
    }catch(e){}
    return blankDay();
  }
  function saveDay(doSync=true){
    state.updatedAt=nowIso();
    localStorage.setItem(DAY_KEY,JSON.stringify(state));
    setSyncDot(accessToken&&config.sheetId?"pending":"local");
    if(doSync) scheduleSync();
  }
  function loadCachedContent(){
    try{
      const x=JSON.parse(localStorage.getItem(CONTENT_KEY)||"null");
      if(x&&x.lists) return {
        lists:Object.assign({P:[],A:[],C:[],E:[]},x.lists),
        stuck:Array.isArray(x.stuck)?x.stuck:[],
        loadedAt:x.loadedAt||""
      };
    }catch(e){}
    return {lists:{P:[],A:[],C:[],E:[]},stuck:[],loadedAt:""};
  }
  function cacheContent(){
    content.loadedAt=nowIso();
    localStorage.setItem(CONTENT_KEY,JSON.stringify(content));
  }
  function hasContent(){
    return ["P","A","C","E"].some(k=>content.lists[k].length)||content.stuck.length;
  }
  function loadConfig(){
    const empty={clientId:"",sheetId:""};
    try{
      const current=localStorage.getItem(CONFIG_KEY);
      if(current) return Object.assign({},empty,JSON.parse(current));

      for(const key of LEGACY_CONFIG_KEYS){
        const legacy=localStorage.getItem(key);
        if(!legacy) continue;
        const migrated=Object.assign({},empty,JSON.parse(legacy));
        localStorage.setItem(CONFIG_KEY,JSON.stringify(migrated));
        return migrated;
      }
    }catch(e){}
    return empty;
  }
  function extractSheetId(v){
    const m=v.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    return m?m[1]:v;
  }
  function saveConfig(){
    config.clientId=$("clientIdInput").value.trim();
    config.sheetId=extractSheetId($("sheetIdInput").value.trim());
    localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
    $("sheetIdInput").value=config.sheetId;
    updateSheetLink();
    setGoogleStatus("Einstellungen gespeichert. Der Access Token wird nicht gespeichert.");
  }
  function visible(key){
    const list=content.lists[key]||[];
    return energy==="low"?list.slice(0,6):list;
  }

  function setSyncDot(kind){
    const dot=$("syncDot");
    dot.className="sync-dot"+(kind==="synced"?" synced":kind==="pending"?" pending":kind==="error"?" error":"");
    const t={synced:"Mit Google Sheets synchronisiert",pending:"Lokale Änderung wartet auf Synchronisierung",error:"Synchronisierung fehlgeschlagen",local:"Nur lokal gespeichert"};
    dot.title=t[kind]||t.local;
  }
  function setGoogleStatus(msg,kind=""){
    const el=$("googleStatus");
    el.textContent=msg;
    el.className="status-box"+(kind?" "+kind:"");
  }
  function updateSheetLink(){
    const a=$("sheetLink");
    if(config.sheetId){
      a.href="https://docs.google.com/spreadsheets/d/"+config.sheetId+"/edit";
      a.hidden=false;
    }else a.hidden=true;
  }

  function updateEnergy(){
    energyButtons.forEach(b=>b.classList.toggle("active",b.dataset.energy===energy));
    const hints={
      low:"Wenig Energie: nur die ersten sechs Vorschläge jedes Bereichs. Reserve zählt heute besonders.",
      normal:"Normaler Tag: ein konkreter Schritt pro Bereich reicht.",
      good:"Viel Energie: nutze sie, aber verplane sie nicht vollständig."
    };
    $("energyHint").textContent=hints[energy];
    renderReserveFirst();
    rows.forEach(r=>{const p=$("suggestions-"+r.dataset.key);if(!p.hidden)renderSuggestions(r.dataset.key);});
  }

  function choose(key,text){
    state.selections[key]=text;
    state.done[key]=false;
    saveDay();
    renderAll();
  }

  function renderReserveFirst(){
    const box=$("reserveFirstChoices");
    box.innerHTML="";
    const choices=visible("C").slice(0,4);

    if(!choices.length){
      const p=document.createElement("p");
      p.className="summary-empty";
      p.textContent=hasContent()?"Für Reserve sind noch keine Einträge vorhanden.":"Noch keine privaten Inhalte geladen. Verbinde Google Sheets und importiere deine TSV-Datei.";
      box.appendChild(p);
      $("moreReserve").textContent=hasContent()?"Alle Reserve-Vorschläge":"Google Sheets einrichten";
    }else{
      choices.forEach(text=>{
        const b=document.createElement("button");
        b.type="button";
        b.className="quick-choice"+(state.selections.C===text?" selected":"");
        b.textContent=text;
        b.addEventListener("click",()=>choose("C",text));
        box.appendChild(b);
      });
      $("moreReserve").textContent="Alle Reserve-Vorschläge";
    }

    $("reserveFirst").classList.toggle("done",!!state.selections.C);
    $("reserveFirstTitle").textContent=state.selections.C?"Reserve ist eingeplant.":"Was muss heute nicht auch noch sein?";
  }

  function renderSummary(){
    const box=$("todaySummary");
    box.innerHTML="";
    const keys=["P","A","C","E"].filter(k=>state.selections[k]);

    if(!keys.length){
      const e=document.createElement("div");
      e.className="summary-empty";
      e.textContent=hasContent()?"Reserve zuerst – danach reicht eine kleine, tragfähige Auswahl.":"Private Vorschläge werden erst nach der Verbindung mit deinem Google Sheet angezeigt.";
      box.appendChild(e);
    }else{
      keys.forEach(key=>{
        const w=document.createElement("div");
        w.className="summary-item";

        const c=document.createElement("input");
        c.type="checkbox";
        c.id="done-"+key;
        c.checked=!!state.done[key];
        c.addEventListener("change",()=>{state.done[key]=c.checked;saveDay();});

        const l=document.createElement("label");
        l.htmlFor=c.id;
        const badge=document.createElement("span");
        badge.className="summary-key";
        badge.textContent=key;
        l.append(badge,document.createTextNode(state.selections[key]));
        w.append(c,l);
        box.appendChild(w);
      });
    }

    document.querySelectorAll("[data-chosen]").forEach(el=>{
      const k=el.dataset.chosen;
      if(state.selections[k]){
        el.textContent=state.selections[k];
        el.classList.add("has-choice");
      }else{
        el.textContent=content.lists[k].length?"Vorschläge anzeigen":"Noch keine Inhalte";
        el.classList.remove("has-choice");
      }
    });

    $("enoughNote").hidden=!(state.selections.C&&["P","A","E"].filter(k=>state.selections[k]).length>=2);
  }

  function renderRescue(){
    const e=$("rescueCurrent");
    if(state.rescue){
      e.hidden=false;
      e.textContent="Feststecken-Hilfe: "+state.rescue;
    }else e.hidden=true;
  }
  function renderEveningStatus(){
    $("eveningStatus").textContent=state.evening.closedAt?"Abgeschlossen. Der Tag darf jetzt zu sein.":"";
  }
  function renderAll(){
    renderReserveFirst();
    renderSummary();
    renderRescue();
    renderEveningStatus();
  }

  function openChoice(key,text){
    const box=$("choiceDialogContent");
    box.innerHTML="";

    const micro=document.createElement("p");
    micro.className="micro";
    micro.textContent=META[key].title.toUpperCase();

    const h=document.createElement("h2");
    h.textContent=text;

    const p=document.createElement("p");
    p.className="hint";
    p.textContent=META[key].intro;

    const actions=document.createElement("div");
    actions.className="choice-actions";

    const use=document.createElement("button");
    use.type="button";
    use.className="primary-button";
    use.textContent="Für heute auswählen";
    use.addEventListener("click",()=>{choose(key,text);$("choiceDialog").close();});

    const another=document.createElement("button");
    another.type="button";
    another.className="secondary-button";
    another.textContent="Anderen Vorschlag";
    another.addEventListener("click",()=>{
      const options=visible(key).filter(x=>x!==text);
      if(options.length)openChoice(key,options[Math.floor(Math.random()*options.length)]);
    });

    actions.append(use,another);
    box.append(micro,h,p,actions);
    $("choiceDialog").showModal();
  }

  function renderSuggestions(key){
    const panel=$("suggestions-"+key);
    panel.innerHTML="";
    const options=visible(key);

    if(!options.length){
      const p=document.createElement("p");
      p.className="summary-empty";
      p.textContent="Keine privaten Vorschläge geladen. Öffne die Einstellungen und synchronisiere dein Google Sheet.";
      panel.appendChild(p);
      return;
    }

    const tools=document.createElement("div");
    tools.className="suggestion-tools";
    const random=document.createElement("button");
    random.type="button";
    random.textContent="🎲 Einen Vorschlag";
    random.addEventListener("click",()=>openChoice(key,options[Math.floor(Math.random()*options.length)]));
    tools.appendChild(random);

    const grid=document.createElement("div");
    grid.className="suggestion-grid";
    options.forEach(text=>{
      const b=document.createElement("button");
      b.type="button";
      b.className="suggestion"+(state.selections[key]===text?" selected":"");
      b.textContent=text;
      b.addEventListener("click",()=>openChoice(key,text));
      grid.appendChild(b);
    });

    panel.append(tools,grid);
  }

  function openPanel(key){
    if(!(content.lists[key]||[]).length){
      $("settingsDialog").showModal();
      setGoogleStatus("Für diesen Bereich sind noch keine privaten Inhalte geladen.");
      return;
    }
    rows.forEach(row=>{
      const is=row.dataset.key===key;
      const p=$("suggestions-"+row.dataset.key);
      row.setAttribute("aria-expanded",String(is));
      p.hidden=!is;
      if(is)renderSuggestions(key);
    });
  }

  function openStuck(){
    const box=$("stuckChoices");
    box.innerHTML="";

    if(!content.stuck.length){
      const p=document.createElement("p");
      p.className="summary-empty";
      p.textContent="Noch keine Feststecken-Vorschläge aus Google Sheets geladen.";
      box.appendChild(p);
    }else{
      content.stuck.forEach(text=>{
        const b=document.createElement("button");
        b.type="button";
        b.textContent=text;
        b.addEventListener("click",()=>{
          state.stuckCount=(state.stuckCount||0)+1;
          state.rescue=text;
          saveDay();
          renderRescue();
          $("stuckDialog").close();
        });
        box.appendChild(b);
      });
    }
    $("stuckDialog").showModal();
  }

  function openEvening(){
    $("eveningProgress").value=state.evening.progress||"";
    $("eveningResonance").value=state.evening.resonance||"";
    $("eveningReserve").value=state.evening.reserve||"";
    $("eveningDialog").showModal();
  }

  function resetDay(){
    if(!confirm("Heutige Auswahl, Häkchen und Abendnotizen löschen?"))return;
    state=blankDay();
    saveDay();
    rows.forEach(r=>{
      $("suggestions-"+r.dataset.key).hidden=true;
      r.setAttribute("aria-expanded","false");
    });
    renderAll();
  }

  function gisReady(){
    return !!(window.google&&google.accounts&&google.accounts.oauth2);
  }

  function connectGoogle(){
    saveConfig();
    if(!config.clientId){
      setGoogleStatus("Bitte zuerst eine OAuth Client-ID eintragen.","bad");
      return;
    }
    if(!gisReady()){
      setGoogleStatus("Google Identity ist noch nicht geladen. Bitte in ein paar Sekunden erneut versuchen.","bad");
      return;
    }
    if(!tokenClient){
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:config.clientId,
        scope:SCOPE,
        callback:async resp=>{
          if(resp.error){
            setGoogleStatus("Google-Anmeldung fehlgeschlagen: "+resp.error,"bad");
            return;
          }
          accessToken=resp.access_token||"";
          toggleGoogleButtons(true);
          setGoogleStatus("Verbunden. Zugriff gilt nur für Dateien, die PACE selbst verwendet.","good");
          try{
            if(config.sheetId){
              await ensureBackend();
              await syncNow();
            }else{
              setGoogleStatus("Verbunden. Lege jetzt ein neues PACE-Sheet an.","good");
            }
          }catch(e){
            setGoogleStatus(e.message,"bad");
          }
        }
      });
    }
    tokenClient.requestAccessToken({prompt:"consent"});
  }

  function toggleGoogleButtons(on){
    $("createSheet").disabled=!on;
    $("setupSheet").disabled=!on||!config.sheetId;
    $("syncNow").disabled=!on||!config.sheetId;
    if(importButton)importButton.disabled=!on||!config.sheetId;
  }

  async function api(url,options={}){
    if(!accessToken)throw new Error("Bitte zuerst mit Google verbinden.");
    const headers=Object.assign({},options.headers||{},{"Authorization":"Bearer "+accessToken});
    if(options.body&&!headers["Content-Type"])headers["Content-Type"]="application/json";

    const r=await fetch(url,Object.assign({},options,{headers}));
    if(r.status===401){
      accessToken="";
      toggleGoogleButtons(false);
      throw new Error("Google-Zugriff ist abgelaufen. Bitte erneut verbinden.");
    }
    if(!r.ok){
      const t=await r.text();
      throw new Error("Google API: "+r.status+" "+t.slice(0,260));
    }
    return r.status===204?null:r.json();
  }

  function sheetsUrl(path){
    return "https://sheets.googleapis.com/v4/spreadsheets/"+config.sheetId+path;
  }

  async function createBackend(){
    const body={
      properties:{title:"PACE"},
      sheets:[
        {properties:{title:"Vorschlaege"}},
        {properties:{title:"Feststecken"}},
        {properties:{title:"Tage"}}
      ]
    };
    const data=await api("https://sheets.googleapis.com/v4/spreadsheets",{method:"POST",body:JSON.stringify(body)});
    config.sheetId=data.spreadsheetId;
    localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
    $("sheetIdInput").value=config.sheetId;
    updateSheetLink();
    await setupBackend();
    toggleGoogleButtons(true);
    setGoogleStatus("Leeres privates PACE-Sheet angelegt. Importiere jetzt deine TSV-Datei.","good");
  }

  async function ensureBackend(){await setupBackend();}
  async function setupBackend(){
    if(!config.sheetId)throw new Error("Keine Spreadsheet-ID eingetragen.");

    const meta=await api(sheetsUrl("?fields=sheets.properties.title"));
    const titles=(meta.sheets||[]).map(s=>s.properties.title);
    const requests=[];

    if(!titles.includes("Vorschlaege"))requests.push({addSheet:{properties:{title:"Vorschlaege"}}});
    if(!titles.includes("Feststecken"))requests.push({addSheet:{properties:{title:"Feststecken"}}});
    if(!titles.includes("Tage"))requests.push({addSheet:{properties:{title:"Tage"}}});

    if(requests.length){
      await api(sheetsUrl(":batchUpdate"),{method:"POST",body:JSON.stringify({requests})});
    }

    await ensureHeaders();
    toggleGoogleButtons(true);
    updateSheetLink();
  }

  async function valuesGet(range){
    return api(sheetsUrl("/values/"+encodeURIComponent(range)+"?majorDimension=ROWS"));
  }
  async function valuesPut(range,values){
    return api(sheetsUrl("/values/"+encodeURIComponent(range)+"?valueInputOption=RAW"),{
      method:"PUT",
      body:JSON.stringify({range,majorDimension:"ROWS",values})
    });
  }
  async function valuesClear(range){
    return api(sheetsUrl("/values/"+encodeURIComponent(range)+":clear"),{
      method:"POST",
      body:"{}"
    });
  }

  async function ensureHeaders(){
    let p={values:[]},s={values:[]},t={values:[]};
    try{p=await valuesGet("Vorschlaege!A1:B1");}catch(e){}
    try{s=await valuesGet("Feststecken!A1:A1");}catch(e){}
    try{t=await valuesGet("Tage!A1:P1");}catch(e){}

    if(!(p.values&&p.values.length))await valuesPut("Vorschlaege!A1:B1",[["Bereich","Vorschlag"]]);
    if(!(s.values&&s.values.length))await valuesPut("Feststecken!A1:A1",[["Vorschlag"]]);
    if(!(t.values&&t.values.length))await valuesPut("Tage!A1:P1",[HEADERS]);
  }

  async function loadRemoteContent(){
    const proposalData=await valuesGet("Vorschlaege!A2:B");
    const stuckData=await valuesGet("Feststecken!A2:A");

    const remote={P:[],A:[],C:[],E:[]};
    (proposalData.values||[]).forEach(r=>{
      const key=(r[0]||"").trim().toUpperCase();
      const text=(r[1]||"").trim();
      if(remote[key]&&text)remote[key].push(text);
    });

    const stuck=(stuckData.values||[]).map(r=>(r[0]||"").trim()).filter(Boolean);

    content={lists:remote,stuck,loadedAt:nowIso()};
    cacheContent();
    renderAll();
    updateEnergy();
  }

  function dayRow(){
    return [
      state.date,energy,
      state.selections.P||"",!!state.done.P,
      state.selections.A||"",!!state.done.A,
      state.selections.C||"",!!state.done.C,
      state.selections.E||"",!!state.done.E,
      state.stuckCount||0,
      state.evening.progress||"",state.evening.resonance||"",state.evening.reserve||"",
      state.evening.closedAt||"",state.updatedAt||nowIso()
    ];
  }

  async function syncNow(){
    if(!accessToken||!config.sheetId)return;
    setSyncDot("pending");
    setGoogleStatus("Synchronisiere …");

    try{
      await ensureBackend();
      await loadRemoteContent();

      const dates=await valuesGet("Tage!A2:A");
      const arr=(dates.values||[]).map(r=>r[0]||"");
      const idx=arr.indexOf(state.date);

      if(idx>=0){
        const row=idx+2;
        await valuesPut("Tage!A"+row+":P"+row,[dayRow()]);
      }else{
        await api(sheetsUrl("/values/"+encodeURIComponent("Tage!A:P")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"),{
          method:"POST",
          body:JSON.stringify({majorDimension:"ROWS",values:[dayRow()]})
        });
      }

      setSyncDot("synced");
      setGoogleStatus("Synchronisiert.","good");
    }catch(e){
      setSyncDot("error");
      setGoogleStatus(e.message,"bad");
    }
  }

  function scheduleSync(){
    clearTimeout(syncTimer);
    if(accessToken&&config.sheetId)syncTimer=setTimeout(syncNow,700);
  }

  function buildPrivateImportUI(){
    const actions=document.querySelector(".settings-actions");
    if(!actions)return;

    importButton=document.createElement("button");
    importButton.type="button";
    importButton.className="secondary-button";
    importButton.textContent="Private TSV importieren";
    importButton.disabled=true;

    importInput=document.createElement("input");
    importInput.type="file";
    importInput.accept=".tsv,text/tab-separated-values,text/plain";
    importInput.hidden=true;

    importButton.addEventListener("click",()=>importInput.click());
    importInput.addEventListener("change",async()=>{
      const file=importInput.files&&importInput.files[0];
      if(!file)return;

      try{
        const text=await file.text();
        const lines=text.split(/\r?\n/).filter(Boolean);
        if(!lines.length)throw new Error("Die TSV-Datei ist leer.");

        const cells=lines.map(line=>line.split("\t"));
        const header=cells.shift().map(x=>x.trim().toLowerCase());
        const typeIndex=header.indexOf("typ");
        const areaIndex=header.indexOf("bereich");
        const textIndex=header.indexOf("text");

        if(typeIndex<0||textIndex<0)throw new Error("Erwartete Spalten: Typ, Bereich, Text.");

        const proposals=[["Bereich","Vorschlag"]];
        const stuck=[["Vorschlag"]];

        cells.forEach(row=>{
          const type=(row[typeIndex]||"").trim().toUpperCase();
          const area=areaIndex>=0?(row[areaIndex]||"").trim().toUpperCase():"";
          const value=(row[textIndex]||"").trim();
          if(!value)return;

          if(type==="VORSCHLAG"&&["P","A","C","E"].includes(area))proposals.push([area,value]);
          if(type==="FESTSTECKEN")stuck.push([value]);
        });

        await ensureBackend();
        await valuesClear("Vorschlaege!A:B");
        await valuesClear("Feststecken!A:A");
        await valuesPut("Vorschlaege!A1:B"+proposals.length,proposals);
        await valuesPut("Feststecken!A1:A"+stuck.length,stuck);
        await loadRemoteContent();

        setGoogleStatus((proposals.length-1)+" PACE-Vorschläge und "+(stuck.length-1)+" Feststecken-Vorschläge privat importiert.","good");
        importInput.value="";
      }catch(e){
        setGoogleStatus(e.message,"bad");
      }
    });

    actions.append(importButton,importInput);
  }

  rows.forEach(row=>row.addEventListener("click",()=>{
    const key=row.dataset.key;
    if(!(content.lists[key]||[]).length){
      $("settingsDialog").showModal();
      setGoogleStatus("Noch keine privaten Inhalte für "+META[key].title+" geladen.");
      return;
    }
    if(key!=="C"&&!state.selections.C&&(content.lists.C||[]).length){
      openPanel("C");
      $("reserveFirst").scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }

    const p=$("suggestions-"+key);
    const opening=p.hidden;
    rows.forEach(other=>{
      const op=$("suggestions-"+other.dataset.key);
      if(other!==row){
        other.setAttribute("aria-expanded","false");
        op.hidden=true;
      }
    });
    row.setAttribute("aria-expanded",String(opening));
    p.hidden=!opening;
    if(opening)renderSuggestions(key);
  }));

  $("moreReserve").addEventListener("click",()=>{
    if(!(content.lists.C||[]).length){
      $("settingsDialog").showModal();
      return;
    }
    openPanel("C");
    document.querySelector('[data-key="C"]').scrollIntoView({behavior:"smooth",block:"center"});
  });

  energyButtons.forEach(b=>b.addEventListener("click",()=>{
    energy=b.dataset.energy;
    localStorage.setItem(ENERGY_KEY,energy);
    updateEnergy();
    saveDay();
  }));

  $("resetDay").addEventListener("click",resetDay);
  $("stuckButton").addEventListener("click",openStuck);
  $("eveningButton").addEventListener("click",openEvening);

  $("eveningForm").addEventListener("submit",e=>{
    e.preventDefault();
    state.evening={
      progress:$("eveningProgress").value.trim(),
      resonance:$("eveningResonance").value.trim(),
      reserve:$("eveningReserve").value.trim(),
      closedAt:nowIso()
    };
    saveDay();
    renderEveningStatus();
    $("eveningDialog").close();
  });

  $("settingsButton").addEventListener("click",()=>{
    $("clientIdInput").value=config.clientId||"";
    $("sheetIdInput").value=config.sheetId||"";
    updateSheetLink();
    toggleGoogleButtons(!!accessToken);
    $("settingsDialog").showModal();
  });

  $("saveGoogleConfig").addEventListener("click",saveConfig);
  $("googleConnect").addEventListener("click",connectGoogle);
  $("createSheet").addEventListener("click",async()=>{
    try{saveConfig();await createBackend();}
    catch(e){setGoogleStatus(e.message,"bad");}
  });
  $("setupSheet").addEventListener("click",async()=>{
    try{saveConfig();await setupBackend();await syncNow();}
    catch(e){setGoogleStatus(e.message,"bad");}
  });
  $("syncNow").addEventListener("click",syncNow);

  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    installPrompt=e;
    $("installButton").hidden=false;
  });

  $("installButton").addEventListener("click",async()=>{
    if(!installPrompt)return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt=null;
    $("installButton").hidden=true;
  });

  async function init(){
    buildPrivateImportUI();
    updateEnergy();
    renderAll();
    $("clientIdInput").value=config.clientId||"";
    $("sheetIdInput").value=config.sheetId||"";
    updateSheetLink();
    setSyncDot(config.sheetId?"pending":"local");

    if(hasContent()){
      setGoogleStatus("Private Inhalte sind lokal für Offline-Nutzung zwischengespeichert.");
    }else{
      setGoogleStatus("Keine Inhalte im öffentlichen App-Bundle. Verbinde dein privates Google Sheet.");
    }

    if("serviceWorker" in navigator){
      window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
    }
  }

  init();
})();