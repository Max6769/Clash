// Improved Clash-Lite script.js (compressed for readability)
// Loads troops.json, supports deck building, better combat, spells, and polished UI/animations.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const btnQuickPlay = document.getElementById('btnQuickPlay');
const btnDeckBuilder = document.getElementById('btnDeckBuilder');
const handEl = document.getElementById('hand');
const elixirFill = document.getElementById('elixirFill');
const elixirNum = document.getElementById('elixirNum');
const deckDuringGame = document.getElementById('deckDuringGame');
const btnExport = document.getElementById('btnExport');

let troops = {};
let loaded = false;
async function loadTroops(){ try{ const r = await fetch('troops.json'); troops = await r.json(); loaded = true; console.log('troops loaded', Object.keys(troops).length); }catch(e){ console.error('troops.json load failed', e); } }
loadTroops();

let playerDeck = [], playerHand = [], enemyDeck = [], enemyHand = [], entities = [], towers = [];
let playerElixir = 4, enemyElixir = 4, MAX_ELIXIR = 10;
let ELIXIR_RATE = 1/2.8;
let timer = 120, lastTime = performance.now();
let selectedCard = null;
btnQuickPlay.onclick = ()=>{ document.querySelector('.menu').style.display='none'; startQuickMatch(); };
btnDeckBuilder.onclick = ()=>{ alert('Deck builder: drag icons from left panel in a future update — for now Quick Battle will auto-generate decks.'); }
btnExport.onclick = ()=>{ navigator.clipboard?.writeText(JSON.stringify(playerDeck)).then(()=> alert('Deck copied to clipboard')); }

function startQuickMatch(){
  if(!loaded){ alert('troops not yet loaded — try again in a moment.'); return; }
  const keys = Object.keys(troops);
  const heavy = keys.find(k=> troops[k].win) || keys[0];
  const spell = keys.find(k=> troops[k].type==='spell') || keys[0];
  const deck = [heavy, spell];
  while(deck.length<8){ const pick = keys[Math.floor(Math.random()*keys.length)]; if(deck.filter(x=>x===pick).length<2) deck.push(pick); }
  shuffle(deck);
  playerDeck = deck.slice();
  enemyDeck = createAIDeck();
  playerHand = []; enemyHand = [];
  for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
  playerElixir = 4; enemyElixir = 4; MAX_ELIXIR = 10; timer = 120;
  setupTowers();
  renderHand(); renderDeckIcons();
  lastTime = performance.now();
  entities = [];
  requestAnimationFrame(loop);
}

function createAIDeck(){
  const keys = Object.keys(troops);
  const spells = keys.filter(k=> troops[k].type==='spell');
  const heavy = keys.filter(k=> troops[k].hp && troops[k].hp>150);
  const deck = [];
  if(heavy.length) deck.push(randomChoice(heavy));
  if(spells.length) deck.push(randomChoice(spells));
  while(deck.length<8) deck.push(randomChoice(keys));
  shuffle(deck);
  return deck;
}

function setupTowers(){
  towers = [
    {x:120,y:H*0.25,team:0,hp:220,maxHp:220,main:false},
    {x:120,y:H*0.5,team:0,hp:420,maxHp:420,main:true},
    {x:120,y:H*0.75,team:0,hp:220,maxHp:220,main:false},
    {x:W-120,y:H*0.25,team:1,hp:220,maxHp:220,main:false},
    {x:W-120,y:H*0.5,team:1,hp:420,maxHp:420,main:true},
    {x:W-120,y:H*0.75,team:1,hp:220,maxHp:220,main:false}
  ];
}

function drawCard(hand, deck){ if(deck.length) hand.push(deck.shift()); }
function renderHand(){ handEl.innerHTML=''; playerHand.forEach((id,idx)=>{ const def = troops[id] || {cost:'?'}; const slot = document.createElement('div'); slot.className='cardSlot'; const icon = document.createElement('div'); icon.className='icon'; icon.style.backgroundImage = `url(icons/${id}.svg)`; const cost = document.createElement('div'); cost.className='cost'; cost.innerText = def.cost || '?'; const name = document.createElement('div'); name.style.fontSize='12px'; name.style.textAlign='center'; name.style.color='var(--muted)'; name.innerText = def.name || id; slot.appendChild(icon); slot.appendChild(name); slot.appendChild(cost); slot.onclick = ()=> selectCard(idx); if(playerElixir < (def.cost||0)) slot.style.filter='grayscale(60%) opacity(.6)'; else slot.style.filter='none'; handEl.appendChild(slot); }); updateElixirUI(); }
function renderDeckIcons(){ deckDuringGame.innerHTML=''; playerDeck.slice().reverse().forEach(id=>{ const el = document.createElement('div'); el.style.width='44px'; el.style.height='44px'; el.style.backgroundImage=`url(icons/${id}.svg)`; el.style.backgroundSize='44px 44px'; el.style.borderRadius='6px'; el.style.boxShadow='0 8px 18px rgba(0,0,0,0.4)'; deckDuringGame.appendChild(el); }); }
function selectCard(idx){ if(idx<0||idx>=playerHand.length) return; const id = playerHand[idx]; const def = troops[id]||{}; if(playerElixir < (def.cost||0)) return; selectedCard = idx; Array.from(handEl.children).forEach((el,i)=> el.style.border = i===idx ? '2px solid rgba(255,216,107,0.9)' : 'none'); }

canvas.addEventListener('click',(e)=>{
  if(selectedCard===null) return;
  const rect = canvas.getBoundingClientRect(); const x = e.clientX-rect.left, y = e.clientY-rect.top;
  if(x > W*0.55) return;
  const id = playerHand[selectedCard]; const def = troops[id]||{};
  if(def.type==='spell'){
    entities.push({id:id,kind:'spell',team:0,x:x,y:y,radius:def.radius||40,atk:def.atk||30,ttl:1.2});
  } else {
    entities.push({id:id,kind:'unit',team:0,x:x,y:y,hp:def.hp||30,maxHp:def.hp||30,size:def.size||10,speed:def.speed||50,atk:def.atk||8,cd:0});
  }
  playerElixir -= def.cost||0;
  const played = playerHand.splice(selectedCard,1)[0]; playerDeck.push(played); drawCard(playerHand, playerDeck);
  selectedCard=null; renderHand(); renderDeckIcons();
});
canvas.addEventListener('contextmenu',(e)=>{ e.preventDefault(); selectedCard=null; Array.from(handEl.children).forEach(el=> el.style.border='none'); });

let aiTimer=0;
function aiPlay(dt){
  aiTimer += dt;
  if(aiTimer > 0.9){
    aiTimer = 0;
    for(let i=0;i<enemyHand.length;i++){
      const id = enemyHand[i]; const def = troops[id]||{};
      if((def.cost||0) <= enemyElixir){
        enemyElixir -= def.cost||0;
        if(def.type==='spell'){
          const tx = W*0.6; const ty = (Math.random()<0.5? H*0.28 : H*0.72);
          entities.push({id:id,kind:'spell',team:1,x:tx,y:ty,radius:def.radius||40,atk:def.atk||30,ttl:1.2});
        } else {
          const sx = W-160; const sy = (Math.random()<0.5? H*0.28 : H*0.72);
          entities.push({id:id,kind:'unit',team:1,x:sx,y:sy,hp:def.hp||30,maxHp:def.hp||30,size:def.size||10,speed:def.speed||50,atk:def.atk||8,cd:0});
        }
        const played = enemyHand.splice(i,1)[0]; enemyDeck.push(played); drawCard(enemyHand, enemyDeck);
        break;
      }
    }
  }
}

let particles = [];
function spawnParticle(x,y,color){ for(let i=0;i<6;i++){ particles.push({x:x + (Math.random()-0.5)*18, y:y + (Math.random()-0.5)*18, vx:(Math.random()-0.5)*60, vy:(Math.random()-0.5)*60, life:0.36, color:color}); } }
function spawnExplosion(x,y){ for(let i=0;i<18;i++){ particles.push({x:x, y:y, vx:(Math.random()-0.5)*200, vy:(Math.random()-0.5)*200, life:0.8, color:'#ffd86b'}); } }

function loop(ts){
  const dt = Math.min(0.05,(ts-lastTime)/1000); lastTime = ts;
  let rate = ELIXIR_RATE * (timer<=45?2:1);
  playerElixir = Math.min(MAX_ELIXIR, playerElixir + rate*dt);
  enemyElixir = Math.min(MAX_ELIXIR, enemyElixir + rate*dt);
  timer -= dt;
  aiPlay(dt);
  for(let i=entities.length-1;i>=0;i--){
    const e = entities[i];
    if(e.kind==='unit'){
      let target = findNearestTarget(e);
      if(target){
        const dx = target.x - e.x; const dy = target.y - e.y;
        const dist = Math.hypot(dx,dy);
        if(dist > (e.size + (target.size|| (target.radius||20) )) + 6){
          const dirx = dx/dist; const diry = dy/dist;
          e.x += dirx * e.speed * dt;
          e.y += diry * e.speed * dt;
        } else {
          e.cd -= dt;
          if(e.cd <= 0){
            e.cd = 0.8 - Math.min(0.4, e.speed/300);
            target.hp -= e.atk;
            spawnParticle(target.x, target.y, e.team===0? '#ffd86b' : '#ff7a6a');
            if(target.hp <= 0){
              if(target._isTower){ target.hp = 0; }
            }
          }
        }
      } else {
        const dir = e.team===0 ? 1 : -1;
        e.x += dir * e.speed * dt;
      }
      if(e.hp <= 0 || e.x < -80 || e.x > W+80){ entities.splice(i,1); continue; }
    } else if(e.kind==='spell'){
      e.ttl -= dt;
      if(e.ttl <= 0){
        applyAOE(e.x,e.y,e.radius,e.atk,e.team);
        spawnExplosion(e.x,e.y);
        entities.splice(i,1); continue;
      } else {
        e.y += Math.sin(ts/200 + i) * 0.2;
      }
    }
  }
  towers = towers.filter(t=> t.hp > 0);
  draw();
  updateElixirUI();
  if(timer > -60 && towers.filter(t=> t.team===0).length>0 && towers.filter(t=> t.team===1).length>0){
    requestAnimationFrame(loop);
  } else {
    const p = towers.filter(t=>t.team===0).length, e = towers.filter(t=>t.team===1).length;
    const winner = p>e ? 'Player' : (e>p ? 'Enemy' : 'Draw');
    setTimeout(()=>{ alert('Match ended — winner: '+winner); document.querySelector('.menu').style.display='flex'; }, 200);
  }
}

function applyAOE(x,y,r,atk,team){
  for(const ent of entities){
    const d = Math.hypot(ent.x-x, ent.y-y);
    if(d <= r + (ent.size||0)) ent.hp -= atk * (1 - d/(r+1));
  }
  for(const t of towers){
    const d = Math.hypot(t.x-x, t.y-y);
    if(d <= r+30) t.hp -= atk * (1 - d/(r+1));
  }
}

function findNearestTarget(unit){
  const enemies = entities.filter(e=> e.team !== unit.team && e.kind==='unit');
  if(enemies.length){
    enemies.sort((a,b)=> (Math.hypot(a.x-unit.x,a.y-unit.y) - Math.hypot(b.x-unit.x,b.y-unit.y)));
    return enemies[0];
  }
  const laneY = unit.y;
  const candidate = towers.filter(t=> t.team !== unit.team).sort((a,b)=> Math.abs(a.y-laneY)-Math.abs(b.y-laneY))[0];
  return candidate || null;
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function randomChoice(a){ return a[Math.floor(Math.random()*a.length)]; }

setTimeout(()=>{
  const keys = Object.keys(troops);
  if(keys.length){
    playerDeck = keys.slice(0,8);
    enemyDeck = createAIDeck();
    playerHand = []; enemyHand = [];
    for(let i=0;i<4;i++){ drawCard(playerHand, playerDeck); drawCard(enemyHand, enemyDeck); }
    renderHand(); renderDeckIcons();
  }
}, 400);
