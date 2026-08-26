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
  const GROUND_ROW = 10; // first solid row (top surface)
  const GROUND_ROWS = 3;
  const LEVEL_ROWS = 13;
  const LEVEL_COLS = 124;

  const PITS = [
    [21, 23],
    [46, 48],
    [77, 80],
    [96, 98],
  ];

  // Floating brick platforms: {col, row, len}
  const PLATFORMS = [
    { col: 10, row: 7, len: 3 },
    { col: 18, row: 6, len: 2 },
    { col: 30, row: 8, len: 4 },
    { col: 38, row: 5, len: 3 },
    { col: 52, row: 7, len: 3 },
    { col: 60, row: 5, len: 2 },
    { col: 68, row: 8, len: 4 },
    { col: 84, row: 7, len: 3 },
    { col: 90, row: 5, len: 3 },
    { col: 101, row: 7, len: 4 },
  ];

  // Interactive boxes: {col, row, type: "coin"|"star"|"brick"}
  const BLOCKS = [
    { col: 6, row: 7, type: "coin" },
    { col: 7, row: 7, type: "coin" },
    { col: 8, row: 7, type: "brick" },
    { col: 19, row: 6, type: "coin" },
    { col: 31, row: 8, type: "coin" },
    { col: 33, row: 8, type: "star" },
    { col: 39, row: 5, type: "coin" },
    { col: 53, row: 7, type: "coin" },
    { col: 61, row: 5, type: "coin" },
    { col: 69, row: 8, type: "coin" },
    { col: 71, row: 8, type: "coin" },
    { col: 85, row: 7, type: "brick" },
    { col: 91, row: 5, type: "star" },
    { col: 102, row: 7, type: "coin" },
    { col: 104, row: 7, type: "coin" },
  ];

  // Loose floating coins (no block underneath, just collectibles)
  const COINS = [
    { col: 14, row: 8 }, { col: 15, row: 8 }, { col: 16, row: 8 },
    { col: 42, row: 7 }, { col: 43, row: 6 }, { col: 44, row: 5 },
    { col: 63, row: 8 }, { col: 64, row: 8 }, { col: 65, row: 8 },
    { col: 108, row: 6 }, { col: 109, row: 6 },
  ];

  // Urns — solid obstacles; some periodically hiss out a sand-cobra that
  // retreats after a moment (an original creature, not a reskinned trap
  // plant — it stays inside its urn and pokes out rather than sitting
  // exposed in a tube).
  const URNS = [
    { col: 26, row: 10, height: 2, spawnsCobra: true },
    { col: 56, row: 10, height: 3, spawnsCobra: false },
    { col: 73, row: 10, height: 2, spawnsCobra: true },
    { col: 88, row: 10, height: 3, spawnsCobra: true },
  ];

  // Ground-patrol enemies — alternating the two real creature sprites
  // (scorpion/beetle) instead of the placeholder drawn shapes.
  const ENEMIES = [
    { col: 12, row: 9, min: 11, max: 17, variant: "scorpion" },
    { col: 35, row: 9, min: 34, max: 41, variant: "beetle" },
    { col: 50, row: 9, min: 49, max: 55, variant: "scorpion" },
    { col: 66, row: 9, min: 64, max: 70, variant: "beetle" },
    { col: 82, row: 9, min: 81, max: 87, variant: "scorpion" },
    { col: 93, row: 9, min: 92, max: 99, variant: "beetle" },
    { col: 106, row: 9, min: 104, max: 110, variant: "scorpion" },
  ];

  const FLAG_COL = 113;
  const ARENA_START_COL = 114; // small closed arena for the monster past the flag
  const MONSTER_COL = 119;

  function inPit(col) {
    return PITS.some(([a, b]) => col >= a && col <= b);
  }

  // Builds the solid/empty grid once. `tiles[row][col]` is either null
  // (empty) or a type string used by both collision and rendering.
  let tiles;
  function buildTileGrid() {
    tiles = Array.from({ length: LEVEL_ROWS }, () => new Array(LEVEL_COLS).fill(null));
    for (let col = 0; col < LEVEL_COLS; col++) {
      if (inPit(col) && col < ARENA_START_COL) continue;
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
    tiles[GROUND_ROW - 1][FLAG_COL] = "flagpole-tip";
    for (let r = GROUND_ROW; r < GROUND_ROW + GROUND_ROWS; r++) tiles[r][FLAG_COL] = null;
  }

  function tileAt(row, col) {
    if (row < 0 || row >= LEVEL_ROWS || col < 0 || col >= LEVEL_COLS) return null;
    return tiles[row][col];
  }
  function isSolid(t) {
    return t === "ground" || t === "brick" || t === "urn" || (t && t.kind === "box");
  }

  // ---------------------------------------------------------------------
  // Assets — the three character portraits are the only external images;
  // everything else (tiles, backdrop, props) is drawn with canvas
  // primitives, same lightweight approach as the rest of Velora's games.
  // ---------------------------------------------------------------------
  const ASSET_V = "3";
  const habibImg = new Image();
  habibImg.src = "assets/habib.png?v=" + ASSET_V;
  const monsterImg = new Image();
  monsterImg.src = "assets/arab-monster.png?v=" + ASSET_V;
  const princessImg = new Image();
  princessImg.src = "assets/princess.png?v=" + ASSET_V;
  const scorpionImg = new Image();
  scorpionImg.src = "assets/scorpion.png?v=" + ASSET_V;
  const beetleImg = new Image();
  beetleImg.src = "assets/beetle.png?v=" + ASSET_V;
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
      if (state === "intro" || state === "gameover" || state === "win") { e.preventDefault(); startOrRestart(); }
      if (state === "playing") e.preventDefault();
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
  let player, enemies, coins, cobras, particles, camX, flagRaised, monster, elapsedInLevel;
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
  resetRun();
  showOverlay(
    "Run Habib",
    "The Arab Monster has taken the Princess into the old kingdom. Habib's not waiting for anyone else to go get her.",
    "assets/habib.png?v=3",
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
      resetRun();
      state = "playing";
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "win") {
      hideOverlay();
      resetRun();
      state = "playing";
      startMusic();
      lastTime = null;
      requestAnimationFrame(loop);
    }
  }
  startBtn.addEventListener("click", startOrRestart);

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
      showOverlay("Habib is out of chances", `You collected ${coinCount} coins this run. The Princess is still waiting.`, "assets/habib.png?v=3", "↻ Try Again");
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
      showOverlay("The Princess is safe", `Habib got her out with ${coinCount} coins to spare. The old kingdom can rest easy.`, "assets/princess.png?v=3", "↻ Play Again");
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

    // --- Flagpole — a checkpoint fanfare, not the actual win condition.
    // The real finish is beating the monster just past it: if this returned
    // here like a normal flagpole finish would, the player could never
    // reach the boss arena at all, since state would already have left
    // "playing" before the boss-arena check below ever ran.
    if (!flagRaised && player.x + player.w > FLAG_COL * TILE) {
      flagRaised = true;
      playFlag();
    }

    // --- Boss arena ---
    if (!monster.defeated && player.x > (MONSTER_COL - 2) * TILE) {
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

    // Sun
    ctx.fillStyle = "rgba(255, 240, 210, 0.9)";
    ctx.beginPath();
    ctx.arc(WIDTH - 120, 100, 46, 0, Math.PI * 2);
    ctx.fill();

    // Distant dunes/pyramids, parallax-scrolled slower than the world
    const far = camX * 0.3;
    ctx.fillStyle = "rgba(60, 40, 70, 0.55)";
    for (let i = -1; i < 6; i++) {
      const bx = i * 260 - (far % 260);
      ctx.beginPath();
      ctx.moveTo(bx, HEIGHT - 60);
      ctx.lineTo(bx + 90, HEIGHT - 170);
      ctx.lineTo(bx + 180, HEIGHT - 60);
      ctx.closePath();
      ctx.fill();
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

  function drawTile(type, x, y) {
    if (type === "ground") {
      ctx.fillStyle = "#c98a4b";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(x, y, TILE, 4);
      ctx.strokeStyle = "rgba(80, 45, 20, 0.35)";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    } else if (type === "brick") {
      ctx.fillStyle = "#b5602f";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = "rgba(60, 25, 10, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE / 2 - 2);
      ctx.strokeRect(x + 1, y + TILE / 2, TILE - 2, TILE / 2 - 2);
    } else if (type === "urn") {
      ctx.fillStyle = "#8a5a2e";
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2, y + TILE / 2, TILE / 2 - 3, TILE / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 30, 10, 0.5)";
      ctx.stroke();
    } else if (type === "flagpole-tip") {
      ctx.fillStyle = "#d8c48a";
      ctx.fillRect(x + TILE / 2 - 3, y, 6, TILE * 4);
      ctx.fillStyle = "#e0473a";
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2 + 3, y + 6);
      ctx.lineTo(x + TILE / 2 + 34, y + 16);
      ctx.lineTo(x + TILE / 2 + 3, y + 26);
      ctx.closePath();
      ctx.fill();
    } else if (type && type.kind === "box") {
      if (type.hit && type.type !== "brick") {
        ctx.fillStyle = "#7a5a3a";
        ctx.fillRect(x, y, TILE, TILE);
      } else {
        ctx.fillStyle = type.type === "star" ? "#e8b84b" : "#d99a3f";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(70, 40, 10, 0.5)";
        ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "700 18px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(type.type === "star" ? "★" : "?", x + TILE / 2, y + TILE / 2 + 1);
      }
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

  function drawPlayer() {
    if (invincibleTimer > 0 && Math.floor(elapsedInLevel * 14) % 2 === 0) return; // hurt-flicker
    const sx = player.x - camX;
    const bob = player.onGround ? Math.abs(Math.sin(player.runPhase)) * 5 : 0;
    ctx.save();
    ctx.translate(sx + player.w / 2, player.y + player.h - bob);
    // habib.png is now trimmed tight to its actual content (was 1024x1153
    // with 216px of dead transparent space below his feet, which is why he
    // used to render floating above the ground — the old scale was tuned
    // for that untrimmed size). 0.076 targets the same ~60px on-screen
    // height against the new 567x792 source.
    ctx.scale(player.facing * 0.076, 0.076 * player.squash);
    if (starTimer > 0) {
      ctx.filter = `hue-rotate(${Math.floor(elapsedInLevel * 600) % 360}deg) saturate(1.6)`;
    }
    if (habibImg.complete && habibImg.naturalWidth) {
      ctx.drawImage(habibImg, -habibImg.width / 2, -habibImg.height);
    }
    ctx.restore();
  }

  function drawMonsterAndPrincess() {
    if (player.x < (MONSTER_COL - 6) * TILE) return;
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
