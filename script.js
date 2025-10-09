/* Clash‑Lite Royale V2 - script.js
   Features:
   - Uses embedded troops data (also provided separately in troops.json)
   - Main Menu & Deck Builder & Battle Loading
   - 20+ troops, spells, elixir bar above deck, 3-minute timer, sudden death (2x elixir)
   - AI auto-deck generation with at least one win condition and one spell
   - Deck-in-game display and card rotation to deck end
   - Icons generated as SVG data URIs (simple vector placeholders)
*/

// ---- Constants & DOM ----
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const mainMenu = document.getElementById('mainMenu');
const deckBuilder = document.getElementById('deckBuilder');
const battleLoading = document.getElementById('battleLoading');
const loaderFill = document.getElementById('loaderFill');
const collectionEl = document.getElementById('collection');
const selectedDeckEl = document.getElementById('selectedDeck');
const startBattleBtn = document.getElementById('startBattleBtn');
const randomDeckBtn = document.getElementById('randomDeckBtn');
const backMainBtn = document.getElementById('backMainBtn');
const btnDeckBuilder = document.getElementById('btnDeckBuilder');
const btnQuickPlay = document.getElementById('btnQuickPlay');
const elixirFill = document.getElementById('elixirFill');
const elixirCount = document.getElementById('elixirCount');
const handEl = document.getElementById('hand');
const deckDuringGame = document.getElementById('deckDuringGame');
const timerDisplay = document.getElementById('timerDisplay');
const logEl = document.getElementById('log');

// ---- Embedded troops (mirrors troops.json) ----
const TROOPS = {
  "soldier": {"type":"unit","role":"melee","hp":50,"speed":70,"atk":12,"range":12,"size":10,"cost":3,"icon":"🗡️"},
  "tank": {"type":"unit","role":"tanky","hp":240,"speed":22,"atk":32,"range":12,"size":18,"cost":7,"icon":"🛡️"},
  "archer": {"type":"unit","role":"ranged","hp":24,"speed":62,"atk":10,"range":220,"size":8,"cost":3,"projectile":true,"projSpeed":420,"icon":"🏹"},
  "giant": {"type":"unit","role":"win","hp":260,"speed":26,"atk":26,"range":12,"size":20,"cost":7,"win":true,"icon":"🦾"},
  "wizard": {"type":"unit","role":"splash","hp":56,"speed":44,"atk":20,"range":160,"size":10,"cost":5,"aoe":50,"projectile":true,"projSpeed":300,"icon":"🪄"},
  "hog": {"type":"unit","role":"win","hp":96,"speed":98,"atk":18,"range":12,"size":12,"cost":4,"win":true,"icon":"🐗"},
  "balloon": {"type":"unit","role":"win-air","hp":92,"speed":34,"atk":80,"range":12,"size":18,"cost":6,"win":true,"air":true,"icon":"🎈"},
  "miner": {"type":"unit","role":"win","hp":72,"speed":68,"atk":16,"range":12,"size":10,"cost":4,"win":true,"groundSpawn":true,"icon":"⛏️"},
  "pekka": {"type":"unit","role":"win","hp":340,"speed":18,"atk":78,"range":12,"size":22,"cost":8,"win":true,"icon":"🤖"},
  "goblins": {"type":"unit","role":"army","hp":14,"speed":86,"atk":6,"range":8,"size":5,"cost":2,"spawns":3,"icon":"👺"},
  "minions": {"type":"unit","role":"army-air","hp":20,"speed":82,"atk":12,"range":10,"size":8,"cost":3,"air":true,"spawns":3,"icon":"🕊️"},
  "musketeer": {"type":"unit","role":"ranged","hp":76,"speed":50,"atk":20,"range":180,"size":10,"cost":4,"projectile":true,"projSpeed":420,"icon":"🎯"},
  "prince": {"type":"unit","role":"charge","hp":140,"speed":80,"atk":38,"range":12,"size":12,"cost":5,"charge":true,"win":true,"icon":"🏇"},
  "skeletons": {"type":"unit","role":"army","hp":8,"speed":96,"atk":6,"range":6,"size":5,"cost":1,"spawns":4,"icon":"💀"},
  "healer": {"type":"unit","role":"support","hp":100,"speed":42,"atk":0,"range":80,"size":10,"cost":5,"heal":true,"icon":"❤️‍🩹"},
  "golem": {"type":"unit","role":"win","hp":520,"speed":14,"atk":90,"range":12,"size":26,"cost":9,"win":true,"icon":"🪨"},
  "bandit": {"type":"unit","role":"dash","hp":118,"speed":86,"atk":30,"range":12,"size":12,"cost":4,"charge":true,"icon":"🏹"},
  "wizard_small": {"type":"unit","role":"splash","hp":36,"speed":48,"atk":14,"range":120,"size":9,"cost":4,"aoe":36,"projectile":true,"projSpeed":320,"icon":"✨"},
  "barbarian": {"type":"unit","role":"melee","hp":92,"speed":68,"atk":22,"range":10,"size":12,"cost":4,"icon":"🪓"},
  "ram": {"type":"unit","role":"win","hp":130,"speed":54,"atk":46,"range":10,"size":14,"cost":5,"win":true,"icon":"🐏"},
  "fireball": {"type":"spell","cost":4,"aoe":70,"damage":100,"icon":"🔥"},
  "arrow": {"type":"spell","cost":3,"aoe":40,"damage":60,"icon":"➡️"},
  "freeze": {"type":"spell","cost":4,"aoe":80,"freeze":2.5,"icon":"❄️"}
};

const ALL_KEYS = Object.keys(TROOPS);

// ---- Game state ----
let playerDeck = [];
let playerHand = [];
let enemyDeck = [];
let enemyHand = [];
let entities = [];
let projectiles = [];
let towers = [];
let logs = [];
let selectedCardIndex = null;

let MAX_ELIXIR = 10;
let ELIXIR_REGEN = 1.0;
let playerElixir = 4;
let enemyElixir = 4;
let timerSeconds = 180;
let suddenDeath = false;

// Utility: log
function pushLog(s){ logs.push(s); if(logs.length>300) logs.shift(); logEl.innerText = logs.slice().reverse().join('\\n'); }

// Utility: svg icon generator
function svgDataURI(symbol, bg='#fff', fg='#012'){ const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect rx='8' width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' font-size='36' dominant-baseline='middle' text-anchor='middle' fill='${fg}'>${symbol}</text></svg>`; return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }

// ---- UI Wiring: Main Menu ----
btnDeckBuilder.onclick = ()=>{ mainMenu.style.display='none'; deckBuilder.style.display='flex'; };
btnQuickPlay.onclick = ()=>{ mainMenu.style.display='none'; // generate random deck quickly and start
  playerDeck = randomDeck(); renderSelectedDeck(); startMatchWithDeck(); };

backMainBtn.onclick = ()=>{ deckBuilder.style.display='none'; mainMenu.style.display='flex'; };

randomDeckBtn.onclick = ()=>{ playerDeck = randomDeck(); renderSelectedDeck(); startBattleBtn.disabled = playerDeck.length!==8; };

startBattleBtn.onclick = ()=>{ deckBuilder.style.display='none'; startMatchWithDeck(); };

// ---- Deck-builder rendering ----
function renderCollection(){
  collectionEl.innerHTML='';
  ALL_KEYS.forEach(k=>{
    const def = TROOPS[k];
    const el = document.createElement('div'); el.className='card'; el.dataset.id=k;
    el.innerHTML = `<div class="icon" style="background-image:url('${svgDataURI(def.icon)}');background-size:44px 44px;background-position:center"></div><div class="title">${k.replace('_',' ')}</div><div class="cost">${def.cost||def.cost===0?def.cost:''}</div>`;
    el.onclick = ()=>{ if(playerDeck.length<8){ playerDeck.push(k); renderSelectedDeck(); startBattleBtn.disabled = playerDeck.length!==8; } };
    collectionEl.appendChild(el);
  });
}

function renderSelectedDeck(){
  selectedDeckEl.innerHTML='';
  playerDeck.forEach((id,idx)=>{ const def=TROOPS[id]; const el=document.createElement('div'); el.className='card'; el.innerHTML=`<div class="icon" style="background-image:url('${svgDataURI(def.icon,'#f6fbff')}');background-size:40px 40px"></div><div class="title">${id.replace('_',' ')}</div><div class="cost">${def.cost||''}</div>`; el.onclick=()=>{ playerDeck.splice(idx,1); renderSelectedDeck(); startBattleBtn.disabled = playerDeck.length!==8; }; selectedDeckEl.appendChild(el); });
}

// Random deck ensuring at least one win and one spell
function randomDeck(){
  const pool = ALL_KEYS.slice();
  const wins = pool.filter(k=>TROOPS[k].win);
  const spells = pool.filter(k=>TROOPS[k].type==='spell');
  const deck=[];
  if(wins.length) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  if(spells.length) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length<8) deck.push(pool[Math.floor(Math.random()*pool.length)]);
  // shuffle
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

// ---- Start match with selected deck ----
function startMatchWithDeck(){
  // Ensure deck length 8
  if(playerDeck.length!==8) playerDeck = randomDeck();
  // prepare enemy deck
  enemyDeck = createAIDeck();
  // draw 4 each
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  // prepare towers (3 per side, middle main)
  towers = [
    {x:80,y:H*0.22,team:0,hp:220,maxHp:220,radius:34,main:false},
    {x:80,y:H*0.50,team:0,hp:420,maxHp:420,radius:40,main:true},
    {x:80,y:H*0.78,team:0,hp:220,maxHp:220,radius:34,main:false},
    {x:W-80,y:H*0.22,team:1,hp:220,maxHp:220,radius:34,main:false},
    {x:W-80,y:H*0.50,team:1,hp:420,maxHp:420,radius:40,main:true},
    {x:W-80,y:H*0.78,team:1,hp:220,maxHp:220,radius:34,main:false}
  ];
  // UI: show battle loader then start
  battleLoading.style.display='flex'; loaderFill.style.width='0%';
  let p=0;
  const interval = setInterval(()=>{ p+=16; loaderFill.style.width = p+'%'; if(p>=100){ clearInterval(interval); battleLoading.style.display='none'; beginMatch(); } }, 140);
}

// AI deck generation function – ensures one win and one spell
function createAIDeck(){
  const pool = ALL_KEYS.slice();
  const deck=[];
  const wins = pool.filter(k=>TROOPS[k].win);
  const spells = pool.filter(k=>TROOPS[k].type==='spell');
  if(wins.length) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  if(spells.length) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length<8) deck.push(pool[Math.floor(Math.random()*pool.length)]);
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

// draw card from deck to hand
function drawCard(hand, deck){ if(deck.length) hand.push(deck.shift()); }

// ---- Begin match proper ----
function beginMatch(){
  // reset state
  entities=[]; projectiles=[]; playerElixir=4; enemyElixir=4; timerSeconds=180; suddenDeath=false; selectedCardIndex=null;
  // render hand and deck UI
  renderHand(); renderDeckDuringGame();
  pushLog('Match started!');
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// render deck during game (small icons showing remaining deck)
function renderDeckDuringGame(){
  deckDuringGame.innerHTML='';
  (playerDeck||[]).slice().reverse().forEach(id=>{
    const def=TROOPS[id];
    const el=document.createElement('div'); el.className='card'; el.style.width='64px'; el.style.height='64px';
    el.innerHTML=`<div class="icon" style="background-image:url('${svgDataURI(def.icon)}');background-size:34px 34px"></div>`;
    deckDuringGame.appendChild(el);
  });
}

// render hand UI
function renderHand(){
  handEl.innerHTML='';
  playerHand.forEach((id,idx)=>{
    const def=TROOPS[id]; const el=document.createElement('div'); el.className='card'; if(playerElixir< (def.cost||0)) el.classList.add('disabled');
    el.innerHTML=`<div class="icon" style="background-image:url('${svgDataURI(def.icon)}');background-size:36px 36px"></div><div class="title">${id.replace('_',' ')}</div><div class="cost">${def.cost||''}</div>`;
    el.onclick = ()=> selectCard(idx);
    handEl.appendChild(el);
  });
  updateElixirUI();
}

// select card to place
function selectCard(idx){
  if(idx<0||idx>=playerHand.length) return;
  const id = playerHand[idx]; const def=TROOPS[id];
  if(playerElixir < (def.cost||0)){ pushLog('Not enough elixir'); return; }
  selectedCardIndex = idx;
  Array.from(handEl.children).forEach((el,i)=> el.style.borderColor = i===idx ? '#ffd6ee' : 'transparent');
  pushLog('Selected '+id);
}

// place card by clicking battlefield (left half)
canvas.addEventListener('click',(ev)=>{
  if(selectedCardIndex===null) return;
  const rect=canvas.getBoundingClientRect(); const x=ev.clientX-rect.left; const y=ev.clientY-rect.top;
  if(x > W*0.5){ pushLog('Place on your half only.'); return; }
  const id = playerHand[selectedCardIndex]; const def=TROOPS[id];
  if(playerElixir < (def.cost||0)){ pushLog('Not enough elixir'); return; }
  // spend elixir
  playerElixir -= def.cost||0;
  // spawn unit or cast spell
  if(def.type==='unit'){ spawnUnit(0, x, y, id); }
  else if(def.type==='spell'){ castSpell(0, x, y, id); }
  // rotation: remove from hand and push to deck end, then draw
  const played = playerHand.splice(selectedCardIndex,1)[0]; playerDeck.push(played); drawCard(playerHand, playerDeck);
  selectedCardIndex = null;
  renderHand(); renderDeckDuringGame();
});

// right-click cancels selection
canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); selectedCardIndex=null; Array.from(handEl.children).forEach(el=>el.style.borderColor='transparent'); });

// spawn unit helper – supports army (spawns multiple) and groundSpawn (miner-like)
function spawnUnit(team, x, y, id){
  const def=TROOPS[id];
  if(def.spawns && def.spawns>1){
    for(let i=0;i<def.spawns;i++){
      const angle = Math.PI*2*(i/def.spawns);
      const ux = x + Math.cos(angle)*(def.size*2 + i*5);
      const uy = y + Math.sin(angle)*(def.size*2 + i*5);
      entities.push(createUnit(team, ux, uy, id));
    }
  } else {
    entities.push(createUnit(team, x, y, id));
  }
  pushLog((team===0?'You':'AI')+' deployed '+id);
}

// create unit instance
function createUnit(team,x,y,id){
  const def=TROOPS[id];
  return {kind:'unit', id:id, team:team, x:x, y:y, hp:def.hp, maxHp:def.hp, speed:def.speed, atk:def.atk, range:def.range||12, size:def.size, aoe:def.aoe||0, air:!!def.air, proj:!!def.projectile, projSpeed:def.projSpeed||0, projDmg:def.atk, atkCd:0, frozen:0, target:null, win:!!def.win, heal:!!def.heal};
}

// cast spell immediate
function castSpell(team,x,y,id){
  const def=TROOPS[id];
  if(def.damage){ entities.forEach(e=>{ if(Math.hypot(e.x-x,e.y-y)<=def.aoe) e.hp -= def.damage; }); towers.forEach(t=>{ if(Math.hypot(t.x-x,t.y-y)<=def.aoe) t.hp -= def.damage*0.9; }); }
  if(def.freeze){ entities.forEach(e=>{ if(Math.hypot(e.x-x,e.y-y)<=def.aoe) e.frozen = Math.max(e.frozen||0, def.freeze); }); }
  pushLog((team===0?'You':'AI')+' cast '+id);
}

// AI play tick - plays if has elixir and cards
let aiTimer = 0;
function aiTick(dt){
  aiTimer += dt;
  if(aiTimer < 0.9) return;
  aiTimer = 0;
  if(enemyHand.length===0) return;
  const playable = enemyHand.filter(id => (TROOPS[id].cost||0) <= enemyElixir);
  if(playable.length===0) return;
  const winChoices = enemyHand.filter(id=>TROOPS[id].win);
  const spellChoices = enemyHand.filter(id=>TROOPS[id].type==='spell');
  let pick;
  if(winChoices.length && Math.random()<0.28) pick = winChoices[Math.floor(Math.random()*winChoices.length)];
  else if(spellChoices.length && Math.random()<0.18) pick = spellChoices[Math.floor(Math.random()*spellChoices.length)];
  else pick = playable[Math.floor(Math.random()*playable.length)];
  const def=TROOPS[pick];
  const x = W - 120 - Math.random()*(W*0.25);
  const laneY = (Math.random() < 0.5) ? H*0.28 + (Math.random()-0.5)*40 : H*0.72 + (Math.random()-0.5)*40;
  enemyElixir -= def.cost||0;
  if(def.type==='unit') spawnUnit(1, x, laneY, pick);
  else castSpell(1, x, laneY, pick);
  const idx = enemyHand.indexOf(pick);
  if(idx>=0){ const played = enemyHand.splice(idx,1)[0]; enemyDeck.push(played); drawCard(enemyHand, enemyDeck); }
}

// AI deck creation ensures win + spell
function createAIDeck(){ const pool=ALL_KEYS.slice(); const deck=[]; const wins=pool.filter(k=>TROOPS[k].win); const spells=pool.filter(k=>TROOPS[k].type==='spell'); if(wins.length) deck.push(wins[Math.floor(Math.random()*wins.length)]); if(spells.length) deck.push(spells[Math.floor(Math.random()*spells.length)]); while(deck.length<8) deck.push(pool[Math.floor(Math.random()*pool.length)]); for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; } return deck; }

// ---- Game Loop ----
let lastTime = performance.now();
function loop(ts){
  const dt = Math.min(0.05, (ts - lastTime)/1000);
  lastTime = ts;
  // elixir regen
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + ELIXIR_REGEN*dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + ELIXIR_REGEN*dt);
  // timer
  timerSeconds -= dt;
  if(timerSeconds <= 0 && !suddenDeath){ suddenDeath = true; ELIXIR_REGEN *= 2; pushLog('Sudden Death! Elixir regen doubled.'); }
  // AI
  aiTick(dt);
  // update units
  for(let i=entities.length-1;i>=0;i--){
    const u = entities[i];
    if(u.frozen && u.frozen>0) u.frozen -= dt;
    if(u.win){ // target towers directly
      const targets = towers.filter(t=>t.team!==u.team);
      if(targets.length) targets.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y)), u.target = targets[0];
    } else {
      if(!u.target || u.target.hp<=0) u.target = findTarget(u);
    }
    if(u.target){
      const d = Math.hypot(u.x-u.target.x,u.y-u.target.y);
      const reach = (u.range||10) + (u.target.radius||u.target.size||0);
      if(d > reach){
        if(!u.frozen || u.frozen<=0){ const dir=Math.atan2(u.target.y-u.y,u.target.x-u.x); u.x += Math.cos(dir)*u.speed*dt; u.y += Math.sin(dir)*u.speed*dt; }
      } else {
        u.atkCd = (u.atkCd||0) - dt;
        if(u.atkCd <= 0){
          u.atkCd = 0.8;
          if(u.proj && u.target) createProjectile(u,u.target);
          else u.target.hp -= u.atk;
        }
      }
    } else {
      if(!u.frozen || u.frozen<=0){ const dir = u.team===0 ? 0 : Math.PI; u.x += Math.cos(dir)*u.speed*dt; }
    }
    if(u.hp <= 0) entities.splice(i,1);
    if(u.x < -120 || u.x > W+120) entities.splice(i,1);
  }
  // projectiles
  for(let i=projectiles.length-1;i>=0;i--){
    const p = projectiles[i]; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    if(p.target){
      const d = Math.hypot(p.x-p.target.x,p.y-p.target.y);
      if(d < (p.target.radius||p.target.size||8) || p.life <= 0){
        if(p.aoe){ entities.forEach(e=>{ if(Math.hypot(e.x-p.x,e.y-p.y)<=p.aoe) e.hp -= p.dmg; }); towers.forEach(t=>{ if(Math.hypot(t.x-p.x,t.y-p.y)<=p.aoe) t.hp -= p.dmg*0.9; }); }
        else p.target.hp -= p.dmg;
        projectiles.splice(i,1); continue;
      }
    }
    if(p.life <= 0) projectiles.splice(i,1);
  }
  // towers damage when units close
  for(const u of entities){ for(const t of towers){ if(u.team!==t.team){ const d=Math.hypot(u.x-t.x,u.y-t.y); if(d < t.radius + u.size + 4){ t.hp -= u.atk*0.35*(dt*60/60); u.hp -= u.atk*0.02; } } } }
  // remove towers with 0 hp
  for(let i=towers.length-1;i>=0;i--){ if(towers[i].hp<=0){ pushLog('A tower has fallen.'); towers.splice(i,1); } }
  // render
  draw();
  updateUI();
  // check end
  const pT = towers.filter(t=>t.team===0).length, eT=towers.filter(t=>t.team===1).length;
  if(timerSeconds> -120 && pT>0 && eT>0) requestAnimationFrame(loop); else { pushLog('Match ended.'); setTimeout(()=>{ mainMenu.style.display='flex'; },1200); }
}

// find target function
function findTarget(unit){
  let candidates = entities.filter(e=>e.team!==unit.team && e.kind==='unit');
  candidates = candidates.concat(towers.filter(t=>t.team!==unit.team));
  if(candidates.length===0) return null;
  candidates.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y));
  return candidates[0];
}

// projectile creation
function createProjectile(unit,target){
  const dx = target.x-unit.x, dy = target.y-unit.y; const dist = Math.hypot(dx,dy); const speed = unit.projSpeed||320;
  const vx = dx/dist*speed, vy = dy/dist*speed; projectiles.push({x:unit.x,y:unit.y,vx:vx,vy:vy,life:dist/speed+1.2,target:target,dmg:unit.projDmg||unit.atk,aoe:unit.aoe||0});
}

// draw functions
function draw(){
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = '#dff9ff'; ctx.fillRect(0,0,W,H);
  // river center
  ctx.fillStyle='rgba(0,120,200,0.06)'; ctx.fillRect(W*0.5-48,0,96,H);
  // bridges
  ctx.fillStyle='rgba(0,0,0,0.03)'; ctx.fillRect(W*0.5-220,H*0.27,440,52); ctx.fillRect(W*0.5-220,H*0.73,440,52);
  // towers
  towers.forEach(drawTower);
  // projectiles
  projectiles.forEach(drawProjectile);
  // units
  entities.forEach(drawUnit);
  // HUD banner
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.fillRect(0,0,W,44); ctx.fillStyle='#023'; ctx.font='16px sans-serif'; ctx.fillText('Clash‑Lite — Royale V2',14,30);
}

function drawTower(t){
  ctx.save(); ctx.fillStyle = t.team===0? '#4ec7ff' : '#ff8b8b'; roundRect(ctx,t.x-46,t.y-46,92,92,12,true,false);
  if(t.main){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(t.x,t.y-46,10,0,Math.PI*2); ctx.fill(); }
  // hp bar
  ctx.fillStyle='#111'; ctx.fillRect(t.x-50,t.y+48,100,10); ctx.fillStyle='#3cf55a'; ctx.fillRect(t.x-50,t.y+48,100*(t.hp/t.maxHp),10); ctx.restore();
}

function drawUnit(u){
  ctx.save(); ctx.globalAlpha=0.95; ctx.beginPath(); ctx.ellipse(u.x,u.y+u.size+6,u.size+6,u.size/2,0,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fill(); ctx.beginPath(); ctx.fillStyle = u.team===0? '#9fe3ff' : '#ffb7b7'; ctx.arc(u.x,u.y,u.size,0,Math.PI*2); ctx.fill();
  // hp bar
  ctx.fillStyle='#111'; ctx.fillRect(u.x-u.size-2,u.y+u.size+6,(u.size*2)+4,6); ctx.fillStyle='#56e596'; ctx.fillRect(u.x-u.size-2,u.y+u.size+6,((u.hp/u.maxHp)*((u.size*2)+4)),6); ctx.restore();
}

function drawProjectile(p){ ctx.save(); ctx.beginPath(); ctx.fillStyle='#ffd47a'; ctx.arc(p.x,p.y,6,0,Math.PI*2); ctx.fill(); if(p.aoe){ ctx.beginPath(); ctx.strokeStyle='rgba(255,120,60,0.14)'; ctx.lineWidth=2; ctx.arc(p.x,p.y,p.aoe,0,Math.PI*2); ctx.stroke(); } ctx.restore(); }

function roundRect(ctx,x,y,w,h,r,fill,stroke){ if(typeof r==='undefined') r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

// ---- UI updates ----
function updateUI(){ elixirFill.style.height = Math.min(1, playerElixir/MAX_ELIXIR)*100 + '%'; elixirCount.innerText = Math.floor(playerElixir); timerDisplay.innerText = formatTime(Math.max(0, timerSeconds)); renderHand(); renderDeckDuringGame(); }

function formatTime(sec){ const s=Math.ceil(sec); const mm=Math.floor(s/60); const ss=s%60; return `${mm}:${ss.toString().padStart(2,'0')}`; }

// ---- rotate button ----
document.getElementById('btnRotate')?.addEventListener('click', ()=>{ if(playerHand.length===0) return; const c = playerHand.shift(); playerDeck.push(c); drawCard(playerHand, playerDeck); renderHand(); pushLog('Rotated card.'); });

// helper drawCard function used in multiple places
function drawCard(hand, deck){ if(deck.length) hand.push(deck.shift()); }

// ---- Initial setup ----
renderCollection();

// ensure some default deck exists for quick testing
if(playerDeck.length === 0) playerDeck = randomDeck();
renderSelectedDeck();

// expose quickplay/start functions for UI
document.getElementById('btnQuickPlay').onclick = ()=>{ mainMenu.style.display='none'; playerDeck = randomDeck(); renderSelectedDeck(); startMatchWithDeck(); };
document.getElementById('btnDeckBuilder').onclick = ()=>{ mainMenu.style.display='none'; deckBuilder.style.display='flex'; };
document.getElementById('startBattleBtn').onclick = ()=>{ if(playerDeck.length!==8) return; deckBuilder.style.display='none'; startMatchWithDeck(); };
document.getElementById('backMainBtn').onclick = ()=>{ deckBuilder.style.display='none'; mainMenu.style.display='flex'; };
document.getElementById('randomDeckBtn').onclick = ()=>{ playerDeck = randomDeck(); renderSelectedDeck(); };

// ---- Done ----
console.log('Clash-Lite Royale V2 loaded.');