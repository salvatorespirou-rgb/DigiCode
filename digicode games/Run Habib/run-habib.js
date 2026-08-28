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
  const EMBER_LAUNCH_SPEED = 780;

  // Swim physics, converted from the original 8-bit water levels' constants
  // to this game's 40px tiles / per-second units. Three properties carry
  // the whole feel: the stroke SETS vertical speed rather than adding to it
  // (so a stroke always fully arrests a sink, no matter how fast you were
  // dropping), sinking is roughly a tenth of land gravity, and there's no
  // horizontal drag at all while off the seabed.
  const SWIM_STROKE = -225;        // impulse, assigned not added
  const SWIM_SINK_ACCEL = 352;
  const SWIM_RISE_DECEL_HELD = 457; // holding the button after a stroke cuts the rise shorter
  const SWIM_MAX_SINK = 600;
  const SWIM_MAX_SPEED = 225;      // swimming
  const SWIM_WALK_SPEED = 150;     // walking along the seabed
  const SWIM_ACCEL = 334;
  const SWIM_TURN_ACCEL = 668;     // turning around bites harder, same as the original
  const SWIM_CEILING_Y = 44;       // keeps Habib from swimming up out of the sea
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER = 0.1;
  const MAX_JUMPS = 2;
  // Small Habib is now genuinely smaller than before; Big Habib (post-
  // mushroom) is exactly the size he used to default to, so the growth
  // actually reads as a transformation instead of a modest bump.
  const PLAYER_W = 22;
  const PLAYER_H = 32;
  const PLAYER_W_BIG = 30;
  const PLAYER_H_BIG = 44;
  // The 0.076 sprite scale below was tuned against the old default
  // (44px-tall hitbox) — keep that fixed reference independent of
  // whatever PLAYER_H/PLAYER_H_BIG happen to be, so drawPlayer() can
  // derive a correct size multiplier for either tier.
  const SPRITE_REF_H = 44;

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
  let STAGE_THEME, HAS_LAVA, EMBERS, MOVERS;
  // Stage 4's underwater half. WATER_END_COL is where the sea stops and the
  // dry coda (staircase → flag → hut) begins; EXIT_PIPE is the sideways
  // pipe set into the wall between them, which is the only way across.
  let HAS_WATER, WATER_END_COL, CORALS, FISH, EXIT_PIPE;

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

  // Stage 3 — a lava castle interior. Its own hazard identity instead of
  // Stage 1/2's urns and pipes: molten pits crossed either by a direct
  // jump or by riding a slab platform that ping-pongs back and forth, plus
  // embers that leap out of the lava on a timer. No boss at the end yet
  // (monsterCol stays null, same as Stage 1 and 2).
  function stage3() {
    return {
      name: "Stage 3",
      theme: "castle",
      hasLava: true,
      levelCols: 134,
      pits: [[21, 25], [44, 46], [64, 70], [88, 93]],
      platforms: [
        { col: 9, row: 7, len: 3 },
        { col: 29, row: 6, len: 3 },
        { col: 36, row: 7, len: 3 },
        { col: 50, row: 7, len: 4 },
        { col: 58, row: 5, len: 2 },
        { col: 74, row: 7, len: 3 },
        { col: 80, row: 6, len: 3 },
        { col: 97, row: 7, len: 3 },
        { col: 105, row: 5, len: 2 },
      ],
      blocks: [
        { col: 5, row: 7, type: "coin" },
        { col: 6, row: 7, type: "coin" },
        { col: 7, row: 7, type: "brick" },
        { col: 10, row: 7, type: "star" },
        { col: 30, row: 6, type: "coin" },
        { col: 31, row: 6, type: "coin" },
        { col: 37, row: 7, type: "brick" },
        { col: 38, row: 7, type: "coin" },
        { col: 51, row: 7, type: "coin" },
        { col: 52, row: 7, type: "coin" },
        { col: 53, row: 7, type: "star" },
        { col: 59, row: 5, type: "coin" },
        { col: 75, row: 7, type: "coin" },
        { col: 76, row: 7, type: "brick" },
        { col: 81, row: 6, type: "coin" },
        { col: 82, row: 6, type: "coin" },
        { col: 98, row: 7, type: "coin" },
        { col: 99, row: 7, type: "coin" },
        { col: 106, row: 5, type: "star" },
      ],
      coins: [
        { col: 13, row: 8 }, { col: 14, row: 8 }, { col: 15, row: 8 },
        { col: 33, row: 5 }, { col: 34, row: 5 },
        { col: 55, row: 8 }, { col: 56, row: 8 },
        { col: 84, row: 8 }, { col: 85, row: 8 },
        { col: 101, row: 8 }, { col: 102, row: 8 }, { col: 103, row: 8 },
      ],
      urns: [],
      // Only a couple of ground enemies (buzzy-beetle-style, fireproof
      // grubs) — the lava/embers/platforms carry most of this stage's
      // challenge, same way a castle level leans on hazards over patrols.
      enemies: [
        { col: 12, row: 9, min: 10, max: 18, variant: "beetle" },
        { col: 78, row: 9, min: 76, max: 86, variant: "beetle" },
      ],
      pipes: [],
      // Embers rest in a pit and leap straight up on a timer (see the
      // launch/arc physics in update()) — one at each of the trickier
      // crossings, positioned at the ledge you wait on rather than mid-air
      // over the platform's own path.
      embers: [
        { col: 21, row: GROUND_ROW },
        { col: 45, row: GROUND_ROW },
        { col: 89, row: GROUND_ROW },
      ],
      // Slab platforms ping-ponging over the three widest gaps — sine-eased
      // so they linger at each end, which is what makes "time it before you
      // jump" actually mean something instead of a constant linear sweep.
      movers: [
        { col: 22, row: GROUND_ROW - 0.4, len: 2, axis: "horizontal", range: 2, speed: 1.1, phase: 0 },
        { col: 66, row: GROUND_ROW - 0.4, len: 2, axis: "horizontal", range: 3, speed: 0.85, phase: Math.PI / 2 },
        { col: 90, row: GROUND_ROW - 0.4, len: 2, axis: "horizontal", range: 2.3, speed: 1.0, phase: Math.PI },
      ],
      flagCol: 127,
      stairs: stairsUp(119, 7),
      monsterCol: null,
    };
  }

  // Stage 4 — the drowned reef. Two halves: a long underwater stretch
  // (swim physics, coral, fish, coin runs) walled off at the end by a
  // sideways pipe, and a short dry coda past it that rejoins the usual
  // staircase → flagpole → hut finish. Fish are lethal on contact and
  // can't be stomped, so the whole stage is about threading gaps rather
  // than clearing enemies.
  function stage4() {
    return {
      name: "Stage 4",
      theme: "ocean",
      hasWater: true,
      waterEndCol: 101,
      exitPipe: { col: 98 },
      levelCols: 132,
      pits: [[30, 33], [58, 61]],
      platforms: [
        { col: 9, row: 6, len: 3 },
        { col: 17, row: 4, len: 4 },
        { col: 24, row: 7, len: 3 },
        { col: 35, row: 5, len: 4 },
        { col: 47, row: 3, len: 3 },
        { col: 55, row: 6, len: 4 },
        { col: 66, row: 4, len: 5 },
        { col: 74, row: 6, len: 3 },
        { col: 82, row: 3, len: 4 },
        { col: 89, row: 6, len: 4 },
      ],
      // Coral stalks growing off the seabed — solid, so they double as
      // bollards that break the open water into lanes.
      corals: [
        { col: 6, height: 3 }, { col: 13, height: 2 }, { col: 21, height: 4 },
        { col: 27, height: 3 }, { col: 38, height: 2 }, { col: 44, height: 4 },
        { col: 52, height: 3 }, { col: 64, height: 2 }, { col: 70, height: 4 },
        { col: 78, height: 3 }, { col: 86, height: 2 }, { col: 93, height: 3 },
      ],
      blocks: [
        { col: 11, row: 3, type: "coin" },
        { col: 12, row: 3, type: "coin" },
        { col: 19, row: 1, type: "star" },
        { col: 29, row: 4, type: "coin" },
        { col: 40, row: 3, type: "coin" },
        { col: 41, row: 3, type: "coin" },
        { col: 50, row: 5, type: "coin" },
        { col: 62, row: 2, type: "coin" },
        { col: 63, row: 2, type: "star" },
        { col: 76, row: 3, type: "coin" },
        { col: 84, row: 6, type: "coin" },
        { col: 91, row: 2, type: "coin" },
      ],
      // Coin runs trace the swim path; the ones sitting inside the two
      // seabed gaps are the risk/reward picks.
      coins: [
        { col: 3, row: 8 }, { col: 4, row: 7 }, { col: 5, row: 6 },
        { col: 15, row: 7 }, { col: 16, row: 6 },
        { col: 22, row: 3 }, { col: 23, row: 2 },
        { col: 31, row: 8 }, { col: 32, row: 8 }, { col: 33, row: 8 },
        { col: 42, row: 6 }, { col: 43, row: 5 },
        { col: 53, row: 4 }, { col: 54, row: 3 },
        { col: 59, row: 8 }, { col: 60, row: 8 },
        { col: 68, row: 2 }, { col: 69, row: 2 },
        { col: 79, row: 5 }, { col: 80, row: 4 },
        { col: 87, row: 7 }, { col: 88, row: 6 },
        { col: 95, row: 4 }, { col: 96, row: 5 },
        { col: 105, row: 8 }, { col: 106, row: 8 },
        { col: 110, row: 7 }, { col: 111, row: 7 },
      ],
      urns: [],
      enemies: [],
      pipes: [],
      fish: [
        { col: 14, row: 5, variant: "cheep", speed: 40, min: 10, max: 20, bob: 34 },
        { col: 26, row: 3, variant: "cheep", speed: 55, min: 22, max: 32, bob: 28 },
        { col: 34, row: 6, variant: "puffer", speed: 30, min: 30, max: 40, bob: 40 },
        { col: 46, row: 4, variant: "cheep", speed: 60, min: 42, max: 54, bob: 30 },
        { col: 57, row: 2, variant: "cheep", speed: 45, min: 52, max: 62, bob: 36 },
        { col: 65, row: 7, variant: "puffer", speed: 28, min: 61, max: 71, bob: 34 },
        { col: 72, row: 3, variant: "cheep", speed: 65, min: 68, max: 80, bob: 26 },
        { col: 81, row: 6, variant: "cheep", speed: 50, min: 77, max: 87, bob: 32 },
        { col: 90, row: 4, variant: "puffer", speed: 32, min: 86, max: 95, bob: 38 },
      ],
      flagCol: 124,
      stairs: stairsUp(114, 7),
      monsterCol: null,
    };
  }

  const STAGES = [stage1, stage2, stage3, stage4];
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
    STAGE_THEME = s.theme || "desert";
    HAS_LAVA = !!s.hasLava;
    EMBERS = s.embers || [];
    MOVERS = s.movers || [];
    HAS_WATER = !!s.hasWater;
    WATER_END_COL = s.waterEndCol ?? 0;
    CORALS = s.corals || [];
    FISH = s.fish || [];
    EXIT_PIPE = s.exitPipe || null;
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
      if (inPit(col) && (!ARENA_START_COL || col < ARENA_START_COL)) {
        // A lava stage fills its pits with actual molten floor instead of
        // an empty gap — touching it (see the lava check in update()) is
        // instant death at the surface, not just falling off the bottom
        // of the screen.
        if (HAS_LAVA) {
          for (let r = GROUND_ROW; r < GROUND_ROW + GROUND_ROWS; r++) tiles[r][col] = "lava";
        }
        continue;
      }
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
    // Coral stalks — solid, like the ones that break up the open water in
    // the games this borrows its grammar from.
    for (const c of CORALS) {
      for (let h = 0; h < c.height; h++) tiles[GROUND_ROW - 1 - h][c.col] = "coral";
    }
    // The wall that closes off the sea, with a two-tile-tall pipe mouth
    // punched through it at standing height. Walking into that mouth is
    // the only way out of the underwater half (see the exit-pipe check in
    // update()); the third column is the pipe's solid back wall.
    if (EXIT_PIPE) {
      const { col } = EXIT_PIPE;
      for (let r = 0; r < GROUND_ROW; r++) {
        tiles[r][col] = "brick";
        tiles[r][col + 1] = "brick";
        tiles[r][col + 2] = "brick";
      }
      tiles[GROUND_ROW - 2][col] = null;
      tiles[GROUND_ROW - 1][col] = null;
      tiles[GROUND_ROW - 2][col + 1] = null;
      tiles[GROUND_ROW - 1][col + 1] = null;
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
    return t === "ground" || t === "brick" || t === "urn" || t === "pipe" || t === "coral" || (t && t.kind === "box");
  }

  // ---------------------------------------------------------------------
  // Assets — the three character portraits are the only external images;
  // everything else (tiles, backdrop, props) is drawn with canvas
  // primitives, same lightweight approach as the rest of DigiCode's games.
  // ---------------------------------------------------------------------
  const ASSET_V = "6";
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
  const keys = { left: false, right: false, jump: false, jumpPressedAt: -1, down: false };
  document.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") keys.left = true;
    else if (e.code === "ArrowRight") keys.right = true;
    else if (e.code === "ArrowDown") { keys.down = true; e.preventDefault(); }
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
    else if (e.code === "ArrowDown") keys.down = false;
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
  bindHoldButton("rhDownBtn", () => (keys.down = true), () => (keys.down = false));
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

  // iOS doesn't reliably drop real Fullscreen-API fullscreen on its own
  // when the phone rotates — leaving the stage fighting between the
  // browser's fullscreen layout and a portrait-shaped viewport (the
  // "stretched when I turn it back to portrait" report). This is a wide
  // game with nothing useful to show in portrait anyway, so just exit
  // fullscreen outright the moment portrait is detected, same as if the
  // player had tapped the fullscreen button themselves.
  const portraitQuery = window.matchMedia("(orientation: portrait)");
  function exitFullscreenIfPortrait() {
    if (document.fullscreenElement && portraitQuery.matches) {
      document.exitFullscreen?.();
    }
  }
  portraitQuery.addEventListener?.("change", exitFullscreenIfPortrait);
  window.addEventListener("orientationchange", exitFullscreenIfPortrait);

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
  function playPowerUp() { const t = getAudioCtx()?.currentTime; if (t != null) [392, 494, 587, 784, 987].forEach((f, i) => tone(f, t + i * 0.05, 0.12, 0.13, "square")); }
  function playBrickBreak() { const t = getAudioCtx()?.currentTime; if (t != null) sweep(180, 40, t, 0.16, 0.2, "sawtooth"); }
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
  let player, enemies, coins, cobras, plants, mushrooms, embers, movers, particles, camX, flagRaised, monster, elapsedInLevel;
  // Drives the end-of-stage flourish: grab the pole, ride it down, then
  // walk off into the hut. `phase` is null whenever a stage is being
  // played normally.
  let finishSeq;
  let fish, bubbles, pipeSeq;
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
      coyote: 0, jumpsUsed: 0, runPhase: 0, hurtTimer: 0, squash: 1, big: false, squatting: false,
      ridingMover: null,
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
    mushrooms = [];
    // Embers leap up out of lava on a wait-then-launch cycle (real gravity
    // arc, not the linear emerge/retreat cobras and plants use) — an
    // original molten-imp creature, not a reskin of any specific game's
    // lava enemy.
    embers = EMBERS.map((e) => ({
      x: e.col * TILE + TILE / 2, restY: e.row * TILE + TILE / 2, y: e.row * TILE + TILE / 2,
      vy: 0, waitTimer: 1 + Math.random() * 1.5, launched: false, alive: true,
    }));
    // Movers ping-pong at a constant speed between their start point and a
    // point `range` tiles away along one axis — the timed lift platforms
    // over the lava gaps.
    movers = MOVERS.map((m) => ({
      axis: m.axis, baseX: m.col * TILE, baseY: m.row * TILE,
      x: m.col * TILE, y: m.row * TILE, w: m.len * TILE, h: 14,
      range: m.range * TILE, speed: m.speed, phase: m.phase || 0, dx: 0, dy: 0,
    }));
    // Fish drift along their lane and bob as they go. They never chase and
    // never get stomped — touching one is simply fatal, so they read as
    // hazards to thread past rather than enemies to fight.
    fish = FISH.map((f) => ({
      x: f.col * TILE,
      baseY: f.row * TILE,
      y: f.row * TILE,
      w: f.variant === "puffer" ? 40 : 30,
      h: f.variant === "puffer" ? 34 : 22,
      vx: (f.dir ?? -1) * (f.speed ?? 45),
      minX: (f.min ?? f.col - 5) * TILE,
      maxX: (f.max ?? f.col + 5) * TILE,
      bobPhase: Math.random() * Math.PI * 2,
      bobRange: f.bob ?? 30,
      variant: f.variant || "cheep",
      finPhase: Math.random() * Math.PI * 2,
    }));
    bubbles = [];
    particles = [];
    camX = 0;
    flagRaised = false;
    finishSeq = { phase: null, t: 0, slideT: 0, alpha: 1 };
    pipeSeq = { phase: null, t: 0, alpha: 1 };
    player.swimKick = 0;
    player.strokeAt = -999;
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
  function clearStage(delayMs = 1400) {
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
    }, delayMs);
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
    // life should cost you, not send you back to the very start. A life
    // is only ever lost while already small (see hitPlayer()) or from a
    // pit, so always respawn small regardless of which one it was.
    player.x = respawnX; player.y = respawnY; player.vx = 0; player.vy = 0;
    player.jumpsUsed = 0;
    player.big = false; player.squatting = false; player.w = PLAYER_W; player.h = PLAYER_H;
    player.ridingMover = null;
    invincibleTimer = 1.4;
    startMusic();
  }

  // Growing/shrinking keeps Habib's feet planted and his footprint
  // horizontally centered, rather than expanding down-and-right from the
  // top-left corner the way a naive width/height change would.
  function growTo(big) {
    if (player.squatting) {
      // Stand up first, from the OLD tier's normal height — otherwise
      // the feet-planting math below would be measuring from a
      // squatted height instead of a standing one and land wrong.
      const oldNormalH = player.big ? PLAYER_H_BIG : PLAYER_H;
      player.y += player.h - oldNormalH;
      player.h = oldNormalH;
      player.squatting = false;
    }
    const newW = big ? PLAYER_W_BIG : PLAYER_W;
    const newH = big ? PLAYER_H_BIG : PLAYER_H;
    player.x += (player.w - newW) / 2;
    player.y += player.h - newH;
    player.w = newW;
    player.h = newH;
    player.big = big;
  }

  // A hazard touch either shrinks Big Habib back to normal (no life
  // lost — the whole point of the mushroom) or costs a life if he was
  // already small. Falling in a pit bypasses this and always costs a
  // life/respawns small, same as the games this is patterned after.
  function hitPlayer() {
    if (player.big) {
      growTo(false);
      invincibleTimer = 1.6;
      playHurt();
    } else {
      loseLife(false);
    }
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

  // The mushroom itself is an original design (gold cap, teal spots) —
  // see drawMushroom() — not a reskin of the classic red-and-white one.
  const MUSHROOM_W = 26, MUSHROOM_H = 24;
  function spawnMushroom(col, row) {
    const startY = row * TILE - MUSHROOM_H;
    mushrooms.push({
      x: col * TILE + TILE / 2 - MUSHROOM_W / 2, y: startY, w: MUSHROOM_W, h: MUSHROOM_H,
      vx: 55, vy: 0, onGround: false, alive: true, taken: false,
      emergeTimer: 0.3, startY,
    });
  }

  function hitBlock(row, col, t) {
    if (t.type === "brick") {
      if (player.big) {
        // Big Habib smashes plain bricks outright — gone for good, with
        // a few chunks flying, rather than just bopping like normal size.
        tiles[row][col] = null;
        playBrickBreak();
        for (const dx of [-8, 8]) {
          particles.push({ x: col * TILE + TILE / 2 + dx, y: row * TILE + TILE / 2, vy: -160, life: 0.5, kind: "debris" });
        }
      } else {
        t.bumpAt = elapsedInLevel; // a little hop-in-place, no other effect
        playBlockHit();
      }
      return;
    }
    if (t.hit) { playBlockHit(); return; }
    t.hit = true;
    t.bumpAt = elapsedInLevel;
    if (t.type === "coin") {
      // A coin block has a small chance of holding a mushroom instead —
      // only worth rolling for while still small, since there's nothing
      // for a second mushroom to do.
      if (!player.big && Math.random() < 0.18) {
        spawnMushroom(col, row);
        playBlockHit();
        return;
      }
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

  // The victory hut Habib disappears into at the end of a stage — a small
  // domed mud-brick house, sitting a few tiles past the flagpole. Its
  // geometry lives here (not in the stage data) so every stage gets one
  // in the same spot relative to its own flag, and both the renderer and
  // the walk-in animation read the exact same numbers.
  const HUT_W = TILE * 3;
  const HUT_H = 104;
  function hutRect() {
    const x = (FLAG_COL + 3) * TILE;
    const y = GROUND_ROW * TILE - HUT_H;
    return { x, y, w: HUT_W, h: HUT_H, doorX: x + HUT_W / 2 };
  }

  // True while Habib is in the flooded half of a water stage. The sea ends
  // at a hard wall (WATER_END_COL), so this flips exactly once per run,
  // when the exit pipe drops him out the far side.
  function isUnderwater() {
    return HAS_WATER && player.x + player.w / 2 < WATER_END_COL * TILE;
  }

  // Bubbles trail from Habib's mouth on the side he's facing, at two
  // distinct rise speeds so the stream looks organic rather than uniform.
  function spawnBubbles(n) {
    for (let i = 0; i < n; i++) {
      bubbles.push({
        x: player.x + (player.facing > 0 ? player.w - 4 : 4) + (Math.random() - 0.5) * 6,
        y: player.y + player.h * 0.28,
        r: 1.8 + Math.random() * 2.4,
        vy: -(Math.random() < 0.5 ? 149 : 47) * (0.8 + Math.random() * 0.4),
        drift: (Math.random() - 0.5) * 18,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.1,
      });
    }
  }

  const SLIDE_SPEED = 240;
  const FINISH_WALK_SPEED = 95;

  // Walking into the sideways pipe set into the sea wall carries Habib
  // through to the dry coda on the other side — the same "water section →
  // pipe → short land run → flag" shape the genre's water levels use.
  function startPipeTransition() {
    state = "cutscene";
    pipeSeq.phase = "enter";
    pipeSeq.t = 0;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    playFlag();
  }

  function updatePipeTransition(dt) {
    pipeSeq.t += dt;
    if (pipeSeq.phase === "enter") {
      // Slide into the mouth and fade out.
      player.x += 55 * dt;
      player.runPhase += 55 * dt * 0.05;
      pipeSeq.alpha = Math.max(0, 1 - pipeSeq.t / 0.6);
      if (pipeSeq.t >= 0.8) {
        // Pop out on dry land past the wall, back on normal footing.
        player.x = (EXIT_PIPE.col + 5) * TILE;
        player.y = GROUND_ROW * TILE - player.h;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
        respawnX = player.x;
        respawnY = player.y;
        camX = Math.max(0, Math.min(player.x - WIDTH * 0.4, LEVEL_COLS * TILE - WIDTH));
        pipeSeq.phase = "exit";
        pipeSeq.t = 0;
      }
    } else if (pipeSeq.phase === "exit") {
      pipeSeq.alpha = Math.min(1, pipeSeq.t / 0.45);
      if (pipeSeq.t >= 0.5) {
        pipeSeq.phase = "done";
        pipeSeq.alpha = 1;
        state = "playing";
        startMusic();
      }
    }
    const targetCamX = Math.max(0, Math.min(player.x - WIDTH * 0.4, LEVEL_COLS * TILE - WIDTH));
    camX += (targetCamX - camX) * Math.min(1, dt * 6);
  }

  function startFinishSequence() {
    state = "cutscene";
    finishSeq.phase = "slide";
    finishSeq.t = 0;
    // Snap onto the pole and let go of any leftover momentum, so the ride
    // down reads as a deliberate grab rather than a mid-jump drift.
    player.x = FLAG_COL * TILE + TILE / 2 - player.w / 2;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.squatting = false;
    player.facing = 1;
  }

  function updateFinishSequence(dt) {
    const groundY = GROUND_ROW * TILE;
    const hut = hutRect();

    if (finishSeq.phase === "slide") {
      player.y = Math.min(player.y + SLIDE_SPEED * dt, groundY - player.h);
      // The banner rides down the pole alongside him.
      const tipY = Math.max(1, GROUND_ROW - (STAIRS.length ? Math.max(...STAIRS.map((s) => s.height)) : 0) - 1) * TILE;
      const travel = Math.max(1, groundY - player.h - tipY);
      finishSeq.slideT = Math.min(1, (player.y - tipY) / travel);
      if (player.y >= groundY - player.h) {
        player.y = groundY - player.h;
        player.onGround = true;
        finishSeq.phase = "walk";
      }
    } else if (finishSeq.phase === "walk") {
      // vx is set (not just x) so drawPlayer picks the running leg pose
      // rather than the idle one.
      player.vx = FINISH_WALK_SPEED;
      player.x += FINISH_WALK_SPEED * dt;
      player.runPhase += FINISH_WALK_SPEED * dt * 0.05;
      player.onGround = true;
      if (player.x + player.w / 2 >= hut.doorX) finishSeq.phase = "enter";
    } else if (finishSeq.phase === "enter") {
      // Keep shuffling forward while fading, so he reads as stepping
      // through the doorway rather than blinking out on the threshold.
      finishSeq.t += dt;
      player.x += FINISH_WALK_SPEED * 0.5 * dt;
      player.runPhase += FINISH_WALK_SPEED * dt * 0.03;
      finishSeq.alpha = Math.max(0, 1 - finishSeq.t / 0.55);
      if (finishSeq.t >= 0.75) {
        finishSeq.phase = "done";
        clearStage(700);
      }
    }

    const targetCamX = Math.max(0, Math.min(player.x - WIDTH * 0.4, LEVEL_COLS * TILE - WIDTH));
    camX += (targetCamX - camX) * Math.min(1, dt * 6);
  }

  function update(dt) {
    elapsedInLevel += dt;
    // Runs during the "cutscene" state, so it has to come before the
    // playing-only gate below.
    if (finishSeq.phase && finishSeq.phase !== "done") {
      updateFinishSequence(dt);
      return;
    }
    if (pipeSeq.phase && pipeSeq.phase !== "done") {
      updatePipeTransition(dt);
      return;
    }
    if (state !== "playing") return;

    if (invincibleTimer > 0) invincibleTimer = Math.max(0, invincibleTimer - dt);
    if (starTimer > 0) starTimer = Math.max(0, starTimer - dt);

    // --- Moving platforms: ping-pong along one axis via a sine offset (smooth
    // ease at each end, unlike a linear back-and-forth) and carry whoever is
    // riding along with them, since they aren't part of the static tile grid
    // moveAndCollide() already knows how to walk on.
    for (const mv of movers) {
      const prevX = mv.x, prevY = mv.y;
      mv.phase += dt * mv.speed;
      const offset = Math.sin(mv.phase) * mv.range;
      if (mv.axis === "horizontal") { mv.x = mv.baseX + offset; mv.y = mv.baseY; }
      else { mv.y = mv.baseY + offset; mv.x = mv.baseX; }
      mv.dx = mv.x - prevX;
      mv.dy = mv.y - prevY;
      if (player.ridingMover === mv) {
        player.x += mv.dx;
        player.y += mv.dy;
      }
    }

    // --- Squat: hold Down to duck, shrinking the hitbox (and the look,
    // via squatSquash in drawPlayer) to fit under low obstacles — only
    // while grounded, matching genre convention. Standing height is
    // whatever the CURRENT size tier's normal height is, so this stays
    // correct whether Habib is big or small when he ducks.
    const underwater = isUnderwater();
    const wantsSquat = keys.down && player.onGround && !underwater;
    if (wantsSquat !== player.squatting) {
      const tierH = player.big ? PLAYER_H_BIG : PLAYER_H;
      const newH = wantsSquat ? tierH * 0.62 : tierH;
      player.y += player.h - newH;
      player.h = newH;
      player.squatting = wantsSquat;
    }

    if (underwater) {
      // --- Swimming ---
      const maxH = player.onGround ? SWIM_WALK_SPEED : SWIM_MAX_SPEED;
      if (keys.left && !keys.right) {
        player.vx = Math.max(player.vx - (player.vx > 0 ? SWIM_TURN_ACCEL : SWIM_ACCEL) * dt, -maxH);
        player.facing = -1;
      } else if (keys.right && !keys.left) {
        player.vx = Math.min(player.vx + (player.vx < 0 ? SWIM_TURN_ACCEL : SWIM_ACCEL) * dt, maxH);
        player.facing = 1;
      } else if (player.onGround) {
        // Friction applies on the seabed only — drifting through open water
        // with no input keeps your speed, which is what makes swimming
        // feel glide-y rather than mushy.
        player.vx = player.vx > 0 ? Math.max(0, player.vx - MOVE_DECEL * dt) : Math.min(0, player.vx + MOVE_DECEL * dt);
      } else {
        player.vx = Math.max(-maxH, Math.min(maxH, player.vx));
      }

      const nowS = performance.now() / 1000;
      const stroked = keys.jumpPressedAt > 0 && nowS - keys.jumpPressedAt < JUMP_BUFFER;
      if (stroked) {
        player.vy = SWIM_STROKE; // assigned, not added — always fully arrests a sink
        keys.jumpPressedAt = -1;
        player.jumpsUsed = 0;
        player.strokeAt = elapsedInLevel;
        playStomp();
        spawnBubbles(2);
      }
      // Releasing the button after a stroke actually floats you a little
      // higher, exactly as in the original — the "up" force is the stronger
      // of the two, so letting go decelerates you more gently.
      const risingHeld = player.vy < 0 && keys.jump;
      player.vy = Math.min(player.vy + (risingHeld ? SWIM_RISE_DECEL_HELD : SWIM_SINK_ACCEL) * dt, SWIM_MAX_SINK);

      moveAndCollide(player, player.vx * dt, 0);
      moveAndCollide(player, 0, player.vy * dt);
      // Don't let him break the surface.
      if (player.y < SWIM_CEILING_Y) {
        player.y = SWIM_CEILING_Y;
        if (player.vy < 0) player.vy = 40;
      }
      player.swimKick += dt;
      player.squash += (1 - player.squash) * Math.min(1, dt * 10);
    } else {
      // --- Player horizontal movement (accelerate/decelerate, not snap-to-speed) ---
      const runMult = starTimer > 0 ? 1.4 : 1;
      if (player.squatting) {
        // Can't run while ducking — bleed off speed to a stop instead.
        player.vx = player.vx > 0 ? Math.max(0, player.vx - MOVE_DECEL * dt) : Math.min(0, player.vx + MOVE_DECEL * dt);
      } else if (keys.left && !keys.right) {
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
    }

    // --- Land on top of a moving platform — one-way, only catches a foot
    // that's falling onto (or resting right at) the platform's surface, so
    // it never blocks from underneath or the side.
    player.ridingMover = null;
    if (!player.onGround) {
      for (const mv of movers) {
        const withinX = player.x + player.w > mv.x + 2 && player.x < mv.x + mv.w - 2;
        const feetY = player.y + player.h;
        if (withinX && player.vy >= 0 && feetY >= mv.y - 6 && feetY <= mv.y + 10) {
          player.y = mv.y - player.h;
          player.vy = 0;
          player.onGround = true;
          player.ridingMover = mv;
          break;
        }
      }
    }

    if (player.onGround) player.runPhase += Math.abs(player.vx) * dt * 0.05;

    // --- Fell in a pit ---
    if (player.y > HEIGHT + 80) { loseLife(true); return; }

    // --- Lava: instant death on contact, no big/small buffer — fire kills
    // regardless of size, same convention as the pit fall above.
    if (HAS_LAVA) {
      const leftCol = Math.floor((player.x + 3) / TILE);
      const rightCol = Math.floor((player.x + player.w - 4) / TILE);
      const footRow = Math.floor((player.y + player.h - 2) / TILE);
      const midRow = Math.floor((player.y + player.h * 0.5) / TILE);
      for (const r of [footRow, midRow]) {
        for (let c = leftCol; c <= rightCol; c++) {
          if (tileAt(r, c) === "lava") { loseLife(true); return; }
        }
      }
    }

    // --- Fish: drift along their lane, bob as they go, turn at the ends.
    // They never chase and can't be stomped — contact is simply fatal, so
    // they're obstacles to time your way past rather than enemies.
    for (const f of fish) {
      f.x += f.vx * dt;
      if (f.x < f.minX) { f.x = f.minX; f.vx = Math.abs(f.vx); }
      else if (f.x > f.maxX) { f.x = f.maxX; f.vx = -Math.abs(f.vx); }
      f.bobPhase += dt * 1.1;
      f.finPhase += dt * 9;
      f.y = f.baseY + Math.sin(f.bobPhase) * f.bobRange;
      if (starTimer > 0 || invincibleTimer > 0) continue;
      if (player.x + 5 < f.x + f.w && player.x + player.w - 5 > f.x &&
          player.y + 5 < f.y + f.h && player.y + player.h - 5 > f.y) {
        loseLife(true);
        return;
      }
    }

    // --- Bubbles: a steady trickle from Habib plus the odd one drifting up
    // from the seabed, purely to sell that this is underwater.
    if (isUnderwater()) {
      if (Math.random() < dt * 2.2) spawnBubbles(1);
      if (Math.random() < dt * 3.5) {
        bubbles.push({
          x: camX + Math.random() * WIDTH,
          y: GROUND_ROW * TILE - 4,
          r: 1.5 + Math.random() * 2,
          vy: -(30 + Math.random() * 60),
          drift: (Math.random() - 0.5) * 14,
          life: 0,
          maxLife: 2.5 + Math.random(),
        });
      }
    }
    for (const b of bubbles) {
      b.life += dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.life * 3) * b.drift * dt;
    }
    bubbles = bubbles.filter((b) => b.life < b.maxLife && b.y > 0);

    // --- Exit pipe: walking into the mouth carries him through to dry land.
    if (EXIT_PIPE && !pipeSeq.phase) {
      const mouthX = EXIT_PIPE.col * TILE;
      const mouthY = (GROUND_ROW - 2) * TILE;
      if (player.x + player.w > mouthX + 6 && player.x < mouthX + TILE * 2 &&
          player.y + player.h > mouthY && player.y < GROUND_ROW * TILE) {
        startPipeTransition();
        return;
      }
    }

    // --- Embers: rest in the lava, then launch straight up on a timer and
    // arc back down under gravity — an original molten-imp creature, not a
    // reskin of the classic fireball. ---
    for (const em of embers) {
      if (!em.alive) continue;
      if (!em.launched) {
        em.waitTimer -= dt;
        if (em.waitTimer <= 0) { em.launched = true; em.vy = -EMBER_LAUNCH_SPEED; }
      } else {
        em.vy += GRAVITY * dt;
        em.y += em.vy * dt;
        if (em.y >= em.restY) {
          em.y = em.restY;
          em.vy = 0;
          em.launched = false;
          em.waitTimer = 1 + Math.random() * 1.5;
        }
      }
      const edx = em.x - (player.x + player.w / 2);
      const edy = em.y - (player.y + player.h / 2);
      if (Math.hypot(edx, edy) < 20) {
        if (starTimer > 0) { /* immune while starred, same as other hazards */ }
        else if (invincibleTimer <= 0) { loseLife(true); return; }
      }
    }

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

    // --- Mushrooms: pop out of their block, then walk until collected ---
    for (const m of mushrooms) {
      if (m.taken || !m.alive) continue;
      if (m.emergeTimer > 0) {
        m.emergeTimer = Math.max(0, m.emergeTimer - dt);
        m.y = m.startY - (1 - m.emergeTimer / 0.3) * TILE;
      } else {
        m.vy = Math.min(m.vy + GRAVITY * dt, MAX_FALL_SPEED);
        const movedX = moveAndCollide(m, m.vx * dt, 0);
        if (movedX === 0) m.vx *= -1;
        moveAndCollide(m, 0, m.vy * dt);
        if (m.y > HEIGHT + 80) { m.alive = false; continue; }
      }
      if (m.x < player.x + player.w && m.x + m.w > player.x && m.y < player.y + player.h && m.y + m.h > player.y) {
        m.taken = true;
        if (!player.big) growTo(true);
        playPowerUp();
      }
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
        hitPlayer();
        return;
      }
    }
    for (const co of cobras) {
      if (!co.alive || !co.emerged) continue;
      if (overlap({ x: co.x - 12, y: co.y, w: 24, h: 26 })) {
        if (starTimer > 0) { co.alive = false; playStomp(); }
        else if (invincibleTimer <= 0) { hitPlayer(); return; }
      }
    }
    for (const pl of plants) {
      if (!pl.alive || !pl.emerged) continue;
      if (overlap({ x: pl.x - 16, y: pl.y - 26, w: 32, h: 34 })) {
        if (starTimer > 0) { pl.alive = false; playStomp(); }
        else if (invincibleTimer <= 0) { hitPlayer(); return; }
      }
    }

    // --- Flagpole ---
    // On a stage with a boss arena past it (the eventual final stage),
    // this is just a checkpoint fanfare — the real finish is beating the
    // monster, and returning here would end "playing" before the
    // boss-arena check below ever got to run. Every other stage's flag
    // IS the finish, so it kicks off the end-of-stage flourish (see
    // updateFinishSequence) which clears the stage once it's done.
    if (!flagRaised && player.x + player.w > FLAG_COL * TILE) {
      flagRaised = true;
      playFlag();
      if (!MONSTER_COL) {
        startFinishSequence();
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
          hitPlayer();
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
    if (STAGE_THEME === "castle") { drawCastleBackground(); return; }
    // Stage 4 paints the shore sky first, then the sea clipped to the
    // flooded half — so the boundary is one clean vertical line at the sea
    // wall, matching where the tile palettes and the water tint also
    // switch, instead of the whole backdrop popping over at once.
    if (STAGE_THEME === "ocean") {
      drawDesertBackground();
      const edge = WATER_END_COL * TILE - camX;
      if (edge > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, Math.min(WIDTH, edge), HEIGHT); ctx.clip();
        drawOceanBackground();
        ctx.restore();
      }
      return;
    }
    drawDesertBackground();
  }

  function drawDesertBackground() {
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

  // Stage 3's dark castle interior — a moody obsidian-and-torchlight
  // corridor instead of the open desert sky, with a warm lava-glow ambient
  // wash standing in for the sun.
  function drawCastleBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#0b0812"); g.addColorStop(0.6, "#221329"); g.addColorStop(1, "#3a1710");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const glow = ctx.createLinearGradient(0, HEIGHT * 0.45, 0, HEIGHT);
    glow.addColorStop(0, "rgba(255, 110, 30, 0)");
    glow.addColorStop(1, "rgba(255, 120, 40, 0.3)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Distant crenellated wall, parallax-scrolled slower than the world.
    const far = camX * 0.3;
    ctx.fillStyle = "rgba(28, 18, 32, 0.75)";
    for (let i = -1; i < 9; i++) {
      const bx = i * 130 - (far % 130);
      ctx.fillRect(bx, HEIGHT - 210, 92, 150);
      for (let cx = bx; cx < bx + 92; cx += 22) {
        ctx.fillRect(cx, HEIGHT - 226, 14, 18);
      }
    }

    // Tall support pillars, midground.
    const mid = camX * 0.55;
    for (let i = -1; i < 6; i++) {
      const bx = i * 220 + 80 - (mid % 220);
      ctx.fillStyle = "rgba(45, 26, 42, 0.85)";
      ctx.fillRect(bx, HEIGHT - 260, 26, 260);
      ctx.fillStyle = "rgba(18, 9, 18, 0.5)";
      ctx.fillRect(bx + 4, HEIGHT - 260, 4, 260);
    }

    // Flickering wall torches for a little warm life in the gloom.
    const near = camX * 0.75;
    for (let i = -1; i < 10; i++) {
      const bx = i * 160 + 60 - (near % 160);
      const flick = 0.6 + Math.sin(elapsedInLevel * 9 + i * 2) * 0.2 + Math.random() * 0.05;
      ctx.fillStyle = "rgba(70, 45, 30, 0.9)";
      ctx.fillRect(bx - 3, HEIGHT - 180, 6, 22);
      const flame = ctx.createRadialGradient(bx, HEIGHT - 190, 1, bx, HEIGHT - 190, 16);
      flame.addColorStop(0, `rgba(255, 220, 140, ${flick})`);
      flame.addColorStop(1, "rgba(255, 120, 30, 0)");
      ctx.fillStyle = flame;
      ctx.beginPath(); ctx.arc(bx, HEIGHT - 190, 16, 0, Math.PI * 2); ctx.fill();
    }
  }

  // True when the tile/prop at this SCREEN x sits in the flooded half of
  // the level — lets one palette branch serve both halves of Stage 4.
  function oceanAt(screenX) {
    return STAGE_THEME === "ocean" && screenX + camX < WATER_END_COL * TILE;
  }

  // Stage 4's sea — a deep sunlit water column with god rays slanting down,
  // distant coral silhouettes on parallax, and a hazy seabed glow.
  function drawOceanBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#3fb2d8");
    g.addColorStop(0.35, "#1f6fae");
    g.addColorStop(0.75, "#123f7d");
    g.addColorStop(1, "#0b2350");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Surface shimmer along the very top.
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(190, 240, 255, ${0.16 - i * 0.045})`;
      ctx.beginPath();
      const yBase = 6 + i * 7;
      ctx.moveTo(0, yBase);
      for (let x = 0; x <= WIDTH; x += 20) {
        ctx.lineTo(x, yBase + Math.sin(x * 0.035 + elapsedInLevel * 1.6 + i) * 4);
      }
      ctx.lineTo(WIDTH, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Slanted god rays, drifting slowly.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const rx = ((i * 190 - camX * 0.12) % (WIDTH + 320)) - 160;
      const sway = Math.sin(elapsedInLevel * 0.4 + i) * 18;
      const ray = ctx.createLinearGradient(rx + sway, 0, rx + sway + 90, HEIGHT);
      ray.addColorStop(0, "rgba(180, 235, 255, 0.16)");
      ray.addColorStop(1, "rgba(180, 235, 255, 0)");
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(rx + sway, 0);
      ctx.lineTo(rx + sway + 54, 0);
      ctx.lineTo(rx + sway + 128, HEIGHT);
      ctx.lineTo(rx + sway + 34, HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Distant coral silhouettes, parallax-scrolled. Rooted at the seabed
    // line (not the canvas bottom) so they read as depth behind the
    // playfield instead of being hidden under the floor tiles.
    const seabedY = GROUND_ROW * TILE;
    const far = camX * 0.35;
    for (let i = -1; i < 10; i++) {
      const bx = i * 150 - (far % 150);
      ctx.fillStyle = "rgba(12, 40, 82, 0.5)";
      for (let s = 0; s < 3; s++) {
        const sx2 = bx + s * 26;
        const hgt = 46 + ((i * 7 + s * 13) % 5) * 16;
        ctx.fillRect(sx2, seabedY - hgt, 9, hgt);
        ctx.beginPath(); ctx.arc(sx2 + 4.5, seabedY - hgt, 8, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Hazy glow just above the seabed.
    const haze = ctx.createLinearGradient(0, seabedY - 140, 0, seabedY);
    haze.addColorStop(0, "rgba(60, 150, 200, 0)");
    haze.addColorStop(1, "rgba(70, 170, 215, 0.3)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, seabedY - 140, WIDTH, 140);
  }

  // A soft blue cast plus drifting caustics over the flooded half only, so
  // the boundary between sea and dry land reads clearly.
  function drawWaterOverlay() {
    if (STAGE_THEME !== "ocean") return;
    const edge = WATER_END_COL * TILE - camX;
    if (edge <= 0) return;
    const w = Math.min(WIDTH, edge);
    ctx.save();
    ctx.fillStyle = "rgba(40, 130, 200, 0.16)";
    ctx.fillRect(0, 0, w, HEIGHT);
    ctx.beginPath(); ctx.rect(0, 0, w, HEIGHT); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(180, 240, 255, 0.09)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const yy = 40 + i * 70;
      ctx.beginPath();
      for (let x = -40; x <= w + 40; x += 22) {
        const off = Math.sin(x * 0.02 + elapsedInLevel * 1.1 + i * 1.3) * 9;
        if (x === -40) ctx.moveTo(x, yy + off); else ctx.lineTo(x, yy + off);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Fish — original designs (a slim darter and a round puffer) rather than
  // reskins of any particular game's water enemies. Tail and fins animate
  // off finPhase, and the body tilts into the direction of travel.
  function drawFish() {
    for (const f of fish) {
      const x = f.x - camX;
      if (x + f.w < -30 || x > WIDTH + 30) continue;
      const cx = x + f.w / 2, cy = f.y + f.h / 2;
      const dir = f.vx >= 0 ? 1 : -1;
      const tail = Math.sin(f.finPhase) * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(f.bobPhase) * 0.12);
      ctx.scale(dir, 1);

      if (f.variant === "puffer") {
        // Spines
        ctx.fillStyle = "#7a4bb0";
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const sp = 1 + Math.sin(f.finPhase * 0.5 + i) * 0.15;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * f.w * 0.34, Math.sin(a) * f.h * 0.36);
          ctx.lineTo(Math.cos(a) * f.w * 0.5 * sp, Math.sin(a) * f.h * 0.54 * sp);
          ctx.lineTo(Math.cos(a + 0.22) * f.w * 0.34, Math.sin(a + 0.22) * f.h * 0.36);
          ctx.closePath(); ctx.fill();
        }
        // Tail
        ctx.fillStyle = "#b07ae0";
        ctx.beginPath();
        ctx.moveTo(-f.w * 0.3, 0);
        ctx.lineTo(-f.w * 0.62, -8 + tail * 6);
        ctx.lineTo(-f.w * 0.62, 8 + tail * 6);
        ctx.closePath(); ctx.fill();
        // Body
        const bg = ctx.createRadialGradient(-3, -4, 2, 0, 0, f.w * 0.44);
        bg.addColorStop(0, "#e6b8ff"); bg.addColorStop(0.55, "#b476e8"); bg.addColorStop(1, "#6f3fa8");
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(0, 0, f.w * 0.4, f.h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath(); ctx.ellipse(-4, -6, f.w * 0.16, f.h * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
      } else {
        // Tail
        ctx.fillStyle = "#ef7d4e";
        ctx.beginPath();
        ctx.moveTo(-f.w * 0.26, 0);
        ctx.lineTo(-f.w * 0.6, -9 + tail * 7);
        ctx.lineTo(-f.w * 0.6, 9 + tail * 7);
        ctx.closePath(); ctx.fill();
        // Top fin
        ctx.fillStyle = "#f39a63";
        ctx.beginPath();
        ctx.moveTo(-2, -f.h * 0.36);
        ctx.lineTo(4 + tail * 3, -f.h * 0.66);
        ctx.lineTo(10, -f.h * 0.3);
        ctx.closePath(); ctx.fill();
        // Body
        const bg = ctx.createLinearGradient(0, -f.h * 0.4, 0, f.h * 0.4);
        bg.addColorStop(0, "#ffd08a"); bg.addColorStop(0.45, "#f7913f"); bg.addColorStop(1, "#c85f22");
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(0, 0, f.w * 0.42, f.h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        // Side stripe
        ctx.fillStyle = "rgba(255, 240, 200, 0.5)";
        ctx.beginPath(); ctx.ellipse(2, 1, f.w * 0.24, f.h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        // Pectoral fin, flapping
        ctx.fillStyle = "rgba(239, 125, 78, 0.9)";
        ctx.beginPath();
        ctx.ellipse(1, f.h * 0.18, 6, 3 + Math.abs(tail) * 2, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eye — shared by both variants
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(f.w * 0.22, -f.h * 0.1, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1b1020";
      ctx.beginPath(); ctx.arc(f.w * 0.24, -f.h * 0.1, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawBubbles() {
    ctx.save();
    for (const b of bubbles) {
      const x = b.x - camX;
      if (x < -20 || x > WIDTH + 20) continue;
      const fade = 1 - b.life / b.maxLife;
      ctx.strokeStyle = `rgba(214, 245, 255, ${0.55 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * fade})`;
      ctx.beginPath(); ctx.arc(x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // The sideways pipe set into the sea wall — drawn whole so the rim reads
  // as one piece, in the same aged bronze as the stage-2 pipes.
  function drawExitPipe() {
    if (!EXIT_PIPE) return;
    const x = EXIT_PIPE.col * TILE - camX;
    const y = (GROUND_ROW - 2) * TILE;
    const w = TILE * 2, h = TILE * 2;
    if (x + w < -20 || x > WIDTH + 20) return;

    // Dark interior
    const inner = ctx.createLinearGradient(x, y, x + w, y);
    inner.addColorStop(0, "#08120f");
    inner.addColorStop(1, "#123028");
    ctx.fillStyle = inner;
    ctx.fillRect(x, y, w, h);

    // Shaft banding
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, "#5cab94"); body.addColorStop(0.5, "#3a7d6b"); body.addColorStop(1, "#1f3d36");
    ctx.fillStyle = body;
    ctx.fillRect(x + 14, y, w - 14, 9);
    ctx.fillRect(x + 14, y + h - 9, w - 14, 9);

    // Flared rim at the mouth
    const collar = ctx.createLinearGradient(0, y - 6, 0, y + h + 6);
    collar.addColorStop(0, "#c48a3f"); collar.addColorStop(0.5, "#6b471f"); collar.addColorStop(1, "#c48a3f");
    ctx.fillStyle = collar;
    ctx.fillRect(x, y - 6, 14, h + 12);
    ctx.strokeStyle = "rgba(35, 22, 8, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y - 5.5, 13, h + 11);
    ctx.fillStyle = "#2e1c0a";
    for (let ry = y + 2; ry < y + h; ry += 12) {
      ctx.beginPath(); ctx.arc(x + 7, ry, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Shared brick coursing — used by both the standalone "brick" tile
  // (platforms/stairs) and the plain-brick box variant, so the two
  // always read as the same material.
  function drawBrickTexture(x, y) {
    const castle = STAGE_THEME === "castle";
    const ocean = oceanAt(x);
    const g = ctx.createLinearGradient(x, y, x, y + TILE);
    if (castle) { g.addColorStop(0, "#4c4660"); g.addColorStop(1, "#2a2536"); }
    else if (ocean) { g.addColorStop(0, "#5fd3c0"); g.addColorStop(1, "#1f8f86"); }
    else { g.addColorStop(0, "#c96f38"); g.addColorStop(1, "#96491f"); }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = castle ? "rgba(215, 200, 235, 0.16)" : ocean ? "rgba(220, 255, 250, 0.3)" : "rgba(255,255,255,0.14)";
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + TILE - 3, TILE, 3);
    ctx.strokeStyle = castle ? "rgba(10, 6, 16, 0.6)" : ocean ? "rgba(10, 60, 62, 0.5)" : "rgba(55, 22, 8, 0.55)";
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
      const castle = STAGE_THEME === "castle";
      const ocean = oceanAt(x);
      const g = ctx.createLinearGradient(x, y, x, y + TILE);
      if (castle) { g.addColorStop(0, "#5c5670"); g.addColorStop(0.18, "#413c52"); g.addColorStop(1, "#221e2c"); }
      else if (ocean) { g.addColorStop(0, "#6d7fb5"); g.addColorStop(0.18, "#54649a"); g.addColorStop(1, "#36426f"); }
      else { g.addColorStop(0, "#dda05e"); g.addColorStop(0.18, "#c98a4b"); g.addColorStop(1, "#a4713a"); }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = castle ? "rgba(210, 195, 235, 0.18)" : ocean ? "rgba(190, 220, 255, 0.28)" : "rgba(255, 224, 176, 0.3)";
      ctx.fillRect(x, y, TILE, 3);
      ctx.strokeStyle = castle ? "rgba(8, 6, 14, 0.5)" : ocean ? "rgba(20, 30, 62, 0.45)" : "rgba(80, 45, 20, 0.35)";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      // Seabed rock reads as rounded cobbles rather than flat sand.
      if (ocean) {
        const s2 = (x * 13 + y * 7) % 97;
        ctx.fillStyle = "rgba(120, 145, 200, 0.35)";
        ctx.beginPath(); ctx.arc(x + 11 + (s2 % 9), y + 13, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 28 - (s2 % 7), y + 27, 6, 0, Math.PI * 2); ctx.fill();
      }
      // Deterministic pebble/crack speckle (seeded off position, not
      // Math.random()) so the ground has texture without flickering
      // between frames.
      const seed = (x * 13 + y * 7) % 97;
      if (seed % 5 === 0) {
        ctx.fillStyle = castle ? "rgba(150, 110, 200, 0.35)" : "rgba(90, 55, 25, 0.4)";
        ctx.beginPath(); ctx.arc(x + 9 + (seed % 15), y + 22 + (seed % 10), 2, 0, Math.PI * 2); ctx.fill();
      }
      if (seed % 7 === 3) {
        ctx.strokeStyle = castle ? "rgba(8, 6, 16, 0.4)" : "rgba(70, 38, 14, 0.35)"; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5 + (seed % 9), y + 30);
        ctx.lineTo(x + 13 + (seed % 7), y + 34);
        ctx.stroke();
      }
    } else if (type === "brick") {
      drawBrickTexture(x, y);
    } else if (type === "coral") {
      // A branching coral stalk — solid, and swaying very slightly so the
      // seabed doesn't read as a static backdrop.
      const seed = (x * 17 + y * 11) % 100;
      const sway = Math.sin(elapsedInLevel * 0.9 + seed) * 2.2;
      const cx = x + TILE / 2 + sway;
      const g = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
      g.addColorStop(0, "#ff8fc4"); g.addColorStop(0.5, "#e0559b"); g.addColorStop(1, "#a52f74");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(cx - 7, y, 14, TILE, 6);
      ctx.fill();
      // Side branches, alternating by row so a stack looks grown, not tiled.
      ctx.lineWidth = 5;
      ctx.strokeStyle = g;
      ctx.lineCap = "round";
      const flip = seed % 2 === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx, y + 13);
      ctx.quadraticCurveTo(cx + 15 * flip, y + 9, cx + 17 * flip, y - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, y + 28);
      ctx.quadraticCurveTo(cx - 14 * flip, y + 24, cx - 16 * flip, y + 13);
      ctx.stroke();
      // Highlight down one edge
      ctx.strokeStyle = "rgba(255, 210, 235, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 4, y + 3); ctx.lineTo(cx - 4, y + TILE - 3); ctx.stroke();
    } else if (type === "lava") {
      // Layered molten glow with slow-shifting bright veins, seeded by
      // position so neighboring tiles don't pulse in perfect unison.
      const g = ctx.createLinearGradient(x, y, x, y + TILE);
      g.addColorStop(0, "#ffdd66"); g.addColorStop(0.35, "#ff8a2a"); g.addColorStop(1, "#8a1a0a");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE, TILE);
      const seed = (x * 17 + y * 11) % 100;
      const wob = Math.sin(elapsedInLevel * 2 + seed) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255, 220, 120, ${0.25 + wob * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2 + Math.sin(elapsedInLevel * 1.3 + seed) * 8, y + 10 + wob * 6, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 20, 5, 0.4)";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
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
      // The banner rides down the pole with Habib during the finish
      // flourish (slideT runs 0→1 there, and is 0 the rest of the time).
      const bannerDrop = finishSeq.slideT * Math.max(0, GROUND_ROW * TILE - y - 34);
      ctx.fillStyle = "#e0473a";
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2 + 3, y + 6 + bannerDrop);
      ctx.lineTo(x + TILE / 2 + 34, y + 16 + bannerDrop);
      ctx.lineTo(x + TILE / 2 + 3, y + 26 + bannerDrop);
      ctx.closePath();
      ctx.fill();
    } else if (type === "pipe") {
      // Drawn as a whole in drawPipes() (needs the full column/height,
      // which a single tile cell doesn't have) — nothing to do per-cell.
    } else if (type && type.kind === "box") {
      // A short upward hop right after being hit — bumpAt is a timestamp
      // (elapsedInLevel when it happened), not a persistent flag, so this
      // naturally decays back to 0 on its own without any cleanup pass.
      const bump = Math.max(0, 1 - (elapsedInLevel - (type.bumpAt ?? -999)) / 0.12);
      const by = y - bump * 6;
      if (type.type === "brick") {
        // A plain brick box never holds a coin — it should look like one
        // of these from the start, not like a "?" block that turns out to
        // be a dud. Same brick texture as the platform tiles, so it's
        // obvious at a glance which of a row of blocks are worth hitting.
        drawBrickTexture(x, by);
        return;
      }
      if (type.hit) {
        const g = ctx.createLinearGradient(x, by, x, by + TILE);
        g.addColorStop(0, "#8f6f4a"); g.addColorStop(1, "#5c4530");
        ctx.fillStyle = g;
        ctx.fillRect(x, by, TILE, TILE);
        ctx.strokeStyle = "rgba(40, 25, 10, 0.4)";
        ctx.strokeRect(x + 0.5, by + 0.5, TILE - 1, TILE - 1);
      } else {
        const isStar = type.type === "star";
        const g = ctx.createLinearGradient(x, by, x, by + TILE);
        if (isStar) { g.addColorStop(0, "#fff3b0"); g.addColorStop(0.5, "#e8b84b"); g.addColorStop(1, "#b8811f"); }
        else { g.addColorStop(0, "#f0c473"); g.addColorStop(0.5, "#d99a3f"); g.addColorStop(1, "#a8701f"); }
        ctx.fillStyle = g;
        ctx.fillRect(x, by, TILE, TILE);
        // Beveled inset (light top/left, dark bottom/right) for a carved,
        // gilded-stone look instead of a flat color swatch.
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.beginPath(); ctx.moveTo(x + 2, by + TILE - 2); ctx.lineTo(x + 2, by + 2); ctx.lineTo(x + TILE - 2, by + 2); ctx.stroke();
        ctx.strokeStyle = "rgba(70, 40, 10, 0.5)";
        ctx.beginPath(); ctx.moveTo(x + TILE - 2, by + 2); ctx.lineTo(x + TILE - 2, by + TILE - 2); ctx.lineTo(x + 2, by + TILE - 2); ctx.stroke();
        ctx.fillStyle = "rgba(70, 40, 10, 0.4)";
        for (const c of [[x + 5, by + 5], [x + TILE - 5, by + 5], [x + 5, by + TILE - 5], [x + TILE - 5, by + TILE - 5]]) {
          ctx.beginPath(); ctx.arc(c[0], c[1], 1.6, 0, Math.PI * 2); ctx.fill();
        }
        // A slow pulse in the symbol's opacity — reads as faintly magical
        // rather than a dead flat icon.
        ctx.globalAlpha = 0.7 + Math.sin(elapsedInLevel * 3 + x * 0.05) * 0.15;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "700 18px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isStar ? "★" : "?", x + TILE / 2, by + TILE / 2 + 1);
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

  // Habib's home at the end of the stage — a domed mud-brick desert hut
  // with an arched doorway, matching the old-kingdom look of the rest of
  // the world rather than borrowing any particular game's end-of-level
  // building.
  function drawHut() {
    const h = hutRect();
    const x = h.x - camX;
    if (x + h.w < -40 || x > WIDTH + 40) return;
    const groundY = GROUND_ROW * TILE;

    // Body
    const body = ctx.createLinearGradient(x, h.y, x, groundY);
    body.addColorStop(0, "#d7a866");
    body.addColorStop(1, "#9c6f3c");
    ctx.fillStyle = body;
    ctx.fillRect(x, h.y + 26, h.w, h.h - 26);
    ctx.strokeStyle = "rgba(70, 42, 16, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, h.y + 26.5, h.w - 1, h.h - 27);

    // Mud-brick coursing
    ctx.strokeStyle = "rgba(90, 55, 22, 0.28)";
    for (let by = h.y + 40; by < groundY - 4; by += 14) {
      ctx.beginPath(); ctx.moveTo(x + 3, by); ctx.lineTo(x + h.w - 3, by); ctx.stroke();
    }

    // Domed roof
    const dome = ctx.createLinearGradient(x, h.y - 6, x, h.y + 30);
    dome.addColorStop(0, "#e8c489");
    dome.addColorStop(1, "#b98a4e");
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.ellipse(x + h.w / 2, h.y + 28, h.w / 2 + 4, 34, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(70, 42, 16, 0.45)";
    ctx.stroke();

    // Little finial on top
    ctx.fillStyle = "#e0b866";
    ctx.beginPath(); ctx.arc(x + h.w / 2, h.y - 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a5a2e";
    ctx.fillRect(x + h.w / 2 - 1.5, h.y - 8, 3, 12);

    // Arched doorway — the dark opening Habib walks into
    const doorW = 34, doorH = 54;
    const dx = x + h.w / 2 - doorW / 2;
    const dy = groundY - doorH;
    const doorGrad = ctx.createLinearGradient(dx, dy, dx, groundY);
    doorGrad.addColorStop(0, "#2a1608");
    doorGrad.addColorStop(1, "#120a04");
    ctx.fillStyle = doorGrad;
    ctx.beginPath();
    ctx.moveTo(dx, groundY);
    ctx.lineTo(dx, dy + doorW / 2);
    ctx.arc(dx + doorW / 2, dy + doorW / 2, doorW / 2, Math.PI, 0);
    ctx.lineTo(dx + doorW, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 58, 24, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // A small arched window either side, warm-lit from within
    ctx.fillStyle = "rgba(255, 198, 108, 0.85)";
    for (const wx of [x + 18, x + h.w - 26]) {
      ctx.beginPath();
      ctx.moveTo(wx, h.y + 74);
      ctx.lineTo(wx, h.y + 60);
      ctx.arc(wx + 4, h.y + 60, 4, Math.PI, 0);
      ctx.lineTo(wx + 8, h.y + 74);
      ctx.closePath();
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
      } else if (p.kind === "debris") {
        ctx.save();
        ctx.translate(sx, p.y);
        ctx.rotate(p.life * 6);
        ctx.fillStyle = "#96491f";
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
    }
  }

  // An original power-up — a gold-capped, teal-spotted mushroom rather
  // than a reskin of the classic red-and-white one — that grows Habib a
  // size up when touched.
  function drawMushroom(m) {
    const sx = m.x + m.w / 2 - camX;
    const sy = m.y + m.h;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = "#f0e6c8";
    ctx.fillRect(-6, -11, 12, 11);
    const g = ctx.createRadialGradient(-4, -16, 2, 0, -13, 17);
    g.addColorStop(0, "#ffd97a"); g.addColorStop(1, "#c47a1f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -11, 14, 12, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 70, 10, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, -11, 14, 12, 0, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = "#3fa89a";
    for (const s of [[-7, -17, 2.4], [6, -19, 2], [0, -10, 1.8], [10, -8, 1.6], [-11, -9, 1.6]]) {
      ctx.beginPath(); ctx.arc(s[0], s[1], s[2], 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawMushrooms() {
    for (const m of mushrooms) {
      if (m.taken || !m.alive) continue;
      const sx = m.x - camX;
      if (sx < -30 || sx > WIDTH + 30) continue;
      drawMushroom(m);
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
    if (finishSeq.alpha < 1) ctx.globalAlpha = finishSeq.alpha; // fading into the hut doorway
    if (pipeSeq.alpha < 1) ctx.globalAlpha = pipeSeq.alpha;     // fading through the exit pipe
    ctx.translate(sx + player.w / 2, player.y + player.h - bob);
    // Swimming tilts him nose-up on the rise of a stroke and nose-down as
    // he sinks, which is most of what sells "in water" at a glance.
    if (isUnderwater() && !player.onGround) {
      ctx.rotate(player.facing * Math.max(-0.32, Math.min(0.3, player.vy / 900)));
    }
    // Driven by the current size TIER (big/small), not the live hitbox
    // height, so squatting — which also shrinks player.h — reads as a
    // squash (see squatSquash below) rather than as shrinking a whole
    // size tier down.
    const tierH = player.big ? PLAYER_H_BIG : PLAYER_H;
    const sizeMult = tierH / SPRITE_REF_H;
    const squatSquash = player.squatting ? 0.68 : 1;
    ctx.scale(player.facing * 0.076 * sizeMult, 0.076 * sizeMult * player.squash * squatSquash);
    if (starTimer > 0) {
      ctx.filter = `hue-rotate(${Math.floor(elapsedInLevel * 600) % 360}deg) saturate(1.6)`;
    }

    let legA, legB;
    if (isUnderwater() && !player.onGround) {
      // A flutter kick on its own fast cycle, deliberately out of step with
      // the arm stroke below so the whole animation reads as busy.
      const kick = Math.sin(player.swimKick * 13);
      legA = { dx: -8 + kick * 10, dy: -12 - kick * 7 };
      legB = { dx: 10 - kick * 10, dy: -6 + kick * 7 };
    } else if (!player.onGround) {
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

  // Moving platforms — a weathered stone slab hung on chains from off-screen
  // above, an original look rather than a bare floating rectangle.
  function drawMovers() {
    for (const mv of movers) {
      const x = mv.x - camX, y = mv.y;
      if (x + mv.w < -20 || x > WIDTH + 20) continue;
      // A warm-lit slab, bright enough to read clearly against both the
      // dark castle backdrop and the glowing lava it floats above.
      const g = ctx.createLinearGradient(x, y, x, y + mv.h);
      g.addColorStop(0, "#cbb9a0"); g.addColorStop(0.4, "#8f7a63"); g.addColorStop(1, "#5b4a3a");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, mv.w, mv.h);
      ctx.fillStyle = "rgba(255, 235, 200, 0.55)";
      ctx.fillRect(x, y, mv.w, 3);
      ctx.strokeStyle = "rgba(30, 18, 10, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, mv.w - 1, mv.h - 1);
      for (let cx = x + 8; cx < x + mv.w; cx += 16) {
        ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx, y + mv.h - 1); ctx.stroke();
      }
      // A soft under-glow from the lava it's hovering over.
      const underGlow = ctx.createLinearGradient(x, y + mv.h, x, y + mv.h + 10);
      underGlow.addColorStop(0, "rgba(255, 140, 40, 0.35)");
      underGlow.addColorStop(1, "rgba(255, 140, 40, 0)");
      ctx.fillStyle = underGlow;
      ctx.fillRect(x, y + mv.h, mv.w, 10);
      // Chain links hinting it's suspended, anchored off-screen above.
      ctx.strokeStyle = "rgba(210, 195, 170, 0.6)";
      ctx.lineWidth = 1.5;
      for (const cx of [x + 6, x + mv.w - 6]) {
        ctx.beginPath();
        for (let ly = y - 22; ly < y; ly += 7) { ctx.moveTo(cx, ly); ctx.lineTo(cx, ly + 5); }
        ctx.stroke();
      }
    }
  }

  // Embers — an original molten-imp creature (glowing core, tiny angry
  // face, a wisping tail), not the classic fireball reskinned.
  function drawEmbers() {
    for (const em of embers) {
      if (!em.alive) continue;
      const x = em.x - camX, y = em.y;
      if (x < -30 || x > WIDTH + 30) continue;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 18);
      glow.addColorStop(0, "rgba(255, 230, 150, 0.7)");
      glow.addColorStop(1, "rgba(255, 120, 30, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();

      const core = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 9);
      core.addColorStop(0, "#fff2c2"); core.addColorStop(0.5, "#ff9d3f"); core.addColorStop(1, "#c8401a");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#2a0e04";
      ctx.beginPath(); ctx.arc(x - 3, y - 1, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 3, y - 1, 1.3, 0, Math.PI * 2); ctx.fill();

      // A wispy trailing tail, pointed opposite the current direction of travel.
      ctx.fillStyle = "rgba(255, 140, 40, 0.55)";
      const tailDir = em.vy < 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 6 * tailDir);
      ctx.quadraticCurveTo(x, y + (6 + 14) * tailDir, x + 5, y + 6 * tailDir);
      ctx.closePath();
      ctx.fill();
    }
  }

  function render() {
    drawBackground();
    ctx.save();
    drawWorld();
    drawHut();
    drawExitPipe();
    drawMovers();
    drawPipes();
    drawEmbers();
    drawCoins();
    drawMushrooms();
    drawEnemies();
    drawFish();
    drawMonsterAndPrincess();
    drawPlayer();
    drawParticles();
    drawBubbles();
    drawWaterOverlay();
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
