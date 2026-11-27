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
let world = { worldTime: 0.28, players: {}, zombies: [], bullets: [], loot: [], acidPools: [], leaderboard: [] };

const bloodDecals = [];
const particles = [];
const floatingTexts = [];
const shockwaves = [];
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

// 채팅 수신
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
      ? `${me.ranged.name} (${me.ranged.currentMag}/${me.reserveAmmo})`
      : `미장착 (탄약:${me.reserveAmmo})`;

    document.getElementById('slot1').classList.toggle('active', me.activeSlot === 'melee');
    document.getElementById('slot2').classList.toggle('active', me.activeSlot === 'ranged');

    document.getElementById('foodCnt').textContent = me.inv.food;
    document.getElementById('waterCnt').textContent = me.inv.water;
    document.getElementById('medCnt').textContent = me.inv.medkit;
  }

  document.getElementById('coordDisplay').textContent = `좌표: ${Math.floor(me.x)}, ${Math.floor(me.y)} | 점수: ${Math.floor(me.score)} | 사살: ${me.kills}`;
  const hour = Math.floor(world.worldTime * 24);
  const isNight = hour >= 19 || hour <= 5;
  document.getElementById('timeDisplay').textContent = `${isNight ? '🌙 심야' : '☀️ 주간'} ${String(hour).padStart(2,'0')}:00`;

  // 실시간 TOP 5 랭킹 업데이트
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

// 바닥 드롭 물품 실물 아이콘 (갑옷 5종 포함)
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
    // 방탄조끼 실루엣 아이콘
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(-9, -10); ctx.lineTo(-4, -10); ctx.lineTo(-2, -6);
    ctx.lineTo(2, -6); ctx.lineTo(4, -10); ctx.lineTo(9, -10);
    ctx.lineTo(11, 9); ctx.lineTo(-11, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f3e8ff';
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
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-14, -2.5, 22, 5);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-16, -3, 6, 6);
    ctx.restore();
  } else if (item.category === 'ranged') {
    ctx.save();
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-14, -3, 28, 5);
    ctx.fillRect(-10, 1, 5, 8);
    ctx.restore();
  }

  ctx.fillStyle = item.category === 'armor' ? '#e9d5ff' : '#f8fafc';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(item.name, 0, -18);

  ctx.restore();
}

function drawSurvivor(p, isMe) {
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.ellipse(4, 6, 20, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(p.angle);

  if (p.activeSlot === 'melee' && p.swingAnim > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${p.swingAnim * 0.75})`;
    ctx.lineWidth = 11 * p.swingAnim;
    ctx.beginPath();
    ctx.arc(0, 0, p.melee.range * 0.85, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();
  }

  const swingAngle = p.swingAnim > 0 ? Math.sin(p.swingAnim * Math.PI) * 1.1 : 0;
  ctx.save();
  ctx.rotate(swingAngle);

  if (p.activeSlot === 'ranged' && p.ranged) {
    ctx.fillStyle = '#1f2421';
    const len = p.ranged.id === 'sniper' ? 38 : p.ranged.id === 'ar' ? 32 : p.ranged.id === 'shotgun' ? 28 : 20;
    ctx.fillRect(10, -3, len, 6);
    if (p.ranged.id === 'sniper') {
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(16, -5, 10, 2);
    }
    if (p.muzzleFlash > 0) {
      ctx.fillStyle = `rgba(253, 224, 71, ${p.muzzleFlash})`;
      ctx.beginPath();
      ctx.arc(12 + len, 0, 13 * p.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.melee.id !== 'fist') {
    ctx.fillStyle = p.melee.color;
    const mLen = p.melee.id === 'katana' ? 38 : p.melee.id === 'fireaxe' || p.melee.id === 'sledge' ? 32 : 24;
    ctx.fillRect(12, -2.5, mLen, 5);
    if (p.melee.id === 'fireaxe' || p.melee.id === 'sledge') {
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(12 + mLen - 8, -8, 8, 16);
    }
  }

  ctx.fillStyle = '#e0ac69';
  ctx.beginPath();
  ctx.arc(14, 9, 5, 0, Math.PI * 2);
  ctx.arc(18, -7, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#2d3748';
  ctx.fillRect(-19, -11, 8, 22);

  // 갑옷 착용 시 방탄복 색상 반영
  ctx.fillStyle = p.armor ? p.armor.color : (isMe ? '#1d4ed8' : '#15803d');
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.armor ? '#fbbf24' : '#111';
  ctx.lineWidth = p.armor ? 2.5 : 2;
  ctx.stroke();

  ctx.fillStyle = isMe ? '#60a5fa' : '#4ade80';
  ctx.beginPath();
  ctx.arc(2, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = p.bitten ? '#ff3333' : '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.bitten ? `☣️[감염] ${p.nickname}` : p.nickname, p.x, p.y - 28);
}

// 변칙 좀비 5종 각각의 고유 외형 렌더링
function drawZombie(z, time) {
  ctx.save();
  ctx.translate(z.x, z.y);

  // 스토커 패시브: 반투명 그림자 은신
  if (z.type === 'STALKER') ctx.globalAlpha = 0.58;

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

  if (z.isMutant) {
    const pulse = Math.sin(time * 0.008 + (z.id || 1)) * 3.5;

    if (z.type === 'BRUTE') {
      // 브루트: 거대한 철퇴형 양팔 + 장갑 어깨
      ctx.fillStyle = '#3b0712';
      ctx.fillRect(6, -z.radius - 6, 30, 14);
      ctx.fillRect(6, z.radius - 8, 30, 14);
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f43f5e';
      ctx.stroke();
    } else if (z.type === 'STALKER') {
      // 스토커: 거미 같은 6개의 뾰족한 기형 다리
      ctx.strokeStyle = '#581c87';
      ctx.lineWidth = 4;
      for (let side of [-1, 1]) {
        for (let l = -1; l <= 1; l++) {
          const legAng = side * (1.1 + l * 0.4 + Math.sin(time * 0.02 + l) * 0.25);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(legAng) * (z.radius + 18), Math.sin(legAng) * (z.radius + 18));
          ctx.stroke();
        }
      }
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, z.radius + 4, z.radius - 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e879f9';
      ctx.beginPath();
      ctx.arc(14, -6, 3, 0, Math.PI * 2);
      ctx.arc(14, 6, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.type === 'ACID') {
      // 애시드: 부글거리는 형광 독성 농포 덩어리
      ctx.fillStyle = 'rgba(132, 204, 22, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, 80, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bef264';
      ctx.beginPath();
      ctx.arc(-10, -12, 8 + pulse * 0.4, 0, Math.PI * 2);
      ctx.arc(12, 10, 9 - pulse * 0.4, 0, Math.PI * 2);
      ctx.arc(-5, 14, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.type === 'SCREAMER') {
      // 스크리머: 찢어진 거대 입과 음파 파동 링
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius + 12 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.arc(12, 0, 11, 0, Math.PI * 2); // 비명 지르는 입
      ctx.fill();
    } else if (z.type === 'BOMBER') {
      // 보머: 터질 듯 부풀어 오른 용암 균열 배
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius + pulse * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, 14 + pulse * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#4d7c5b';
    ctx.fillRect(6, -13, 18, 5);
    ctx.fillRect(6, 8, 18, 5);

    ctx.fillStyle = z.isDashing ? '#991b1b' : z.color;
    ctx.beginPath();
    ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a2e1a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(5, -4, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.globalAlpha = 1.0;
  const hpRatio = Math.max(0, z.hp / z.maxHp);
  if (hpRatio < 1 || z.isMutant) {
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

  // 1. 지형 격자
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

  // 2. 강줄기 및 나무 다리
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

  // 3. 어두운 동굴
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

  // 4. 거대 바위산
  (terrain.mountains || []).forEach(m => {
    if (Math.abs(m.x - me.x) > viewW + 250 || Math.abs(m.y - me.y) > viewH + 250) return;
    ctx.fillStyle = '#44403c';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57534e';
    ctx.beginPath(); ctx.arc(m.x - 14, m.y - 14, m.r * 0.68, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#78716c';
    ctx.beginPath(); ctx.arc(m.x - 24, m.y - 24, m.r * 0.35, 0, Math.PI * 2); ctx.fill();
  });

  // 5. 산성액 독 장판
  (world.acidPools || []).forEach(pool => {
    ctx.fillStyle = 'rgba(132, 204, 22, 0.38)';
    ctx.beginPath();
    ctx.arc(pool.x, pool.y, pool.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // 6. 바닥 혈흔 데칼
  bloodDecals.forEach(bd => {
    ctx.fillStyle = `rgba(136, 19, 19, ${bd.alpha})`;
    ctx.beginPath();
    ctx.arc(bd.x, bd.y, bd.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, mapSize, mapSize);

  // 7. 고디테일 건축물 (바닥 타일 + 인테리어 가구 + 외벽)
  buildings.forEach(b => {
    if (Math.abs(b.x - me.x) > viewW + 400 || Math.abs(b.y - me.y) > viewH + 400) return;
    const inside = me.x > b.x && me.x < b.x + b.w && me.y > b.y && me.y < b.y + b.h;

    ctx.fillStyle = inside ? '#262926' : '#352f29';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // 실내 가구 및 인테리어 디테일
    if (inside) {
      ctx.fillStyle = '#3f3a34';
      ctx.fillRect(b.x + 28, b.y + 28, 70, 32);
      ctx.fillRect(b.x + b.w - 98, b.y + b.h - 60, 70, 32);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(b.x + b.w / 2 - 40, b.y + b.h / 2 - 20, 80, 40); // 중앙 테이블/수술대
    }

    ctx.fillStyle = '#57534e';
    b.walls.forEach(w => ctx.fillRect(w.x, w.y, w.w, w.h));

    ctx.fillStyle = inside ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`[${b.type}]`, b.x + 22, b.y + 38);
  });

  // 8. 바닥 드롭 물품
  world.loot.forEach(item => {
    if (Math.abs(item.x - me.x) > viewW || Math.abs(item.y - me.y) > viewH) return;
    drawLootItem(item, now);
  });

  // 9. 좀비
  world.zombies.forEach(z => {
    if (Math.abs(z.x - me.x) > viewW || Math.abs(z.y - me.y) > viewH) return;
    drawZombie(z, now);
  });

  // 10. 총알
  world.bullets.forEach(b => {
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 1.4, b.y - b.vy * 1.4);
    ctx.stroke();
  });

  // 11. 플레이어
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
        isDashing: p.isDashing
      }, now);
    } else {
      drawSurvivor(p, p.id === myId);
    }
  });

  // 12. 울창한 숲 나무 캐노피 (캐릭터 위에 살짝 덮여 은폐감 제공)
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

  // 13. 스킬 충격파 & 파티클 & 데미지 팝업
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

  // 14. 야간 손전등 광원
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

  // 15. 전술 미니맵 (강, 건물, 변칙 좀비, 생존자 표시)
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
