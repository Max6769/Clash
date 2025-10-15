// Mini Royale v2 — enhanced offline prototype
(function(){
  // Utilities
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function now(){ return performance.now(); }

  // Deterministic LCG PRNG
  function createRng(seed){
    let s = seed >>> 0;
    return function(){
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 4294967296;
    }
  }

  // Game constants
  const TICK_RATE = 30;
  const DT = 1 / TICK_RATE;
  const CANVAS_W = 1000, CANVAS_H = 460;
  const LANE_Y = {top: CANVAS_H*0.32, bottom: CANVAS_H*0.68};
  const PLAYER_SIDE = {x: 170, towerX: 110};
  const AI_SIDE = {x: 830, towerX: 890};
  const TOWER_HP = 3000;
  const MATCH_TIME = 60; // seconds

  // Load card data (cards.json fetched locally via fetch)
  let cardData = {};
  fetch('cards.json').then(r=>r.json()).then(j=>{ for(const c of j.cards) cardData[c.id]=c; }).catch(e=>console.error(e));

  // Game state
  let state = null;

  function defaultSeed(){ return Math.floor(Math.random()*4294967295); }

  function newGame(seed=null){
    seed = seed == null ? defaultSeed() : seed;
    const rng = createRng(seed);
    const allIds = Object.keys(cardData);
    // if cardData not loaded yet, fall back to some defaults (wait a tick)
    const useIds = allIds.length? allIds : ['knight','archer','goblin','giant','miniPekka','cannon','skeleton','fireball'];
    const playerDeck = shuffle(useIds, rng).slice(0,8);
    const aiDeck = shuffle(useIds, rng).slice(0,8);
    return {
      seed, rng, tick:0, time:0, matchTime: MATCH_TIME,
      elixir:5, elixirBaseRate: 1/1.7, elixirRateMultiplier:1.0,
      phase: "normal",
      player: {deck:playerDeck, hand:playerDeck.slice(0,4), nextIdx:4, towers:{left:TOWER_HP,right:TOWER_HP,king:TOWER_HP}},
      ai: {deck:aiDeck, hand:aiDeck.slice(0,4), nextIdx:4, towers:{left:TOWER_HP,right:TOWER_HP,king:TOWER_HP}, lastPlay:0},
      entities: [], logs: [], selectedCard:null, result:null, rngFunc:rng, nextEntityId:1,
    };
  }

  function shuffle(arr, rng){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(rng()* (i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function log(msg){
    state.logs.unshift(msg);
    if(state.logs.length>200) state.logs.pop();
  }

  function spawnEntity(defId, owner, lane, x=null){
    const def = cardData[defId] || {};
    const id = state.nextEntityId++;
    const side = owner==="player"? PLAYER_SIDE : AI_SIDE;
    const posX = x != null ? x : side.x;
    const posY = lane==="top"? LANE_Y.top : LANE_Y.bottom;
    const facing = owner==="player" ? 1 : -1;
    const ent = {
      id, defId, owner, lane, type: def.type || 'troop', hp: def.hp || 100, maxHp: def.hp || 100,
      x: posX, y: posY, vx: facing * (def.move_speed||60) / TICK_RATE,
      dmg: def.dmg||10, range: def.range||20, targeting: def.target||"ground", target_priority: def.target_priority||"nearest",
      atk_speed: def.atk_speed||1.0, atk_timer:0, lifetime: def.lifetime? def.lifetime * TICK_RATE : null,
      created: state.tick, special: def.special||[], radius: def.radius||0, deployTime: def.deploy_time||0, deployTimer:0,
    };
    state.entities.push(ent);
    return ent;
  }

  function playCard(side, cardId, lane){
    const def = cardData[cardId];
    if(!def) return false;
    if(def.cost > state.elixir) return false;
    state.elixir = clamp(state.elixir - def.cost, 0, 10);
    if(def.type === "spell"){
      const cx = (side==="player") ? (CANVAS_W/2 - 140) : (CANVAS_W/2 + 140);
      const cy = lane==="top"? LANE_Y.top : LANE_Y.bottom;
      if(def.special && def.special.includes("area_damage")){
        for(const e of state.entities){ const dx=e.x-cx, dy=e.y-cy; if(Math.hypot(dx,dy)<=def.radius) e.hp=Math.max(0,e.hp-def.dmg); }
        const enemyT = getTowers(side==="player"?"ai":"player");
        for(const tw of enemyT){ const dx=tw.x-cx, dy=tw.y-cy; if(Math.hypot(dx,dy)<=def.radius){ if(tw.owner==='player') state.player.towers[tw.key]=Math.max(0,state.player.towers[tw.key]-def.dmg); else state.ai.towers[tw.key]=Math.max(0,state.ai.towers[tw.key]-def.dmg); } }
        log(`${side} cast ${def.name} on ${lane}`);
      }
      if(def.special && def.special.includes("freeze")){
        for(const e of state.entities){ if(e.owner !== side && e.lane === lane){ e._frozen = state.tick + Math.round(def.lifetime * TICK_RATE); } }
        log(`${side} cast Freeze on ${lane}`);
      }
    } else if(def.type === "building"){
      const x = side==="player" ? PLAYER_SIDE.x + 90 : AI_SIDE.x - 90;
      spawnEntity(cardId, side, lane, x);
      log(`${side} placed ${def.name} on ${lane}`);
    } else {
      const startX = side==="player"? PLAYER_SIDE.x : AI_SIDE.x;
      const ent = spawnEntity(cardId, side, lane, startX);
      ent.deployTimer = ent.deployTime ? Math.round(ent.deployTime * TICK_RATE) : 0;
      log(`${side} spawned ${def.name} on ${lane}`);
    }

    const deckObj = side==="player"? state.player : state.ai;
    if(deckObj.nextIdx < deckObj.deck.length){ deckObj.hand.push(deckObj.deck[deckObj.nextIdx]); deckObj.nextIdx++; if(deckObj.hand.length>8) deckObj.hand.shift(); }
    else { deckObj.deck = shuffle(deckObj.deck, state.rngFunc); deckObj.nextIdx = 0; }
    return true;
  }

  function getTowers(side){
    if(side==="player"){ return [{type:"tower", owner:"player", key:"left", x:PLAYER_SIDE.towerX+220, y:LANE_Y.top, hp: state.player.towers.left},{type:"tower", owner:"player", key:"right", x:PLAYER_SIDE.towerX+220, y:LANE_Y.bottom, hp: state.player.towers.right},{type:"tower", owner:"player", key:"king", x:CANVAS_W/2, y:CANVAS_H/2, hp: state.player.towers.king}]; }
    else { return [{type:"tower", owner:"ai", key:"left", x:AI_SIDE.towerX-220, y:LANE_Y.top, hp: state.ai.towers.left},{type:"tower", owner:"ai", key:"right", x:AI_SIDE.towerX-220, y:LANE_Y.bottom, hp: state.ai.towers.right},{type:"tower", owner:"ai", key:"king", x:CANVAS_W/2, y:CANVAS_H/2, hp: state.ai.towers.king}]; }
  }

  function applyDamageToEntity(target, dmg, sourceOwner){
    if(!target) return;
    if(target.type === "tower"){
      if(target.owner==="player") state.player.towers[target.key] = Math.max(0, state.player.towers[target.key] - dmg);
      else state.ai.towers[target.key] = Math.max(0, state.ai.towers[target.key] - dmg);
      if((target.owner==="player" && state.player.towers[target.key]<=0) || (target.owner==="ai" && state.ai.towers[target.key]<=0)){
        log(`${sourceOwner} destroyed ${target.owner}'s ${target.key} tower`);
      }
    } else { target.hp = Math.max(0, target.hp - dmg); }
  }

  function findTargets(ent){
    const enemies = state.entities.filter(e => e.owner !== ent.owner && e.lane === ent.lane && e.hp>0);
    const towers = getTowers(ent.owner==="player"?"ai":"player");
    const canTarget = (t)=>{
      if(ent.targeting === "air_ground") return true;
      if(ent.targeting === "ground") return !(t.special && t.special.includes("flying"));
      return true;
    };
    let candidates = enemies.filter(e=> canTarget(e));
    for(const t of towers) candidates.push({type:"tower", owner:t.owner, x:t.x, y:t.y, hp:t.hp, key:t.key});
    if(candidates.length===0) return null;
    if(ent.target_priority === "nearest"){ let best=null, bd=Infinity; for(const c of candidates){ const d=Math.abs(c.x - ent.x); if(d<bd){bd=d;best=c;} } return best; }
    else if(ent.target_priority === "lowest_hp"){ let best=null, bh=Infinity; for(const c of candidates){ if(c.hp < bh){bh=c.hp; best=c;} } return best; }
    else if(ent.target_priority === "building_first"){ let building = candidates.find(c=> c.type==="tower" || (cardData[c.defId] && cardData[c.defId].type==="building")); if(building) return building; return candidates.reduce((a,b)=> Math.abs(a.x-ent.x) < Math.abs(b.x-ent.x) ? a : b); }
    return candidates[0];
  }

  function tick(){
    if(state.result) return;
    state.tick++; state.time += DT;
    if(state.time >= 30 && state.phase === "normal"){ state.phase = "double"; state.elixirRateMultiplier = 2.0; log("Double elixir!"); }
    if(state.time >= 45 && state.phase === "double"){ state.phase = "triple"; state.elixirRateMultiplier = 3.0; log("Triple elixir!"); }
    if(state.time >= state.matchTime){ state.phase = "overtime"; state.elixirRateMultiplier = 2.0; }
    state.elixir = clamp(state.elixir + state.elixirBaseRate * state.elixirRateMultiplier * DT, 0, 10);

    if(state.tick % Math.round(TICK_RATE*0.4) === 0) aiAct();

    for(const e of state.entities){
      if(e.deployTimer > 0){ e.deployTimer--; continue; }
      if(e.lifetime != null){ e.lifetime--; }
      if(e._frozen && state.tick <= e._frozen){ /* frozen - no movement or attack */ }
      if(e.type === "troop" && !(e._frozen && state.tick <= e._frozen)){ e.x += e.vx; }
      e.atk_timer += DT;
      if(e.atk_timer >= e.atk_speed && !(e._frozen && state.tick <= e._frozen)){ e.atk_timer = 0; const target = findTargets(e); if(target){ const dx = Math.abs((target.x||target.x) - e.x); const d = dx; if(d <= e.range){ applyDamageToEntity(target, e.dmg, e.owner); } } }
    }

    for(let i=state.entities.length-1;i>=0;i--){ const e=state.entities[i]; if(e.hp <=0 || (e.lifetime!=null && e.lifetime<=0)) state.entities.splice(i,1); }

    if(state.player.towers.king <=0){ end("AI wins (king)"); return; }
    if(state.ai.towers.king <=0){ end("Player wins (king)"); return; }
    if(state.time >= state.matchTime + 20){ const pC=crownsDestroyed(state.ai.towers); const aC=crownsDestroyed(state.player.towers); if(pC > aC) end("Player wins by crowns"); else if(aC > pC) end("AI wins by crowns"); else end("Draw"); }
  }

  function crownsDestroyed(towers){ let c=0; if(towers.left<=0) c++; if(towers.right<=0) c++; if(towers.king<=0) c=3; return c; }
  function end(msg){ state.result = msg; log("Match end: "+msg); }

  function aiAct(){ const ai = state.ai; const rng = state.rngFunc; const playable = ai.hand.filter(id => (cardData[id]||{}).cost <= state.elixir); if(playable.length===0) return; let choice = playable[Math.floor(rng()*playable.length)]; if(playable.includes("giant") && rng() < 0.6) choice = "giant"; if(playable.includes("pekka") && state.time > 20 && rng() < 0.25) choice = "pekka"; const lane = (state.player.towers.left < state.player.towers.right) ? "top" : "bottom"; playCard("ai", choice, lane); }

  // Rendering
  const canvas = document.getElementById("game"); const ctx = canvas.getContext("2d");
  function render(){ ctx.clearRect(0,0,CANVAS_W,CANVAS_H); const grad = ctx.createLinearGradient(0,0,0,CANVAS_H); grad.addColorStop(0,"#9bd1ff"); grad.addColorStop(1,"#6ebcff"); ctx.fillStyle = grad; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.moveTo(CANVAS_W/2,0); ctx.lineTo(CANVAS_W/2,CANVAS_H); ctx.stroke(); drawTower(PLAYER_SIDE.towerX+220, LANE_Y.top, state.ai.towers.left, "AI L"); drawTower(PLAYER_SIDE.towerX+220, LANE_Y.bottom, state.ai.towers.right, "AI R"); drawTower(PLAYER_SIDE.towerX+0, LANE_Y.top, state.player.towers.left, "P L"); drawTower(PLAYER_SIDE.towerX+0, LANE_Y.bottom, state.player.towers.right, "P R"); drawTower(CANVAS_W/2, CANVAS_H/2, state.ai.towers.king, "AI KING", true); drawTower(CANVAS_W/2, CANVAS_H/2, state.player.towers.king, "P KING", true); for(const e of state.entities) drawEntity(e); document.getElementById("elixir").innerText = state.elixir.toFixed(1); document.getElementById("elixir-rate").innerText = (state.elixirBaseRate * state.elixirRateMultiplier).toFixed(2) + "/s"; document.getElementById("timer").innerText = formatTime(Math.max(0, Math.floor(state.matchTime - state.time))); const logEl = document.getElementById("log"); logEl.innerHTML = state.logs.slice(0,80).map(l=>"<div>"+escapeHtml(l)+"</div>").join(""); if(state.result){ ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(CANVAS_W/2-240, CANVAS_H/2-60, 480,120); ctx.fillStyle = "#fff"; ctx.font = "22px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(state.result, CANVAS_W/2, CANVAS_H/2+6); } requestAnimationFrame(render); }

  function drawTower(x,y,hp,label,king=false){ const w = king?120:60, h=44; ctx.fillStyle = king ? "#6b21a8" : "#ff6b6b"; ctx.fillRect(x-w/2, y-h/2, w, h); ctx.strokeStyle = "#000"; ctx.strokeRect(x-w/2, y-h/2, w, h); ctx.fillStyle = "black"; ctx.fillRect(x-w/2, y-h/2-10, w,6); ctx.fillStyle = "#00ff88"; ctx.fillRect(x-w/2, y-h/2-10, w * (hp / TOWER_HP), 6); ctx.fillStyle = "#fff"; ctx.font="12px Inter"; ctx.textAlign="center"; ctx.fillText(label + ' ' + Math.floor(hp), x, y-h/2-16); }

  function drawEntity(e){ ctx.save(); ctx.translate(e.x, e.y); const radius = 14; ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.fillStyle = e.owner==="player" ? "#0b84ff" : "#ff5f5f"; ctx.fill(); ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(-16,-22,32,5); ctx.fillStyle = "#00ff88"; ctx.fillRect(-16,-22,32 * (e.hp / e.maxHp), 5); ctx.fillStyle = "#fff"; ctx.font="10px Inter"; ctx.textAlign="center"; ctx.fillText((cardData[e.defId]||{}).name||e.defId, 0, 4); ctx.restore(); }

  function formatTime(s){ const mm=Math.floor(s/60).toString().padStart(2,'0'); const ss=Math.floor(s%60).toString().padStart(2,'0'); return mm+':'+ss; }
  function escapeHtml(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

  function buildDeckUI(){ const deckDiv = document.getElementById("deck"); deckDiv.innerHTML=''; state.player.hand.forEach(id=>{ const def = cardData[id] || {}; const el = document.createElement('div'); el.className='card rarity-'+(def.rarity||'common'); el.dataset.card=id; el.innerHTML = `<div class="title">${def.name||id} <span style="float:right;font-size:11px;color:#ffd">${def.cost||'?'}</span></div><div class="meta"><span>${def.type||'troop'}</span><span>${def.rarity||'common'}</span></div><div style="margin-top:6px;font-size:12px;color:#cfe">${def.hp||0}hp • ${def.dmg||0}dmg</div>`; el.onclick = ()=>{ document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected')); el.classList.add('selected'); state.selectedCard = id; }; deckDiv.appendChild(el); }); }

  function setupUI(){ document.getElementById('restart').onclick = ()=> initGame(state.seed); document.getElementById('apply-seed').onclick = ()=>{ const v = Number(document.getElementById('seed').value) || defaultSeed(); initGame(v); }; document.getElementById('seed').value = state.seed; canvas.onclick = (ev)=>{ if(state.result) return; if(!state.selectedCard){ log('Select a card first'); return; } const rect = canvas.getBoundingClientRect(); const y = ev.clientY - rect.top; const lane = (y < CANVAS_H/2) ? 'top' : 'bottom'; const played = playCard('player', state.selectedCard, lane); if(played){ state.selectedCard = null; document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected')); buildDeckUI(); } else log('Not enough elixir'); }; }

  function startTick(){ if(window._tick) clearInterval(window._tick); window._tick = setInterval(tick, 1000 / TICK_RATE); }

  function initGame(seed){ state = newGame(seed); document.getElementById('seed').value = state.seed; // ensure cardData loaded before building UI
    if(Object.keys(cardData).length===0){
      // wait briefly then init again
      setTimeout(()=>{ initGame(state.seed); }, 120);
      return;
    }
    buildDeckUI(); setupUI(); log('New match — seed '+state.seed); startTick(); }

  // start
  initGame(defaultSeed());
  requestAnimationFrame(render);

})();
