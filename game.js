/* Mini RPG - "Final" upgraded version (vanilla JS)
 * - Town + Dungeon maps, doors, NPC quest, boss
 * - Inventory modal, shop, equipment
 * - Mana + skills, status effects, enemy abilities
 * - Smooth movement, camera easing, shake, particles, floaters
 * - Optional sprites: ./assets/hero.png (16x16 frames, 3 columns, 4 rows)
 */

(() => {
  "use strict";

  // ---------- Utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const chance = (p) => Math.random() < p;
  const lerp = (a, b, t) => a + (b - a) * t;

  function nowISO() {
    return new Date().toISOString();
  }

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

  const btnNew = document.getElementById("btnNew");
  const btnSave = document.getElementById("btnSave");
  const btnLoad = document.getElementById("btnLoad");
  const btnHelp = document.getElementById("btnHelp");
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
    NPC: 7,   // Elder
    DOOR: 8,  // gate
    BOSS: 9,  // boss altar
  };

  const ENCOUNTER_RATE_GRASS = 0.12;
  const ENCOUNTER_RATE_FLOOR = 0.02;

  const STORAGE_KEY = "mini_rpg_save_v2";

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

  // ---------- Assets (optional sprites) ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  const assets = { hero: null };
  async function loadAssets() {
    try {
      assets.hero = await loadImage("./assets/hero.png");
    } catch {
      // no sprite, fallback to rectangle
    }
  }

  // ---------- State ----------
  const defaultState = () => ({
    meta: { version: 2, savedAt: null },
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

    ui: { showLog: true },

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

  // ---------- Logging ----------
  function addLog(msg) {
    state.log.unshift(`[${String(state.turn).padStart(3, "0")}] ${msg}`);
    state.log = state.log.slice(0, 70);
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
  function tileColor(t) {
    switch (t) {
      case T.FLOOR: return "#1a2a55";
      case T.WALL: return "#0c1226";
      case T.GRASS: return "#123c2c";
      case T.WATER: return "#0b2d4d";
      case T.CHEST: return "#3b2a12";
      case T.SIGN: return "#2b2b2b";
      case T.SHOP: return "#2a214a";
      case T.NPC: return "#3a1f4a";
      case T.DOOR: return "#4a3a13";
      case T.BOSS: return "#4a1515";
      default: return "#000";
    }
  }

  function dirToRow(dir) {
    if (dir === "down") return 0;
    if (dir === "left") return 1;
    if (dir === "right") return 2;
    return 3;
  }

  function drawHeroSprite(px, py) {
    // fallback
    if (!assets.hero) {
      ctx.fillStyle = "#d7e3ff";
      ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
      ctx.fillStyle = "#7aa2ff";
      ctx.fillRect(px + 10, py + 10, 4, 4);
      return;
    }

    // hero.png expected: 3 columns x 4 rows of 16x16 frames
    const frameW = 16, frameH = 16;
    const row = dirToRow(state.hero.dir);

    const moving =
      Math.abs(anim.heroPx.x - anim.heroTarget.x) +
        Math.abs(anim.heroPx.y - anim.heroTarget.y) >
      1;

    const frame = moving ? Math.floor(anim.time / 8) % 3 : 1;
    const sx = frame * frameW;
    const sy = row * frameH;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      assets.hero,
      sx, sy, frameW, frameH,
      px + 4, py + 4, TILE - 8, TILE - 8
    );
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
    let shakeX = 0, shakeY = 0;
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

    // Draw map
    const g = grid();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        let t = g[y][x];

        // opened chest becomes floor
        if (t === T.CHEST && state.world.openedChests[`${world.current}:${x},${y}`]) {
          t = T.FLOOR;
        }

        ctx.fillStyle = tileColor(t);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Hero
    drawHeroSprite(anim.heroPx.x, anim.heroPx.y);

    // FX
    updateAndDrawFX();

    ctx.restore();

    // Combat overlay
    if (state.combat) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const w = 520, h = 240;
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

      drawBar(x + 18, y + 52, 220, 12, e.hp, e.hpMax);

      ctx.fillStyle = "#e7ecff";
      ctx.fillText("You", x + 18, y + 120);
      drawBar(x + 18, y + 134, 220, 12, state.hero.hp, state.hero.hpMax);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("Choose an action on the right panel (or press 1-7).", x + 18, y + 210);
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
      t === T.FLOOR ? "Stone path" :
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
    }

    elLogCard.classList.toggle("hidden", !state.ui.showLog);
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
    // keep current smooth pos but update if you want instant snap:
    // anim.heroPx = { ...p };
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
    const p = (t === T.GRASS) ? ENCOUNTER_RATE_GRASS : (t === T.FLOOR ? ENCOUNTER_RATE_FLOOR : 0);
    if (p > 0 && chance(p)) {
      startCombat();
    } else {
      addLog("You move.");
      state.turn++;
    }
    renderHUD();
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
          {
            text: "Accept",
            onClick: () => {
              state.quests.elder = "active";
              addLog("Quest accepted: Defeat the dungeon boss.");
              state.turn++;
            },
          },
          {
            text: "Not now",
            onClick: () => {
              addLog("You decline for now.");
              state.turn++;
            },
          }
        );
        return;
      }

      if (q === "active") {
        showStory(
          "Elder",
          "The dungeon gate is to the southeast.\nFind the red altar and defeat the beast.",
          { text: "I’m on it", onClick: () => { state.turn++; } }
        );
        return;
      }

      if (q === "boss_defeated") {
        showStory(
          "Elder",
          "You did it! The town is safe.\nTake this reward: 80 gold and a potion stash.",
          {
            text: "Thanks",
            onClick: () => {
              state.hero.gold += 80;
              state.hero.potions += 3;
              state.quests.elder = "completed";
              addLog("Quest complete! +80 gold, +3 potions.");
              state.turn++;
            },
          }
        );
        return;
      }

      if (q === "completed") {
        showStory(
          "Elder",
          "You’ve already done a great deed.\nTrain, explore, and grow stronger.",
          { text: "OK", onClick: () => { state.turn++; } }
        );
        return;
      }
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

        // 25% chance: gear
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
    state.combat = { enemy, turn: "hero", heroDefending: false, lastAction: null };
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
    state.combat = { enemy, turn: "hero", heroDefending: false, lastAction: null };
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

      state.hero.hpMax += hpGain;
      state.hero.atk += atkGain;
      state.hero.def += defGain;

      const mpGain = 3 + rnd(0, 2);
      state.hero.mpMax += mpGain;

      state.hero.hp = state.hero.hpMax;
      state.hero.mp = state.hero.mpMax;

      state.hero.xpToNext = Math.round(state.hero.xpToNext * 1.35 + 10);

      addLog(
        `Level up! Lv ${state.hero.level}. +${hpGain} HP, +${atkGain} ATK, +${defGain} DEF, +${mpGain} MP.`
      );
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

    if (act === "poison") {
      const heroDef = getHeroDef() + (state.combat.heroDefending ? 3 : 0);
      const dmg = calcDamage(e.atk, heroDef, 1);
      state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
      addLog(`${e.name} uses Poison Bite for ${dmg} damage!`);
      addStatus(state.hero, "poison", { turns: 3, dmg: 2 });
      addLog(`You are poisoned!`);
      state.combat.heroDefending = false;

      shake(7, 10);
      spawnFloater(`-${dmg}`, canvas.width / 2, canvas.height / 2);
      spawnParticles(anim.heroPx.x + 40, anim.heroPx.y + 20, 14);

      if (state.hero.hp <= 0) {
        addLog("You are defeated... You wake up at full HP but lose some gold.");
        const lost = Math.floor(state.hero.gold * 0.25);
        state.hero.gold -= lost;
        state.hero.hp = state.hero.hpMax;
        state.hero.mp = state.hero.mpMax;
        state.combat = null;
        addLog(`You dropped ${lost} gold in the chaos.`);
        state.turn++;
        renderHUD();
        return;
      }

      // Start of hero turn status tick + stun check
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
      return;
    }

    if (act === "bolt") {
      const heroDef = getHeroDef() + (state.combat.heroDefending ? 3 : 0);
      const dmg = calcDamage(e.atk + 3, heroDef, 3);
      state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
      addLog(`${e.name} casts Arcane Bolt for ${dmg} damage!`);
      state.combat.heroDefending = false;

      shake(8, 10);
      spawnFloater(`-${dmg}`, canvas.width / 2, canvas.height / 2);
      spawnParticles(anim.heroPx.x + 40, anim.heroPx.y + 20, 18);

      if (state.hero.hp <= 0) {
        addLog("You are defeated... You wake up at full HP but lose some gold.");
        const lost = Math.floor(state.hero.gold * 0.25);
        state.hero.gold -= lost;
        state.hero.hp = state.hero.hpMax;
        state.hero.mp = state.hero.mpMax;
        state.combat = null;
        addLog(`You dropped ${lost} gold in the chaos.`);
        state.turn++;
        renderHUD();
        return;
      }

      // Start of hero turn status tick + stun check
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
      return;
    }

    // normal attack
    const heroDef = getHeroDef() + (state.combat.heroDefending ? 3 : 0);
    const dmg = calcDamage(e.atk, heroDef, 2);
    state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
    addLog(`${e.name} attacks you for ${dmg} damage!`);
    state.combat.heroDefending = false;

    shake(7, 10);
    spawnFloater(`-${dmg}`, canvas.width / 2, canvas.height / 2);
    spawnParticles(anim.heroPx.x + 40, anim.heroPx.y + 20, 14);

    if (state.hero.hp <= 0) {
      addLog("You are defeated... You wake up at full HP but lose some gold.");
      const lost = Math.floor(state.hero.gold * 0.25);
      state.hero.gold -= lost;
      state.hero.hp = state.hero.hpMax;
      state.hero.mp = state.hero.mpMax;
      state.combat = null;
      addLog(`You dropped ${lost} gold in the chaos.`);
      state.turn++;
      renderHUD();
      return;
    }

    // Start of hero turn: tick statuses + stun check
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
      state.combat.lastAction = "attack";

      shake(5, 8);
      spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
      spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 12);
    }

    if (action === "defend") {
      state.combat.heroDefending = true;
      addLog("You defend (+3 DEF until the next hit).");
      state.combat.lastAction = "defend";
    }

    if (action === "heal") {
      if (state.hero.potions <= 0) {
        addLog("No potions left!");
        state.combat.lastAction = "heal-fail";
      } else {
        state.hero.potions -= 1;
        const amt = Math.round(state.hero.hpMax * 0.35) + rnd(2, 6);
        state.hero.hp = clamp(state.hero.hp + amt, 0, state.hero.hpMax);
        addLog(`You drink a potion and restore ${amt} HP.`);
        state.combat.lastAction = "heal";
      }
    }

    if (action === "run") {
      const p = 0.45 + (state.hero.level - e.level) * 0.05;
      if (chance(clamp(p, 0.15, 0.9))) {
        endCombat(false);
        return;
      }
      addLog("You fail to run away!");
      state.combat.lastAction = "run-fail";
    }

    // Skills
    if (action === "fireball") {
      const cost = 4;
      if (state.hero.mp < cost) {
        addLog("Not enough MP for Fireball!");
        state.combat.lastAction = "fireball-fail";
      } else {
        state.hero.mp -= cost;
        const dmg = calcDamage(getHeroAtk() + 4, e.def, 3);
        e.hp = clamp(e.hp - dmg, 0, e.hpMax);
        addLog(`You cast Fireball for ${dmg} damage!`);
        if (chance(0.35)) {
          addStatus(e, "burn", { turns: 3, dmg: 3 });
          addLog(`${e.name} is burning!`);
        }
        state.combat.lastAction = "fireball";

        shake(6, 9);
        spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
        spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 18);
      }
    }

    if (action === "poison") {
      const cost = 3;
      if (state.hero.mp < cost) {
        addLog("Not enough MP for Poison Strike!");
        state.combat.lastAction = "poison-fail";
      } else {
        state.hero.mp -= cost;
        const dmg = calcDamage(getHeroAtk(), e.def, 2);
        e.hp = clamp(e.hp - dmg, 0, e.hpMax);
        addLog(`You slash with Poison Strike for ${dmg} damage!`);
        addStatus(e, "poison", { turns: 4, dmg: 2 + Math.floor(state.hero.level / 3) });
        addLog(`${e.name} is poisoned!`);
        state.combat.lastAction = "poison";

        shake(5, 8);
        spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
        spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 14);
      }
    }

    if (action === "stun") {
      const cost = 2;
      if (state.hero.mp < cost) {
        addLog("Not enough MP for Stun Bash!");
        state.combat.lastAction = "stun-fail";
      } else {
        state.hero.mp -= cost;
        const dmg = calcDamage(getHeroAtk() + 1, e.def, 1);
        e.hp = clamp(e.hp - dmg, 0, e.hpMax);
        addLog(`You smash for ${dmg} damage!`);
        if (chance(0.35)) {
          addStatus(e, "stun", { turns: 1 });
          addLog(`${e.name} is stunned!`);
        }
        state.combat.lastAction = "stun";

        shake(6, 9);
        spawnFloater(`-${dmg}`, canvas.width / 2 + 40, canvas.height / 2 - 20);
        spawnParticles(anim.heroPx.x + 50, anim.heroPx.y + 10, 16);
      }
    }

    // Start of enemy turn: status ticks
    if (state.combat) {
      tickStatuses(state.combat.enemy, state.combat.enemy.name);
    }

    // Victory check
    if (state.combat && e.hp <= 0) {
      addLog(`${e.name} is defeated.`);
      endCombat(true);
      return;
    }

    // Enemy stunned?
    if (state.combat && hasStatus(state.combat.enemy, "stun")) {
      addLog(`${state.combat.enemy.name} is stunned and skips its turn!`);
      state.combat.turn = "hero";
      state.turn++;
      renderHUD();
      return;
    }

    // Enemy turn
    if (state.combat) {
      state.combat.turn = "enemy";
      renderHUD();
      setTimeout(doEnemyTurn, 280);
    }
  }

  // ---------- Save / Load ----------
  function saveGame() {
    const payload = structuredClone(state);
    payload.meta.savedAt = nowISO();
    payload.meta.version = 2;
    payload.hero.map = world.current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    addLog("Game saved.");
  }

  function loadGame() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      addLog("No save found.");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.hero || !parsed.world) throw new Error("Bad save");
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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }

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
    if (e.key.toLowerCase() === "l") {
      state.ui.showLog = !state.ui.showLog;
      renderHUD();
    }
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

  btnUsePotion.addEventListener("click", usePotionOutsideCombat);
  btnCloseInv.addEventListener("click", () => invDialog.close());
  btnCloseShop.addEventListener("click", () => shopDialog.close());

  shopDialog.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-buy]");
    if (!btn) return;
    buy(btn.dataset.buy);
  });

  // ---------- Start ----------
  (async () => {
    await loadAssets();
    addLog("Welcome! Explore town, accept the Elder’s quest, and defeat the dungeon boss.");
    renderHUD();
    requestAnimationFrame(draw);
    requestAnimationFrame(inputLoop);
  })();
})();
