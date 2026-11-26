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

// 변칙 좀비 5종 (플레이어 기본 걷기 3.2보다 빠름)
const MUTANT_TYPES = [
  { type: 'BRUTE',    name: '브루트 (거대 육괴)',   hp: 540, speed: 3.35, radius: 44, dmg: 38, color: '#590d22' },
  { type: 'STALKER',  name: '스토커 (사족 기형체)', hp: 210, speed: 4.45, radius: 30, dmg: 22, color: '#3c096c' },
  { type: 'ACID',     name: '애시드 (부식 농포체)', hp: 260, speed: 3.65, radius: 34, dmg: 26, color: '#2b9348' },
  { type: 'SCREAMER', name: '스크리머 (기생 비명체)', hp: 200, speed: 3.95, radius: 31, dmg: 19, color: '#bc6c25' },
  { type: 'BOMBER',   name: '보머 (팽창 자폭체)',   hp: 230, speed: 3.80, radius: 40, dmg: 70, color: '#9b2226' }
];

const rooms = {};

function generateBuildings() {
  const buildings = [];
  const types = ['민가', '편의점', '종합병원', '경찰서', '군수창고'];
  const WALL_T = 16;
  const DOOR_W = 88;
  const PADDING = 150;

  let attempts = 0;
  while (buildings.length < 46 && attempts < 3000) {
    attempts++;
    const w = 340 + Math.floor(Math.random() * 180);
    const h = 280 + Math.floor(Math.random() * 160);
    const x = 320 + Math.floor(Math.random() * (MAP_SIZE - w - 640));
    const y = 320 + Math.floor(Math.random() * (MAP_SIZE - h - 640));

    if (x + w > 2750 && x < 3250 && y + h > 2750 && y < 3250) continue;

    let overlaps = false;
    for (const b of buildings) {
      if (
        x < b.x + b.w + PADDING &&
        x + w + PADDING > b.x &&
        y < b.y + b.h + PADDING &&
        y + h + PADDING > b.y
      ) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const id = buildings.length;
    const bType = types[id % types.length];
    const doorSide = id % 4;
    const walls = [];

    if (doorSide === 0) {
      walls.push({ x, y, w: (w - DOOR_W) / 2, h: WALL_T });
      walls.push({ x: x + (w + DOOR_W) / 2, y, w: (w - DOOR_W) / 2, h: WALL_T });
    } else {
      walls.push({ x, y, w, h: WALL_T });
    }

    if (doorSide === 1) {
      walls.push({ x, y: y + h - WALL_T, w: (w - DOOR_W) / 2, h: WALL_T });
      walls.push({ x: x + (w + DOOR_W) / 2, y: y + h - WALL_T, w: (w - DOOR_W) / 2, h: WALL_T });
    } else {
      walls.push({ x, y: y + h - WALL_T, w, h: WALL_T });
    }

    if (doorSide === 2) {
      walls.push({ x, y, w: WALL_T, h: (h - DOOR_W) / 2 });
      walls.push({ x, y: y + (h + DOOR_W) / 2, w: WALL_T, h: (h - DOOR_W) / 2 });
    } else {
      walls.push({ x, y, w: WALL_T, h });
    }

    if (doorSide === 3) {
      walls.push({ x: x + w - WALL_T, y, w: WALL_T, h: (h - DOOR_W) / 2 });
      walls.push({ x: x + w - WALL_T, y: y + (h + DOOR_W) / 2, w: WALL_T, h: (h - DOOR_W) / 2 });
    } else {
      walls.push({ x: x + w - WALL_T, y, w: WALL_T, h });
    }

    buildings.push({ id, x, y, w, h, type: bType, doorSide, walls });
  }
  return buildings;
}

function resolveWallCollisions(entity, radius, buildings) {
  for (let b of buildings) {
    if (
      entity.x + radius < b.x || entity.x - radius > b.x + b.w ||
      entity.y + radius < b.y || entity.y - radius > b.y + b.h
    ) continue;
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
}

// 길찾기용 장애물 충돌 체크 및 우회 각도 계산 (Steering Pathfinding)
function isBlockedAt(px, py, radius, buildings) {
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
  return false;
}

function findSmartPathAngle(z, targetX, targetY, buildings) {
  const desiredAngle = Math.atan2(targetY - z.y, targetX - z.x);
  const lookAhead = z.radius + 36;

  // 직선 경로가 막혀있지 않으면 그대로 직진
  if (!isBlockedAt(z.x + Math.cos(desiredAngle) * lookAhead, z.y + Math.sin(desiredAngle) * lookAhead, z.radius, buildings)) {
    return desiredAngle;
  }

  // 막혀있으면 16방향(22.5도 단위) 중 막히지 않고 목표와 가장 가까운 우회 경로 탐색
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

      if (!isBlockedAt(nx, ny, z.radius, buildings) && !isBlockedAt(midX, midY, z.radius, buildings)) {
        const alignScore = Math.cos(candAng - desiredAngle);
        const persistBonus = z.avoidDir === sign ? 0.25 : 0; // 한쪽 방향으로 일관되게 벽을 돌아나가도록 보너스
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

function spawnBuildingLoot(buildings) {
  const loot = [];
  let idCounter = 1;
  const meleeKeys = Object.keys(MELEE_WEAPONS).filter(k => k !== 'fist');
  const rangedKeys = Object.keys(RANGED_WEAPONS);

  buildings.forEach(b => {
    const itemCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < itemCount; i++) {
      const lx = b.x + 50 + Math.random() * (b.w - 100);
      const ly = b.y + 50 + Math.random() * (b.h - 100);
      const roll = Math.random();
      let item = null;

      if (b.type === '종합병원') {
        if (roll < 0.55) item = { category: 'medkit', name: '응급 구급상자', amount: 65 };
        else if (roll < 0.80) item = { category: 'water', name: '정제 생수병', amount: 45 };
        else item = { category: 'melee', weaponId: 'knife', name: MELEE_WEAPONS.knife.name };
      } else if (b.type === '경찰서' || b.type === '군수창고') {
        if (roll < 0.45) item = { category: 'ammo', name: '군용 탄창 (+25발)', amount: 25 };
        else if (roll < 0.78) {
          const rKey = rangedKeys[Math.floor(Math.random() * rangedKeys.length)];
          item = { category: 'ranged', weaponId: rKey, name: RANGED_WEAPONS[rKey].name };
        } else {
          const mKey = meleeKeys[Math.floor(Math.random() * meleeKeys.length)];
          item = { category: 'melee', weaponId: mKey, name: MELEE_WEAPONS[mKey].name };
        }
      } else {
        if (roll < 0.28) item = { category: 'food', name: '전투 통조림', amount: 40 };
        else if (roll < 0.55) item = { category: 'water', name: '생수병', amount: 45 };
        else if (roll < 0.70) item = { category: 'medkit', name: '구급상자', amount: 60 };
        else if (roll < 0.84) item = { category: 'ammo', name: '표준 탄창 (+15발)', amount: 15 };
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

// 플레이어 변이 좀비 변신 처리 헬퍼
function turnPlayerIntoMutant(room, p, mSpec) {
  p.isPlayerMutant = true;
  p.bitten = false;
  p.pendingMutation = null;
  p.mutantType = mSpec.type;
  p.mutantName = mSpec.name;
  p.hp = mSpec.hp;
  p.maxHp = mSpec.hp;
  p.speed = mSpec.speed;
  p.radius = mSpec.radius;
  p.dmg = mSpec.dmg;
  p.color = mSpec.color;
  p.stamina = 100;
  p.lastDash = 0;
  p.dashUntil = 0;
  p.dashAngle = 0;
  p.isDashing = false;
  io.to(p.id).emit('becameMutant', { name: mSpec.name, hp: mSpec.hp });
  io.to(room.id).emit('killFeed', `☣️ [변이 완료] '${p.nickname}' 님이 '${mSpec.name}' 변칙 좀비가 되어 생존자를 사냥합니다!`);
}

// 일반 사망 시 즉시 강퇴 및 10분 입장 금지 처리
function banAndKickPlayer(room, p, reason) {
  const banUntil = Date.now() + 10 * 60 * 1000; // 10분
  if (p.clientIp) room.bans[p.clientIp] = banUntil;
  if (p.nickname) room.bans['nick:' + p.nickname] = banUntil;

  io.to(room.id).emit('killFeed', `💀 [사망 추방] '${p.nickname}' 님이 사망하여 서버에서 추방되었습니다. (10분간 재입장 불가)`);
  io.to(p.id).emit('kickedAndBanned', reason);

  const targetSock = io.sockets.sockets.get(p.id);
  if (targetSock) {
    targetSock.leave(room.id);
    targetSock.roomId = null;
  }
  delete room.players[p.id];
  io.emit('roomList', getRoomList());
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());

  socket.on('createRoom', ({ roomName, nickname, spawnInterval, maxPlayers }) => {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 6);
    const buildings = generateBuildings();
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
      loot: spawnBuildingLoot(buildings),
      players: {},
      zombies: [],
      bullets: [],
      bans: {}, // IP 및 닉네임 기반 10분 밴 목록
      zombieIdSeq: 1,
      bulletIdSeq: 1
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
      const min = Math.floor(remainSec / 60);
      const sec = remainSec % 60;
      sock.emit('joinRejected', `사망 페널티로 인해 이 서버에 입장할 수 없습니다.\n남은 대기 시간: ${min}분 ${sec}초`);
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
      pendingMutation: null, // 감염 타이머 종료 시 선택 대기 상태
      isPlayerMutant: false, // 변칙 좀비로 플레이 중 여부
      mutantType: null,
      mutantName: null,
      speed: 3.2,
      dmg: 14,
      color: '#1d4ed8',
      lastDash: 0,
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
      muzzleFlash: 0,
      kills: 0
    };

    sock.emit('joinedRoom', {
      roomId,
      playerId: sock.id,
      mapSize: MAP_SIZE,
      buildings: room.buildings,
      spawnInterval: room.spawnInterval
    });
    io.to(roomId).emit('killFeed', `📡 [투입] 생존자 '${cleanNick}' 님이 구역에 합류했습니다.`);
    io.emit('roomList', getRoomList());
  }

  // 감염 30초 후 선택 응답 처리 ('mutant': 변이좀비로 계속 플레이 / 'leave': 서버 강퇴)
  socket.on('resolveInfectionChoice', (choice) => {
    const room = rooms[socket.roomId];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    if (!p.pendingMutation) return;

    const mSpec = p.pendingMutation;
    if (choice === 'mutant') {
      turnPlayerIntoMutant(room, p, mSpec);
    } else {
      // 강퇴 선택 시 죽은 자리에 AI 변칙 좀비 생성 후 퇴장
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
        isDashing: false
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
    if (p.pendingMutation) return; // 선택 창 떠있는 동안 대기

    const now = Date.now();
    p.angle = data.angle;

    // [변칙 좀비로 플레이 중일 때의 조작]
    if (p.isPlayerMutant) {
      // 돌진 스킬 (Shift 또는 R키, 쿨타임 10초)
      if ((data.sprint || data.reload) && now > p.dashUntil && now - p.lastDash >= 10000) {
        p.lastDash = now;
        p.dashUntil = now + 450;
        p.dashAngle = p.angle;
        io.to(room.id).emit('fxEvent', { type: 'dash', x: p.x, y: p.y });
      }

      if (now < p.dashUntil) {
        p.isDashing = true;
        p.vx = Math.cos(p.dashAngle) * (p.speed * 3.0);
        p.vy = Math.sin(p.dashAngle) * (p.speed * 3.0);
      } else {
        p.isDashing = false;
        p.vx = data.dx * p.speed;
        p.vy = data.dy * p.speed;
      }

      p.x = Math.max(30, Math.min(MAP_SIZE - 30, p.x + p.vx));
      p.y = Math.max(30, Math.min(MAP_SIZE - 30, p.y + p.vy));
      resolveWallCollisions(p, p.radius, room.buildings);

      // 생존자 공격 (좌클릭)
      if (data.attack && now - p.lastAttack >= 750) {
        p.lastAttack = now;
        p.swingAnim = 1.0;
        io.to(room.id).emit('fxEvent', { type: 'melee', x: p.x, y: p.y, angle: p.angle });

        Object.values(room.players).forEach(target => {
          if (target.id === p.id || target.isPlayerMutant) return;
          const dist = Math.hypot(target.x - p.x, target.y - p.y);
          if (dist <= p.radius + target.radius + 32) {
            const angToT = Math.atan2(target.y - p.y, target.x - p.x);
            const diff = Math.abs(Math.atan2(Math.sin(angToT - p.angle), Math.cos(angToT - p.angle)));
            if (diff < 1.2) {
              const hitDmg = p.isDashing ? Math.round(p.dmg * 1.4) : p.dmg;
              target.hp -= hitDmg;
              io.to(target.id).emit('playerDamaged');
              io.to(room.id).emit('fxEvent', { type: 'blood', x: target.x, y: target.y, dmg: hitDmg, killerId: p.id });

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
    const speed = isSprinting ? 5.6 : 3.2;

    if (isSprinting) {
      p.stamina = Math.max(0, p.stamina - 0.35);
    } else if (p.hunger > 0 && p.thirst > 0) {
      p.stamina = Math.min(100, p.stamina + 0.28);
    }

    p.vx = data.dx * speed;
    p.vy = data.dy * speed;
    p.x = Math.max(30, Math.min(MAP_SIZE - 30, p.x + p.vx));
    p.y = Math.max(30, Math.min(MAP_SIZE - 30, p.y + p.vy));
    resolveWallCollisions(p, 18, room.buildings);

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
      io.to(p.id).emit('sfx', 'consume');
    }
    if (data.useItem === 'water' && p.inv.water > 0) {
      p.inv.water--;
      p.thirst = Math.min(100, p.thirst + 45);
      io.to(p.id).emit('sfx', 'consume');
    }
    if (data.useItem === 'medkit' && p.inv.medkit > 0) {
      p.inv.medkit--;
      p.hp = Math.min(100, p.hp + 60);
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
          else if (item.category === 'melee') {
            p.melee = MELEE_WEAPONS[item.weaponId];
            p.activeSlot = 'melee';
          } else if (item.category === 'ranged') {
            const w = RANGED_WEAPONS[item.weaponId];
            p.ranged = { ...w, currentMag: w.magSize };
            p.activeSlot = 'ranged';
          }
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

          // AI 좀비 타격 (넉백 제거됨!)
          room.zombies.forEach(z => {
            const dist = Math.hypot(z.x - p.x, z.y - p.y);
            if (dist <= w.range + z.radius) {
              const angToZ = Math.atan2(z.y - p.y, z.x - p.x);
              const diff = Math.abs(Math.atan2(Math.sin(angToZ - p.angle), Math.cos(angToZ - p.angle)));
              if (diff < 1.15) {
                z.hp -= w.dmg;
                io.to(room.id).emit('fxEvent', { type: 'blood', x: z.x, y: z.y, dmg: w.dmg, killerId: p.id });
                if (z.hp <= 0) p.kills++;
              }
            }
          });

          // 변이 플레이어 타격 (넉백 제거됨!)
          Object.values(room.players).forEach(mp => {
            if (!mp.isPlayerMutant || mp.id === p.id) return;
            const dist = Math.hypot(mp.x - p.x, mp.y - p.y);
            if (dist <= w.range + mp.radius) {
              const angToM = Math.atan2(mp.y - p.y, mp.x - p.x);
              const diff = Math.abs(Math.atan2(Math.sin(angToM - p.angle), Math.cos(angToM - p.angle)));
              if (diff < 1.15) {
                mp.hp -= w.dmg;
                io.to(mp.id).emit('playerDamaged');
                io.to(room.id).emit('fxEvent', { type: 'blood', x: mp.x, y: mp.y, dmg: w.dmg, killerId: p.id });
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

    // 방장 설정 주기마다 기본 좀비 스폰 (이속 3.45~3.85: 플레이어 기본 걷기 3.2보다 살짝 빠름)
    if (now - room.lastZombieSpawn >= room.spawnInterval * 1000 && room.zombies.length < 150) {
      room.lastZombieSpawn = now;
      const humanPlayers = playerList.filter(pl => !pl.isPlayerMutant);
      humanPlayers.forEach(p => {
        for (let i = 0; i < 4; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 620 + Math.random() * 480;
          const zx = Math.max(50, Math.min(MAP_SIZE - 50, p.x + Math.cos(ang) * dist));
          const zy = Math.max(50, Math.min(MAP_SIZE - 50, p.y + Math.sin(ang) * dist));
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
            isDashing: false
          });
        }
      });
    }

    // 생존 게이지, 감염 선택 판정, 일반 사망 시 즉시 강퇴 + 10분 밴
    playerList.forEach(p => {
      p.swingAnim = Math.max(0, p.swingAnim - 0.16);
      p.muzzleFlash = Math.max(0, p.muzzleFlash - 0.25);

      if (p.isPlayerMutant) {
        if (p.hp <= 0) {
          if (p.mutantType === 'BOMBER') {
            io.to(room.id).emit('fxEvent', { type: 'explosion', x: p.x, y: p.y });
          }
          banAndKickPlayer(room, p, `변이 좀비('${p.mutantName}') 상태로 사살되었습니다.\n이 서버에 10분 동안 재입장할 수 없습니다.`);
        }
        return;
      }

      if (p.pendingMutation) {
        // 선택 제한시간(10초) 초과 시 자동 강퇴 처리
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
            isDashing: false
          });
          io.to(p.id).emit('kickedByInfection', `선택 시간이 초과되어 변이 사망 처리되었습니다.`);
          const targetSock = io.sockets.sockets.get(p.id);
          if (targetSock) { targetSock.leave(room.id); targetSock.roomId = null; }
          delete room.players[p.id];
          io.emit('roomList', getRoomList());
        }
        return;
      }

      p.hunger = Math.max(0, p.hunger - 0.035);
      p.thirst = Math.max(0, p.thirst - 0.05);
      if (p.hunger === 0 || p.thirst === 0) {
        p.hp = Math.max(0, p.hp - 0.12);
      }

      // 물림 타이머 (30초)
      if (p.bitten) {
        p.biteTimer -= 0.05;
        if (p.biteTimer <= 0) {
          p.bitten = false;
          if (Math.random() < 0.5) {
            io.to(p.id).emit('statusNotice', '💉 면역 항체 활성화! 바이러스를 자연 극복했습니다.');
            io.to(room.id).emit('killFeed', `🧬 '${p.nickname}' 님이 좀비 바이러스를 자연 극복했습니다.`);
          } else {
            const mSpec = MUTANT_TYPES[Math.floor(Math.random() * MUTANT_TYPES.length)];
            p.pendingMutation = mSpec;
            p.pendingMutationExpire = now + 10000;
            io.to(p.id).emit('infectionChoicePrompt', {
              mutantName: mSpec.name,
              mutantHp: mSpec.hp
            });
            return;
          }
        }
      }

      // 감염이 아닌 일반 사망(HP <= 0) -> 즉시 강퇴 및 해당 서버 10분 입장 금지
      if (p.hp <= 0 && room.players[p.id]) {
        banAndKickPlayer(room, p, `생존에 실패하여 사망했습니다.\n해당 서버에서 강퇴되며 10분 동안 재입장할 수 없습니다.`);
      }
    });

    // 총알 이동 및 충돌 (AI 좀비 + 변이 플레이어 모두 피격 가능)
    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life--;
      let hit = false;

      for (let bd of room.buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) {
          for (let w of bd.walls) {
            if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) {
              hit = true;
              break;
            }
          }
        }
        if (hit) break;
      }

      if (!hit) {
        for (let j = 0; j < room.zombies.length; j++) {
          const z = room.zombies[j];
          if (Math.hypot(b.x - z.x, b.y - z.y) <= z.radius + 6) {
            z.hp -= b.dmg;
            hit = true;
            io.to(room.id).emit('fxEvent', { type: 'blood', x: z.x, y: z.y, dmg: b.dmg, killerId: b.ownerId });
            if (z.hp <= 0 && room.players[b.ownerId]) {
              room.players[b.ownerId].kills++;
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
            mp.hp -= b.dmg;
            hit = true;
            io.to(mp.id).emit('playerDamaged');
            io.to(room.id).emit('fxEvent', { type: 'blood', x: mp.x, y: mp.y, dmg: b.dmg, killerId: b.ownerId });
            if (mp.hp <= 0 && room.players[b.ownerId]) {
              room.players[b.ownerId].kills++;
              io.to(room.id).emit('killFeed', `🔥 '${b.ownerName}' 님이 변이체 '${mp.nickname}'을(를) 사살했습니다!`);
            }
            break;
          }
        }
      }

      if (hit || b.life <= 0) room.bullets.splice(i, 1);
    }

    // 좀비 AI: 평상시 무작위 배회 -> 근접 시 길찾기 추적 -> 중거리 10초 쿨타임 돌진
    for (let i = room.zombies.length - 1; i >= 0; i--) {
      const z = room.zombies[i];
      if (z.hp <= 0) {
        if (z.type === 'BOMBER') {
          io.to(room.id).emit('fxEvent', { type: 'explosion', x: z.x, y: z.y });
          playerList.forEach(p => {
            if (!p.isPlayerMutant && Math.hypot(p.x - z.x, p.y - z.y) < 145) {
              p.hp -= 45;
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

      // 변이 플레이어를 제외한 생존자 중 가장 가까운 타겟 탐색
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

      const detectRange = z.isMutant ? 560 : 440;

      if (target && minDist < detectRange) {
        // 스마트 길찾기 각도 산출 (벽 장애물 우회)
        const smartAng = findSmartPathAngle(z, target.x, target.y, room.buildings);
        z.angle = smartAng;

        // 쿨타임 10초 돌진 스킬
        if (now > z.dashUntil && now - z.lastDash >= 10000 && minDist > 130 && minDist < 360) {
          z.lastDash = now;
          z.dashUntil = now + 450;
          z.dashAngle = smartAng;
          io.to(room.id).emit('fxEvent', { type: 'dash', x: z.x, y: z.y });
        }

        if (now < z.dashUntil) {
          z.isDashing = true;
          z.angle = z.dashAngle;
          z.x += Math.cos(z.dashAngle) * (z.speed * 3.1);
          z.y += Math.sin(z.dashAngle) * (z.speed * 3.1);
        } else {
          z.isDashing = false;
          z.x += Math.cos(smartAng) * z.speed;
          z.y += Math.sin(smartAng) * z.speed;
        }

        resolveWallCollisions(z, z.radius, room.buildings);

        if (minDist <= z.radius + 19 && now - z.lastHit >= 1000) {
          z.lastHit = now;
          const hitDmg = z.isDashing ? Math.round(z.dmg * 1.4) : z.dmg;
          target.hp -= hitDmg;
          io.to(target.id).emit('playerDamaged');

          if (!target.bitten && Math.random() < 0.10) {
            target.bitten = true;
            target.biteTimer = 30;
            io.to(target.id).emit('sfx', 'bite');
            io.to(room.id).emit('killFeed', `🩸 경고! '${target.nickname}' 님이 좀비에게 물렸습니다! (발병 30초 전)`);
          }
        }
      } else {
        // 평상시 무작위 배회 (벽을 만나면 자연스럽게 방향 전환)
        z.isDashing = false;
        const lookAhead = z.radius + 25;
        if (
          now >= z.nextWanderChange ||
          isBlockedAt(z.x + Math.cos(z.wanderAngle) * lookAhead, z.y + Math.sin(z.wanderAngle) * lookAhead, z.radius, room.buildings)
        ) {
          z.wanderAngle = Math.random() * Math.PI * 2;
          z.nextWanderChange = now + 1800 + Math.random() * 2600;
        }
        z.angle = z.wanderAngle;
        const wanderSpeed = z.speed * 0.35;
        z.x = Math.max(40, Math.min(MAP_SIZE - 40, z.x + Math.cos(z.wanderAngle) * wanderSpeed));
        z.y = Math.max(40, Math.min(MAP_SIZE - 40, z.y + Math.sin(z.wanderAngle) * wanderSpeed));
        resolveWallCollisions(z, z.radius, room.buildings);
      }
    }

    if (now - room.lastLootRefill >= 90000 && room.loot.length < 75) {
      room.lastLootRefill = now;
      room.loot.push(...spawnBuildingLoot(room.buildings).slice(0, 35));
    }

    io.to(room.id).emit('worldState', {
      worldTime: room.worldTime,
      players: room.players,
      zombies: room.zombies,
      bullets: room.bullets,
      loot: room.loot
    });
  });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`DEAD ZONE Ultra Server running on port ${PORT}`));
