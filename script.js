// Clash-Lite: Full upgrade
// - 15+ cards
// - Deck builder (choose 8), hand of 4 with rotation
// - Click a card then click battlefield to place (player side only)
// - Enemy AI gets random deck containing at least one win condition and one spell
// - Pink elixir drop in top-right

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let lastTime = performance.now();
let timeLeft = 180;

const MAX_ELIXIR = 10;
const ELIXIR_REGEN = 1.0;

let playerElixir = 4;
let enemyElixir = 4;

let entities = [];
let towers = [];
let logs = [];

let collection = []; // all available cards (>=15)
let playerCollection = []; // same as collection for now
let playerDeck = []; // chosen 8
let playerHand = [];
let selectedCardIndex = null; // index in hand
let enemyDeck = [];
let enemyHand = [];

const WIN_CONDITIONS = ['hog','balloon','giant','pekka','royal_giant','golem'];
const SPELLS = ['fireball','arrow','freeze'];

// Helper log
function log(s){ logs.push(s); if(logs.length>300) logs.shift(); document.getElementById('log').innerText = logs.slice().reverse().join('\n'); }

// define cards (15+)
const CARD_DEFS = {
  soldier:{type:'unit',hp:40,speed:70,atk:10,range:10,size:10,cost:3},
  tank:{type:'unit',hp:140,speed:24,atk:24,range:12,size:16,cost:6},
  archer:{type:'unit',hp:22,speed:60,atk:8,range:160,size:8,cost:3},
  giant:{type:'unit',hp:220,speed:28,atk:22,range:14,size:18,cost:7},
  wizard:{type:'unit',hp:48,speed:42,atk:20,range:100,size:10,cost:5,aoe:true},
  hog:{type:'unit',hp:90,speed:90,atk:16,range:10,size:12,cost:4,win:true},
  balloon:{type:'unit',hp:80,speed:30,atk:60,range:10,size:18,cost:5,win:true,air:true},
  miner:{type:'unit',hp:60,speed:70,atk:14,range:10,size:10,cost:4,win:true},
  pekka:{type:'unit',hp:300,speed:18,atk:70,range:10,size:20,cost:8,win:true},
  goblins:{type:'unit',hp:12,speed:80,atk:6,range:8,size:6,cost:2},
  minions:{type:'unit',hp:16,speed:80,atk:12,range:10,size:8,cost:3,air:true},
  musketeer:{type:'unit',hp:70,speed:50,atk:18,range:140,size:10,cost:4},
  prince:{type:'unit',hp:120,speed:78,atk:36,range:10,size:12,cost:5,charge:true,win:true},
  skeletons:{type:'unit',hp:6,speed:90,atk:6,range:6,size:5,cost:1},
  healer:{type:'unit',hp:90,speed:40,atk:0,range:80,size:10,cost:5,heal:true},

  // spells
  fireball:{type:'spell',cost:4,aoe:60,damage:80},
  arrow:{type:'spell',cost:3,aoe:40,damage:40},
  freeze:{type:'spell',cost:4,aoe:80,freeze:3}
};

// create collection array from defs
collection = Object.keys(CARD_DEFS);

// UI: start menu deck builder
const startMenu = document.getElementById('startMenu');
const collectionEl = document.getElementById('collection');
const selectedDeckEl = document.getElementById('selectedDeck');
const startBtn = document.getElementById('startBtn');
const randomDeckBtn = document.getElementById('randomDeckBtn');
const openMenuBtn = document.getElementById('openMenuBtn');

function renderCollection(){
  collectionEl.innerHTML = '';
  collection.forEach(id=>{
    const c = CARD_DEFS[id];
    const card = document.createElement('div');
    card.className = 'card small';
    card.dataset.id = id;
    card.innerHTML = `<div class="title">${id.replace('_',' ')}</div><div class="cost">${c.cost}</div>`;
    card.onclick = ()=> {
      if(playerDeck.length < 8){
        playerDeck.push(id);
        renderSelectedDeck();
      }
    };
    collectionEl.appendChild(card);
  });
}

function renderSelectedDeck(){
  selectedDeckEl.innerHTML = '';
  playerDeck.forEach((id,idx)=>{
    const c = CARD_DEFS[id];
    const card = document.createElement('div');
    card.className = 'card small';
    card.dataset.id = id;
    card.innerHTML = `<div class="title">${id.replace('_',' ')}</div><div class="cost">${c.cost}</div>`;
    card.onclick = ()=> {
      playerDeck.splice(idx,1);
      renderSelectedDeck();
    };
    selectedDeckEl.appendChild(card);
  });
  startBtn.disabled = playerDeck.length!==8;
}

// random deck generator (8) from collection with at least 1 win and 1 spell
function randomDeck(){
  const pool = collection.slice();
  const deck = [];
  // ensure one win
  const wins = collection.filter(k=> CARD_DEFS[k].win);
  const spells = collection.filter(k=> CARD_DEFS[k].type==='spell');
  // push one win
  if(wins.length>0) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  // push one spell
  if(spells.length>0) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length<8){
    const pick = pool[Math.floor(Math.random()*pool.length)];
    deck.push(pick);
  }
  // shuffle
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
}

randomDeckBtn.onclick = ()=>{ playerDeck = randomDeck(); renderSelectedDeck(); };
startBtn.onclick = ()=>{ startMenu.style.display='none'; beginMatch(); };
openMenuBtn.onclick = ()=>{ startMenu.style.display='flex'; };

// when clicking collection, add to deck handled in renderCollection

renderCollection();
renderSelectedDeck();

// Game setup
function beginMatch(){
  // make sure playerDeck exists; if not random
  if(playerDeck.length!==8) playerDeck = randomDeck();
  // create enemy deck: random but must have at least 1 win and 1 spell
  enemyDeck = createAIDeck();

  // create hands: draw first 4
  playerHand = [];
  enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand,playerDeck); drawCard(enemyHand,enemyDeck); }

  // setup towers
  towers = [
    {x:80,y:H*0.33,team:0,hp:300,maxHp:300,radius:32},
    {x:80,y:H*0.66,team:0,hp:300,maxHp:300,radius:32},
    {x:W-80,y:H*0.33,team:1,hp:300,maxHp:300,radius:32},
    {x:W-80,y:H*0.66,team:1,hp:300,maxHp:300,radius:32}
  ];

  playerElixir = 4; enemyElixir = 4; timeLeft = 180;
  selectedCardIndex = null;
  renderHand();
  log('Match started. Your deck: '+playerDeck.join(', '));
  requestAnimationFrame(loop);
}

// draw card to hand (from deck cycle)
function drawCard(hand,deck){
  if(deck.length===0) return;
  hand.push(deck.shift());
}

// put played card to deck end
function returnCardToDeck(deck,cardId){ deck.push(cardId); }

// render hand UI
const handEl = document.getElementById('hand');
function renderHand(){
  handEl.innerHTML = '';
  playerHand.forEach((id,idx)=>{
    const def = CARD_DEFS[id];
    const card = document.createElement('div');
    card.className = 'card';
    if(playerElixir < def.cost) card.classList.add('disabled');
    card.dataset.idx = idx;
    card.innerHTML = `<div class="title">${id.replace('_',' ')}</div><div class="cost">${def.cost}</div>`;
    card.onclick = ()=> selectCard(idx);
    handEl.appendChild(card);
  });
  updateElixirUI();
}

// select a card from hand to place
function selectCard(idx){
  if(idx<0 || idx>=playerHand.length) return;
  const id = playerHand[idx];
  const def = CARD_DEFS[id];
  if(playerElixir < def.cost) { log('Not enough elixir'); return; }
  selectedCardIndex = idx;
  // highlight UI
  Array.from(handEl.children).forEach((el,i)=> el.style.borderColor = i===idx ? '#ffd6ee' : 'transparent');
  log('Selected '+id+' — click battlefield to place.');
}

// click to place unit or cast spell
canvas.addEventListener('click',(ev)=>{
  if(selectedCardIndex===null) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  // only allow placements on player's half
  if(x > W*0.5) { log('Place troops on your half (left).'); return; }
  const id = playerHand[selectedCardIndex];
  const def = CARD_DEFS[id];
  if(playerElixir < def.cost) { log('Not enough elixir'); return; }
  // spend elixir
  playerElixir -= def.cost;
  // play card effect
  if(def.type==='unit'){
    spawnUnit(0,x,y,id);
  } else if(def.type==='spell'){
    spawnSpell(0,x,y,id);
  }
  // rotation: move played card to deck end, remove from hand and draw from deck
  const played = playerHand.splice(selectedCardIndex,1)[0];
  returnCardToDeck(playerDeck,played);
  drawCard(playerHand,playerDeck);
  selectedCardIndex = null;
  renderHand();
});

// simple unit class-like objects
function spawnUnit(team,x,y,id){
  const def = CARD_DEFS[id];
  const unit = {
    x:x, y:y, team:team, id:id, hp:def.hp, maxHp:def.hp, speed:def.speed, atk:def.atk, range:def.range,
    size:def.size, atkCd:0, aoe:!!def.aoe, heal:!!def.heal, air:!!def.air
  };
  entities.push(unit);
  log((team===0?'You':'AI')+' deployed '+id);
}

function spawnSpell(team,x,y,id){
  const def = CARD_DEFS[id];
  // instant effect: damage or freeze or arrow
  if(def.damage){
    // damage units in aoe
    for(const e of entities){
      const d = Math.hypot(e.x-x,e.y-y);
      if(d <= def.aoe){ e.hp -= def.damage; }
    }
    // towers
    for(const t of towers){
      const d = Math.hypot(t.x-x,t.y-y);
      if(d <= def.aoe){ t.hp -= def.damage*0.8; }
    }
  }
  if(def.freeze){
    // mark nearby units slowed (simple)
    for(const e of entities){
      const d = Math.hypot(e.x-x,e.y-y);
      if(d <= def.aoe){ e.frozen = def.freeze; }
    }
  }
  log((team===0?'You':'AI')+' cast '+id);
}

// simple AI: play every tick if has elixir and hand
function aiPlayTick(){
  if(enemyHand.length===0) return;
  // pick playable options
  const options = enemyHand.filter(id=> CARD_DEFS[id].cost <= enemyElixir);
  if(options.length===0) return;
  // bias: if has win unit and towers remain, play it sometimes
  let pick;
  const wins = enemyHand.filter(id=> CARD_DEFS[id].win);
  const spells = enemyHand.filter(id=> CARD_DEFS[id].type==='spell');
  if(wins.length>0 && Math.random()<0.25) pick = wins[Math.floor(Math.random()*wins.length)];
  else if(spells.length>0 && Math.random()<0.18) pick = spells[Math.floor(Math.random()*spells.length)];
  else pick = options[Math.floor(Math.random()*options.length)];
  // decide target position on player's half (approach)
  const x = 120 + Math.random()*(W*0.4);
  const laneY = Math.random()<0.5 ? H*0.32 : H*0.68;
  const y = laneY + (Math.random()-0.5)*40;
  const def = CARD_DEFS[pick];
  enemyElixir -= def.cost;
  // play
  if(def.type==='unit') spawnUnit(1,x,y,pick);
  else spawnSpell(1,x,y,pick);
  // move played to deck end and draw
  const idx = enemyHand.indexOf(pick);
  if(idx>=0){
    const played = enemyHand.splice(idx,1)[0];
    enemyDeck.push(played);
    drawCard(enemyHand,enemyDeck);
  }
}

// create AI deck ensuring at least one win and one spell
function createAIDeck(){
  const pool = collection.slice();
  const deck = [];
  const wins = pool.filter(k=> CARD_DEFS[k].win);
  const spells = pool.filter(k=> CARD_DEFS[k].type==='spell');
  if(wins.length>0) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  if(spells.length>0) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length<8){
    const pick = pool[Math.floor(Math.random()*pool.length)];
    deck.push(pick);
  }
  // shuffle
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

// unit behavior: find nearest enemy target (units first then towers)
function unitFindTarget(u){
  let candidates = entities.filter(e=> e.team!==u.team);
  candidates = candidates.concat(towers.filter(t=> t.team!==u.team));
  if(candidates.length===0) return null;
  candidates.sort((a,b)=> Math.hypot(a.x-u.x,a.y-u.y) - Math.hypot(b.x-u.x,b.y-u.y));
  return candidates[0];
}

// update loop
let aiTickTimer = 0;
function loop(ts){
  const dt = Math.min(0.05,(ts - lastTime)/1000);
  lastTime = ts;
  // regen
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + ELIXIR_REGEN*dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + ELIXIR_REGEN*dt);

  timeLeft -= dt;
  aiTickTimer += dt;
  if(aiTickTimer > 1.0){
    aiTickTimer = 0;
    // AI decision
    aiPlayTick();
  }

  // update entities
  for(let i=entities.length-1;i>=0;i--){
    const u = entities[i];
    if(u.frozen && u.frozen>0){ u.frozen -= dt; }
    // target
    if(!u.target || u.target.hp<=0) u.target = unitFindTarget(u);
    if(u.target){
      const d = Math.hypot(u.x-u.target.x,u.y-u.target.y);
      const reach = (u.range || 10) + (u.target.radius || u.target.size || 0);
      if(d > reach){
        if(!u.frozen || u.frozen<=0){
          const dir = Math.atan2(u.target.y - u.y, u.target.x - u.x);
          u.x += Math.cos(dir) * u.speed * dt;
          u.y += Math.sin(dir) * u.speed * dt;
        }
      } else {
        u.atkCd = (u.atkCd||0) - dt;
        if(u.atkCd<=0){
          u.atkCd = 0.8;
          // apply damage
          u.target.hp -= u.atk;
        }
      }
    } else {
      // advance forward
      if(!u.frozen || u.frozen<=0){
        const dir = u.team===0 ? 0 : Math.PI;
        u.x += Math.cos(dir) * u.speed * dt;
      }
    }
    if(u.hp <= 0){ entities.splice(i,1); continue; }
    if(u.x < -50 || u.x > W+50) entities.splice(i,1);
  }

  // tower checks
  for(let i=towers.length-1;i>=0;i--){
    const t = towers[i];
    if(t.hp<=0){ towers.splice(i,1); log('A tower has been destroyed'); }
  }

  // collisions: units close to towers damage them
  for(const u of entities){
    for(const t of towers){
      if(u.team !== t.team){
        const d = Math.hypot(u.x-t.x,u.y-t.y);
        if(d < t.radius + u.size + 4){
          t.hp -= u.atk * 0.4;
          u.hp -= u.atk * 0.05;
        }
      }
    }
  }

  draw();
  updateHud();

  // continue or end
  const pTowers = towers.filter(t=> t.team===0).length;
  const eTowers = towers.filter(t=> t.team===1).length;
  if(timeLeft>0 && pTowers>0 && eTowers>0){
    requestAnimationFrame(loop);
  } else {
    const winner = pTowers > eTowers ? 'Player' : (eTowers > pTowers ? 'Enemy' : 'Draw');
    log('--- Match ended. Winner: '+winner);
    // show menu again after short delay
    setTimeout(()=>{ startMenu.style.display='flex'; }, 1500);
  }
}

// drawing
function draw(){
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = '#0a2136';
  ctx.fillRect(0,0,W,H);
  // river center
  ctx.fillStyle = 'rgba(180,200,255,0.04)';
  ctx.fillRect(W*0.5-36,0,72,H);

  // bridges
  ctx.fillStyle='rgba(255,255,255,0.03)';
  ctx.fillRect(W*0.5-140,H*0.32,280,44);
  ctx.fillRect(W*0.5-140,H*0.66,280,44);

  // towers
  for(const t of towers) drawTower(t);

  // entities
  for(const e of entities) drawUnit(e);

  // top overlay
  ctx.fillStyle='rgba(255,255,255,0.02)';
  ctx.fillRect(0,0,W,40);
  ctx.fillStyle='#dfefff';
  ctx.font='16px sans-serif';
  ctx.fillText('Clash‑Lite — Battle',12,26);
}

// draw tower
function drawTower(t){
  ctx.save();
  ctx.fillStyle = t.team===0? '#3cbcff' : '#ff6b6b';
  roundRect(ctx,t.x-36,t.y-36,72,72,10,true,false);
  // hp bar
  ctx.fillStyle='#222';
  ctx.fillRect(t.x-38,t.y+40,76,8);
  ctx.fillStyle='#3cf55a';
  ctx.fillRect(t.x-38,t.y+40,76*(t.hp/t.maxHp),8);
  ctx.restore();
}

// draw units
function drawUnit(u){
  ctx.save();
  // shadow
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(u.x, u.y+u.size+6, u.size+6, u.size/2, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  ctx.globalAlpha = 1.0;
  // body
  const color = u.team===0? '#9fe3ff' : '#ffb7b7';
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(u.x,u.y,u.size,0,Math.PI*2);
  ctx.fill();
  // hp bar
  ctx.fillStyle='#222';
  ctx.fillRect(u.x-u.size-2,u.y+u.size+6,(u.size*2)+4,5);
  ctx.fillStyle='#4de07a';
  ctx.fillRect(u.x-u.size-2,u.y+u.size+6,((u.hp/u.maxHp)*((u.size*2)+4)),5);
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(typeof r==='undefined') r=5;
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

// HUD update
function updateHud(){
  document.getElementById('elixirText').innerText = Math.floor(playerElixir);
  document.getElementById('enemyElixirText').innerText = Math.floor(enemyElixir);
  document.getElementById('timeVal').innerText = Math.ceil(timeLeft);
}

// hand rotation
document.getElementById('rotateBtn').onclick = ()=>{
  // discard first card to bottom of deck and draw a new one
  if(playerHand.length===0) return;
  const c = playerHand.shift();
  playerDeck.push(c);
  drawCard(playerHand,playerDeck);
  renderHand();
  log('Rotated card to deck bottom.');
};

// open menu
document.getElementById('openMenuBtn').onclick = ()=>{ startMenu.style.display='flex'; };

// canvas placement hint already shows; we also allow right-click to cancel selection
canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); selectedCardIndex = null; Array.from(handEl.children).forEach((el)=> el.style.borderColor='transparent'); });

// initial call: load start menu
// expose a simple API to beginMatch when start clicked earlier

// make sure collection has at least 15 (it does)
console.log('Collection size:', collection.length);
