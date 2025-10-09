// Simple Clash‑Lite: lane-based mini game.
// Single file, no frameworks. Designed as a demo to put on GitHub & iterate.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let elixir = 0;
let timeLeft = 60; // seconds
let lastTime = performance.now();
let entities = [];
let towers = [];
let logs = [];

function log(s){ logs.push(s); if(logs.length>200) logs.shift(); const el = document.getElementById('log'); el.innerText = logs.slice().reverse().join('\n'); }

// Tower constructor
class Tower {
  constructor(x,y,team){
    this.x=x; this.y=y; this.team=team; this.hp=100; this.maxHp=100; this.radius=22;
  }
  draw(){
    ctx.fillStyle = this.team===0 ? '#5fd3ff' : '#ff8b8b';
    ctx.beginPath();
    ctx.rect(this.x-24,this.y-24,48,48);
    ctx.fill();
    // hp
    ctx.fillStyle='#222';
    ctx.fillRect(this.x-30,this.y+28,60,8);
    ctx.fillStyle='#3cf55a';
    ctx.fillRect(this.x-30,this.y+28,60*(this.hp/this.maxHp),8);
  }
  update(dt){}
}

class Unit {
  constructor(x,y,team,type){
    this.x=x; this.y=y; this.team=team; this.type=type; // 0 player left, 1 enemy right
    if(type==='soldier'){ this.hp=20; this.maxHp=20; this.speed=40; this.atk=6; this.range=10; this.size=10; this.target=null; }
    if(type==='tank'){ this.hp=60; this.maxHp=60; this.speed=24; this.atk=14; this.range=12; this.size=14; this.target=null; }
  }
  draw(){
    ctx.beginPath();
    ctx.fillStyle = this.team===0 ? '#9fe3ff' : '#ffb7b7';
    ctx.arc(this.x,this.y,this.size,0,Math.PI*2);
    ctx.fill();
    // hp bar
    ctx.fillStyle='#222';
    ctx.fillRect(this.x-16,this.y+18,32,5);
    ctx.fillStyle='#00d46b';
    ctx.fillRect(this.x-16,this.y+18,32*(this.hp/this.maxHp),5);
  }
  update(dt){
    // find nearest enemy unit or tower
    if(!this.target || this.target.hp<=0){
      let candidates = entities.filter(e=> e.team!==this.team);
      if(towers) candidates = candidates.concat(towers.filter(t=> t.team!==this.team));
      if(candidates.length>0){
        // choose closest
        candidates.sort((a,b)=> (hyp(a.x,a.y,this.x,this.y) - hyp(b.x,b.y,this.x,this.y)) );
        this.target = candidates[0];
      } else this.target=null;
    }
    if(this.target){
      const d = hyp(this.x,this.y,this.target.x,this.target.y);
      if(d > this.range + (this.target.radius||this.target.size||0) ){
        // move toward
        const dir = Math.atan2(this.target.y-this.y,this.target.x-this.x);
        this.x += Math.cos(dir)*this.speed*dt;
        this.y += Math.sin(dir)*this.speed*dt;
      } else {
        // attack (simple cooldown)
        if(!this._cd) this._cd=0;
        this._cd -= dt;
        if(this._cd<=0){
          this._cd = 0.8; // attack speed
          this.target.hp -= this.atk;
          if(this.target.hp<=0){
            log(`${this.type} (${this.team===0?'Player':'Enemy'}) killed a target.`);
            // remove tower later
          }
        }
      }
    } else {
      // advance toward enemy side
      const dir = this.team===0 ? 0 : Math.PI;
      this.x += Math.cos(dir)*this.speed*dt;
    }
  }
}

function hyp(x1,y1,x2,y2){ return Math.hypot(x1-x2,y1-y2); }

function spawnUnit(team,type){
  if(team===0){
    // player's spawn left side
    const y = H*0.4 + (Math.random()-0.5)*60;
    const u = new Unit(120,y,0,type);
    entities.push(u);
    log(`Spawned ${type} (Player).`);
  } else {
    const y = H*0.6 + (Math.random()-0.5)*60;
    const u = new Unit(W-120,y,1,type);
    entities.push(u);
    log(`Spawned ${type} (Enemy).`);
  }
}

function spawnEnemyWave(){
  // simple AI: spawn occasionally
  if(Math.random() < 0.02) spawnUnit(1, Math.random()<0.7?'soldier':'tank');
}

function setup(){
  // towers: player left, enemy right (two each)
  towers = [
    new Tower(80,H*0.33,0),
    new Tower(80,H*0.66,0),
    new Tower(W-80,H*0.33,1),
    new Tower(W-80,H*0.66,1)
  ];
  document.getElementById('spawnBtn').onclick = ()=>{
    if(elixir>=3){ elixir -=3; spawnUnit(0,'soldier'); updateHud(); }
    else log('Not enough elixir!');
  };
  document.getElementById('spawnBtn2').onclick = ()=>{
    if(elixir>=6){ elixir -=6; spawnUnit(0,'tank'); updateHud(); }
    else log('Not enough elixir!');
  };
  elixir = 3;
  updateHud();
  requestAnimationFrame(loop);
}

function updateHud(){
  document.getElementById('elixirVal').innerText = Math.floor(elixir);
  document.getElementById('timeVal').innerText = Math.ceil(timeLeft);
}

function loop(ts){
  let dt = (ts - lastTime)/1000;
  if(dt>0.1) dt=0.1;
  lastTime = ts;

  // update game
  elixir += 0.5*dt; // 0.5 elixir per sec — slow for demo
  timeLeft -= dt;
  spawnEnemyWave();

  // update entities
  for(let i = entities.length-1; i>=0; --i){
    const e = entities[i];
    e.update(dt);
    if(e.hp<=0) { entities.splice(i,1); }
    // clamp inside
    if(e.x<0 || e.x>W) entities.splice(i,1);
  }
  // update towers
  for(let i = towers.length-1; i>=0; --i){
    const t = towers[i];
    if(t.hp<=0){
      towers.splice(i,1);
      log(`A tower has been destroyed!`);
    }
  }

  checkCollisions();

  // draw
  draw();

  updateHud();

  if(timeLeft>0 && towers.filter(t=> t.team===0).length>0 && towers.filter(t=> t.team===1).length>0){
    requestAnimationFrame(loop);
  } else {
    // end
    let winner = 'Draw';
    const p = towers.filter(t=> t.team===0).length;
    const e = towers.filter(t=> t.team===1).length;
    if(p>e) winner='Player';
    if(e>p) winner='Enemy';
    log('--- Match ended. Winner: '+winner);
  }
}

function checkCollisions(){
  // units that reach towers will damage them instantly for simplicity
  for(const u of entities){
    for(const t of towers){
      if(u.team!==t.team){
        const d = hyp(u.x,u.y,t.x,t.y);
        if(d < 26 + (u.size||0) ){
          // hit tower
          t.hp -= u.atk * 0.5;
          u.hp -= u.atk*0.1;
        }
      }
    }
  }
}

function draw(){
  // clear
  ctx.clearRect(0,0,W,H);

  // middle river / lane indicator
  ctx.fillStyle='rgba(255,255,255,0.03)';
  ctx.fillRect(W*0.5-2,0,4,H);

  // draw towers
  for(const t of towers) t.draw();

  // draw entities
  for(const e of entities) e.draw();

  // little HUD overlays
  ctx.fillStyle='rgba(255,255,255,0.02)';
  ctx.fillRect(0,0,W,36);
  ctx.fillStyle='#dfefff';
  ctx.font='14px sans-serif';
  ctx.fillText('Clash‑Lite — simple lane demo',12,22);
}

// basic enemy spawn timer
setInterval(()=>{ if(Math.random()<0.6) spawnUnit(1, Math.random()<0.75?'soldier':'tank'); }, 3000);

setup();
