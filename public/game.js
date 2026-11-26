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

// Web Audio API 실시간 사운드 합성기
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
let world = { worldTime: 0.28, players: {}, zombies: [], bullets: [], loot: [] };

const bloodDecals = [];
const particles = [];
const floatingTexts = [];
let screenShake = 0;

// 환경 장식
const envProps = [];
for (let i = 0; i < 240; i++) {
  envProps.push({
    x: Math.random() * 6000,
    y: Math.random() * 6000,
    type: i % 5 === 0 ? 'wreck' : i % 2 === 0 ? 'bush' : 'crater',
    r: 18 + Math.random() * 26,
    rot: Math.random() * Math.PI * 2
  });
}

const keys = {};
let mouse = { x: 0, y: 0, down: false };
let oneShotAction = { reload: false, interact: false, useItem: null, slot: null };

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

socket.on('joinedRoom', (data) => {
  myId = data.playerId;
  mapSize = data.mapSize;
  buildings = data.buildings;
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
});

socket.on('worldState', (state) => {
  world = state;
  updateHUD();
});

socket.on('sfx', (type) => playSound(type));
socket.on('statusNotice', (msg) => showToast(msg));

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
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 11;
      particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 28, color: i%2===0 ? '#f97316' : '#dc2626', size: 6 });
    }
  }
});

socket.on('kickedByInfection', (msg) => {
  alert(msg);
  location.reload();
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === '1') oneShotAction.slot = 'melee';
  if (k === '2') oneShotAction.slot = 'ranged';
  if (k === '3') oneShotAction.useItem = 'food';
  if (k === '4') oneShotAction.useItem = 'water';
  if (k === '5') oneShotAction.useItem = 'medkit';
  if (k === 'r') oneShotAction.reload = true;
  if (k === 'f') oneShotAction.interact = true;
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => { mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });

setInterval(() => {
  if (!myId || !world.players[myId]) return;
  let dx = 0, dy = 0;
  if (keys['w']) dy -= 1;
  if (keys['s']) dy += 1;
  if (keys['a']) dx -= 1;
  if (keys['d']) dx += 1;
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

  const angle = Math.atan2(mouse.y - viewH / 2, mouse.x - viewW / 2);
  socket.emit('playerInput', {
    dx, dy,
    sprint: !!keys['shift'],
    angle,
    attack: mouse.down,
    ...oneShotAction
  });
  oneShotAction = { reload: false, interact: false, useItem: null, slot: null };
}, 50);

function updateHUD() {
  const me = world.players[myId];
  if (!me) return;
  document.getElementById('hpBar').style.width = me.hp + '%';
  document.getElementById('stamBar').style.width = me.stamina + '%';
  document.getElementById('foodBar').style.width = me.hunger + '%';
  document.getElementById('waterBar').style.width = me.thirst + '%';

  document.getElementById('hpVal').textContent = Math.ceil(me.hp);
  document.getElementById('stamVal').textContent = Math.ceil(me.stamina);
  document.getElementById('foodVal').textContent = Math.ceil(me.hunger);
  document.getElementById('waterVal').textContent = Math.ceil(me.thirst);

  document.getElementById('slot1Name').textContent = me.melee.name;
  document.getElementById('slot2Name').textContent = me.ranged
    ? `${me.ranged.name} (${me.ranged.currentMag}/${me.reserveAmmo})`
    : `미장착 (탄약:${me.reserveAmmo})`;

  document.getElementById('slot1').classList.toggle('active', me.activeSlot === 'melee');
  document.getElementById('slot2').classList.toggle('active', me.activeSlot === 'ranged');

  document.getElementById('foodCnt').textContent = me.inv.food;
  document.getElementById('waterCnt').textContent = me.inv.water;
  document.getElementById('medCnt').textContent = me.inv.medkit;

  document.getElementById('coordDisplay').textContent = `좌표: ${Math.floor(me.x)}, ${Math.floor(me.y)} | 사살: ${me.kills}`;
  const hour = Math.floor(world.worldTime * 24);
  const isNight = hour >= 19 || hour <= 5;
  document.getElementById('timeDisplay').textContent = `${isNight ? '🌙 심야' : '☀️ 주간'} ${String(hour).padStart(2,'0')}:00`;

  const biteEl = document.getElementById('biteOverlay');
  if (me.bitten) {
    biteEl.classList.remove('hidden');
    document.getElementById('biteTimerText').textContent =
      `☣️ 좀비에게 물렸습니다! 50% 확률 변이/강퇴까지 ${Math.max(0, me.biteTimer).toFixed(1)}초`;
  } else {
    biteEl.classList.add('hidden');
  }
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

  ctx.fillStyle = isMe ? '#1d4ed8' : '#15803d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = isMe ? '#60a5fa' : '#4ade80';
  ctx.beginPath();
  ctx.arc(2, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = p.bitten ? '#ff3333' : '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.bitten ? `☣️[감염] ${p.nickname}` : p.nickname, p.x, p.y - 28);
}

function drawZombie(z, time) {
  ctx.save();
  ctx.translate(z.x, z.y);

  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.beginPath();
  ctx.arc(4, 6, z.radius + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(z.angle || 0);

  if (z.isMutant) {
    const pulse = Math.sin(time * 0.008 + z.id) * 3.5;
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 5;
    for (let a = 0; a < 4; a++) {
      const tentAng = (a - 1.5) * 0.55 + Math.sin(time * 0.01 + a) * 0.22;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(tentAng) * (z.radius + 15), Math.sin(tentAng) * (z.radius + 15));
      ctx.stroke();
    }

    ctx.fillStyle = z.color;
    ctx.beginPath();
    ctx.arc(0, 0, z.radius + pulse * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff0055';
    ctx.stroke();

    ctx.fillStyle = z.type === 'ACID' ? '#a3e635' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(-z.radius * 0.35, -z.radius * 0.3, 6 + pulse * 0.3, 0, Math.PI * 2);
    ctx.arc(z.radius * 0.4, z.radius * 0.25, 8 - pulse * 0.3, 0, Math.PI * 2);
    ctx.arc(0, z.radius * 0.45, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#4d7c5b';
    ctx.fillRect(6, -13, 18, 5);
    ctx.fillRect(6, 8, 18, 5);

    ctx.fillStyle = z.color;
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

  // 지형 격자
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

  // 중앙 안전광장 바닥 표시
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath();
  ctx.arc(3000, 3000, 180, 0, Math.PI * 2);
  ctx.fill();

  // 환경 장식
  envProps.forEach(ep => {
    if (Math.abs(ep.x - me.x) > viewW || Math.abs(ep.y - me.y) > viewH) return;
    ctx.save();
    ctx.translate(ep.x, ep.y);
    ctx.rotate(ep.rot);
    if (ep.type === 'bush') {
      ctx.fillStyle = '#23381e';
      ctx.beginPath(); ctx.arc(0, 0, ep.r, 0, Math.PI * 2); ctx.fill();
    } else if (ep.type === 'crater') {
      ctx.fillStyle = '#121711';
      ctx.beginPath(); ctx.arc(0, 0, ep.r * 0.8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#3f2e26';
      ctx.fillRect(-26, -14, 52, 28);
    }
    ctx.restore();
  });

  bloodDecals.forEach(bd => {
    ctx.fillStyle = `rgba(136, 19, 19, ${bd.alpha})`;
    ctx.beginPath();
    ctx.arc(bd.x, bd.y, bd.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, mapSize, mapSize);

  // 겹치지 않는 건물 렌더링
  buildings.forEach(b => {
    if (Math.abs(b.x - me.x) > viewW + 400 || Math.abs(b.y - me.y) > viewH + 400) return;
    const inside = me.x > b.x && me.x < b.x + b.w && me.y > b.y && me.y < b.y + b.h;

    ctx.fillStyle = inside ? '#262926' : '#352f29';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    if (inside) {
      ctx.fillStyle = '#3f3a34';
      ctx.fillRect(b.x + 26, b.y + 26, 65, 28);
      ctx.fillRect(b.x + b.w - 90, b.y + b.h - 55, 65, 28);
    }

    ctx.fillStyle = '#57534e';
    b.walls.forEach(w => ctx.fillRect(w.x, w.y, w.w, w.h));

    ctx.fillStyle = inside ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`[${b.type}]`, b.x + 22, b.y + 38);
  });

  // 건물 파밍 아이템
  world.loot.forEach(item => {
    if (Math.abs(item.x - me.x) > viewW || Math.abs(item.y - me.y) > viewH) return;
    const glow = item.category === 'ammo' ? '#facc15'
      : item.category === 'medkit' ? '#f43f5e'
      : item.category === 'food' || item.category === 'water' ? '#34d399' : '#38bdf8';

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(item.x, item.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, item.x, item.y - 14);
  });

  // 좀비
  world.zombies.forEach(z => {
    if (Math.abs(z.x - me.x) > viewW || Math.abs(z.y - me.y) > viewH) return;
    drawZombie(z, now);
  });

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
    drawSurvivor(p, p.id === myId);
  });

  // 파티클 & 데미지 팝업
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

  // 야간 손전등 광원 효과
  const hour = world.worldTime * 24;
  let darkness = 0;
  if (hour >= 19 || hour <= 5) darkness = 0.82;
  else if (hour > 17) darkness = ((hour - 17) / 2) * 0.82;
  else if (hour < 7) darkness = ((7 - hour) / 2) * 0.82;

  if (darkness > 0.05) {
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
    ctx.fillStyle = p.id === myId ? '#22c55e' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(mmX + (p.x / mapSize) * mmSize, mmY + (p.y / mapSize) * mmSize, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}
render(0);