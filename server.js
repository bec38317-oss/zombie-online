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

// 변칙 좀비 5종 (일반 좀비보다 거대하고 기괴함)
const MUTANT_TYPES = [
  { type: 'BRUTE',    name: '브루트 (거대 육괴)',   hp: 540, speed: 1.65, radius: 44, dmg: 38, color: '#590d22' },
  { type: 'STALKER',  name: '스토커 (사족 기형체)', hp: 190, speed: 3.9,  radius: 30, dmg: 22, color: '#3c096c' },
  { type: 'ACID',     name: '애시드 (부식 농포체)', hp: 240, speed: 2.15, radius: 34, dmg: 26, color: '#2b9348' },
  { type: 'SCREAMER', name: '스크리머 (기생 비명체)', hp: 180, speed: 2.6, radius: 31, dmg: 19, color: '#bc6c25' },
  { type: 'BOMBER',   name: '보머 (팽창 자폭체)',   hp: 210, speed: 2.45, radius: 40, dmg: 70, color: '#9b2226' }
];

const rooms = {};

// 건물 절대 겹치지 않게 생성 (여백 150px 보장 + 중앙 스폰 안전지대 확보)
function generateBuildings() {
  const buildings = [];
  const types = ['민가', '편의점', '종합병원', '경찰서', '군수창고'];
  const WALL_T = 16;
  const DOOR_W = 88;
  const PADDING = 150; // 건물 간 최소 거리

  let attempts = 0;
  while (buildings.length < 46 && attempts < 3000) {
    attempts++;
    const w = 340 + Math.floor(Math.random() * 180);
    const h = 280 + Math.floor(Math.random() * 160);
    const x = 320 + Math.floor(Math.random() * (MAP_SIZE - w - 640));
    const y = 320 + Math.floor(Math.random() * (MAP_SIZE - h - 640));

    // 중앙 스폰 광장(2750~3250)은 비워둠
    if (x + w > 2750 && x < 3250 && y + h > 2750 && y < 3250) continue;

    // 기존 건물과 겹침 검사 (AABB 충돌 + 여백)
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
    const doorSide = id % 4; // 0:상, 1:하, 2:좌, 3:우
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

// 건물 내부 파밍 아이템 스폰 (근접10/원거리5/탄창/식량/물/구급상자)
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

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    playerCount: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers,
    spawnInterval: r.spawnInterval
  }));
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

    sock.join(roomId);
    sock.roomId = roomId;

    room.players[sock.id] = {
      id: sock.id,
      nickname: nickname || '생존자',
      x: 2920 + Math.random() * 160,
      y: 2920 + Math.random() * 160,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: 100,
      stamina: 100,
      hunger: 100,
      thirst: 100,
      bitten: false,
      biteTimer: 0,
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
    io.to(roomId).emit('killFeed', `📡 [투입] 생존자 '${nickname}' 님이 구역에 합류했습니다.`);
    io.emit('roomList', getRoomList());
  }

  socket.on('playerInput', (data) => {
    const room = rooms[socket.roomId];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];

    p.angle = data.angle;
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

    const now = Date.now();
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
                z.x += Math.cos(p.angle) * 18;
                z.y += Math.sin(p.angle) * 18;
                io.to(room.id).emit('fxEvent', { type: 'blood', x: z.x, y: z.y, dmg: w.dmg, killerId: p.id });
                if (z.hp <= 0) p.kills++;
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

    // 방장 설정 주기마다 기본 좀비 스폰
    if (now - room.lastZombieSpawn >= room.spawnInterval * 1000 && room.zombies.length < 150) {
      room.lastZombieSpawn = now;
      playerList.forEach(p => {
        for (let i = 0; i < 4; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 600 + Math.random() * 450;
          const zx = Math.max(50, Math.min(MAP_SIZE - 50, p.x + Math.cos(ang) * dist));
          const zy = Math.max(50, Math.min(MAP_SIZE - 50, p.y + Math.sin(ang) * dist));
          room.zombies.push({
            id: room.zombieIdSeq++,
            isMutant: false,
            type: 'NORMAL',
            name: '감염자',
            x: zx,
            y: zy,
            angle: 0,
            hp: 80,
            maxHp: 80,
            speed: 1.95 + Math.random() * 0.65,
            radius: 18,
            dmg: 14,
            color: '#386641',
            lastHit: 0
          });
        }
      });
    }

    // 생존 게이지 & 물림(10% -> 30초 -> 50% 강퇴 및 변칙 좀비 5종 생성)
    playerList.forEach(p => {
      p.swingAnim = Math.max(0, p.swingAnim - 0.16);
      p.muzzleFlash = Math.max(0, p.muzzleFlash - 0.25);
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
            io.to(p.id).emit('statusNotice', '💉 면역 항체 활성화! 바이러스를 자연 극복했습니다.');
            io.to(room.id).emit('killFeed', `🧬 '${p.nickname}' 님이 좀비 바이러스를 자연 극복했습니다.`);
          } else {
            const mSpec = MUTANT_TYPES[Math.floor(Math.random() * MUTANT_TYPES.length)];
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
              lastHit: 0
            });
            io.to(room.id).emit('killFeed', `☣️ [변이 경보] '${p.nickname}' 님이 사망하여 '${mSpec.name}'(으)로 변이했습니다!`);
            io.to(p.id).emit('kickedByInfection', `바이러스 변이로 사망하여 서버에서 강퇴되었습니다.\n죽은 자리에 '${mSpec.name}' 변칙 좀비가 탄생했습니다!`);
            const targetSock = io.sockets.sockets.get(p.id);
            if (targetSock) targetSock.leave(room.id);
            delete room.players[p.id];
            io.emit('roomList', getRoomList());
            return;
          }
        }
      }

      if (p.hp <= 0 && room.players[p.id]) {
        io.to(room.id).emit('killFeed', `💀 '${p.nickname}' 님이 과다출혈로 쓰러졌습니다.`);
        p.hp = 100;
        p.hunger = 80;
        p.thirst = 80;
        p.bitten = false;
        p.melee = MELEE_WEAPONS.fist;
        p.ranged = null;
        p.x = 2920 + Math.random() * 160;
        p.y = 2920 + Math.random() * 160;
        io.to(p.id).emit('statusNotice', '과다출혈로 쓰러져 안전광장에서 다시 깨어났습니다.');
      }
    });

    // 총알 이동 및 벽/좀비 충돌
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
      if (hit || b.life <= 0) room.bullets.splice(i, 1);
    }

    // 좀비 추적 AI 및 피격 시 10% 물림 발생
    for (let i = room.zombies.length - 1; i >= 0; i--) {
      const z = room.zombies[i];
      if (z.hp <= 0) {
        if (z.type === 'BOMBER') {
          io.to(room.id).emit('fxEvent', { type: 'explosion', x: z.x, y: z.y });
          playerList.forEach(p => {
            if (Math.hypot(p.x - z.x, p.y - z.y) < 145) {
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

      let target = null;
      let minDist = Infinity;
      playerList.forEach(p => {
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d < minDist) {
          minDist = d;
          target = p;
        }
      });

      if (target && minDist < 1300) {
        const ang = Math.atan2(target.y - z.y, target.x - z.x);
        z.angle = ang;
        z.x += Math.cos(ang) * z.speed;
        z.y += Math.sin(ang) * z.speed;
        resolveWallCollisions(z, z.radius, room.buildings);

        if (minDist <= z.radius + 19 && now - z.lastHit >= 1000) {
          z.lastHit = now;
          target.hp -= z.dmg;
          io.to(target.id).emit('playerDamaged');

          if (!target.bitten && Math.random() < 0.10) {
            target.bitten = true;
            target.biteTimer = 30;
            io.to(target.id).emit('sfx', 'bite');
            io.to(room.id).emit('killFeed', `🩸 경고! '${target.nickname}' 님이 좀비에게 물렸습니다! (발병 30초 전)`);
          }
        }
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