// Deck maker script: loads cards_pack.json, allows drag/drop and save to localStorage
const cardPoolEl = document.getElementById('cardPool');
const deckSlotsEl = document.getElementById('deckSlots');
let CARD_DATA = [];
let deck = [];

fetch('cards_pack.json').then(r=>r.json()).then(j=>{ CARD_DATA = j.cards || []; buildPool(); loadDeck(); renderSlots(); }).catch(e=>{ console.error(e); });

function buildPool(){
  cardPoolEl.innerHTML='';
  CARD_DATA.forEach(c=>{
    const el = document.createElement('div'); el.className='cardItem'; el.draggable=true;
    el.innerHTML = `<img src="icons/${c.id}.svg" alt="${c.name}"><div><strong>${c.name}</strong><div>${c.cost} • ${c.type}</div></div>`;
    el.addEventListener('dragstart', e=> e.dataTransfer.setData('text/plain', c.id));
    el.addEventListener('click', ()=> addToDeck(c.id));
    cardPoolEl.appendChild(el);
  });
}

function renderSlots(){
  deckSlotsEl.innerHTML='';
  for(let i=0;i<8;i++){
    const slot = document.createElement('div'); slot.className='deckSlot';
    if(deck[i]){ slot.innerHTML = `<img src="icons/${deck[i]}.svg" style="width:56px;height:56px">`; slot.addEventListener('click', ()=> { deck.splice(i,1); renderSlots(); }); }
    else { slot.textContent='+'; slot.addEventListener('dragover', e=> e.preventDefault()); slot.addEventListener('drop', e=> { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); deck[i]=id; renderSlots(); }); }
    deckSlotsEl.appendChild(slot);
  }
}

function addToDeck(id){ if(deck.length>=8){ alert('Deck full (8)'); return; } deck.push(id); renderSlots(); }
document.getElementById('btnSave').addEventListener('click', ()=> { localStorage.setItem('clashlite_deck', JSON.stringify(deck)); alert('Deck saved to browser.'); });
document.getElementById('btnClear').addEventListener('click', ()=> { deck=[]; renderSlots(); localStorage.removeItem('clashlite_deck'); });

function loadDeck(){ const d = localStorage.getItem('clashlite_deck'); if(d){ try{ deck = JSON.parse(d); }catch(e){ deck=[]; } } else { deck = CARD_DATA.slice(0,8).map(c=>c.id); } }
