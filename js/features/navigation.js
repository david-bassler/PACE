import {
  createInputTool,
  createCalmCompanion,
  createDisengageTool,
  createInsurmountableTool,
  createDirectionCompanion,
  createReserveCompanion,
  createMoveTool,
  createSafetyTool,
  createPerspectiveCompanion
} from './regulation-tools.js';

const ROOT_PAGES = new Set(['capture', 'tools', 'help', 'config']);
const PAGE_ALIASES = { today:'capture', capture:'capture', tools:'tools', help:'help', progress:'tools', more:'config', config:'config' };
const TOOL_DEFINITIONS = [
  { key:'day', icon:'◷', title:'Reserve schützen', hint:'Grundbedarf, Reserve und Anforderungen' },
  { key:'input', icon:'↓', title:'Input reduzieren', hint:'Reize und Zufuhr verändern' },
  { key:'calm', icon:'◯', title:'Ruhe im System', hint:'Körper physiologisch runterregeln' },
  { key:'disengage', icon:'⏸', title:'Auskuppeln', hint:'Eskalation unterbrechen, später entscheiden' },
  { key:'space', icon:'↘', title:'Kopf entlasten', hint:'Parken, schreiben, aus dem Kopf bringen' },
  { key:'insurmountable', icon:'·', title:'Unüberwindbar verkleinern', hint:'Nicht erledigen – nur vorbereiten' },
  { key:'direction', icon:'→', title:'Richtung finden', hint:'Auswahl verkleinern und eine Sache wählen' },
  { key:'move', icon:'↟', title:'Energie raus', hint:'Bewegungsenergie sicher abbauen' },
  { key:'safety', icon:'⌂', title:'Sicherheit & Nähe', hint:'Sicherheit oder Co-Regulation herstellen' },
  { key:'perspective', icon:'◇', title:'Perspektive wechseln', hint:'Blick wieder weiter machen' },
  { key:'pace', icon:'P', title:'PACE-Vorschläge', hint:'Direkt nach P · A · C · E' },
  { key:'progress', icon:'↗', title:'Fortschritt', hint:'Lebenslandkarte und nächste Schritte' }
];
const TOOL_KEYS = new Set(TOOL_DEFINITIONS.map(({key}) => key));
const HELP_STATES = [
  { key:'input-overload', image:'01_zu_viel_kommt_rein.png', label:'Zu viel kommt rein', suggestions:['input','calm'] },
  { key:'body-high', image:'02_koerper_ist_hochgefahren.png', label:'Mein Körper ist hochgefahren', suggestions:['calm','input'] },
  { key:'anger', image:'03_wut_eskalation.png', label:'Ich bin in Wut/Eskalation', suggestions:['disengage','move','calm'] },
  { key:'head-full', image:'04_zu_viel_im_kopf.png', label:'Zu viel im Kopf', suggestions:['space','direction'] },
  { key:'everything-huge', image:'05_alles_wirkt_riesig.png', label:'Alles wirkt riesig', suggestions:['insurmountable','space'] },
  { key:'too-many-options', image:'06_zu_viele_moeglichkeiten.png', label:'Zu viele Möglichkeiten', suggestions:['direction','space'] },
  { key:'empty', image:'07_ich_bin_leer.png', label:'Ich bin leer', suggestions:['day'] },
  { key:'too-much-energy', image:'08_zu_viel_energie_im_koerper.png', label:'Ich habe zu viel Energie im Körper', suggestions:['move','calm'] },
  { key:'unsafe-alone', image:'09_unsicher_oder_allein.png', label:'Ich fühle mich unsicher oder allein', suggestions:['safety','calm','perspective'] },
  { key:'narrow-view', image:'10_blick_verengt.png', label:'Mein Blick ist völlig verengt', suggestions:['perspective','space'] }
];
const HELP_STATE_KEYS = new Set(HELP_STATES.map(({key}) => key));
let currentTool = '';
let currentHelpState = '';

const pageElement = name => document.querySelector(`[data-page="${name}"]`);
const toolDefinition = key => TOOL_DEFINITIONS.find(item => item.key === key);
const helpStateDefinition = key => HELP_STATES.find(item => item.key === key);

function injectShellStyles(){
  if(document.querySelector('link[data-pace-shell-v2]')) return;
  const link=document.createElement('link'); link.rel='stylesheet'; link.href='./shell-v2.css'; link.dataset.paceShellV2='true'; document.head.appendChild(link);
}
function rootButtonMarkup(target,label,svg){ return `<button class="bottom-nav-button" type="button" data-page-target="${target}"><span class="bottom-nav-icon" aria-hidden="true">${svg}</span><span>${label}</span></button>`; }
function setupRootNavigation(){
  const nav=document.querySelector('.primary-nav'); if(!nav) return;
  nav.className='bottom-nav'; nav.setAttribute('aria-label','PACE Hauptnavigation');
  nav.innerHTML=[
    rootButtonMarkup('capture','Erfassen','<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>'),
    rootButtonMarkup('tools','Werkzeuge','<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3z"/></svg>'),
    rootButtonMarkup('help','Hilfe','<svg viewBox="0 0 24 24"><path d="M9.5 9a2.8 2.8 0 1 1 4.7 2c-1.2 1-2.2 1.5-2.2 3M12 18h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"/></svg>'),
    rootButtonMarkup('config','Konfiguration','<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4 2-1-2-3-2 .5a8 8 0 0 0-1.5-1.5L17 5l-3-2-1 2a8 8 0 0 0-2 0l-1-2-3 2 .5 2A8 8 0 0 0 6 8.5L4 8l-2 3 2 1a8 8 0 0 0 0 2l-2 1 2 3 2-.5A8 8 0 0 0 7.5 19L7 21l3 2 1-2a8 8 0 0 0 2 0l1 2 3-2-.5-2a8 8 0 0 0 1.5-1.5l2 .5 2-3-2-1a8 8 0 0 0 0-2Z"/></svg>')
  ].join('');
}
function setIntro(page,micro,title,hint){
  const intro=page?.querySelector('.page-intro'); if(!intro) return;
  const microEl=intro.querySelector('.micro'), titleEl=intro.querySelector('h2'), hintEl=intro.querySelector('.hint');
  if(microEl) microEl.textContent=micro; if(titleEl) titleEl.textContent=title; if(hintEl) hintEl.textContent=hint;
}
function setupCapturePage(){
  const page=document.getElementById('page-today'); if(!page) return;
  page.id='page-capture'; page.dataset.page='capture'; page.classList.add('capture-page');
  setIntro(page,'ERFASSEN','Daten erfassen','Nur Eingabe. Alles andere liegt in Werkzeuge oder Konfiguration.');
  const intro=page.querySelector('.page-intro'), quickCapture=document.querySelector('.quick-capture-shell'), tracking=page.querySelector('.tracking-home');
  if(quickCapture) intro?.insertAdjacentElement('afterend',quickCapture);
  if(tracking) (quickCapture||intro)?.insertAdjacentElement('afterend',tracking);
}
function createToolScreen(page,definition,elements){
  const screen=document.createElement('section'); screen.className='tool-screen'; screen.dataset.toolScreen=definition.key; screen.hidden=true;
  const header=document.createElement('header'); header.className='subscreen-header';
  header.innerHTML=`<button class="subscreen-back" type="button" aria-label="Zurück">←</button><div><p class="micro">WERKZEUG</p><h2>${definition.title}</h2></div>`;
  header.querySelector('.subscreen-back')?.addEventListener('click',()=>{
    if(currentHelpState) navigateTo('tools',{state:currentHelpState});
    else navigateTo('tools');
  });
  screen.appendChild(header); elements.filter(Boolean).forEach(element=>screen.appendChild(element)); page.appendChild(screen);
}
function setupToolsPage(){
  const page=document.getElementById('page-tools'); if(!page) return;
  page.dataset.page='tools'; page.classList.add('tools-page'); setIntro(page,'WERKZEUGE','Werkzeuge','Eine Funktion auswählen. Jede öffnet ihren eigenen Screen.');
  const intro=page.querySelector('.page-intro'), menu=document.createElement('div'); menu.className='tools-overview screen-menu-grid'; menu.setAttribute('aria-label','Werkzeuge');
  TOOL_DEFINITIONS.forEach(definition=>{
    const button=document.createElement('button'); button.type='button'; button.className='screen-menu-tile'; button.dataset.toolTarget=definition.key;
    button.innerHTML=`<span class="screen-menu-icon" aria-hidden="true">${definition.icon}</span><span><strong>${definition.title}</strong><small>${definition.hint}</small></span><span class="screen-menu-arrow" aria-hidden="true">›</span>`;
    button.addEventListener('click',()=>navigateTo('tools',{tool:definition.key})); menu.appendChild(button);
  });
  intro?.insertAdjacentElement('afterend',menu);

  const suggestions=document.createElement('section');
  suggestions.className='tools-suggestions';
  suggestions.hidden=true;
  suggestions.innerHTML=`<header class="tools-context-header"><button class="subscreen-back" type="button" aria-label="Zurück zu Hilfe">←</button><div><p class="micro">JETZT</p><h2>Das könnte helfen</h2></div></header><div class="tools-suggestion-list" role="list"></div>`;
  suggestions.querySelector('.subscreen-back')?.addEventListener('click',()=>navigateTo('help'));
  menu.insertAdjacentElement('afterend',suggestions);

  const dayElements=[document.querySelector('#page-capture .energy-strip'),document.getElementById('reserveFirst'),document.querySelector('#page-capture .today-panel'),document.getElementById('stuckButton'),document.getElementById('rescueCurrent'),document.querySelector('#page-capture .evening-card')];
  const calm=page.querySelector('.calm-tool'), space=page.querySelector('.space-home'), direction=page.querySelector('.meh-home'), perspective=page.querySelector('.anchor-home'), paceSuggestions=page.querySelector('#paceSuggestionsDetails');
  const progressPage=document.getElementById('page-progress'), progressCard=progressPage?.querySelector('.progress-home');
  createToolScreen(page,toolDefinition('day'),[createReserveCompanion(),...dayElements]);
  createToolScreen(page,toolDefinition('input'),[createInputTool()]);
  createToolScreen(page,toolDefinition('calm'),[createCalmCompanion(),calm]);
  createToolScreen(page,toolDefinition('disengage'),[createDisengageTool()]);
  createToolScreen(page,toolDefinition('space'),[space]);
  createToolScreen(page,toolDefinition('insurmountable'),[createInsurmountableTool()]);
  createToolScreen(page,toolDefinition('direction'),[createDirectionCompanion(),direction]);
  createToolScreen(page,toolDefinition('move'),[createMoveTool()]);
  createToolScreen(page,toolDefinition('safety'),[createSafetyTool()]);
  createToolScreen(page,toolDefinition('perspective'),[createPerspectiveCompanion(),perspective]);
  createToolScreen(page,toolDefinition('pace'),[paceSuggestions]);
  createToolScreen(page,toolDefinition('progress'),[progressCard]);
  if(progressPage){ progressPage.hidden=true; progressPage.removeAttribute('data-page'); progressPage.classList.remove('active'); }
}
function setupHelpPage(){
  if(pageElement('help')) return;
  const page=document.createElement('section'); page.id='page-help'; page.className='app-page help-page'; page.dataset.page='help'; page.hidden=true;
  const grid=document.createElement('div'); grid.className='help-grid'; grid.setAttribute('aria-label','Hilfe nach aktuellem Zustand');
  HELP_STATES.forEach(state=>{
    const button=document.createElement('button'); button.type='button'; button.className='help-tile'; button.setAttribute('aria-label',`${state.label}: passende Werkzeuge öffnen`);
    button.innerHTML=`<img src="./assets/tool-states/${state.image}" alt="" loading="lazy"><span>${state.label}</span>`;
    button.addEventListener('click',()=>navigateTo('tools',{state:state.key,scroll:false})); grid.appendChild(button);
  });
  page.appendChild(grid); const configPage=document.getElementById('page-more');
  if(configPage) configPage.insertAdjacentElement('beforebegin',page); else document.querySelector('.app-shell')?.appendChild(page);
}
function setupConfigPage(){
  const page=document.getElementById('page-more'); if(!page) return;
  page.id='page-config'; page.dataset.page='config'; page.classList.add('config-page'); setIntro(page,'KONFIGURATION','Konfiguration','Verbindungen, Erfassung und persönliche Inhalte verwalten.');
  const cards=[...page.querySelectorAll(':scope > .feature-card')], grid=document.createElement('div'); grid.className='config-grid'; const intro=page.querySelector('.page-intro'); intro?.insertAdjacentElement('afterend',grid);
  cards.forEach(card=>{ card.classList.add('config-tile'); grid.appendChild(card); });
}
function setupShell(){
  if(document.body.classList.contains('pace-shell-v2')) return;
  document.body.classList.add('pace-shell-v2'); injectShellStyles(); setupRootNavigation(); setupCapturePage(); setupToolsPage(); setupHelpPage(); setupConfigPage();
}
function hideToolModes(page){
  const overview=page.querySelector('.tools-overview'); if(overview) overview.hidden=true;
  const suggestions=page.querySelector('.tools-suggestions'); if(suggestions) suggestions.hidden=true;
  page.querySelectorAll('[data-tool-screen]').forEach(screen=>{screen.hidden=true;});
}
function showToolsOverview(){
  currentTool=''; currentHelpState=''; const page=pageElement('tools'); if(!page) return;
  page.classList.remove('showing-tool','showing-suggestions'); page.querySelector('.page-intro')?.removeAttribute('hidden');
  hideToolModes(page); const overview=page.querySelector('.tools-overview'); if(overview) overview.hidden=false;
}
function showSuggestions(stateKey){
  const page=pageElement('tools'), state=helpStateDefinition(stateKey), panel=page?.querySelector('.tools-suggestions');
  if(!page||!state||!panel) return false;
  currentTool=''; currentHelpState=state.key; page.classList.remove('showing-tool'); page.classList.add('showing-suggestions');
  const intro=page.querySelector('.page-intro'); if(intro) intro.hidden=true; hideToolModes(page);
  const list=panel.querySelector('.tools-suggestion-list'); if(!list) return false;
  list.innerHTML='';
  state.suggestions.map(toolDefinition).filter(Boolean).forEach((definition,index)=>{
    const button=document.createElement('button'); button.type='button'; button.className='tools-suggestion-row'; button.setAttribute('role','listitem');
    button.innerHTML=`<span class="tools-suggestion-rank" aria-hidden="true">${index+1}</span><span><strong>${definition.title}</strong><small>${definition.hint}</small></span><span class="screen-menu-arrow" aria-hidden="true">›</span>`;
    button.addEventListener('click',()=>navigateTo('tools',{tool:definition.key,state:state.key})); list.appendChild(button);
  });
  panel.hidden=false; return true;
}
function showTool(key,{state=''}={}){
  const page=pageElement('tools'), screen=page?.querySelector(`[data-tool-screen="${key}"]`); if(!page||!screen) return false;
  currentTool=key; currentHelpState=HELP_STATE_KEYS.has(state)?state:''; page.classList.remove('showing-suggestions'); page.classList.add('showing-tool');
  const intro=page.querySelector('.page-intro'); if(intro) intro.hidden=true; hideToolModes(page); screen.hidden=false; return true;
}
function toolForFocus(focus){ if(!focus) return ''; return document.getElementById(focus)?.closest('[data-tool-screen]')?.dataset.toolScreen||''; }
function normalizeRoute(name,{tool='',focus='',state=''}={}){
  const requested=PAGE_ALIASES[name]||'capture', page=ROOT_PAGES.has(requested)?requested:'capture'; let requestedTool='';
  if(page==='tools'){
    if(name==='progress') requestedTool='progress'; else if(TOOL_KEYS.has(tool)) requestedTool=tool; else requestedTool=toolForFocus(focus);
  }
  return {
    page,
    tool:TOOL_KEYS.has(requestedTool)?requestedTool:'',
    state:page==='tools'&&HELP_STATE_KEYS.has(state)?state:'',
    focus:focus||''
  };
}
function routeFromUrl(){
  const url=new URL(window.location.href);
  return normalizeRoute(url.searchParams.get('page')||'capture',{
    tool:url.searchParams.get('tool')||'',
    state:url.searchParams.get('state')||'',
    focus:url.searchParams.get('focus')||''
  });
}
function routeUrl(route){
  const url=new URL(window.location.href); ['page','tool','state','focus'].forEach(key=>url.searchParams.delete(key));
  if(route.page!=='capture') url.searchParams.set('page',route.page);
  if(route.page==='tools'&&route.state) url.searchParams.set('state',route.state);
  if(route.page==='tools'&&route.tool) url.searchParams.set('tool',route.tool);
  if(route.focus) url.searchParams.set('focus',route.focus);
  return `${url.pathname}${url.search}${url.hash}`;
}
function writeRoute(route,mode='push'){
  const state={...(window.history.state||{}),paceRoute:route};
  if(mode==='replace') window.history.replaceState(state,'',routeUrl(route)); else window.history.pushState(state,'',routeUrl(route));
}
function applyRoute(route,{scroll=true}={}){
  document.querySelectorAll('[data-page]').forEach(section=>{ const active=section.dataset.page===route.page; section.hidden=!active; section.classList.toggle('active',active); });
  document.querySelectorAll('[data-page-target]').forEach(button=>{ const active=button.dataset.pageTarget===route.page; button.classList.toggle('active',active); if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if(route.page==='tools'){
    if(route.tool) showTool(route.tool,{state:route.state});
    else if(route.state) showSuggestions(route.state);
    else showToolsOverview();
  } else { currentTool=''; currentHelpState=''; }
  const target=route.focus?document.getElementById(route.focus):null;
  if(target&&!target.closest('[hidden]')) window.requestAnimationFrame(()=>target.scrollIntoView({block:'center',behavior:'smooth'}));
  else if(scroll) window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
}
export function navigateTo(name,{focus='',scroll=true,tool='',state='',replace=false,history=true}={}){
  const route=normalizeRoute(name,{tool,state,focus}); if(history) writeRoute(route,replace?'replace':'push'); applyRoute(route,{scroll});
}
function closeDialog(id){ const dialog=document.getElementById(id); if(dialog?.open) dialog.close(); }
export function initNavigation(){
  setupShell();
  if('scrollRestoration' in window.history) window.history.scrollRestoration='auto';
  document.querySelectorAll('[data-page-target]').forEach(button=>button.addEventListener('click',()=>navigateTo(button.dataset.pageTarget)));
  window.addEventListener('pace:navigate',event=>{
    const detail=typeof event.detail==='string'?{page:event.detail}:(event.detail||{});
    navigateTo(detail.page,{focus:detail.focus||'',tool:detail.tool||'',state:detail.state||'',scroll:detail.scroll!==false,replace:detail.replace===true});
  });
  window.addEventListener('popstate',()=>applyRoute(routeFromUrl(),{scroll:false}));
  document.getElementById('openSettingsFromMore')?.addEventListener('click',()=>document.getElementById('settingsButton')?.click());
  document.getElementById('stuckOpenParking')?.addEventListener('click',()=>{ closeDialog('stuckDialog'); navigateTo('tools',{focus:'spaceHomeTitle'}); });
  document.getElementById('stuckOpenDirection')?.addEventListener('click',()=>{ closeDialog('stuckDialog'); navigateTo('tools',{tool:'direction'}); window.requestAnimationFrame(()=>document.getElementById('openMeh')?.click()); });
  const initialRoute=routeFromUrl(); writeRoute(initialRoute,'replace'); applyRoute(initialRoute,{scroll:false});
}