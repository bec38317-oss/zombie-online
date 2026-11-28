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

// 원거리 무기 5종 (장전 시간 및 탄피 장전 여부 포함)
const RANGED_WEAPONS = {
  pistol:  { id: 'pistol',  name: 'G17 9mm 권총',  dmg: 34,  magSize: 15, cd: 270,  speed: 23, spread: 0.03,  pellets: 1, reloadTime: 1200, shellReload: false },
  shotgun: { id: 'shotgun', name: 'M870 펌프샷건', dmg: 26,  magSize: 6,  cd: 820,  speed: 19, spread: 0.24,  pellets: 6, reloadTime: 1900, shellReload: true },
  smg:     { id: 'smg',     name: 'MP5 기관단총',  dmg: 25,  magSize: 30, cd: 95,   speed: 24, spread: 0.08,  pellets: 1, reloadTime: 1400, shellReload: false },
  ar:      { id: 'ar',      name: 'M4A1 돌격소총', dmg: 44,  magSize: 30, cd: 145,  speed: 28, spread: 0.04,  pellets: 1, reloadTime: 1600, shellReload: false },
  sniper:  { id: 'sniper',  name: 'AWM 저격소총',  dmg: 165, magSize: 5,  cd: 1150, speed: 38, spread: 0.005, pellets: 1, reloadTime: 2100, shellReload: false }
};

// 갑옷 5종
const ARMORS = {
  leather:    { id: 'leather',    name: '가죽 자켓',       reduce: 0.15, color: '#78350f', tier: 1 },
  police:     { id: 'police',     name: '경찰 방탄복',     reduce: 0.30, color: '#1e3a8a', tier: 2 },
  military:   { id: 'military',   name: '군용 방탄조끼',   reduce: 0.45, color: '#3f6212', tier: 3 },
  specops:    { id: 'specops',    name: '특수부대 방호복', reduce: 0.60, color: '#18181b', tier: 4 },
  juggernaut: { id: 'juggernaut', name: '저거너트 중장갑', reduce: 0.75, color: '#b91c1c', tier: 5 }
};

// 일반 좀비 3종
const NORMAL_ZOMBIES = [
  { type: 'WALKER', name: '워커',      hp: 80,  speed: 3.45, radius: 18, dmg: 14, color: '#386641' },
  { type: 'RUNNER', name: '러너',      hp: 55,  speed: 4.35, radius: 16, dmg: 11, color: '#991b1b' },
  { type: 'TANKER', name: '떡대 좀비', hp: 175, speed: 2.85, radius: 24, dmg: 22, color: '#3f6212' }
];

// 변칙 좀비 5종
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

function generateWorldMap() {
  const buildings = [];
  const terrain = {
    rivers: [],
    mountains: [],
    forests: [],
    caves: []
  };

  // 강줄기 2개 및 나무 다리
  terrain.rivers.push({
    x: 0, y: 1650, w: MAP_SIZE, h: 150, horizontal: true,
    bridges: [1100, 3000, 4800]
  });
  terrain.rivers.push({
    x: 4250, y: 0, w: 150, h: MAP_SIZE, horizontal: false,
    bridges: [900, 2900, 4900]
  });

  const occupiedRects = [
    { x: 2720, y: 2720, w: 560, h: 560 },
    { x: 0, y: 1580, w: MAP_SIZE, h: 290 },
    { x: 4180, y: 0, w: 290, h: MAP_SIZE }
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

  // 현실적으로 구분되는 6종 도시 건물 배치
  const types = ['종합병원', '경찰서', '24시 편의점', '총포상', '주유소', '주거 아파트'];
  const WALL_T = 16;
  const DOOR_W = 88;
  tries = 0;
  while (buildings.length < 42 && tries < 3000) {
    tries++;
    const w = 360 + Math.floor(Math.random() * 160);
    const h = 300 + Math.floor(Math.random() * 140);
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

function circleOBBDistanceInfo(cx, cy, obb) {
  const cos = Math.cos(-obb.angle);
  const sin = Math.sin(-obb.angle);
  const dx = cx - obb.x;
  const dy = cy - obb.y;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const hw = obb.w / 2, hh = obb.h / 2;
  const clx = Math.max(-hw, Math.min(lx, hw));
  const cly = Math.max(-hh, Math.min(ly, hh));
  const dlx = lx - clx;
  const dly = ly - cly;
  const dist = Math.hypot(dlx, dly);
  return { lx, ly, clx, cly, dlx, dly, dist, hw, hh };
}

function resolveCircleOBB(ent, obb, radius) {
  const info = circleOBBDistanceInfo(ent.x, ent.y, obb);
  if (info.dist < radius) {
    let nLx = 0, nLy = 0, overlap = 0;
    if (info.dist > 0.0001) {
      nLx = info.dlx / info.dist;
      nLy = info.dly / info.dist;
      overlap = radius - info.dist;
    } else {
      const px = info.hw - Math.abs(info.lx);
      const py = info.hh - Math.abs(info.ly);
      if (px < py) { nLx = info.lx >= 0 ? 1 : -1; overlap = px + radius; }
      else { nLy = info.ly >= 0 ? 1 : -1; overlap = py + radius; }
    }
    const cos = Math.cos(obb.angle);
    const sin = Math.sin(obb.angle);
    ent.x += (nLx * cos - nLy * sin) * overlap;
    ent.y += (nLx * sin + nLy * cos) * overlap;
    return true;
  }
  return false;
}

function resolveWorldCollisions(entity, radius, buildings, terrain, barricades = []) {
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
  for (let bar of barricades) {
    resolveCircleOBB(entity, bar, radius);
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

function isInsideBuildingBox(px, py, pad, buildings) {
  for (let b of buildings) {
    if (px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) return true;
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

// 거리에 떨어져 있는 나무 더미 생성
function spawnStreetWood(buildings, terrain, count = 45) {
  const woodDrops = [];
  let seq = 1;
  // 시작 지점 근처에도 나무 3개 배치
  woodDrops.push({ id: seq++, x: 2940, y: 2880, angle: 0.3 });
  woodDrops.push({ id: seq++, x: 3060, y: 2950, angle: -0.4 });
  woodDrops.push({ id: seq++, x: 2980, y: 3070, angle: 0.7 });

  let tries = 0;
  while (woodDrops.length < count && tries < 1500) {
    tries++;
    const wx = 250 + Math.random() * (MAP_SIZE - 500);
    const wy = 250 + Math.random() * (MAP_SIZE - 500);
    if (!isInsideBuildingBox(wx, wy, 30, buildings) && !isBlockedAt(wx, wy, 25, buildings, terrain) && !isInWater(wx, wy, terrain)) {
      woodDrops.push({ id: seq++, x: wx, y: wy, angle: (Math.random() - 0.5) * 1.4 });
    }
  }
  return woodDrops;
}

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

      if (roll < 0.05) {
        const aRoll = Math.random();
        const aKey = aRoll < 0.40 ? 'leather' : aRoll < 0.68 ? 'police' : aRoll < 0.86 ? 'military' : aRoll < 0.96 ? 'specops' : 'juggernaut';
        item = { category: 'armor', armorId: aKey, name: `${ARMORS[aKey].name} (방어 ${Math.round(ARMORS[aKey].reduce*100)}%)` };
      } else if (b.type === '종합병원') {
        if (roll < 0.58) item = { category: 'medkit', name: '응급 구급상자', amount: 65 };
        else if (roll < 0.82) item = { category: 'water', name: '정제 생수병', amount: 45 };
        else item = { category: 'melee', weaponId: 'knife', name: MELEE_WEAPONS.knife.name };
      } else if (b.type === '경찰서' || b.type === '총포상') {
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

  if (terrain && terrain.caves) {
    terrain.caves.forEach(c => {
      const aKey = armorKeys[2 + Math.floor(Math.random() * 3)];
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

  io.to(room.id).emit('killFeed', `💀 [사망 추방] '${p.nickname}' (점수: ${Math.floor(p.score)}점) 사망 추방! (10분간 재입장 금지)`);
  io.to(p.id).emit('kickedAndBanned', reason);

  const targetSock = io.sockets.sockets.get(p.id);
  if (targetSock) {
    targetSock.leave(room.id);
    targetSock.roomId = null;
  }
  delete room.players[p.id];
  io.emit('roomList', getRoomList());
}

function applyDamageToPlayer(target, rawDmg) {
  if (target.isPlayerMutant) {
    const mult = target.mutantType === 'BRUTE' ? 0.65 : 1.0;
    target.hp -= Math.round(rawDmg * mult);
  } else {
    const reduce = target.armor ? target.armor.reduce : 0;
    target.hp -= Math.max(1, Math.round(rawDmg * (1 - reduce)));
  }
}

function triggerMutantSkill(room, actor, isPlayer, now) {
  const mType = isPlayer ? actor.mutantType : actor.type;
  const ang = actor.angle || 0;

  if (mType === 'BRUTE') {
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
      woodDrops: spawnStreetWood(buildings, terrain, 45),
      barricades: [],
      acidPools: [],
      players: {},
      zombies: [],
      bullets: [],
      bans: {},
      zombieIdSeq: 1,
      bulletIdSeq: 1,
      poolIdSeq: 1,
      barricadeIdSeq: 1,
      woodIdSeq: 100
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
      wood: 1,
      score: 0,
      kills: 0,
      slowUntil: 0,
      lastSkill: 0,
      dashUntil: 0,
      dashAngle: 0,
      isDashing: false,
      activeSlot: 'melee', // 'melee' | 'ranged' | 'build'
      melee: MELEE_WEAPONS.fist,
      ranged: null,
      reserveAmmo: 0,
      reloading: false,
      reloadStart: 0,
      reloadDuration: 0,
      reloadProgress: 0,
      inv: { food: 1, water: 1, medkit: 1 },
      lastAttack: 0,
      lastBuild: 0,
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
        windup: 0,
        strikeAnim: 0,
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
      resolveWorldCollisions(p, p.radius, room.buildings, room.terrain, room.barricades);

      if (data.attack && now - p.lastAttack >= 750) {
        p.lastAttack = now;
        p.swingAnim = 1.0;
        io.to(room.id).emit('fxEvent', {
          type: 'zombieSlash',
          x: p.x + Math.cos(p.angle) * (p.radius * 0.5),
          y: p.y + Math.sin(p.angle) * (p.radius * 0.5),
          angle: p.angle,
          color: '#a3e635',
          range: p.radius + 36,
          claws: 4
        });

        // 바리케이드 공격
        for (let bIdx = room.barricades.length - 1; bIdx >= 0; bIdx--) {
          const bar = room.barricades[bIdx];
          if (circleOBBDistanceInfo(p.x, p.y, bar).dist <= p.radius + 32) {
            bar.hp -= p.dmg;
            io.to(room.id).emit('fxEvent', { type: 'woodHit', x: bar.x, y: bar.y, dmg: p.dmg });
            break;
          }
        }

        // 생존자 공격
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
    resolveWorldCollisions(p, 18, room.buildings, room.terrain, room.barricades);

    // 거리에 떨어진 나무 자동 획득 (닿거나 F키)
    for (let i = room.woodDrops.length - 1; i >= 0; i--) {
      const wd = room.woodDrops[i];
      const d = Math.hypot(p.x - wd.x, p.y - wd.y);
      if (d < 34 || (data.interact && d < 68)) {
        room.woodDrops.splice(i, 1);
        p.wood += 1;
        p.score += 10;
        io.to(p.id).emit('sfx', 'pickup');
        io.to(p.id).emit('statusNotice', `🪵 나무 +1 획득! (보유: ${p.wood}개)`);
        break;
      }
    }

    // 슬롯 변경 (1: 근접, 2: 원거리, 6: 바리케이드)
    if (data.slot === 'melee') { p.activeSlot = 'melee'; p.reloading = false; }
    if (data.slot === 'ranged' && p.ranged) { p.activeSlot = 'ranged'; p.reloading = false; }
    if (data.slot === 'build') { p.activeSlot = 'build'; p.reloading = false; }

    // 총기 장전 모션 시작 (R키)
    if (data.reload && p.activeSlot === 'ranged' && p.ranged && !p.reloading && p.reserveAmmo > 0) {
      const need = p.ranged.magSize - p.ranged.currentMag;
      if (need > 0) {
        p.reloading = true;
        p.reloadStart = now;
        p.reloadDuration = p.ranged.reloadTime;
        p.reloadProgress = 0;
        io.to(p.id).emit('sfx', 'reload');
        io.to(room.id).emit('fxEvent', { type: 'magDrop', x: p.x, y: p.y, angle: p.angle });
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

    // 건물 아이템 파밍 (F키)
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
            p.reloading = false;
          } else if (item.category === 'ranged') {
            const w = RANGED_WEAPONS[item.weaponId];
            p.ranged = { ...w, currentMag: w.magSize };
            p.activeSlot = 'ranged';
            p.reloading = false;
          }
          p.score += 15;
          io.to(p.id).emit('sfx', 'pickup');
          io.to(p.id).emit('statusNotice', `[획득] ${item.name}`);
          room.loot.splice(i, 1);
          break;
        }
      }
    }

    // 클릭 동작: 바리케이드 설치 OR 근접 공격 OR 원거리 사격
    if (data.attack) {
      if (p.activeSlot === 'build') {
        if (now - p.lastBuild >= 350) {
          p.lastBuild = now;
          if (p.wood <= 0) {
            io.to(p.id).emit('statusNotice', '⚠️ 나무가 부족합니다! 거리에서 나무를 주우세요.');
            return;
          }
          const bx = p.x + Math.cos(p.angle) * 66;
          const by = p.y + Math.sin(p.angle) * 66;
          const bAngle = p.angle + Math.PI / 2;

          let blocked = isBlockedAt(bx, by, 26, room.buildings, room.terrain) || isInWater(bx, by, room.terrain);
          if (!blocked) {
            for (const existing of room.barricades) {
              if (Math.hypot(existing.x - bx, existing.y - by) < 48) { blocked = true; break; }
            }
          }
          if (blocked) {
            io.to(p.id).emit('statusNotice', '⚠️ 이 위치에는 바리케이드를 설치할 수 없습니다.');
            return;
          }

          p.wood -= 1;
          p.score += 20;
          room.barricades.push({
            id: room.barricadeIdSeq++,
            x: bx,
            y: by,
            angle: bAngle,
            w: 86,
            h: 20,
            hp: 50,
            maxHp: 50
          });
          io.to(p.id).emit('sfx', 'pickup');
          io.to(room.id).emit('fxEvent', { type: 'woodBuild', x: bx, y: by });
        }
      } else if (p.activeSlot === 'melee') {
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
      } else if (p.activeSlot === 'ranged' && p.ranged && !p.reloading) {
        const w = p.ranged;
        if (now - p.lastAttack >= w.cd) {
          if (w.currentMag <= 0) {
            if (p.reserveAmmo > 0) {
              p.reloading = true;
              p.reloadStart = now;
              p.reloadDuration = w.reloadTime;
              p.reloadProgress = 0;
              io.to(p.id).emit('sfx', 'reload');
              io.to(room.id).emit('fxEvent', { type: 'magDrop', x: p.x, y: p.y, angle: p.angle });
            }
            return;
          }
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

    // 1. 일반 좀비 3종 (워커, 러너, 떡대 좀비) 주기적 스폰
    if (now - room.lastZombieSpawn >= room.spawnInterval * 1000 && room.zombies.length < 150) {
      room.lastZombieSpawn = now;
      const humanPlayers = playerList.filter(pl => !pl.isPlayerMutant);
      humanPlayers.forEach(p => {
        for (let i = 0; i < 4; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 620 + Math.random() * 480;
          const zx = Math.max(50, Math.min(MAP_SIZE - 50, p.x + Math.cos(ang) * dist));
          const zy = Math.max(50, Math.min(MAP_SIZE - 50, p.y + Math.sin(ang) * dist));
          if (isBlockedAt(zx, zy, 24, room.buildings, room.terrain)) continue;

          const roll = Math.random();
          const zSpec = roll < 0.55 ? NORMAL_ZOMBIES[0] : roll < 0.85 ? NORMAL_ZOMBIES[1] : NORMAL_ZOMBIES[2];
          room.zombies.push({
            id: room.zombieIdSeq++,
            isMutant: false,
            type: zSpec.type,
            name: zSpec.name,
            x: zx,
            y: zy,
            angle: Math.random() * Math.PI * 2,
            hp: zSpec.hp,
            maxHp: zSpec.hp,
            speed: zSpec.speed + (Math.random() - 0.5) * 0.2,
            radius: zSpec.radius,
            dmg: zSpec.dmg,
            color: zSpec.color,
            lastHit: 0,
            windup: 0,
            strikeAnim: 0,
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

    // 3. 플레이어 상태, 장전 진행도, 스코어, 감염 처리
    playerList.forEach(p => {
      p.swingAnim = Math.max(0, p.swingAnim - 0.16);
      p.muzzleFlash = Math.max(0, p.muzzleFlash - 0.25);

      if (p.reloading && p.ranged) {
        p.reloadProgress = Math.min(1, (now - p.reloadStart) / p.reloadDuration);
        if (p.reloadProgress >= 1) {
          const need = p.ranged.magSize - p.ranged.currentMag;
          const load = Math.min(need, p.reserveAmmo);
          p.ranged.currentMag += load;
          p.reserveAmmo -= load;
          p.reloading = false;
          p.reloadProgress = 0;
        }
      }

      if (p.isPlayerMutant) {
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
            windup: 0,
            strikeAnim: 0,
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

    // 4. 총알 충돌 (바리케이드 위는 통과)
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
            const dmgMult = z.type === 'BRUTE' ? 0.65 : 1.0;
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

    // 5. 좀비 AI: 스마트 길찾기 + 바리케이드 공격 + 예비동작/타격 모션
    for (let i = room.zombies.length - 1; i >= 0; i--) {
      const z = room.zombies[i];
      z.strikeAnim = Math.max(0, (z.strikeAnim || 0) - 0.18);

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

      if (z.type === 'ACID') {
        playerList.forEach(p => {
          if (!p.isPlayerMutant && Math.hypot(p.x - z.x, p.y - z.y) < 80) {
            p.hp -= 0.3;
          }
        });
      }

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

      // 근접한 바리케이드 확인
      let nearBarricade = null;
      for (const bar of room.barricades) {
        if (circleOBBDistanceInfo(z.x, z.y, bar).dist <= z.radius + 18) {
          nearBarricade = bar;
          break;
        }
      }

      if (target && minDist < detectRange) {
        const smartAng = nearBarricade
          ? Math.atan2(nearBarricade.y - z.y, nearBarricade.x - z.x)
          : findSmartPathAngle(z, target.x, target.y, room.buildings, room.terrain);
        z.angle = smartAng;

        if (z.isMutant && now - (z.lastSkill || 0) >= 9000 && minDist < 320) {
          z.lastSkill = now;
          triggerMutantSkill(room, z, false, now);
        }

        if (!z.isMutant && now > z.dashUntil && now - z.lastDash >= 10000 && minDist > 130 && minDist < 360 && !nearBarricade) {
          z.lastDash = now;
          z.dashUntil = now + 450;
          z.dashAngle = smartAng;
          io.to(room.id).emit('fxEvent', { type: 'dash', x: z.x, y: z.y });
        }

        const inAttackRange = nearBarricade || minDist <= z.radius + 22;

        if (inAttackRange) {
          // 공격 예비 동작 (windup) -> 타격 모션 (strikeAnim)
          if (now - z.lastHit >= 800 && now - z.lastHit < 1050) {
            z.windup = Math.min(1, (now - (z.lastHit + 800)) / 250);
          } else if (now - z.lastHit >= 1050) {
            z.lastHit = now;
            z.windup = 0;
            z.strikeAnim = 1.0;

            io.to(room.id).emit('fxEvent', {
              type: 'zombieSlash',
              x: z.x + Math.cos(z.angle) * (z.radius * 0.5),
              y: z.y + Math.sin(z.angle) * (z.radius * 0.5),
              angle: z.angle,
              color: z.isMutant ? '#a3e635' : z.type === 'TANKER' ? '#f97316' : '#ef4444',
              range: z.radius + 26,
              claws: z.isMutant ? 4 : 3
            });

            if (nearBarricade) {
              nearBarricade.hp -= z.dmg;
              io.to(room.id).emit('fxEvent', { type: 'woodHit', x: nearBarricade.x, y: nearBarricade.y, dmg: z.dmg });
            } else {
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
          }
        } else {
          z.windup = 0;
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
        }

        resolveWorldCollisions(z, z.radius, room.buildings, room.terrain, room.barricades);
      } else if (z.alertTargetPos && now < z.alertTargetPos.until) {
        const ang = findSmartPathAngle(z, z.alertTargetPos.x, z.alertTargetPos.y, room.buildings, room.terrain);
        z.angle = ang;
        z.x += Math.cos(ang) * z.speed * envSpeedMult;
        z.y += Math.sin(ang) * z.speed * envSpeedMult;
        resolveWorldCollisions(z, z.radius, room.buildings, room.terrain, room.barricades);
      } else {
        z.isDashing = false;
        z.windup = 0;
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
        resolveWorldCollisions(z, z.radius, room.buildings, room.terrain, room.barricades);
      }
    }

    // 6. 파괴된 바리케이드 정리
    for (let i = room.barricades.length - 1; i >= 0; i--) {
      if (room.barricades[i].hp <= 0) {
        const b = room.barricades[i];
        io.to(room.id).emit('fxEvent', { type: 'woodBreak', x: b.x, y: b.y });
        room.barricades.splice(i, 1);
      }
    }

    // 7. 파밍 아이템 및 거리 나무 주기적 보충
    if (now - room.lastLootRefill >= 90000) {
      room.lastLootRefill = now;
      if (room.loot.length < 80) room.loot.push(...spawnWorldLoot(room.buildings, room.terrain).slice(0, 35));
      if (room.woodDrops.length < 40) room.woodDrops.push(...spawnStreetWood(room.buildings, room.terrain, 20));
    }

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
      woodDrops: room.woodDrops,
      barricades: room.barricades,
      acidPools: room.acidPools,
      leaderboard
    });
  });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`DEAD ZONE Ultra Server running on port ${PORT}`));
