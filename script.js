// Clash-Lite Royale Final - script.js (optimized)
// Elixir rate approximates Clash Royale: 1 elixir per 2.8 seconds (~0.3571 el/s). Sudden death doubles it.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const mainMenu = document.getElementById('mainMenu');
const btnQuickPlay = document.getElementById('btnQuickPlay');
const elixirBar = document.getElementById('elixirBar');
const elixirCount = document.getElementById('elixirCount');
const handEl = document.getElementById('hand');
const deckDuringGame = document.getElementById('deckDuringGame');
const timerDisplay = document.getElementById('timerDisplay');
const logEl = document.getElementById('log');

let troops;
let playerDeck = [];
let playerHand = [];
let enemyDeck = [];
let enemyHand = [];
let entities = [];
let projectiles = [];
let towers = [];
let logs = [];
let selectedCardIndex = null;

const MAX_ELIXIR = 10;
// 1 elixir per 2.8 sec => ~0.357142857 per sec
let ELIXIR_REGEN = 1/2.8;
let playerElixir = 4;
let enemyElixir = 4;

let timerSeconds = 180;
let suddenDeath = false;

let lastTime = performance.now();

// load troops.json (synchronously via fetch when available)
async function loadTroops(){
  try{
    const res = await fetch('troops.json');
    troops = await res.json();
  }catch(e){
    // fallback: minimal set if fetching fails
    troops = {"soldier": {"cost":3,"icon":"⚔️"}, "archer":{"cost":3,"icon":"🏹"}};
    console.warn('Could not load troops.json, using fallback.',e);
  }
}
loadTroops().then(()=>{ console.log('troops loaded'); });

function pushLog(s){ logs.push(s); if(logs.length>300) logs.shift(); logEl.innerText = logs.slice().reverse().join('\n'); }

// svg icon helper: uses local icons folder for nicer generated icons
function iconUri(name){ return `icons/${name}.svg`; }

// UI: quickplay
btnQuickPlay.onclick = ()=>{ mainMenu.style.display='none'; setupQuickMatch(); };

function setupQuickMatch(){
  // build random player deck of 8 from troops keys
  const keys = Object.keys(troops);
  playerDeck = [];
  for(let i=0;i<8;i++) playerDeck.push(keys[Math.floor(Math.random()*keys.length)]);
  enemyDeck = createAIDeck();
  // draw 4 each
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  // towers
  towers = [
    {x:80,y:H*0.22,team:0,hp:220,maxHp:220,radius:34,main:false},
    {x:80,y:H*0.5,team:0,hp:420,maxHp:420,radius:40,main:true},
    {x:80,y:H*0.78,team:0,hp:220,maxHp:220,radius:34,main:false},
    {x:W-80,y:H*0.22,team:1,hp:220,maxHp:220,radius:34,main:false},
    {x:W-80,y:H*0.5,team:1,hp:420,maxHp:420,radius:40,main:true},
    {x:W-80,y:H*0.78,team:1,hp:220,maxHp:220,radius:34,main:false}
  ];
  playerElixir = 4; enemyElixir = 4; timerSeconds = 180; suddenDeath=false;
  renderHand(); renderDeckDuringGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function createAIDeck(){
  const keys = Object.keys(troops);
  const wins = keys.filter(k=> troops[k].win);
  const spells = keys.filter(k=> troops[k].type==='spell');
  const deck = [];
  if(wins.length) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  if(spells.length) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length<8) deck.push(keys[Math.floor(Math.random()*keys.length)]);
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

function drawCard(hand, deck){ if(deck.length) hand.push(deck.shift()); }

function renderDeckDuringGame(){ deckDuringGame.innerHTML=''; (playerDeck||[]).slice().reverse().forEach(id=>{ const el=document.createElement('div'); el.style.width='56px'; el.style.height='56px'; el.style.borderRadius='8px'; el.style.backgroundImage=`url(${iconUri(id)})`; el.style.backgroundSize='56px 56px'; el.style.boxShadow='0 8px 18px rgba(0,0,0,0.08)'; deckDuringGame.appendChild(el); }); }

function renderHand(){
  handEl.innerHTML='';
  playerHand.forEach((id,idx)=>{
    const def = troops[id] || {cost:'?', icon:'❓'};
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `<div class="icon" style="background-image:url('${iconUri(id)}');background-size:64px 64px"></div><div class="cost">${def.cost||'?'}</div>`;
    card.onclick = ()=> selectCard(idx);
    if(playerElixir < (def.cost||0)) card.style.opacity = '0.5'; else card.style.opacity = '1.0';
    handEl.appendChild(card);
  });
  updateElixirUI();
}

function selectCard(idx){
  if(idx<0||idx>=playerHand.length) return;
  const id = playerHand[idx]; const def = troops[id]||{};
  if(playerElixir < (def.cost||0)){ pushLog('Not enough elixir'); return; }
  selectedCardIndex = idx;
  Array.from(handEl.children).forEach((el,i)=> el.style.borderColor = i===idx ? '#ffd6ee' : 'transparent');
  pushLog('Selected '+id);
}

canvas.addEventListener('click',(ev)=>{
  if(selectedCardIndex===null) return;
  const rect = canvas.getBoundingClientRect(); const x = ev.clientX - rect.left; const y = ev.clientY - rect.top;
  if(x > W*0.5){ pushLog('Place on your half only'); return; }
  const id = playerHand[selectedCardIndex]; const def = troops[id] || {};
  if(playerElixir < (def.cost||0)){ pushLog('Not enough elixir'); return; }
  playerElixir -= def.cost||0;
  // spawn minimal visual unit for demo
  entities.push({kind:'unit',id:id,team:0,x:x,y:y,hp:def.hp||30,maxHp:def.hp||30,size:def.size||8});
  // rotation
  const played = playerHand.splice(selectedCardIndex,1)[0]; playerDeck.push(played); drawCard(playerHand, playerDeck);
  selectedCardIndex = null; renderHand(); renderDeckDuringGame();
});

canvas.addEventListener('contextmenu',(e)=>{ e.preventDefault(); selectedCardIndex=null; Array.from(handEl.children).forEach(el=>el.style.borderColor='transparent'); });

// loop
let aiTimer = 0;
function loop(ts){
  const dt = Math.min(0.05,(ts-lastTime)/1000); lastTime=ts;
  // regen elixir
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + ELIXIR_REGEN*dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + ELIXIR_REGEN*dt);
  // timer
  timerSeconds -= dt;
  if(timerSeconds <= 0 && !suddenDeath){ suddenDeath=true; ELIXIR_REGEN *= 2; pushLog('Sudden Death: Elixir regen doubled'); }
  // AI simple spawn
  aiTimer += dt; if(aiTimer>1.0){ aiTimer=0; if(enemyHand.length) { const pick = enemyHand[0]; const def = troops[pick]||{}; if((def.cost||0) <= enemyElixir){ enemyElixir -= def.cost||0; entities.push({kind:'unit',id:pick,team:1,x:W-140,y: (Math.random()<0.5?H*0.3:H*0.7),hp:def.hp||30,maxHp:def.hp||30,size:def.size||8 }); const played = enemyHand.shift(); enemyDeck.push(played); drawCard(enemyHand, enemyDeck); } } }
  // update entities (simple forward movement)
  for(let i=entities.length-1;i>=0;i--){
    const u = entities[i]; if(u.team===0) u.x += 40*dt; else u.x -= 40*dt;
    if(u.x < -80 || u.x > W+80) entities.splice(i,1);
  }
  draw(); updateUI(); requestAnimationFrame(loop);
}

// draw basics
function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#dff9ff'; ctx.fillRect(0,0,W,H);
  // river
  ctx.fillStyle='rgba(0,120,200,0.06)'; ctx.fillRect(W*0.5-60,0,120,H);
  // bridges
  ctx.fillStyle='rgba(0,0,0,0.03)'; ctx.fillRect(W*0.5-260,H*0.27,520,56); ctx.fillRect(W*0.5-260,H*0.73,520,56);
  // towers
  towers.forEach(t=>{ ctx.fillStyle = t.team===0? '#4ec7ff' : '#ff8b8b'; roundRect(ctx,t.x-46,t.y-46,92,92,12,true,false); ctx.fillStyle='#111'; ctx.fillRect(t.x-50,t.y+48,100,10); ctx.fillStyle='#3cf55a'; ctx.fillRect(t.x-50,t.y+48,100*(t.hp/t.maxHp),10); });
  // entities
  entities.forEach(e=>{ ctx.beginPath(); ctx.fillStyle = e.team===0? '#9fe3ff' : '#ffb7b7'; ctx.arc(e.x,e.y,e.size,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#111'; ctx.fillRect(e.x-e.size-2,e.y+e.size+6,(e.size*2)+4,6); ctx.fillStyle='#4de07a'; ctx.fillRect(e.x-e.size-2,e.y+e.size+6,((e.hp/e.maxHp)*((e.size*2)+4)),6); });
  // top label
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.fillRect(0,0,W,44); ctx.fillStyle='#023'; ctx.font='16px sans-serif'; ctx.fillText('Clash‑Lite — Royale Final',14,30);
}

function roundRect(ctx,x,y,w,h,r,fill,stroke){ if(typeof r==='undefined') r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

function updateUI(){
  // update elixir bar fill via pseudo-element: set width on ::before by modifying style property
  const pct = Math.min(1, playerElixir / MAX_ELIXIR);
  elixirBar.style.setProperty('--fill', Math.round(pct*100)+'%');
  // also set ::before via inline style hack: use background-size trick
  elixirBar.style.setProperty('background', `linear-gradient(90deg,#ffd6ee ${pct*100}%, #ff9ad1 ${pct*100}% )`);
  elixirCount.innerText = Math.floor(playerElixir);
  timerDisplay.innerText = formatTime(Math.max(0, Math.ceil(timerSeconds)));
  renderHand();
  renderDeckDuringGame();
}

function formatTime(s){ const mm = Math.floor(s/60); const ss = s%60; return mm+':'+String(ss).padStart(2,'0'); }

// initial render of empty hand
renderHand();

console.log('Clash-Lite Royale Final script loaded.');