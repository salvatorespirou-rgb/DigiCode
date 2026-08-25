// Flappy Dragon — a Flappy Bird–style game. Keep the dragon airborne through
// the gaps in the castle pylons. Spacebar (or tap/click) to flap.
(function () {
  const canvas = document.getElementById("dragonCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const GRAVITY = 1500; // px/s^2
  const FLAP_VELOCITY = -440; // px/s
  const MAX_FALL_SPEED = 720; // px/s
  const PYLON_SPEED = 190; // px/s
  const PYLON_GAP = 185; // px, vertical gap the dragon flies through
  const PYLON_WIDTH = 76;
  const PYLON_SPACING = 260; // horizontal distance between pylon pairs
  const DRAGON_X = WIDTH * 0.28;
  const DRAGON_RADIUS = 19;
  const GROUND_HEIGHT = 34;
  const COIN_RADIUS = 12;
  const COIN_VALUE = 5; // bonus on top of the +1 per pylon passed

  const scoreEl = document.getElementById("dragonScore");
  const bestEl = document.getElementById("dragonBest");
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

  let state = "start"; // start | playing | gameover
  let dragonY, dragonVY, wingPhase, pylons, coins, distanceSinceSpawn, score, lastScoredIndex;
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
    if (scoreEl) scoreEl.textContent = "0";
  }

  // A coin sits at the centre of each pylon's gap — collecting one rewards
  // flying the accurate line through the middle, and it can never overlap
  // the stonework since it's placed inside the open gap by construction.
  function spawnPylon() {
    const margin = 60;
    const gapCenter = margin + PYLON_GAP / 2 + Math.random() * (HEIGHT - GROUND_HEIGHT - margin * 2 - PYLON_GAP);
    const pylonX = WIDTH + PYLON_WIDTH;
    pylons.push({ x: pylonX, gapCenter, scored: false });
    coins.push({ x: pylonX + PYLON_WIDTH / 2, y: gapCenter, collected: false });
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
  }

  async function endGame() {
    state = "gameover";
    const beatOwnBest = score > best;
    if (beatOwnBest) {
      best = score;
      if (bestEl) bestEl.textContent = best;
    }

    if (playerId && playerEditKey) {
      if (beatOwnBest) {
        showOverlay("gameover", "New Best!", `Score: <strong>${score}</strong> — that's a new personal best, ${escapeHtml(playerName || "")}!`);
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
        showOverlay("gameover", "You Crashed!", `Score: <strong>${score}</strong> · Your best: <strong>${best}</strong>`);
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
  // never actually reaches the canvas itself. "click" (not pointerdown/
  // touchstart) so scrolling the page with a finger that happens to start
  // over the game never gets mistaken for a flap — click only fires for a
  // genuine tap, never for a touch that becomes a drag. Clicks inside the
  // registration form are excluded so typing a name or picking a photo
  // doesn't restart the game out from under you.
  const stage = document.querySelector(".dragon-game-stage");
  stage?.addEventListener("click", (e) => {
    if (e.target.closest("#dragonRegisterForm")) return;
    flap();
  });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function update(dt) {
    dragonVY = Math.min(dragonVY + GRAVITY * dt, MAX_FALL_SPEED);
    dragonY += dragonVY * dt;
    wingPhase += dt * 14;

    distanceSinceSpawn += PYLON_SPEED * dt;
    if (distanceSinceSpawn >= PYLON_SPACING) {
      distanceSinceSpawn = 0;
      spawnPylon();
    }

    for (const p of pylons) {
      p.x -= PYLON_SPEED * dt;
      if (!p.scored && p.x + PYLON_WIDTH < DRAGON_X - DRAGON_RADIUS) {
        p.scored = true;
        score++;
        if (scoreEl) scoreEl.textContent = String(score);
      }
    }
    pylons = pylons.filter((p) => p.x > -PYLON_WIDTH);

    for (const c of coins) {
      c.x -= PYLON_SPEED * dt;
      if (!c.collected) {
        const dx = c.x - DRAGON_X;
        const dy = c.y - dragonY;
        if (Math.sqrt(dx * dx + dy * dy) < COIN_RADIUS + DRAGON_RADIUS) {
          c.collected = true;
          score += COIN_VALUE;
          if (scoreEl) scoreEl.textContent = String(score);
        }
      }
    }
    coins = coins.filter((c) => !c.collected && c.x > -COIN_RADIUS);

    if (dragonY - DRAGON_RADIUS < 0) {
      dragonY = DRAGON_RADIUS;
      dragonVY = 0;
    }
    if (dragonY + DRAGON_RADIUS > HEIGHT - GROUND_HEIGHT) {
      dragonY = HEIGHT - GROUND_HEIGHT - DRAGON_RADIUS;
      endGame();
      return;
    }

    for (const p of pylons) {
      const withinX = DRAGON_X + DRAGON_RADIUS > p.x && DRAGON_X - DRAGON_RADIUS < p.x + PYLON_WIDTH;
      if (!withinX) continue;
      const gapTop = p.gapCenter - PYLON_GAP / 2;
      const gapBottom = p.gapCenter + PYLON_GAP / 2;
      if (dragonY - DRAGON_RADIUS < gapTop || dragonY + DRAGON_RADIUS > gapBottom) {
        endGame();
        return;
      }
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#3d2c5e");
    sky.addColorStop(0.45, "#d8617a");
    sky.addColorStop(0.75, "#f2915a");
    sky.addColorStop(1, "#ffc884");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Sun.
    const sunY = HEIGHT * 0.42;
    const sunGlow = ctx.createRadialGradient(WIDTH * 0.7, sunY, 4, WIDTH * 0.7, sunY, 90);
    sunGlow.addColorStop(0, "rgba(255, 225, 170, 0.9)");
    sunGlow.addColorStop(1, "rgba(255, 225, 170, 0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(WIDTH * 0.7 - 90, sunY - 90, 180, 180);
    ctx.fillStyle = "#fff1cf";
    ctx.beginPath();
    ctx.arc(WIDTH * 0.7, sunY, 34, 0, Math.PI * 2);
    ctx.fill();

    // Distant castle silhouette.
    ctx.fillStyle = "rgba(58, 30, 46, 0.55)";
    ctx.fillRect(0, HEIGHT - GROUND_HEIGHT - 80, WIDTH, 80);
    for (let x = 10; x < WIDTH; x += 52) {
      ctx.fillRect(x, HEIGHT - GROUND_HEIGHT - 104, 12, 24);
    }

    // Ground.
    const groundGrad = ctx.createLinearGradient(0, HEIGHT - GROUND_HEIGHT, 0, HEIGHT);
    groundGrad.addColorStop(0, "#6b3f38");
    groundGrad.addColorStop(1, "#3a2320");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, GROUND_HEIGHT);
    ctx.fillStyle = "rgba(255, 200, 132, 0.4)";
    ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, 3);
  }

  function drawPylon(p) {
    const gapTop = p.gapCenter - PYLON_GAP / 2;
    const gapBottom = p.gapCenter + PYLON_GAP / 2;
    const stone = ctx.createLinearGradient(p.x, 0, p.x + PYLON_WIDTH, 0);
    stone.addColorStop(0, "#6b6459");
    stone.addColorStop(0.5, "#8c8375");
    stone.addColorStop(1, "#6b6459");

    // Top tower.
    ctx.fillStyle = stone;
    ctx.fillRect(p.x, 0, PYLON_WIDTH, gapTop);
    drawCrenellations(p.x, gapTop, PYLON_WIDTH, true);

    // Bottom tower.
    ctx.fillRect(p.x, gapBottom, PYLON_WIDTH, HEIGHT - GROUND_HEIGHT - gapBottom);
    drawCrenellations(p.x, gapBottom - 12, PYLON_WIDTH, false);

    // Mortar lines for a stone-block feel.
    ctx.strokeStyle = "rgba(40, 30, 25, 0.35)";
    ctx.lineWidth = 1;
    for (let y = 16; y < gapTop; y += 24) {
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + PYLON_WIDTH, y);
      ctx.stroke();
    }
    for (let y = gapBottom + 16; y < HEIGHT - GROUND_HEIGHT; y += 24) {
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + PYLON_WIDTH, y);
      ctx.stroke();
    }
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

  // A simple, clearly-flapping dragon: one wing that swings on a hinge at the
  // shoulder (a real rotation, not just a wobble) so the flap always reads.
  function drawDragon() {
    ctx.save();
    ctx.translate(DRAGON_X, dragonY);
    const tilt = Math.max(-0.35, Math.min(0.8, dragonVY / 650));
    ctx.rotate(tilt);

    // Wing swings from raised (flap up, just after a jump) to trailing low.
    const wingSwing = (Math.sin(wingPhase) * 0.5 + 0.5); // 0..1
    const wingAngle = -1.1 + wingSwing * 1.3; // radians

    ctx.save();
    ctx.translate(-6, -2);
    ctx.rotate(wingAngle);
    ctx.fillStyle = "#e05a3a";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-4, -18, -18, -22);
    ctx.quadraticCurveTo(-8, -8, 0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Body.
    const bodyGrad = ctx.createRadialGradient(-4, -5, 2, 0, 0, DRAGON_RADIUS);
    bodyGrad.addColorStop(0, "#ffb26b");
    bodyGrad.addColorStop(1, "#e0522f");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, DRAGON_RADIUS, DRAGON_RADIUS * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snout.
    ctx.fillStyle = "#e0522f";
    ctx.beginPath();
    ctx.moveTo(DRAGON_RADIUS - 5, -3);
    ctx.lineTo(DRAGON_RADIUS + 11, 0);
    ctx.lineTo(DRAGON_RADIUS - 5, 7);
    ctx.closePath();
    ctx.fill();

    // Single small horn.
    ctx.fillStyle = "#7a2e1c";
    ctx.beginPath();
    ctx.moveTo(0, -DRAGON_RADIUS + 3);
    ctx.lineTo(4, -DRAGON_RADIUS - 9);
    ctx.lineTo(7, -DRAGON_RADIUS + 4);
    ctx.closePath();
    ctx.fill();

    // Eye.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(7, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1810";
    ctx.beginPath();
    ctx.arc(8.5, -5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Glow.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(DRAGON_X, dragonY, 2, DRAGON_X, dragonY, DRAGON_RADIUS * 2.2);
    glow.addColorStop(0, "rgba(255, 140, 80, 0.35)");
    glow.addColorStop(1, "rgba(255, 140, 80, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(DRAGON_X, dragonY, DRAGON_RADIUS * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCoin(c) {
    // A cheap "spinning" look: squash the ellipse's width with a sine wave.
    const spin = Math.abs(Math.sin(performance.now() / 260 + c.x * 0.04));
    const rx = COIN_RADIUS * (0.25 + spin * 0.75);
    ctx.save();
    ctx.translate(c.x, c.y);
    const coinGrad = ctx.createRadialGradient(-rx * 0.3, -COIN_RADIUS * 0.3, 1, 0, 0, COIN_RADIUS);
    coinGrad.addColorStop(0, "#fff3c4");
    coinGrad.addColorStop(1, "#f0a04b");
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, COIN_RADIUS, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c97b1f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawBackground();
    for (const c of coins) drawCoin(c);
    for (const p of pylons) drawPylon(p);
    drawDragon();
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
        <span class="leaderboard-score">${row.best_score}</span>
      </div>`;
      })
      .join("");
  }

  resetGame();
  render();
  showOverlay("start", "Flappy Dragon", "Keep the dragon airborne through the castle pylons.");
  loadOwnBest();
  loadLeaderboard();
})();
