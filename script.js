// Clash-Lite Royale Style - Major upgrade
// Features added in this version:
// - Start loading + battle loading screens
// - Deck builder with icons; 15+ cards; select 8; icons rendered as SVG placeholders
// - 3 towers per side (left and right). Middle (king) tower has larger HP.
// - Expanded card types: wincondition (auto->tower), splash, army (spawns multiple), spell, ranged (projectiles)
// - Projectile model for ranged units & spells
// - Pink elixir drop top-right with animated fill
// - Cards played go to deck end; hand auto-draws to 4
// - Basic animations for card hover and placement hints
// Notes: This is a client-side demo; sounds/images replaced by SVG icons and canvas models

// DOM
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// UI elements
const globalLoading = document.getElementById('globalLoading');
const proceedBtn = document.getElementById('proceedBtn');
const startMenu = document.getElementById('startMenu');
const battleLoading = document.getElementById('battleLoading');
const elixirFillEl = document.getElementById('elixirFill');
const elixirText = document.getElementById('elixirText');
const enemyElixirText = document.getElementById('enemyElixirText');
const timeValEl = document.getElementById('timeVal');
const handEl = document.getElementById('hand');
const collectionEl = document.getElementById('collection');
const selectedDeckEl = document.getElementById('selectedDeck');
const startBtn = document.getElementById('startBtn');
const randomDeckBtn = document.getElementById('randomDeckBtn');
const openMenuBtn = document.getElementById('openMenuBtn');
const rotateBtn = document.getElementById('rotateBtn');
const logEl = document.getElementById('log');
const battleLoaderFill = document.getElementById('battleLoaderFill');

let lastTime = performance.now();
let timeLeft = 180;

// elixir
const MAX_ELIXIR = 10;
const ELIXIR_REGEN = 1.0;
let playerElixir = 4;
let enemyElixir = 4;

// game state
let entities = []; // units and projectiles
let towers = [];
let logs = [];
let collection = [];
let playerDeck = [];
let playerHand = [];
let enemyDeck = [];
let enemyHand = [];
let selectedCardIndex = null;

// cards definitions - extended (20+)
const CARD_DEFS = {
  soldier:{type:'unit',meta:'melee',hp:45,speed:70,atk:12,range:12,size:10,cost:3,icon:'⚔️'},
  tank:{type:'unit',meta:'tanky',hp:200,speed:22,atk:30,range:12,size:16,cost:7,icon:'🛡️'},
  archer:{type:'unit',meta:'ranged',hp:22,speed:62,atk:10,range:220,size:8,cost:3,icon:'🏹',projectile:true,projSpeed:400,projDmg:10},
  giant:{type:'unit',meta:'win',hp:240,speed:26,atk:24,range:12,size:18,cost:7,win:true,icon:'🦾'},
  wizard:{type:'unit',meta:'splash',hp:52,speed:44,atk:18,range:160,size:10,cost:5,aoe:50,icon:'🪄',projectile:true,projSpeed:300,projDmg:18},
  hog:{type:'unit',meta:'win',hp:95,speed:98,atk:18,range:12,size:12,cost:4,win:true,icon:'🐗'},
  balloon:{type:'unit',meta:'win-air',hp:90,speed:34,atk:80,range:12,size:18,cost:6,win:true,air:true,icon:'🎈'},
  miner:{type:'unit',meta:'win',hp:70,speed:68,atk:16,range:12,size:10,cost:4,win:true,groundSpawn:true,icon:'⛏️'},
  pekka:{type:'unit',meta:'win',hp:320,speed:18,atk:78,range:12,size:22,cost:8,win:true,icon:'⚙️'},
  goblins:{type:'unit',meta:'army',hp:14,speed:86,atk:6,range:8,size:5,cost:2,spawns:3,icon:'👺'},
  minions:{type:'unit',meta:'army-air',hp:20,speed:82,atk:12,range:10,size:8,cost:3,air:true,spawns:3,icon:'🕊️'},
  musketeer:{type:'unit',meta:'ranged',hp:72,speed:50,atk:20,range:180,size:10,cost:4,icon:'🎯',projectile:true,projSpeed:420,projDmg:20},
  prince:{type:'unit',meta:'charge',hp:130,speed:80,atk:36,range:12,size:12,cost:5,charge:true,win:true,icon:'🏇'},
  skeletons:{type:'unit',meta:'army',hp:8,speed:96,atk:6,range:6,size:5,cost:1,spawns:4,icon:'💀'},
  healer:{type:'unit',meta:'support',hp:96,speed:42,atk:0,range:80,size:10,cost:5,heal:true,icon:'❤️‍🩹'},
  // added more cards
  golem:{type:'unit',meta:'win',hp:480,speed:14,atk:90,range:12,size:26,cost:9,win:true,icon:'🪨'},
  bandit:{type:'unit',meta:'dash',hp:110,speed:86,atk:28,range:12,size:12,cost:4,charge:true,icon:'🏹'},
  wizard_small:{type:'unit',meta:'splash',hp:36,speed:48,atk:14,range:120,size:9,cost:4,aoe:36,icon:'✨',projectile:true,projSpeed:320,projDmg:14},
  // spells
  fireball:{type:'spell',cost:4,aoe:70,damage:100,icon:'🔥'},
  arrow:{type:'spell',cost:3,aoe:40,damage:60,icon:'➡️'},
  freeze:{type:'spell',cost:4,aoe:80,freeze:2.5,icon:'❄️'}
};

collection = Object.keys(CARD_DEFS);

// Utility logging
function log(msg){ logs.push(msg); if(logs.length>300) logs.shift(); logEl.innerText = logs.slice().reverse().join('\\n'); }

// Simple SVG icon generator for card UI (returns data URI)
function svgIcon(emoji, bg='#072633', fg='#fff'){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect rx='10' width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' font-size='34' dominant-baseline='middle' text-anchor='middle' fill='${fg}'>${emoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Render collection and deck UI
function renderCollection(){
  collectionEl.innerHTML = '';
  collection.forEach(id=>{
    const def = CARD_DEFS[id];
    const el = document.createElement('div');
    el.className = 'card small';
    el.dataset.id = id;
    el.innerHTML = `<div class='icon' style="background-image:url('${svgIcon(def.icon)}');background-size:48px 48px;background-position:center"></div><div class='title'>${id.replace('_',' ')}</div><div class='cost'>${def.cost}</div>`;
    el.onclick = ()=>{
      if(playerDeck.length < 8){ playerDeck.push(id); renderSelectedDeck(); }
    };
    collectionEl.appendChild(el);
  });
}

function renderSelectedDeck(){
  selectedDeckEl.innerHTML = '';
  playerDeck.forEach((id,idx)=>{
    const def = CARD_DEFS[id];
    const el = document.createElement('div');
    el.className = 'card small';
    el.innerHTML = `<div class='icon' style="background-image:url('${svgIcon(def.icon,'#0b2631')}');background-size:42px 42px;background-position:center"></div><div class='title'>${id.replace('_',' ')}</div><div class='cost'>${def.cost}</div>`;
    el.onclick = ()=>{ playerDeck.splice(idx,1); renderSelectedDeck(); };
    selectedDeckEl.appendChild(el);
  });
  startBtn.disabled = playerDeck.length !== 8;
}

// Random deck generation ensuring win + spell
function randomDeck(){
  const pool = collection.slice();
  const deck = [];
  const wins = pool.filter(k=> CARD_DEFS[k].win);
  const spells = pool.filter(k=> CARD_DEFS[k].type === 'spell');
  if(wins.length>0) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  if(spells.length>0) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length < 8){ deck.push(pool[Math.floor(Math.random()*pool.length)]); }
  // shuffle
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

randomDeckBtn.onclick = ()=>{ playerDeck = randomDeck(); renderSelectedDeck(); };
startBtn.onclick = ()=>{ startMenu.style.display='none'; startBattle(); };
openMenuBtn.onclick = ()=>{ startMenu.style.display='flex'; };

renderCollection(); renderSelectedDeck();

// Game functions
function startBattle(){
  // show battle loading
  battleLoading.classList.remove('hidden');
  battleLoaderFill.style.width = '0%';
  let p = 0;
  const int = setInterval(()=>{ p += 10; battleLoaderFill.style.width = p + '%'; if(p>=100){ clearInterval(int); battleLoading.classList.add('hidden'); beginMatch(); } }, 160);
}

function beginMatch(){
  // ensure deck exists
  if(playerDeck.length !== 8) playerDeck = randomDeck();
  // setup enemy deck with at least one win + one spell
  enemyDeck = createAIDeck();
  // draw 4 cards each
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  // three towers per side (left and right) - middle is main (king) with higher HP
  towers = [
    {x: 80, y: H*0.22, team:0, hp:220, maxHp:220, radius:34, main:false},
    {x: 80, y: H*0.50, team:0, hp:420, maxHp:420, radius:40, main:true},
    {x: 80, y: H*0.78, team:0, hp:220, maxHp:220, radius:34, main:false},
    {x: W-80, y: H*0.22, team:1, hp:220, maxHp:220, radius:34, main:false},
    {x: W-80, y: H*0.50, team:1, hp:420, maxHp:420, radius:40, main:true},
    {x: W-80, y: H*0.78, team:1, hp:220, maxHp:220, radius:34, main:false},
  ];
  playerElixir = 4; enemyElixir = 4; timeLeft = 180; selectedCardIndex = null;
  renderHand(); log('Battle started.');
  requestAnimationFrame(loop);
}

// draw card into hand (from deck)
function drawCard(hand, deck){
  if(deck.length === 0) return;
  hand.push(deck.shift());
}

// return played card to deck end
function returnCardToDeck(deck, cardId){ deck.push(cardId); }

function renderHand(){
  handEl.innerHTML = '';
  playerHand.forEach((id, idx)=>{
    const def = CARD_DEFS[id];
    const el = document.createElement('div');
    el.className = 'card';
    if(playerElixir < def.cost) el.classList.add('disabled');
    el.innerHTML = `<div class='icon' style="background-image:url('${svgIcon(def.icon,'#072934')}');background-size:36px 36px;background-position:center"></div><div class='title'>${id.replace('_',' ')}</div><div class='cost'>${def.cost}</div>`;
    el.onclick = ()=> selectCard(idx);
    handEl.appendChild(el);
  });
  updateElixirUI();
}

// select a card to place
function selectCard(idx){
  if(idx < 0 || idx >= playerHand.length) return;
  const id = playerHand[idx];
  const def = CARD_DEFS[id];
  if(playerElixir < def.cost){ log('Not enough elixir'); return; }
  selectedCardIndex = idx;
  // highlight UI
  Array.from(handEl.children).forEach((el,i)=> el.style.borderColor = i===idx ? '#ffd6ee' : 'transparent');
  log('Selected ' + id + ' — click battlefield (left half) to place.');
}

// canvas placement
canvas.addEventListener('click', (ev)=>{
  if(selectedCardIndex === null) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  if(x > W*0.5){ log('Place on your half only.'); return; }
  const id = playerHand[selectedCardIndex];
  const def = CARD_DEFS[id];
  if(playerElixir < def.cost){ log('Not enough elixir'); return; }
  playerElixir -= def.cost;
  if(def.type === 'unit') spawnUnit(0, x, y, id);
  else if(def.type === 'spell') spawnSpell(0, x, y, id);
  // rotation: move played card to end of deck, remove from hand, draw new
  const played = playerHand.splice(selectedCardIndex, 1)[0];
  returnCardToDeck(playerDeck, played);
  drawCard(playerHand, playerDeck);
  selectedCardIndex = null;
  renderHand();
});

// right-click cancel
canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); selectedCardIndex = null; Array.from(handEl.children).forEach(el=>el.style.borderColor='transparent'); });

// spawn unit
function spawnUnit(team, x, y, id){
  const def = CARD_DEFS[id];
  if(def.spawns && def.spawns > 1){
    // spawn multiple small units around point (army)
    for(let i=0;i<def.spawns;i++){
      const angle = Math.PI*2*(i/def.spawns);
      const ux = x + Math.cos(angle)*(def.size*2 + i*6);
      const uy = y + Math.sin(angle)*(def.size*2 + i*6);
      const u = createUnitObject(team, ux, uy, id);
      entities.push(u);
    }
  } else if(def.groundSpawn){
    // miner: spawn near enemy tower? for player spawn at clicked pos (already provided)
    const u = createUnitObject(team, x, y, id);
    entities.push(u);
  } else {
    const u = createUnitObject(team, x, y, id);
    entities.push(u);
  }
  log((team===0?'You':'AI') + ' deployed ' + id);
}

// create unit object
function createUnitObject(team,x,y,id){
  const def = CARD_DEFS[id];
  return {
    kind:'unit', id:id, team:team, x:x, y:y, hp:def.hp, maxHp:def.hp, speed:def.speed,
    atk:def.atk, range:def.range || 12, size:def.size, aoe:def.aoe || 0, air:!!def.air, proj:def.projectile||false,
    projSpeed:def.projSpeed||0, projDmg:def.projDmg||def.atk, atkCd:0, frozen:0, target:null, win:!!def.win, heal:!!def.heal, charge:!!def.charge
  };
}

// spawn spell
function spawnSpell(team,x,y,id){
  const def = CARD_DEFS[id];
  // basic immediate area effect
  if(def.damage){
    // damage units
    for(const e of entities){ if(Math.hypot(e.x-x,e.y-y) <= def.aoe) e.hp -= def.damage; }
    for(const t of towers){ if(Math.hypot(t.x-x,t.y-y) <= def.aoe) t.hp -= def.damage*0.9; }
  }
  if(def.freeze){
    for(const e of entities){ if(Math.hypot(e.x-x,e.y-y) <= def.aoe) e.frozen = Math.max(e.frozen || 0, def.freeze); }
  }
  log((team===0?'You':'AI') + ' cast ' + id);
}

// AI plays periodically using elixir and hand
let aiTimer = 0;
function aiTick(dt){
  aiTimer += dt;
  if(aiTimer < 0.9) return;
  aiTimer = 0;
  if(enemyHand.length === 0) return;
  const playable = enemyHand.filter(id => CARD_DEFS[id].cost <= enemyElixir);
  if(playable.length === 0) return;
  // bias to win and spell sometimes
  let pick; const winChoices = enemyHand.filter(id=>CARD_DEFS[id].win);
  const spellChoices = enemyHand.filter(id=>CARD_DEFS[id].type==='spell');
  if(winChoices.length && Math.random() < 0.28) pick = winChoices[Math.floor(Math.random()*winChoices.length)];
  else if(spellChoices.length && Math.random() < 0.18) pick = spellChoices[Math.floor(Math.random()*spellChoices.length)];
  else pick = playable[Math.floor(Math.random()*playable.length)];
  const def = CARD_DEFS[pick];
  // choose spawn location on enemy side (right)
  const x = W - 120 - Math.random()* (W*0.25);
  const laneY = (Math.random() < 0.5) ? H*0.28 + (Math.random()-0.5)*40 : H*0.72 + (Math.random()-0.5)*40;
  enemyElixir -= def.cost;
  if(def.type === 'unit') spawnUnit(1, x, laneY, pick);
  else spawnSpell(1, x, laneY, pick);
  // rotate card to deck end and draw new
  const idx = enemyHand.indexOf(pick);
  if(idx >= 0){
    const played = enemyHand.splice(idx,1)[0];
    enemyDeck.push(played);
    drawCard(enemyHand, enemyDeck);
  }
}

// AI deck creation with constraint
function createAIDeck(){
  const pool = collection.slice();
  const deck = [];
  const wins = pool.filter(k=> CARD_DEFS[k].win);
  const spells = pool.filter(k=> CARD_DEFS[k].type === 'spell');
  if(wins.length) deck.push(wins[Math.floor(Math.random()*wins.length)]);
  if(spells.length) deck.push(spells[Math.floor(Math.random()*spells.length)]);
  while(deck.length < 8) deck.push(pool[Math.floor(Math.random()*pool.length)]);
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}

// find target for unit
function findTarget(unit){
  // prefer enemy units, then towers (closest)
  let candidates = entities.filter(e => e.team !== unit.team && e.kind === 'unit' && !(e.air && !unit.air));
  candidates = candidates.concat(towers.filter(t=> t.team !== unit.team));
  if(candidates.length === 0) return null;
  candidates.sort((a,b) => Math.hypot(a.x-unit.x,a.y-unit.y) - Math.hypot(b.x-unit.x,b.y-unit.y));
  return candidates[0];
}

// projectiles array
let projectiles = [];

// main loop
function loop(ts){
  const dt = Math.min(0.05, (ts - lastTime)/1000);
  lastTime = ts;
  // regen elixir
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + ELIXIR_REGEN * dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + ELIXIR_REGEN * dt);
  timeLeft -= dt;
  // AI tick
  aiTick(dt);

  // update units
  for(let i = entities.length - 1; i >= 0; i--){
    const u = entities[i];
    if(u.frozen && u.frozen > 0) u.frozen -= dt;
    // win units target towers directly
    if(u.win){
      // find nearest enemy tower
      let targets = towers.filter(t => t.team !== u.team);
      if(targets.length){
        targets.sort((a,b)=> Math.hypot(a.x-u.x,a.y-u.y) - Math.hypot(b.x-u.x,b.y-u.y));
        u.target = targets[0];
      }
    } else {
      if(!u.target || u.target.hp <= 0) u.target = findTarget(u);
    }
    if(u.target){
      const d = Math.hypot(u.x - u.target.x, u.y - u.target.y);
      const reach = (u.range || 10) + (u.target.radius || u.target.size || 0);
      if(d > reach){
        if(!u.frozen || u.frozen <= 0){
          // move
          const dir = Math.atan2(u.target.y - u.y, u.target.x - u.x);
          u.x += Math.cos(dir) * u.speed * dt;
          u.y += Math.sin(dir) * u.speed * dt;
        }
      } else {
        // attack
        u.atkCd = (u.atkCd || 0) - dt;
        if(u.atkCd <= 0){
          u.atkCd = 0.8;
          // ranged units produce projectiles
          if(u.proj && u.target){
            createProjectile(u, u.target);
          } else {
            u.target.hp -= u.atk;
          }
        }
      }
    } else {
      // move forward
      if(!u.frozen || u.frozen <= 0){ const dir = u.team === 0 ? 0 : Math.PI; u.x += Math.cos(dir) * u.speed * dt; }
    }
    if(u.hp <= 0){ entities.splice(i,1); continue; }
    if(u.x < -100 || u.x > W + 100) entities.splice(i,1);
  }

  // update projectiles
  for(let i = projectiles.length - 1; i >= 0; i--){
    const p = projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    // collision with targets (simple)
    if(p.target){
      const d = Math.hypot(p.x - p.target.x, p.y - p.target.y);
      if(d < (p.target.radius || p.target.size || 8) || p.life <= 0){
        // apply damage/aoe
        if(p.aoe){
          // damage entities and towers in radius
          for(const e of entities){ if(Math.hypot(e.x - p.x, e.y - p.y) <= p.aoe) e.hp -= p.dmg; }
          for(const t of towers){ if(Math.hypot(t.x - p.x, t.y - p.y) <= p.aoe) t.hp -= p.dmg*0.9; }
        } else {
          p.target.hp -= p.dmg;
        }
        projectiles.splice(i,1);
        continue;
      }
    }
    if(p.life <= 0) projectiles.splice(i,1);
  }

  // towers destruction
  for(let i = towers.length - 1; i >= 0; i--){
    if(towers[i].hp <= 0){ log('A tower fell!'); towers.splice(i,1); }
  }

  // units close to towers deal passive damage
  for(const u of entities){
    for(const t of towers){
      if(u.team !== t.team){
        const d = Math.hypot(u.x - t.x, u.y - t.y);
        if(d < t.radius + u.size + 4){
          t.hp -= u.atk * 0.35 * (dt*60/60);
          u.hp -= u.atk * 0.02;
        }
      }
    }
  }

  draw();
  updateHud();

  // end condition
  const pT = towers.filter(t=> t.team===0).length;
  const eT = towers.filter(t=> t.team===1).length;
  if(timeLeft > 0 && pT > 0 && eT > 0){
    requestAnimationFrame(loop);
  } else {
    const winner = pT > eT ? 'Player' : (eT > pT ? 'Enemy' : 'Draw');
    log('Match ended. Winner: ' + winner);
    setTimeout(()=>{ startMenu.style.display = 'flex'; }, 1400);
  }
}

// create projectile
function createProjectile(unit, target){
  const dx = target.x - unit.x, dy = target.y - unit.y;
  const dist = Math.hypot(dx, dy);
  const speed = unit.projSpeed || 320;
  const vx = dx / dist * speed;
  const vy = dy / dist * speed;
  projectiles.push({x:unit.x, y:unit.y, vx: vx, vy: vy, life: dist/speed + 1.2, target: target, dmg: unit.projDmg || unit.atk, aoe: unit.aoe || 0});
}

// AI deck creation reuse
function drawCard(hand, deck){ if(deck.length) hand.push(deck.shift()); }

// HUD update
function updateHud(){
  // elixir fill percentage
  const p = Math.min(1, playerElixir / MAX_ELIXIR);
  elixirFillEl.style.height = Math.round(p*100) + '%';
  elixirText.innerText = Math.floor(playerElixir);
  enemyElixirText.innerText = Math.floor(enemyElixir);
  timeValEl.innerText = Math.ceil(timeLeft);
}

// rotation button
rotateBtn.onclick = ()=>{
  if(playerHand.length === 0) return;
  const c = playerHand.shift();
  playerDeck.push(c);
  drawCard(playerHand, playerDeck);
  renderHand();
  log('Rotated card.');
};

openMenuBtn.onclick = ()=>{ startMenu.style.display = 'flex'; };

// render functions for canvas
function draw(){
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = '#062434';
  ctx.fillRect(0,0,W,H);
  // center river
  ctx.fillStyle = 'rgba(180,200,255,0.04)';
  ctx.fillRect(W*0.5-48, 0, 96, H);

  // bridges
  ctx.fillStyle='rgba(255,255,255,0.03)';
  ctx.fillRect(W*0.5-220, H*0.27, 440, 52);
  ctx.fillRect(W*0.5-220, H*0.73, 440, 52);

  // towers
  for(const t of towers) drawTower(t);

  // projectiles
  for(const p of projectiles) drawProjectile(p);

  // entities
  for(const e of entities) drawUnit(e);

  // overlay text
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0,0,W,44);
  ctx.fillStyle = '#dff7ff'; ctx.font = '16px sans-serif';
  ctx.fillText('Clash‑Lite — Royale Style', 14, 30);
}

function drawTower(t){
  ctx.save();
  // tower base
  ctx.fillStyle = t.team===0 ? '#3bc7ff' : '#ff7b7b';
  roundRect(ctx, t.x-46, t.y-46, 92, 92, 12, true, false);
  // crown if main
  if(t.main){
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath(); ctx.arc(t.x, t.y-46, 10, 0, Math.PI*2); ctx.fill();
  }
  // hp bar
  ctx.fillStyle = '#111'; ctx.fillRect(t.x-50, t.y+48, 100, 10);
  ctx.fillStyle = '#3cf55a'; ctx.fillRect(t.x-50, t.y+48, 100*(t.hp/t.maxHp), 10);
  ctx.restore();
}

function drawUnit(u){
  ctx.save();
  // shadow
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.ellipse(u.x, u.y + u.size + 6, u.size+6, u.size/2, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.fill();
  ctx.globalAlpha = 1.0;
  // body
  ctx.beginPath();
  ctx.fillStyle = u.team===0 ? '#9fe3ff' : '#ffb7b7';
  ctx.arc(u.x, u.y, u.size, 0, Math.PI*2); ctx.fill();
  // hp bar
  ctx.fillStyle = '#111'; ctx.fillRect(u.x-u.size-2, u.y+u.size+6, (u.size*2)+4, 6);
  ctx.fillStyle = '#56e596'; ctx.fillRect(u.x-u.size-2, u.y+u.size+6, ((u.hp/u.maxHp)*((u.size*2)+4)), 6);
  ctx.restore();
}

function drawProjectile(p){
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = '#ffd47a'; ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill();
  if(p.aoe){
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,140,80,0.18)'; ctx.lineWidth=2; ctx.arc(p.x,p.y,p.aoe,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(typeof r==='undefined') r=6;
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

// create AI deck (ensures win + spell)
function createAIDeck(){ const pool = collection.slice(); const wins = pool.filter(k=> CARD_DEFS[k].win); const spells = pool.filter(k=> CARD_DEFS[k].type==='spell'); const deck = []; if(wins.length) deck.push(wins[Math.floor(Math.random()*wins.length)]); if(spells.length) deck.push(spells[Math.floor(Math.random()*spells.length)]); while(deck.length < 8) deck.push(pool[Math.floor(Math.random()*pool.length)]); for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; } return deck; }

// initial global loading simulation
let globalProgress = 0;
const glInt = setInterval(()=>{ globalProgress += 12; document.getElementById('globalLoaderFill').style.width = globalProgress + '%'; if(globalProgress >= 100){ clearInterval(glInt); proceedBtn.classList.remove('hidden'); } }, 260);
proceedBtn.onclick = ()=>{ globalLoading.style.display = 'none'; startMenu.style.display = 'flex'; };

// initial UI wiring for deck builder
startBtn.disabled = true;
startMenu.addEventListener('click', ()=>{ /* delegate */ });
// make start button enable when 8 selected
const obs = new MutationObserver(()=>{ startBtn.disabled = playerDeck.length !== 8; });
obs.observe(selectedDeckEl, {childList:true, subtree:true});

// when start pressed, fill deck if necessary, and build enemy deck
startBtn.onclick = ()=>{ startMenu.style.display='none'; startBattle(); };

// render hand initially when match begins
function renderHand(){ handEl.innerHTML = ''; playerHand.forEach((id, idx)=>{ const def = CARD_DEFS[id]; const el = document.createElement('div'); el.className='card'; if(playerElixir < def.cost) el.classList.add('disabled'); el.innerHTML = `<div class='icon' style="background-image:url('${svgIcon(def.icon)}');background-size:36px 36px;"></div><div class='title'>${id.replace('_',' ')}</div><div class='cost'>${def.cost}</div>`; el.onclick = ()=> selectCard(idx); handEl.appendChild(el); }); updateElixirUI(); }

function selectCard(idx){ if(idx < 0 || idx >= playerHand.length) return; const id = playerHand[idx]; const def = CARD_DEFS[id]; if(playerElixir < def.cost){ log('Not enough elixir'); return; } selectedCardIndex = idx; Array.from(handEl.children).forEach((el,i)=> el.style.borderColor = i===idx ? '#ffd6ee' : 'transparent'); log('Selected '+id); }

// initial refs to enable deck selection behavior
// clicking a card in collection adds, clicking selected removes already done earlier in render functions

// expose helper for svgIcon used earlier (must match global scope)
function svgIcon(emoji){ const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect rx='10' width='100%' height='100%' fill='#072833'/><text x='50%' y='50%' font-size='36' dominant-baseline='middle' text-anchor='middle' fill='white'>${emoji}</text></svg>`; return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }

// start by rendering collection and reactively updating selected deck UI
renderCollection(); renderSelectedDeck();

// helper to update elixir UI and render hand if needed
function updateElixirUI(){ const pct = Math.min(1, playerElixir / MAX_ELIXIR); elixirFillEl.style.height = Math.round(pct*100) + '%'; elixirText.innerText = Math.floor(playerElixir); enemyElixirText.innerText = Math.floor(enemyElixir); timeValEl.innerText = Math.ceil(timeLeft); }

// rotate button
rotateBtn.onclick = ()=>{ if(playerHand.length === 0) return; const c = playerHand.shift(); playerDeck.push(c); drawCard(playerHand, playerDeck); renderHand(); log('Rotated'); };

// start global simulation: prefill playerDeck with random if empty
if(playerDeck.length === 0){ playerDeck = randomDeck(); renderSelectedDeck(); }

// startBattle was defined earlier; ensure createAIDeck available
// This file is self-contained; other helpers are defined above where needed

// expose minimal console feedback
console.log('Clash-Lite Royale style ready.');