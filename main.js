/* Mini Royale v3 - main.js (trimmed for prototype) */
(function(){
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function createRng(seed){ let s = seed >>> 0; return function(){ s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; } }

  const TICK_RATE = 30, DT = 1/TICK_RATE, CANVAS_W=1100, CANVAS_H=560;
  const LANE_Y = {top: CANVAS_H*0.30, bottom: CANVAS_H*0.70};
  const PLAYER_SIDE = {x:190, towerX:140}, AI_SIDE={x:910,towerX:960};
  const TOWER_HP = 3600, MATCH_TIME = 60;

  const cardsJson = JSON.parse(document.querySelector('script[type="application/json"]').textContent);
  const cardData = {}; cardsJson.cards.forEach(c=> cardData[c.id]=c);

  // minimal audio
  let audioEnabled = true;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  function beep(freq,dur){ if(!audioCtx||!audioEnabled) return; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.frequency.value=freq; g.gain.value=0.08; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur); }

  let profile = {gold:2000,gems:80,collection:{}};
  for(const id in cardData) profile.collection[id] = {level:1,owned:1};

  let state = null;
  function defaultSeed(){ return Math.floor(Math.random()*4294967295); }

  function newGame(seed=null){
    seed = seed==null? defaultSeed() : seed;
    const rng = createRng(seed);
    const allIds = Object.keys(cardData);
    const playerDeck = shuffle(allIds,rng).slice(0,8);
    const aiDeck = shuffle(allIds,rng).slice(0,8);
    return {seed, rng, tick:0, time:0, matchTime:MATCH_TIME, elixir:5, elixirBaseRate:1/1.7, elixirRateMultiplier:1.0, phase:'normal', player:{deck:playerDeck,hand:playerDeck.slice(0,4),nextIdx:4,towers:{left:TOWER_HP,right:TOWER_HP,king:TOWER_HP}}, ai:{deck:aiDeck,hand:aiDeck.slice(0,4),nextIdx:4,towers:{left:TOWER_HP,right:TOWER_HP,king:TOWER_HP}}, entities:[], logs:[], selectedCard:null, result:null, rngFunc:rng, nextEntityId:1, replayEvents:[] };
  }

  function shuffle(a,rng){ const b=a.slice(); for(let i=b.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [b[i],b[j]]=[b[j],b[i]];} return b; }

  function log(msg){ if(!state) return; state.logs.unshift(msg); if(state.logs.length>200) state.logs.pop(); document.getElementById('log').innerHTML = state.logs.slice(0,100).map(x=>'<div>'+x+'</div>').join(''); }

  function spawnEntity(defId, owner, lane, x=null){
    const def = cardData[defId]; const id = state.nextEntityId++; const side = owner==='player'?PLAYER_SIDE:AI_SIDE; const posX = x!=null?x:side.x; const posY = lane==='top'?LANE_Y.top:LANE_Y.bottom; const facing = owner==='player'?1:-1;
    const level = profile.collection[defId]?profile.collection[defId].level:1;
    const hp = Math.round(def.hp * (1 + (level-1)*0.06));
    const dmg = Math.round((def.dmg||0) * (1 + (level-1)*0.05));
    const ent = {id, defId, owner, lane, type:def.type, hp, maxHp:hp, x:posX, y:posY, vx: facing*(def.move_speed||60)/TICK_RATE, dmg, range:def.range||20, targeting:def.target||'ground', target_priority:def.target_priority||'nearest', atk_speed:def.atk_speed||1, atk_timer:0, lifetime:def.lifetime?def.lifetime*TICK_RATE:null, created:state.tick, special:def.special||[], radius:def.radius||0, deployTime:def.deploy_time||0, deployTimer:0, level};
    state.entities.push(ent); state.replayEvents.push({t:state.time,e:'spawn',owner,defId,lane,x:posX}); beep(600,0.04); return ent;
  }

  function playCard(side, cardId, lane){
    const def = cardData[cardId]; if(!def) return false; if(def.cost > state.elixir) return false; state.elixir = clamp(state.elixir - def.cost, 0, 10);
    if(def.type==='spell'){
      const cx = (side==='player')? (CANVAS_W/2 - 160) : (CANVAS_W/2 + 160); const cy = lane==='top'? LANE_Y.top : LANE_Y.bottom;
      if(def.special && def.special.includes('area_damage')){ for(const e of state.entities){ const dx=e.x-cx, dy=e.y-cy; if(Math.hypot(dx,dy)<=def.radius){ e.hp=Math.max(0,e.hp-def.dmg); } } const enemy = getTowers(side==='player'?'ai':'player'); for(const t of enemy){ const dx=t.x-cx; if(Math.abs(dx) <= def.radius){ if(t.owner==='player') state.player.towers[t.key]=Math.max(0,state.player.towers[t.key]-def.dmg); else state.ai.towers[t.key]=Math.max(0,state.ai.towers[t.key]-def.dmg); } } log(side+' cast '+def.name); state.replayEvents.push({t:state.time,e:'spell',owner:side,spell:cardId,lane}); beep(320,0.12); }
      if(def.special && def.special.includes('freeze')){ for(const e of state.entities){ if(e.owner!==side && e.lane===lane){ e._frozen = state.tick + Math.round(def.lifetime*TICK_RATE); } } log(side+' cast Freeze'); }
    } else if(def.type==='building'){ const x = side==='player'? PLAYER_SIDE.x+120 : AI_SIDE.x-120; spawnEntity(cardId, side, lane, x); log(side+' placed '+def.name); state.replayEvents.push({t:state.time,e:'play',owner:side,card:cardId,lane}); }
    else { const startX = side==='player'? PLAYER_SIDE.x : AI_SIDE.x; const ent = spawnEntity(cardId, side, lane, startX); ent.deployTimer = ent.deployTime?Math.round(ent.deployTime*TICK_RATE):0; log(side+' spawned '+def.name); state.replayEvents.push({t:state.time,e:'play',owner:side,card:cardId,lane}); }
    const deckObj = side==='player'? state.player : state.ai; if(deckObj.nextIdx < deckObj.deck.length){ deckObj.hand.push(deckObj.deck[deckObj.nextIdx]); deckObj.nextIdx++; if(deckObj.hand.length>8) deckObj.hand.shift(); } else { deckObj.deck = shuffle(deckObj.deck, state.rngFunc); deckObj.nextIdx=0; } updateDeckUI(); return true;
  }

  function getTowers(side){ if(side==='player') return [{type:'tower',owner:'player',key:'left',x:PLAYER_SIDE.towerX+260,y:LANE_Y.top,hp:state.player.towers.left},{type:'tower',owner:'player',key:'right',x:PLAYER_SIDE.towerX+260,y:LANE_Y.bottom,hp:state.player.towers.right},{type:'tower',owner:'player',key:'king',x:CANVAS_W/2,y:CANVAS_H/2,hp:state.player.towers.king}]; else return [{type:'tower',owner:'ai',key:'left',x:AI_SIDE.towerX-260,y:LANE_Y.top,hp:state.ai.towers.left},{type:'tower',owner:'ai',key:'right',x:AI_SIDE.towerX-260,y:LANE_Y.bottom,hp:state.ai.towers.right},{type:'tower',owner:'ai',key:'king',x:CANVAS_W/2,y:CANVAS_H/2,hp:state.ai.towers.king}]; }

  function applyDamageToEntity(target,dmg,source){ if(!target) return; if(target.type==='tower'){ if(target.owner==='player') state.player.towers[target.key] = Math.max(0,state.player.towers[target.key]-dmg); else state.ai.towers[target.key] = Math.max(0,state.ai.towers[target.key]-dmg); if((target.owner==='player' && state.player.towers[target.key]<=0) || (target.owner==='ai' && state.ai.towers[target.key]<=0)){ log(source+' destroyed '+target.owner+"'s " + target.key + ' tower'); state.replayEvents.push({t:state.time,e:'destroy',owner:source,target:target.key}); beep(200,0.14); } } else { target.hp = Math.max(0,target.hp-dmg); if(target.hp<=0){ if(target._spawnOnDeath){ spawnEntity(target._spawnOnDeath, target.owner, target.lane, target.x); } state.replayEvents.push({t:state.time,e:'death',id:target.id,defId:target.defId}); beep(120,0.06); } else { beep(900,0.02); } } }

  function findTargets(ent){ const enemies = state.entities.filter(e=> e.owner!==ent.owner && e.lane===ent.lane && e.hp>0); const towers = getTowers(ent.owner==='player'?'ai':'player'); const canTarget = (t)=>{ if(ent.targeting==='air_ground') return true; if(ent.targeting==='ground') return !(t.special && t.special.includes('flying')); return true; }; let candidates = enemies.filter(e=> canTarget(e)); for(const t of towers) candidates.push({type:'tower',owner:t.owner,x:t.x,y:t.y,hp:t.hp,key:t.key}); if(candidates.length===0) return null; if(ent.target_priority==='nearest'){ let best=null,bd=Infinity; for(const c of candidates){ const d=Math.abs(c.x-ent.x); if(d<bd){bd=d;best=c;} } return best; } else if(ent.target_priority==='lowest_hp'){ let best=null,bh=Infinity; for(const c of candidates){ if(c.hp < bh){ bh=c.hp; best=c;} } return best; } return candidates[0]; }

  function aiAct(){ const ai = state.ai; const rng = state.rngFunc; const playable = ai.hand.filter(id => (cardData[id]||{}).cost <= state.elixir); if(playable.length===0) return; let best=playable[0], bestScore=-Infinity; for(const c of playable){ const lane = (state.player.towers.left < state.player.towers.right)? 'top':'bottom'; const score = simulatePlayAndScore('ai', c, lane, 6); if(score>bestScore){ bestScore=score; best=c; } } const lane = (state.player.towers.left < state.player.towers.right)? 'top':'bottom'; playCard('ai', best, lane); }

  function simulatePlayAndScore(side, cardId, lane, ticks){ const def = cardData[cardId]; let score = 0; if(def.type==='troop'){ if(def.target && def.target==='building') score += def.dmg*0.8; score += def.cost*0.5; } else if(def.type==='spell'){ score += def.dmg*0.6; } score += (state.rngFunc()*0.2); return score; }

  function tick(){ if(!state || state.result) return; state.tick++; state.time+=DT; if(state.time>=30 && state.phase==='normal'){ state.phase='double'; state.elixirRateMultiplier=2.0; log('Double elixir!'); } if(state.time>=45 && state.phase==='double'){ state.phase='triple'; state.elixirRateMultiplier=3.0; log('Triple elixir!'); } if(state.time>=state.matchTime){ state.phase='overtime'; state.elixirRateMultiplier=2.0; } state.elixir = clamp(state.elixir + state.elixirBaseRate * state.elixirRateMultiplier * DT, 0, 10); if(state.tick % Math.round(TICK_RATE*0.45) === 0) aiAct(); for(const e of state.entities){ if(e.deployTimer>0){ e.deployTimer--; continue; } if(e.lifetime!=null){ e.lifetime--; } if(e._frozen && state.tick <= e._frozen) continue; if(e._stunned && state.tick <= e._stunned) continue; if(e.type==='troop') e.x += e.vx; e.atk_timer += DT; if(e.atk_timer >= e.atk_speed && !(e._frozen && state.tick <= e._frozen) && !(e._stunned && state.tick <= e._stunned)){ e.atk_timer = 0; const target = findTargets(e); if(target){ const dx = Math.abs((target.x||target.x) - e.x); if(dx <= e.range){ applyDamageToEntity(target, e.dmg, e.owner); } } } } for(let i=state.entities.length-1;i>=0;i--){ const e=state.entities[i]; if(e.hp<=0 || (e.lifetime!=null && e.lifetime<=0)) state.entities.splice(i,1); } if(state.player.towers.king<=0){ end('AI wins (king)'); return; } if(state.ai.towers.king<=0){ end('Player wins (king)'); return; } if(state.time >= state.matchTime + 20){ const pC = crownsDestroyed(state.ai.towers); const aC = crownsDestroyed(state.player.towers); if(pC>aC) end('Player wins by crowns'); else if(aC>pC) end('AI wins by crowns'); else end('Draw'); } }

  function crownsDestroyed(t){ let c=0; if(t.left<=0) c++; if(t.right<=0) c++; if(t.king<=0) c=3; return c; }
  function end(msg){ state.result=msg; log('Match end: '+msg); profile.gold += 200; }

  // rendering
  const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d');
  function render(){ if(!state) return; ctx.clearRect(0,0,CANVAS_W,CANVAS_H); const grad = ctx.createLinearGradient(0,0,0,CANVAS_H); grad.addColorStop(0,'#9bd1ff'); grad.addColorStop(1,'#6ebcff'); ctx.fillStyle = grad; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(CANVAS_W/2,0); ctx.lineTo(CANVAS_W/2,CANVAS_H); ctx.stroke(); drawTower(PLAYER_SIDE.towerX+260, LANE_Y.top, state.ai.towers.left, 'AI L'); drawTower(PLAYER_SIDE.towerX+260, LANE_Y.bottom, state.ai.towers.right, 'AI R'); drawTower(PLAYER_SIDE.towerX+0, LANE_Y.top, state.player.towers.left, 'P L'); drawTower(PLAYER_SIDE.towerX+0, LANE_Y.bottom, state.player.towers.right, 'P R'); drawTower(CANVAS_W/2, CANVAS_H/2, state.ai.towers.king, 'AI KING', true); drawTower(CANVAS_W/2, CANVAS_H/2, state.player.towers.king, 'P KING', true); for(const e of state.entities) drawEntity(e); document.getElementById('elixir').innerText = state.elixir.toFixed(1); document.getElementById('phase').innerText = state.phase; requestAnimationFrame(render); }

  function drawTower(x,y,hp,label,king=false){ const w=king?140:72,h=52; ctx.fillStyle=king? '#6b21a8':'#ff6b6b'; ctx.fillRect(x-w/2,y-h/2,w,h); ctx.strokeStyle='#000'; ctx.strokeRect(x-w/2,y-h/2,w,h); ctx.fillStyle='black'; ctx.fillRect(x-w/2,y-h/2-12,w,8); ctx.fillStyle='#00ff88'; ctx.fillRect(x-w/2,y-h/2-12, w*(hp/TOWER_HP),8); ctx.fillStyle='#fff'; ctx.font='12px Inter'; ctx.textAlign='center'; ctx.fillText(label+' '+Math.floor(hp), x, y-h/2-18); }

  function drawEntity(e){ ctx.save(); ctx.translate(e.x,e.y); const r=16 + Math.min(10, Math.floor((e.level-1)/2)); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle = e.owner==='player'? '#0b84ff' : '#ff5f5f'; if(e._frozen) ctx.fillStyle='#9bd1ff'; ctx.fill(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(-20,-28,40,6); ctx.fillStyle='#00ff88'; ctx.fillRect(-20,-28,40*(e.hp/e.maxHp),6); ctx.fillStyle='#fff'; ctx.font='10px Inter'; ctx.textAlign='center'; ctx.fillText((cardData[e.defId]||{}).name||e.defId,0,6); ctx.restore(); }

  // UI decks and interactions
  function updateDeckUI(){ const deck=document.getElementById('deck'); deck.innerHTML=''; if(!state) return; state.player.hand.forEach(id=>{ const def=cardData[id]; const el=document.createElement('div'); el.className='card'; el.dataset.card=id; el.innerHTML='<div class="title">'+def.name+' <span style="float:right">'+def.cost+'</span></div><div class="meta"><span>'+def.type+'</span><span>'+def.rarity+'</span></div>'; el.onclick=()=>{ document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected')); el.classList.add('selected'); state.selectedCard=id; }; deck.appendChild(el); }); }

  // start game and tick
  document.getElementById('restart').onclick = ()=>{ const s = Number(document.getElementById('seed').value) || null; initGame(s); };
  document.getElementById('export-replay').onclick = ()=>{ if(!state) return; const blob = new Blob([JSON.stringify({seed:state.seed, events:state.replayEvents}, null, 2)], {type:'application/json'}); const a=document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'replay_'+state.seed+'.json'; a.click(); };

  canvas.onclick = (ev)=>{ if(!state || state.result) return; if(!state.selectedCard){ log('Select a card first'); return; } const rect=canvas.getBoundingClientRect(); const y = ev.clientY-rect.top; const lane = (y < CANVAS_H/2)? 'top':'bottom'; const played = playCard('player', state.selectedCard, lane); if(played){ state.selectedCard=null; document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected')); updateDeckUI(); } else { log('Not enough elixir'); } };

  // matchmaking sim
  document.getElementById('run-sim').onclick = ()=>{ const n = Number(document.getElementById('sim-count').value)||50; document.getElementById('sim-results').innerText = 'Running '+n+' matches...'; setTimeout(()=>{ const res={p:0,a:0,d:0}; for(let i=0;i<n;i++){ const r = runHeadlessMatch(defaultSeed()+i); if(r==='player') res.p++; else if(r==='ai') res.a++; else res.d++; } document.getElementById('sim-results').innerText='Done. Player:'+res.p+' AI:'+res.a+' Draw:'+res.d; }, 50); };

  function runHeadlessMatch(seed){ const rng = createRng(seed); const allIds = Object.keys(cardData); const pDeck = shuffle(allIds,rng).slice(0,8); const aDeck = shuffle(allIds,rng).slice(0,8); let pT={left:TOWER_HP,right:TOWER_HP,king:TOWER_HP}, aT={left:TOWER_HP,right:TOWER_HP,king:TOWER_HP}; for(let t=0;t<60;t++){ if(rng()<0.04) aT.left -= 180; if(rng()<0.03) pT.right -= 160; if(aT.king<=0) return 'ai'; if(pT.king<=0) return 'player'; } const pC = (aT.left<=0?1:0)+(aT.right<=0?1:0); const aC = (pT.left<=0?1:0)+(pT.right<=0?1:0); if(pC>aC) return 'player'; if(aC>pC) return 'ai'; return 'draw'; }

  // replay viewer logic (separate canvas)
  const replayFile = document.getElementById('replay-file'); replayFile.onchange = (ev)=>{ const f = ev.target.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = ()=>{ window._loadedReplay = JSON.parse(reader.result); document.getElementById('replay-log').innerText = 'Loaded replay seed: '+window._loadedReplay.seed; }; reader.readAsText(f); };
  document.getElementById('load-sample').onclick = ()=>{ window._loadedReplay = {seed: state.seed, events: state.replayEvents}; document.getElementById('replay-log').innerText = 'Loaded sample replay'; };
  document.getElementById('play-replay').onclick = ()=>{ if(!window._loadedReplay) return alert('Load replay first'); playReplay(window._loadedReplay); };

  function playReplay(replay){ const canvasR = document.getElementById('replay-canvas'); const rctx = canvasR.getContext('2d'); rctx.clearRect(0,0,canvasR.width,canvasR.height); const events = replay.events.slice(); let t=0; const ents=[]; function step(){ rctx.clearRect(0,0,canvasR.width,canvasR.height); rctx.fillStyle='#9bd1ff'; rctx.fillRect(0,0,canvasR.width,canvasR.height); rctx.strokeStyle='rgba(0,0,0,0.06)'; rctx.beginPath(); rctx.moveTo(canvasR.width/2,0); rctx.lineTo(canvasR.width/2,canvasR.height); rctx.stroke(); while(events.length && events[0].t <= t){ const e = events.shift(); if(e.e==='spawn'){ ents.push({defId:e.defId,x:e.x,y:e.lane==='top'? LANE_Y.top: LANE_Y.bottom}); } } for(const p of ents){ rctx.fillStyle='#0b84ff'; rctx.beginPath(); rctx.arc(p.x,p.y,12,0,Math.PI*2); rctx.fill(); rctx.fillStyle='#fff'; rctx.fillText(p.defId, p.x-10, p.y+4); } t+=0.2; if(events.length) requestAnimationFrame(step); } step(); }

  // tabs
  document.getElementById('tab-game').onclick = ()=>{ document.getElementById('panel-game').style.display='block'; document.getElementById('panel-replay').style.display='none'; document.getElementById('panel-match').style.display='none'; };
  document.getElementById('tab-replay').onclick = ()=>{ document.getElementById('panel-game').style.display='none'; document.getElementById('panel-replay').style.display='block'; document.getElementById('panel-match').style.display='none'; };
  document.getElementById('tab-match').onclick = ()=>{ document.getElementById('panel-game').style.display='none'; document.getElementById('panel-replay').style.display='none'; document.getElementById('panel-match').style.display='block'; };

  // unity starter download (provided in zip)
  document.getElementById('download-unity').onclick = ()=>{ fetch('unity-starter.zip').then(r=> r.blob()).then(b=>{ const a=document.createElement('a'); a.href = URL.createObjectURL(b); a.download='unity-starter.zip'; a.click(); }); };

  // init
  function initGame(seed){ state = newGame(seed); document.getElementById('seed').value = state.seed; updateDeckUI(); log('Match started seed:'+state.seed); if(window._tick) clearInterval(window._tick); window._tick = setInterval(tick, 1000/TICK_RATE); requestAnimationFrame(render); }

  // start initial match
  initGame(null);

})();
