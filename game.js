/* Mini RPG (procedural visuals edition)
 * - Procedural (code-generated) tiles for the whole world (no tiles.png needed)
 * - Smooth movement + camera easing + shake + particles + floaters
 * - Town + Dungeon maps, doors, NPC quest, boss
 * - Shop, inventory modal, equipment
 * - Mana + skills, statuses, enemy abilities
 * - Works on GitHub Pages (vanilla JS)
 */

(() => {
  "use strict";

  // ---------- Utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const chance = (p) => Math.random() < p;
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- DOM ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const elHeroStats = document.getElementById("heroStats");
  const elAreaInfo = document.getElementById("areaInfo");
  const elInventory = document.getElementById("inventory");
  const elCombatBox = document.getElementById("combatBox");
  const elCombatActions = document.getElementById("combatActions");
  const elLog = document.getElementById("log");
  const elLogCard = document.getElementById("logCard");
  const elPill = document.getElementById("pill");

  const btnNew = document.getElementById("btnNew");
  const btnSave = document.getElementById("btnSave");
  const btnLoad = document.getElementById("btnLoad");
  const btnHelp = document.getElementById("btnHelp");
  const btnHud = document.getElementById("btnHud");
  const hud = document.getElementById("hud");

  const helpDialog = document.getElementById("helpDialog");

  const invDialog = document.getElementById("invDialog");
  const shopDialog = document.getElementById("shopDialog");
  const elInvContent = document.getElementById("invContent");
  const elShopContent = document.getElementById("shopContent");
  const btnUsePotion = document.getElementById("btnUsePotion");
  const btnCloseInv = document.getElementById("btnCloseInv");
  const btnCloseShop = document.getElementById("btnCloseShop");

  const storyDialog = document.getElementById("storyDialog");
  const storyTitle = document.getElementById("storyTitle");
  const storyBody = document.getElementById("storyBody");
  const storyBtn1 = document.getElementById("storyBtn1");
  const storyBtn2 = document.getElementById("storyBtn2");

  // ---------- Game constants ----------
  const TILE = 24;
  const MAP_W = 26;
  const MAP_H = 16;

  // Tile types
  const T = {
    FLOOR: 0,
    WALL: 1,
    GRASS: 2,
    CHEST: 3,
    WATER: 4,
    SIGN: 5,
    SHOP: 6,
    NPC: 7,
    DOOR: 8,
    BOSS: 9,
  };

  const ENCOUNTER_RATE_GRASS = 0.12;
  const ENCOUNTER_RATE_FLOOR = 0.02;
  const STORAGE_KEY = "mini_rpg_save_procedural_v1";

  // ---------- Maps ----------
  const mapsSrc = {
    town: [
      "##########################",
      "#....\"\"\"\"\"\"....#....\"\"\"\"\"#",
      "#....\"~~~~\"....#....\"\"\"\"\"#",
      "#....\"~~~~\"....#..........#",
      "#....\"\"\"\"\"\"....#####..C...#",
      "#..........S....N....E....#",
      "#####..#########..######..#",
      "#....\"\"\"\"\"\"....#..#....#..#",
      "#....\"\"\"\"\"\"....#..#....#..#",
      "#....\"\"C\"\"\"....#..#....#..#",
      "#....\"\"\"\"\"\"....#..######..#",
      "#..........####......D....#",
      "#..C................\"\"\"\"\"#",
      "#...........\"\"\"\"\"\"...\"\"\"\"#",
      "#...........\"\"\"\"\"\"...\"\"\"\"#",
      "##########################",
    ],
    dungeon: [
      "##########################",
      "#..........#.............#",
      "#..######..#..######.....#",
      "#..#....#..#..#....#.....#",
      "#..#....#..#..#....#..C..#",
      "#..#....#..#..#....#.....#",
      "#..#....####..#....#######",
      "#..#.....................#",
      "#..######..##########....#",
      "#.......#..#........#....#",
      "#######.#..#..B.....#....#",
      "#.....#.#..#........#....#",
      "#..C..#....##########....#",
      "#.....#.................D#",
      "#.........................#",
      "##########################",
    ],
  };

  function parseMap(src) {
    const grid = [];
    for (let y = 0; y < MAP_H; y++) {
      const row = [];
      for (let x = 0; x < MAP_W; x++) {
        const ch = src[y][x];
        let t = T.FLOOR;
        if (ch === "#") t = T.WALL;
        else if (ch === '"') t = T.GRASS;
        else if (ch === "~") t = T.WATER;
        else if (ch === "C") t = T.CHEST;
        else if (ch === "S") t = T.SIGN;
        else if (ch === "N") t = T.SHOP;
        else if (ch === "E") t = T.NPC;
        else if (ch === "D") t = T.DOOR;
        else if (ch === "B") t = T.BOSS;
        row.push(t);
      }
      grid.push(row);
    }
    return grid;
  }

  const world = {
    maps: {
      town: parseMap(mapsSrc.town),
      dungeon: parseMap(mapsSrc.dungeon),
    },
    current: "town",
  };

  function grid() {
    return world.maps[world.current];
  }

  // ---------- State ----------
  const defaultState = () => ({
    meta: { version: 1, savedAt: null },
    rngSeed: Math.floor(Math.random() * 1e9),

    hero: {
      map: "town",
      x: 2,
      y: 2,
      dir: "down",

      level: 1,
      xp: 0,
      xpToNext: 25,
      gold: 0,

      hp: 30,
      hpMax: 30,
      mp: 12,
      mpMax: 12,

      atk: 6,
      def: 2,

      potions: 2,

      weapon: { name: "Rusty Sword", atk: 0 },
      armor: { name: "Worn Coat", def: 0 },

      statuses: {},
    },

    quests: {
      elder: "not_started", // not_started | active | boss_defeated | completed
    },

    world: {
      openedChests: {}, // key "map:x,y" => true
      signRead: false,
      bossDefeated: false,
    },

    ui: { showLog: true, hudHiddenMobile: true },

    combat: null,

    log: [],
    turn: 0,
  });

  let state = defaultState();

  // ---------- Animation/FX state ----------
  const anim = {
    time: 0,
    heroPx: { x: 0, y: 0 },
    heroTarget: { x: 0, y: 0 },
    cam: { x: 0, y: 0 },
    shake: { t: 0, power: 0 },
    floaters: [],
    particles: [],
  };

  function worldToPx(tx, ty) {
    return { x: tx * TILE, y: ty * TILE };
  }

  function initAnimPositions() {
    const p = worldToPx(state.hero.x, state.hero.y);
    anim.heroPx = { ...p };
    anim.heroTarget = { ...p };
    anim.cam = { ...p };
  }

  initAnimPositions();

  // ---------- Procedural Tiles (code-only sprites) ----------
  const PT = { size: 16, cache: new Map() };

  function hash2(a, b) {
    let x = (a * 374761393 + b * 668265263) | 0;
    x = (x ^ (x >> 13)) | 0;
    x = (x * 1274126177) | 0;
    return (x ^ (x >> 16)) >>> 0;
  }

  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function setPx(data, i, r, g, b, a = 255) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }

  function makeTileCanvas(drawFn, key) {
    if (PT.cache.has(key)) return PT.cache.get(key);
    const c = document.createElement("canvas");
    c.width = PT.size;
    c.height = PT.size;
    const g = c.getContext("2d");
    const img = g.createImageData(PT.size, PT.size);
    drawFn(img.data, PT.size);
    g.putImageData(img, 0, 0);
    PT.cache.set(key, c);
    return c;
  }

  function drawNoiseTile(baseRGB, variance, seed, extraFn = null) {
    return makeTileCanvas(
      (data, s) => {
        const rand = prng(seed);
        for (let y = 0; y < s; y++) {
          for (let x = 0; x < s; x++) {
            const n = (rand() - 0.5) * 2;
            const r = clamp(Math.round(baseRGB[0] + n * variance), 0, 255);
            const g = clamp(Math.round(baseRGB[1] + n * variance), 0, 255);
            const b = clamp(Math.round(baseRGB[2] + n * variance), 0, 255);
            const i = (y * s + x) * 4;
            setPx(data, i, r, g, b, 255);
          }
        }
        extraFn?.(data, s, rand);
      },
      `noise:${baseRGB.join(",")}:${variance}:${seed}:${extraFn ? 1 : 0}`
    );
  }

  function drawGrassTile(seed) {
    return makeTileCanvas(
      (data, s) => {
        const rand = prng(seed);
        for (let y = 0; y < s; y++) {
          for (let x = 0; x < s; x++) {
            const n = (rand() - 0.5) * 2;
            const r = clamp(22 + n * 10, 0, 255);
            const g = clamp(70 + n * 18, 0, 255);
            const b = clamp(40 + n * 10, 0, 255);
            const i = (y * s + x) * 4;
            setPx(data, i, r | 0, g | 0, b | 0, 255);
            if (rand() < 0.06) setPx(data, i, (r + 8) | 0, (g + 25) | 0, (b + 8) | 0, 255);
          }
        }
      },
      `grass:${seed}`
    );
  }

  function drawDirtTile(seed) {
    return drawNoiseTile([96, 66, 40], 18, seed, (data, s, rand) => {
      for (let k = 0; k < 10; k++) {
        const x = (rand() * s) | 0,
          y = (rand() * s) | 0;
        const i = (y * s + x) * 4;
        setPx(data, i, 120, 92, 64, 255);
      }
    });
  }

  function drawStoneTile(seed) {
    return drawNoiseTile([90, 92, 102], 14, seed, (data, s, rand) => {
      for (let y = 0; y < s; y++) {
        if (y % 5 === 0) {
          for (let x = 0; x < s; x++) {
            const i = (y * s + x) * 4;
            setPx(data, i, 70, 72, 82, 255);
          }
        }
      }
      for (let x = 0; x < s; x++) {
        if (x % 6 === 0) {
          for (let y = 0; y < s; y++) {
            const i = (y * s + x) * 4;
            setPx(data, i, 72, 74, 84, 255);
          }
        }
      }
      for (let k = 0; k < 12; k++) {
        const x = (rand() * s) | 0,
          y = (rand() * s) | 0;
        const i = (y * s + x) * 4;
        setPx(data, i, 110, 112, 124, 255);
      }
    });
  }

  function drawWaterTile(seed, frame) {
    // animated by slightly shifting the seed + adding brighter ripples
    return drawNoiseTile([18, 62, 96], 12, seed ^ (frame * 9973), (data, s, rand) => {
      for (let k = 0; k < 10; k++) {
        const x = (rand() * s) | 0,
          y = (rand() * s) | 0;
        const i = (y * s + x) * 4;
        setPx(data, i, 40, 120, 160, 255);
      }
      // a couple horizontal highlights
      const yy = (frame % s) | 0;
      for (let x = 0; x < s; x++) {
        const i = (yy * s + x) * 4;
        data[i] = clamp(data[i] + 10, 0, 255);
        data[i + 1] = clamp(data[i + 1] + 18, 0, 255);
        data[i + 2] = clamp(data[i + 2] + 18, 0, 255);
      }
    });
  }

  function drawWallPiece(kind, seed) {
    return makeTileCanvas(
      (data, s) => {
        const rand = prng(seed);

        // base stone with vertical lighting
        for (let y = 0; y < s; y++) {
          for (let x = 0; x < s; x++) {
            const n = (rand() - 0.5) * 2;
            let r = 70 + n * 10;
            let g = 72 + n * 10;
            let b = 84 + n * 10;
            const light = 1 - (y / (s - 1)) * 0.5;
            r *= light;
            g *= light;
            b *= light;
            const i = (y * s + x) * 4;
            setPx(data, i, clamp(r, 0, 255) | 0, clamp(g, 0, 255) | 0, clamp(b, 0, 255) | 0, 255);
          }
        }

        const darkenLineX = (x0, amount) => {
          for (let y = 0; y < s; y++) {
            const i = (y * s + x0) * 4;
            data[i] = clamp(data[i] - amount, 0, 255);
            data[i + 1] = clamp(data[i + 1] - amount, 0, 255);
            data[i + 2] = clamp(data[i + 2] - amount, 0, 255);
          }
        };
        const darkenLineY = (y0, amount) => {
          for (let x = 0; x < s; x++) {
            const i = (y0 * s + x) * 4;
            data[i] = clamp(data[i] - amount, 0, 255);
            data[i + 1] = clamp(data[i + 1] - amount, 0, 255);
            data[i + 2] = clamp(data[i + 2] - amount, 0, 255);
          }
        };
        const brightenLineY = (y0, amount) => {
          for (let x = 0; x < s; x++) {
            const i = (y0 * s + x) * 4;
            data[i] = clamp(data[i] + amount, 0, 255);
            data[i + 1] = clamp(data[i + 1] + amount, 0, 255);
            data[i + 2] = clamp(data[i + 2] + amount, 0, 255);
          }
        };

        if (kind === "top") {
          brightenLineY(0, 25);
          darkenLineY(s - 1, 18);
        } else if (kind === "bottom") {
          darkenLineY(0, 12);
          darkenLineY(s - 1, 22);
        } else if (kind === "left") {
          darkenLineX(s - 1, 18);
          for (let y = 0; y < s; y++) {
            const i = (y * s + 0) * 4;
            data[i] = clamp(data[i] + 18, 0, 255);
            data[i + 1] = clamp(data[i + 1] + 18, 0, 255);
            data[i + 2] = clamp(data[i + 2] + 18, 0, 255);
          }
        } else if (kind === "right") {
          darkenLineX(0, 18);
          for (let y = 0; y < s; y++) {
            const i = (y * s + (s - 1)) * 4;
            data[i] = clamp(data[i] + 18, 0, 255);
            data[i + 1] = clamp(data[i + 1] + 18, 0, 255);
            data[i + 2] = clamp(data[i + 2] + 18, 0, 255);
          }
        } else if (kind.startsWith("inner_")) {
          const side = kind.slice(6); // tl,tr,bl,br
          if (side.includes("t")) brightenLineY(0, 20);
          if (side.includes("b")) darkenLineY(s - 1, 18);
          if (side.includes("l")) darkenLineX(s - 1, 14);
          if (side.includes("r")) darkenLineX(0, 14);

          for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
              const notch =
                (side === "tl" && x > 10 && y > 10) ||
                (side === "tr" && x < 5 && y > 10) ||
                (side === "bl" && x > 10 && y < 5) ||
                (side === "br" && x < 5 && y < 5);
              if (notch) {
                const i = (y * s + x) * 4;
                data[i] = clamp(data[i] - 22, 0, 255);
                data[i + 1] = clamp(data[i + 1] - 22, 0, 255);
                data[i + 2] = clamp(data[i + 2] - 22, 0, 255);
              }
            }
          }
        }

        // micro highlights
        for (let k = 0; k < 10; k++) {
          const x = (rand() * s) | 0,
            y = (rand() * s) | 0;
          const i = (y * s + x) * 4;
          data[i] = clamp(data[i] + 18, 0, 255);
          data[i + 1] = clamp(data[i + 1] + 18, 0, 255);
          data[i + 2] = clamp(data[i + 2] + 18, 0, 255);
        }
      },
      `wall:${kind}:${seed}`
    );
  }

  function isWallAt(x, y) {
    const t = grid()[y]?.[x];
    return t === T.WALL;
  }

  function getWallVariant(x, y) {
    const up = isWallAt(x, y - 1);
    const down = isWallAt(x, y + 1);
    const left = isWallAt(x - 1, y);
    const right = isWallAt(x + 1, y);

    // inner corners
    if (!up && left && down && !right) return "inner_tr";
    if (!up && right && down && !left) return "inner_tl";
    if (!down && left && up && !right) return "inner_br";
    if (!down && right && up && !left) return "inner_bl";

    // edges
    if (!up && down) return "top";
    if (!down && up) return "bottom";
    if (!left && right) return "left";
    if (!right && left) return "right";

    // fallback
    return "top";
  }

  function getProceduralTile(drawType, x, y) {
    const baseSeed = hash2(state.rngSeed ?? 12345, hash2(x, y));
    const waterFrame = (anim.time / 10) | 0;

    if (drawType === T.GRASS) return drawGrassTile(baseSeed);
    if (drawType === T.WATER) return drawWaterTile(baseSeed, waterFrame);

    if (drawType === T.FLOOR) {
      return world.current === "dungeon" ? drawStoneTile(baseSeed) : drawDirtTile(baseSeed);
    }

    if (drawType === T.CHEST) return drawNoiseTile([92, 62, 30], 12, baseSeed);
    if (drawType === T.SIGN) return drawNoiseTile([82, 82, 82], 8, baseSeed);
    if (drawType === T.SHOP) return drawNoiseTile([55, 35, 75], 10, baseSeed);
    if (drawType === T.NPC) return drawNoiseTile([70, 30, 80], 10, baseSeed);
    if (drawType === T.DOOR) return drawNoiseTile([92, 75, 40], 10, baseSeed);
    if (drawType === T.BOSS) return drawNoiseTile([92, 24, 24], 10, baseSeed);

    return drawStoneTile(baseSeed);
  }

  // ---------- Logging ----------
  function addLog(msg) {
    state.log.unshift(`[${String(state.turn).padStart(3, "0")}] ${msg}`);
    state.log = state.log.slice(0, 80);
    renderHUD();
  }

  // ---------- Stats helpers ----------
  function getHeroAtk() {
    return state.hero.atk + (state.hero.weapon?.atk ?? 0);
  }
  function getHeroDef() {
    return state.hero.def + (state.hero.armor?.def ?? 0);
  }

  // ---------- Status effects ----------
  function addStatus(target, name, data) {
    if (!target.statuses) target.statuses = {};
    target.statuses[name] = { ...data };
  }
  function hasStatus(target, name) {
    return !!target.statuses?.[name];
  }
  function tickStatuses(target, label) {
    if (!target.statuses) return;

    if (target.statuses.poison) {
      const s = target.statuses.poison;
      target.hp = clamp(target.hp - s.dmg, 0, target.hpMax);
      addLog(`${label} suffers ${s.dmg} poison damage.`);
      s.turns -= 1;
      if (s.turns <= 0) delete target.statuses.poison;
    }

    if (target.statuses.burn) {
      const s = target.statuses.burn;
      target.hp = clamp(target.hp - s.dmg, 0, target.hpMax);
      addLog(`${label} takes ${s.dmg} burn damage.`);
      s.turns -= 1;
      if (s.turns <= 0) delete target.statuses.burn;
    }

    if (target.statuses.stun) {
      const s = target.statuses.stun;
      s.turns -= 1;
      if (s.turns <= 0) delete target.statuses.stun;
    }
  }

  // ---------- FX helpers ----------
  function shake(power = 6, frames = 10) {
    anim.shake.power = power;
    anim.shake.t = frames;
  }

  function spawnFloater(text, px, py) {
    anim.floaters.push({ text, x: px, y: py, vy: -0.55, life: 60 });
  }

  function spawnParticles(px, py, n = 10) {
    for (let i = 0; i < n; i++) {
      anim.particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 2.2,
        vy: (Math.random() - 0.8) * 2.2,
        life: 28 + Math.floor(Math.random() * 22),
      });
    }
  }

  function updateAndDrawFX() {
    // particles
    for (const p of anim.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life--;
      ctx.globalAlpha = Math.max(0, p.life / 40);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(p.x, p.y, 2, 2);
      ctx.globalAlpha = 1;
    }
    anim.particles = anim.particles.filter((p) => p.life > 0);

    // floaters
    ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
    for (const f of anim.floaters) {
      f.y += f.vy;
      f.life--;
      ctx.globalAlpha = Math.max(0, f.life / 60);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    anim.floaters = anim.floaters.filter((f) => f.life > 0);
  }

  // ---------- Rendering ----------
  function drawHero(px, py) {
    // code-only hero (tiny pixel person)
    ctx.save();
    ctx.translate(px, py);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(TILE / 2, TILE - 5, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = "rgba(215,227,255,1)";
    ctx.fillRect(8, 7, 8, 10);

    // head
    ctx.fillStyle = "rgba(255,224,190,1)";
    ctx.fillRect(9, 3, 6, 5);

    // accent (cloak)
    ctx.fillStyle = "rgba(122,162,255,0.95)";
    ctx.fillRect(7, 10, 10, 6);

    // direction hint
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    if (state.hero.dir === "up") ctx.fillRect(11, 2, 2, 2);
    if (state.hero.dir === "down") ctx.fillRect(11, 8, 2, 2);
    if (state.hero.dir === "left") ctx.fillRect(8, 6, 2, 2);
    if (state.hero.dir === "right") ctx.fillRect(14, 6, 2, 2);

    ctx.restore();
  }

  function drawBar(x, y, w, h, v, max) {
    const pct = clamp(v / max, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(87,227,137,0.9)";
    ctx.fillRect(x, y, Math.floor(w * pct), h);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(x, y, w, h);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    anim.time++;

    // Smooth hero render position
    anim.heroPx.x = lerp(anim.heroPx.x, anim.heroTarget.x, 0.22);
    anim.heroPx.y = lerp(anim.heroPx.y, anim.heroTarget.y, 0.22);

    // Camera follows
    anim.cam.x = lerp(anim.cam.x, anim.heroPx.x, 0.10);
    anim.cam.y = lerp(anim.cam.y, anim.heroPx.y, 0.10);

    // Shake
    let shakeX = 0,
      shakeY = 0;
    if (anim.shake.t > 0) {
      anim.shake.t--;
      shakeX = (Math.random() - 0.5) * anim.shake.power;
      shakeY = (Math.random() - 0.5) * anim.shake.power;
    }

    // Camera transform
    ctx.save();
    ctx.translate(
      Math.round(canvas.width / 2 - anim.cam.x - TILE / 2 + shakeX),
      Math.round(canvas.height / 2 - anim.cam.y - TILE / 2 + shakeY)
    );

    // Draw map (procedural tiles)
    const g = grid();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        let t = g[y][x];

        // opened chest becomes floor
        if (t === T.CHEST && state.world.openedChests[`${world.current}:${x},${y}`]) {
          t = T.FLOOR;
        }

        let tileCanvas;
        if (t === T.WALL) {
          const variant = getWallVariant(x, y);
          const seed = hash2(state.rngSeed ?? 12345, hash2(x, y));
          tileCanvas = drawWallPiece(variant, seed);
        } else {
          tileCanvas = getProceduralTile(t, x, y);
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tileCanvas, x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Hero
    drawHero(anim.heroPx.x, anim.heroPx.y);

    // FX
    updateAndDrawFX();

    ctx.restore();

    // Combat overlay
    if (state.combat) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const w = 560,
        h = 260;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;

      ctx.fillStyle = "rgba(15,24,48,0.92)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(x, y, w, h);

      const e = state.combat.enemy;

      ctx.fillStyle = "#ffefef";
      ctx.font = "16px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(`${e.name} (Lv ${e.level})`, x + 18, y + 38);
      drawBar(x + 18, y + 52, 260, 12, e.hp, e.hpMax);

      ctx.fillStyle = "#e7ecff";
      ctx.fillText("You", x + 18, y + 128);
      drawBar(x + 18, y + 142, 260, 12, state.hero.hp, state.hero.hpMax);

      // MP bar
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x + 18, y + 160, 260, 10);
      ctx.fillStyle = "rgba(122,162,255,0.9)";
      ctx.fillRect(x + 18, y + 160, Math.floor(260 * clamp(state.hero.mp / state.hero.mpMax, 0, 1)), 10);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.strokeRect(x + 18, y + 160, 260, 10);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("Use actions in the HUD (or press 1-7).", x + 18, y + 220);
    }

    requestAnimationFrame(draw);
  }

  // ---------- HUD ----------
  function renderHUD() {
    elHeroStats.textContent = [
      `Lv: ${state.hero.level}`,
      `HP: ${state.hero.hp}/${state.hero.hpMax}`,
      `MP: ${state.hero.mp}/${state.hero.mpMax}`,
      `ATK: ${getHeroAtk()}  DEF: ${getHeroDef()}`,
      `XP: ${state.hero.xp}/${state.hero.xpToNext}`,
      `Gold: ${state.hero.gold}`,
      `Weapon: ${state.hero.weapon?.name ?? "None"} (+${state.hero.weapon?.atk ?? 0})`,
      `Armor: ${state.hero.armor?.name ?? "None"} (+${state.hero.armor?.def ?? 0})`,
    ].join("\n");

    const t = grid()[state.hero.y][state.hero.x];
    const tileName =
      t === T.FLOOR ? (world.current === "dungeon" ? "Stone floor" : "Dirt path") :
      t === T.GRASS ? "Tall grass" :
      t === T.WALL ? "Wall" :
      t === T.WATER ? "Water" :
      t === T.CHEST ? "Chest" :
      t === T.SIGN ? "Sign" :
      t === T.SHOP ? "Shop" :
      t === T.NPC ? "Elder" :
      t === T.DOOR ? "Gate" :
      t === T.BOSS ? "Boss altar" :
      "Unknown";

    elAreaInfo.textContent = [
      `Map: ${world.current}`,
      `Pos: (${state.hero.x}, ${state.hero.y})`,
      `Tile: ${tileName}`,
      state.combat ? `Status: IN COMBAT` : `Status: Exploring`,
      `Quest: Elder = ${state.quests.elder}`,
    ].join("\n");

    elInventory.textContent = [
      `Potions: ${state.hero.potions}`,
      `Press I to open`,
    ].join("\n");

    if (!state.combat) {
      elCombatBox.textContent = "No combat.";
      elCombatActions.classList.add("hidden");
      elPill.textContent = "Exploring";
    } else {
      const e = state.combat.enemy;
      elCombatBox.textContent = [
        `${e.name} (Lv ${e.level})`,
        `HP: ${e.hp}/${e.hpMax}`,
        `Enemy intent: ${e.intent}`,
        "",
        `Your turn: ${state.combat.turn === "hero" ? "YES" : "NO"}`,
      ].join("\n");
      elCombatActions.classList.remove("hidden");
      elPill.textContent = "Combat!";
    }

    elLogCard.classList.toggle("hidden", !state.ui.showLog);

    // mobile HUD visibility
    hud.classList.toggle("isHidden", state.ui.hudHiddenMobile);

    elLog.textContent = state.log.join("\n");
  }

  // ---------- Inventory ----------
  function renderInventoryDialog() {
    elInvContent.textContent = [
      `Gold: ${state.hero.gold}`,
      `Potions: ${state.hero.potions}`,
      "",
      `Weapon: ${state.hero.weapon?.name ?? "None"} (+${state.hero.weapon?.atk ?? 0} ATK)`,
      `Armor:  ${state.hero.armor?.name ?? "None"} (+${state.hero.armor?.def ?? 0} DEF)`,
      "",
      `HP: ${state.hero.hp}/${state.hero.hpMax}`,
      `MP: ${state.hero.mp}/${state.hero.mpMax}`,
      `ATK: ${getHeroAtk()}  DEF: ${getHeroDef()}`,
    ].join("\n");
  }

  function openInventory() {
    renderInventoryDialog();
    invDialog.showModal();
  }

  function usePotionOutsideCombat() {
    if (state.combat) return;
    if (state.hero.potions <= 0) {
      addLog("No potions left.");
      return;
    }
    state.hero.potions -= 1;
    const amt = Math.round(state.hero.hpMax * 0.35) + rnd(2, 6);
    state.hero.hp = clamp(state.hero.hp + amt, 0, state.hero.hpMax);
    addLog(`You drink a potion and restore ${amt} HP.`);
    state.turn++;
    renderHUD();
    renderInventoryDialog();
  }

  // ---------- Shop + Loot ----------
  function rollRarity() {
    const r = Math.random();
    if (r < 0.70) return { name: "Common", mult: 1.0 };
    if (r < 0.93) return { name: "Rare", mult: 1.25 };
    return { name: "Epic", mult: 1.55 };
  }

  function randomWeapon() {
    const baseNames = ["Iron Dagger", "Steel Shortsword", "Knight Blade", "Hunter Spear", "Moonfang"];
    const prefixes = ["Plain", "Sharpened", "Vicious", "Gleaming", "Runed"];
    const rar = rollRarity();
    const base = rnd(1, 5) + Math.floor(state.hero.level / 2);
    const atk = Math.max(1, Math.round(base * rar.mult));
    const name = `${rar.name} ${prefixes[rnd(0, prefixes.length - 1)]} ${baseNames[rnd(0, baseNames.length - 1)]}`;
    return { name, atk };
  }

  function randomArmor() {
    const baseNames = ["Leather Vest", "Chain Shirt", "Guard Plate", "Wolfhide Cloak", "Starsewn Mail"];
    const prefixes = ["Sturdy", "Padded", "Blessed", "Reinforced", "Runed"];
    const rar = rollRarity();
    const base = rnd(1, 5) + Math.floor(state.hero.level / 2);
    const def = Math.max(1, Math.round(base * rar.mult));
    const name = `${rar.name} ${prefixes[rnd(0, prefixes.length - 1)]} ${baseNames[rnd(0, baseNames.length - 1)]}`;
    return { name, def };
  }

  function renderShopDialog() {
    elShopContent.textContent = [
      `Your gold: ${state.hero.gold}`,
      "",
      `Potion: 10g`,
      `Weapon: 35g`,
      `Armor:  35g`,
      "",
      `Current Weapon: ${state.hero.weapon.name} (+${state.hero.weapon.atk} ATK)`,
      `Current Armor:  ${state.hero.armor.name} (+${state.hero.armor.def} DEF)`,
    ].join("\n");
  }

  function openShop() {
    renderShopDialog();
    shopDialog.showModal();
  }

  function buy(item) {
    const costs = { potion: 10, weapon: 35, armor: 35 };
    const cost = costs[item];
    if (state.hero.gold < cost) {
      addLog("Not enough gold.");
      return;
    }
    state.hero.gold -= cost;

    if (item === "potion") {
      state.hero.potions += 1;
      addLog("Bought 1 potion.");
    }

    if (item === "weapon") {
      const w = randomWeapon();
      if (w.atk > state.hero.weapon.atk) {
        state.hero.weapon = w;
        addLog(`Bought & equipped: ${w.name} (+${w.atk} ATK).`);
      } else {
        addLog(`Bought: ${w.name} (+${w.atk} ATK). Not better than current.`);
      }
    }

    if (item === "armor") {
      const a = randomArmor();
      if (a.def > state.hero.armor.def) {
        state.hero.armor = a;
        addLog(`Bought & equipped: ${a.name} (+${a.def} DEF).`);
      } else {
        addLog(`Bought: ${a.name} (+${a.def} DEF). Not better than current.`);
      }
    }

    state.turn++;
    renderHUD();
    renderShopDialog();
  }

  // ---------- Story dialog ----------
  function showStory(title, body, btn1 = { text: "OK", onClick: null }, btn2 = null) {
    storyTitle.textContent = title;
    storyBody.textContent = body;

    storyBtn1.textContent = btn1.text;
    storyBtn1.onclick = () => {
      storyDialog.close();
      btn1.onClick?.();
      renderHUD();
    };

    if (btn2) {
      storyBtn2.classList.remove("hidden");
      storyBtn2.textContent = btn2.text;
      storyBtn2.onclick = () => {
        storyDialog.close();
        btn2.onClick?.();
        renderHUD();
      };
    } else {
      storyBtn2.classList.add("hidden");
      storyBtn2.onclick = null;
    }

    storyDialog.showModal();
  }

  // ---------- Movement & Interaction ----------
  function isPassable(x, y) {
    const t = grid()[y]?.[x];
    if (t == null) return false;
    if (t === T.WALL || t === T.WATER) return false;
    return true;
  }

  function setMap(mapName, x, y) {
    world.current = mapName;
    state.hero.map = mapName;
    state.hero.x = x;
    state.hero.y = y;

    const p = worldToPx(x, y);
    anim.heroTarget = { ...p };

    addLog(`You arrive at: ${mapName}.`);
    renderHUD();
  }

  function move(dx, dy) {
    if (state.combat) return;

    const nx = state.hero.x + dx;
    const ny = state.hero.y + dy;

    if (dx === 1) state.hero.dir = "right";
    if (dx === -1) state.hero.dir = "left";
    if (dy === 1) state.hero.dir = "down";
    if (dy === -1) state.hero.dir = "up";

    if (!isPassable(nx, ny)) {
      addLog("You bump into something.");
      state.turn++;
      return;
    }

    state.hero.x = nx;
    state.hero.y = ny;
    anim.heroTarget = worldToPx(nx, ny);

    const t = grid()[ny][nx];

    // Boss tile triggers boss fight once
    if (t === T.BOSS && !state.world.bossDefeated) {
      startBossCombat();
      return;
    }

    // Random encounter
    const p = t === T.GRASS ? ENCOUNTER_RATE_GRASS : t === T.FLOOR ? ENCOUNTER_RATE_FLOOR : 0;
    if (p > 0 && chance(p)) startCombat();
    else {
      state.turn++;
      renderHUD();
    }
  }

  function facingTile() {
    let { x, y, dir } = state.hero;
    if (dir === "up") y--;
    if (dir === "down") y++;
    if (dir === "left") x--;
    if (dir === "right") x++;
    return { x, y };
  }

  function interact() {
    if (state.combat) return;

    const { x, y } = facingTile();
    const t = grid()[y]?.[x];
    if (t == null) return;

    if (t === T.DOOR) {
      if (world.current === "town") setMap("dungeon", 2, 2);
      else setMap("town", 22, 11);
      state.turn++;
      return;
    }

    if (t === T.SHOP) {
      openShop();
      return;
    }

    if (t === T.NPC) {
      const q = state.quests.elder;

      if (q === "not_started") {
        showStory(
          "Elder",
          "Traveler… a dark presence lurks in the dungeon.\nDefeat the beast on the red altar (B) and return.\n\nWill you accept this quest?",
          { text: "Accept", onClick: () => { state.quests.elder = "active"; addLog("Quest accepted: Defeat the dungeon boss."); state.turn++; } },
          { text: "Not now", onClick: () => { addLog("You decline for now."); state.turn++; } }
        );
        return;
      }

      if (q === "active") {
        showStory("Elder", "The dungeon gate is to the southeast.\nFind the red altar and defeat the beast.", { text: "I’m on it", onClick: () => { state.turn++; } });
        return;
      }

      if (q === "boss_defeated") {
        showStory(
          "Elder",
          "You did it! The town is safe.\nTake this reward: 80 gold and a potion stash.",
          { text: "Thanks", onClick: () => { state.hero.gold += 80; state.hero.potions += 3; state.quests.elder = "completed"; addLog("Quest complete! +80 gold, +3 potions."); state.turn++; } }
        );
        return;
      }

      showStory("Elder", "You’ve already done a great deed.\nTrain, explore, and grow stronger.", { text: "OK", onClick: () => { state.turn++; } });
      return;
    }

    if (t === T.SIGN) {
      state.world.signRead = true;
      addLog("Sign: 'Beware the tall grass. Treasure lies beyond the walls.'");
      state.turn++;
      renderHUD();
      return;
    }

    if (t === T.CHEST) {
      const key = `${world.current}:${x},${y}`;
      if (state.world.openedChests[key]) {
        addLog("The chest is empty.");
      } else {
        state.world.openedChests[key] = true;

        const gold = rnd(8, 20);
        state.hero.gold += gold;
        let lootMsg = `+${gold} gold`;

        if (chance(0.55)) {
          state.hero.potions += 1;
          lootMsg += " and +1 potion";
        }

        if (chance(0.25)) {
          if (chance(0.5)) {
            const w = randomWeapon();
            if (w.atk > state.hero.weapon.atk) {
              state.hero.weapon = w;
              lootMsg += ` and equipped ${w.name} (+${w.atk} ATK)`;
            } else {
              lootMsg += ` and found ${w.name} (+${w.atk} ATK)`;
            }
          } else {
            const a = randomArmor();
            if (a.def > state.hero.armor.def) {
              state.hero.armor = a;
              lootMsg += ` and equipped ${a.name} (+${a.def} DEF)`;
            } else {
              lootMsg += ` and found ${a.name} (+${a.def} DEF)`;
            }
          }
        }

        addLog(`You open the chest: ${lootMsg}!`);
      }

      state.turn++;
      renderHUD();
      return;
    }

    addLog("Nothing to interact with.");
    state.turn++;
    renderHUD();
  }

  // ---------- Combat ----------
  function makeEnemy(level) {
    const types = [
      { name: "Slime", hp: 16, atk: 4, def: 1, xp: 10, gold: [2, 6] },
      { name: "Goblin", hp: 22, atk: 6, def: 2, xp: 14, gold: [4, 10] },
      { name: "Wolf", hp: 20, atk: 7, def: 1, xp: 15, gold: [3, 9] },
      { name: "Wisp", hp: 18, atk: 8, def: 1, xp: 16, gold: [4, 12] },
    ];
    const base = types[rnd(0, types.length - 1)];
    const lv = clamp(level + rnd(-1, 1), 1, 99);
    const scale = 1 + (lv - 1) * 0.12;
    return {
      name: base.name,
      level: lv,
      hp: Math.round(base.hp * scale),
      hpMax: Math.round(base.hp * scale),
      atk: Math.round(base.atk * scale),
      def: Math.round(base.def * scale),
      xp: Math.round(base.xp * scale),
      gold: rnd(base.gold[0], base.gold[1]) + Math.floor(lv / 2),
      intent: "attack",
      statuses: {},
      enraged: false,
      isBoss: false,
    };
  }

  function startCombat() {
    const enemy = makeEnemy(state.hero.level);
    state.combat = { enemy, turn: "hero", heroDefending: false };
    addLog(`A wild ${enemy.name} appears!`);
    renderHUD();
  }

  function startBossCombat() {
    const enemy = {
      name: "Dungeon Beast",
      level: Math.max(3, state.hero.level + 1),
      hp: 80 + state.hero.level * 10,
      hpMax: 80 + state.hero.level * 10,
      atk: 10 + Math.floor(state.hero.level * 1.2),
      def: 4 + Math.floor(state.hero.level / 2),
      xp: 60 + state.hero.level * 10,
      gold: 50,
      intent: "attack",
      statuses: {},
      enraged: false,
      isBoss: true,
    };
    state.combat = { enemy, turn: "hero", heroDefending: false };
    addLog("A terrifying presence blocks your path… THE BOSS attacks!");
    renderHUD();
  }

  function calcDamage(attackerAtk, defenderDef, variance = 2) {
    const raw = attackerAtk - defenderDef;
    const v = rnd(-variance, variance);
    return clamp(raw + v, 1, 999);
  }

  function maybeLevelUp() {
    while (state.hero.xp >= state.hero.xpToNext) {
      state.hero.xp -= state.hero.xpToNext;
      state.hero.level += 1;

      const hpGain = 6 + rnd(0, 3);
      const atkGain = 1 + (chance(0.5) ? 1 : 0);
      const defGain = chance(0.6) ? 1 : 0;
      const mpGain = 3 + rnd(0, 2);

      state.hero.hpMax += hpGain;
      state.hero.atk += atkGain;
      state.hero.def += defGain;
      state.hero.mpMax += mpGain;

      state.hero.hp = state.hero.hpMax;
      state.hero.mp = state.hero.mpMax;

      state.hero.xpToNext = Math.round(state.hero.xpToNext * 1.35 + 10);

      addLog(`Level up! Lv ${state.hero.level}. +${hpGain} HP, +${atkGain} ATK, +${defGain} DEF, +${mpGain} MP.`);
    }
  }

  function endCombat(victory) {
    const e = state.combat.enemy;

    if (victory) {
      state.hero.xp += e.xp;
      state.hero.gold += e.gold;
      addLog(`Victory! You gain +${e.xp} XP and +${e.gold} gold.`);
      if (e.isBoss) {
        state.world.bossDefeated = true;
        if (state.quests.elder === "active") state.quests.elder = "boss_defeated";
        addLog("Boss defeated! Return to the Elder in town.");
      }
      maybeLevelUp();
    } else {
      addLog("You escape!");
    }

    state.combat = null;
    state.turn++;
    renderHUD();
  }

  function enemyAI() {
    const e = state.combat.enemy;
    const smart = e.isBoss ? 0.45 : 0.22;

    if ((hasStatus(e, "poison") || hasStatus(e, "burn")) && chance(0.25)) {
      e.intent = "defend";
      return "defend";
    }

    if (e.hp <= e.hpMax * 0.35 && !e.enraged && chance(smart)) {
      e.intent = "enrage";
      return "enrage";
    }

    if (!hasStatus(state.hero, "poison") && chance(smart)) {
      e.intent = "poison";
      return "poison";
    }

    if (chance(smart * 0.6)) {
      e.intent = "bolt";
      return "bolt";
    }

    e.intent = "attack";
    return "attack";
  }

  function defeatPenalty() {
    addLog("You are defeated... You wake up at full HP but lose some gold.");
    const lost = Math.floor(state.hero.gold * 0.25);
    state.hero.gold -= lost;
    state.hero.hp = state.hero.hpMax;
    state.hero.mp = state.hero.mpMax;
    state.combat = null;
    addLog(`You dropped ${lost} gold in the chaos.`);
    state.turn++;
    renderHUD();
  }

  function doEnemyTurn() {
    if (!state.combat) return;
    const e = state.combat.enemy;

    const act = enemyAI();

    if (act === "defend") {
      addLog(`${e.name} braces for impact.`);
      state.combat.turn = "hero";
      state.turn++;
      renderHUD();
      return;
    }

    if (act === "enrage") {
      e.enraged = true;
      e.atk += 3;
      addLog(`${e.name} becomes enraged! (+ATK)`);
      state.combat.turn = "hero";
      state.turn++;
      renderHUD();
      return;
    }

    const heroDef = getHeroDef() + (state.combat.heroDefending ? 3 : 0);

    if (act === "poison") {
      const dmg = calcDamage(e.atk, heroDef, 1);
      state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
      addLog(`${e.name} uses Poison Bite for ${dmg} damage!`);
      addStatus(state.hero, "poison", { turns: 3, dmg: 2 });
      addLog("You are poisoned!");
      state.combat.heroDefending = false;

      shake(7, 10);
      spawnFloater(`-${dmg}`, canvas.width / 2, canvas.height / 2);
      spawnParticles(anim.heroPx.x + 40, anim.heroPx.y + 20, 14);

      if (state.hero.hp <= 0) return defeatPenalty();
    } else if (act === "bolt") {
      const dmg = calcDamage(e.atk + 3, heroDef, 3);
      state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
      addLog(`${e.name} casts Arcane Bolt for ${dmg} damage!`);
      state.combat.heroDefending = false;

      shake(8, 10);
      spawnFloater(`-${dmg}`, canvas.width / 2, canvas.height / 2);
      spawnParticles(anim.heroPx.x + 40, anim.heroPx.y + 20, 18);

      if (state.hero.hp <= 0) return defeatPenalty();
    } else {
      const dmg = calcDamage(e.atk, heroDef, 2);
      state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
      addLog(`${e.name} attacks you for ${dmg} damage!`);
      state.combat.heroDefending = false;

      shake(7, 10);
      spawnFloater(`-${dmg}`, canvas.width / 2, canvas.height / 2);
      spawnParticles(anim.heroPx.x + 40, anim.heroPx.y + 20, 14);

      if (state.hero.hp <= 0) return defeatPenalty();
    }

    tickStatuses(state.hero, "You");
    if (hasStatus(state.hero, "stun")) {
      addLog("You are stunned and lose your turn!");
      state.combat.turn = "enemy";
      state.turn++;
      renderHUD();
      setTimeout(doEnemyTurn, 280);
      return;
    }

    state.combat.turn = "hero";
    state.turn++;
    renderHUD();
  }

  function takeAction(action) {
    if (!state.combat) return;
    if (state.combat.turn !== "hero") return;

    const e = state.combat.enemy;

    if (action === "attack") {
      const dmg = calcDamage(getHeroAtk(), e.def, 2);
      e.hp = clamp(e.hp - dmg, 0, e.hpMax);
      addLog(`You attack ${e.name} for ${dmg} damage!`);
      shake(5, 8);
      spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
      spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 12);
    }

    if (action === "defend") {
      state.combat.heroDefending = true;
      addLog("You defend (+3 DEF until the next hit).");
    }

    if (action === "heal") {
      if (state.hero.potions <= 0) addLog("No potions left!");
      else {
        state.hero.potions -= 1;
        const amt = Math.round(state.hero.hpMax * 0.35) + rnd(2, 6);
        state.hero.hp = clamp(state.hero.hp + amt, 0, state.hero.hpMax);
        addLog(`You drink a potion and restore ${amt} HP.`);
      }
    }

    if (action === "run") {
      const p = 0.45 + (state.hero.level - e.level) * 0.05;
      if (chance(clamp(p, 0.15, 0.9))) return endCombat(false);
      addLog("You fail to run away!");
    }

    // Skills
    if (action === "fireball") {
      const cost = 4;
      if (state.hero.mp < cost) addLog("Not enough MP for Fireball!");
      else {
        state.hero.mp -= cost;
        const dmg = calcDamage(getHeroAtk() + 4, e.def, 3);
        e.hp = clamp(e.hp - dmg, 0, e.hpMax);
        addLog(`You cast Fireball for ${dmg} damage!`);
        if (chance(0.35)) {
          addStatus(e, "burn", { turns: 3, dmg: 3 });
          addLog(`${e.name} is burning!`);
        }
        shake(6, 9);
        spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
        spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 18);
      }
    }

    if (action === "poison") {
      const cost = 3;
      if (state.hero.mp < cost) addLog("Not enough MP for Poison Strike!");
      else {
        state.hero.mp -= cost;
        const dmg = calcDamage(getHeroAtk(), e.def, 2);
        e.hp = clamp(e.hp - dmg, 0, e.hpMax);
        addLog(`You slash with Poison Strike for ${dmg} damage!`);
        addStatus(e, "poison", { turns: 4, dmg: 2 + Math.floor(state.hero.level / 3) });
        addLog(`${e.name} is poisoned!`);
        shake(5, 8);
        spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
        spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 14);
      }
    }

    if (action === "stun") {
      const cost = 2;
      if (state.hero.mp < cost) addLog("Not enough MP for Stun Bash!");
      else {
        state.hero.mp -= cost;
        const dmg = calcDamage(getHeroAtk() + 1, e.def, 1);
        e.hp = clamp(e.hp - dmg, 0, e.hpMax);
        addLog(`You smash for ${dmg} damage!`);
        if (chance(0.35)) {
          addStatus(e, "stun", { turns: 1 });
          addLog(`${e.name} is stunned!`);
        }
        shake(6, 9);
        spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
        spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 16);
      }
    }

    tickStatuses(e, e.name);

    if (e.hp <= 0) {
      addLog(`${e.name} is defeated.`);
      return endCombat(true);
    }

    if (hasStatus(e, "stun")) {
      addLog(`${e.name} is stunned and skips its turn!`);
      state.combat.turn = "hero";
      state.turn++;
      renderHUD();
      return;
    }

    state.combat.turn = "enemy";
    renderHUD();
    setTimeout(doEnemyTurn, 280);
  }

  // ---------- Save / Load ----------
  function saveGame() {
    const payload = structuredClone(state);
    payload.meta.savedAt = new Date().toISOString();
    payload.meta.version = 1;
    payload.hero.map = world.current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    addLog("Game saved.");
  }

  function loadGame() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return addLog("No save found.");
    try {
      const parsed = JSON.parse(raw);
      state = parsed;
      world.current = state.hero.map || "town";
      initAnimPositions();
      addLog(`Loaded save (${state.meta?.savedAt ?? "unknown time"}).`);
      renderHUD();
    } catch (e) {
      console.error(e);
      addLog("Failed to load save.");
    }
  }

  function newGame() {
    state = defaultState();
    world.current = "town";
    initAnimPositions();
    addLog("New adventure begins!");
    renderHUD();
  }

  // ---------- Input ----------
  const keysDown = new Set();

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    keysDown.add(e.key.toLowerCase());

    if (state.combat) {
      if (e.key === "1") takeAction("attack");
      if (e.key === "2") takeAction("defend");
      if (e.key === "3") takeAction("heal");
      if (e.key === "4") takeAction("run");
      if (e.key === "5") takeAction("fireball");
      if (e.key === "6") takeAction("poison");
      if (e.key === "7") takeAction("stun");
      return;
    }

    if (e.key.toLowerCase() === "e") interact();
    if (e.key.toLowerCase() === "l") { state.ui.showLog = !state.ui.showLog; renderHUD(); }
    if (e.key.toLowerCase() === "i") openInventory();
  });

  window.addEventListener("keyup", (e) => {
    keysDown.delete(e.key.toLowerCase());
  });

  // Movement loop for key-hold
  let lastMoveAt = 0;
  const MOVE_COOLDOWN = 120;

  function inputLoop(ts) {
    if (!state.combat && ts - lastMoveAt > MOVE_COOLDOWN) {
      const up = keysDown.has("w") || keysDown.has("arrowup");
      const down = keysDown.has("s") || keysDown.has("arrowdown");
      const left = keysDown.has("a") || keysDown.has("arrowleft");
      const right = keysDown.has("d") || keysDown.has("arrowright");

      if (up) { move(0, -1); lastMoveAt = ts; }
      else if (down) { move(0, 1); lastMoveAt = ts; }
      else if (left) { move(-1, 0); lastMoveAt = ts; }
      else if (right) { move(1, 0); lastMoveAt = ts; }
    }
    requestAnimationFrame(inputLoop);
  }

  // UI events
  elCombatActions.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    takeAction(btn.dataset.act);
  });

  btnNew.addEventListener("click", newGame);
  btnSave.addEventListener("click", saveGame);
  btnLoad.addEventListener("click", loadGame);
  btnHelp.addEventListener("click", () => helpDialog.showModal());

  btnHud.addEventListener("click", () => {
    state.ui.hudHiddenMobile = !state.ui.hudHiddenMobile;
    renderHUD();
  });

  btnUsePotion.addEventListener("click", usePotionOutsideCombat);
  btnCloseInv.addEventListener("click", () => invDialog.close());
  btnCloseShop.addEventListener("click", () => shopDialog.close());

  shopDialog.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-buy]");
    if (!btn) return;
    buy(btn.dataset.buy);
  });

  // ---------- Start ----------
  addLog("Welcome! Explore town, accept the Elder’s quest, and defeat the dungeon boss.");
  renderHUD();
  requestAnimationFrame(draw);
  requestAnimationFrame(inputLoop);
})();
