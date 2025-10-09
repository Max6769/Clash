// Upgraded Clash-Lite: Balanced elixir for both sides, more troops, card rotation, AI uses elixir.
// Single-file logic for a compact demo.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let timeLeft = 120;
let lastTime = performance.now();

const MAX_ELIXIR = 10;
const ELIXIR_REGEN = 1.0; // per sec for both sides

let playerElixir = 5;
let enemyElixir = 5;

let playerDeck = [];
let playerHand = [];
let deckIndex = 0;

let entities = [];
let towers = [];
let logs = [];

function log(s){ logs.push(s); if(logs.length>200) logs.shift(); document.getElementById('log').innerText = logs.slice().reverse().join('\n'); }

class Tower {
  constructor(x,y,team){
    this.x=x; this.y=y; this.team=team; this.hp=200; this.maxHp=200; this.radius=28;
  }
  draw(){
    ctx.fillStyle = this.team===0 ? '#3cbcff' : '#ff6b6b';
    roundRect(ctx,this.x-32,this.y-32,64,64,8,true,false);
    // hp
    ctx.fillStyle='#222';
    ctx.fillRect(this.x-36,this.y+36,72,8);
    ctx.fillStyle='#3cf55a';
    ctx.fillRect(this.x-36,this.y+36,72*(this.hp/this.maxHp),8);
  }
}

class Unit {
  constructor(x,y,team,type){
    this.x=x; this.y=y; this.team=team; this.type=type;
    const defs = UNIT_DEFS[type];
    this.hp = defs.hp; this.maxHp=defs.hp; this.speed=defs.speed; this.atk=defs.atk; this.range=defs.range; this.size=defs.size;
    this.atkCd = 0;
    this.target = null;
  }
  draw(){
    // body
    ctx.beginPath();
    ctx.fillStyle = this.team===0 ? UNIT_COLOR[this.type].player : UNIT_COLOR[this.type].enemy;
    ctx.arc(this.x,this.y,this.size,0,Math.PI*2);
    ctx.fill();
    // hp
    ctx.fillStyle='#222';
    ctx.fillRect(this.x-this.size-2,this.y+this.size+6,(this.size*2)+4,5);
    ctx.fillStyle='#4de07a';
    ctx.fillRect(this.x-this.size-2,this.y+this.size+6,((this.hp/this.maxHp)*((this.size*2)+4)),5);
  }
  update(dt){
    // acquire target
    if(!this.target || this.target.hp<=0){
      let candidates = entities.filter(e=> e.team!==this.team);
      candidates = candidates.concat(towers.filter(t=> t.team!==this.team));
      if(candidates.length>0){
        candidates.sort((a,b)=> hyp(a.x,a.y,this.x,this.y) - hyp(b.x,b.y,this.x,this.y));
        this.target = candidates[0];
      } else this.target=null;
    }
    if(this.target){
      const d = hyp(this.x,this.y,this.target.x,this.target.y);
      if(d > this.range + (this.target.radius||this.target.size||0) ){
        const dir = Math.atan2(this.target.y-this.y,this.target.x-this.x);
        this.x += Math.cos(dir)*this.speed*dt;
        this.y += Math.sin(dir)*this.speed*dt;
      } else {
        this.atkCd -= dt;
        if(this.atkCd<=0){
          this.atkCd = UNIT_DEFS[this.type].atkSpeed;
          this.target.hp -= this.atk;
          if(this.target.hp<=0){
            log(`${this.type} (${this.team===0?'Player':'Enemy'}) destroyed a target.`);
          }
        }
      }
    } else {
      // advance
      const dir = this.team===0 ? 0 : Math.PI;
      this.x += Math.cos(dir)*this.speed*dt;
    }
  }
}

const UNIT_DEFS = {
  soldier: {hp:30,speed:60,atk:8,range:10,size:10,atkSpeed:0.7,cost:3},
  tank: {hp:120,speed:22,atk:22,range:12,size:16,atkSpeed:1.0,cost:6},
  archer: {hp:18,speed:58,atk:6,range:90,size:8,atkSpeed:0.9,cost:3},
  giant: {hp:180,speed:28,atk:18,range:14,size:18,atkSpeed:1.2,cost:7},
  wizard: {hp:40,speed:40,atk:10,range:70,size:10,atkSpeed:1.0,cost:5}
};

const UNIT_COLOR = {
  soldier: {player:'#9fe3ff', enemy:'#ffb7b7'},
  tank: {player:'#3da1ff', enemy:'#ff8b8b'},
  archer: {player:'#b4f0ff', enemy:'#ffd0d0'},
  giant: {player:'#7fc5ff', enemy:'#ff9f9f'},
  wizard: {player:'#d2f7ff', enemy:'#ffe6e6'}
};

function hyp(x1,y1,x2,y2){ return Math.hypot(x1-x2,y1-y2); }

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

function spawnUnit(team,type,fromAI=false){
  if(team===0){
    const y = H*0.42 + (Math.random()-0.5)*80;
    const u = new Unit(120,y,0,type);
    entities.push(u);
    if(!fromAI) log(`You spawned ${type}.`);
  } else {
    const y = H*0.58 + (Math.random()-0.5)*80;
    const u = new Unit(W-120,y,1,type);
    entities.push(u);
    if(fromAI) log(`Enemy spawned ${type}.`);
  }
}

function setup(){
  // towers: two each
  towers = [
    new Tower(80,H*0.32,0),
    new Tower(80,H*0.68,0),
    new Tower(W-80,H*0.32,1),
    new Tower(W-80,H*0.68,1)
  ];

  // deck & hand
  playerDeck = shuffle(Object.keys(UNIT_DEFS).reduce((arr,k)=> arr.concat([k,k]), [])); // 2 copies each
  playerHand = [];
  for(let i=0;i<4;i++) drawCardToHand();

  // controls
  document.getElementById('rotateBtn').onclick = rotateHand;

  // initial elixir
  playerElixir = 5;
  enemyElixir = 5;

  requestAnimationFrame(loop);
  // enemy AI spawn interval
  setInterval(enemyAiTick, 1200);
}

function drawCardToHand(){
  if(playerDeck.length===0) playerDeck = shuffle(playerDeckOriginal()); // refill if needed
  playerHand.push(playerDeck.shift());
  renderHand();
}

function playerDeckOriginal(){
  return Object.keys(UNIT_DEFS).reduce((arr,k)=> arr.concat([k,k]), []);
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

function rotateHand(){
  // discard first card to bottom and draw new
  if(playerHand.length>0){
    const c = playerHand.shift();
    playerDeck.push(c);
    drawCardToHand();
    log('Rotated cards.');
  }
}

function renderHand(){
  const row = document.getElementById('cardRow');
  row.innerHTML = '';
  playerHand.forEach((type,idx)=>{
    const def = UNIT_DEFS[type];
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.type = type;
    card.innerHTML = `<div class="title">${type}</div><div class="cost">${def.cost}</div>`;
    // click to play
    card.onclick = ()=>{
      if(playerElixir >= def.cost){
        playerElixir -= def.cost;
        spawnUnit(0,type,false);
        playerHand.splice(idx,1);
        drawCardToHand();
        updateHud();
      } else {
        log('Nicht genug Elixir!');
      }
    };
    row.appendChild(card);
  });
  updateHud();
}

function updateHud(){
  // elixir bars
  const pctP = Math.min(1, playerElixir / MAX_ELIXIR) * 100;
  const pctE = Math.min(1, enemyElixir / MAX_ELIXIR) * 100;
  document.getElementById('playerElixirVal').style.width = pctP + '%';
  document.getElementById('enemyElixirVal').style.width = pctE + '%';
  document.getElementById('timeVal').innerText = Math.ceil(timeLeft);
}

function enemyAiTick(){
  // regenerate AI elixir equally handled in loop; here decide spawns based on hand
  // Simple AI: choose a random unit from possible defs matching cost <= enemyElixir
  const options = Object.keys(UNIT_DEFS).filter(t=> UNIT_DEFS[t].cost <= enemyElixir);
  if(options.length===0) return;
  // bias toward soldier and tank spawning near parity
  if(Math.random() < 0.6){
    const t = options[Math.floor(Math.random()*options.length)];
    // spend elixir
    enemyElixir -= UNIT_DEFS[t].cost;
    spawnUnit(1,t,true);
  }
}

function loop(ts){
  let dt = (ts - lastTime)/1000;
  if(dt>0.1) dt=0.1;
  lastTime = ts;

  // regen elixir for both sides equally
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + ELIXIR_REGEN*dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + ELIXIR_REGEN*dt);

  timeLeft -= dt;

  // update entities
  for(let i=entities.length-1;i>=0;--i){
    const e = entities[i];
    e.update(dt);
    if(e.hp<=0) entities.splice(i,1);
    if(e.x<0 || e.x>W) entities.splice(i,1);
  }
  // towers
  for(let i=towers.length-1;i>=0;--i){
    const t=towers[i];
    if(t.hp<=0){ towers.splice(i,1); log('A tower has fallen!'); }
  }

  // collisions: units hitting towers
  for(const u of entities){
    for(const t of towers){
      if(u.team!==t.team){
        const d = hyp(u.x,u.y,t.x,t.y);
        if(d < t.radius + u.size + 4){
          t.hp -= u.atk * 0.5 * (dt*60/60);
          u.hp -= u.atk*0.05;
        }
      }
    }
  }

  // draw
  draw();

  updateHud();

  if(timeLeft>0 && towers.filter(t=> t.team===0).length>0 && towers.filter(t=> t.team===1).length>0){
    requestAnimationFrame(loop);
  } else {
    let winner = 'Draw';
    const p = towers.filter(t=> t.team===0).length;
    const e = towers.filter(t=> t.team===1).length;
    if(p>e) winner='Player';
    if(e>p) winner='Enemy';
    log('--- Match ended. Winner: '+winner);
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);

  // background lanes
  ctx.fillStyle='#0e2440';
  ctx.fillRect(0,0,W,H);
  // river (center)
  ctx.fillStyle='rgba(120,160,255,0.06)';
  ctx.fillRect(W*0.5-36,0,72,H);

  // bridges
  ctx.fillStyle='rgba(255,255,255,0.03)';
  ctx.fillRect(W*0.5-120,H*0.33,240,40);
  ctx.fillRect(W*0.5-120,H*0.66,240,40);

  // towers
  for(const t of towers) t.draw();

  // entities
  for(const e of entities) e.draw();

  // top overlay
  ctx.fillStyle='rgba(255,255,255,0.02)';
  ctx.fillRect(0,0,W,40);
  ctx.fillStyle='#dfefff';
  ctx.font='16px sans-serif';
  ctx.fillText('Clash‑Lite — Upgraded (cards + balanced elixir)',12,26);
}

setup();
renderHand();
