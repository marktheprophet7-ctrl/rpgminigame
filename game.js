/* Mini RPG - single file game logic
 * - Overworld tilemap + random encounters
 * - Turn-based combat
 * - Leveling, XP, potions, gold, chests
 * - Save/Load to localStorage
 */

(() => {
  "use strict";

  // ---------- Utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const chance = (p) => Math.random() < p;

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
  };

  // Encounters more likely in grass
  const ENCOUNTER_RATE_GRASS = 0.12;
  const ENCOUNTER_RATE_FLOOR = 0.02;

  const STORAGE_KEY = "mini_rpg_save_v1";

  // ---------- Map ----------
  // Handcrafted small map (26x16). Legend:
  // . floor, # wall, " grass, ~ water, C chest, S sign
  const mapSrc = [
    "##########################",
    "#....\"\"\"\"\"\"....#....\"\"\"\"\"#",
    "#....\"~~~~\"....#....\"\"\"\"\"#",
    "#....\"~~~~\"....#..........#",
    "#....\"\"\"\"\"\"....#####..C...#",
    "#..........S...............#",
    "#####..#########..######..##",
    "#....\"\"\"\"\"\"....#..#....#...#",
    "#....\"\"\"\"\"\"....#..#....#...#",
    "#....\"\"C\"\"\"....#..#....#...#",
    "#....\"\"\"\"\"\"....#..######...#",
    "#..........####.............#",
    "#..C..................\"\"\"\"\"#",
    "#...........\"\"\"\"\"\"...\"\"\"\"\"#",
    "#...........\"\"\"\"\"\"...\"\"\"\"\"#",
    "##########################",
  ];

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
        row.push(t);
      }
      grid.push(row);
    }
    return grid;
  }

  // ---------- Entities ----------
  const defaultState = () => ({
    meta: { version: 1, savedAt: null },
    hero: {
      x: 2,
      y: 2,
      dir: "down",
      level: 1,
      xp: 0,
      xpToNext: 25,
      gold: 0,
      hp: 30,
      hpMax: 30,
      atk: 6,
      def: 2,
      potions: 2,
    },
    world: {
      openedChests: {}, // key "x,y" => true
      signRead: false,
    },
    ui: {
      showLog: true,
    },
    combat: null, // when not null => in battle
    log: [],
    turn: 0,
  });

  // Enemy factory
  function makeEnemy(level) {
    // Small variety scaled by hero level
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
      intent: "attack", // enemy AI intent for flavor
    };
  }

  // ---------- State ----------
  let state = defaultState();
  let grid = parseMap(mapSrc);

  // ---------- Logging ----------
  function addLog(msg) {
    state.log.unshift(`[${String(state.turn).padStart(3, "0")}] ${msg}`);
    state.log = state.log.slice(0, 60);
    renderHUD();
  }

  // ---------- Rendering ----------
  function tileColor(t) {
    switch (t) {
      case T.FLOOR:
        return "#1a2a55";
      case T.WALL:
        return "#0c1226";
      case T.GRASS:
        return "#123c2c";
      case T.WATER:
        return "#0b2d4d";
      case T.CHEST:
        return "#3b2a12";
      case T.SIGN:
        return "#2b2b2b";
      default:
        return "#000";
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Map
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = grid[y][x];
        ctx.fillStyle = tileColor(t);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        // opened chests become floor
        if (t === T.CHEST && state.world.openedChests[`${x},${y}`]) {
          ctx.fillStyle = tileColor(T.FLOOR);
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }

        // subtle grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Hero
    const hx = state.hero.x * TILE;
    const hy = state.hero.y * TILE;
    ctx.fillStyle = "#d7e3ff";
    ctx.fillRect(hx + 5, hy + 5, TILE - 10, TILE - 10);

    // Direction indicator
    ctx.fillStyle = "#7aa2ff";
    const d = state.hero.dir;
    const cx = hx + TILE / 2;
    const cy = hy + TILE / 2;
    if (d === "up") ctx.fillRect(cx - 2, cy - 10, 4, 6);
    if (d === "down") ctx.fillRect(cx - 2, cy + 4, 4, 6);
    if (d === "left") ctx.fillRect(cx - 10, cy - 2, 6, 4);
    if (d === "right") ctx.fillRect(cx + 4, cy - 2, 6, 4);

    // Combat overlay
    if (state.combat) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Simple centered combat panel
      const w = 520,
        h = 240;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;

      ctx.fillStyle = "rgba(15,24,48,0.92)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(x, y, w, h);

      // Enemy box
      ctx.fillStyle = "#ffefef";
      ctx.font = "16px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        `${state.combat.enemy.name} (Lv ${state.combat.enemy.level})`,
        x + 18,
        y + 38
      );

      // Enemy HP bar
      const ehp = state.combat.enemy.hp;
      const ehm = state.combat.enemy.hpMax;
      drawBar(x + 18, y + 52, 220, 12, ehp, ehm);

      // Hero box
      ctx.fillStyle = "#e7ecff";
      ctx.fillText("You", x + 18, y + 120);
      drawBar(x + 18, y + 134, 220, 12, state.hero.hp, state.hero.hpMax);

      // Enemy sprite-ish
      ctx.fillStyle = "rgba(255,107,107,0.9)";
      ctx.fillRect(x + 340, y + 58, 120, 90);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + 340, y + 58, 120, 90);

      // Hero sprite-ish
      ctx.fillStyle = "rgba(122,162,255,0.85)";
      ctx.fillRect(x + 340, y + 140, 120, 70);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + 340, y + 140, 120, 70);

      // Info
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(
        "Choose an action on the right panel (or press 1-4).",
        x + 18,
        y + 210
      );
    }

    requestAnimationFrame(draw);
  }

  function drawBar(x, y, w, h, v, max) {
    const pct = clamp(v / max, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(87,227,137,0.9)";
    ctx.fillRect(x, y, Math.floor(w * pct), h);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(`${v}/${max}`, x + w + 10, y + h - 1);
  }

  // ---------- HUD ----------
  function renderHUD() {
    elHeroStats.textContent = [
      `Lv: ${state.hero.level}`,
      `HP: ${state.hero.hp}/${state.hero.hpMax}`,
      `ATK: ${state.hero.atk}  DEF: ${state.hero.def}`,
      `XP: ${state.hero.xp}/${state.hero.xpToNext}`,
      `Gold: ${state.hero.gold}`,
    ].join("\n");

    // Area info
    const t = grid[state.hero.y][state.hero.x];
    const tileName =
      t === T.FLOOR
        ? "Stone path"
        : t === T.GRASS
        ? "Tall grass"
        : t === T.WALL
        ? "Wall"
        : t === T.WATER
        ? "Water"
        : t === T.CHEST
        ? "Chest"
        : t === T.SIGN
        ? "Sign"
        : "Unknown";

    elAreaInfo.textContent = [
      `Pos: (${state.hero.x}, ${state.hero.y})`,
      `Tile: ${tileName}`,
      state.combat ? `Status: IN COMBAT` : `Status: Exploring`,
    ].join("\n");

    elInventory.textContent = [
      `Potions: ${state.hero.potions}`,
      `Use: In combat via Heal`,
    ].join("\n");

    // Combat box
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

    // Log
    elLogCard.classList.toggle("hidden", !state.ui.showLog);
    elLog.textContent = state.log.join("\n");
  }

  // ---------- Movement & Interaction ----------
  function isPassable(x, y) {
    const t = grid[y]?.[x];
    if (t == null) return false;
    if (t === T.WALL || t === T.WATER) return false;
    return true;
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

    // Check encounter
    const t = grid[ny][nx];
    const p =
      t === T.GRASS ? ENCOUNTER_RATE_GRASS : t === T.FLOOR ? ENCOUNTER_RATE_FLOOR : 0;

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
    const t = grid[y]?.[x];
    if (t == null) return;

    if (t === T.SIGN) {
      state.world.signRead = true;
      addLog("Sign: 'Beware the tall grass. Treasure lies beyond the walls.'");
      state.turn++;
      renderHUD();
      return;
    }

    if (t === T.CHEST) {
      const key = `${x},${y}`;
      if (state.world.openedChests[key]) {
        addLog("The chest is empty.");
      } else {
        state.world.openedChests[key] = true;
        // Loot
        const gotPotion = chance(0.65);
        const gold = rnd(8, 20);
        state.hero.gold += gold;
        if (gotPotion) state.hero.potions += 1;
        addLog(`You open the chest: +${gold} gold${gotPotion ? " and +1 potion" : ""}!`);
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
  function startCombat() {
    const enemy = makeEnemy(state.hero.level);
    state.combat = {
      enemy,
      turn: "hero",
      heroDefending: false,
      lastAction: null,
    };
    addLog(`A wild ${enemy.name} appears!`);
    renderHUD();
  }

  function endCombat(victory) {
    const e = state.combat.enemy;
    if (victory) {
      state.hero.xp += e.xp;
      state.hero.gold += e.gold;
      addLog(`Victory! You gain +${e.xp} XP and +${e.gold} gold.`);
      maybeLevelUp();
    } else {
      addLog("You escape!");
    }
    state.combat = null;
    state.turn++;
    renderHUD();
  }

  function maybeLevelUp() {
    while (state.hero.xp >= state.hero.xpToNext) {
      state.hero.xp -= state.hero.xpToNext;
      state.hero.level += 1;

      // Growth
      const hpGain = 6 + rnd(0, 3);
      const atkGain = 1 + chance(0.5);
      const defGain = chance(0.6) ? 1 : 0;

      state.hero.hpMax += hpGain;
      state.hero.atk += atkGain;
      state.hero.def += defGain;
      state.hero.hp = state.hero.hpMax;

      state.hero.xpToNext = Math.round(state.hero.xpToNext * 1.35 + 10);

      addLog(
        `Level up! Now Lv ${state.hero.level}. +${hpGain} HP, +${atkGain} ATK, +${defGain} DEF.`
      );
    }
  }

  function calcDamage(attackerAtk, defenderDef, variance = 2) {
    const raw = attackerAtk - defenderDef;
    const v = rnd(-variance, variance);
    return clamp(raw + v, 1, 999);
  }

  function enemyAI() {
    // Simple: if low hp sometimes defend; otherwise attack.
    const e = state.combat.enemy;
    if (e.hp <= e.hpMax * 0.35 && chance(0.35)) {
      e.intent = "defend";
      return "defend";
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

    // attack
    const heroDef = state.hero.def + (state.combat.heroDefending ? 3 : 0);
    const dmg = calcDamage(e.atk, heroDef, 2);
    state.hero.hp = clamp(state.hero.hp - dmg, 0, state.hero.hpMax);
    addLog(`${e.name} attacks you for ${dmg} damage!`);
    state.combat.heroDefending = false;

    if (state.hero.hp <= 0) {
      addLog("You are defeated... You wake up at full HP but lose some gold.");
      // Soft fail: restore with penalty
      const lost = Math.floor(state.hero.gold * 0.25);
      state.hero.gold -= lost;
      state.hero.hp = state.hero.hpMax;
      state.combat = null;
      addLog(`You dropped ${lost} gold in the chaos.`);
      state.turn++;
      renderHUD();
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
      const dmg = calcDamage(state.hero.atk, e.def, 2);
      e.hp = clamp(e.hp - dmg, 0, e.hpMax);
      addLog(`You attack ${e.name} for ${dmg} damage!`);
      state.combat.lastAction = "attack";
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

    // Victory check
    if (state.combat && e.hp <= 0) {
      addLog(`${e.name} is defeated.`);
      endCombat(true);
      return;
    }

    // Enemy turn
    if (state.combat) {
      state.combat.turn = "enemy";
      renderHUD();
      // small delay for readability
      setTimeout(doEnemyTurn, 280);
    }
  }

  // ---------- Save / Load ----------
  function saveGame() {
    const payload = structuredClone(state);
    payload.meta.savedAt = nowISO();
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
      // very light validation
      if (!parsed || !parsed.hero || !parsed.world) throw new Error("Bad save");
      state = parsed;
      addLog(`Loaded save (${state.meta?.savedAt ?? "unknown time"}).`);
      renderHUD();
    } catch (e) {
      console.error(e);
      addLog("Failed to load save.");
    }
  }

  function newGame() {
    state = defaultState();
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

    // Combat hotkeys 1-4
    if (state.combat) {
      if (e.key === "1") takeAction("attack");
      if (e.key === "2") takeAction("defend");
      if (e.key === "3") takeAction("heal");
      if (e.key === "4") takeAction("run");
      return;
    }

    // non-combat hotkeys
    if (e.key.toLowerCase() === "e") interact();
    if (e.key.toLowerCase() === "l") {
      state.ui.showLog = !state.ui.showLog;
      renderHUD();
    }
    if (e.key.toLowerCase() === "i") {
      addLog(`Inventory: potions=${state.hero.potions}, gold=${state.hero.gold}`);
      state.turn++;
      renderHUD();
    }
  });

  window.addEventListener("keyup", (e) => {
    keysDown.delete(e.key.toLowerCase());
  });

  // Movement loop (so holding keys works nicely)
  let lastMoveAt = 0;
  const MOVE_COOLDOWN = 120;

  function inputLoop(ts) {
    if (!state.combat && ts - lastMoveAt > MOVE_COOLDOWN) {
      const up = keysDown.has("w") || keysDown.has("arrowup");
      const down = keysDown.has("s") || keysDown.has("arrowdown");
      const left = keysDown.has("a") || keysDown.has("arrowleft");
      const right = keysDown.has("d") || keysDown.has("arrowright");

      if (up) {
        move(0, -1);
        lastMoveAt = ts;
      } else if (down) {
        move(0, 1);
        lastMoveAt = ts;
      } else if (left) {
        move(-1, 0);
        lastMoveAt = ts;
      } else if (right) {
        move(1, 0);
        lastMoveAt = ts;
      }
    }
    requestAnimationFrame(inputLoop);
  }

  // Combat button clicks
  elCombatActions.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    takeAction(btn.dataset.act);
  });

  // Topbar buttons
  btnNew.addEventListener("click", newGame);
  btnSave.addEventListener("click", saveGame);
  btnLoad.addEventListener("click", loadGame);
  btnHelp.addEventListener("click", () => helpDialog.showModal());

  // ---------- Start ----------
  addLog("Welcome! Explore, fight, and find treasure.");
  renderHUD();
  requestAnimationFrame(draw);
  requestAnimationFrame(inputLoop);
})();
