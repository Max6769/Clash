// Arena script: loads saved deck from localStorage, allows placing troops, ensures proper placement and tower interactions
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const handArea = document.getElementById('handArea');
const elixirFill = document.getElementById('elixirFill');
const elixirValue = document.getElementById('elixirValue');
const elixirMax = document.getElementById('elixirMax');
const towersInfo = document.getElementById('towersInfo');

let CARD_DATA = [];
let deck = [];
let playerHand = [], playerDeck = [], enemyHand = [], enemyDeck = [];
let entities = [], towers = [];
let playerElixir = 4, enemyElixir = 4, MAX_ELIXIR = 10;
let ELIXIR_RATE = 0.45;
let lastTime = performance.now();
let timer = 120;
let gameRunning = false;
let selectedHandIndex = null;

// load cards and deck from localStorage
fetch('cards_pack.json').then(r=>r.json()).then(j=>{ CARD_DATA = j.cards||[]; loadDeck(); startQuickMatch(); }).catch(e=>console.error(e));

function loadDeck(){
  const d = localStorage.getItem('clashlite_deck');
  if(d){ try{ deck = JSON.parse(d); }catch(e){ deck = CARD_DATA.slice(0,8).map(c=>c.id); } }
  else deck = CARD_DATA.slice(0,8).map(c=>c.id);
}

function startQuickMatch(){
  playerDeck = deck.slice();
  enemyDeck = createAIDeck();
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  setupTowers();
  playerElixir = 4; enemyElixir = 4; timer = 120; lastTime = performance.now(); gameRunning=true;
  renderHandUI(); requestAnimationFrame(loop);
}

function createAIDeck(){ const ids = CARD_DATA.map(c=>c.id); return shuffle(ids).slice(0,8); }
function drawCard(hand, deckList){ if(deckList.length) hand.push(deckList.shift()); }

function setupTowers(){
  towers = [
    {x:140,y:H*0.28,team:0,hp:220,maxHp:220,range:160,fireCd:0},
    {x:140,y:H*0.5,team:0,hp:480,maxHp:480,range:220,fireCd:0,main:true},
    {x:140,y:H*0.72,team:0,hp:220,maxHp:220,range:160,fireCd:0},
    {x:W-140,y:H*0.28,team:1,hp:220,maxHp:220,range:160,fireCd:0},
    {x:W-140,y:H*0.5,team:1,hp:480,maxHp:480,range:220,fireCd:0,main:true},
    {x:W-140,y:H*0.72,team:1,hp:220,maxHp:220,range:160,fireCd:0}
  ];
}

function renderHandUI(){
  handArea.innerHTML='';
  playerHand.forEach((id,i)=>{
    const c = CARD_DATA.find(x=>x.id===id);
    const el = document.createElement('div'); el.className='handCard';
    el.innerHTML = `<img src="icons/${id}.svg" style="width:64px;height:64px"><div style="font-size:13px">${c.name}</div><div style="font-weight:900">${c.cost}</div>`;
    el.addEventListener('click', ()=> selectedHandIndex = i );
    handArea.appendChild(el);
  });
  elixirValue.innerText = Math.floor(playerElixir);
  elixirMax.innerText = MAX_ELIXIR;
  const pct = Math.min(1, playerElixir / MAX_ELIXIR);
  elixirFill.style.width = (pct*100) + '%';
  elixirFill.style.boxShadow = `0 8px ${8 + pct*40}px rgba(255,184,90,${0.08 + pct*0.3})`;
  towersInfo && (towersInfo.innerText = 'Towers P:' + towers.filter(t=>t.team===0).length + ' E:' + towers.filter(t=>t.team===1).length);
}

canvas.addEventListener('click', (e)=>{
  if(selectedHandIndex===null) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if(x > W*0.5 - 50) { alert('Place troops on your side (left half).'); return; }
  const id = playerHand[selectedHandIndex]; const card = CARD_DATA.find(c=>c.id===id);
  if(!card) return;
  if(playerElixir < card.cost){ alert('Not enough elixir'); return; }
  const spawnX = Math.max(100, Math.min(x, W*0.5 - 80));
  const spawnY = Math.max(90, Math.min(y, H-90));
  deployCardAt(id, 0, spawnX, spawnY);
  playerElixir -= card.cost;
  playerDeck.push(playerHand.splice(selectedHandIndex,1)[0]);
  selectedHandIndex = null;
  drawCard(playerHand, playerDeck);
  renderHandUI();
});

function deployCardAt(id, team, x, y){
  const def = CARD_DATA.find(c=>c.id===id); if(!def) return;
  if(def.type==='spell'){ entities.push({kind:'spell',id:id,team:team,x:x,y:y,radius:def.radius||60,atk:def.atk||70,ttl:0.9}); }
  else { entities.push({kind:'unit',id:id,team:team,x:x,y:y,hp:def.hp,atk:def.atk||10,speed:def.speed||50,size:def.size||10,cd:0,heal:def.heal||0}); }
}

let aiTimer = 0;
function aiBehavior(dt){
  aiTimer += dt;
  if(aiTimer > 0.9){ aiTimer = 0; if(enemyHand.length<4) drawCard(enemyHand, enemyDeck); for(let i=0;i<enemyHand.length;i++){ const id = enemyHand[i]; const def = CARD_DATA.find(c=>c.id===id); if(def && def.cost <= enemyElixir){ enemyElixir -= def.cost; const tx = W - 220 + (Math.random()-0.5)*40; const ty = (Math.random()<0.5? H*0.28 : H*0.72) + (Math.random()-0.5)*24; deployCardAt(id,1, Math.max(W*0.55, Math.min(tx, W-120)), ty); enemyDeck.push(enemyHand.splice(i,1)[0]); drawCard(enemyHand, enemyDeck); break; } } }
}

function updateEntities(dt){
  towers.forEach(t=>{
    t.fireCd -= dt; if(t.fireCd < 0) t.fireCd = 0;
    if(t.hp>0){
      const enemies = entities.filter(u=> u.kind==='unit' && u.team !== t.team);
      if(enemies.length){
        enemies.sort((a,b)=> Math.hypot(a.x-t.x,a.y-t.y) - Math.hypot(b.x-t.x,b.y-t.y));
        const target = enemies[0]; const d = Math.hypot(target.x-t.x,target.y-t.y);
        if(d <= t.range && t.fireCd === 0){
          t.fireCd = 1.1;
          target.hp -= 36;
          spawnParticle(target.x, target.y, '#ffb85a');
        }
      }
    }
  });

  for(let i=entities.length-1;i>=0;i--){
    const e = entities[i];
    if(e.kind==='unit'){
      if(e.heal){
        entities.forEach(o=>{ if(o.kind==='unit' && o.team===e.team){ const d=Math.hypot(o.x-e.x,o.y-e.y); if(d < (e.radius||54)) o.hp = Math.min((CARD_DATA.find(c=>c.id===o.id).hp || o.hp), o.hp + e.heal * dt); } });
      }
      let target = entities.filter(u=> u.kind==='unit' && u.team !== e.team).sort((a,b)=> Math.hypot(a.x-e.x,a.y-e.y) - Math.hypot(b.x-e.x,b.y-e.y))[0];
      if(!target){ target = towers.filter(t=> t.team !== e.team).sort((a,b)=> Math.abs(a.y - e.y) - Math.abs(b.y - e.y))[0]; if(target) target._isTower = true; }
      if(target){
        const dx = target.x - e.x, dy = target.y - e.y; const dist = Math.hypot(dx,dy);
        if(dist > (e.size + (target.size||20)) + 6){
          const nx = dx/dist, ny = dy/dist; e.x += nx * e.speed * dt; e.y += ny * e.speed * dt;
        } else {
          e.cd -= dt;
          if(e.cd <= 0){
            e.cd = 0.85 - Math.min(0.45, e.speed/300);
            if(target._isTower){ target.hp -= e.atk; spawnParticle(target.x + (Math.random()-0.5)*20, target.y + (Math.random()-0.5)*20, '#ffd86b'); }
            else { target.hp -= e.atk; spawnParticle(target.x, target.y, e.team===0? '#ffd86b' : '#ff8a80'); }
          }
        }
      } else { e.x += (e.team===0? 1:-1) * e.speed * dt; }
      if(e.hp <= 0 || e.x < -120 || e.x > W+120){ entities.splice(i,1); }
    } else if(e.kind==='spell'){
      e.ttl -= dt;
      if(e.ttl <= 0){
        entities.forEach(u=>{ if(u.kind==='unit'){ const d=Math.hypot(u.x-e.x,u.y-e.y); if(d <= e.radius + (u.size||0)) u.hp -= e.atk * (1 - d/(e.radius+1)); } });
        towers.forEach(t=>{ const d=Math.hypot(t.x-e.x,t.y-e.y); if(d <= e.radius + 30) t.hp -= e.atk * (1 - d/(e.radius+1)); });
        spawnExplosion(e.x,e.y); entities.splice(i,1);
      }
    }
  }
}

function spawnParticle(x,y,color){ for(let i=0;i<6;i++){ particles.push({x:x,y:y,vx:(Math.random()-0.5)*160,vy:(Math.random()-0.5)*160,life:0.4,color:color}); } }
function spawnExplosion(x,y){ for(let i=0;i<18;i++){ particles.push({x:x,y:y,vx:(Math.random()-0.5)*260,vy:(Math.random()-0.5)*260,life:0.8,color:'#ffb85a'}); } }

let particles = [];
function loop(ts){
  const dt = Math.min(0.05,(ts - lastTime)/1000); lastTime = ts;
  if(!gameRunning) return;
  const regen = ELIXIR_RATE * (timer<=45?2:1);
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + regen * dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + regen * dt);
  timer -= dt;
  aiBehavior(dt);
  updateEntities(dt);
  for(let i=particles.length-1;i>=0;i--){ particles[i].x += particles[i].vx * dt; particles[i].y += particles[i].vy * dt; particles[i].life -= dt; if(particles[i].life<=0) particles.splice(i,1); }
  towers = towers.filter(t=> t.hp > 0);
  drawScene();
  renderHandUI();
  if(timer > -60 && towers.filter(t=> t.team===0).length>0 && towers.filter(t=> t.team===1).length>0){ requestAnimationFrame(loop); }
  else { gameRunning=false; const p=towers.filter(t=>t.team===0).length, e=towers.filter(t=>t.team===1).length; const winner = p>e? 'Player' : (e>p? 'Enemy' : 'Draw'); setTimeout(()=>{ alert('Match ended — winner: '+winner); window.location.href='index.html'; },200); }
}

function drawScene(){ ctx.clearRect(0,0,W,H); drawColosseumBackground(); ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect(W*0.5 - 340, H*0.28 + 40, 680, 36); ctx.fillRect(W*0.5 - 340, H*0.72 - 76, 680, 36); towers.forEach(t=>{ ctx.save(); ctx.fillStyle = t.team===0? '#072a2b' : '#3a0707'; roundRect(ctx,t.x-60,t.y-60,120,120,12,true,false); ctx.fillStyle = t.main? '#ffd86b' : (t.team===0? '#ffdfb0' : '#ffb0b0'); ctx.beginPath(); ctx.arc(t.x,t.y-40,20,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#111'; ctx.fillRect(t.x-56,t.y+56,112,10); ctx.fillStyle='#3cf55a'; ctx.fillRect(t.x-56,t.y+56,Math.max(0,112*(t.hp/t.maxHp)),10); ctx.restore(); }); entities.forEach(e=>{ if(e.kind==='unit'){ ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size + 6, e.size*1.6, e.size*0.6, 0,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fill(); ctx.beginPath(); ctx.fillStyle = e.team===0? '#ffd86b' : '#ff7a6a'; ctx.arc(e.x,e.y,e.size,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(e.x-2,e.y-2,e.size*0.5,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#111'; ctx.fillRect(e.x - e.size -2, e.y + e.size + 8, (e.size*2)+4, 6); const baseHp = CARD_DATA.find(c=>c.id===e.id).hp || e.hp; ctx.fillStyle='#00d46b'; ctx.fillRect(e.x - e.size -2, e.y + e.size + 8, ((e.hp / baseHp) * ((e.size*2)+4)), 6); } else if(e.kind==='spell'){ ctx.beginPath(); ctx.fillStyle='#ff5f50'; ctx.arc(e.x,e.y,6 + 8*Math.abs(Math.sin(performance.now()/200)),0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=2; ctx.arc(e.x,e.y,e.radius*(0.7 + 0.1*Math.sin(performance.now()/300)),0,Math.PI*2); ctx.stroke(); } }); particles.forEach(p=>{ ctx.globalAlpha = Math.max(0, p.life/0.8); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,2.6,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }); ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(0,0,W,48); ctx.fillStyle='#ffd86b'; ctx.font='18px Inter, sans-serif'; ctx.fillText('Clash‑Lite Colosseum', 18, 34); ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='14px Inter, sans-serif'; ctx.fillText('Towers: P ' + towers.filter(t=>t.team===0).length + ' • E ' + towers.filter(t=>t.team===1).length, W - 260, 30); }

function drawColosseumBackground(){ const grd = ctx.createRadialGradient(W*0.5, H*0.55, 20, W*0.5, H*0.55, W*0.9); grd.addColorStop(0, '#2b0b06'); grd.addColorStop(1, '#040305'); ctx.fillStyle = grd; ctx.fillRect(0,0,W,H); for(let i=0;i<6;i++){ const r = 380 - i*48; ctx.beginPath(); ctx.lineWidth = 18 - i*2; ctx.strokeStyle = (i%2===0)? '#2a0b06' : '#470d06'; ctx.arc(W*0.5, H*0.55, r, 0, Math.PI*2); ctx.stroke(); } for(let i=0;i<8;i++){ const ang=(i/8)*Math.PI*2; const bx=W*0.5 + Math.cos(ang)*380; const by=H*0.55 + Math.sin(ang)*380; ctx.save(); ctx.translate(bx,by); ctx.rotate(ang+Math.PI/2); ctx.fillStyle=(i%2===0)? '#ff3f2f' : '#ffd86b'; roundRect(ctx,-12,-40,24,60,6,true,false); ctx.restore(); } ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.arc(W*0.5, H*0.55, 18,0,Math.PI*2); ctx.fill(); }

function roundRect(ctx,x,y,w,h,r,fill,stroke){ if(typeof r==='undefined') r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function randomChoice(a){ return a[Math.floor(Math.random()*a.length)]; }

setInterval(()=> renderHandUI(), 300);
window.deployCardAt = deployCardAt;
