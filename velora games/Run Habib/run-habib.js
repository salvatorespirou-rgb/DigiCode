// Run Habib — an original side-scrolling platformer. Same genre feel as
// the classics (run, jump, coin blocks, stomp enemies, a flagpole finish)
// built from scratch: original tile art, original level layout, original
// enemies, and original synthesized audio — see the comment block near
// AUDIO below for why none of that is sampled from anywhere.
(function () {
  const canvas = document.getElementById("rhCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("rhStage");

  const WIDTH = canvas.width; // 960
  const HEIGHT = canvas.height; // 520
  const TILE = 40;

  const IS_TOUCH = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  if (IS_TOUCH) stage.classList.add("is-touch");

  // ---------------------------------------------------------------------
  // Physics tuning — a from-scratch feel (accel/decel running, variable
  // jump height, a short coyote-time and jump-buffer window for forgiving
  // input), not extracted from any existing game's code.
  // ---------------------------------------------------------------------
  const GRAVITY = 1900;
  const MOVE_ACCEL = 1500;
  const MOVE_DECEL = 2200;
  const MAX_RUN_SPEED = 250;
  const JUMP_VELOCITY = -640;
  const JUMP_CUT_MULTIPLIER = 0.45;
  const MAX_FALL_SPEED = 920;
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER = 0.1;
  const MAX_JUMPS = 2;
  const PLAYER_W = 30;
  const PLAYER_H = 44;

  // ---------------------------------------------------------------------
  // Level — declarative placement lists rather than a hand-aligned ASCII
  // grid, so it's easy to read/adjust and hard to get column-counting
  // wrong. Converted into a solid/empty tile grid once at load (buildTileGrid).
  // A "world" (kingdom) theme so the palette/props are Run Habib's own,
  // not a reskinned copy of anything.
  // ---------------------------------------------------------------------
  const GROUND_ROW = 10; // first solid row (top surface) — same every stage
  const GROUND_ROWS = 3;
  const LEVEL_ROWS = 13;

  // ---------------------------------------------------------------------
  // Stages — each stage's layout lives in its own definition function and
  // gets loaded into these mutable bindings by loadStage(). Every regular
  // stage ends in a run up a staircase to a flagpole, Mario-style; the
  // Arab Monster showdown (see the boss-arena block in update(), and
  // drawMonsterAndPrincess()) is fully built and still works, but is held
  // back to run as the true final stage once the rest of the 12 exist —
  // for now, clearing the last built stage just shows a "more coming
  // soon" screen instead of the boss fight.
  // ---------------------------------------------------------------------
  let LEVEL_COLS, PITS, PLATFORMS, BLOCKS, COINS, URNS, ENEMIES, PIPES, STAIRS;
  let FLAG_COL, MONSTER_COL, ARENA_START_COL;

  // Builds a run of 1-tile-high ascending steps — {col, height} in tiles
  // above the ground — the classic Mario staircase leading up to a flag.
  function stairsUp(startCol, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push({ col: startCol + i, height: i + 1 });
    return out;
  }

  function stage1() {
    return {
      name: "Stage 1",
      levelCols: 120,
      pits: [[21, 23], [46, 48], [77, 80], [96, 98]],
      // Row 8 sits only one tile (40px) above the ground — less than
      // Habib's own height (44px) — so a platform there leaves no room
      // to actually stand underneath and jump up into it. Row 7 (80px
      // clearance) is the lowest row that comfortably fits him.
      platforms: [
        { col: 10, row: 7, len: 3 },
        { col: 18, row: 6, len: 2 },
        { col: 30, row: 7, len: 4 },
        { col: 38, row: 5, len: 3 },
        { col: 52, row: 7, len: 3 },
        { col: 60, row: 5, len: 2 },
        { col: 68, row: 7, len: 4 },
        { col: 84, row: 7, len: 3 },
        { col: 90, row: 5, len: 3 },
        { col: 101, row: 7, len: 4 },
      ],
      blocks: [
        { col: 6, row: 7, type: "coin" },
        { col: 7, row: 7, type: "coin" },
        { col: 8, row: 7, type: "brick" },
        { col: 19, row: 6, type: "coin" },
        { col: 31, row: 7, type: "coin" },
        { col: 33, row: 7, type: "star" },
        { col: 39, row: 5, type: "coin" },
        { col: 53, row: 7, type: "coin" },
        { col: 61, row: 5, type: "coin" },
        { col: 69, row: 7, type: "coin" },
        { col: 71, row: 7, type: "coin" },
        { col: 85, row: 7, type: "brick" },
        { col: 91, row: 5, type: "star" },
        { col: 102, row: 7, type: "coin" },
        { col: 104, row: 7, type: "coin" },
      ],
      coins: [
        { col: 14, row: 8 }, { col: 15, row: 8 }, { col: 16, row: 8 },
        { col: 42, row: 7 }, { col: 43, row: 6 }, { col: 44, row: 5 },
        { col: 63, row: 8 }, { col: 64, row: 8 }, { col: 65, row: 8 },
        { col: 93, row: 5 }, { col: 94, row: 5 },
      ],
      // Urns — solid obstacles; some periodically hiss out a sand-cobra
      // that retreats after a moment (an original creature, not a
      // reskinned trap plant — it stays inside its urn rather than
      // sitting exposed in a tube; that's Stage 2's pipes below).
      urns: [
        { col: 26, row: 10, height: 2, spawnsCobra: true },
        { col: 56, row: 10, height: 3, spawnsCobra: false },
        { col: 73, row: 10, height: 2, spawnsCobra: true },
        { col: 88, row: 10, height: 3, spawnsCobra: true },
      ],
      enemies: [
        { col: 12, row: 9, min: 11, max: 17, variant: "scorpion" },
        { col: 35, row: 9, min: 34, max: 41, variant: "beetle" },
        { col: 50, row: 9, min: 49, max: 55, variant: "scorpion" },
        { col: 66, row: 9, min: 64, max: 70, variant: "beetle" },
        { col: 82, row: 9, min: 81, max: 87, variant: "scorpion" },
        { col: 93, row: 9, min: 92, max: 99, variant: "beetle" },
        { col: 100, row: 9, min: 99, max: 103, variant: "scorpion" },
      ],
      pipes: [],
      flagCol: 113,
      stairs: stairsUp(105, 7),
      monsterCol: null,
    };
  }

  function stage2() {
    return {
      name: "Stage 2",
      levelCols: 118,
      pits: [[18, 20], [42, 44], [70, 73], [92, 94]],
      platforms: [
        { col: 8, row: 7, len: 3 },
        { col: 24, row: 6, len: 3 },
        { col: 48, row: 7, len: 3 },
        { col: 60, row: 5, len: 2 },
        { col: 76, row: 7, len: 4 },
        { col: 95, row: 6, len: 3 },
      ],
      blocks: [
        { col: 9, row: 7, type: "coin" },
        { col: 10, row: 7, type: "brick" },
        { col: 25, row: 6, type: "coin" },
        { col: 26, row: 6, type: "star" },
        { col: 49, row: 7, type: "coin" },
        { col: 61, row: 5, type: "coin" },
        { col: 77, row: 7, type: "coin" },
        { col: 79, row: 7, type: "brick" },
        { col: 96, row: 6, type: "coin" },
        { col: 97, row: 6, type: "coin" },
      ],
      coins: [
        { col: 34, row: 6 }, { col: 35, row: 5 }, { col: 36, row: 6 },
        { col: 64, row: 8 }, { col: 65, row: 8 },
        { col: 101, row: 5 }, { col: 102, row: 5 },
      ],
      urns: [
        { col: 16, row: 10, height: 2, spawnsCobra: true },
        { col: 55, row: 10, height: 2, spawnsCobra: true },
      ],
      enemies: [
        { col: 12, row: 9, min: 11, max: 15, variant: "beetle" },
        { col: 30, row: 9, min: 28, max: 40, variant: "scorpion" },
        { col: 52, row: 9, min: 50, max: 54, variant: "beetle" },
        { col: 82, row: 9, min: 80, max: 90, variant: "scorpion" },
      ],
      // Pipes — Stage 2's signature hazard: a flytrap-like creature pops
      // up out of each one on a cycle, same "jump over it or wait it
      // out" idea as the classic pipe-and-plant obstacle, but built as
      // an original creature/color rather than a reskin of it.
      pipes: [
        { col: 22, height: 2 },
        { col: 46, height: 3 },
        { col: 74, height: 2 },
        { col: 98, height: 4 },
      ],
      flagCol: 111,
      stairs: stairsUp(103, 7),
      monsterCol: null,
    };
  }

  const STAGES = [stage1, stage2];
  let currentStageIndex = 0;

  function loadStage(idx) {
    const s = STAGES[idx]();
    LEVEL_COLS = s.levelCols;
    PITS = s.pits;
    PLATFORMS = s.platforms;
    BLOCKS = s.blocks;
    COINS = s.coins;
    URNS = s.urns;
    ENEMIES = s.enemies;
    PIPES = s.pipes;
    STAIRS = s.stairs;
    FLAG_COL = s.flagCol;
    MONSTER_COL = s.monsterCol;
    ARENA_START_COL = s.monsterCol ? s.flagCol + 1 : null;
    const worldEl = document.getElementById("rhWorld");
    if (worldEl) worldEl.textContent = String(idx + 1);
  }

  function inPit(col) {
    return PITS.some(([a, b]) => col >= a && col <= b);
  }

  // Builds the solid/empty grid once. `tiles[row][col]` is either null
  // (empty) or a type string used by both collision and rendering.
  let tiles;
  function buildTileGrid() {
    tiles = Array.from({ length: LEVEL_ROWS }, () => new Array(LEVEL_COLS).fill(null));
    for (let col = 0; col < LEVEL_COLS; col++) {
      if (inPit(col) && (!ARENA_START_COL || col < ARENA_START_COL)) continue;
      for (let r = 0; r < GROUND_ROWS; r++) {
        tiles[GROUND_ROW + r][col] = "ground";
      }
    }
    for (const p of PLATFORMS) {
      for (let i = 0; i < p.len; i++) tiles[p.row][p.col + i] = "brick";
    }
    for (const b of BLOCKS) {
      tiles[b.row][b.col] = { kind: "box", type: b.type, hit: false };
    }
    for (const u of URNS) {
      for (let i = 0; i < u.height; i++) tiles[GROUND_ROW - 1 - i][u.col] = "urn";
    }
    for (const p of PIPES) {
      for (let i = 0; i < p.height; i++) {
        tiles[GROUND_ROW - 1 - i][p.col] = "pipe";
        tiles[GROUND_ROW - 1 - i][p.col + 1] = "pipe";
      }
    }
    for (const s of STAIRS) {
      for (let h = 0; h < s.height; h++) tiles[GROUND_ROW - 1 - h][s.col] = "brick";
    }
    // The flagpole's tip sits just above the staircase's peak so jumping
    // off the top step reaches high on the pole, the way it does in the
    // games this is patterned after — its shaft (drawn in drawTile) then
    // stretches dynamically down to the ground from wherever this is.
    const peakHeight = STAIRS.length ? Math.max(...STAIRS.map((s) => s.height)) : 0;
    const tipRow = Math.max(1, GROUND_ROW - peakHeight - 1);
    tiles[tipRow][FLAG_COL] = "flagpole-tip";
    for (let r = GROUND_ROW; r < GROUND_ROW + GROUND_ROWS; r++) tiles[r][FLAG_COL] = null;
  }

  function tileAt(row, col) {
    if (row < 0 || row >= LEVEL_ROWS || col < 0 || col >= LEVEL_COLS) return null;
    return tiles[row][col];
  }
  function isSolid(t) {
    return t === "ground" || t === "brick" || t === "urn" || t === "pipe" || (t && t.kind === "box");
  }

  // ---------------------------------------------------------------------
  // Assets — the three character portraits are the only external images;
  // everything else (tiles, backdrop, props) is drawn with canvas
  // primitives, same lightweight approach as the rest of Velora's games.
  // ---------------------------------------------------------------------
  const ASSET_V = "4";
  // Every reference to an image anywhere in this file goes through this
  // helper instead of a hand-typed "?v=4" — bumping ASSET_V once here is
  // now the only thing a future asset change needs, instead of hunting
  // down every hardcoded copy (one of those, princess.png's, was already
  // caught stuck on an old version this way).
  function asset(path) { return "assets/" + path + "?v=" + ASSET_V; }
  const habibImg = new Image();
  habibImg.src = asset("habib.png");
  const monsterImg = new Image();
  monsterImg.src = asset("arab-monster.png");
  const princessImg = new Image();
  princessImg.src = asset("princess.png");
  const scorpionImg = new Image();
  scorpionImg.src = asset("scorpion.png");
  const beetleImg = new Image();
  beetleImg.src = asset("beetle.png");
  const ENEMY_SPRITES = { scorpion: scorpionImg, beetle: beetleImg };

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  const keys = { left: false, right: false, jump: false, jumpPressedAt: -1 };
  document.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") keys.left = true;
    else if (e.code === "ArrowRight") keys.right = true;
    else if (e.code === "Space") {
      if (!keys.jump) keys.jumpPressedAt = performance.now() / 1000;
      keys.jump = true;
      if (state === "intro" || state === "gameover" || state === "win" || state === "paused" || state === "stageClear" || state === "allClear") { e.preventDefault(); startOrRestart(); }
      if (state === "playing") e.preventDefault();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      togglePause();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft") keys.left = false;
    else if (e.code === "ArrowRight") keys.right = false;
    else if (e.code === "Space") { keys.jump = false; onJumpReleased(); }
  });

  function bindHoldButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
  }
  bindHoldButton("rhLeftBtn", () => (keys.left = true), () => (keys.left = false));
  bindHoldButton("rhRightBtn", () => (keys.right = true), () => (keys.right = false));
  bindHoldButton(
    "rhJumpBtn",
    () => {
      if (!keys.jump) keys.jumpPressedAt = performance.now() / 1000;
      keys.jump = true;
      if (state !== "playing") startOrRestart();
    },
    () => { keys.jump = false; onJumpReleased(); }
  );

  const fullscreenBtn = document.getElementById("rhFullscreenBtn");
  fullscreenBtn?.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  });

  // ---------------------------------------------------------------------
  // Audio — every effect below is a synthesized tone (Web Audio
  // oscillators), the same approach as Flappy Dragon's. Nothing here is a
  // sample or a soundalike of any existing game's music/SFX; the "Run
  // Habib!" star line is a placeholder hook (see playStarVoiceLine) for a
  // real recorded line to be dropped in later.
  // ---------------------------------------------------------------------
  const MUTE_KEY = "veloraRunHabibMuted";
  let isMuted = localStorage.getItem(MUTE_KEY) === "1";
  let audioCtx = null;
  let masterGain = null;
  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) {
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = isMuted ? 0 : 1;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  const muteBtn = document.getElementById("rhMuteBtn");
  function setMuted(muted) {
    isMuted = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    if (muteBtn) {
      muteBtn.textContent = muted ? "🔇" : "🔊";
      muteBtn.setAttribute("aria-label", muted ? "Unmute game sound" : "Mute game sound");
    }
  }
  muteBtn?.addEventListener("click", () => { try { getAudioCtx(); } catch (err) {} setMuted(!isMuted); });
  setMuted(isMuted);

  function tone(freq, start, dur, gain, type) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(g); g.connect(masterGain);
      osc.start(start); osc.stop(start + dur);
      return osc;
    } catch (err) {}
  }
  function sweep(f0, f1, start, dur, gain, type) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), start + dur);
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.02);
      osc.connect(g); g.connect(masterGain);
      osc.start(start); osc.stop(start + dur + 0.02);
    } catch (err) {}
  }
  function playJump() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(320, 720, t, 0.14, 0.14, "square"); }
  function playCoin() { const t = getAudioCtx()?.currentTime; if (t != null) { tone(1046, t, 0.08, 0.15, "square"); tone(1568, t + 0.06, 0.16, 0.15, "square"); } }
  function playStomp() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(280, 60, t, 0.12, 0.18, "triangle"); }
  function playBlockHit() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(220, 140, t, 0.07, 0.16, "square"); }
  function playDie() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(500, 90, t, 0.55, 0.18, "sawtooth"); }
  function playStar() { const t = getAudioCtx()?.currentTime; if (t != null) [660, 880, 1100, 1320, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.14, 0.13, "square")); }
  function playFlag() { const t = getAudioCtx()?.currentTime; if (t != null) [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.09, 0.22, 0.15, "square")); }
  function playHurt() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(200, 80, t, 0.2, 0.16, "square"); }
  function playRoar() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(140, 45, t, 0.5, 0.22, "sawtooth"); }
  // Placeholder hook — drop a real recorded line in as assets/run-habib-voice.mp3
  // and this plays it; until then it just plays the synthesized star jingle.
  function playStarVoiceLine() {
    const audio = new Audio("assets/run-habib-voice.mp3");
    audio.volume = isMuted ? 0 : 0.9;
    audio.play().catch(() => {});
  }

  // A short, cheerful, original four-bar loop — plain arpeggios over a
  // walking bass, nothing sampled or transcribed from anywhere. Scheduled
  // a few bars ahead of playback time rather than one note per setTimeout,
  // so it can't drift or stack up if a frame hitches.
  const BPM = 148;
  const BEAT = 60 / BPM;
  const BASS = [98, 98, 130.8, 98, 110, 110, 146.8, 110];
  const LEAD = [
    392, 494, 587, 494, 392, 494, 587, 784,
    440, 554, 659, 554, 440, 554, 659, 880,
  ];
  let musicTimer = null;
  let nextNoteTime = 0;
  let bassStep = 0;
  let leadStep = 0;
  function scheduleMusic() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // Star mode speeds the loop up rather than swapping tracks — a classic
    // "everything's more urgent right now" cue, done here by just shrinking
    // the beat interval instead of needing a second piece of music.
    const beat = starTimer > 0 ? BEAT * 0.72 : BEAT;
    while (nextNoteTime < ctx.currentTime + 0.6) {
      tone(BASS[bassStep % BASS.length], nextNoteTime, beat * 0.9, 0.05, "triangle");
      tone(LEAD[leadStep % LEAD.length], nextNoteTime, beat * 0.42, 0.045, "square");
      tone(LEAD[(leadStep + 4) % LEAD.length], nextNoteTime + beat / 2, beat * 0.42, 0.03, "square");
      bassStep++;
      leadStep++;
      nextNoteTime += beat;
    }
  }
  function startMusic() {
    const ctx = getAudioCtx();
    if (!ctx || musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.1;
    bassStep = 0; leadStep = 0;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 200);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // ---------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------
  let player, enemies, coins, cobras, plants, particles, camX, flagRaised, monster, elapsedInLevel;
  let coinCount, lives, state, invincibleTimer, starTimer, respawnX, respawnY;

  function resetRun() {
    coinCount = 0; lives = 3;
    updateHud();
    resetLevel();
  }

  function resetLevel() {
    buildTileGrid();
    player = {
      x: 2 * TILE, y: (GROUND_ROW - 2) * TILE, vx: 0, vy: 0,
      w: PLAYER_W, h: PLAYER_H, onGround: false, facing: 1,
      coyote: 0, jumpsUsed: 0, runPhase: 0, hurtTimer: 0, squash: 1,
    };
    respawnX = player.x; respawnY = player.y;
    // Enemies/boss have no gravity of their own (they only ever patrol flat
    // ground segments), so their Y has to be derived from GROUND_ROW and
    // their own height to actually sit ON the ground rather than floating
    // — there's nothing to fall and settle into place the way the player does.
    // Each variant's hitbox matches its sprite's real proportions (a
    // scorpion and a beetle aren't the same shape) rather than one generic
    // box for both.
    const ENEMY_SIZE = { scorpion: { w: 52, h: 27 }, beetle: { w: 48, h: 20 } };
    enemies = ENEMIES.map((e) => {
      const size = ENEMY_SIZE[e.variant];
      return {
        x: e.col * TILE, y: GROUND_ROW * TILE - size.h, w: size.w, h: size.h, vx: -60,
        variant: e.variant, minX: e.min * TILE, maxX: e.max * TILE, alive: true, squashTimer: 0,
      };
    });
    cobras = URNS.filter((u) => u.spawnsCobra).map((u) => ({
      x: u.col * TILE + TILE / 2, baseY: (GROUND_ROW - u.height) * TILE,
      urnTopY: (GROUND_ROW - u.height) * TILE, phase: Math.random() * 3, alive: true,
    }));
    plants = PIPES.map((p) => ({
      x: p.col * TILE + TILE, pipeTopY: (GROUND_ROW - p.height) * TILE,
      y: (GROUND_ROW - p.height) * TILE, phase: Math.random() * 3, alive: true,
    }));
    coins = COINS.map((c) => ({ x: c.col * TILE + TILE / 2, y: c.row * TILE + TILE / 2, taken: false, phase: Math.random() * 6 }));
    particles = [];
    camX = 0;
    flagRaised = false;
    invincibleTimer = 0;
    starTimer = 0;
    elapsedInLevel = 0;
    const MONSTER_H = 90;
    monster = { x: MONSTER_COL * TILE, y: GROUND_ROW * TILE - MONSTER_H, w: 90, h: MONSTER_H, hits: 0, defeated: false, phase: 0, hurtFlash: 0 };
  }

  function updateHud() {
    const coinsEl = document.getElementById("rhCoins");
    const livesEl = document.getElementById("rhLives");
    if (coinsEl) coinsEl.textContent = String(coinCount);
    if (livesEl) livesEl.textContent = String(lives);
  }

  // ---------------------------------------------------------------------
  // Overlay / game flow
  // ---------------------------------------------------------------------
  const overlay = document.getElementById("rhOverlay");
  const overlayPanel = document.getElementById("rhOverlayPanel");
  const overlayArt = document.getElementById("rhOverlayArt");
  const overlayTitle = document.getElementById("rhOverlayTitle");
  const overlayBody = document.getElementById("rhOverlayBody");
  const startBtn = document.getElementById("rhStartBtn");

  function showOverlay(title, body, art, btnLabel) {
    overlay.hidden = false;
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayArt.src = art;
    startBtn.textContent = btnLabel;
  }
  function hideOverlay() { overlay.hidden = true; }

  state = "intro";
  loadStage(currentStageIndex);
  resetRun();
  showOverlay(
    "Run Habib",
    "The Arab Monster has taken the Princess into the old kingdom. Habib's not waiting for anyone else to go get her.",
    asset("habib.png"),
    "▶ Start Running"
  );

  function startOrRestart() {
    if (state === "intro") {
      hideOverlay();
      state = "playing";
      try { getAudioCtx(); } catch (err) {}
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "gameover") {
      hideOverlay();
      currentStageIndex = 0;
      loadStage(0);
      resetRun();
      state = "playing";
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "win" || state === "allClear") {
      hideOverlay();
      currentStageIndex = 0;
      loadStage(0);
      resetRun();
      state = "playing";
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "stageClear") {
      hideOverlay();
      currentStageIndex++;
      loadStage(currentStageIndex);
      resetLevel();
      updateHud();
      state = "playing";
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "paused") {
      hideOverlay();
      state = "playing";
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
    }
  }

  // Reaching a stage's flag (on any stage without a boss arena past it —
  // see the flagpole block in update()) ends the stage: a brief pause on
  // the fanfare, then either the next stage loads or, if this was the
  // last stage built so far, a "more coming soon" screen shows instead
  // of the Arab Monster fight that's still waiting for the rest of the 12.
  function clearStage() {
    state = "cutscene";
    stopMusic();
    setTimeout(() => {
      const isLast = currentStageIndex >= STAGES.length - 1;
      if (isLast) {
        state = "allClear";
        showOverlay(
          "More of the Old Kingdom Awaits",
          `Stage ${currentStageIndex + 1} down with ${coinCount} coins. The rest of the road to the Arab Monster is still being built — check back soon.`,
          asset("habib.png"),
          "↻ Play Stage 1 Again"
        );
      } else {
        state = "stageClear";
        showOverlay(
          "Stage Clear!",
          `Habib made the flag with ${coinCount} coins. On to the next stretch of the kingdom.`,
          asset("habib.png"),
          "▶ Next Stage"
        );
      }
    }, 1400);
  }
  startBtn.addEventListener("click", startOrRestart);

  const pauseBtn = document.getElementById("rhPauseBtn");
  function togglePause() {
    if (state === "playing") {
      state = "paused";
      stopMusic();
      showOverlay(
        "Paused",
        "Take a breath — the old kingdom will still be there when you get back.",
        asset("habib.png"),
        "▶ Resume"
      );
    } else if (state === "paused") {
      startOrRestart();
    }
  }
  pauseBtn?.addEventListener("click", togglePause);

  function onJumpReleased() {
    if (player && player.vy < 0) player.vy *= JUMP_CUT_MULTIPLIER;
  }

  function loseLife(fellInPit) {
    if (invincibleTimer > 0.5 && !fellInPit) return; // just got hit, brief grace already handled by hurtTimer
    playHurt();
    stopMusic();
    lives--;
    updateHud();
    if (lives <= 0) {
      state = "gameover";
      showOverlay("Habib is out of chances", `You collected ${coinCount} coins this run. The Princess is still waiting.`, asset("habib.png"), "↻ Try Again");
      return;
    }
    // Respawn in place rather than restarting the whole level — losing a
    // life should cost you, not send you back to the very start.
    player.x = respawnX; player.y = respawnY; player.vx = 0; player.vy = 0;
    player.jumpsUsed = 0;
    invincibleTimer = 1.4;
    startMusic();
  }

  function winLevel() {
    state = "cutscene";
    playFlag();
    stopMusic();
    setTimeout(() => {
      state = "win";
      showOverlay("The Princess is safe", `Habib got her out with ${coinCount} coins to spare. The old kingdom can rest easy.`, asset("princess.png"), "↻ Play Again");
    }, 1600);
  }

  // ---------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------
  function moveAndCollide(ent, dx, dy) {
    // Horizontal first, then vertical — resolving one axis at a time is
    // what keeps corner cases (running into a wall while falling) from
    // shoving the player through geometry.
    ent.x += dx;
    if (dx !== 0) {
      const dir = dx > 0 ? 1 : -1;
      const edgeX = dir > 0 ? ent.x + ent.w : ent.x;
      const topRow = Math.floor(ent.y / TILE);
      // While falling, don't let a grazing overlap with the very bottom of
      // the body count as a wall — that's a landing, not a wall hit, and
      // should be resolved by the vertical check below instead. Without
      // this, clearing a pit while still slightly descending snags the far
      // ledge's face and drags the player straight down along it.
      const botRow = Math.floor((ent.y + ent.h - (ent.vy > 0 ? TILE * 0.6 : 1)) / TILE);
      const col = Math.floor(edgeX / TILE);
      for (let r = topRow; r <= botRow; r++) {
        if (isSolid(tileAt(r, col))) {
          // Auto step-up: a single 1-tile-high ledge (solid only at foot
          // level, clear the row above) climbs instead of blocking dead —
          // this is what makes a staircase (or any low ledge) walkable at
          // a run instead of needing a hop up every single step.
          if (ent.onGround && r === botRow && !isSolid(tileAt(r - 1, col))) {
            ent.y -= TILE;
            break;
          }
          ent.x = dir > 0 ? col * TILE - ent.w : (col + 1) * TILE;
          dx = 0;
          break;
        }
      }
    }
    ent.y += dy;
    ent.onGround = false;
    if (dy !== 0) {
      const dir = dy > 0 ? 1 : -1;
      const edgeY = dir > 0 ? ent.y + ent.h : ent.y;
      const leftCol = Math.floor((ent.x + 2) / TILE);
      const rightCol = Math.floor((ent.x + ent.w - 3) / TILE);
      const row = Math.floor(edgeY / TILE);
      for (let c = leftCol; c <= rightCol; c++) {
        const t = tileAt(row, c);
        if (isSolid(t)) {
          if (dir > 0) { ent.y = row * TILE - ent.h; ent.onGround = true; }
          else {
            ent.y = (row + 1) * TILE;
            if (t && t.kind === "box" && ent === player) hitBlock(row, c, t);
          }
          ent.vy = 0;
          break;
        }
      }
    }
    return dx;
  }

  function hitBlock(row, col, t) {
    if (t.type === "brick") { playBlockHit(); return; }
    if (t.hit) { playBlockHit(); return; }
    t.hit = true;
    if (t.type === "coin") {
      coinCount++;
      updateHud();
      playCoin();
      particles.push({ x: col * TILE + TILE / 2, y: row * TILE, vy: -90, life: 0.5, kind: "coinPop" });
    } else if (t.type === "star") {
      playStar();
      playStarVoiceLine();
      starTimer = 8;
      particles.push({ x: col * TILE + TILE / 2, y: row * TILE - TILE / 2, vy: -40, life: 3, kind: "star" });
    }
  }

  function update(dt) {
    elapsedInLevel += dt;
    if (state !== "playing") return;

    if (invincibleTimer > 0) invincibleTimer = Math.max(0, invincibleTimer - dt);
    if (starTimer > 0) starTimer = Math.max(0, starTimer - dt);

    // --- Player horizontal movement (accelerate/decelerate, not snap-to-speed) ---
    const runMult = starTimer > 0 ? 1.4 : 1;
    if (keys.left && !keys.right) {
      player.vx = Math.max(player.vx - MOVE_ACCEL * dt, -MAX_RUN_SPEED * runMult);
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx = Math.min(player.vx + MOVE_ACCEL * dt, MAX_RUN_SPEED * runMult);
      player.facing = 1;
    } else if (player.vx > 0) {
      player.vx = Math.max(0, player.vx - MOVE_DECEL * dt);
    } else if (player.vx < 0) {
      player.vx = Math.min(0, player.vx + MOVE_DECEL * dt);
    }

    // --- Jump: coyote time + input buffer make edge-of-platform jumps feel fair.
    // Habib also gets one extra mid-air jump (double jump) to clear taller
    // obstacles — jumpsUsed resets the moment he touches ground again.
    player.coyote = player.onGround ? COYOTE_TIME : Math.max(0, player.coyote - dt);
    if (player.onGround) player.jumpsUsed = 0;
    const now = performance.now() / 1000;
    const jumpBuffered = keys.jumpPressedAt > 0 && now - keys.jumpPressedAt < JUMP_BUFFER;
    const groundJump = jumpBuffered && player.coyote > 0;
    const airJump = jumpBuffered && !groundJump && player.jumpsUsed < MAX_JUMPS;
    if (groundJump || airJump) {
      // The air jump takes the stronger of the player's current upward speed
      // or its own kick, so it always adds real height instead of clipping
      // an already-fast rise from an instant double-tap.
      player.vy = groundJump ? JUMP_VELOCITY : Math.min(player.vy, JUMP_VELOCITY * 0.85);
      player.coyote = 0;
      player.jumpsUsed++;
      keys.jumpPressedAt = -1;
      playJump();
      player.squash = 1.25;
    }

    player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL_SPEED);
    moveAndCollide(player, player.vx * dt, 0);
    moveAndCollide(player, 0, player.vy * dt);
    player.squash += (1 - player.squash) * Math.min(1, dt * 10);

    if (player.onGround) player.runPhase += Math.abs(player.vx) * dt * 0.05;

    // --- Fell in a pit ---
    if (player.y > HEIGHT + 80) { loseLife(true); return; }

    // --- Enemies: simple patrol, turn at their leash or a wall/ledge ---
    for (const en of enemies) {
      if (!en.alive) { en.squashTimer -= dt; continue; }
      en.x += en.vx * dt;
      if (en.x < en.minX || en.x > en.maxX) en.vx *= -1;
      const aheadCol = Math.floor((en.x + (en.vx > 0 ? en.w + 2 : -2)) / TILE);
      const footRow = Math.floor((en.y + en.h + 2) / TILE);
      if (!isSolid(tileAt(footRow, aheadCol))) en.vx *= -1; // don't walk off ledges
    }

    // --- Cobras: peek out of their urn on a cycle, retreat, repeat ---
    for (const co of cobras) {
      co.phase += dt;
      const cycle = co.phase % 3.2;
      co.emerged = cycle > 1.6 && cycle < 3.0;
      co.y = co.emerged ? co.urnTopY - Math.min(1, (cycle - 1.6) / 0.5) * TILE : co.urnTopY;
    }

    // --- Plants: same peek-and-retreat cycle as cobras, out of a pipe ---
    for (const pl of plants) {
      pl.phase += dt;
      const cycle = pl.phase % 3.6;
      pl.emerged = cycle > 1.8 && cycle < 3.2;
      pl.y = pl.emerged ? pl.pipeTopY - Math.min(1, (cycle - 1.8) / 0.6) * TILE : pl.pipeTopY;
    }

    // --- Coins float gently; collect on touch ---
    for (const c of coins) {
      if (c.taken) continue;
      c.phase += dt * 3;
      const dx = c.x - (player.x + player.w / 2);
      const dy = c.y - (player.y + player.h / 2);
      if (Math.hypot(dx, dy) < 24) { c.taken = true; coinCount++; updateHud(); playCoin(); }
    }

    // --- Collisions with hazards (enemies/cobras) ---
    const pRect = { x: player.x + 4, y: player.y + 4, w: player.w - 8, h: player.h - 8 };
    function overlap(r) { return pRect.x < r.x + r.w && pRect.x + pRect.w > r.x && pRect.y < r.y + r.h && pRect.y + pRect.h > r.y; }

    for (const en of enemies) {
      if (!en.alive) continue;
      if (!overlap({ x: en.x, y: en.y, w: en.w, h: en.h })) continue;
      const stomping = player.vy > 60 && player.y + player.h - en.y < 18;
      if (stomping) {
        en.alive = false; en.squashTimer = 0.3;
        player.vy = JUMP_VELOCITY * 0.55;
        playStomp();
      } else if (starTimer > 0) {
        en.alive = false; en.squashTimer = 0.3; playStomp();
      } else if (invincibleTimer <= 0) {
        loseLife(false);
        return;
      }
    }
    for (const co of cobras) {
      if (!co.alive || !co.emerged) continue;
      if (overlap({ x: co.x - 12, y: co.y, w: 24, h: 26 })) {
        if (starTimer > 0) { co.alive = false; playStomp(); }
        else if (invincibleTimer <= 0) { loseLife(false); return; }
      }
    }
    for (const pl of plants) {
      if (!pl.alive || !pl.emerged) continue;
      if (overlap({ x: pl.x - 16, y: pl.y - 26, w: 32, h: 34 })) {
        if (starTimer > 0) { pl.alive = false; playStomp(); }
        else if (invincibleTimer <= 0) { loseLife(false); return; }
      }
    }

    // --- Flagpole ---
    // On a stage with a boss arena past it (the eventual final stage),
    // this is just a checkpoint fanfare — the real finish is beating the
    // monster, and returning here would end "playing" before the
    // boss-arena check below ever got to run. Every other stage's flag
    // IS the finish, so it clears the stage outright.
    if (!flagRaised && player.x + player.w > FLAG_COL * TILE) {
      flagRaised = true;
      playFlag();
      if (!MONSTER_COL) {
        clearStage();
        return;
      }
    }

    // --- Boss arena (final stage only) ---
    if (MONSTER_COL && !monster.defeated && player.x > (MONSTER_COL - 2) * TILE) {
      monster.phase += dt;
      monster.hurtFlash = Math.max(0, monster.hurtFlash - dt);
      const bob = Math.sin(monster.phase * 1.6) * 6;
      const mRect = { x: monster.x, y: monster.y + bob, w: monster.w, h: monster.h };
      if (overlap(mRect)) {
        const stomping = player.vy > 60 && player.y + player.h - mRect.y < 24;
        if (stomping) {
          monster.hits++;
          monster.hurtFlash = 0.3;
          player.vy = JUMP_VELOCITY * 0.6;
          playStomp();
          if (monster.hits >= 3) {
            monster.defeated = true;
            winLevel();
          }
        } else if (invincibleTimer <= 0) {
          loseLife(false);
          return;
        }
      }
    }

    // --- Particles (coin pop, star sparkle) ---
    for (const p of particles) { p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);

    // --- Camera ---
    const targetCamX = Math.max(0, Math.min(player.x - WIDTH * 0.4, LEVEL_COLS * TILE - WIDTH));
    camX += (targetCamX - camX) * Math.min(1, dt * 6);
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#2b2158");
    g.addColorStop(0.55, "#7a4a6b");
    g.addColorStop(1, "#e8a24f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Sun — a soft outer halo plus a brighter, slightly off-center core
    // instead of one flat disc.
    const sunX = WIDTH - 120, sunY = 100;
    const halo = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 95);
    halo.addColorStop(0, "rgba(255, 240, 210, 0.32)");
    halo.addColorStop(1, "rgba(255, 240, 210, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sunX, sunY, 95, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(sunX - 12, sunY - 12, 4, sunX, sunY, 46);
    core.addColorStop(0, "#fffdf6"); core.addColorStop(1, "#ffd89a");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(sunX, sunY, 46, 0, Math.PI * 2); ctx.fill();

    // A few birds drifting slowly across the sky for a little life.
    ctx.strokeStyle = "rgba(35, 22, 20, 0.45)";
    ctx.lineWidth = 1.5;
    const birdDrift = (camX * 0.05) % 400;
    for (let i = 0; i < 3; i++) {
      const bx = 220 + i * 170 - birdDrift;
      const by = 65 + i * 22;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by); ctx.quadraticCurveTo(bx - 3, by - 6, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 6, bx + 8, by);
      ctx.stroke();
    }

    // Distant pyramids, parallax-scrolled slower than the world, with
    // faint block-course lines instead of a flat silhouette.
    const far = camX * 0.3;
    for (let i = -1; i < 6; i++) {
      const bx = i * 260 - (far % 260);
      ctx.fillStyle = "rgba(60, 40, 70, 0.55)";
      ctx.beginPath();
      ctx.moveTo(bx, HEIGHT - 60);
      ctx.lineTo(bx + 90, HEIGHT - 170);
      ctx.lineTo(bx + 180, HEIGHT - 60);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(30, 20, 42, 0.4)";
      ctx.lineWidth = 1;
      for (let cy = HEIGHT - 78; cy > HEIGHT - 165; cy -= 16) {
        const frac = Math.max(0, (cy - (HEIGHT - 170)) / 110);
        const half = frac * 88;
        ctx.beginPath(); ctx.moveTo(bx + 90 - half, cy); ctx.lineTo(bx + 90 + half, cy); ctx.stroke();
      }
    }
    // Broken columns among the near dunes — a little ancient-kingdom
    // set-dressing beyond just sand.
    const colDrift = camX * 0.45;
    for (let i = -1; i < 5; i++) {
      const bx = i * 340 + 240 - (colDrift % 340);
      ctx.fillStyle = "rgba(80, 60, 55, 0.4)";
      ctx.fillRect(bx, HEIGHT - 95, 14, 55);
      ctx.fillRect(bx - 4, HEIGHT - 100, 22, 8);
    }
    const near = camX * 0.6;
    ctx.fillStyle = "rgba(90, 55, 60, 0.5)";
    for (let i = -1; i < 8; i++) {
      const bx = i * 180 - (near % 180);
      ctx.beginPath();
      ctx.ellipse(bx + 60, HEIGHT - 40, 100, 40, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  // Shared brick coursing — used by both the standalone "brick" tile
  // (platforms/stairs) and the plain-brick box variant, so the two
  // always read as the same material.
  function drawBrickTexture(x, y) {
    const g = ctx.createLinearGradient(x, y, x, y + TILE);
    g.addColorStop(0, "#c96f38"); g.addColorStop(1, "#96491f");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + TILE - 3, TILE, 3);
    ctx.strokeStyle = "rgba(55, 22, 8, 0.55)";
    ctx.lineWidth = 1;
    // Staggered coursing (offset joints row to row) instead of two flat
    // stacked halves, so it reads as real brickwork up close.
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE / 3 - 1);
    ctx.strokeRect(x + 1, y + TILE / 3, TILE / 2 - 1, TILE / 3);
    ctx.strokeRect(x + TILE / 2, y + TILE / 3, TILE / 2 - 1, TILE / 3);
    ctx.strokeRect(x + 1, y + (2 * TILE) / 3, TILE - 2, TILE / 3 - 1);
  }

  function drawTile(type, x, y) {
    if (type === "ground") {
      const g = ctx.createLinearGradient(x, y, x, y + TILE);
      g.addColorStop(0, "#dda05e"); g.addColorStop(0.18, "#c98a4b"); g.addColorStop(1, "#a4713a");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "rgba(255, 224, 176, 0.3)";
      ctx.fillRect(x, y, TILE, 3);
      ctx.strokeStyle = "rgba(80, 45, 20, 0.35)";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      // Deterministic pebble/crack speckle (seeded off position, not
      // Math.random()) so the ground has texture without flickering
      // between frames.
      const seed = (x * 13 + y * 7) % 97;
      if (seed % 5 === 0) {
        ctx.fillStyle = "rgba(90, 55, 25, 0.4)";
        ctx.beginPath(); ctx.arc(x + 9 + (seed % 15), y + 22 + (seed % 10), 2, 0, Math.PI * 2); ctx.fill();
      }
      if (seed % 7 === 3) {
        ctx.strokeStyle = "rgba(70, 38, 14, 0.35)"; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5 + (seed % 9), y + 30);
        ctx.lineTo(x + 13 + (seed % 7), y + 34);
        ctx.stroke();
      }
    } else if (type === "brick") {
      drawBrickTexture(x, y);
    } else if (type === "urn") {
      const g = ctx.createRadialGradient(x + TILE / 2 - 6, y + TILE / 2 - 8, 2, x + TILE / 2, y + TILE / 2, TILE / 2);
      g.addColorStop(0, "#b8813f"); g.addColorStop(1, "#68401f");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2, y + TILE / 2, TILE / 2 - 3, TILE / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 30, 10, 0.55)";
      ctx.stroke();
      // Decorative bands, like a real carved urn rather than a flat blob.
      ctx.strokeStyle = "rgba(40, 20, 8, 0.5)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(x + TILE / 2, y + TILE * 0.32, TILE / 2 - 5, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + TILE / 2, y + TILE * 0.7, TILE / 2 - 5, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (type === "flagpole-tip") {
      // Shaft reaches all the way down to the ground from wherever the
      // tip is placed, rather than a fixed height — so it always looks
      // right regardless of how tall that stage's staircase is.
      ctx.fillStyle = "#d8c48a";
      ctx.fillRect(x + TILE / 2 - 3, y, 6, GROUND_ROW * TILE - y);
      ctx.fillStyle = "#e0473a";
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2 + 3, y + 6);
      ctx.lineTo(x + TILE / 2 + 34, y + 16);
      ctx.lineTo(x + TILE / 2 + 3, y + 26);
      ctx.closePath();
      ctx.fill();
    } else if (type === "pipe") {
      // Drawn as a whole in drawPipes() (needs the full column/height,
      // which a single tile cell doesn't have) — nothing to do per-cell.
    } else if (type && type.kind === "box" && type.type === "brick") {
      // A plain brick box never holds a coin — it should look like one of
      // these from the start, not like a "?" block that turns out to be a
      // dud. Same brick texture as the platform tiles, so it's obvious at
      // a glance which of a row of blocks are worth hitting.
      drawBrickTexture(x, y);
    } else if (type && type.kind === "box") {
      if (type.hit) {
        const g = ctx.createLinearGradient(x, y, x, y + TILE);
        g.addColorStop(0, "#8f6f4a"); g.addColorStop(1, "#5c4530");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(40, 25, 10, 0.4)";
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      } else {
        const isStar = type.type === "star";
        const g = ctx.createLinearGradient(x, y, x, y + TILE);
        if (isStar) { g.addColorStop(0, "#fff3b0"); g.addColorStop(0.5, "#e8b84b"); g.addColorStop(1, "#b8811f"); }
        else { g.addColorStop(0, "#f0c473"); g.addColorStop(0.5, "#d99a3f"); g.addColorStop(1, "#a8701f"); }
        ctx.fillStyle = g;
        ctx.fillRect(x, y, TILE, TILE);
        // Beveled inset (light top/left, dark bottom/right) for a carved,
        // gilded-stone look instead of a flat color swatch.
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.beginPath(); ctx.moveTo(x + 2, y + TILE - 2); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + TILE - 2, y + 2); ctx.stroke();
        ctx.strokeStyle = "rgba(70, 40, 10, 0.5)";
        ctx.beginPath(); ctx.moveTo(x + TILE - 2, y + 2); ctx.lineTo(x + TILE - 2, y + TILE - 2); ctx.lineTo(x + 2, y + TILE - 2); ctx.stroke();
        ctx.fillStyle = "rgba(70, 40, 10, 0.4)";
        for (const c of [[x + 5, y + 5], [x + TILE - 5, y + 5], [x + 5, y + TILE - 5], [x + TILE - 5, y + TILE - 5]]) {
          ctx.beginPath(); ctx.arc(c[0], c[1], 1.6, 0, Math.PI * 2); ctx.fill();
        }
        // A slow pulse in the symbol's opacity — reads as faintly magical
        // rather than a dead flat icon.
        ctx.globalAlpha = 0.7 + Math.sin(elapsedInLevel * 3 + x * 0.05) * 0.15;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "700 18px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isStar ? "★" : "?", x + TILE / 2, y + TILE / 2 + 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Pipes are drawn whole (not per-tile) so the collar only appears once
  // at the top and the body reads as one continuous shaft — an aged
  // bronze well-shaft look (flared rivetted collar, weathered banding)
  // instead of the smooth bright-green cartoon tube this is inspired by.
  function drawPipes() {
    for (const p of PIPES) {
      const topRow = GROUND_ROW - p.height;
      const x = p.col * TILE - camX;
      const y = topRow * TILE;
      const w = TILE * 2;
      const h = p.height * TILE;
      if (x + w < -20 || x > WIDTH + 20) continue;

      const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
      bodyGrad.addColorStop(0, "#1f3d36"); bodyGrad.addColorStop(0.16, "#3a7d6b");
      bodyGrad.addColorStop(0.5, "#5cab94"); bodyGrad.addColorStop(0.84, "#3a7d6b"); bodyGrad.addColorStop(1, "#18302a");
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(x, y + 14, w, h - 14);
      ctx.strokeStyle = "rgba(8, 20, 16, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 14); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
      for (let by = y + 14 + TILE; by < y + h; by += TILE) {
        ctx.beginPath(); ctx.moveTo(x + 2, by); ctx.lineTo(x + w - 2, by); ctx.stroke();
      }

      // Flared, rivetted collar.
      const collarGrad = ctx.createLinearGradient(x - 6, 0, x + w + 6, 0);
      collarGrad.addColorStop(0, "#6b471f"); collarGrad.addColorStop(0.5, "#c48a3f"); collarGrad.addColorStop(1, "#553a18");
      ctx.fillStyle = collarGrad;
      ctx.fillRect(x - 6, y, w + 12, 16);
      ctx.strokeStyle = "rgba(35, 22, 8, 0.6)";
      ctx.strokeRect(x - 5.5, y + 0.5, w + 11, 15);
      ctx.fillStyle = "#2e1c0a";
      for (let rx = x - 1; rx <= x + w + 1; rx += 11) {
        ctx.beginPath(); ctx.arc(rx, y + 8, 1.6, 0, Math.PI * 2); ctx.fill();
      }

      // Dark hollow opening at the very top.
      ctx.fillStyle = "#0f1e19";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 3, w / 2 - 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWorld() {
    const startCol = Math.max(0, Math.floor(camX / TILE) - 1);
    const endCol = Math.min(LEVEL_COLS - 1, Math.ceil((camX + WIDTH) / TILE) + 1);
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const t = tiles[r][c];
        if (t) drawTile(t, c * TILE - camX, r * TILE);
      }
    }
    // Flagpole rope/finial already drawn as a tile; add a small base cap
    ctx.fillStyle = "#8a5a2e";
    ctx.fillRect(FLAG_COL * TILE - camX - 4, GROUND_ROW * TILE - 4, TILE + 8, 6);
  }

  // A coin spinning on its vertical axis: squash it horizontally by
  // cos(spin) to fake the 3D turn, with a "$" that fades in/out as the
  // coin turns face-on vs edge-on.
  function drawCoinIcon(x, y, r, spin) {
    const s = Math.cos(spin || 0);
    const scaleX = Math.max(0.14, Math.abs(s));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, 1);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    g.addColorStop(0, "#fffbe6"); g.addColorStop(0.55, "#ffd54f"); g.addColorStop(1, "#c8860a");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8a5a10"; ctx.lineWidth = 1.4 / scaleX;
    ctx.stroke();
    ctx.restore();

    const facing = Math.abs(s);
    if (facing > 0.3) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (facing - 0.3) / 0.35);
      ctx.fillStyle = "#8a5a10";
      ctx.font = `700 ${Math.max(8, Math.round(r * 1.2))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", x, y + 1);
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (const en of enemies) {
      const sx = en.x - camX;
      if (sx < -60 || sx > WIDTH + 60) continue;
      const img = ENEMY_SPRITES[en.variant];
      ctx.save();
      const squashed = !en.alive;
      const sy = squashed ? en.y + en.h * 0.6 : en.y;
      ctx.translate(sx + en.w / 2, sy + en.h / 2);
      // Both sprites face right in their source art, so only flip when
      // actually walking left — the opposite of "flip when idle-facing"
      // would have the leading edge trailing instead of leading.
      ctx.scale(en.vx < 0 ? -1 : 1, squashed ? 0.3 : 1);
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, -en.w / 2, -en.h / 2, en.w, en.h);
      }
      ctx.restore();
    }
    for (const co of cobras) {
      if (!co.alive) continue;
      const sx = co.x - camX;
      if (sx < -40 || sx > WIDTH + 40) continue;
      ctx.save();
      ctx.translate(sx, co.y + TILE);
      const stretch = Math.max(0, (co.urnTopY - co.y) / TILE);
      ctx.fillStyle = "#3a7a4a";
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.quadraticCurveTo(-9, -TILE * stretch, 0, -TILE * stretch - 8);
      ctx.quadraticCurveTo(9, -TILE * stretch, 9, 0);
      ctx.closePath();
      ctx.fill();
      if (stretch > 0.3) {
        ctx.fillStyle = "#e8d84b";
        ctx.beginPath(); ctx.arc(0, -TILE * stretch - 8, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const pl of plants) {
      if (!pl.alive) continue;
      const sx = pl.x - camX;
      if (sx < -40 || sx > WIDTH + 40) continue;
      ctx.save();
      ctx.translate(sx, pl.y + TILE);
      const stretch = Math.max(0, (pl.pipeTopY - pl.y) / TILE);
      const stemTop = -TILE * stretch;

      // Stem — a ridged, thorned vine rather than a smooth tube.
      const stemGrad = ctx.createLinearGradient(-7, 0, 7, 0);
      stemGrad.addColorStop(0, "#254a2c"); stemGrad.addColorStop(0.5, "#4fa863"); stemGrad.addColorStop(1, "#1e3a23");
      ctx.fillStyle = stemGrad;
      ctx.fillRect(-7, stemTop, 14, TILE * stretch + 7);
      ctx.fillStyle = "rgba(150, 220, 160, 0.35)";
      ctx.fillRect(-2, stemTop, 2.5, TILE * stretch + 7); // gloss streak
      ctx.fillStyle = "#16291a";
      for (let ty = stemTop + 10, side = 1; ty < 4; ty += 13, side *= -1) {
        ctx.beginPath();
        ctx.moveTo(side * 7, ty);
        ctx.lineTo(side * 14, ty + 3);
        ctx.lineTo(side * 7, ty + 7);
        ctx.closePath();
        ctx.fill();
      }

      if (stretch > 0.25) {
        const gape = 8 + Math.sin(pl.phase * 5) * 3; // jaws work menacingly, not just idle
        ctx.save();
        const bloom = Math.min(1, (stretch - 0.25) / 0.4);
        ctx.translate(0, stemTop);
        ctx.scale(bloom, bloom);

        // Hood — bigger and more dome-forward than a flat petal, so it
        // reads as a real head rather than a flower. Two gradient passes
        // (a base tone, then an offset highlight) fake the glossy,
        // rounded-volume look of a rendered creature instead of flat fill.
        ctx.fillStyle = "#6a1830";
        ctx.beginPath();
        ctx.moveTo(-25, 2);
        ctx.quadraticCurveTo(-32, -26, -10, -38 - gape);
        ctx.quadraticCurveTo(0, -43 - gape, 10, -38 - gape);
        ctx.quadraticCurveTo(32, -26, 25, 2);
        ctx.quadraticCurveTo(0, 9, -25, 2);
        ctx.closePath();
        ctx.fill();
        const hoodShade = ctx.createRadialGradient(-8, -30, 2, -4, -18, 34);
        hoodShade.addColorStop(0, "#ec8298"); hoodShade.addColorStop(0.55, "#c4415f"); hoodShade.addColorStop(1, "rgba(122, 31, 56, 0)");
        ctx.fillStyle = hoodShade;
        ctx.beginPath();
        ctx.moveTo(-25, 2);
        ctx.quadraticCurveTo(-32, -26, -10, -38 - gape);
        ctx.quadraticCurveTo(0, -43 - gape, 10, -38 - gape);
        ctx.quadraticCurveTo(32, -26, 25, 2);
        ctx.quadraticCurveTo(0, 9, -25, 2);
        ctx.closePath();
        ctx.fill();
        // Warts/sores — a few raised bumps, each shaded like a real bump.
        for (const w of [[-14, -24, 3], [11, -17, 2.4], [-3, -34 - gape * 0.6, 2], [17, -6, 2.2]]) {
          const wg = ctx.createRadialGradient(w[0] - 0.8, w[1] - 0.8, 0.3, w[0], w[1], w[2]);
          wg.addColorStop(0, "rgba(90, 20, 35, 0.75)"); wg.addColorStop(1, "rgba(40, 8, 16, 0.35)");
          ctx.fillStyle = wg;
          ctx.beginPath(); ctx.arc(w[0], w[1], w[2], 0, Math.PI * 2); ctx.fill();
        }

        // Throat — dark interior showing between the fangs.
        ctx.fillStyle = "#2e0a12";
        ctx.beginPath();
        ctx.moveTo(-16, -3);
        ctx.quadraticCurveTo(0, -26 - gape, 16, -3);
        ctx.quadraticCurveTo(0, 3, -16, -3);
        ctx.closePath();
        ctx.fill();

        // Fangs ringing the rim, top and bottom — tapered with a glossy
        // highlight sliver down one edge instead of a flat triangle.
        const fangCount = 5;
        for (let i = 0; i < fangCount; i++) {
          const fx = -15 + (30 / (fangCount - 1)) * i;
          const rim = -3 - Math.abs(fx) * 0.15; // rim follows the mouth's curve
          ctx.fillStyle = "#fff8ec";
          ctx.beginPath();
          ctx.moveTo(fx - 2.8, rim);
          ctx.quadraticCurveTo(fx - 1, rim - 4, fx, rim - 8);
          ctx.quadraticCurveTo(fx + 1, rim - 4, fx + 2.8, rim);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.beginPath(); ctx.moveTo(fx - 1.2, rim - 1); ctx.lineTo(fx - 0.5, rim - 6); ctx.lineTo(fx, rim - 1); ctx.closePath(); ctx.fill();

          const ly = rim - 2 - gape - 14;
          ctx.fillStyle = "#fff8ec";
          ctx.beginPath();
          ctx.moveTo(fx - 2.4, ly + 7);
          ctx.quadraticCurveTo(fx - 1, ly + 3, fx, ly);
          ctx.quadraticCurveTo(fx + 1, ly + 3, fx + 2.4, ly + 7);
          ctx.closePath();
          ctx.fill();
        }

        // Lolling forked tongue, wagging as it hangs — a center highlight
        // streak sells the wet-glossy look.
        const wag = Math.sin(pl.phase * 4) * 4;
        const tongueGrad = ctx.createLinearGradient(-5, -8, 5, 18);
        tongueGrad.addColorStop(0, "#f07890"); tongueGrad.addColorStop(1, "#c43f5c");
        ctx.fillStyle = tongueGrad;
        ctx.beginPath();
        ctx.moveTo(-4, -8);
        ctx.quadraticCurveTo(-7 + wag * 0.3, 7, wag - 2.5, 16);
        ctx.lineTo(wag, 20);
        ctx.lineTo(wag + 4.5, 15);
        ctx.quadraticCurveTo(7 + wag * 0.3, 6, 4, -8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 230, 235, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(wag * 0.3, -4); ctx.lineTo(wag * 0.7, 12); ctx.stroke();

        // A drop of venomous drool, periodically falling, with a glint.
        const dripPhase = (pl.phase * 0.9) % 1;
        if (dripPhase < 0.55) {
          const dy = -4 + dripPhase * 30;
          ctx.fillStyle = "rgba(200, 235, 190, 0.85)";
          ctx.beginPath(); ctx.arc(wag + 4, dy, 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.beginPath(); ctx.arc(wag + 3.3, dy - 0.6, 0.7, 0, Math.PI * 2); ctx.fill();
        }

        // Glowing stalked eyes peering over the hood — ringed iris and a
        // glint highlight instead of a flat pupil dot.
        for (const ex of [-12, 12]) {
          ctx.strokeStyle = "#2f6b3f";
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(ex * 0.5, -36 - gape);
          ctx.lineTo(ex, -48 - gape);
          ctx.stroke();
          ctx.fillStyle = "#ffcf4d";
          ctx.beginPath(); ctx.arc(ex, -50 - gape, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#a8621a"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(ex, -50 - gape, 5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "#2a1608";
          ctx.beginPath(); ctx.arc(ex + (ex > 0 ? 1.6 : -1.6), -50 - gape, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath(); ctx.arc(ex + (ex > 0 ? 0.2 : -2.6), -52 - gape, 0.9, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawCoins() {
    for (const c of coins) {
      if (c.taken) continue;
      const sx = c.x - camX;
      if (sx < -20 || sx > WIDTH + 20) continue;
      const bob = Math.sin(c.phase) * 4;
      drawCoinIcon(sx, c.y + bob, 9, c.phase * 2.2);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const sx = p.x - camX;
      if (p.kind === "coinPop") { ctx.globalAlpha = Math.max(0, p.life / 0.5); drawCoinIcon(sx, p.y, 8, elapsedInLevel * 12); ctx.globalAlpha = 1; }
      else if (p.kind === "star") {
        ctx.save();
        ctx.translate(sx, p.y);
        ctx.rotate(p.life * 4);
        ctx.fillStyle = `hsl(${(p.life * 90) % 360}, 90%, 62%)`;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const a2 = a + Math.PI / 5;
          ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
          ctx.lineTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // habib.png is cropped at the hip (was the full 567x792 figure; now
  // 567x708 with the original static boots trimmed off) so real, moving
  // legs can be drawn under it each frame instead of the whole sprite
  // just hopping in place. Boot geometry below is hand-measured from
  // where those original boots sat, in the same source-pixel space.
  const BOOT_L = { x: 78, w: 198 };
  const BOOT_R = { x: 305, w: 193 };
  const BOOT_H = 78;
  const HABIB_HALF_W = 567 / 2;
  function legStride(phase) {
    const swing = Math.sin(phase);
    return { dx: swing * 20, dy: Math.max(0, -Math.cos(phase)) * 12 };
  }
  function drawBoot(boot, dx, dy) {
    const bx = boot.x - HABIB_HALF_W + dx;
    ctx.fillStyle = "#a85a1c";
    ctx.fillRect(bx, dy, boot.w, 22);
    ctx.fillStyle = "#5a2410";
    ctx.fillRect(bx, dy + 20, boot.w, BOOT_H - 20);
  }

  function drawPlayer() {
    if (invincibleTimer > 0 && Math.floor(elapsedInLevel * 14) % 2 === 0) return; // hurt-flicker
    const sx = player.x - camX;
    const bob = player.onGround ? Math.abs(Math.sin(player.runPhase)) * 2 : 0;
    ctx.save();
    ctx.translate(sx + player.w / 2, player.y + player.h - bob);
    ctx.scale(player.facing * 0.076, 0.076 * player.squash);
    if (starTimer > 0) {
      ctx.filter = `hue-rotate(${Math.floor(elapsedInLevel * 600) % 360}deg) saturate(1.6)`;
    }

    let legA, legB;
    if (!player.onGround) {
      legA = { dx: -14, dy: -16 };
      legB = { dx: 16, dy: -8 };
    } else if (Math.abs(player.vx) < 5) {
      legA = { dx: 0, dy: 0 };
      legB = { dx: 0, dy: 0 };
    } else {
      legA = legStride(player.runPhase);
      legB = legStride(player.runPhase + Math.PI);
    }
    drawBoot(BOOT_L, legA.dx, legA.dy);
    drawBoot(BOOT_R, legB.dx, legB.dy);

    if (habibImg.complete && habibImg.naturalWidth) {
      ctx.drawImage(habibImg, -habibImg.width / 2, -habibImg.height);
    }
    ctx.restore();
  }

  function drawMonsterAndPrincess() {
    if (!MONSTER_COL || player.x < (MONSTER_COL - 6) * TILE) return;
    const sx = monster.x - camX;
    if (!monster.defeated) {
      const bob = Math.sin(monster.phase * 1.6) * 6;
      ctx.save();
      ctx.translate(sx + monster.w / 2, monster.y + bob + monster.h);
      const scale = monster.w / (monsterImg.naturalWidth || monster.w);
      ctx.scale(-scale, scale);
      if (monster.hurtFlash > 0) ctx.filter = "brightness(1.8) saturate(0.4)";
      if (monsterImg.complete && monsterImg.naturalWidth) ctx.drawImage(monsterImg, -monsterImg.width / 2, -monsterImg.height);
      ctx.restore();
    } else {
      const px = sx + monster.w / 2;
      ctx.save();
      ctx.translate(px, monster.y + monster.h * 0.4);
      const scale = 70 / (princessImg.naturalWidth || 70);
      ctx.scale(scale, scale);
      if (princessImg.complete && princessImg.naturalWidth) ctx.drawImage(princessImg, -princessImg.width / 2, -princessImg.height);
      ctx.restore();
    }
  }

  function render() {
    drawBackground();
    ctx.save();
    drawWorld();
    drawPipes();
    drawCoins();
    drawEnemies();
    drawMonsterAndPrincess();
    drawPlayer();
    drawParticles();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------
  let lastTime = null;
  function loop(t) {
    if (state !== "playing" && state !== "cutscene") return;
    if (lastTime === null) lastTime = t;
    const dt = Math.min((t - lastTime) / 1000, 0.033);
    lastTime = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  render(); // paint one static frame behind the intro overlay
})();
