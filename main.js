// Mini Royale — simplified offline prototype
// Deterministic tick simulation, 2 lanes, towers, simple AI, 8-card deck
(() => {
  // --- Utilities ---
  function now(){ return performance.now(); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // Deterministic PRNG (LCG)
  function createRng(seed) {
    let s = seed >>> 0;
    return function() {
      s = (1664525*s + 1013904223) >>> 0;
      return s / 4294967296;
    }
  }

  // --- Game constants ---
  const TICK_RATE = 30; // ticks per second
  const TICK_DT = 1 / TICK_RATE;
  const CANVAS_W = 960, CANVAS_H = 400;
  const LANE_Y = {left: CANVAS_H*0.33, right: CANVAS_H*0.66};
  const PLAYER_SIDE = {x: 140, towerX: 80};
  const AI_SIDE = {x: 820, towerX: 880};
  const TOWER_HP = 2000;
  const KING_X = CANVAS_W/2;

  // --- Card definitions (small set) ---
  const CARD_DEFINITIONS = {
    "knight": {id:"knight", name:"Knight", type:"troop", cost:3, hp: 300, dmg:40, speed:70, range:20, targeting:"ground"},
    "archer": {id:"archer", name:"Archer", type:"troop", cost:3, hp:160, dmg:30, speed:90, range:140, targeting:"air_ground"},
    "goblin": {id:"goblin", name:"Goblin", type:"troop", cost:2, hp:120, dmg:35, speed:140, range:18, targeting:"ground"},
    "giant": {id:"giant", name:"Giant", type:"troop", cost:5, hp:900, dmg:80, speed:40, range:20, targeting:"building"},
    "cannon": {id:"cannon", name:"Cannon", type:"building", cost:3, hp:600, dmg:75, range:130, targeting:"ground", lifetime:60},
    "fireball": {id:"fireball", name:"Fireball", type:"spell", cost:4, dmg:180, radius:65},
    "skeleton": {id:"skeleton", name:"Skeleton", type:"troop", cost:1, hp:60, dmg:20, speed:120, range:12, targeting:"ground"},
    "miniPekka": {id:"miniPekka", name:"Mini P.", type:"troop", cost:4, hp:550, dmg:160, speed:60, range:18, targeting:"ground"},
  };

  // --- Game state ---
  let state = null;

  function defaultSeed(){ return Math.floor(Math.random()*4294967295); }

  function newGame(seed=null) {
    seed = seed == null ? defaultSeed() : seed;
    const rng = createRng(seed);
    const playerDeck = shuffleArray(Object.keys(CARD_DEFINITIONS), rng).slice(0,8);
    const aiDeck = shuffleArray(Object.keys(CARD_DEFINITIONS), rng).slice(0,8);
    return {
      seed,
      rng,
      tick:0,
      time:0,
      matchTime: 60, // seconds
      elixir: 5,
      elixirRate: 1/1.7, // per sec
      player: {
        deck: playerDeck,
        hand: playerDeck.slice(0,4),
        nextIdx:4,
        towers: {left:TOWER_HP, right:TOWER_HP, king:TOWER_HP},
        side:"left",
      },
      ai: {
        deck: aiDeck,
        hand: aiDeck.slice(0,4),
        nextIdx:4,
        towers: {left:TOWER_HP, right:TOWER_HP, king:TOWER_HP},
        lastPlay:0
      },
      entities: [], // troops/buildings
      events: [],
      logs: [],
      selectedCard: null,
      result: null,
      rngFunc: rng
    };
  }

  function shuffleArray(arr, rng){
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

  // --- Entity helpers ---
  let nextEntityId = 1;
  function spawnEntity(defId, owner, lane, x=null){
    const def = CARD_DEFINITIONS[defId];
    const id = nextEntityId++;
    const side = owner==="player" ? PLAYER_SIDE : AI_SIDE;
    const posX = x != null ? x : side.x;
    const posY = lane==="left" ? LANE_Y.left : LANE_Y.right;
    const ent = {
      id, defId, owner, lane, type: def.type, hp: def.hp, maxHp:def.hp,
      x: posX, y: posY, vx: (owner==="player"?1:-1)* (def.speed||0) / TICK_RATE,
      dmg: def.dmg||0, range: def.range||20, targeting: def.targeting||"ground",
      lifetime: def.lifetime? def.lifetime*TICK_RATE : null,
      createdTick: state.tick,
    };
    state.entities.push(ent);
    return ent;
  }

  // --- Core simulation ---
  function gameTick() {
    if(state.result) return;
    state.tick++;
    state.time += TICK_DT;
    // Elixir regen
    state.elixir = clamp(state.elixir + state.elixirRate * TICK_DT, 0, 10);

    // AI simple play: try to play something occasionally
    aiBehavior();

    // Update entities: movement, lifetime
    for(let ent of state.entities){
      if(ent.type === "troop"){
        ent.x += ent.vx;
      }
      if(ent.lifetime != null){
        ent.lifetime--;
      }
    }
    // Combat: very simple nearest target within range
    for(let ent of state.entities.slice()){
      if(ent.hp<=0) continue;
      if(ent.type==="troop" || ent.type==="building"){
        // find target
        const targets = state.entities.filter(e => e.owner !== ent.owner && e.lane === ent.lane && e.hp>0);
        // include towers as targets if in range horizontally
        const enemyTowers = getEnemyTowers(ent.owner);
        let nearest = null;
        let nearestDist = Infinity;
        for(let t of targets){
          const dx = Math.abs(t.x - ent.x);
          const dy = Math.abs(t.y - ent.y);
          const d = Math.sqrt(dx*dx+dy*dy);
          if(d < nearestDist) { nearest = t; nearestDist = d; }
        }
        for(let tw of enemyTowers){
          const dx = Math.abs(tw.x - ent.x);
          const d = dx;
          if(d < nearestDist){ nearest = tw; nearestDist = d; }
        }
        if(nearest && nearestDist <= ent.range){
          // attack
          if(ent.type!=="building" || (ent.type==="building" && ent.owner!=="player")) {
            // buildings can attack too in this prototype
          }
          // apply damage per tick (dmg * dt * cadence)
          // simplified: damage applied as ent.dmg every 0.6s
          const cadence = 0.6;
          const since = (state.tick - ent.createdTick) * TICK_DT;
          // use a local attack timer stored on ent
          ent._attackTimer = (ent._attackTimer || 0) + TICK_DT;
          if(ent._attackTimer >= cadence){
            ent._attackTimer = 0;
            applyDamageToTarget(nearest, ent.dmg, ent.owner);
          }
        }
      }
    }

    // Remove dead entities
    for(let i=state.entities.length-1;i>=0;i--){
      const e = state.entities[i];
      if(e.hp <= 0 || (e.lifetime != null && e.lifetime <=0)){
        state.entities.splice(i,1);
      }
    }

    // Check towers HP and result
    if(state.player.towers.king <= 0){
      endGame("AI wins (king down)");
    } else if(state.ai.towers.king <=0){
      endGame("Player wins (king down)");
    } else if(state.time >= state.matchTime){
      // compare crowns (destroyed towers)
      const pCrowns = countCrowns(state.ai.towers);
      const aiCrowns = countCrowns(state.player.towers);
      if(pCrowns > aiCrowns) endGame("Player wins by crowns");
      else if(aiCrowns > pCrowns) endGame("AI wins by crowns");
      else endGame("Draw");
    }
  }

  function countCrowns(towers){
    let crowns = 0;
    if(towers.left <=0) crowns++;
    if(towers.right <=0) crowns++;
    if(towers.king <=0) crowns=3;
    return crowns;
  }

  function applyDamageToTarget(target, dmg, sourceOwner){
    if(!target) return;
    if(target.type === "tower"){
      // reduce tower hp
      target.hp = Math.max(0, target.hp - dmg);
      if(target.hp<=0){
        log(`${sourceOwner} destroyed a tower!`);
      }
      // reflect to state
      if(target.owner === "player") state.player.towers[target.key] = target.hp;
      else state.ai.towers[target.key] = target.hp;
    } else {
      target.hp = Math.max(0, target.hp - dmg);
    }
  }

  function getEnemyTowers(owner){
    const arr=[];
    if(owner==="player"){
      // enemy is AI
      arr.push({type:"tower", owner:"ai", x:AI_SIDE.towerX-220, y:LANE_Y.left, hp: state.ai.towers.left, key:"left"});
      arr.push({type:"tower", owner:"ai", x:AI_SIDE.towerX-220, y:LANE_Y.right, hp: state.ai.towers.right, key:"right"});
      arr.push({type:"tower", owner:"ai", x:KING_X, y:(CANVAS_H/2), hp: state.ai.towers.king, key:"king"});
    } else {
      arr.push({type:"tower", owner:"player", x:PLAYER_SIDE.towerX+220, y:LANE_Y.left, hp: state.player.towers.left, key:"left"});
      arr.push({type:"tower", owner:"player", x:PLAYER_SIDE.towerX+220, y:LANE_Y.right, hp: state.player.towers.right, key:"right"});
      arr.push({type:"tower", owner:"player", x:KING_X, y:(CANVAS_H/2), hp: state.player.towers.king, key:"king"});
    }
    return arr;
  }

  function endGame(msg){
    state.result = msg;
    log("Match end: " + msg);
  }

  // --- AI behavior (simple) ---
  function aiBehavior(){
    const ai = state.ai;
    if(state.tick % Math.floor(TICK_RATE*0.5) !== 0) return; // only act twice a second
    // choose a random playable card with rng
    const rng = state.rngFunc;
    const playable = ai.hand.filter(id => CARD_DEFINITIONS[id].cost <= state.elixir);
    if(playable.length === 0) return;
    // bias toward playing win conditions (giant)
    let choice;
    if(playable.includes("giant") && rng() < 0.6) choice = "giant";
    else choice = playable[Math.floor(rng()*playable.length)];
    // pick lane where player's nearest tower has lower hp
    const lane = (state.player.towers.left < state.player.towers.right) ? "left" : "right";
    playCardFor("ai", choice, lane);
  }

  // --- Player actions ---
  function playCardFor(side, cardId, lane, clickX=null){
    const def = CARD_DEFINITIONS[cardId];
    if(!def) return false;
    if(def.cost > state.elixir) return false;
    // consume elixir and spawn
    state.elixir = Math.max(0, state.elixir - def.cost);
    if(def.type === "spell"){
      // simple instant AOE at target lane center
      const cx = (side==="player") ? (KING_X - 120) : (KING_X + 120);
      const cy = (lane==="left") ? LANE_Y.left : LANE_Y.right;
      // apply damage to entities and towers in radius
      for(let e of state.entities){
        const dx = e.x - cx; const dy = e.y - cy;
        if(Math.hypot(dx,dy) <= def.radius) {
          e.hp = Math.max(0, e.hp - def.dmg);
        }
      }
      // towers
      const enemyTowers = getEnemyTowers(side==="player"?"player":"ai");
      for(let tw of enemyTowers){
        const dx = tw.x - cx;
        const dy = tw.y - cy;
        if(Math.hypot(dx,dy) <= def.radius){
          if(tw.owner === "player"){
            state.player.towers[tw.key] = Math.max(0, state.player.towers[tw.key] - def.dmg);
          } else {
            state.ai.towers[tw.key] = Math.max(0, state.ai.towers[tw.key] - def.dmg);
          }
        }
      }
      log(`${side} cast ${def.name} on ${lane}`);
    } else if(def.type === "building"){
      const x = side==="player" ? PLAYER_SIDE.x + 80 : AI_SIDE.x - 80;
      spawnEntity(cardId, side, lane, x);
      log(`${side} placed ${def.name} on ${lane}`);
    } else {
      const startX = side==="player"? PLAYER_SIDE.x : AI_SIDE.x;
      spawnEntity(cardId, side, lane, startX);
      log(`${side} spawned ${def.name} on ${lane}`);
    }

    // draw next card for that player's hand if exists
    let deckObj = side==="player"? state.player : state.ai;
    if(deckObj.nextIdx < deckObj.deck.length){
      deckObj.hand.push(deckObj.deck[deckObj.nextIdx]);
      deckObj.nextIdx++;
      if(deckObj.hand.length>8) deckObj.hand.shift();
    } else {
      // cycle deck - simple reshuffle using rng
      deckObj.deck = shuffleArray(deckObj.deck, state.rngFunc);
      deckObj.nextIdx = 0;
    }
    return true;
  }

  // --- Rendering ---
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  function render(){
    // clear
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    // draw lanes
    ctx.fillStyle = "#4aa3ff33";
    ctx.fillRect(0,0,CANVAS_W, CANVAS_H);
    // arena center line
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath(); ctx.moveTo(KING_X, 0); ctx.lineTo(KING_X, CANVAS_H); ctx.stroke();

    // towers
    drawTower(PLAYER_SIDE.towerX+220, LANE_Y.left, state.ai.towers.left, "AI L");
    drawTower(PLAYER_SIDE.towerX+220, LANE_Y.right, state.ai.towers.right, "AI R");
    drawTower(PLAYER_SIDE.towerX+0, LANE_Y.left, state.player.towers.left, "P L");
    drawTower(PLAYER_SIDE.towerX+0, LANE_Y.right, state.player.towers.right, "P R");
    drawTower(KING_X, CANVAS_H/2, state.ai.towers.king, "AI King", true);
    drawTower(KING_X, CANVAS_H/2, state.player.towers.king, "P King", true);

    // entities
    for(let e of state.entities){
      drawEntity(e);
    }

    // HUD overlays
    document.getElementById("elixir").innerText = state.elixir.toFixed(1);
    document.getElementById("timer").innerText = formatTime(Math.max(0, state.matchTime - Math.floor(state.time)));
    // logs
    const logEl = document.getElementById("log");
    logEl.innerHTML = state.logs.slice(0,50).map(l=>"<div>"+escapeHtml(l)+"</div>").join("");
    if(state.result){
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(CANVAS_W/2-200, CANVAS_H/2-40, 400,80);
      ctx.fillStyle = "#fff";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.result, CANVAS_W/2, CANVAS_H/2+6);
    }
  }

  function drawTower(x,y,hp,label,king=false){
    const w = king?60:40;
    const h = 40;
    ctx.fillStyle = king ? "#7d3cff" : "#ff6b6b";
    ctx.fillRect(x-w/2, y-h/2, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(x-w/2+4, y-h/2+20, w-8, 8);
    // hp bar
    ctx.fillStyle = "black";
    ctx.fillRect(x-w/2, y-h/2-8, w,6);
    ctx.fillStyle = "lime";
    ctx.fillRect(x-w/2, y-h/2-8, w * (hp / TOWER_HP), 6);
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label + " " + Math.floor(hp), x, y-h/2-12);
  }

  function drawEntity(e){
    ctx.save();
    ctx.translate(e.x, e.y);
    // body
    ctx.beginPath();
    ctx.arc(0,0,12,0,Math.PI*2);
    ctx.fillStyle = e.owner==="player" ? "#085fff" : "#ff5252";
    ctx.fill();
    // hp bar
    ctx.fillStyle = "black";
    ctx.fillRect(-14, -22, 28, 5);
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(-14, -22, 28 * (e.hp / e.maxHp), 5);
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(CARD_DEFINITIONS[e.defId].name.slice(0,3), 0, 4);
    ctx.restore();
  }

  function formatTime(s){
    const mm = Math.floor(s/60).toString().padStart(2,"0");
    const ss = Math.floor(s%60).toString().padStart(2,"0");
    return mm + ":" + ss;
  }

  function escapeHtml(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  // --- UI Wiring ---
  function buildDeckUI(){
    const deckDiv = document.getElementById("deck");
    deckDiv.innerHTML = "";
    state.player.hand.forEach((id, idx) => {
      const def = CARD_DEFINITIONS[id];
      const el = document.createElement("div");
      el.className = "card";
      el.dataset.card = id;
      el.innerHTML = `<div class="name">${def.name}</div><div class="cost">${def.cost}</div>`;
      el.onclick = () => {
        document.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
        el.classList.add("selected");
        state.selectedCard = id;
      };
      deckDiv.appendChild(el);
    });
  }

  function setupUI(){
    document.getElementById("restart").onclick = ()=>initGame(state.seed);
    document.getElementById("set-seed").onclick = ()=>{
      const val = Number(document.getElementById("seed").value) || defaultSeed();
      initGame(val);
    };
    document.getElementById("seed").value = state.seed;
    canvas.onclick = (ev)=>{
      if(state.result) return;
      if(!state.selectedCard) {
        log("Select a card from your deck first.");
        return;
      }
      // determine lane by y
      const rect = canvas.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const lane = (y < CANVAS_H/2) ? "left" : "right";
      const played = playCardFor("player", state.selectedCard, lane);
      if(played){
        // consume card visually
        state.selectedCard = null;
        document.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
        buildDeckUI();
      } else {
        log("Not enough elixir!");
      }
    };
  }

  // --- Main loop and init ---
  let lastRender = 0;
  function loop(ts){
    // tick catchup
    const maxSteps = 4;
    let steps = 0;
    // using setInterval tick; render will run via requestAnimationFrame
    render();
    requestAnimationFrame(loop);
  }

  function startTickInterval(){
    if(window._tickInterval) clearInterval(window._tickInterval);
    window._tickInterval = setInterval(()=>{ gameTick(); }, 1000 / TICK_RATE);
  }

  function initGame(seed){
    state = newGame(seed);
    nextEntityId = 1;
    document.getElementById("seed").value = state.seed;
    buildDeckUI();
    setupUI();
    log("New match started. Seed: " + state.seed);
    startTickInterval();
  }

  // Start
  initGame(defaultSeed());
  requestAnimationFrame(loop);
})();
