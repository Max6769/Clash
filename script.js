// Roman Gladiator — simple, well-commented, dependency-free game logic.
document.addEventListener('DOMContentLoaded', ()=>{
// DOM references
const playerHpEl = document.getElementById('playerHp');
const enemyHpEl = document.getElementById('enemyHp');
const rollBtn = document.getElementById('rollBtn');
const attackBtn = document.getElementById('attackBtn');
const defendBtn = document.getElementById('defendBtn');
const newBtn = document.getElementById('newBtn');
const diceFace = document.getElementById('diceFace');
const events = document.getElementById('events');
const logBox = document.getElementById('log');


// Game state
let playerHp = 100;
let enemyHp = 100;
let lastRoll = null;
let defendMode = false;
let gameOver = false;


function updateUI(){
playerHpEl.textContent = playerHp;
enemyHpEl.textContent = enemyHp;
// enable actions only after a roll and if game not over
const ready = lastRoll !== null && !gameOver;
attackBtn.disabled = !ready;
defendBtn.disabled = !ready;
rollBtn.disabled = gameOver;
// small flash animation on hp elements
[playerHpEl, enemyHpEl].forEach(el=>{el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),420)});
}


function log(text){
const li = document.createElement('li');
li.textContent = text;
});