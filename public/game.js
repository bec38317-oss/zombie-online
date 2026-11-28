const socket = io(window.location.origin, {
  transports: ['polling', 'websocket']
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const lightCanvas = document.createElement('canvas');
const lctx = lightCanvas.getContext('2d');

let viewW = window.innerWidth;
let viewH = window.innerHeight;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;

  canvas.width = viewW * dpr;
  canvas.height = viewH * dpr;
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  lightCanvas.width = viewW;
  lightCanvas.height = viewH;
}
window.addEventListener('resize', resize);
resize();

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'shoot') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.start(now); osc.stop(now + 0.12);
  } else if (type === 'melee') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'dash') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.18);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.start(now); osc.stop(now + 0.18);
  } else if (type === 'reload') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.setValueAtTime(640, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
    osc.start(now); osc.stop(now + 0.16);
  } else if (type === 'pickup' || type === 'heal' || type === 'consume') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now); osc.stop(now + 0.15);
  } else if (type === 'bite') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.linearRampToValueAtTime(55, now + 0.4);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  }
}

let myId = null;
let mapSize = 6000;
let buildings = [];
let terrain = { rivers: [], mountains: [], forests: [], caves: [] };
let world = {
  worldTime: 0.28,
  players: {},
  zombies: [],
  bullets: [],
  loot: [],
  woodDrops: [],
  barricades: [],
  acidPools: [],
  leaderboard: []
};

const bloodDecals = [];
const particles = [];
const floatingTexts = [];
const shockwaves = [];
const zombieSlashes = [];
const droppedMags = [];
let screenShake = 0;

const keys = {};
let mouse = { x: 0, y: 0, down: false };
let oneShotAction = { reload: false, interact: false, useItem: null, slot: null, skill: false };
const chatInput = document.getElementById('chatInput');

socket.on('roomList', (list) => {
  const container = document.getElementById('roomList');
  if (list.length === 0) {
    container.innerHTML = '<div style="color:#777; padding:14px; text-align:center;">가동 중인 서버가 없습니다.<br/>왼쪽에서 새 서버를 개설하세요!</div>';
    return;
  }
  container.innerHTML = '';
  list.forEach(r => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `
      <div>
        <strong style="color:#f3f4f6;">${r.name}</strong><br/>
        <small style="color:#9ca3af;">생존자: ${r.playerCount}/${r.maxPlayers}명 · 좀비 주기: ${r.spawnInterval}초</small>
      </div>
      <button onclick="joinSelectedRoom('${r.id}')">합류</button>
    `;
    container.appendChild(div);
  });
});

document.getElementById('createBtn').onclick = () => {
  if (!socket.connected) return alert('서버 연결 중입니다. 2초 후 다시 클릭하세요.');
  const nickname = document.getElementById('nickname').value.trim() || '생존자' + Math.floor(Math.random() * 99);
  const roomName = document.getElementById('roomName').value.trim();
  const spawnInterval = document.getElementById('spawnInterval').value;
  const maxPlayers = document.getElementById('maxPlayers').value;
  socket.emit('createRoom', { roomName, nickname, spawnInterval, maxPlayers });
};

window.joinSelectedRoom = (roomId) => {
  if (!socket.connected) return alert('서버 연결 중입니다.');
  const nickname = document.getElementById('nickname').value.trim() || '생존자' + Math.floor(Math.random() * 99);
  socket.emit('joinRoom', { roomId, nickname });
};

socket.on('joinRejected', (msg) => alert(msg));

socket.on('joinedRoom', (data) => {
  myId = data.playerId;
  mapSize = data.mapSize;
  buildings = data.buildings;
  terrain = data.terrain || { rivers: [], mountains: [], forests: [], caves: [] };
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
});

socket.on('worldState', (state) => {
  world = state;
  updateHUD();
});

socket.on('sfx', (type) => playSound(type));
socket.on('statusNotice', (msg) => showToast(msg));

socket.on('chatBroadcast', ({ sender, isMutant, text }) => {
  const box = document.getElementById('chatMessages');
  const line = document.createElement('div');
  line.className = isMutant ? 'chat-line mutant' : 'chat-line';
  line.innerHTML = `<b>${sender}:</b> ${text.replace(/</g, '&lt;')}`;
  box.appendChild(line);
  if (box.children.length > 30) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
});

socket.on('infectionChoicePrompt', ({ mutantName, mutantHp, passiveDesc, skillName }) => {
  document.getElementById('biteOverlay').classList.add('hidden');
  document.getElementById('mutationDesc').innerHTML =
    `<b style="color:#f87171;">${mutantName}</b> (체력 ${mutantHp})로 변이합니다!<br/>` +
    `<span style="color:#fbbf24;">[패시브]</span> ${passiveDesc}<br/>` +
    `<span style="color:#38bdf8;">[고유 스킬]</span> ${skillName}<br/><br/>` +
    `이대로 변칙 좀비가 되어 생존자를 공격하시겠습니까?`;
  document.getElementById('mutationModal').classList.remove('hidden');
});

document.getElementById('btnBecomeMutant').onclick = () => {
  document.getElementById('mutationModal').classList.add('hidden');
  socket.emit('resolveInfectionChoice', 'mutant');
};

document.getElementById('btnLeaveServer').onclick = () => {
  document.getElementById('mutationModal').classList.add('hidden');
  socket.emit('resolveInfectionChoice', 'leave');
};

socket.on('becameMutant', ({ name, passiveDesc, skillName }) => {
  showToast(`🧟 '${name}' 변이 완료! [E/Shift] ${skillName}`);
  document.getElementById('armorDisplay').textContent = `🧬 패시브: ${passiveDesc}`;
  document.getElementById('controlsHelp').innerHTML =
    `<b>WASD</b> 이동 · <b>E / Shift</b> ${skillName} (쿨 8초) · <b>좌클릭</b> 공격 · <b>Enter</b> 채팅`;
  document.getElementById('slotBar').classList.add('hidden');
  document.getElementById('stamRow').classList.add('hidden');
  document.getElementById('foodRow').classList.add('hidden');
  document.getElementById('waterRow').classList.add('hidden');
});

socket.on('playerDamaged', () => {
  screenShake = 11;
  const flash = document.getElementById('damageFlash');
  flash.style.opacity = '1';
  setTimeout(() => { flash.style.opacity = '0'; }, 160);
});

socket.on('killFeed', (msg) => {
  const feed = document.getElementById('killFeed');
  const el = document.createElement('div');
  el.className = 'feed-msg';
  el.textContent = msg;
  feed.prepend(el);
  if (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => el.remove(), 7000);
});

socket.on('fxEvent', (ev) => {
  const me = world.players[myId];
  const dist = me ? Math.hypot(ev.x - me.x, ev.y - me.y) : 9999;

  if (ev.type === 'shoot') {
    if (dist < 1100) playSound('shoot');
    if (dist < 600) screenShake = Math.max(screenShake, 4);
    for (let i = 0; i < 6; i++) {
      const a = ev.angle + (Math.random() - 0.5) * 0.7;
      const spd = 4 + Math.random() * 7;
      particles.push({ x: ev.x + Math.cos(ev.angle)*26, y: ev.y + Math.sin(ev.angle)*26, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 12, color: '#fde047', size: 3 });
    }
  } else if (ev.type === 'melee') {
    if (dist < 700) playSound('melee');
  } else if (ev.type === 'zombieSlash') {
    if (dist < 750) playSound('melee');
    zombieSlashes.push({
      x: ev.x,
      y: ev.y,
      angle: ev.angle,
      range: ev.range || 42,
      color: ev.color || '#ef4444',
      claws: ev.claws || 3,
      life: 14,
      maxLife: 14
    });
  } else if (ev.type === 'magDrop') {
    droppedMags.push({
      x: ev.x + Math.cos(ev.angle + 0.6) * 14,
      y: ev.y + Math.sin(ev.angle + 0.6) * 14,
      vx: Math.cos(ev.angle + 1.5) * 3.2,
      vy: Math.sin(ev.angle + 1.5) * 3.2,
      angle: ev.angle + Math.random(),
      life: 140
    });
  } else if (ev.type === 'woodBuild') {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.5;
      particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 18, color: '#d97706', size: 4 });
    }
  } else if (ev.type === 'woodHit' || ev.type === 'woodBreak') {
    if (dist < 850) playSound('melee');
    const count = ev.type === 'woodBreak' ? 20 : 8;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 20, color: '#b45309', size: 4 });
    }
    if (ev.dmg) {
      floatingTexts.push({ x: ev.x, y: ev.y - 22, text: `-${ev.dmg}`, life: 28, color: '#fbbf24' });
    }
  } else if (ev.type === 'dash') {
    if (dist < 800) playSound('dash');
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.5;
      particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 16, color: '#ef4444', size: 4 });
    }
  } else if (ev.type === 'shockwave') {
    if (dist < 900) { playSound('dash'); screenShake = Math.max(screenShake, 9); }
    shockwaves.push({ x: ev.x, y: ev.y, r: 10, maxR: 185, color: ev.color || '#ef4444', alpha: 0.9 });
  } else if (ev.type === 'blood') {
    bloodDecals.push({ x: ev.x + (Math.random()-0.5)*18, y: ev.y + (Math.random()-0.5)*18, r: 8 + Math.random()*12, alpha: 0.78 });
    if (bloodDecals.length > 200) bloodDecals.shift();
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 18, color: '#b91c1c', size: 3.5 });
    }
    floatingTexts.push({ x: ev.x, y: ev.y - 20, text: `-${ev.dmg}`, life: 32, color: ev.killerId === myId ? '#fbbf24' : '#f87171' });
  } else if (ev.type === 'explosion') {
    if (dist < 1200) { playSound('bite'); screenShake = 18; }
    shockwaves.push({ x: ev.x, y: ev.y, r: 15, maxR: 175, color: '#f97316', alpha: 1 });
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 11;
      particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 28, color: i%2===0 ? '#f97316' : '#dc2626', size: 6 });
    }
  }
});

socket.on('kickedByInfection', (msg) => { alert(msg); location.reload(); });
socket.on('kickedAndBanned', (msg) => { alert(msg); location.reload(); });

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.activeElement === chatInput) {
      if (chatInput.value.trim()) socket.emit('chatMessage', chatInput.value.trim());
      chatInput.value = '';
      chatInput.blur();
    } else if (myId) {
      chatInput.focus();
    }
    return;
  }
  if (document.activeElement === chatInput) return;

  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === '1') oneShotAction.slot = 'melee';
  if (k === '2') oneShotAction.slot = 'ranged';
  if (k === '3') oneShotAction.useItem = 'food';
  if (k === '4') oneShotAction.useItem = 'water';
  if (k === '5') oneShotAction.useItem = 'medkit';
  if (k === '6') oneShotAction.slot = 'build';
  if (k === 'r') oneShotAction.reload = true;
  if (k === 'f') oneShotAction.interact = true;
  if (k === 'e') oneShotAction.skill = true;
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', (e) => {
  if (document.activeElement === chatInput) return;
  if (e.button === 0) mouse.down = true;
  if (e.button === 2) oneShotAction.skill = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

setInterval(() => {
  if (!myId || !world.players[myId]) return;
  let dx = 0, dy = 0;
  if (document.activeElement !== chatInput) {
    if (keys['w']) dy -= 1;
    if (keys['s']) dy += 1;
    if (keys['a']) dx -= 1;
    if (keys['d']) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  }

  const angle = Math.atan2(mouse.y - viewH / 2, mouse.x - viewW / 2);
  socket.emit('playerInput', {
    dx, dy,
    sprint: document.activeElement !== chatInput && !!keys['shift'],
    angle,
    attack: document.activeElement !== chatInput && mouse.down,
    ...oneShotAction
  });
  oneShotAction = { reload: false, interact: false, useItem: null, slot: null, skill: false };
}, 50);

function updateHUD() {
  const me = world.players[myId];
  if (!me) return;

  const hpPct = Math.max(0, Math.min(100, (me.hp / (me.maxHp || 100)) * 100));
  document.getElementById('hpBar').style.width = hpPct + '%';
  document.getElementById('hpVal').textContent = Math.ceil(me.hp);

  if (!me.isPlayerMutant) {
    document.getElementById('stamBar').style.width = me.stamina + '%';
    document.getElementById('foodBar').style.width = me.hunger + '%';
    document.getElementById('waterBar').style.width = me.thirst + '%';

    document.getElementById('stamVal').textContent = Math.ceil(me.stamina);
    document.getElementById('foodVal').textContent = Math.ceil(me.hunger);
    document.getElementById('waterVal').textContent = Math.ceil(me.thirst);

    document.getElementById('armorDisplay').textContent = me.armor
      ? `🛡️ 방어구: ${me.armor.name} (피해감소 ${Math.round(me.armor.reduce * 100)}%)`
      : `🛡️ 방어구: 없음 (피해감소 0%)`;

    document.getElementById('slot1Name').textContent = me.melee.name;
    document.getElementById('slot2Name').textContent = me.ranged
      ? (me.reloading ? `장전 중... (${Math.round((me.reloadProgress || 0) * 100)}%)` : `${me.ranged.name} (${me.ranged.currentMag}/${me.reserveAmmo})`)
      : `미장착 (탄약:${me.reserveAmmo})`;

    document.getElementById('slot1').classList.toggle('active', me.activeSlot === 'melee');
    document.getElementById('slot2').classList.toggle('active', me.activeSlot === 'ranged');
    document.getElementById('slot6').classList.toggle('active', me.activeSlot === 'build');

    document.getElementById('foodCnt').textContent = me.inv.food;
    document.getElementById('waterCnt').textContent = me.inv.water;
    document.getElementById('medCnt').textContent = me.inv.medkit;
    document.getElementById('woodCnt').textContent = me.wood || 0;
  }

  document.getElementById('coordDisplay').textContent = `좌표: ${Math.floor(me.x)}, ${Math.floor(me.y)} | 점수: ${Math.floor(me.score)} | 사살: ${me.kills}`;
  const hour = Math.floor(world.worldTime * 24);
  const isNight = hour >= 19 || hour <= 5;
  document.getElementById('timeDisplay').textContent = `${isNight ? '🌙 심야' : '☀️ 주간'} ${String(hour).padStart(2,'0')}:00`;

  if (world.leaderboard) {
    const rankList = document.getElementById('rankingList');
    rankList.innerHTML = world.leaderboard.map((r, idx) =>
      `<div class="rank-row ${r.id === myId ? 'me' : ''}">
        <span>${idx + 1}. ${r.isMutant ? '🧟' : ''}${r.nickname}</span>
        <span>${r.score}점</span>
      </div>`
    ).join('');
  }

  const biteEl = document.getElementById('biteOverlay');
  if (me.bitten && !me.pendingMutation) {
    biteEl.classList.remove('hidden');
    document.getElementById('biteTimerText').textContent =
      `☣️ 좀비에게 물렸습니다! 발병 판정까지 ${Math.max(0, me.biteTimer).toFixed(1)}초`;
  } else {
    biteEl.classList.add('hidden');
  }
}

// 현실적으로 구분되는 6종 건물 렌더링
function drawBuilding(b, me, now) {
  const inside = me.x > b.x && me.x < b.x + b.w && me.y > b.y && me.y < b.y + b.h;

  // 건물 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(b.x + 12, b.y + 12, b.w, b.h);

  // 바닥/지붕 베이스
  if (inside) {
    ctx.fillStyle = '#232724';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // 실내 가구 디테일
    ctx.fillStyle = '#3f3a34';
    ctx.fillRect(b.x + 28, b.y + 28, 70, 30);
    ctx.fillRect(b.x + b.w - 98, b.y + b.h - 58, 70, 30);
    ctx.fillStyle = b.type === '종합병원' ? '#0284c7' : '#334155';
    ctx.fillRect(b.x + b.w / 2 - 42, b.y + b.h / 2 - 20, 84, 40);
  } else {
    if (b.type === '종합병원') {
      // 흰 타일 옥상 + 적십자 + 헬기장(H) + 구급차
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(b.x + 76, b.y + 62, 24, 84);
      ctx.fillRect(b.x + 46, b.y + 92, 84, 24);
      const hx = b.x + b.w - 90, hy = b.y + b.h / 2;
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(hx, hy, 54, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(hx, hy, 45, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#facc15'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('H', hx, hy + 12);
    } else if (b.type === '경찰서') {
      // 짙은 네이비 지붕 + POLICE + 점멸 적청 경광등
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(b.x + 14, b.y + 14, b.w - 28, 26);
      ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('POLICE', b.x + b.w / 2, b.y + b.h / 2 + 10);
      const blink = Math.floor(now * 0.006) % 2 === 0;
      ctx.fillStyle = blink ? '#ef4444' : '#3b82f6';
      ctx.beginPath(); ctx.arc(b.x + 36, b.y + b.h - 28, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#3b82f6' : '#ef4444';
      ctx.beginPath(); ctx.arc(b.x + b.w - 36, b.y + b.h - 28, 9, 0, Math.PI * 2); ctx.fill();
    } else if (b.type === '24시 편의점') {
      // 유리 채광창 + 주황/초록 줄무늬 어닝
      ctx.fillStyle = '#334155';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#7dd3fc';
      for (let k = 0; k < 3; k++) ctx.fillRect(b.x + 36 + k * 92, b.y + 42, 64, 46);
      const stripes = 12, sw = b.w / stripes;
      for (let k = 0; k < stripes; k++) {
        ctx.fillStyle = k % 3 === 0 ? '#f97316' : k % 3 === 1 ? '#16a34a' : '#f8fafc';
        ctx.fillRect(b.x + k * sw, b.y + b.h - 24, sw + 0.5, 24);
      }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('24H MART', b.x + b.w / 2, b.y + 150);
    } else if (b.type === '총포상') {
      // 골함석 지붕 + 노랑/검정 위험선 + 과녁
      ctx.fillStyle = '#292524';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = k % 2 === 0 ? '#facc15' : '#18181b';
        ctx.fillRect(b.x + k * (b.w / 10), b.y + b.h - 14, b.w / 10, 14);
      }
      const cx = b.x + 76, cy = b.y + 115;
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GUNS', b.x + b.w * 0.62, b.y + 124);
    } else if (b.type === '주유소') {
      // 빨강/노랑 주유소 캐노피 + 옆면 정비소
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(b.x, b.y, b.w * 0.56, b.h);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(b.x + 10, b.y + 10, b.w * 0.56 - 20, b.h - 20);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(b.x + 20, b.y + 20, b.w * 0.56 - 40, b.h - 40);
      ctx.fillStyle = '#fef08a'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('OIL / GAS', b.x + b.w * 0.28, b.y + b.h / 2 + 8);
      ctx.fillStyle = '#57534e';
      ctx.fillRect(b.x + b.w * 0.58, b.y + 14, b.w * 0.42 - 14, b.h - 28);
      ctx.fillStyle = '#e7e5e4'; ctx.font = 'bold 16px sans-serif';
      ctx.fillText('정비소', b.x + b.w * 0.78, b.y + b.h / 2 + 6);
    } else {
      // 주거 아파트: 초록 우레탄 옥상 방수 + 옥탑방 + 파란 물탱크 2기
      ctx.fillStyle = '#64748b';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#15803d';
      ctx.fillRect(b.x + 20, b.y + 20, b.w - 40, b.h - 40);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(b.x + 40, b.y + 44, 100, 80);
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = '#2563eb';
        ctx.beginPath(); ctx.arc(b.x + b.w - 75 - k * 68, b.y + 88, 25, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
  }

  // 건물 외벽 및 출입구
  ctx.fillStyle = '#57534e';
  b.walls.forEach(w => ctx.fillRect(w.x, w.y, w.w, w.h));

  // 건물 간판 배지
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(b.x + 12, b.y - 24, 110, 20);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`[${b.type}]`, b.x + 18, b.y - 10);
}

// 거리 나무 더미 렌더링
function drawWoodDrop(w, now) {
  ctx.save();
  ctx.translate(w.x, w.y + Math.sin(now * 0.005 + w.id) * 2.5);

  ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();

  ctx.rotate(w.angle || 0);
  const cols = ['#a16207', '#b45309', '#92400e'];
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = cols[i + 1];
    ctx.fillRect(-16, i * 6 - 3, 32, 5.5);
    ctx.strokeStyle = '#451a03'; ctx.lineWidth = 1;
    ctx.strokeRect(-16, i * 6 - 3, 32, 5.5);
  }
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(-7, -10, 3, 20);
  ctx.fillRect(5, -10, 3, 20);

  ctx.rotate(-(w.angle || 0));
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🪵 나무', 0, -18);
  ctx.restore();
}

// 설치된 바리케이드(체력 50) 및 설치 미리보기 렌더링
function drawBarricades(me) {
  (world.barricades || []).forEach(bar => {
    ctx.save();
    ctx.translate(bar.x, bar.y);
    ctx.rotate(bar.angle);

    const hw = bar.w / 2, hh = bar.h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-hw + 4, -hh + 4, bar.w, bar.h);

    ctx.fillStyle = '#92400e';
    ctx.fillRect(-hw, -hh, bar.w, bar.h);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-hw + 3, -hh + 3, bar.w - 6, 5);
    ctx.fillRect(-hw + 3, 2, bar.w - 6, 5);

    ctx.strokeStyle = '#451a03'; ctx.lineWidth = 2.5;
    ctx.strokeRect(-hw, -hh, bar.w, bar.h);

    const ratio = Math.max(0, bar.hp / (bar.maxHp || 50));
    if (ratio < 0.7) {
      ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -hh); ctx.lineTo(-6, 0); ctx.lineTo(-12, hh); ctx.stroke();
    }
    if (ratio < 0.4) {
      ctx.beginPath(); ctx.moveTo(16, -hh); ctx.lineTo(8, 2); ctx.lineTo(20, hh); ctx.stroke();
    }
    ctx.restore();

    // 바리케이드 체력바 (최대 50)
    const bw = 56, bh = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bar.x - bw / 2, bar.y - 26, bw, bh);
    ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(bar.x - bw / 2 + 1, bar.y - 25, (bw - 2) * ratio, bh - 2);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(bar.hp)}/50`, bar.x, bar.y - 30);
  });

  // [6]번 바리케이드 슬롯 선택 시 전방 설치 위치 미리보기
  if (me && !me.isPlayerMutant && me.activeSlot === 'build') {
    const px = me.x + Math.cos(me.angle) * 66;
    const py = me.y + Math.sin(me.angle) * 66;
    const pAng = me.angle + Math.PI / 2;
    const valid = (me.wood || 0) > 0;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(pAng);
    ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)';
    ctx.strokeStyle = valid ? '#4ade80' : '#f87171';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(-43, -10, 86, 20);
    ctx.strokeRect(-43, -10, 86, 20);
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// 바닥 드롭 물품 아이콘 (갑옷 5종, 총기 5종, 근접 10종 각각 구분)
function drawLootItem(item, time) {
  ctx.save();
  ctx.translate(item.x, item.y);

  const pulse = 1 + Math.sin(time * 0.006 + item.id) * 0.12;
  const ringColor =
    item.category === 'armor' ? 'rgba(168, 85, 247, 0.35)' :
    item.category === 'ammo' ? 'rgba(250, 204, 21, 0.25)' :
    item.category === 'medkit' ? 'rgba(244, 63, 94, 0.25)' :
    item.category === 'food' || item.category === 'water' ? 'rgba(52, 211, 153, 0.25)' :
    'rgba(56, 189, 248, 0.25)';

  ctx.fillStyle = ringColor;
  ctx.beginPath();
  ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
  ctx.fill();

  if (item.category === 'armor') {
    const aCol =
      item.armorId === 'leather' ? '#92400e' :
      item.armorId === 'police' ? '#1d4ed8' :
      item.armorId === 'military' ? '#4d7c0f' :
      item.armorId === 'specops' ? '#18181b' : '#dc2626';
    ctx.fillStyle = aCol;
    ctx.beginPath();
    ctx.moveTo(-9, -10); ctx.lineTo(-4, -10); ctx.lineTo(-2, -6);
    ctx.lineTo(2, -6); ctx.lineTo(4, -10); ctx.lineTo(9, -10);
    ctx.lineTo(11, 9); ctx.lineTo(-11, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (item.category === 'food') {
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-9, -10, 18, 20);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-9, -4, 18, 8);
  } else if (item.category === 'water') {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-6, -7, 12, 17);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(-6, -2, 12, 6);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(-3, -11, 6, 4);
  } else if (item.category === 'medkit') {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-11, -8, 22, 16);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-2.5, -5, 5, 10);
    ctx.fillRect(-5, -2.5, 10, 5);
  } else if (item.category === 'ammo') {
    ctx.fillStyle = '#3f6212';
    ctx.fillRect(-10, -8, 20, 16);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-6, -4, 3, 8);
    ctx.fillRect(-1.5, -4, 3, 8);
    ctx.fillRect(3, -4, 3, 8);
  } else if (item.category === 'melee') {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = item.weaponId === 'chainsaw' ? '#f59e0b' : '#cbd5e1';
    ctx.fillRect(-14, -2.5, 22, 5);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-16, -3, 6, 6);
    if (item.weaponId === 'fireaxe' || item.weaponId === 'sledge') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(3, -7, 6, 14);
    }
    ctx.restore();
  } else if (item.category === 'ranged') {
    ctx.save();
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = item.weaponId === 'shotgun' ? '#78350f' : '#1e293b';
    ctx.fillRect(-14, -3, 28, 5);
    ctx.fillRect(-10, 1, 5, 8);
    if (item.weaponId === 'sniper') {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-6, -6, 12, 2.5);
    }
    ctx.restore();
  }

  ctx.fillStyle = item.category === 'armor' ? '#e9d5ff' : '#f8fafc';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(item.name, 0, -18);

  ctx.restore();
}

// 플레이어 렌더링: 갑옷 5종 외형 + 총기 5종 외형 + 장전 모션 + 근접무기 10종 외형
function drawSurvivor(p, isMe, now) {
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.ellipse(4, 6, 20, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  // 저격소총 레이저 조준선
  if (p.activeSlot === 'ranged' && p.ranged && p.ranged.id === 'sniper' && !p.reloading) {
    ctx.save();
    ctx.rotate(p.angle);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(42, 0); ctx.lineTo(480, 0); ctx.stroke();
    ctx.restore();
  }

  ctx.rotate(p.angle);

  // 근접 무기 휘두르기 궤적
  if (p.activeSlot === 'melee' && p.swingAnim > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${p.swingAnim * 0.78})`;
    ctx.lineWidth = 11 * p.swingAnim;
    ctx.beginPath();
    ctx.arc(0, 0, p.melee.range * 0.85, -0.95, 0.95);
    ctx.stroke();
    ctx.restore();
  }

  // 장전 모션 계산 (R키 진행률 p.reloadProgress: 0 -> 1)
  let reloadTilt = 0;
  let leftHandX = 18, leftHandY = -7;
  let holdingFreshMag = false;
  let slideRackOffset = 0;

  if (p.reloading && p.activeSlot === 'ranged' && p.ranged) {
    const rp = p.reloadProgress || 0;
    reloadTilt = Math.sin(rp * Math.PI) * 0.55;
    if (p.ranged.shellReload) {
      const cyc = (rp * 4) % 1;
      leftHandX = 8 + Math.sin(cyc * Math.PI) * 14;
      leftHandY = -16 + Math.sin(cyc * Math.PI) * 13;
      holdingFreshMag = cyc < 0.7;
    } else if (rp < 0.35) {
      const t = rp / 0.35;
      leftHandX = 18 - t * 14;
      leftHandY = -7 - t * 12;
    } else if (rp < 0.72) {
      const t = (rp - 0.35) / 0.37;
      leftHandX = 4 + t * 14;
      leftHandY = -19 + t * 15;
      holdingFreshMag = true;
    } else {
      const t = Math.sin(((rp - 0.72) / 0.28) * Math.PI);
      leftHandX = 18 - t * 7;
      leftHandY = -4;
      slideRackOffset = -t * 5;
    }
  }

  const swingAngle = p.swingAnim > 0 ? Math.sin(p.swingAnim * Math.PI) * 1.15 : 0;
  ctx.save();
  ctx.rotate(swingAngle + reloadTilt);

  // [총기 5종 각각의 고유 외형]
  if (p.activeSlot === 'ranged' && p.ranged) {
    const rid = p.ranged.id;
    if (rid === 'pistol') {
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, -3, 18, 6);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(12 + slideRackOffset, -2.5, 13, 5);
    } else if (rid === 'shotgun') {
      ctx.fillStyle = '#78350f'; // 나무 개머리판
      ctx.fillRect(4, -3.5, 14, 7);
      ctx.fillStyle = '#1e293b'; // 총열
      ctx.fillRect(16, -2.5, 22, 5);
      ctx.fillStyle = '#92400e'; // 펌프 손잡이
      ctx.fillRect(22 + slideRackOffset, -4, 9, 8);
    } else if (rid === 'smg') {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(10, -3.5, 22, 7);
      ctx.fillStyle = '#475569'; // 소음기
      ctx.fillRect(32, -2.5, 9, 5);
      ctx.fillStyle = '#09090b'; // 탄창
      ctx.fillRect(19, 3, 5, 8);
    } else if (rid === 'ar') {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, -3.5, 30, 7);
      ctx.fillStyle = '#475569'; // 피카티니 레일
      ctx.fillRect(14, -2, 16, 4);
      ctx.fillStyle = '#0f172a'; // 곡선 탄창
      ctx.fillRect(20 + slideRackOffset, 3, 6, 9);
    } else if (rid === 'sniper') {
      ctx.fillStyle = '#3f6212'; // 국방색 바디
      ctx.fillRect(6, -3.5, 24, 7);
      ctx.fillStyle = '#0f172a'; // 초장거리 총열 & 소염기
      ctx.fillRect(30, -2, 18, 4);
      ctx.fillStyle = '#0284c7'; // 대형 스코프
      ctx.fillRect(14, -6, 14, 3);
    }

    if (p.muzzleFlash > 0) {
      const mLen = rid === 'sniper' ? 48 : rid === 'ar' ? 38 : 30;
      ctx.fillStyle = `rgba(253, 224, 71, ${p.muzzleFlash})`;
      ctx.beginPath();
      ctx.arc(mLen, 0, 14 * p.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.activeSlot === 'melee' && p.melee.id !== 'fist') {
    // [근접무기 10종 각각의 고유 외형]
    const mid = p.melee.id;
    if (mid === 'knife') {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(28, 0); ctx.lineTo(12, 2); ctx.closePath(); ctx.fill();
    } else if (mid === 'bat') {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(36, -4.5); ctx.lineTo(36, 4.5); ctx.lineTo(12, 2); ctx.closePath(); ctx.fill();
    } else if (mid === 'pipe') {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(12, -3, 26, 6);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.arc(36, 0, 5, 0, Math.PI * 2); ctx.fill(); // 빨간 밸브
    } else if (mid === 'crowbar') {
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(34, 0); ctx.lineTo(38, -6); ctx.stroke();
    } else if (mid === 'machete') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(12, -3.5, 28, 7);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(12, -3.5, 28, 2);
    } else if (mid === 'fireaxe') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(12, -2.5, 28, 5);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.moveTo(32, -2); ctx.lineTo(40, -11); ctx.lineTo(40, 6); ctx.lineTo(32, 2); ctx.closePath(); ctx.fill();
    } else if (mid === 'sledge') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(12, -2.5, 26, 5);
      ctx.fillStyle = '#334155';
      ctx.fillRect(32, -10, 10, 20);
    } else if (mid === 'katana') {
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(30, -3, 46, -7); ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(13, -5, 3, 10); // 코등이
    } else if (mid === 'chainsaw') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(10, -6, 14, 12); // 엔진 본체
      ctx.fillStyle = '#64748b';
      ctx.fillRect(24, -3.5, 20, 7); // 톱날 가이드
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.strokeRect(24, -4, 20, 8);
      ctx.setLineDash([]);
    }
  }

  // 장전 중 왼손에 든 새 탄창/탄피
  if (holdingFreshMag) {
    ctx.fillStyle = p.ranged && p.ranged.shellReload ? '#ef4444' : '#fbbf24';
    ctx.fillRect(leftHandX - 3, leftHandY - 4, 6, 8);
  }

  // 양손 렌더링
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath();
  ctx.arc(14, 9, 5, 0, Math.PI * 2);
  ctx.arc(leftHandX, leftHandY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 배낭
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(-19, -11, 8, 22);

  // [갑옷 5종 각각의 고유 외형 렌더링]
  const armorId = p.armor ? p.armor.id : 'none';
  if (armorId === 'none') {
    ctx.fillStyle = isMe ? '#1d4ed8' : '#15803d';
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
  } else if (armorId === 'leather') {
    ctx.fillStyle = '#78350f';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(2, -14, 3, 3); ctx.fillRect(2, 11, 3, 3);
  } else if (armorId === 'police') {
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#facc15'; // 경찰 배지
    ctx.beginPath(); ctx.arc(6, -8, 3, 0, Math.PI * 2); ctx.fill();
  } else if (armorId === 'military') {
    ctx.fillStyle = '#3f6212';
    ctx.fillRect(-13, -19, 24, 38);
    ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2; ctx.strokeRect(-13, -19, 24, 38);
    ctx.fillStyle = '#1a2e05'; // 탄창 파우치
    ctx.fillRect(4, -12, 5, 6); ctx.fillRect(4, -3, 5, 6); ctx.fillRect(4, 6, 5, 6);
  } else if (armorId === 'specops') {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-14, -20, 26, 40);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5; ctx.strokeRect(-14, -20, 26, 40);
    ctx.fillStyle = '#334155'; // 어깨 보호대
    ctx.fillRect(-8, -22, 12, 5); ctx.fillRect(-8, 17, 12, 5);
  } else if (armorId === 'juggernaut') {
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(-16, -23, 30, 46);
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.strokeRect(-16, -23, 30, 46);
    ctx.fillStyle = '#facc15'; // 중장갑 위험 줄무늬 어깨패드
    ctx.fillRect(-10, -25, 16, 6); ctx.fillRect(-10, 19, 16, 6);
  }

  // 머리 (특수부대/저거너트는 전용 헬멧 바이저 표시)
  ctx.fillStyle = armorId === 'juggernaut' ? '#991b1b' : armorId === 'specops' ? '#09090b' : (isMe ? '#60a5fa' : '#4ade80');
  ctx.beginPath();
  ctx.arc(2, 0, armorId === 'juggernaut' ? 12.5 : 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (armorId === 'specops' || armorId === 'juggernaut') {
    ctx.fillStyle = armorId === 'specops' ? '#22c55e' : '#38bdf8';
    ctx.fillRect(8, -6, 4, 12); // 야간투시경/방탄 바이저
  }

  ctx.restore();

  // 장전 진행 게이지 바
  if (p.reloading) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(p.x - 22, p.y - 42, 44, 5);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(p.x - 21, p.y - 41, 42 * (p.reloadProgress || 0), 3);
  }

  ctx.fillStyle = p.bitten ? '#ff3333' : '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.bitten ? `☣️[감염] ${p.nickname}` : p.nickname, p.x, p.y - 28);
}

// 일반 좀비 3종 + 더욱 기괴해진 변칙 좀비 5종 + 공격 모션 렌더링
function drawZombie(z, time) {
  ctx.save();
  ctx.translate(z.x, z.y);

  if (z.type === 'STALKER') ctx.globalAlpha = 0.56;

  if (z.isDashing) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, z.radius + 14, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.beginPath();
  ctx.arc(4, 6, z.radius + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(z.angle || 0);

  // 공격 예비동작(windup: 뒤로 젖힘) 및 타격 모션(strikeAnim: 앞으로 내뻗음) 계산
  const windupPull = (z.windup || 0) * -9;
  const strikeLunge = (z.strikeAnim || 0) * 16;
  const armReach = windupPull + strikeLunge;
  const armSpread = (z.windup || 0) * 8 - (z.strikeAnim || 0) * 6;

  if (z.isMutant) {
    const pulse = Math.sin(time * 0.01 + (z.id || 1)) * 4;

    // 1. 등 뒤에서 꿈틀거리는 기괴한 촉수 6가닥
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 4.5;
    for (let a = 0; a < 6; a++) {
      const baseAng = Math.PI + (a - 2.5) * 0.45;
      const wave = Math.sin(time * 0.012 + a * 1.4) * 0.35;
      const len = z.radius + 18 + Math.cos(time * 0.008 + a) * 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(baseAng + wave) * (len * 0.5),
        Math.sin(baseAng + wave) * (len * 0.5),
        Math.cos(baseAng - wave) * len,
        Math.sin(baseAng - wave) * len
      );
      ctx.stroke();
    }

    // 2. 기형적으로 길어진 비대칭 뼈 낫 팔 (공격 모션 연동)
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(4 + armReach, -z.radius - 4 - armSpread, 28, 9);
    ctx.fillRect(6 + armReach, z.radius - 5 + armSpread, 34, 11);
    ctx.fillStyle = '#fef3c7'; // 뼈 발톱 끝단
    ctx.beginPath();
    ctx.moveTo(32 + armReach, -z.radius - 4 - armSpread);
    ctx.lineTo(44 + armReach, -z.radius + 2 - armSpread);
    ctx.lineTo(32 + armReach, -z.radius + 5 - armSpread);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40 + armReach, z.radius - 5 + armSpread);
    ctx.lineTo(54 + armReach, z.radius + 1 + armSpread);
    ctx.lineTo(40 + armReach, z.radius + 6 + armSpread);
    ctx.fill();

    // 3. 비대칭 뒤틀린 육괴 몸통
    ctx.fillStyle = z.color;
    ctx.beginPath();
    for (let s = 0; s <= 12; s++) {
      const ang = (s / 12) * Math.PI * 2;
      const deform = Math.sin(ang * 3 + time * 0.009) * 4 + Math.cos(ang * 5 - time * 0.007) * 3;
      const r = z.radius + deform;
      if (s === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff0055';
    ctx.stroke();

    // 4. 노출된 하얀 갈비뼈 & 고동치는 심장 핵
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2.5;
    for (let rib = -1; rib <= 1; rib++) {
      ctx.beginPath();
      ctx.moveTo(-8, rib * 7 - 4);
      ctx.quadraticCurveTo(4, rib * 9, -8, rib * 7 + 4);
      ctx.stroke();
    }
    ctx.fillStyle = z.type === 'ACID' ? '#a3e635' : '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, 8 + pulse * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 5. 비대칭 다수의 발광 눈 (5개)
    ctx.fillStyle = '#fef08a';
    const eyes = [
      { x: 14, y: -9, r: 3.5 },
      { x: 17, y: -2, r: 2.2 },
      { x: 15, y: 6,  r: 4.2 },
      { x: 9,  y: -14, r: 2.5 },
      { x: 10, y: 13, r: 2.8 }
    ];
    eyes.forEach(e => {
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    });
  } else {
    // [일반 좀비 3종 각각의 고유 외형 + 공격 모션]
    if (z.type === 'RUNNER') {
      // 러너: 날렵한 붉은 후드 + 뻗은 손톱 팔
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(6 + armReach, -11 - armSpread, 19, 4);
      ctx.fillRect(6 + armReach, 7 + armSpread, 19, 4);

      ctx.fillStyle = '#991b1b';
      ctx.beginPath(); ctx.arc(0, 0, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#450a0a'; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = '#fef08a'; // 번뜩이는 눈
      ctx.fillRect(9, -5, 3, 3); ctx.fillRect(9, 2, 3, 3);
    } else if (z.type === 'TANKER') {
      // 떡대 좀비: 거대한 체구 + 중장갑 작업 조끼 + 굵은 양팔
      ctx.fillStyle = '#4d7c5b';
      ctx.fillRect(6 + armReach, -19 - armSpread, 22, 8);
      ctx.fillRect(6 + armReach, 11 + armSpread, 22, 8);

      ctx.fillStyle = '#3f6212';
      ctx.beginPath(); ctx.arc(0, 0, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a2e05'; ctx.lineWidth = 3; ctx.stroke();

      ctx.fillStyle = '#78350f'; // 작업 조끼 판
      ctx.fillRect(-10, -14, 18, 28);
    } else {
      // 워커: 기본 감염자
      ctx.fillStyle = '#4d7c5b';
      ctx.fillRect(6 + armReach, -13 - armSpread, 18, 5);
      ctx.fillRect(6 + armReach, 8 + armSpread, 18, 5);

      ctx.fillStyle = z.isDashing ? '#991b1b' : z.color;
      ctx.beginPath(); ctx.arc(0, 0, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a2e1a'; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = '#991b1b';
      ctx.beginPath(); ctx.arc(5, -4, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  ctx.globalAlpha = 1.0;
  const hpRatio = Math.max(0, z.hp / z.maxHp);
  if (hpRatio < 1 || z.isMutant || z.type === 'TANKER') {
    const bw = z.radius * 2;
    ctx.fillStyle = '#111';
    ctx.fillRect(-bw / 2, -z.radius - 14, bw, 5);
    ctx.fillStyle = z.isMutant ? '#ff0055' : '#ef4444';
    ctx.fillRect(-bw / 2, -z.radius - 14, bw * hpRatio, 5);
  }

  ctx.fillStyle = z.isMutant ? '#fda4af' : '#cbd5e1';
  ctx.font = z.isMutant ? 'bold 12px sans-serif' : '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(z.name, 0, -z.radius - 18);
  ctx.restore();
}

function render(now) {
  requestAnimationFrame(render);
  ctx.fillStyle = '#182216';
  ctx.fillRect(0, 0, viewW, viewH);

  const me = world.players[myId];
  if (!me) return;

  let shakeX = 0, shakeY = 0;
  if (screenShake > 0) {
    shakeX = (Math.random() - 0.5) * screenShake;
    shakeY = (Math.random() - 0.5) * screenShake;
    screenShake *= 0.85;
    if (screenShake < 0.3) screenShake = 0;
  }

  const camX = me.x - viewW / 2 + shakeX;
  const camY = me.y - viewH / 2 + shakeY;

  ctx.save();
  ctx.translate(-camX, -camY);

  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const startX = Math.floor(camX / 120) * 120;
  const startY = Math.floor(camY / 120) * 120;
  for (let x = startX; x < camX + viewW + 120; x += 120) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapSize); ctx.stroke();
  }
  for (let y = startY; y < camY + viewH + 120; y += 120) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapSize, y); ctx.stroke();
  }

  // 강줄기 및 나무 다리
  (terrain.rivers || []).forEach(r => {
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#0284c7';
    if (r.horizontal) ctx.fillRect(r.x, r.y + 20, r.w, r.h - 40);
    else ctx.fillRect(r.x + 20, r.y, r.w - 40, r.h);

    ctx.fillStyle = '#78350f';
    r.bridges.forEach(pos => {
      if (r.horizontal) ctx.fillRect(pos - 75, r.y - 10, 150, r.h + 20);
      else ctx.fillRect(r.x - 10, pos - 75, r.w + 20, 150);
    });
  });

  // 어두운 동굴
  (terrain.caves || []).forEach(c => {
    if (Math.abs(c.x - me.x) > viewW + 250 || Math.abs(c.y - me.y) > viewH + 250) return;
    ctx.fillStyle = '#292524';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0a09';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[어두운 동굴]', c.x, c.y - c.r - 8);
  });

  // 거대 바위산
  (terrain.mountains || []).forEach(m => {
    if (Math.abs(m.x - me.x) > viewW + 250 || Math.abs(m.y - me.y) > viewH + 250) return;
    ctx.fillStyle = '#44403c';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57534e';
    ctx.beginPath(); ctx.arc(m.x - 14, m.y - 14, m.r * 0.68, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#78716c';
    ctx.beginPath(); ctx.arc(m.x - 24, m.y - 24, m.r * 0.35, 0, Math.PI * 2); ctx.fill();
  });

  // 산성액 독 장판
  (world.acidPools || []).forEach(pool => {
    ctx.fillStyle = 'rgba(132, 204, 22, 0.38)';
    ctx.beginPath();
    ctx.arc(pool.x, pool.y, pool.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // 바닥 혈흔 & 떨어진 빈 탄창
  bloodDecals.forEach(bd => {
    ctx.fillStyle = `rgba(136, 19, 19, ${bd.alpha})`;
    ctx.beginPath();
    ctx.arc(bd.x, bd.y, bd.r, 0, Math.PI * 2);
    ctx.fill();
  });

  for (let i = droppedMags.length - 1; i >= 0; i--) {
    const dm = droppedMags[i];
    dm.x += dm.vx;
    dm.y += dm.vy;
    dm.vx *= 0.85;
    dm.vy *= 0.85;
    dm.life--;
    ctx.save();
    ctx.translate(dm.x, dm.y);
    ctx.rotate(dm.angle);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-4, -2.5, 8, 5);
    ctx.restore();
    if (dm.life <= 0) droppedMags.splice(i, 1);
  }

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, mapSize, mapSize);

  // 현실적으로 구분되는 6종 건물
  buildings.forEach(b => {
    if (Math.abs(b.x - me.x) > viewW + 400 || Math.abs(b.y - me.y) > viewH + 400) return;
    drawBuilding(b, me, now);
  });

  // 거리에 떨어진 나무 더미
  (world.woodDrops || []).forEach(w => {
    if (Math.abs(w.x - me.x) > viewW || Math.abs(w.y - me.y) > viewH) return;
    drawWoodDrop(w, now);
  });

  // 설치된 바리케이드 및 미리보기
  drawBarricades(me);

  // 건물 내부 드롭 물품
  world.loot.forEach(item => {
    if (Math.abs(item.x - me.x) > viewW || Math.abs(item.y - me.y) > viewH) return;
    drawLootItem(item, now);
  });

  // 좀비 3종 & 변칙 좀비 5종
  world.zombies.forEach(z => {
    if (Math.abs(z.x - me.x) > viewW || Math.abs(z.y - me.y) > viewH) return;
    drawZombie(z, now);
  });

  // 좀비 할퀴기 공격 모션 궤적
  for (let i = zombieSlashes.length - 1; i >= 0; i--) {
    const zs = zombieSlashes[i];
    zs.life--;
    const alpha = Math.max(0, zs.life / zs.maxLife);
    ctx.save();
    ctx.translate(zs.x, zs.y);
    ctx.rotate(zs.angle);
    ctx.strokeStyle = zs.color;
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineWidth = 3.5;
    for (let c = 0; c < zs.claws; c++) {
      const rOff = zs.range - c * 6;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(10, rOff), -0.65, 0.65);
      ctx.stroke();
    }
    ctx.restore();
    if (zs.life <= 0) zombieSlashes.splice(i, 1);
  }

  // 총알
  world.bullets.forEach(b => {
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 1.4, b.y - b.vy * 1.4);
    ctx.stroke();
  });

  // 플레이어
  Object.values(world.players).forEach(p => {
    if (p.isPlayerMutant) {
      drawZombie({
        id: 999,
        isMutant: true,
        type: p.mutantType,
        name: `🧟 ${p.nickname} [${p.mutantName}]`,
        x: p.x,
        y: p.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        radius: p.radius,
        color: p.color,
        isDashing: p.isDashing,
        strikeAnim: p.swingAnim
      }, now);
    } else {
      drawSurvivor(p, p.id === myId, now);
    }
  });

  // 울창한 숲 나무 캐노피
  (terrain.forests || []).forEach(f => {
    if (Math.abs(f.x - me.x) > viewW + 250 || Math.abs(f.y - me.y) > viewH + 250) return;
    f.trees.forEach(t => {
      ctx.fillStyle = 'rgba(20, 83, 45, 0.85)';
      ctx.beginPath();
      ctx.arc(f.x + t.dx, f.y + t.dy, t.tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
      ctx.beginPath();
      ctx.arc(f.x + t.dx - 5, f.y + t.dy - 5, t.tr * 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // 스킬 충격파 & 파티클 & 데미지 팝업
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.r += 10;
    sw.alpha -= 0.045;
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = Math.max(0, sw.alpha);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    if (sw.alpha <= 0) shockwaves.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    if (pt.life <= 0) particles.splice(i, 1);
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 0.8;
    ft.life--;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }

  ctx.restore();

  // 야간 손전등 광원
  const hour = world.worldTime * 24;
  let darkness = 0;
  if (hour >= 19 || hour <= 5) darkness = 0.82;
  else if (hour > 17) darkness = ((hour - 17) / 2) * 0.82;
  else if (hour < 7) darkness = ((7 - hour) / 2) * 0.82;

  if (darkness > 0.05 && !me.isPlayerMutant) {
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = `rgba(3, 5, 10, ${darkness})`;
    lctx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);

    lctx.globalCompositeOperation = 'destination-out';
    const cx = viewW / 2;
    const cy = viewH / 2;

    const ambient = lctx.createRadialGradient(cx, cy, 20, cx, cy, 145);
    ambient.addColorStop(0, 'rgba(0,0,0,1)');
    ambient.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = ambient;
    lctx.beginPath();
    lctx.arc(cx, cy, 145, 0, Math.PI * 2);
    lctx.fill();

    lctx.save();
    lctx.translate(cx, cy);
    lctx.rotate(me.angle);
    const cone = lctx.createRadialGradient(0, 0, 10, 0, 0, 540);
    cone.addColorStop(0, 'rgba(0,0,0,1)');
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = cone;
    lctx.beginPath();
    lctx.moveTo(0, 0);
    lctx.arc(0, 0, 540, -0.42, 0.42);
    lctx.closePath();
    lctx.fill();
    lctx.restore();

    ctx.drawImage(lightCanvas, 0, 0);
  }

  // 전술 미니맵
  const mmSize = 175;
  const mmX = viewW - mmSize - 20;
  const mmY = 18;
  ctx.fillStyle = 'rgba(8, 12, 8, 0.88)';
  ctx.fillRect(mmX, mmY, mmSize, mmSize);
  ctx.strokeStyle = '#3f443f';
  ctx.lineWidth = 2;
  ctx.strokeRect(mmX, mmY, mmSize, mmSize);

  ctx.fillStyle = '#0284c7';
  (terrain.rivers || []).forEach(r => {
    ctx.fillRect(mmX + (r.x / mapSize) * mmSize, mmY + (r.y / mapSize) * mmSize, Math.max(2, (r.w / mapSize) * mmSize), Math.max(2, (r.h / mapSize) * mmSize));
  });

  ctx.fillStyle = '#6b5e51';
  buildings.forEach(b => {
    ctx.fillRect(mmX + (b.x / mapSize) * mmSize, mmY + (b.y / mapSize) * mmSize, 4, 4);
  });

  world.zombies.forEach(z => {
    if (!z.isMutant) return;
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(mmX + (z.x / mapSize) * mmSize, mmY + (z.y / mapSize) * mmSize, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  Object.values(world.players).forEach(p => {
    ctx.fillStyle = p.id === myId ? '#22c55e' : p.isPlayerMutant ? '#ff0055' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(mmX + (p.x / mapSize) * mmSize, mmY + (p.y / mapSize) * mmSize, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}
render(0);
