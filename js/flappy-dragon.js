// Flappy Dragon — a Flappy Bird–style game. Keep the dragon airborne through
// the gaps in the castle pylons. Spacebar (or tap/click) to flap.
(function () {
  const canvas = document.getElementById("dragonCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  // Touch devices get a gentler flap — the same impulse that feels right
  // with a keyboard tap reads as way too strong from a finger tap on a
  // small screen.
  const IS_TOUCH = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;

  const GRAVITY = 1500; // px/s^2
  const FLAP_VELOCITY = IS_TOUCH ? -345 : -440; // px/s
  const MAX_FALL_SPEED = 720; // px/s
  const PYLON_SPEED = 190; // px/s
  const PYLON_GAP = 185; // px, vertical gap the dragon flies through — base value at level 1
  const PYLON_GAP_MIN = 150; // floor so late levels stay flyable
  const PYLON_GAP_STEP = 2; // narrows this many px per level
  const PYLON_MARGIN = 60; // px, how close a gap can sit to the very top/bottom — base value at level 1
  const PYLON_MARGIN_MIN = 48; // never closer than this to the very top/bottom, at any level
  const PYLON_MARGIN_STEP = 1; // tightens this many px per level
  const PYLON_WIDTH = 76;
  const PYLON_SPACING = 260; // horizontal distance between pylon pairs
  const DRAGON_X = WIDTH * 0.28;
  const DRAGON_RADIUS = 19; // used for all the body-part math the dragon is drawn with
  const DRAGON_SCALE = 0.8; // shrinks the whole dragon (and its hitbox) visually
  const DRAGON_HIT_RADIUS = DRAGON_RADIUS * DRAGON_SCALE;
  const GROUND_HEIGHT = 34;
  const COIN_RADIUS = 12;
  const COIN_VALUE = 5; // bonus on top of the +1 per pylon passed
  const LEVEL_SCORE_STEP = 50; // score needed per level

  // Missile/jet tuning for the level 10 Jet Chase event.
  const MISSILE_SPEED = 260; // px/s, a little faster than the pylons ever scroll
  const MISSILE_INTERVAL = 1.0; // seconds between missiles
  const MISSILE_RADIUS = 7;
  const JET_X = WIDTH * 0.12; // fixed on the left, behind the dragon, "chasing" it
  const JET_CHASE_REWARD = 5000; // flat coin bonus for surviving the whole event

  // Each level cycles through these skies; a couple of them also reskin the
  // dragon so the "world" feels like it's actually progressing, not just a
  // number going up. Body/wing/glow colors are the only things that change —
  // the dragon's silhouette stays recognizable at every level.
  const SKY_THEMES = [
    {
      name: "Sunset",
      sky: ["#3d2c5e", "#d8617a", "#f2915a", "#ffc884"],
      skyStops: [0, 0.45, 0.75, 1],
      orbColor: "#fff1cf",
      orbGlowRGB: "255, 225, 170",
      decoration: null,
      dragon: null,
    },
    {
      name: "Twilight",
      sky: ["#1b1035", "#3a1f68", "#7c3aa0", "#c15fae"],
      skyStops: [0, 0.4, 0.7, 1],
      orbColor: "#f4e6ff",
      orbGlowRGB: "220, 190, 255",
      decoration: null,
      dragon: null,
    },
    {
      name: "Midnight",
      sky: ["#050814", "#0d1533", "#141d40", "#1c2650"],
      skyStops: [0, 0.5, 0.8, 1],
      orbColor: "#e8f0ff",
      orbGlowRGB: "180, 210, 255",
      decoration: "stars",
      dragon: {
        body: ["#8f86c9", "#2e2650"],
        snout: "#2e2650",
        horn: "#151030",
        wing: "#4a3d7a",
        glowRGB: "120, 140, 255",
        glowAlpha: 0.45,
        eyeIris: "#5be8ff",
      },
    },
    {
      name: "Dawn",
      sky: ["#2b2140", "#8a4a6b", "#f2a65a", "#fde3b0"],
      skyStops: [0, 0.35, 0.7, 1],
      orbColor: "#fff6df",
      orbGlowRGB: "255, 230, 190",
      decoration: null,
      dragon: null,
    },
    {
      name: "Inferno",
      sky: ["#1a0805", "#4a0f0a", "#b3320f", "#ff7a1a"],
      skyStops: [0, 0.4, 0.75, 1],
      orbColor: "#ffdca0",
      orbGlowRGB: "255, 140, 60",
      decoration: "embers",
      dragon: {
        body: ["#fff3b0", "#c81d11"],
        snout: "#c81d11",
        horn: "#5c0a05",
        wing: "#e8420f",
        glowRGB: "255, 90, 30",
        glowAlpha: 0.55,
        eyeIris: "#2a1810",
      },
    },
  ];
  const DEFAULT_DRAGON_SKIN = {
    body: ["#cdf9df", "#1f7a52"],
    snout: "#1f7a52",
    horn: "#f0c14b",
    wing: "#ffd873",
    glowRGB: "90, 224, 156",
    glowAlpha: 0.35,
    eyeIris: "#e8a317",
  };
  const DEFAULT_FLAP_PROFILE = { type: "square", f0: 320, f1: 640, duration: 0.09, gain: 0.14 };

  // The Dragon Store catalog — 10 purchasable dragons. Everyone starts with
  // the free jade dragon above; these are bought with coins earned from
  // play. A dragon's `skin` is the exact same shape drawDragon() already
  // consumes for the level-based reskins, and its `wing` color doubles as
  // its trail color for free (drawTrail keys off skin.wing). `flap` is its
  // own flap-sound profile (see playFlapSound below) — either a pitch sweep
  // {type, f0, f1} or a two-note {chime: [f1, f2]}.
  const DRAGON_CATALOG = [
    {
      id: "ember-fang", name: "Ember Fang", rarity: "Common", price: 100000,
      blurb: "Quick-tempered and always warm to the touch.",
      skin: { body: ["#ffcf8f", "#c23616"], snout: "#c23616", horn: "#5c1a0a", wing: "#ff7f3f", glowRGB: "255, 110, 50", glowAlpha: 0.4, eyeIris: "#2a1810" },
      flap: { type: "square", f0: 380, f1: 720, duration: 0.09, gain: 0.14 },
    },
    {
      id: "storm-serpent", name: "Storm Serpent", rarity: "Common", price: 100000,
      blurb: "Crackles with static before every wingbeat.",
      skin: { body: ["#dbe9f4", "#3d5a73"], snout: "#3d5a73", horn: "#1b2b38", wing: "#7fd8ff", glowRGB: "120, 200, 255", glowAlpha: 0.4, eyeIris: "#eafcff" },
      flap: { type: "sawtooth", f0: 300, f1: 650, duration: 0.09, gain: 0.12 },
    },
    {
      id: "frostbite", name: "Frostbite", rarity: "Uncommon", price: 150000,
      blurb: "Leaves a trail of frost in the warm sunset air.",
      skin: { body: ["#eaf9ff", "#4fa8c9"], snout: "#4fa8c9", horn: "#1c5a70", wing: "#bdf2ff", glowRGB: "150, 230, 255", glowAlpha: 0.45, eyeIris: "#0d3a4a" },
      flap: { type: "triangle", f0: 420, f1: 780, duration: 0.11, gain: 0.14 },
    },
    {
      id: "sakura-bloom", name: "Sakura Bloom", rarity: "Uncommon", price: 150000,
      blurb: "Petals drift from its wings on every flap.",
      skin: { body: ["#ffe6f0", "#e8789f"], snout: "#e8789f", horn: "#7a3552", wing: "#ffc2da", glowRGB: "255, 190, 220", glowAlpha: 0.4, eyeIris: "#5a2036" },
      flap: { type: "sine", f0: 340, f1: 560, duration: 0.12, gain: 0.13 },
    },
    {
      id: "venom-coil", name: "Venom Coil", rarity: "Uncommon", price: 200000,
      blurb: "Best admired from a respectful distance.",
      skin: { body: ["#d4ff7a", "#4a6b1a"], snout: "#4a6b1a", horn: "#1f2e0a", wing: "#9aeb3f", glowRGB: "170, 255, 60", glowAlpha: 0.4, eyeIris: "#1a0f00" },
      flap: { type: "square", f0: 200, f1: 380, duration: 0.13, gain: 0.14 },
    },
    {
      id: "obsidian-fang", name: "Obsidian Fang", rarity: "Rare", price: 250000,
      blurb: "Carved from midnight stone, or so the legend goes.",
      skin: { body: ["#4a4a52", "#0d0d10"], snout: "#0d0d10", horn: "#8c1c1c", wing: "#b02020", glowRGB: "200, 30, 30", glowAlpha: 0.45, eyeIris: "#ff3b3b" },
      flap: { type: "square", f0: 150, f1: 300, duration: 0.16, gain: 0.15 },
    },
    {
      id: "solar-flare", name: "Solar Flare", rarity: "Rare", price: 350000,
      blurb: "Outshines the very sun it flies past.",
      skin: { body: ["#fffbe0", "#f0b429"], snout: "#f0b429", horn: "#8a5a00", wing: "#ffe066", glowRGB: "255, 210, 90", glowAlpha: 0.5, eyeIris: "#7a4a00" },
      flap: { type: "triangle", f0: 480, f1: 860, duration: 0.09, gain: 0.15 },
    },
    {
      id: "void-wyrm", name: "Void Wyrm", rarity: "Epic", price: 500000,
      blurb: "Something about it makes the air feel colder.",
      skin: { body: ["#9b6bd1", "#231041"], snout: "#231041", horn: "#0f0821", wing: "#c084fc", glowRGB: "180, 90, 255", glowAlpha: 0.5, eyeIris: "#e8d4ff" },
      flap: { type: "sine", f0: 520, f1: 180, duration: 0.18, gain: 0.14 },
    },
    {
      id: "phoenix-ash", name: "Phoenix Ash", rarity: "Epic", price: 750000,
      blurb: "Reborn from embers every time it takes flight.",
      skin: { body: ["#ffd27a", "#a3151a"], snout: "#a3151a", horn: "#4a0c0c", wing: "#ff9d3d", glowRGB: "255, 120, 40", glowAlpha: 0.5, eyeIris: "#ffd27a" },
      flap: { type: "square", chime: [520, 780], duration: 0.09, gain: 0.13 },
    },
    {
      id: "celestial-wyrm", name: "Celestial Wyrm", rarity: "Legendary", price: 1000000,
      blurb: "The rarest dragon in Velora skies. Own the sky.",
      skin: { body: ["#ffffff", "#d9c27a"], snout: "#e8dcae", horn: "#f0c14b", wing: "#fff2c2", glowRGB: "255, 240, 190", glowAlpha: 0.55, eyeIris: "#c9a53a" },
      flap: { type: "sine", chime: [1100, 1500], duration: 0.1, gain: 0.15 },
    },
  ];
  const RARITY_COLORS = { Common: "#9ca3af", Uncommon: "#4ade80", Rare: "#60a5fa", Epic: "#c084fc", Legendary: "#f0c14b" };
  function findDragon(id) {
    return DRAGON_CATALOG.find((d) => d.id === id) || null;
  }

  // Fixed positions computed once, not re-randomized per frame, so the sky
  // decoration doesn't visibly "swim" between frames.
  const STAR_FIELD = Array.from({ length: 40 }, (_, i) => ({
    x: (i * 53.7) % WIDTH,
    y: 20 + ((i * 97.3) % (HEIGHT - GROUND_HEIGHT - 100)),
    r: 0.6 + ((i * 31) % 10) / 10 * 1.1,
    phase: i * 0.7,
  }));
  const EMBER_FIELD = Array.from({ length: 24 }, (_, i) => ({
    x: (i * 71.3) % WIDTH,
    phase: i * 0.9,
  }));

  function levelForScore(s) {
    return Math.floor(s / LEVEL_SCORE_STEP) + 1;
  }
  function themeForLevel(lvl) {
    return SKY_THEMES[(lvl - 1) % SKY_THEMES.length];
  }

  const scoreEl = document.getElementById("dragonScore");
  const bestEl = document.getElementById("dragonBest");
  const levelEl = document.getElementById("dragonLevel");
  const overlay = document.getElementById("dragonOverlay");
  const overlayTitle = document.getElementById("dragonOverlayTitle");
  const overlayBody = document.getElementById("dragonOverlayBody");
  const registerForm = document.getElementById("dragonRegisterForm");
  const nameInput = document.getElementById("dragonNameInput");
  const avatarInput = document.getElementById("dragonAvatarInput");
  const avatarLabel = document.getElementById("dragonAvatarLabel");
  const avatarLabelText = document.getElementById("dragonAvatarLabelText");
  const startHint = document.getElementById("dragonStartHint");
  const playingAsEl = document.getElementById("dragonPlayingAs");
  const coinBalanceEl = document.getElementById("dragonCoinBalance");
  const coinAmountEl = document.getElementById("dragonCoinAmount");
  const storeOpenBtn = document.getElementById("dragonStoreOpenBtn");
  const storeModal = document.getElementById("dragonStoreModal");
  const storeCloseBtn = document.getElementById("dragonStoreCloseBtn");
  const storeGrid = document.getElementById("dragonStoreGrid");
  const storeCoinAmountEl = document.getElementById("dragonStoreCoinAmount");
  const storeSubEl = document.getElementById("dragonStoreSub");

  // A registered player is remembered on this browser only (no login) — an
  // id + a per-row secret returned once at registration, used together so
  // nobody else can update a player they don't hold the key for.
  const PLAYER_ID_KEY = "veloraGamePlayerId";
  const PLAYER_EDIT_KEY = "veloraGamePlayerEditKey";
  const PLAYER_NAME_KEY = "veloraGamePlayerName";

  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  let playerEditKey = localStorage.getItem(PLAYER_EDIT_KEY);
  let playerName = localStorage.getItem(PLAYER_NAME_KEY);

  function updatePlayingAsIndicator() {
    if (!playingAsEl) return;
    playingAsEl.textContent = playerName
      ? `Playing as ${playerName}.`
      : "Beat your own score to join the leaderboard.";
  }
  updatePlayingAsIndicator();

  let best = 0; // shown in the HUD immediately; replaced with the real value below if registered
  if (bestEl) bestEl.textContent = best;

  async function loadOwnBest() {
    if (!playerId) return;
    const { data } = await veloraSupabase.from("game_players").select("best_score").eq("id", playerId).single();
    if (data) {
      best = data.best_score;
      if (bestEl) bestEl.textContent = best;
    }
  }

  // The player's wallet — coins and which dragons they own/fly, all stored
  // on their existing game_players row (same identity the leaderboard
  // uses). Unregistered players have nowhere to persist this, so the store
  // just asks them to join the leaderboard first.
  let walletCoins = 0;
  let ownedDragons = [];
  let equippedDragonId = null; // null = the free default dragon

  function updateCoinDisplays() {
    const text = walletCoins.toLocaleString();
    if (coinAmountEl) coinAmountEl.textContent = text;
    if (coinBalanceEl) coinBalanceEl.hidden = !playerId;
    if (storeCoinAmountEl) storeCoinAmountEl.textContent = text;
  }

  async function loadWallet() {
    if (!playerId) {
      updateCoinDisplays();
      return;
    }
    const { data } = await veloraSupabase
      .from("game_players")
      .select("coins, owned_dragons, equipped_dragon")
      .eq("id", playerId)
      .single();
    if (data) {
      walletCoins = data.coins || 0;
      ownedDragons = data.owned_dragons || [];
      equippedDragonId = data.equipped_dragon || null;
    }
    updateCoinDisplays();
  }

  // What the dragon actually looks/sounds like right now — the equipped
  // store dragon if the player has one, otherwise the level-based reskin
  // free players have always had, otherwise the plain default.
  function getActiveSkin() {
    if (equippedDragonId) {
      const dragon = findDragon(equippedDragonId);
      if (dragon) return dragon.skin;
    }
    return (currentTheme && currentTheme.dragon) || DEFAULT_DRAGON_SKIN;
  }

  function getActiveFlapProfile() {
    if (equippedDragonId) {
      const dragon = findDragon(equippedDragonId);
      if (dragon) return dragon.flap;
    }
    return DEFAULT_FLAP_PROFILE;
  }

  // Level events — one-time set pieces the first time a run reaches
  // certain levels. Every one opens the same way (pylons shake, then the
  // top half lifts into the ceiling and the bottom half sinks into the
  // ground, clearing the sky) so they read as one family of moments, then
  // branches into whatever that level's event actually is.
  const LEVEL_EVENTS = {
    5: { type: "coinRush", duration: 10 },
    10: { type: "jetChase", duration: 10 },
    15: { type: "coinRush", duration: 20 },
  };
  const EVENT_SHAKE_DURATION = 0.5;
  const EVENT_RETRACT_DURATION = 0.6;
  const COIN_RUSH_COIN_VALUE = 1; // a normal in-flight coin is worth COIN_VALUE (5)

  let state = "start"; // start | playing | gameover
  let dragonY, dragonVY, wingPhase, pylons, coins, distanceSinceSpawn, score, lastScoredIndex;
  let level, currentTheme, lastGapCenter;
  let flapPulse, trail, trailTimer;
  let levelEvent, jet, missiles, jetChaseRewardFlash;
  let lastTime = null;

  function resetGame() {
    dragonY = HEIGHT / 2;
    dragonVY = 0;
    wingPhase = 0;
    pylons = [];
    coins = [];
    distanceSinceSpawn = PYLON_SPACING; // spawn one immediately
    score = 0;
    lastScoredIndex = -1;
    level = 1;
    currentTheme = themeForLevel(level);
    lastGapCenter = HEIGHT / 2;
    flapPulse = 0;
    trail = [];
    trailTimer = 0;
    levelEvent = { triggeredLevels: new Set(), active: false, type: null, phase: "idle", timer: 0, duration: 0, timeLeft: 0 };
    jet = null;
    missiles = [];
    jetChaseRewardFlash = 0;
    if (scoreEl) scoreEl.textContent = "0";
    if (levelEl) levelEl.textContent = String(level);
  }

  // Levels get a little harder as the score climbs: the gap narrows and can
  // sit closer to the very top or bottom of the screen, so the extreme-height
  // obstacles that were easy early on actually demand precision later.
  function updateLevel() {
    const newLevel = levelForScore(score);
    if (newLevel === level) return;
    level = newLevel;
    currentTheme = themeForLevel(level);
    if (levelEl) levelEl.textContent = String(level);
    const config = LEVEL_EVENTS[level];
    if (config && !levelEvent.triggeredLevels.has(level)) startLevelEvent(level, config);
  }

  function startLevelEvent(lvl, config) {
    levelEvent.triggeredLevels.add(lvl);
    levelEvent.active = true;
    levelEvent.type = config.type;
    levelEvent.phase = "shake";
    levelEvent.timer = 0;
    levelEvent.duration = config.duration;
    if (config.type === "jetChase") {
      jet = { x: JET_X, y: dragonY, missileTimer: 0 };
      missiles = [];
      playJetChaseStartSound();
    } else {
      playCoinRushStartSound();
    }
  }

  // Scatters a band of coins ahead of the dragon — wider than one screen —
  // so as some scroll off the left edge, fresh ones are still arriving from
  // the right for the whole event.
  function spawnCoinRushField(duration) {
    const topBound = 50;
    const bottomBound = HEIGHT - GROUND_HEIGHT - 50;
    const spanStart = 60;
    const spanEnd = WIDTH + PYLON_SPEED * duration;
    const count = Math.round(duration * 4.6);
    for (let i = 0; i < count; i++) {
      const x = spanStart + (i / count) * (spanEnd - spanStart) + (Math.random() - 0.5) * 40;
      const y = topBound + Math.random() * (bottomBound - topBound);
      coins.push({ x, y, collected: false, value: COIN_RUSH_COIN_VALUE, isEventCoin: true });
    }
  }

  // The actual "impossible pylon" bug: each gap's vertical position used to
  // be picked completely independently of the one before it, so nothing
  // stopped two consecutive pylons from landing at opposite extremes (one
  // hugging the ceiling, the next hugging the ground) with only ~1.4s of
  // travel time between them — a swing no amount of skill can make. Gaps
  // now walk from the previous one within a bounded step, so every pair of
  // consecutive pylons is always physically reachable.
  const PYLON_MAX_GAP_DELTA = 240; // px a gap center may move from the previous one

  // A coin sits at the centre of each pylon's gap — collecting one rewards
  // flying the accurate line through the middle, and it can never overlap
  // the stonework since it's placed inside the open gap by construction.
  function spawnPylon() {
    const gap = Math.max(PYLON_GAP_MIN, PYLON_GAP - (level - 1) * PYLON_GAP_STEP);
    const margin = Math.max(PYLON_MARGIN_MIN, PYLON_MARGIN - (level - 1) * PYLON_MARGIN_STEP);
    const minCenter = margin + gap / 2;
    const maxCenter = HEIGHT - GROUND_HEIGHT - margin - gap / 2;
    const low = Math.max(minCenter, lastGapCenter - PYLON_MAX_GAP_DELTA);
    const high = Math.min(maxCenter, lastGapCenter + PYLON_MAX_GAP_DELTA);
    const gapCenter = low + Math.random() * (high - low);
    lastGapCenter = gapCenter;
    const pylonX = WIDTH + PYLON_WIDTH;
    pylons.push({ x: pylonX, gapCenter, gap, scored: false });
    coins.push({ x: pylonX + PYLON_WIDTH / 2, y: gapCenter, collected: false });
  }

  // Synthesized 8-bit-style effects (no audio files to download — an
  // AudioContext is created lazily on the first real user gesture, since
  // browsers block audio from starting on its own).
  let audioCtx = null;
  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTone(ctx, freq, startTime, duration, peakGain, type) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // Each store dragon has its own flap sound — either a pitch sweep or a
  // two-note chime — so buying one changes more than just how it looks.
  function playFlapSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const profile = getActiveFlapProfile();
      const t = ctx.currentTime;
      const duration = profile.duration || 0.09;
      const gain = profile.gain || 0.14;
      if (profile.chime) {
        playTone(ctx, profile.chime[0], t, duration, gain, profile.type);
        playTone(ctx, profile.chime[1], t + duration * 0.55, duration + 0.03, gain, profile.type);
        return;
      }
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = profile.type || "square";
      osc.frequency.setValueAtTime(profile.f0, t);
      osc.frequency.exponentialRampToValueAtTime(profile.f1, t + duration);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration + 0.01);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.01);
    } catch (err) {}
  }

  function playCoinSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      playTone(ctx, 988, t, 0.11, 0.16); // B5
      playTone(ctx, 1319, t + 0.07, 0.2, 0.16); // E6
    } catch (err) {}
  }

  // A lighter, quicker blip for Coin Rush pickups — the full two-note chime
  // gets noisy fast when a dozen coins are grabbed in a couple of seconds.
  function playEventCoinSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      playTone(ctx, 1500 + Math.random() * 300, ctx.currentTime, 0.06, 0.09, "sine");
    } catch (err) {}
  }

  // A short rising three-note fanfare when the pylons finish retracting and
  // the coin field appears.
  function playCoinRushStartSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      playTone(ctx, 660, t, 0.12, 0.15, "square");
      playTone(ctx, 880, t + 0.1, 0.12, 0.15, "square");
      playTone(ctx, 1320, t + 0.2, 0.22, 0.17, "square");
    } catch (err) {}
  }

  // A short descending alarm-style blare for the Jet Chase's arrival —
  // deliberately tenser than the coin rush's cheerful fanfare.
  function playJetChaseStartSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      playTone(ctx, 200, t, 0.16, 0.16, "sawtooth");
      playTone(ctx, 160, t + 0.18, 0.16, 0.16, "sawtooth");
      playTone(ctx, 120, t + 0.36, 0.22, 0.17, "sawtooth");
    } catch (err) {}
  }

  // A quick, punchy blip for a missile whizzing past unharmed.
  function playMissileDodgeSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch (err) {}
  }

  // A brief explosion burst for a missile impact (game over) or when the
  // jet itself peels off at the end of a successful dodge.
  function playExplosionSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    } catch (err) {}
  }

  // A bright ascending flourish when the Jet Chase reward lands.
  function playRewardSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      [660, 880, 1100, 1320].forEach((f, i) => playTone(ctx, f, t + i * 0.08, 0.16, 0.15, "square"));
    } catch (err) {}
  }

  // Spacebar is the only control needed to play — restarting after a crash
  // never waits on the registration form, so it's never a hard blocker.
  function flap() {
    if (state === "start") {
      state = "playing";
      hideOverlay();
      resetGame();
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "gameover") {
      state = "start";
      flap();
      return;
    }
    dragonVY = FLAP_VELOCITY;
    flapPulse = 1;
    playFlapSound();
  }

  const COIN_EARN_RATE = 10; // wallet coins per point of score, credited every registered run

  async function endGame() {
    state = "gameover";
    const beatOwnBest = score > best;
    if (beatOwnBest) {
      best = score;
      if (bestEl) bestEl.textContent = best;
    }

    if (playerId && playerEditKey) {
      const coinsEarned = score * COIN_EARN_RATE;
      let coinLine = "";
      if (coinsEarned > 0) {
        try {
          const { data: newBalance, error } = await veloraSupabase.rpc("credit_coins", {
            p_id: playerId,
            p_edit_key: playerEditKey,
            p_amount: coinsEarned,
          });
          if (!error && typeof newBalance === "number") {
            walletCoins = newBalance;
            updateCoinDisplays();
            coinLine = ` · +🪙 ${coinsEarned.toLocaleString()}`;
          }
        } catch (err) {
          // Coins failing to credit shouldn't block replaying.
        }
      }

      if (beatOwnBest) {
        showOverlay("gameover", "New Best!", `Score: <strong>${score}</strong> — that's a new personal best, ${escapeHtml(playerName || "")}!${coinLine}`);
        try {
          await veloraSupabase
            .from("game_players")
            .update({ best_score: score, updated_at: new Date().toISOString() })
            .eq("id", playerId)
            .eq("edit_key", playerEditKey);
          await loadLeaderboard();
        } catch (err) {
          // Leaderboard being unreachable shouldn't block replaying.
        }
      } else {
        showOverlay("gameover", "You Crashed!", `Score: <strong>${score}</strong> · Your best: <strong>${best}</strong>${coinLine}`);
      }
    } else {
      showOverlay("gameover", "You Crashed!", `Score: <strong>${score}</strong>. Join the leaderboard with this run?`);
    }
  }

  function showOverlay(mode, title, bodyHtml) {
    if (!overlay) return;
    overlay.hidden = false;
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayBody) overlayBody.innerHTML = bodyHtml;
    if (registerForm) registerForm.hidden = !(mode === "gameover" && !playerId);
    if (startHint) {
      startHint.hidden = false;
      startHint.textContent = mode === "start" ? "Tap or Space to Start" : "Tap or Space to Restart";
    }
  }

  function hideOverlay() {
    if (overlay) overlay.hidden = true;
  }

  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files?.[0];
    if (avatarLabelText) avatarLabelText.textContent = file ? `✓ ${file.name.slice(0, 16)}` : "+ Photo";
    if (avatarLabel) avatarLabel.classList.toggle("has-file", !!file);
  });

  // Disabling the submit button alone isn't enough — pressing Enter on a
  // mobile keyboard can fire several submit events back-to-back faster than
  // the disabled state visibly takes hold, which is exactly how duplicate
  // leaderboard entries got created during testing. This flag is checked
  // synchronously before anything async starts, so it can't race.
  let isRegistering = false;

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isRegistering) return;
    const name = (nameInput.value || "").trim().slice(0, 24);
    if (!name) return;
    isRegistering = true;
    const submitBtn = registerForm.querySelector("button[type='submit']");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Joining…"; }

    try {
      let avatarUrl = null;
      const file = avatarInput?.files?.[0];
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await veloraSupabase.storage.from("avatars").upload(path, file);
        if (!uploadError) {
          const { data: pub } = veloraSupabase.storage.from("avatars").getPublicUrl(path);
          avatarUrl = pub?.publicUrl || null;
        }
      }

      const { data, error } = await veloraSupabase
        .from("game_players")
        .insert({ display_name: name, avatar_url: avatarUrl, best_score: score })
        .select()
        .single();
      if (error || !data) throw error || new Error("No data returned");

      playerId = data.id;
      playerEditKey = data.edit_key;
      playerName = data.display_name;
      localStorage.setItem(PLAYER_ID_KEY, playerId);
      localStorage.setItem(PLAYER_EDIT_KEY, playerEditKey);
      localStorage.setItem(PLAYER_NAME_KEY, playerName);
      updatePlayingAsIndicator();
      walletCoins = data.coins || 0;
      ownedDragons = data.owned_dragons || [];
      equippedDragonId = data.equipped_dragon || null;
      updateCoinDisplays();

      registerForm.hidden = true;
      if (overlayBody) {
        overlayBody.innerHTML = `Score: <strong>${score}</strong> — you're on the board as ${escapeHtml(playerName)}!`;
      }
      await loadLeaderboard();
    } catch (err) {
      if (overlayBody) {
        overlayBody.innerHTML += ` <span style="color:#f87171;">Couldn't join the leaderboard — try again.</span>`;
      }
    }

    isRegistering = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Join Leaderboard"; }
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    if (!isGameFocused()) return;
    if (document.activeElement === nameInput) return;
    e.preventDefault();
    flap();
  });

  function isGameFocused() {
    const r = canvas.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }

  // Listens on the whole stage, not just the canvas — the start/game-over
  // overlay is a separate element sitting visually on top of the canvas, so
  // a real tap on it (as opposed to a script calling canvas.click() directly)
  // never actually reaches the canvas itself.
  //
  // pointerdown, not click: click only fires after the finger lifts back
  // off, which reads as input lag in a game where every millisecond of
  // fall time matters. pointerdown fires the instant a finger/mouse makes
  // contact. This used to be a real risk with a page-scroll gesture that
  // happens to start over the game, but the stage now has touch-action:
  // none (see style.css), so the browser never attempts to pan from a
  // touch that starts there — there's no gesture left to race against.
  // Taps inside the registration form are still excluded so typing a name
  // or picking a photo doesn't restart the game out from under you.
  const stage = document.querySelector(".dragon-game-stage");
  stage?.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#dragonRegisterForm, #dragonStoreOpenBtn")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    flap();
  });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // The jet hovers on the left, easing toward the dragon's altitude (with
  // its own drift on top) so it visually "chases," then fires missiles on
  // a fixed interval that fly a dead-straight line across the screen.
  function updateJetChase(dt) {
    jet.y += (dragonY - jet.y) * 1.1 * dt + Math.sin(performance.now() / 480) * 26 * dt;
    jet.y = Math.max(46, Math.min(HEIGHT - GROUND_HEIGHT - 46, jet.y));

    jet.missileTimer += dt;
    if (jet.missileTimer >= MISSILE_INTERVAL) {
      jet.missileTimer = 0;
      missiles.push({ x: jet.x + 22, y: jet.y, passed: false });
    }

    for (const m of missiles) {
      m.x += MISSILE_SPEED * dt;
      if (!m.passed && m.x > DRAGON_X + DRAGON_HIT_RADIUS) {
        m.passed = true;
        score += 2;
        if (scoreEl) scoreEl.textContent = String(score);
        playMissileDodgeSound();
      }
    }
    missiles = missiles.filter((m) => m.x < WIDTH + 30);
  }

  // Advances the shake -> retract -> active phases shared by every level
  // event, then hands off to whatever that event actually does once the
  // pylons are gone, and cleans up when its timer runs out.
  function updateLevelEvent(dt) {
    if (!levelEvent.active) return;
    levelEvent.timer += dt;
    if (levelEvent.phase === "shake" && levelEvent.timer >= EVENT_SHAKE_DURATION) {
      levelEvent.phase = "retract";
      levelEvent.timer = 0;
    } else if (levelEvent.phase === "retract" && levelEvent.timer >= EVENT_RETRACT_DURATION) {
      levelEvent.phase = "active";
      levelEvent.timer = 0;
      levelEvent.timeLeft = levelEvent.duration;
      pylons = [];
      if (levelEvent.type === "coinRush") spawnCoinRushField(levelEvent.duration);
    } else if (levelEvent.phase === "active") {
      levelEvent.timeLeft -= dt;
      if (levelEvent.type === "jetChase") updateJetChase(dt);
      if (levelEvent.timeLeft <= 0) finishLevelEvent();
    }
  }

  async function awardJetChaseBonus() {
    if (!playerId || !playerEditKey) return;
    try {
      const { data: newBalance, error } = await veloraSupabase.rpc("credit_coins", {
        p_id: playerId,
        p_edit_key: playerEditKey,
        p_amount: JET_CHASE_REWARD,
      });
      if (!error && typeof newBalance === "number") {
        walletCoins = newBalance;
        updateCoinDisplays();
        jetChaseRewardFlash = 2.5;
        playRewardSound();
      }
    } catch (err) {
      // A failed credit shouldn't block the run from continuing.
    }
  }

  function finishLevelEvent() {
    const wasJetChase = levelEvent.type === "jetChase";
    levelEvent.active = false;
    levelEvent.phase = "idle";
    distanceSinceSpawn = 0; // a clean breather before pylons resume
    jet = null;
    missiles = [];
    if (wasJetChase) {
      playExplosionSound(); // the jet peeling off in a burst, not a hit
      awardJetChaseBonus();
    }
  }

  function update(dt) {
    dragonVY = Math.min(dragonVY + GRAVITY * dt, MAX_FALL_SPEED);
    dragonY += dragonVY * dt;
    wingPhase += dt * 14;
    flapPulse = Math.max(0, flapPulse - dt * 5);
    jetChaseRewardFlash = Math.max(0, jetChaseRewardFlash - dt);
    updateLevelEvent(dt);
    if (state !== "playing") return; // a missile hit inside updateLevelEvent may have already ended the run

    // A short comet trail of sparks streaming off the tail — spawned at a
    // fixed rate and then swept backward with the rest of the world so it
    // reads as motion even though the dragon itself never moves in x.
    trailTimer += dt;
    if (trailTimer > 0.045) {
      trailTimer = 0;
      trail.push({ x: DRAGON_X - 36, y: dragonY + 10, life: 0.5, maxLife: 0.5 });
    }
    for (const p of trail) {
      p.x -= PYLON_SPEED * dt;
      p.life -= dt;
    }
    trail = trail.filter((p) => p.life > 0);

    if (!levelEvent.active) {
      distanceSinceSpawn += PYLON_SPEED * dt;
      if (distanceSinceSpawn >= PYLON_SPACING) {
        distanceSinceSpawn = 0;
        spawnPylon();
      }
    }

    for (const p of pylons) {
      p.x -= PYLON_SPEED * dt;
      if (!levelEvent.active && !p.scored && p.x + PYLON_WIDTH < DRAGON_X - DRAGON_HIT_RADIUS) {
        p.scored = true;
        score++;
        if (scoreEl) scoreEl.textContent = String(score);
        updateLevel();
      }
    }
    pylons = pylons.filter((p) => p.x > -PYLON_WIDTH);

    for (const c of coins) {
      c.x -= PYLON_SPEED * dt;
      if (!c.collected) {
        const dx = c.x - DRAGON_X;
        const dy = c.y - dragonY;
        if (Math.sqrt(dx * dx + dy * dy) < COIN_RADIUS + DRAGON_HIT_RADIUS) {
          c.collected = true;
          score += c.value || COIN_VALUE;
          if (scoreEl) scoreEl.textContent = String(score);
          if (c.isEventCoin) playEventCoinSound();
          else playCoinSound();
          updateLevel();
        }
      }
    }
    coins = coins.filter((c) => !c.collected && c.x > -COIN_RADIUS);

    if (dragonY - DRAGON_HIT_RADIUS < 0) {
      dragonY = DRAGON_HIT_RADIUS;
      dragonVY = 0;
    }
    if (dragonY + DRAGON_HIT_RADIUS > HEIGHT - GROUND_HEIGHT) {
      dragonY = HEIGHT - GROUND_HEIGHT - DRAGON_HIT_RADIUS;
      endGame();
      return;
    }

    // No pylon collision during a level event — the pylons are visibly
    // retracting or already gone, so a hit here would feel like a bug, not
    // a fair loss.
    if (!levelEvent.active) {
      for (const p of pylons) {
        const withinX = DRAGON_X + DRAGON_HIT_RADIUS > p.x && DRAGON_X - DRAGON_HIT_RADIUS < p.x + PYLON_WIDTH;
        if (!withinX) continue;
        const gapTop = p.gapCenter - p.gap / 2;
        const gapBottom = p.gapCenter + p.gap / 2;
        if (dragonY - DRAGON_HIT_RADIUS < gapTop || dragonY + DRAGON_HIT_RADIUS > gapBottom) {
          endGame();
          return;
        }
      }
    } else if (levelEvent.type === "jetChase" && levelEvent.phase === "active") {
      for (const m of missiles) {
        const dx = m.x - DRAGON_X;
        const dy = m.y - dragonY;
        if (Math.sqrt(dx * dx + dy * dy) < MISSILE_RADIUS + DRAGON_HIT_RADIUS) {
          playExplosionSound();
          endGame();
          return;
        }
      }
    }
  }

  function drawDecoration(theme) {
    const now = performance.now();
    if (theme.decoration === "stars") {
      ctx.save();
      for (const s of STAR_FIELD) {
        const twinkle = 0.5 + 0.5 * Math.sin(now / 500 + s.phase);
        ctx.globalAlpha = 0.3 + twinkle * 0.7;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (theme.decoration === "embers") {
      ctx.save();
      const topY = HEIGHT - GROUND_HEIGHT;
      for (const e of EMBER_FIELD) {
        const rise = (now / 1000 * 22 + e.phase * 30) % topY;
        const y = topY - rise;
        const flicker = 0.4 + 0.6 * Math.sin(now / 300 + e.phase);
        ctx.globalAlpha = flicker;
        ctx.fillStyle = "#ff8a3d";
        ctx.beginPath();
        ctx.arc(e.x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Gradients that never change frame to frame, built once instead of on
  // every draw call — canvas gradients aren't free, and this runs at up to
  // 60fps, so recreating a dozen of them every frame is real, avoidable
  // work on weaker mobile GPUs.
  const GROUND_GRADIENT = ctx.createLinearGradient(0, HEIGHT - GROUND_HEIGHT, 0, HEIGHT);
  GROUND_GRADIENT.addColorStop(0, "#6b3f38");
  GROUND_GRADIENT.addColorStop(1, "#3a2320");

  const PYLON_STONE_GRADIENT = ctx.createLinearGradient(0, 0, PYLON_WIDTH, 0);
  PYLON_STONE_GRADIENT.addColorStop(0, "#6b6459");
  PYLON_STONE_GRADIENT.addColorStop(0.5, "#8c8375");
  PYLON_STONE_GRADIENT.addColorStop(1, "#6b6459");

  // Sky/orb-glow gradients only depend on which theme is active (there are
  // only 5), not on any per-frame state, so build each one once and reuse.
  const skyGradientCache = new Map();
  function getThemeGradients(theme) {
    let cached = skyGradientCache.get(theme);
    if (cached) return cached;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    theme.sky.forEach((color, i) => sky.addColorStop(theme.skyStops[i], color));
    const sunY = HEIGHT * 0.42;
    const sunGlow = ctx.createRadialGradient(WIDTH * 0.7, sunY, 4, WIDTH * 0.7, sunY, 90);
    sunGlow.addColorStop(0, `rgba(${theme.orbGlowRGB}, 0.9)`);
    sunGlow.addColorStop(1, `rgba(${theme.orbGlowRGB}, 0)`);
    cached = { sky, sunGlow, sunY };
    skyGradientCache.set(theme, cached);
    return cached;
  }

  function drawBackground() {
    const theme = currentTheme || SKY_THEMES[0];
    const { sky, sunGlow, sunY } = getThemeGradients(theme);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Sun / moon.
    ctx.fillStyle = sunGlow;
    ctx.fillRect(WIDTH * 0.7 - 90, sunY - 90, 180, 180);
    ctx.fillStyle = theme.orbColor;
    ctx.beginPath();
    ctx.arc(WIDTH * 0.7, sunY, 34, 0, Math.PI * 2);
    ctx.fill();

    drawDecoration(theme);

    // Distant castle silhouette.
    ctx.fillStyle = "rgba(58, 30, 46, 0.55)";
    ctx.fillRect(0, HEIGHT - GROUND_HEIGHT - 80, WIDTH, 80);
    for (let x = 10; x < WIDTH; x += 52) {
      ctx.fillRect(x, HEIGHT - GROUND_HEIGHT - 104, 12, 24);
    }

    // Ground.
    ctx.fillStyle = GROUND_GRADIENT;
    ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, GROUND_HEIGHT);
    ctx.fillStyle = "rgba(255, 200, 132, 0.4)";
    ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, 3);
  }

  function drawPylon(p) {
    let gapTop = p.gapCenter - p.gap / 2;
    let gapBottom = p.gapCenter + p.gap / 2;
    let jitterX = 0;

    // Every level event opens the same way: pylons shake in place (a
    // ramping jitter, per-pylon offset via its x position so they don't
    // all judder in lockstep), then the top tower retreats up into the
    // ceiling and the bottom sinks into the ground on an ease-out curve,
    // opening the whole gap over ~0.6s.
    if (levelEvent.active) {
      if (levelEvent.phase === "shake") {
        const intensity = Math.min(1, levelEvent.timer / 0.15);
        jitterX = Math.sin(performance.now() / 35 + p.x * 0.3) * 4 * intensity;
      } else if (levelEvent.phase === "retract" || levelEvent.phase === "active") {
        const t = levelEvent.phase === "active" ? 1 : Math.min(1, levelEvent.timer / EVENT_RETRACT_DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        gapTop = gapTop * (1 - eased);
        gapBottom = gapBottom + (HEIGHT - GROUND_HEIGHT - gapBottom) * eased;
      }
    }

    // Drawn in local (0..PYLON_WIDTH) space via translate so every pylon —
    // and every frame — can share the same cached gradient instead of each
    // building its own.
    ctx.save();
    ctx.translate(p.x + jitterX, 0);

    // Top tower.
    ctx.fillStyle = PYLON_STONE_GRADIENT;
    ctx.fillRect(0, 0, PYLON_WIDTH, gapTop);
    drawCrenellations(0, gapTop, PYLON_WIDTH, true);

    // Bottom tower.
    ctx.fillRect(0, gapBottom, PYLON_WIDTH, HEIGHT - GROUND_HEIGHT - gapBottom);
    drawCrenellations(0, gapBottom - 12, PYLON_WIDTH, false);

    // Mortar lines for a stone-block feel.
    ctx.strokeStyle = "rgba(40, 30, 25, 0.35)";
    ctx.lineWidth = 1;
    for (let y = 16; y < gapTop; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PYLON_WIDTH, y);
      ctx.stroke();
    }
    for (let y = gapBottom + 16; y < HEIGHT - GROUND_HEIGHT; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PYLON_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrenellations(x, y, width, pointingDown) {
    const teeth = 4;
    const toothWidth = width / (teeth * 2 - 1);
    ctx.fillStyle = "#8c8375";
    for (let i = 0; i < teeth; i++) {
      const tx = x + i * toothWidth * 2;
      if (pointingDown) {
        ctx.fillRect(tx, y - 10, toothWidth, 10);
      } else {
        ctx.fillRect(tx, y, toothWidth, 10);
      }
    }
  }

  // Fixed feather lengths/spreads/widths — shared between the draw call and
  // the gradient cache below so the two stay in sync.
  const FEATHERS = [
    { len: 38, spreadAngle: -0.62, width: 7 },
    { len: 33, spreadAngle: -0.34, width: 8 },
    { len: 27, spreadAngle: -0.06, width: 8 },
    { len: 20, spreadAngle: 0.2, width: 7 },
  ];

  // One tapered feather, drawn in the wing's local (already hinge-rotated)
  // space: a thin leaf shape fanned out at `spreadAngle` from the hinge.
  function drawFeather(grad, spreadAngle, width, len, outline) {
    ctx.save();
    ctx.rotate(spreadAngle);
    ctx.fillStyle = grad;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-len * 0.4, -width, -len, -width * 0.15);
    ctx.quadraticCurveTo(-len * 0.55, width * 0.3, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // A comet trail of sparks streaming off the tail, so the dragon reads as
  // moving forward even though it never actually changes x position.
  function drawTrail(skin) {
    if (trail.length < 2) return;
    ctx.save();
    ctx.strokeStyle = skin.wing;
    ctx.lineCap = "round";
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      const t = Math.max(a.life, b.life) / a.maxLife;
      ctx.globalAlpha = t * 0.45;
      ctx.lineWidth = 2.5 * t + 0.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = skin.wing;
    for (const p of trail) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 * t + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // All of a skin's gradients are fully static — same local coordinates and
  // colors every frame — so build them once per skin and cache them on the
  // skin object itself instead of rebuilding ~9 gradients every frame.
  function getDragonGradients(skin) {
    if (skin._grad) return skin._grad;
    const tailGrad = ctx.createLinearGradient(-40, 0, -2, 0);
    tailGrad.addColorStop(0, skin.body[1]);
    tailGrad.addColorStop(1, skin.body[0]);

    const wingGrad = ctx.createLinearGradient(0, 0, -37, -30);
    wingGrad.addColorStop(0, skin.wing);
    wingGrad.addColorStop(1, skin.body[1]);

    const featherGrads = FEATHERS.map((f) => {
      const g = ctx.createLinearGradient(0, 0, -f.len, 0);
      g.addColorStop(0, skin.wing);
      g.addColorStop(1, skin.body[1]);
      return g;
    });

    const bodyGrad = ctx.createRadialGradient(-4, -5, 2, 0, 0, DRAGON_RADIUS);
    bodyGrad.addColorStop(0, skin.body[0]);
    bodyGrad.addColorStop(1, skin.body[1]);

    const gloss = ctx.createRadialGradient(-7, -8, 0, -7, -8, 11);
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    gloss.addColorStop(1, "rgba(255, 255, 255, 0)");

    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, DRAGON_HIT_RADIUS * 1.7);
    glow.addColorStop(0, `rgba(${skin.glowRGB}, ${skin.glowAlpha * 0.7})`);
    glow.addColorStop(1, `rgba(${skin.glowRGB}, 0)`);

    skin._grad = { tailGrad, wingGrad, featherGrads, bodyGrad, gloss, glow };
    return skin._grad;
  }

  // A Japanese-style dragon: a long, sinuous serpent with a feathered,
  // fan-edged wing, twin antler-like horns, and a trailing whisker. Still
  // pure vector shapes on the same small canvas budget as before — no
  // images, so it stays light — and the hitbox is still just the head
  // circle (DRAGON_RADIUS), unchanged from before.
  function drawDragon() {
    const skin = getActiveSkin();
    const g = getDragonGradients(skin);
    const now = performance.now();
    const outline = "rgba(20, 15, 10, 0.35)";
    const pulse = 1 + flapPulse * 0.16; // a quick "pop" right on each flap

    ctx.save();
    ctx.translate(DRAGON_X, dragonY);
    const tilt = Math.max(-0.35, Math.min(0.8, dragonVY / 650));
    ctx.rotate(tilt);

    // Ambient glow drawn first, behind everything — drawing it last (as
    // before) additively brightened the whole dragon and washed the
    // linework out into a fuzzy blob. Drawn before the scale below since
    // its cached radius already accounts for DRAGON_SCALE.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g.glow;
    ctx.beginPath();
    ctx.arc(0, 0, DRAGON_HIT_RADIUS * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.scale(DRAGON_SCALE, DRAGON_SCALE); // shrinks the whole dragon uniformly

    // Serpentine tail — three tapering segments trailing the head, swaying
    // gently so the body reads as sinuous rather than a round blob.
    const sway = Math.sin(wingPhase) * 3.5;
    ctx.fillStyle = g.tailGrad;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-14, 5 + sway * 0.35, 12, 7.5, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-27, 9 + sway * 0.75, 8.5, 5.5, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-37, 12 + sway, 5, 3.2, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wing — swings from raised (flap up, just after a jump) to trailing
    // low, same contract as a classic dragon wing, but with a scalloped
    // fan-like trailing edge for an oriental feel instead of a bat membrane.
    const wingSwing = Math.sin(wingPhase) * 0.5 + 0.5; // 0..1
    const wingAngle = -1.15 + wingSwing * 1.35; // radians
    ctx.save();
    ctx.translate(-7, -6);
    ctx.rotate(wingAngle);
    ctx.fillStyle = g.wingGrad;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.quadraticCurveTo(-7, -16, -22, -29);
    ctx.quadraticCurveTo(-31, -36, -40, -33);
    ctx.quadraticCurveTo(-29, -27, -27, -18);
    ctx.quadraticCurveTo(-20, -16, -18, -7);
    ctx.quadraticCurveTo(-11, -5, -9, 5);
    ctx.quadraticCurveTo(-4, 7, 0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Individual feathers layered over the membrane for texture, fanned
    // out from the same hinge.
    FEATHERS.forEach((f, i) => drawFeather(g.featherGrads[i], f.spreadAngle, f.width, f.len, outline));
    ctx.restore();

    // Head.
    const headRX = DRAGON_RADIUS * pulse;
    const headRY = DRAGON_RADIUS * 0.82 * pulse;
    ctx.fillStyle = g.bodyGrad;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, headRX, headRY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glossy specular highlight, for a polished rather than flat-shaded look.
    ctx.fillStyle = g.gloss;
    ctx.beginPath();
    ctx.ellipse(-7, -8, 11, 7.5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Rim light along the upper-left edge, catching the theme's sun/moon.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, headRX, headRY, 0, Math.PI * 1.08, Math.PI * 1.72);
    ctx.stroke();

    // Elongated, tapered snout.
    ctx.fillStyle = skin.snout;
    ctx.beginPath();
    ctx.moveTo(DRAGON_RADIUS - 6, -4);
    ctx.quadraticCurveTo(DRAGON_RADIUS + 9, -3, DRAGON_RADIUS + 16, 0);
    ctx.quadraticCurveTo(DRAGON_RADIUS + 9, 3, DRAGON_RADIUS - 6, 6);
    ctx.closePath();
    ctx.fill();

    // Whisker trailing from the jaw.
    const whiskerDrift = Math.sin(now / 220) * 3;
    ctx.strokeStyle = skin.horn;
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(DRAGON_RADIUS + 5, 4);
    ctx.quadraticCurveTo(DRAGON_RADIUS + 13, 8 + whiskerDrift, DRAGON_RADIUS + 21, 6 + whiskerDrift);
    ctx.stroke();

    // Twin forked horns.
    ctx.fillStyle = skin.horn;
    ctx.beginPath();
    ctx.moveTo(-3, -DRAGON_RADIUS + 4);
    ctx.lineTo(-1, -DRAGON_RADIUS - 10);
    ctx.lineTo(2, -DRAGON_RADIUS - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -DRAGON_RADIUS + 3);
    ctx.lineTo(8, -DRAGON_RADIUS - 8);
    ctx.lineTo(9, -DRAGON_RADIUS + 3);
    ctx.closePath();
    ctx.fill();

    // Eye.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(7, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.eyeIris;
    ctx.beginPath();
    ctx.arc(8.5, -5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Coin Rush pickups look exactly like a normal in-flight coin — only
  // their value differs (1 instead of 5) — so the visual stays consistent
  // and the only new thing to learn during the event is "there are a lot
  // of these now."
  function drawCoin(c) {
    // A cheap "spinning" look: squash the ellipse's width with a sine wave.
    const spin = Math.abs(Math.sin(performance.now() / 260 + c.x * 0.04));
    const radius = COIN_RADIUS;
    const rx = radius * (0.25 + spin * 0.75);
    ctx.save();
    ctx.translate(c.x, c.y);

    // A dark ring plus a drop shadow so the coin reads against the sunset
    // sky even where the gold fill is close in hue to the background.
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#3a2010";
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 2.5, radius + 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    const coinGrad = ctx.createRadialGradient(-rx * 0.3, -radius * 0.3, 1, 0, 0, radius);
    coinGrad.addColorStop(0, "#fffbe6");
    coinGrad.addColorStop(0.55, "#ffd54f");
    coinGrad.addColorStop(1, "#e8a317");
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, radius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glint highlight so it still pops even fully squashed edge-on.
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.ellipse(-rx * 0.35, -radius * 0.4, Math.max(1.5, rx * 0.25), radius * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const HEADING_FONT = '"Space Grotesk", sans-serif';
  const EVENT_TITLES = { coinRush: "COIN RUSH!", jetChase: "INCOMING!" };
  const EVENT_TITLE_COLORS = { coinRush: "#f0c14b", jetChase: "#ff4d4d" };

  const JET_BODY_GRADIENT = ctx.createLinearGradient(-26, 0, 28, 0);
  JET_BODY_GRADIENT.addColorStop(0, "#4a4f57");
  JET_BODY_GRADIENT.addColorStop(0.5, "#8a8f99");
  JET_BODY_GRADIENT.addColorStop(1, "#2b2f36");

  // A quick handheld-camera jolt while the pylons shake — makes the buildup
  // read as an "event," not just an obstacle quietly fading out.
  function getScreenShakeOffset() {
    if (!levelEvent.active || levelEvent.phase !== "shake") return null;
    const intensity = Math.min(1, levelEvent.timer / 0.15);
    const now = performance.now();
    return { x: Math.sin(now / 28) * 5 * intensity, y: Math.cos(now / 33) * 4 * intensity };
  }

  function drawJet() {
    if (!jet) return;
    const growIn = Math.min(1, levelEvent.timer / 0.3);
    ctx.save();
    ctx.translate(jet.x, jet.y);
    ctx.scale(growIn, growIn);
    const tilt = Math.max(-0.2, Math.min(0.2, (dragonY - jet.y) * 0.002));
    ctx.rotate(tilt);

    // Engine flame, drawn first so the body overlaps its base.
    const flicker = 0.7 + Math.random() * 0.3;
    ctx.fillStyle = `rgba(255, 150, 40, ${flicker})`;
    ctx.beginPath();
    ctx.moveTo(-26, -5);
    ctx.lineTo(-26 - 14 * flicker, 0);
    ctx.lineTo(-26, 5);
    ctx.closePath();
    ctx.fill();

    // Fuselage, facing right toward the dragon.
    ctx.fillStyle = JET_BODY_GRADIENT;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-26, -5);
    ctx.lineTo(-26, 5);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();

    // Swept wings.
    ctx.fillStyle = "#3a3f47";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-14, -26);
    ctx.lineTo(-4, -8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-14, 26);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.fill();

    // Cockpit canopy + a red accent stripe.
    ctx.fillStyle = "#c81d1d";
    ctx.fillRect(-6, -3, 14, 6);
    ctx.fillStyle = "rgba(120, 220, 255, 0.85)";
    ctx.beginPath();
    ctx.ellipse(14, 0, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMissile(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = "rgba(255, 140, 60, 0.6)";
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-22, 0);
    ctx.lineTo(-10, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#4a4f57";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c81d1d";
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(4, -3);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawLevelEventBanner() {
    if (levelEvent.active) {
      ctx.save();
      if (levelEvent.phase === "shake" || levelEvent.phase === "retract") {
        const elapsed = levelEvent.phase === "shake" ? levelEvent.timer : EVENT_SHAKE_DURATION + levelEvent.timer;
        const total = EVENT_SHAKE_DURATION + EVENT_RETRACT_DURATION;
        const p = Math.min(1, elapsed / total);
        const scale = 0.7 + Math.min(1, p * 3) * 0.3; // pops in fast, then holds
        const alpha = p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.15);
        ctx.translate(WIDTH / 2, HEIGHT * 0.3);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.textAlign = "center";
        ctx.font = `900 36px ${HEADING_FONT}`;
        const title = EVENT_TITLES[levelEvent.type] || "EVENT!";
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillText(title, 3, 3);
        ctx.fillStyle = EVENT_TITLE_COLORS[levelEvent.type] || "#f0c14b";
        ctx.fillText(title, 0, 0);
      } else if (levelEvent.phase === "active") {
        const secs = Math.max(0, Math.ceil(levelEvent.timeLeft));
        const label = levelEvent.type === "jetChase" ? `🚀 Dodge! — ${secs}s` : `🪙 Coin Rush — ${secs}s`;
        ctx.fillStyle = "rgba(10, 6, 20, 0.55)";
        ctx.fillRect(WIDTH / 2 - 110, 46, 220, 34);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = `700 19px ${HEADING_FONT}`;
        ctx.fillText(label, WIDTH / 2, 69);
      }
      ctx.restore();
    }

    if (jetChaseRewardFlash > 0) {
      const alpha = Math.min(1, jetChaseRewardFlash / 0.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.font = `900 28px ${HEADING_FONT}`;
      ctx.translate(WIDTH / 2, HEIGHT * 0.3);
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillText("🪙 +5,000 Coins!", 3, 3);
      ctx.fillStyle = "#f0c14b";
      ctx.fillText("🪙 +5,000 Coins!", 0, 0);
      ctx.restore();
    }
  }

  function render() {
    const shake = getScreenShakeOffset();
    ctx.save();
    if (shake) ctx.translate(shake.x, shake.y);
    drawBackground();
    drawTrail(getActiveSkin());
    for (const c of coins) drawCoin(c);
    for (const p of pylons) drawPylon(p);
    if (levelEvent.type === "jetChase" && levelEvent.phase === "active") {
      for (const m of missiles) drawMissile(m);
      drawJet();
    }
    drawDragon();
    ctx.restore();
    drawLevelEventBanner();
  }

  function loop(t) {
    if (state !== "playing") return;
    if (lastTime === null) lastTime = t;
    const dt = Math.min((t - lastTime) / 1000, 0.032);
    lastTime = t;
    update(dt);
    render();
    if (state === "playing") requestAnimationFrame(loop);
  }

  async function loadLeaderboard() {
    const listEl = document.getElementById("dragonLeaderboardList");
    if (!listEl) return;

    const { data, error } = await veloraSupabase
      .from("game_players")
      .select("id, display_name, avatar_url, best_score")
      .order("best_score", { ascending: false })
      .limit(10);

    if (error || !data || !data.length) {
      listEl.innerHTML = `<p class="dev-empty">No players yet — be the first to join.</p>`;
      return;
    }

    listEl.innerHTML = data
      .map((row, i) => {
        const avatarHtml = row.avatar_url
          ? `<img class="leaderboard-avatar" src="${escapeHtml(row.avatar_url)}" alt="" loading="lazy" />`
          : `<span class="leaderboard-avatar-placeholder">${escapeHtml((row.display_name || "?").charAt(0).toUpperCase())}</span>`;
        return `
      <div class="leaderboard-row">
        <span class="leaderboard-rank">#${i + 1}</span>
        ${avatarHtml}
        <span class="leaderboard-name">${escapeHtml(row.display_name)}</span>
        <span class="leaderboard-meta">
          <span class="leaderboard-level">Lv ${levelForScore(row.best_score)}</span>
          <span class="leaderboard-score">${row.best_score}</span>
        </span>
      </div>`;
      })
      .join("");
  }

  function renderStore() {
    if (!storeGrid) return;
    if (storeSubEl) {
      storeSubEl.textContent = playerId
        ? "Spend coins you've earned from play on a new dragon."
        : "Join the leaderboard to start earning coins and collecting dragons.";
    }
    storeGrid.innerHTML = DRAGON_CATALOG.map((d) => {
      const owned = ownedDragons.includes(d.id);
      const equipped = equippedDragonId === d.id;
      const canAfford = walletCoins >= d.price;
      let btnHtml;
      if (equipped) {
        btnHtml = `<button type="button" class="dragon-card-btn is-equipped" disabled>Equipped</button>`;
      } else if (owned) {
        btnHtml = `<button type="button" class="dragon-card-btn is-equip" data-action="equip" data-id="${d.id}">Equip</button>`;
      } else {
        const label = playerId ? `Buy · 🪙 ${d.price.toLocaleString()}` : "Join to buy";
        btnHtml = `<button type="button" class="dragon-card-btn is-buy" data-action="buy" data-id="${d.id}" ${playerId && canAfford ? "" : "disabled"}>${label}</button>`;
      }
      return `
      <div class="dragon-card${equipped ? " is-equipped" : ""}">
        <div class="dragon-card-swatch" style="background: radial-gradient(circle at 35% 30%, ${d.skin.body[0]}, ${d.skin.body[1]});"></div>
        <span class="dragon-card-name">${escapeHtml(d.name)}</span>
        <span class="dragon-card-rarity" style="color: ${RARITY_COLORS[d.rarity]}">${d.rarity}</span>
        <span class="dragon-card-blurb">${escapeHtml(d.blurb)}</span>
        <span class="dragon-card-price">${owned ? "Owned" : "🪙 " + d.price.toLocaleString()}</span>
        ${btnHtml}
      </div>`;
    }).join("");
  }

  function openStore() {
    if (!storeModal) return;
    renderStore();
    storeModal.hidden = false;
  }
  function closeStore() {
    if (storeModal) storeModal.hidden = true;
  }
  storeOpenBtn?.addEventListener("click", openStore);
  storeCloseBtn?.addEventListener("click", closeStore);
  storeModal?.addEventListener("click", (e) => {
    if (e.target === storeModal) closeStore();
  });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && storeModal && !storeModal.hidden) closeStore();
  });

  // Equip writes are a simple, low-risk overwrite (the store is only open
  // between runs, never mid-flight). Purchases are guarded against a stale
  // local balance by re-checking price against walletCoins right before
  // writing, same value the button's disabled state was computed from.
  let isPurchasing = false;
  storeGrid?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || btn.disabled) return;
    const dragon = findDragon(btn.dataset.id);
    if (!dragon || !playerId || !playerEditKey) return;

    if (btn.dataset.action === "equip") {
      const previous = equippedDragonId;
      equippedDragonId = dragon.id;
      renderStore();
      try {
        const { error } = await veloraSupabase
          .from("game_players")
          .update({ equipped_dragon: dragon.id })
          .eq("id", playerId)
          .eq("edit_key", playerEditKey);
        if (error) throw error;
      } catch (err) {
        equippedDragonId = previous;
        renderStore();
      }
      return;
    }

    if (btn.dataset.action === "buy") {
      if (isPurchasing || walletCoins < dragon.price) return;
      isPurchasing = true;
      btn.disabled = true;
      btn.textContent = "Buying…";
      try {
        const nextOwned = [...ownedDragons, dragon.id];
        const nextCoins = walletCoins - dragon.price;
        const { error } = await veloraSupabase
          .from("game_players")
          .update({ coins: nextCoins, owned_dragons: nextOwned, equipped_dragon: dragon.id })
          .eq("id", playerId)
          .eq("edit_key", playerEditKey);
        if (error) throw error;
        walletCoins = nextCoins;
        ownedDragons = nextOwned;
        equippedDragonId = dragon.id;
        updateCoinDisplays();
      } catch (err) {
        // Leave state as-is — the re-render below reflects reality either way.
      }
      isPurchasing = false;
      renderStore();
    }
  });

  resetGame();
  render();
  showOverlay("start", "Flappy Dragon", "Keep the dragon airborne through the castle pylons.");
  loadOwnBest();
  loadWallet();
  loadLeaderboard();
})();
