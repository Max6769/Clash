// Clash-Lite Improved - script.js
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const btnQuickPlay = document.getElementById('btnQuickPlay');
const handEl = document.getElementById('hand');
const elixirFill = document.getElementById('elixirFill');
const elixirNum = document.getElementById('elixirNum');

let troops = {};
async function loadTroops(){ try{ const r = await fetch('troops.json'); troops = await r.json(); console.log('troops loaded', Object.keys(troops).length); }catch(e){ console.error('troops.json load failed', e); } }
loadTroops();

// game state
let playerDeck = [];
let playerHand = [];
let enemyDeck = [];
let enemyHand = [];
let entities = [];
let towers = [];

// elixir: 1 elixir per 2.8s => rate = 1/2.8
let ELIXIR_RATE = 1/2.8;
let playerElixir = 4, enemyElixir = 4, MAX_ELIXIR = 10;
let timer = 180, lastTime = performance.now();
let suddenDeath=false;

btnQuickPlay.onclick = ()=>{ document.querySelector('.menu').style.display='none'; startQuickMatch(); };

function startQuickMatch(){
  // fill decks with random 8 distinct cards
  const keys = Object.keys(troops);
  playerDeck = []; enemyDeck = [];
  // ensure variety and at least one win + one spell for AI
  let pool = keys.slice();
  while(playerDeck.length < 8){ const pick = pool[Math.floor(Math.random()*pool.length)]; playerDeck.push(pick); }
  enemyDeck = createAIDeck();
  // draw 4
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  // setup towers (3 per side)
  towers = [
    {x:120,y:H*0.25,team:0,hp:220,maxHp:220,main:false},
    {x:120,y:H*0.5,team:0,hp:420,maxHp:420,main:true},
    {x:120,y:H*0.75,team:0,hp:220,maxHp:220,main:false},
    {x:W-120,y:H*0.25,team:1,hp:220,maxHp:220,main:false},
    {x:W-120,y:H*0.5,team:1,hp:420,maxHp:420,main:true},
    {x:W-120,y:H*0.75,team:1,hp:220,maxHp:220,main:false}
  ];
  renderHand(); renderDeckIcons();
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
  while(deck.length < 8) deck.push(keys[Math.floor(Math.random()*keys.length)]);
  // shuffle
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

function drawCard(hand, deck){ if(deck.length) hand.push(deck.shift()); }

function renderHand(){
  handEl.innerHTML='';
  playerHand.forEach((id,idx)=>{
    const def = troops[id] || {cost:'?'};
    const slot = document.createElement('div'); slot.className='cardSlot';
    const icon = document.createElement('div'); icon.className='icon'; icon.style.backgroundImage = `url(icons/${id}.svg)`;
    const cost = document.createElement('div'); cost.className='cost'; cost.innerText = def.cost || '?';
    slot.appendChild(icon); slot.appendChild(cost);
    slot.onclick = ()=> selectCard(idx);
    if(playerElixir < (def.cost||0)) slot.style.opacity=0.5; else slot.style.opacity=1.0;
    handEl.appendChild(slot);
  });
  updateElixirUI();
}

function renderDeckIcons(){
  const dd = document.getElementById('deckDuringGame');
  if(!dd) return;
  dd.innerHTML='';
  playerDeck.slice().reverse().forEach(id=>{
    const el = document.createElement('div'); el.style.width='48px'; el.style.height='48px'; el.style.backgroundImage=`url(icons/${id}.svg)`;
    el.style.backgroundSize='48px 48px'; el.style.borderRadius='6px'; el.style.boxShadow='0 8px 18px rgba(0,0,0,0.08)';
    dd.appendChild(el);
  });
}

let selectedCard = null;
function selectCard(idx){
  if(idx<0||idx>=playerHand.length) return;
  const id = playerHand[idx]; const def = troops[id]||{};
  if(playerElixir < (def.cost||0)) return;
  selectedCard = idx;
  Array.from(handEl.children).forEach((el,i)=> el.style.borderColor = i===idx ? '#ffd6ee' : 'transparent');
}

canvas.addEventListener('click',(e)=>{
  if(selectedCard===null) return;
  const rect = canvas.getBoundingClientRect(); const x = e.clientX-rect.left, y = e.clientY-rect.top;
  if(x > W*0.5){ return; } // place only on player's half
  const id = playerHand[selectedCard]; const def = troops[id]||{};
  playerElixir -= def.cost||0;
  // spawn a simple visual unit
  entities.push({id:id,team:0,x:x,y:y,hp:def.hp||30,maxHp:def.hp||30,size:def.size||8});
  // rotation: move played card to deck end and draw new
  const played = playerHand.splice(selectedCard,1)[0]; playerDeck.push(played); drawCard(playerHand, playerDeck);
  selectedCard = null; renderHand(); renderDeckIcons();
});

canvas.addEventListener('contextmenu',(e)=>{ e.preventDefault(); selectedCard=null; Array.from(handEl.children).forEach(el=> el.style.borderColor='transparent'); });

// main loop
let aiTimer=0;
function loop(ts){
  const dt = Math.min(0.05,(ts-lastTime)/1000);
  lastTime = ts;
  // elixir regen: base rate 1/2.8 el/s; when timer <=60s, double regen (double elixir)
  let rate = ELIXIR_RATE;
  if(timer <= 60) rate *= 2;
  // apply regen for player and enemy
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + rate*dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + rate*dt);
  timer -= dt;
  // AI simple play
  aiTimer += dt;
  if(aiTimer>1.0){ aiTimer=0; if(enemyHand.length){ const pick = enemyHand[0]; const def = troops[pick]||{}; if((def.cost||0) <= enemyElixir){ enemyElixir -= def.cost||0; entities.push({id:pick,team:1,x:W-120,y:(Math.random()<0.5?H*0.28:H*0.72),hp:def.hp||30,maxHp:def.hp||30,size:def.size||8}); const played = enemyHand.shift(); enemyDeck.push(played); drawCard(enemyHand, enemyDeck); } } }
  // update entities simple movement
  for(let i=entities.length-1;i>=0;i--){
    const u=entities[i]; if(u.team===0) u.x += 40*dt; else u.x -= 40*dt;
    if(u.x < -80 || u.x > W+80) entities.splice(i,1);
  }
  draw();
  updateElixirUI();
  if(timer> -120) requestAnimationFrame(loop); else { console.log('match ended'); document.querySelector('.menu').style.display='flex'; }
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // background arena with river center and bridges
  ctx.fillStyle = '#cfeefd'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(0,120,200,0.06)'; ctx.fillRect(W*0.5-96,0,192,H);
  // bridges
  ctx.fillStyle='rgba(0,0,0,0.03)'; ctx.fillRect(W*0.5-240,H*0.28,480,60); ctx.fillRect(W*0.5-240,H*0.72,480,60);
  // towers
  towers.forEach(t=>{
    ctx.save();
    ctx.fillStyle = t.team===0? '#4ec7ff' : '#ff8b8b';
    roundRect(ctx,t.x-46,t.y-46,92,92,12,true,false);
    if(t.main){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(t.x,t.y-46,10,0,Math.PI*2); ctx.fill(); }
    // hp bar
    ctx.fillStyle='#111'; ctx.fillRect(t.x-50,t.y+48,100,10); ctx.fillStyle='#3cf55a'; ctx.fillRect(t.x-50,t.y+48,100*(t.hp/t.maxHp),10);
    ctx.restore();
  });
  // entities
  entities.forEach(e=>{
    ctx.beginPath(); ctx.fillStyle = e.team===0? '#9fe3ff' : '#ffb7b7'; ctx.arc(e.x,e.y,e.size,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.fillRect(e.x-e.size-2,e.y+e.size+6,(e.size*2)+4,6); ctx.fillStyle='#4de07a'; ctx.fillRect(e.x-e.size-2,e.y+e.size+6,((e.hp/e.maxHp)*((e.size*2)+4)),6);
  });
  // top banner
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.fillRect(0,0,W,44); ctx.fillStyle='#023'; ctx.font='16px sans-serif'; ctx.fillText('Clash‑Lite — Improved (two‑sided arena)',14,30);
}

function updateElixirUI(){
  const pct = Math.min(1, playerElixir / MAX_ELIXIR);
  elixirFill.style.width = (pct*100)+'%';
  elixirNum.innerText = Math.floor(playerElixir);
}

// helpers
function roundRect(ctx,x,y,w,h,r,fill,stroke){ if(typeof r==='undefined') r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }
