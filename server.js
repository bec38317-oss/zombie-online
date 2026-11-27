const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket']
});

app.use(express.static(path.join(__dirname, 'public')));

const MAP_SIZE = 6000;

// 근접 무기 10종 (기본: 주먹)
const MELEE_WEAPONS = {
  fist:     { id: 'fist',     name: '맨주먹',        dmg: 14,  range: 58,  cd: 320, stam: 3,   color: '#e0ac69' },
  knife:    { id: 'knife',    name: '전술 식칼',     dmg: 26,  range: 68,  cd: 250, stam: 4,   color: '#cfd8dc' },
  bat:      { id: 'bat',      name: '알루미늄 배트', dmg: 38,  range: 88,  cd: 420, stam: 7,   color: '#b0bec5' },
  pipe:     { id: 'pipe',     name: '녹슨 쇠파이프', dmg: 44,  range: 88,  cd: 460, stam: 8,   color: '#8d6e63' },
  crowbar:  { id: 'crowbar',  name: '강철 크로우바', dmg: 50,  range: 90,  cd: 410, stam: 7,   color: '#d32f2f' },
  machete:  { id: 'machete',  name: '정글 마체테',   dmg: 60,  range: 94,  cd: 360, stam: 7,   color: '#90a4ae' },
  fireaxe:  { id: 'fireaxe',  name: '소방 도끼',     dmg: 78,  range: 104, cd: 620, stam: 13,  color: '#c62828' },
  sledge:   { id: 'sledge',   name: '파쇄 오함마',   dmg: 105, range: 102, cd: 820, stam: 18,  color: '#455a64' },
  katana:   { id: 'katana',   name: '명검 일본도',   dmg: 88,  range: 118, cd: 290, stam: 9,   color: '#eceff1' },
  chainsaw: { id: 'chainsaw', name: '엔진 전기톱',   dmg: 32,  range: 78,  cd: 110, stam: 2.5, color: '#f57f17' }
};

// 원거리 무기 5종
const RANGED_WEAPONS = {
  pistol:  { id: 'pistol',  name: 'G17 9mm 권총',  dmg: 34,  magSize: 15, cd: 270,  speed: 23, spread: 0.03,  pellets: 1 },
  shotgun: { id: 'shotgun', name: 'M870 펌프샷건', dmg: 26,  magSize: 6,  cd: 820,  speed: 19, spread: 0.24,  pellets: 6 },
  smg:     { id: 'smg',     name: 'MP5 기관단총',  dmg: 25,  magSize: 30, cd: 95,   speed: 24, spread: 0.08,  pellets: 1 },
  ar:      { id: 'ar',      name: 'M4A1 돌격소총', dmg: 44,  magSize: 30, cd: 145,  speed: 28, spread: 0.04,  pellets: 1 },
  sniper:  { id: 'sniper',  name: 'AWM 저격소총',  dmg: 165, magSize: 5,  cd: 1150, speed: 38, spread: 0.005, pellets: 1 }
};

// 갑옷 5종 (매우 낮은 확률로 건물에서 드랍)
const ARMORS = {
  leather:    { id: 'leather',    name: '가죽 자켓',       reduce: 0.15, color: '#78350f', tier: 1 },
  police:     { id: 'police',     name: '경찰 방탄복',     reduce: 0.30, color: '#1e3a8a', tier: 2 },
  military:   { id: 'military',   name: '군용 방탄조끼',   reduce: 0.45, color: '#3f6212', tier: 3 },
  specops:    { id: 'specops',    name: '특수부대 방호복', reduce: 0.60, color: '#18181b', tier: 4 },
  juggernaut: { id: 'juggernaut', name: '저거너트 중장갑', reduce: 0.75, color: '#b91c1c', tier: 5 }
};

// 변칙 좀비 5종 (고유 패시브 + 고유 액티브 스킬)
const MUTANT_TYPES = [
  {
    type: 'BRUTE', name: '브루트 (거대 육괴)', hp: 580, speed: 3.35, radius: 44, dmg: 38, color: '#590d22',
    passiveDesc: '강철 피부 (받는 피해 35% 감소)', skillName: '대지 강타 (광역 충격파)'
  },
  {
    type: 'STALKER', name: '스토커 (사족 기형체)', hp: 220, speed: 4.5, radius: 30, dmg: 24, color: '#3c096c',
    passiveDesc: '그림자 위장 (반투명 은신)', skillName: '그림자 도약 (순간 급습)'
  },
  {
    type: 'ACID', name: '애시드 (부식 농포체)', hp: 270, speed: 3.65, radius: 34, dmg: 26, color: '#2b9348',
    passiveDesc: '맹독 오라 (근접 시 지속 부식)', skillName: '산성액 분사 (독 장판)'
  },
  {
    type: 'SCREAMER', name: '스크리머 (기생 비명체)', hp: 210, speed: 3.95, radius: 31, dmg: 20, color: '#bc6c25',
    passiveDesc: '광기 지휘 (주변 좀비 이속 +30%)', skillName: '공포의 비명 (좀비 소집/스턴)'
  },
  {
    type: 'BOMBER', name: '보머 (팽창 자폭체)', hp: 240, speed: 3.85, radius: 40, dmg: 65, color: '#9b2226',
    passiveDesc: '불안정 폭발 (사망 시 대폭발)', skillName: '자폭 점화 (고속 돌진 후 자폭)'
  }
];

const rooms = {};

// 겹치지 않는 지형지물 (강/다리, 숲, 바위산, 동굴) + 건물 생성
function generateWorldMap() {
  const buildings = [];
  const terrain = {
    rivers: [],    // 강줄기 및 다리
    mountains: [], // 바위산 (충돌 있음)
    forests: [],   // 울창한 숲 (이동 가능, 나무 디테일)
    caves: []      // 동굴 (진입 가능, 희귀 전리품)
  };

  // 1. 강줄기 2개 생성 (가로 강 + 세로 강 교차, 다리 포함)
  terrain.rivers.push({
    x: 0, y: 1650, w: MAP_SIZE, h: 150, horizontal: true,
    bridges: [1100, 3000, 4800]
  });
  terrain.rivers.push({
    x: 4250, y: 0, w: 150, h: MAP_SIZE, horizontal: false,
    bridges: [900, 2900, 4900]
  });

  const occupiedRects = [
    { x: 2720, y: 2720, w: 560, h: 560 }, // 중앙 안전 광장
    { x: 0, y: 1580, w: MAP_SIZE, h: 290 }, // 가로 강 주변 여백
    { x: 4180, y: 0, w: 290, h: MAP_SIZE }  // 세로 강 주변 여백
  ];

  function canPlaceRect(x, y, w, h, pad = 110) {
    if (x < 220 || y < 220 || x + w > MAP_SIZE - 220 || y + h > MAP_SIZE - 220) return false;
    for (const r of occupiedRects) {
      if (x < r.x + r.w + pad && x + w + pad > r.x && y < r.y + r.h + pad && y + h + pad > r.y) {
        return false;
      }
    }
    return true;
  }

  // 2. 거대 바위산 14개 배치
  let tries = 0;
  while (terrain.mountains.length < 14 && tries < 1000) {
    tries++;
    const r = 110 + Math.floor(Math.random() * 65);
    const cx = 350 + Math.floor(Math.random() * (MAP_SIZE - 700));
    const cy = 350 + Math.floor(Math.random() * (MAP_SIZE - 700));
    if (canPlaceRect(cx - r, cy - r, r * 2, r * 2, 120)) {
      terrain.mountains.push({ id: terrain.mountains.length, x: cx, y: cy, r });
      occupiedRects.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    }
  }

  // 3. 어두운 동굴 8개 배치
  tries = 0;
  while (terrain.caves.length < 8 && tries < 1000) {
    tries++;
    const r = 95 + Math.floor(Math.random() * 35);
    const cx = 350 + Math.floor(Math.random() * (MAP_SIZE - 700));
    const cy = 350 + Math.floor(Math.random() * (MAP_SIZE - 700));
    if (canPlaceRect(cx - r, cy - r, r * 2, r * 2, 120)) {
      terrain.caves.push({ id: terrain.caves.length, x: cx, y: cy, r });
      occupiedRects.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    }
  }

  // 4. 울창한 숲 군락 18개 배치
  tries = 0;
  while (terrain.forests.length < 18 && tries < 1000) {
    tries++;
    const r = 140 + Math.floor(Math.random() * 80);
    const cx = 350 + Math.floor(Math.random() * (MAP_SIZE - 700));
    const cy = 350 + Math.floor(Math.random() * (MAP_SIZE - 700));
    if (canPlaceRect(cx - r, cy - r, r * 2, r * 2, 90)) {
      const trees = [];
      for (let t = 0; t < 11; t++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * (r - 28);
        trees.push({ dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, tr: 22 + Math.random() * 14 });
      }
      terrain.forests.push({ id: terrain.forests.length, x: cx, y: cy, r, trees });
      occupiedRects.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    }
  }

  // 5. 겹치지 않는 고디테일 건물 42채 배치
  const types = ['민가', '편의점', '종합병원', '경찰서', '군수창고'];
  const WALL_T = 16;
  const DOOR_W = 88;
  tries = 0;
  while (buildings.length < 42 && tries < 3000) {
    tries++;
    const w = 350 + Math.floor(Math.random() * 170);
    const h = 290 + Math.floor(Math.random() * 150);
    const x = 300 + Math.floor(Math.random() * (MAP_SIZE - w - 600));
    const y = 300 + Math.floor(Math.random() * (MAP_SIZE - h - 600));

    if (!canPlaceRect(x, y, w, h, 130)) continue;

    const id = buildings.length;
    const bType = types[id % types.length];
    const doorSide = id % 4;
    const walls = [];

    if (doorSide === 0) {
      walls.push({ x, y, w: (w - DOOR_W) / 2, h: WALL_T });
      walls.push({ x: x + (w + DOOR_W) / 2, y, w: (w - DOOR_W) / 2, h: WALL_T });
    } else walls.push({ x, y, w, h: WALL_T });

    if (doorSide === 1) {
      walls.push({ x, y: y + h - WALL_T, w: (w - DOOR_W) / 2, h: WALL_T });
      walls.push({ x: x + (w + DOOR_W) / 2, y: y + h - WALL_T, w: (w - DOOR_W) / 2, h: WALL_T });
    } else walls.push({ x, y: y + h - WALL_T, w, h: WALL_T });

    if (doorSide === 2) {
      walls.push({ x, y, w: WALL_T, h: (h - DOOR_W) / 2 });
      walls.push({ x, y: y + (h + DOOR_W) / 2, w: WALL_T, h: (h - DOOR_W) / 2 });
    } else walls.push({ x, y, w: WALL_T, h });

    if (doorSide === 3) {
      walls.push({ x: x + w - WALL_T, y, w: WALL_T, h: (h - DOOR_W) / 2 });
      walls.push({ x: x + w - WALL_T, y: y + (h + DOOR_W) / 2, w: WALL_T, h: (h - DOOR_W) / 2 });
    } else walls.push({ x: x + w - WALL_T, y, w: WALL_T, h });

    buildings.push({ id, x, y, w, h, type: bType, doorSide, walls });
    occupiedRects.push({ x, y, w, h });
  }

  return { buildings, terrain };
}

function resolveWorldCollisions(entity, radius, buildings, terrain) {
  // 건물 벽 충돌
  for (let b of buildings) {
    if (entity.x + radius < b.x || entity.x - radius > b.x + b.w || entity.y + radius < b.y || entity.y - radius > b.y + b.h) continue;
    for (let w of b.walls) {
      const closestX = Math.max(w.x, Math.min(entity.x, w.x + w.w));
      const closestY = Math.max(w.y, Math.min(entity.y, w.y + w.h));
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = radius - dist;
        entity.x += (dx / dist) * overlap;
        entity.y += (dy / dist) * overlap;
      }
    }
  }
  // 바위산 원형 충돌
  if (terrain && terrain.mountains) {
    for (let m of terrain.mountains) {
      const dx = entity.x - m.x;
      const dy = entity.y - m.y;
      const minDist = radius + m.r * 0.88;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = minDist - dist;
        entity.x += (dx / dist) * overlap;
        entity.y += (dy / dist) * overlap;
      }
    }
  }
}

function isInWater(x, y, terrain) {
  if (!terrain || !terrain.rivers) return false;
  for (const r of terrain.rivers) {
    if (r.horizontal) {
      if (y > r.y && y < r.y + r.h) {
        const onBridge = r.bridges.some(bx => Math.abs(x - bx) < 75);
        if (!onBridge) return true;
      }
    } else {
      if (x > r.x && x < r.x + r.w) {
        const onBridge = r.bridges.some(by => Math.abs(y - by) < 75);
        if (!onBridge) return true;
      }
    }
  }
  return false;
}

function isBlockedAt(px, py, radius, buildings, terrain) {
  if (px < 30 || px > MAP_SIZE - 30 || py < 30 || py > MAP_SIZE - 30) return true;
  for (let b of buildings) {
    if (px + radius < b.x || px - radius > b.x + b.w || py + radius < b.y || py - radius > b.y + b.h) continue;
    for (let w of b.walls) {
      const cx = Math.max(w.x, Math.min(px, w.x + w.w));
      const cy = Math.max(w.y, Math.min(py, w.y + w.h));
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }
  if (terrain && terrain.mountains) {
    for (let m of terrain.mountains) {
      if (Math.hypot(px - m.x, py - m.y) < radius + m.r * 0.88) return true;
    }
  }
  return false;
}

function findSmartPathAngle(z, targetX, targetY, buildings, terrain) {
  const desiredAngle = Math.atan2(targetY - z.y, targetX - z.x);
  const lookAhead = z.radius + 36;

  if (!isBlockedAt(z.x + Math.cos(desiredAngle) * lookAhead, z.y + Math.sin(desiredAngle) * lookAhead, z.radius, buildings, terrain)) {
    return desiredAngle;
  }

  let bestAngle = desiredAngle;
  let bestScore = -Infinity;
  const distToTarget = Math.hypot(targetX - z.x, targetY - z.y);
  const stepDist = Math.min(lookAhead, distToTarget);

  for (let i = 1; i <= 8; i++) {
    for (const sign of [1, -1]) {
      const candAng = desiredAngle + sign * i * (Math.PI / 8);
      const nx = z.x + Math.cos(candAng) * stepDist;
      const ny = z.y + Math.sin(candAng) * stepDist;
      const midX = z.x + Math.cos(candAng) * (stepDist * 0.5);
      const midY = z.y + Math.sin(candAng) * (stepDist * 0.5);

      if (!isBlockedAt(nx, ny, z.radius, buildings, terrain) && !isBlockedAt(midX, midY, z.radius, buildings, terrain)) {
        const alignScore = Math.cos(candAng - desiredAngle);
        const persistBonus = z.avoidDir === sign ? 0.25 : 0;
        const score = alignScore + persistBonus;
        if (score > bestScore) {
          bestScore = score;
          bestAngle = candAng;
          z.avoidDir = sign;
        }
      }
    }
    if (bestScore > -Infinity) break;
  }
  return bestAngle;
}

// 건물 + 동굴 파밍 아이템 생성 (갑옷 5종 극악 확률 포함)
function spawnWorldLoot(buildings, terrain) {
  const loot = [];
  let idCounter = 1;
  const meleeKeys = Object.keys(MELEE_WEAPONS).filter(k => k !== 'fist');
  const rangedKeys = Object.keys(RANGED_WEAPONS);
  const armorKeys = Object.keys(ARMORS);

  buildings.forEach(b => {
    const itemCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < itemCount; i++) {
      const lx = b.x + 50 + Math.random() * (b.w - 100);
      const ly = b.y + 50 + Math.random() * (b.h - 100);
      const roll = Math.random();
      let item = null;

      // 약 4.5%의 매우 낮은 확률로 갑옷 5종 드랍
      if (roll < 0.045) {
        const aRoll = Math.random();
        const aKey = aRoll < 0.40 ? 'leather' : aRoll < 0.68 ? 'police' : aRoll < 0.86 ? 'military' : aRoll < 0.96 ? 'specops' : 'juggernaut';
        item = { category: 'armor', armorId: aKey, name: `${ARMORS[aKey].name} (방어 ${Math.round(ARMORS[aKey].reduce*100)}%)` };
      } else if (b.type === '종합병원') {
        if (roll < 0.58) item = { category: 'medkit', name: '응급 구급상자', amount: 65 };
        else if (roll < 0.82) item = { category: 'water', name: '정제 생수병', amount: 45 };
        else item = { category: 'melee', weaponId: 'knife', name: MELEE_WEAPONS.knife.name };
      } else if (b.type === '경찰서' || b.type === '군수창고') {
        if (roll < 0.48) item = { category: 'ammo', name: '군용 탄창 (+25발)', amount: 25 };
        else if (roll < 0.80) {
          const rKey = rangedKeys[Math.floor(Math.random() * rangedKeys.length)];
          item = { category: 'ranged', weaponId: rKey, name: RANGED_WEAPONS[rKey].name };
        } else {
          const mKey = meleeKeys[Math.floor(Math.random() * meleeKeys.length)];
          item = { category: 'melee', weaponId: mKey, name: MELEE_WEAPONS[mKey].name };
        }
      } else {
        if (roll < 0.30) item = { category: 'food', name: '전투 통조림', amount: 40 };
        else if (roll < 0.57) item = { category: 'water', name: '생수병', amount: 45 };
        else if (roll < 0.72) item = { category: 'medkit', name: '구급상자', amount: 60 };
        else if (roll < 0.85) item = { category: 'ammo', name: '표준 탄창 (+15발)', amount: 15 };
        else if (roll < 0.94) {
          const mKey = meleeKeys[Math.floor(Math.random() * meleeKeys.length)];
          item = { category: 'melee', weaponId: mKey, name: MELEE_WEAPONS[mKey].name };
        } else {
          const rKey = rangedKeys[Math.floor(Math.random() * rangedKeys.length)];
          item = { category: 'ranged', weaponId: rKey, name: RANGED_WEAPONS[rKey].name };
        }
      }
      loot.push({ id: idCounter++, x: lx, y: ly, ...item });
    }
  });

  // 동굴 내부 희귀 전리품
  if (terrain && terrain.caves) {
    terrain.caves.forEach(c => {
      const aKey = armorKeys[2 + Math.floor(Math.random() * 3)]; // 고급 방탄복 이상
      loot.push({ id: idCounter++, x: c.x - 18, y: c.y, category: 'armor', armorId: aKey, name: `${ARMORS[aKey].name} (방어 ${Math.round(ARMORS[aKey].reduce*100)}%)` });
      loot.push({ id: idCounter++, x: c.x + 22, y: c.y + 10, category: 'ranged', weaponId: 'sniper', name: RANGED_WEAPONS.sniper.name });
    });
  }

  return loot;
}

function getClientIp(socket) {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return socket.handshake.address || socket.id;
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    playerCount: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers,
    spawnInterval: r.spawnInterval
  }));
}

function turnPlayerIntoMutant(room, p, mSpec) {
  p.isPlayerMutant = true;
  p.bitten = false;
  p.pendingMutation = null;
  p.mutantType = mSpec.type;
  p.mutantName = mSpec.name;
  p.passiveDesc = mSpec.passiveDesc;
  p.skillName = mSpec.skillName;
  p.hp = mSpec.hp;
  p.maxHp = mSpec.hp;
  p.speed = mSpec.speed;
  p.radius = mSpec.radius;
  p.dmg = mSpec.dmg;
  p.color = mSpec.color;
  p.lastSkill = 0;
  p.dashUntil = 0;
  p.dashAngle = 0;
  p.isDashing = false;
  p.score += 150;
  io.to(p.id).emit('becameMutant', {
    name: mSpec.name,
    hp: mSpec.hp,
    passiveDesc: mSpec.passiveDesc,
    skillName: mSpec.skillName
  });
  io.to(room.id).emit('killFeed', `☣️ [변이 완료] '${p.nickname}' 님이 '${mSpec.name}' 변칙 좀비가 되었습니다!`);
}

function banAndKickPlayer(room, p, reason) {
  const banUntil = Date.now() + 10 * 60 * 1000;
  if (p.clientIp) room.bans[p.clientIp] = banUntil;
  if (p.nickname) room.bans['nick:' + p.nickname] = banUntil;

  io.to(room.id).emit('killFeed', `💀 [사망 추방] '${p.nickname}' (점수: ${p.score}점) 사망 추방! (10분간 재입장 금지)`);
  io.to(p.id).emit('kickedAndBanned', reason);

  const targetSock = io.sockets.sockets.get(p.id);
  if (targetSock) {
    targetSock.leave(room.id);
    targetSock.roomId = null;
  }
  delete room.players[p.id];
  io.emit('roomList', getRoomList());
}

// 플레이어에게 데미지 적용 (갑옷 방어력 및 브루트 패시브 반영)
function applyDamageToPlayer(target, rawDmg) {
  if (target.isPlayerMutant) {
    // 브루트 패시브: 받는 피해 35% 감소
    const mult = target.mutantType === 'BRUTE' ? 0.65 : 1.0;
    target.hp -= Math.round(rawDmg * mult);
  } else {
    const reduce = target.armor ? target.armor.reduce : 0;
    target.hp -= Math.max(1, Math.round(rawDmg * (1 - reduce)));
  }
}

// 변칙 좀비 고유 스킬 발동
function triggerMutantSkill(room, actor, isPlayer, now) {
  const mType = isPlayer ? actor.mutantType : actor.type;
  const ang = actor.angle || 0;

  if (mType === 'BRUTE') {
    // 대지 강타: 반경 175px 충격파 + 광역 피해 + 슬로우 2.5초
    io.to(room.id).emit('fxEvent', { type: 'shockwave', x: actor.x, y: actor.y, color: '#ef4444' });
    Object.values(room.players).forEach(t => {
      if (t.id === actor.id || t.isPlayerMutant) return;
      if (Math.hypot(t.x - actor.x, t.y - actor.y) <= 175) {
        applyDamageToPlayer(t, 32);
        t.slowUntil = now + 2500;
        io.to(t.id).emit('playerDamaged');
        if (isPlayer) actor.score += 40;
      }
    });
  } else if (mType === 'STALKER') {
    // 그림자 도약: 전방 240px 순간 돌진 도약
    io.to(room.id).emit('fxEvent', { type: 'dash', x: actor.x, y: actor.y });
    for (let step = 0; step < 12; step++) {
      const nx = actor.x + Math.cos(ang) * 20;
      const ny = actor.y + Math.sin(ang) * 20;
      if (!isBlockedAt(nx, ny, actor.radius, room.buildings, room.terrain)) {
        actor.x = nx;
        actor.y = ny;
      } else break;
    }
    io.to(room.id).emit('fxEvent', { type: 'shockwave', x: actor.x, y: actor.y, color: '#a855f7' });
  } else if (mType === 'ACID') {
    // 산성액 분사: 전방 140px 위치에 7초간 지속되는 독성 장판 생성
    const px = actor.x + Math.cos(ang) * 120;
    const py = actor.y + Math.sin(ang) * 120;
    room.acidPools.push({
      id: room.poolIdSeq++,
      ownerId: actor.id,
      x: px,
      y: py,
      radius: 85,
      expireAt: now + 7000
    });
    io.to(room.id).emit('fxEvent', { type: 'shockwave', x: px, y: py, color: '#84cc16' });
  } else if (mType === 'SCREAMER') {
    // 공포의 비명: 반경 260px 생존자 슬로우 + 반경 900px 일반 좀비 집결
    io.to(room.id).emit('fxEvent', { type: 'shockwave', x: actor.x, y: actor.y, color: '#f59e0b' });
    Object.values(room.players).forEach(t => {
      if (t.id === actor.id || t.isPlayerMutant) return;
      if (Math.hypot(t.x - actor.x, t.y - actor.y) <= 260) {
        t.slowUntil = now + 3000;
        io.to(t.id).emit('playerDamaged');
        io.to(t.id).emit('statusNotice', '😱 스크리머의 괴성에 고막이 울려 이동속도가 느려집니다!');
      }
    });
    room.zombies.forEach(z => {
      if (!z.isMutant && Math.hypot(z.x - actor.x, z.y - actor.y) < 950) {
        z.alertTargetPos = { x: actor.x, y: actor.y, until: now + 6000 };
      }
    });
  } else if (mType === 'BOMBER') {
    // 자폭 점화: 1.2초간 초고속 돌진 후 대폭발
    actor.dashUntil = now + 1200;
    actor.dashAngle = ang;
    actor.bomberIgnited = now + 1200;
    io.to(room.id).emit('fxEvent', { type: 'dash', x: actor.x, y: actor.y });
  }
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());

  socket.on('createRoom', ({ roomName, nickname, spawnInterval, maxPlayers }) => {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 6);
    const { buildings, terrain } = generateWorldMap();
    rooms[roomId] = {
      id: roomId,
      name: roomName || `${nickname}의 생존 구역`,
      hostId: socket.id,
      maxPlayers: Number(maxPlayers) || 8,
      spawnInterval: Math.max(5, Number(spawnInterval) || 20),
      lastZombieSpawn: Date.now(),
      lastLootRefill: Date.now(),
      worldTime: 0.28,
      buildings,
      terrain,
      loot: spawnWorldLoot(buildings, terrain),
      acidPools: [],
      players: {},
      zombies: [],
      bullets: [],
      bans: {},
      zombieIdSeq: 1,
      bulletIdSeq: 1,
      poolIdSeq: 1
    };
    joinRoom(socket, roomId, nickname);
    io.emit('roomList', getRoomList());
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    if (rooms[roomId]) joinRoom(socket, roomId, nickname);
  });

  function joinRoom(sock, roomId, nickname) {
    const room = rooms[roomId];
    if (!room || Object.keys(room.players).length >= room.maxPlayers) return;

    const ip = getClientIp(sock);
    const cleanNick = nickname || '생존자';
    const now = Date.now();
    const banExpire = Math.max(room.bans[ip] || 0, room.bans['nick:' + cleanNick] || 0);

    if (banExpire > now) {
      const remainSec = Math.ceil((banExpire - now) / 1000);
      sock.emit('joinRejected', `사망 추방 페널티로 입장할 수 없습니다.\n남은 시간: ${Math.floor(remainSec / 60)}분 ${remainSec % 60}초`);
      return;
    }

    sock.join(roomId);
    sock.roomId = roomId;

    room.players[sock.id] = {
      id: sock.id,
      clientIp: ip,
      nickname: cleanNick,
      x: 2920 + Math.random() * 160,
      y: 2920 + Math.random() * 160,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: 100,
      maxHp: 100,
      radius: 18,
      stamina: 100,
      hunger: 100,
      thirst: 100,
      bitten: false,
      biteTimer: 0,
      pendingMutation: null,
      isPlayerMutant: false,
      mutantType: null,
      mutantName: null,
      passiveDesc: '',
      skillName: '',
      speed: 3.2,
      dmg: 14,
      color: '#1d4ed8',
      armor: null,
      score: 0,
      kills: 0,
      slowUntil: 0,
      lastSkill: 0,
      dashUntil: 0,
      dashAngle: 0,
      isDashing: false,
      activeSlot: 'melee',
      melee: MELEE_WEAPONS.fist,
      ranged: null,
      reserveAmmo: 0,
      inv: { food: 1, water: 1, medkit: 1 },
      lastAttack: 0,
      swingAnim: 0,
      muzzleFlash: 0
    };

    sock.emit('joinedRoom', {
      roomId,
      playerId: sock.id,
      mapSize: MAP_SIZE,
      buildings: room.buildings,
      terrain: room.terrain,
      spawnInterval: room.spawnInterval
    });
    io.to(roomId).emit('killFeed', `📡 [투입] 생존자 '${cleanNick}' 님이 구역에 합류했습니다.`);
    io.emit('roomList', getRoomList());
  }

  // 실시간 채팅 송수신
  socket.on('chatMessage', (text) => {
    const room = rooms[socket.roomId];
    if (!room || !room.players[socket.id]) return;
    const clean = String(text || '').trim().slice(0, 80);
    if (!clean) return;
    const p = room.players[socket.id];
    io.to(room.id).emit('chatBroadcast', {
      sender: p.isPlayerMutant ? `🧟${p.nickname}` : p.nickname,
      isMutant: p.isPlayerMutant,
      text: clean
    });
  });

  socket.on('resolveInfectionChoice', (choice) => {
    const room = rooms[socket.roomId];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    if (!p.pendingMutation) return;

    const mSpec = p.pendingMutation;
    if (choice === 'mutant') {
      turnPlayerIntoMutant(room, p, mSpec);
    } else {
      room.zombies.push({
        id: room.zombieIdSeq++,
        isMutant: true,
        type: mSpec.type,
        name: `${p.nickname} [${mSpec.name}]`,
        x: p.x,
        y: p.y,
        angle: 0,
        hp: mSpec.hp,
        maxHp: mSpec.hp,
        speed: mSpec.speed,
        radius: mSpec.radius,
        dmg: mSpec.dmg,
        color: mSpec.color,
        lastHit: 0,
        wanderAngle: Math.random() * Math.PI * 2,
        nextWanderChange: Date.now() + 2000,
        avoidDir: 1,
        lastDash: 0,
        dashUntil: 0,
        dashAngle: 0,
        isDashing: false,
        lastSkill: 0
      });
      io.to(room.id).emit('killFeed', `☣️ [변이 경보] '${p.nickname}' 님이 퇴장하고 자리에 '${mSpec.name}' 변칙 좀비가 남았습니다!`);
      io.to(p.id).emit('kickedByInfection', `바이러스 변이로 서버에서 퇴장했습니다.\n죽은 자리에 '${mSpec.name}' 변칙 좀비가 생성되었습니다.`);
      socket.leave(room.id);
      socket.roomId = null;
      delete room.players[p.id];
      io.emit('roomList', getRoomList());
    }
  });

  socket.on('playerInput', (data) => {
    const room = rooms[socket.roomId];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    if (p.pendingMutation) return;

    const now = Date.now();
    p.angle = data.angle;
    const inWater = isInWater(p.x, p.y, room.terrain);
    const slowMult = (now < p.slowUntil ? 0.55 : 1.0) * (inWater ? 0.65 : 1.0);

    // [변칙 좀비로 플레이 중일 때]
    if (p.isPlayerMutant) {
      // 고유 스킬 발동 (E키 또는 R키 또는 Shift, 쿨타임 8초)
      if ((data.skill || data.reload || data.sprint) && now - p.lastSkill >= 8000) {
        p.lastSkill = now;
        triggerMutantSkill(room, p, true, now);
      }

      if (now < p.dashUntil) {
        p.isDashing = true;
        p.vx = Math.cos(p.dashAngle) * (p.speed * 2.6);
        p.vy = Math.sin(p.dashAngle) * (p.speed * 2.6);
      } else {
        p.isDashing = false;
        p.vx = data.dx * p.speed * slowMult;
        p.vy = data.dy * p.speed * slowMult;
      }

      p.x = Math.max(30, Math.min(MAP_SIZE - 30, p.x + p.vx));
      p.y = Math.max(30, Math.min(MAP_SIZE - 30, p.y + p.vy));
      resolveWorldCollisions(p, p.radius, room.buildings, room.terrain);

      if (data.attack && now - p.lastAttack >= 750) {
        p.lastAttack = now;
        p.swingAnim = 1.0;
        io.to(room.id).emit('fxEvent', { type: 'melee', x: p.x, y: p.y, angle: p.angle });

        Object.values(room.players).forEach(target => {
          if (target.id === p.id || target.isPlayerMutant) return;
          const dist = Math.hypot(target.x - p.x, target.y - p.y);
          if (dist <= p.radius + target.radius + 34) {
            const angToT = Math.atan2(target.y - p.y, target.x - p.x);
            const diff = Math.abs(Math.atan2(Math.sin(angToT - p.angle), Math.cos(angToT - p.angle)));
            if (diff < 1.2) {
              applyDamageToPlayer(target, p.dmg);
              p.score += 35;
              io.to(target.id).emit('playerDamaged');
              io.to(room.id).emit('fxEvent', { type: 'blood', x: target.x, y: target.y, dmg: p.dmg, killerId: p.id });

              if (!target.bitten && Math.random() < 0.25) {
                target.bitten = true;
                target.biteTimer = 30;
                io.to(target.id).emit('sfx', 'bite');
                io.to(room.id).emit('killFeed', `🩸 변이체 '${p.nickname}' 님이 '${target.nickname}' 님을 감염시켰습니다!`);
              }
            }
          }
        });
      }
      return;
    }

    // [일반 생존자 조작]
    const isMoving = data.dx !== 0 || data.dy !== 0;
    const isSprinting = data.sprint && p.stamina > 5 && isMoving;
    const speed = (isSprinting ? 5.6 : 3.2) * slowMult;

    if (isSprinting) {
      p.stamina = Math.max(0, p.stamina - 0.35);
    } else if (p.hunger > 0 && p.thirst > 0) {
      p.stamina = Math.min(100, p.stamina + 0.28);
    }

    p.vx = data.dx * speed;
    p.vy = data.dy * speed;
    p.x = Math.max(30, Math.min(MAP_SIZE - 30, p.x + p.vx));
    p.y = Math.max(30, Math.min(MAP_SIZE - 30, p.y + p.vy));
    resolveWorldCollisions(p, 18, room.buildings, room.terrain);

    if (data.slot === 'melee') p.activeSlot = 'melee';
    if (data.slot === 'ranged' && p.ranged) p.activeSlot = 'ranged';

    if (data.reload && p.ranged && p.reserveAmmo > 0) {
      const need = p.ranged.magSize - p.ranged.currentMag;
      if (need > 0) {
        const load = Math.min(need, p.reserveAmmo);
        p.ranged.currentMag += load;
        p.reserveAmmo -= load;
        io.to(p.id).emit('sfx', 'reload');
      }
    }

    if (data.useItem === 'food' && p.inv.food > 0) {
      p.inv.food--;
      p.hunger = Math.min(100, p.hunger + 40);
      p.score += 10;
      io.to(p.id).emit('sfx', 'consume');
    }
    if (data.useItem === 'water' && p.inv.water > 0) {
      p.inv.water--;
      p.thirst = Math.min(100, p.thirst + 45);
      p.score += 10;
      io.to(p.id).emit('sfx', 'consume');
    }
    if (data.useItem === 'medkit' && p.inv.medkit > 0) {
      p.inv.medkit--;
      p.hp = Math.min(100, p.hp + 60);
      p.score += 15;
      io.to(p.id).emit('sfx', 'heal');
    }

    if (data.interact) {
      for (let i = room.loot.length - 1; i >= 0; i--) {
        const item = room.loot[i];
        if (Math.hypot(p.x - item.x, p.y - item.y) < 62) {
          if (item.category === 'food') p.inv.food++;
          else if (item.category === 'water') p.inv.water++;
          else if (item.category === 'medkit') p.inv.medkit++;
          else if (item.category === 'ammo') p.reserveAmmo += item.amount;
          else if (item.category === 'armor') {
            p.armor = ARMORS[item.armorId];
            p.score += 80;
          } else if (item.category === 'melee') {
            p.melee = MELEE_WEAPONS[item.weaponId];
            p.activeSlot = 'melee';
          } else if (item.category === 'ranged') {
            const w = RANGED_WEAPONS[item.weaponId];
            p.ranged = { ...w, currentMag: w.magSize };
            p.activeSlot = 'ranged';
          }
          p.score += 15;
          io.to(p.id).emit('sfx', 'pickup');
          io.to(p.id).emit('statusNotice', `[획득] ${item.name}`);
          room.loot.splice(i, 1);
          break;
        }
      }
    }

    if (data.attack) {
      if (p.activeSlot === 'melee') {
        const w = p.melee;
        if (now - p.lastAttack >= w.cd && p.stamina >= w.stam) {
          p.lastAttack = now;
          p.swingAnim = 1.0;
          p.stamina -= w.stam;
          io.to(room.id).emit('fxEvent', { type: 'melee', x: p.x, y: p.y, angle: p.angle });

          room.zombies.forEach(z => {
            const dist = Math.hypot(z.x - p.x, z.y - p.y);
            if (dist <= w.range + z.radius) {
              const angToZ = Math.atan2(z.y - p.y, z.x - p.x);
              const diff = Math.abs(Math.atan2(Math.sin(angToZ - p.angle), Math.cos(angToZ - p.angle)));
              if (diff < 1.15) {
                z.hp -= w.dmg;
                io.to(room.id).emit('fxEvent', { type: 'blood', x: z.x, y: z.y, dmg: w.dmg, killerId: p.id });
                if (z.hp <= 0) {
                  p.kills++;
                  p.score += z.isMutant ? 250 : 30;
                }
              }
            }
          });

          Object.values(room.players).forEach(mp => {
            if (!mp.isPlayerMutant || mp.id === p.id) return;
            const dist = Math.hypot(mp.x - p.x, mp.y - p.y);
            if (dist <= w.range + mp.radius) {
              const angToM = Math.atan2(mp.y - p.y, mp.x - p.x);
              const diff = Math.abs(Math.atan2(Math.sin(angToM - p.angle), Math.cos(angToM - p.angle)));
              if (diff < 1.15) {
                applyDamageToPlayer(mp, w.dmg);
                io.to(mp.id).emit('playerDamaged');
                io.to(room.id).emit('fxEvent', { type: 'blood', x: mp.x, y: mp.y, dmg: w.dmg, killerId: p.id });
                if (mp.hp <= 0) {
                  p.kills++;
                  p.score += 300;
                }
              }
            }
          });
        }
      } else if (p.activeSlot === 'ranged' && p.ranged) {
        const w = p.ranged;
        if (now - p.lastAttack >= w.cd && w.currentMag > 0) {
          p.lastAttack = now;
          p.muzzleFlash = 1.0;
          w.currentMag--;
          io.to(room.id).emit('fxEvent', { type: 'shoot', x: p.x, y: p.y, angle: p.angle });

          for (let i = 0; i < w.pellets; i++) {
            const spreadAng = p.angle + (Math.random() - 0.5) * w.spread;
            room.bullets.push({
              id: room.bulletIdSeq++,
              ownerId: p.id,
              ownerName: p.nickname,
              x: p.x + Math.cos(p.angle) * 28,
              y: p.y + Math.sin(p.angle) * 28,
              vx: Math.cos(spreadAng) * w.speed,
              vy: Math.sin(spreadAng) * w.speed,
              dmg: w.dmg,
              life: 52
            });
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room && room.players[socket.id]) {
      const nick = room.players[socket.id].nickname;
      delete room.players[socket.id];
      io.to(room.id).emit('killFeed', `📡 [이탈] '${nick}' 님이 서버를 떠났습니다.`);
      if (Object.keys(room.players).length === 0) delete rooms[socket.roomId];
      io.emit('roomList', getRoomList());
    }
  });
});

setInterval(() => {
  const now = Date.now();
  Object.values(rooms).forEach(room => {
    const playerList = Object.values(room.players);
    if (playerList.length === 0) return;

    room.worldTime = (room.worldTime + 0.0002) % 1;

    // 1. 기본 좀비 주기적 스폰
    if (now - room.lastZombieSpawn >= room.spawnInterval * 1000 && room.zombies.length < 150) {
      room.lastZombieSpawn = now;
      const humanPlayers = playerList.filter(pl => !pl.isPlayerMutant);
      humanPlayers.forEach(p => {
        for (let i = 0; i < 4; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 620 + Math.random() * 480;
          const zx = Math.max(50, Math.min(MAP_SIZE - 50, p.x + Math.cos(ang) * dist));
          const zy = Math.max(50, Math.min(MAP_SIZE - 50, p.y + Math.sin(ang) * dist));
          if (isBlockedAt(zx, zy, 18, room.buildings, room.terrain)) continue;
          room.zombies.push({
            id: room.zombieIdSeq++,
            isMutant: false,
            type: 'NORMAL',
            name: '감염자',
            x: zx,
            y: zy,
            angle: Math.random() * Math.PI * 2,
            hp: 80,
            maxHp: 80,
            speed: 3.45 + Math.random() * 0.4,
            radius: 18,
            dmg: 14,
            color: '#386641',
            lastHit: 0,
            wanderAngle: Math.random() * Math.PI * 2,
            nextWanderChange: now + 1500 + Math.random() * 2500,
            avoidDir: Math.random() < 0.5 ? 1 : -1,
            lastDash: 0,
            dashUntil: 0,
            dashAngle: 0,
            isDashing: false,
            lastSkill: 0
          });
        }
      });
    }

    // 2. 독성 장판 처리
    for (let i = room.acidPools.length - 1; i >= 0; i--) {
      const pool = room.acidPools[i];
      if (now >= pool.expireAt) {
        room.acidPools.splice(i, 1);
        continue;
      }
      playerList.forEach(p => {
        if (p.isPlayerMutant) return;
        if (Math.hypot(p.x - pool.x, p.y - pool.y) <= pool.radius) {
          p.hp -= 0.45;
        }
      });
    }

    // 3. 플레이어 상태, 생존 스코어, 패시브 오라, 감염 선택 처리
    playerList.forEach(p => {
      p.swingAnim = Math.max(0, p.swingAnim - 0.16);
      p.muzzleFlash = Math.max(0, p.muzzleFlash - 0.25);

      // 변이 플레이어 상태
      if (p.isPlayerMutant) {
        // 보머 자폭 점화 만료 시 대폭발
        if (p.bomberIgnited && now >= p.bomberIgnited) {
          p.bomberIgnited = 0;
          io.to(room.id).emit('fxEvent', { type: 'explosion', x: p.x, y: p.y });
          playerList.forEach(t => {
            if (!t.isPlayerMutant && Math.hypot(t.x - p.x, t.y - p.y) < 170) {
              applyDamageToPlayer(t, 65);
              p.score += 100;
            }
          });
          p.hp = 0;
        }

        // 애시드 패시브: 주변 85px 생존자 지속 독 피해
        if (p.mutantType === 'ACID') {
          playerList.forEach(t => {
            if (!t.isPlayerMutant && Math.hypot(t.x - p.x, t.y - p.y) < 85) {
              t.hp -= 0.35;
            }
          });
        }

        if (p.hp <= 0) {
          banAndKickPlayer(room, p, `변이 좀비('${p.mutantName}') 상태로 사살되었습니다.\n이 서버에 10분 동안 재입장할 수 없습니다.`);
        }
        return;
      }

      if (p.pendingMutation) {
        if (now >= p.pendingMutationExpire) {
          const mSpec = p.pendingMutation;
          room.zombies.push({
            id: room.zombieIdSeq++,
            isMutant: true,
            type: mSpec.type,
            name: `${p.nickname} [${mSpec.name}]`,
            x: p.x,
            y: p.y,
            angle: 0,
            hp: mSpec.hp,
            maxHp: mSpec.hp,
            speed: mSpec.speed,
            radius: mSpec.radius,
            dmg: mSpec.dmg,
            color: mSpec.color,
            lastHit: 0,
            wanderAngle: Math.random() * Math.PI * 2,
            nextWanderChange: now + 2000,
            avoidDir: 1,
            lastDash: 0,
            dashUntil: 0,
            dashAngle: 0,
            isDashing: false,
            lastSkill: 0
          });
          io.to(p.id).emit('kickedByInfection', `선택 시간이 초과되어 변이 사망 처리되었습니다.`);
          const targetSock = io.sockets.sockets.get(p.id);
          if (targetSock) { targetSock.leave(room.id); targetSock.roomId = null; }
          delete room.players[p.id];
          io.emit('roomList', getRoomList());
        }
        return;
      }

      // 생존 시간 보너스 점수 (초당 +1점)
      p.score += 0.05;
      p.hunger = Math.max(0, p.hunger - 0.035);
      p.thirst = Math.max(0, p.thirst - 0.05);
      if (p.hunger === 0 || p.thirst === 0) {
        p.hp = Math.max(0, p.hp - 0.12);
      }

      if (p.bitten) {
        p.biteTimer -= 0.05;
        if (p.biteTimer <= 0) {
          p.bitten = false;
          if (Math.random() < 0.5) {
            p.score += 100;
            io.to(p.id).emit('statusNotice', '💉 면역 항체 활성화! 바이러스를 자연 극복했습니다. (+100점)');
            io.to(room.id).emit('killFeed', `🧬 '${p.nickname}' 님이 좀비 바이러스를 자연 극복했습니다.`);
          } else {
            const mSpec = MUTANT_TYPES[Math.floor(Math.random() * MUTANT_TYPES.length)];
            p.pendingMutation = mSpec;
            p.pendingMutationExpire = now + 10000;
            io.to(p.id).emit('infectionChoicePrompt', {
              mutantName: mSpec.name,
              mutantHp: mSpec.hp,
              passiveDesc: mSpec.passiveDesc,
              skillName: mSpec.skillName
            });
            return;
          }
        }
      }

      if (p.hp <= 0 && room.players[p.id]) {
        banAndKickPlayer(room, p, `생존에 실패하여 사망했습니다. (최종 점수: ${Math.floor(p.score)}점)\n해당 서버에서 강퇴되며 10분 동안 재입장할 수 없습니다.`);
      }
    });

    // 4. 총알 충돌 판정
    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life--;
      let hit = false;

      if (isBlockedAt(b.x, b.y, 4, room.buildings, room.terrain)) hit = true;

      if (!hit) {
        for (let j = 0; j < room.zombies.length; j++) {
          const z = room.zombies[j];
          if (Math.hypot(b.x - z.x, b.y - z.y) <= z.radius + 6) {
            const dmgMult = z.type === 'BRUTE' ? 0.65 : 1.0; // 브루트 패시브
            const finalDmg = Math.max(1, Math.round(b.dmg * dmgMult));
            z.hp -= finalDmg;
            hit = true;
            io.to(room.id).emit('fxEvent', { type: 'blood', x: z.x, y: z.y, dmg: finalDmg, killerId: b.ownerId });
            if (z.hp <= 0 && room.players[b.ownerId]) {
              room.players[b.ownerId].kills++;
              room.players[b.ownerId].score += z.isMutant ? 250 : 30;
              if (z.isMutant) {
                io.to(room.id).emit('killFeed', `🔥 '${b.ownerName}' 님이 변칙 좀비 '${z.name}'을(를) 사살했습니다!`);
              }
            }
            break;
          }
        }
      }

      if (!hit) {
        for (const mp of Object.values(room.players)) {
          if (!mp.isPlayerMutant || mp.id === b.ownerId) continue;
          if (Math.hypot(b.x - mp.x, b.y - mp.y) <= mp.radius + 6) {
            applyDamageToPlayer(mp, b.dmg);
            hit = true;
            io.to(mp.id).emit('playerDamaged');
            io.to(room.id).emit('fxEvent', { type: 'blood', x: mp.x, y: mp.y, dmg: b.dmg, killerId: b.ownerId });
            if (mp.hp <= 0 && room.players[b.ownerId]) {
              room.players[b.ownerId].kills++;
              room.players[b.ownerId].score += 300;
              io.to(room.id).emit('killFeed', `🔥 '${b.ownerName}' 님이 변이체 '${mp.nickname}'을(를) 사살했습니다!`);
            }
            break;
          }
        }
      }

      if (hit || b.life <= 0) room.bullets.splice(i, 1);
    }

    // 5. AI 좀비 이동, 스마트 길찾기, 고유 패시브 및 스킬
    for (let i = room.zombies.length - 1; i >= 0; i--) {
      const z = room.zombies[i];
      if (z.hp <= 0 || (z.bomberIgnited && now >= z.bomberIgnited)) {
        if (z.type === 'BOMBER') {
          io.to(room.id).emit('fxEvent', { type: 'explosion', x: z.x, y: z.y });
          playerList.forEach(p => {
            if (!p.isPlayerMutant && Math.hypot(p.x - z.x, p.y - z.y) < 165) {
              applyDamageToPlayer(p, 55);
              if (!p.bitten && Math.random() < 0.3) {
                p.bitten = true;
                p.biteTimer = 30;
              }
            }
          });
        }
        room.zombies.splice(i, 1);
        continue;
      }

      // 애시드 패시브: 주변 80px 생존자 지속 부식
      if (z.type === 'ACID') {
        playerList.forEach(p => {
          if (!p.isPlayerMutant && Math.hypot(p.x - z.x, p.y - z.y) < 80) {
            p.hp -= 0.3;
          }
        });
      }

      // 스크리머 패시브 버프 확인
      let speedBuff = 1.0;
      if (!z.isMutant) {
        const hasScreamer = room.zombies.some(sz => sz.type === 'SCREAMER' && Math.hypot(sz.x - z.x, sz.y - z.y) < 320);
        if (hasScreamer) speedBuff = 1.3;
      }

      let target = null;
      let minDist = Infinity;
      playerList.forEach(p => {
        if (p.isPlayerMutant || p.pendingMutation) return;
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d < minDist) {
          minDist = d;
          target = p;
        }
      });

      const detectRange = z.isMutant ? 580 : 440;
      const inWater = isInWater(z.x, z.y, room.terrain);
      const envSpeedMult = (inWater ? 0.65 : 1.0) * speedBuff;

      if (target && minDist < detectRange) {
        const smartAng = findSmartPathAngle(z, target.x, target.y, room.buildings, room.terrain);
        z.angle = smartAng;

        // 변칙 좀비 고유 스킬 사용 (쿨타임 9초)
        if (z.isMutant && now - (z.lastSkill || 0) >= 9000 && minDist < 320) {
          z.lastSkill = now;
          triggerMutantSkill(room, z, false, now);
        }

        // 일반 좀비 쿨타임 10초 돌진
        if (!z.isMutant && now > z.dashUntil && now - z.lastDash >= 10000 && minDist > 130 && minDist < 360) {
          z.lastDash = now;
          z.dashUntil = now + 450;
          z.dashAngle = smartAng;
          io.to(room.id).emit('fxEvent', { type: 'dash', x: z.x, y: z.y });
        }

        if (now < z.dashUntil) {
          z.isDashing = true;
          z.angle = z.dashAngle;
          z.x += Math.cos(z.dashAngle) * (z.speed * 3.0);
          z.y += Math.sin(z.dashAngle) * (z.speed * 3.0);
        } else {
          z.isDashing = false;
          z.x += Math.cos(smartAng) * z.speed * envSpeedMult;
          z.y += Math.sin(smartAng) * z.speed * envSpeedMult;
        }

        resolveWorldCollisions(z, z.radius, room.buildings, room.terrain);

        if (minDist <= z.radius + 19 && now - z.lastHit >= 1000) {
          z.lastHit = now;
          const hitDmg = z.isDashing ? Math.round(z.dmg * 1.4) : z.dmg;
          applyDamageToPlayer(target, hitDmg);
          io.to(target.id).emit('playerDamaged');

          if (!target.bitten && Math.random() < 0.10) {
            target.bitten = true;
            target.biteTimer = 30;
            io.to(target.id).emit('sfx', 'bite');
            io.to(room.id).emit('killFeed', `🩸 경고! '${target.nickname}' 님이 좀비에게 물렸습니다! (발병 30초 전)`);
          }
        }
      } else if (z.alertTargetPos && now < z.alertTargetPos.until) {
        // 스크리머 비명 소집 위치로 이동
        const ang = findSmartPathAngle(z, z.alertTargetPos.x, z.alertTargetPos.y, room.buildings, room.terrain);
        z.angle = ang;
        z.x += Math.cos(ang) * z.speed * envSpeedMult;
        z.y += Math.sin(ang) * z.speed * envSpeedMult;
        resolveWorldCollisions(z, z.radius, room.buildings, room.terrain);
      } else {
        z.isDashing = false;
        const lookAhead = z.radius + 25;
        if (
          now >= z.nextWanderChange ||
          isBlockedAt(z.x + Math.cos(z.wanderAngle) * lookAhead, z.y + Math.sin(z.wanderAngle) * lookAhead, z.radius, room.buildings, room.terrain)
        ) {
          z.wanderAngle = Math.random() * Math.PI * 2;
          z.nextWanderChange = now + 1800 + Math.random() * 2600;
        }
        z.angle = z.wanderAngle;
        const wanderSpeed = z.speed * 0.35;
        z.x = Math.max(40, Math.min(MAP_SIZE - 40, z.x + Math.cos(z.wanderAngle) * wanderSpeed));
        z.y = Math.max(40, Math.min(MAP_SIZE - 40, z.y + Math.sin(z.wanderAngle) * wanderSpeed));
        resolveWorldCollisions(z, z.radius, room.buildings, room.terrain);
      }
    }

    if (now - room.lastLootRefill >= 90000 && room.loot.length < 80) {
      room.lastLootRefill = now;
      room.loot.push(...spawnWorldLoot(room.buildings, room.terrain).slice(0, 35));
    }

    // 실시간 TOP 5 스코어 랭킹 계산
    const leaderboard = playerList
      .map(pl => ({ id: pl.id, nickname: pl.nickname, score: Math.floor(pl.score), kills: pl.kills, isMutant: pl.isPlayerMutant }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    io.to(room.id).emit('worldState', {
      worldTime: room.worldTime,
      players: room.players,
      zombies: room.zombies,
      bullets: room.bullets,
      loot: room.loot,
      acidPools: room.acidPools,
      leaderboard
    });
  });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`DEAD ZONE Ultra Server running on port ${PORT}`));
