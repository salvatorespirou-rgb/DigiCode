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

  const scoreEl = document.getElementById("dragonScore");
  const bestEl = document.getElementById("dragonBest");
  const overlay = document.getElementById("dragonOverlay");
  const overlayTitle = document.getElementById("dragonOverlayTitle");
  const overlayBody = document.getElementById("dragonOverlayBody");
  const nameForm = document.getElementById("dragonNameForm");
  const nameInput = document.getElementById("dragonNameInput");
  const startHint = document.getElementById("dragonStartHint");

  const BEST_KEY = "veloraFlappyDragonBest";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (bestEl) bestEl.textContent = best;

  let state = "start"; // start | playing | gameover
  let dragonY, dragonVY, wingPhase, pylons, distanceSinceSpawn, score, lastScoredIndex;
  let lastTime = null;
  let lastScoreRowId = null;

  function resetGame() {
    dragonY = HEIGHT / 2;
    dragonVY = 0;
    wingPhase = 0;
    pylons = [];
    distanceSinceSpawn = PYLON_SPACING; // spawn one immediately
    score = 0;
    lastScoredIndex = -1;
    if (scoreEl) scoreEl.textContent = "0";
  }

  function spawnPylon() {
    const margin = 60;
    const gapCenter = margin + PYLON_GAP / 2 + Math.random() * (HEIGHT - GROUND_HEIGHT - margin * 2 - PYLON_GAP);
    pylons.push({ x: WIDTH + PYLON_WIDTH, gapCenter, scored: false });
  }

  // Spacebar is the only control needed to play, so the score always saves
  // itself the moment the run ends — nothing blocks a restart. The name field
  // is a non-blocking, optional extra: type a name any time before the next
  // flap and it updates the score you just set.
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
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      if (bestEl) bestEl.textContent = best;
    }
    showOverlay(
      "gameover",
      "Crashed!",
      `Score: <strong>${score}</strong> · Best: <strong>${best}</strong> — saved to this month's leaderboard as Anonymous.`
    );

    lastScoreRowId = null;
    try {
      const { data } = await veloraSupabase.from("game_scores").insert({ score }).select().single();
      lastScoreRowId = data?.id ?? null;
      await loadLeaderboard();
    } catch (err) {
      // Leaderboard being unreachable shouldn't block replaying.
    }
  }

  function showOverlay(mode, title, bodyHtml) {
    if (!overlay) return;
    overlay.hidden = false;
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayBody) overlayBody.innerHTML = bodyHtml;
    if (nameForm) nameForm.hidden = mode !== "gameover";
    if (startHint) startHint.hidden = mode !== "start";
  }

  function hideOverlay() {
    if (overlay) overlay.hidden = true;
  }

  nameForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (nameInput.value || "").trim().slice(0, 24);
    if (!name || !lastScoreRowId) return;
    const submitBtn = nameForm.querySelector("button");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }

    try {
      await veloraSupabase.from("game_scores").update({ player_name: name }).eq("id", lastScoreRowId);
      await loadLeaderboard();
      if (overlayBody) {
        overlayBody.innerHTML = `Score: <strong>${score}</strong> · Best: <strong>${best}</strong> — saved as ${escapeHtml(name)}.`;
      }
    } catch (err) {
      // Non-critical — the anonymous entry is already on the board.
    }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Name"; }
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

  canvas.addEventListener("pointerdown", flap);

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

  function render() {
    drawBackground();
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
    const monthEl = document.getElementById("dragonLeaderboardMonth");
    if (!listEl) return;
    if (monthEl) monthEl.textContent = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await veloraSupabase
      .from("game_scores")
      .select("player_name, score, created_at")
      .gte("created_at", startOfMonth.toISOString())
      .order("score", { ascending: false })
      .limit(10);

    if (error || !data || !data.length) {
      listEl.innerHTML = `<p class="dev-empty">No scores yet this month — be the first.</p>`;
      return;
    }

    listEl.innerHTML = data
      .map(
        (row, i) => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank">#${i + 1}</span>
        <span class="leaderboard-name">${escapeHtml(row.player_name)}</span>
        <span class="leaderboard-score">${row.score}</span>
      </div>`
      )
      .join("");
  }

  resetGame();
  render();
  showOverlay("start", "Flappy Dragon", "Keep the dragon airborne through the castle pylons.");
  loadLeaderboard();
})();
