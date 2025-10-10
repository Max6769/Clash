// Clash-Lite Colosseum — rebuilt from scratch
// Features: red/gold colosseum, deck maker, smooth battle, AI, cards from cards_pack.json (not troops.json).

const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// UI refs
const menu = document.getElementById('menu');
const gameContainer = document.getElementById('gameContainer');
const btnPlay = document.getElementById('btnPlay');
const btnDeck = document.getElementById('btnDeck');
const btnDemoAI = document.getElementById('btnDemoAI');
const cardPool = document.getElementById('cardPool');
const deckSlots = document.getElementById('deckSlots');
const cardPoolDataUrl = 'cards_pack.json';
const handArea = document.getElementById('handArea');
const elixirFill = document.getElementById('elixirFill');
const elixirValue = document.getElementById('elixirValue');
const btnClear = document.getElementById('btnClear');
const btnStart = document.getElementById('btnStart');

// Game data
let CARD_DATA = [];
let deck = []; // player's deck (max 8)
let playerHand = [], enemyHand = [], playerDeck = [], enemyDeck = [];
let entities = [], towers = [];
let playerElixir = 4, enemyElixir = 4, MAX_ELIXIR = 10;
let ELIXIR_RATE = 0.35; // per second
let gameRunning = false;
let lastTime = performance.now();
let timer = 120;

// load card data
fetch(cardPoolDataUrl).then(r=>r.json()).then(j=> {
  CARD_DATA = j.cards || [];
  buildCardPool();
}).catch(e=> { console.error('cards load failed', e); });

function buildCardPool(){
  cardPool.innerHTML = '';
  CARD_DATA.forEach(c=>{
    const el = document.createElement('div'); el.className='cardItem'; el.draggable=true;
    el.innerHTML = `<img src="icons/${c.id}.svg" alt="${c.name}"><div class="meta"><strong>${c.name}</strong><div>${c.cost} • ${c.type}</div></div>`;
    el.addEventListener('click', ()=> addToDeck(c.id));
    el.addEventListener('dragstart', (ev)=>{ ev.dataTransfer.setData('text/plain', c.id); });
    cardPool.appendChild(el);
  });
  renderDeckSlots();
}

function renderDeckSlots(){
  deckSlots.innerHTML='';
  for(let i=0;i<8;i++){
    const slot = document.createElement('div'); slot.className='deckSlot ' + (deck[i]? '' : 'empty');
    if(deck[i]){
      slot.innerHTML = `<img src="icons/${deck[i]}.svg" style="width:48px;height:48px">`;
      slot.addEventListener('click', ()=> { deck.splice(i,1); renderDeckSlots(); });
    } else {
      slot.textContent = '+';
      slot.addEventListener('dragover', (e)=> e.preventDefault());
      slot.addEventListener('drop', (e)=> { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); deck[i]=id; renderDeckSlots(); });
    }
    deckSlots.appendChild(slot);
  }
}

function addToDeck(id){
  if(deck.length>=8) { alert('Deck full (8 cards).'); return; }
  deck.push(id); renderDeckSlots();
}

btnClear.addEventListener('click', ()=>{ deck=[]; renderDeckSlots(); });
btnStart.addEventListener('click', ()=> startMatch());
btnPlay.addEventListener('click', ()=> { menu.style.display='none'; gameContainer.classList.remove('hidden'); startQuickMatch(); });
btnDemoAI.addEventListener('click', ()=> { menu.style.display='none'; gameContainer.classList.remove('hidden'); startAIDemo(); });
btnDeck.addEventListener('click', ()=> { alert('Deck Maker: drag cards from left into slots. Click a slot to remove a card.'); });

// Start quick match: auto-generate decks if none
function startQuickMatch(){
  if(deck.length<4){
    // auto-generate balanced deck
    const ids = CARD_DATA.map(c=>c.id);
    deck = shuffle(ids).slice(0,8);
    renderDeckSlots();
  }
  startMatch();
}

function startMatch(){
  // prepare decks and hands
  playerDeck = deck.slice();
  enemyDeck = createAIDeck();
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  entities = [];
  setupTowers();
  playerElixir = 4; enemyElixir = 4; timer = 120; lastTime = performance.now(); gameRunning = true;
  requestAnimationFrame(loop);
}

function createAIDeck(){
  // AI deck: prefer heavy and spells, but random otherwise
  const heavy = CARD_DATA.filter(c=> c.type==='melee' && c.hp>=200).map(c=>c.id);
  const spells = CARD_DATA.filter(c=> c.type==='spell').map(c=>c.id);
  const ids = CARD_DATA.map(c=>c.id);
  let d = [];
  if(heavy.length) d.push(randomChoice(heavy));
  if(spells.length) d.push(randomChoice(spells));
  while(d.length<8) d.push(randomChoice(ids));
  return shuffle(d);
}

function drawCard(hand, deckList){ if(deckList.length) hand.push(deckList.shift()); }

function setupTowers(){
  towers = [
    {x:140,y:H*0.28,team:0,hp:220,maxHp:220,main:false},
    {x:140,y:H*0.5,team:0,hp:480,maxHp:480,main:true},
    {x:140,y:H*0.72,team:0,hp:220,maxHp:220,main:false},
    {x:W-140,y:H*0.28,team:1,hp:220,maxHp:220,main:false},
    {x:W-140,y:H*0.5,team:1,hp:480,maxHp:480,main:true},
    {x:W-140,y:H*0.72,team:1,hp:220,maxHp:220,main:false}
  ];
}

// player places a card by clicking a hand card then clicking the arena
let selectedHandIndex = null;
function renderHandUI(){
  handArea.innerHTML='';
  playerHand.forEach((id, i)=>{
    const c = CARD_DATA.find(x=>x.id===id);
    const el = document.createElement('div'); el.className='handCard';
    el.innerHTML = `<img src="icons/${id}.svg" style="width:64px;height:64px"><div style="font-size:13px">${c.name}</div><div style="font-weight:900">${c.cost}</div>`;
    el.addEventListener('click', ()=> selectedHandIndex = i );
    handArea.appendChild(el);
  });
  elixirValue.innerText = Math.floor(playerElixir);
  const pct = Math.min(1, playerElixir / MAX_ELIXIR);
  document.getElementById('elixirFill').style.width = (pct*100) + '%';
}

canvas.addEventListener('click', (e)=>{
  if(selectedHandIndex===null) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if(x > W*0.55) return; // must deploy on player's side
  const id = playerHand[selectedHandIndex];
  const card = CARD_DATA.find(c=> c.id===id);
  if(!card) return;
  if(playerElixir < card.cost) { alert('Not enough elixir'); return; }
  deployCardAt(id, 0, x, y);
  playerElixir -= card.cost;
  playerDeck.push(playerHand.splice(selectedHandIndex,1)[0]);
  selectedHandIndex = null;
  drawCard(playerHand, playerDeck);
  renderHandUI();
});

// deploy function
function deployCardAt(id, team, x, y){
  const def = CARD_DATA.find(c=>c.id===id);
  if(!def) return;
  if(def.type==='spell'){
    entities.push({kind:'spell',id:id,team:team,x:x,y:y,radius:def.radius||60,atk:def.atk||40,ttl:0.9});
  } else {
    entities.push({kind:'unit',id:id,team:team,x:x,y:y,hp:def.hp,atk:def.atk||8,speed:def.speed||50,size:def.size||10,cd:0,heal:def.heal||0});
  }
}

// AI simple deployment and targeting
let aiTimer=0;
function aiBehavior(dt){
  aiTimer += dt;
  if(aiTimer > 0.9){
    aiTimer = 0;
    // try play a card from enemyHand if enough elixir
    for(let i=0;i<enemyHand.length;i++){
      const id = enemyHand[i]; const def = CARD_DATA.find(c=>c.id===id);
      if(def && def.cost <= enemyElixir){
        enemyElixir -= def.cost;
        // place near their side
        const tx = W - 220; const ty = (Math.random()<0.5? H*0.3 : H*0.72);
        deployCardAt(id, 1, tx + (Math.random()-0.5)*40, ty + (Math.random()-0.5)*24);
        enemyDeck.push(enemyHand.splice(i,1)[0]);
        drawCard(enemyHand, enemyDeck);
        break;
      }
    }
  }
}

// physics and combat loop
function updateEntities(dt){
  // units: move toward nearest enemy unit or tower and attack
  for(let i=entities.length-1;i>=0;i--){
    const e = entities[i];
    if(e.kind==='unit'){
      // healing aura
      if(e.heal){
        entities.forEach(o=>{ if(o.kind==='unit' && o.team===e.team){ const d = Math.hypot(o.x-e.x,o.y-e.y); if(d < 60) o.hp = Math.min((CARD_DATA.find(c=>c.id===o.id).hp || o.maxHp || o.hp), o.hp + e.heal * dt); } });
      }
      // find target
      let target = findNearestEnemyUnit(e);
      if(!target){ target = findNearestEnemyTower(e); }
      if(target){
        const dx = target.x - e.x; const dy = target.y - e.y; const dist = Math.hypot(dx,dy);
        if(dist > (e.size + (target.size||20)) + 6){
          const nx = dx / dist, ny = dy / dist;
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        } else {
          e.cd -= dt;
          if(e.cd <= 0){
            e.cd = 0.9 - Math.min(0.5, e.speed/300);
            // attack
            if(target._isTower){
              target.hp -= e.atk;
              spawnParticle(target.x + (Math.random()-0.5)*20, target.y + (Math.random()-0.5)*20, '#ffdd80');
            } else {
              target.hp -= e.atk;
              spawnParticle(target.x, target.y, e.team===0? '#ffd86b' : '#ff8a80');
            }
          }
        }
      } else {
        // advance slightly
        e.x += (e.team===0? 1:-1) * e.speed * dt;
      }
      if(e.hp <= 0 || e.x < -100 || e.x > W+100){ entities.splice(i,1); }
    } else if(e.kind==='spell'){
      e.ttl -= dt;
      if(e.ttl <= 0){
        // apply damage to units and towers within radius
        entities.forEach(u=>{ if(u.kind==='unit'){ const d = Math.hypot(u.x-e.x,u.y-e.y); if(d <= e.radius + (u.size||0)) u.hp -= e.atk * (1 - d/(e.radius+1)); } });
        towers.forEach(t=>{ const d = Math.hypot(t.x-e.x,t.y-e.y); if(d <= e.radius + 30) t.hp -= e.atk * (1 - d/(e.radius+1)); });
        spawnExplosion(e.x,e.y); entities.splice(i,1);
      }
    }
  }
}

// helpers for finding targets
function findNearestEnemyUnit(unit){
  const list = entities.filter(u=> u.kind==='unit' && u.team !== unit.team);
  if(list.length===0) return null;
  list.sort((a,b)=> Math.hypot(a.x-unit.x,a.y-unit.y) - Math.hypot(b.x-unit.x,b.y-unit.y));
  return list[0];
}
function findNearestEnemyTower(unit){
  const list = towers.filter(t=> t.team !== unit.team);
  if(list.length===0) return null;
  list.sort((a,b)=> Math.abs(a.y - unit.y) - Math.abs(b.y - unit.y));
  const t = list[0]; t._isTower = true; return t;
}

// simple particles
let particles = [];
function spawnParticle(x,y,color){
  for(let i=0;i<6;i++){ particles.push({x:x,y:y,vx:(Math.random()-0.5)*120,vy:(Math.random()-0.5)*120,life:0.4,color:color}); }
}
function spawnExplosion(x,y){
  for(let i=0;i<18;i++){ particles.push({x:x,y:y,vx:(Math.random()-0.5)*260,vy:(Math.random()-0.5)*260,life:0.8,color:'#ffb85a'}); }
}

// main loop
function loop(ts){
  const dt = Math.min(0.05, (ts - lastTime)/1000);
  lastTime = ts;
  if(!gameRunning) return;
  // elixir regen
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + ELIXIR_RATE * dt * (timer<=45?2:1));
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + ELIXIR_RATE * dt * (timer<=45?2:1));
  timer -= dt;

  // AI draw & play
  aiBehavior(dt);

  // update entities physics & combat
  updateEntities(dt);

  // advance particles
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if(p.life <= 0) particles.splice(i,1);
  }

  // remove destroyed towers and check end condition
  towers = towers.filter(t=> t.hp > 0);

  // render
  drawScene();

  // update UI
  renderHandUI();

  if(timer > -60 && towers.filter(t=> t.team===0).length>0 && towers.filter(t=> t.team===1).length>0){
    requestAnimationFrame(loop);
  } else {
    gameRunning = false;
    const p = towers.filter(t=>t.team===0).length, e = towers.filter(t=>t.team===1).length;
    const winner = p>e? 'Player' : (e>p? 'Enemy' : 'Draw');
    setTimeout(()=> { alert('Match ended — winner: ' + winner); menu.style.display='flex'; gameContainer.classList.add('hidden'); }, 200);
  }
}

// draw the colosseum arena and units
function drawScene(){
  // background
  ctx.clearRect(0,0,W,H);
  // draw colosseum rings
  drawColosseumBackground();
  // draw bridges / lanes
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(W*0.5 - 340, H*0.28 + 40, 680, 36);
  ctx.fillRect(W*0.5 - 340, H*0.72 - 76, 680, 36);

  // render towers
  towers.forEach(t=>{
    ctx.save();
    roundRect(ctx, t.x-60, t.y-60, 120, 120, 12, true, false);
    ctx.fillStyle = t.main? '#ffd86b' : (t.team===0? '#ffdfb0' : '#ffb0b0');
    ctx.beginPath(); ctx.arc(t.x, t.y-40, 20, 0, Math.PI*2); ctx.fill();
    // hp bar
    ctx.fillStyle='#111'; ctx.fillRect(t.x-56, t.y+56, 112, 10);
    ctx.fillStyle='#3cf55a'; ctx.fillRect(t.x-56, t.y+56, Math.max(0,112 * (t.hp / t.maxHp)), 10);
    ctx.restore();
  });

  // render entities
  entities.forEach(e=>{
    if(e.kind==='unit'){
      // shadow
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size + 6, e.size*1.6, e.size*0.6, 0, 0, Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fill();
      // body
      ctx.beginPath(); ctx.fillStyle = e.team===0? '#ffd86b' : '#ff7a6a'; ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(e.x-2,e.y-2,e.size*0.5,0,Math.PI*2); ctx.fill();
      // hp bar
      ctx.fillStyle='#111'; ctx.fillRect(e.x - e.size -2, e.y + e.size + 8, (e.size*2)+4, 6);
      ctx.fillStyle = '#00d46b'; ctx.fillRect(e.x - e.size -2, e.y + e.size + 8, ((e.hp / (CARD_DATA.find(c=>c.id===e.id).hp || e.hp)) * ((e.size*2)+4)), 6);
    } else if(e.kind==='spell'){
      ctx.beginPath(); ctx.fillStyle = '#ff5f50'; ctx.arc(e.x,e.y, 6 + 8*Math.abs(Math.sin(performance.now()/200)), 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=2; ctx.arc(e.x,e.y,e.radius*(0.7 + 0.1*Math.sin(performance.now()/300)),0,Math.PI*2); ctx.stroke();
    }
  });

  // particles
  particles.forEach(p=>{
    ctx.globalAlpha = Math.max(0, p.life / 0.8);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  // top UI text
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(0,0,W,48);
  ctx.fillStyle='#ffd86b'; ctx.font='18px Inter, sans-serif'; ctx.fillText('Colosseum — Clash‑Lite (Red & Gold)', 18, 34);
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='14px Inter, sans-serif'; ctx.fillText('Towers: P ' + towers.filter(t=>t.team===0).length + ' • E ' + towers.filter(t=>t.team===1).length, W - 260, 30);
}

// draw colosseum background with rings and banners
function drawColosseumBackground(){
  // sand arena floor
  const grd = ctx.createRadialGradient(W*0.5, H*0.55, 20, W*0.5, H*0.55, W*0.9);
  grd.addColorStop(0, '#2b0b06'); grd.addColorStop(1, '#040305');
  ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);

  // draw rings
  for(let i=0;i<6;i++){
    const r = 380 - i*48;
    ctx.beginPath();
    ctx.lineWidth = 18 - i*2;
    ctx.strokeStyle = (i%2===0) ? '#2a0b06' : '#470d06';
    ctx.arc(W*0.5, H*0.55, r, 0, Math.PI*2);
    ctx.stroke();
  }

  // draw banners
  for(let i=0;i<8;i++){
    const ang = (i/8)*Math.PI*2;
    const bx = W*0.5 + Math.cos(ang) * 380;
    const by = H*0.55 + Math.sin(ang) * 380;
    ctx.save();
    ctx.translate(bx,by);
    ctx.rotate(ang + Math.PI/2);
    ctx.fillStyle = (i%2===0)? '#ff3f2f' : '#ffd86b';
    roundRect(ctx, -12, -40, 24, 60, 6, true, false);
    ctx.restore();
  }

  // arena center mark
  ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.arc(W*0.5, H*0.55, 18, 0, Math.PI*2); ctx.fill();
}

// utility: roundRect
function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

// spawn card by id for testing
function spawnTestUnits(){
  deployCardAt('swordie', 0, 220, H*0.5 - 40);
  deployCardAt('heavy', 1, W-220, H*0.5 + 40);
}

// helper functions
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a; }
function randomChoice(a){ return a[Math.floor(Math.random()*a.length)]; }

// initial small demo for quick visual feedback
function startAIDemo(){
  // simple deck auto-select and run few units to test AI
  deck = CARD_DATA.slice(0,8).map(c=>c.id);
  startMatch();
  // auto spawn a few units
  setTimeout(()=> spawnTestUnits(), 600);
}

// export current deck to clipboard (not asked but useful)
function exportDeckToClipboard(){
  navigator.clipboard?.writeText(JSON.stringify(deck)).then(()=> console.log('deck copied'));
}

// initial UI update loop to ensure hand display updates
setInterval(()=> { renderHandUI(); }, 300);

// small prefill: when no deck chosen, populate with first 8 cards for quick testing
setTimeout(()=>{
  if(deck.length===0 && CARD_DATA.length>=8){
    deck = CARD_DATA.slice(0,8).map(c=>c.id);
    renderDeckSlots();
  }
}, 500);
