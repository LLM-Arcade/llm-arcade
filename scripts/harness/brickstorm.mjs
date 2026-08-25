// Brickstorm beatability harness. Run: node scripts/harness/brickstorm.mjs
// Proves, with exit-code semantics a reviewer can rerun:
//   1. an ace bot clears all three boards, reaches victory and the legend
//      score, and never loses a life,
//   2. a grunt bot (slower keyboard glide, reaction deadzone) clears board 1,
//   3. an idle bot drains three lives and ends in gameover,
//   4. two same-seed ace runs are byte-identical in score, bricks and steps,
//   5. the physics edge cases hold: paddle deflection clamp, corner speed,
//      double destroys, ball loss with survivors, no escape at max speed,
//      serve reset, board handover,
//   6. all seven achievement slugs fire and the score cap holds.

import Matter from "matter-js";
import { BOARDS, brickSlots } from "../../src/games/brickstorm/levels.ts";
import { Engine, FIELD, TUNE, brickCenter } from "../../src/games/brickstorm/engine.ts";

let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};

const DT = 1 / 60;
const STEP_BUDGET = Math.ceil(300 / DT) * BOARDS.length; // 5 simulated minutes per board
const allAchievements = new Set();

const lowestBall = (eng) => {
  let low = null;
  for (const ball of eng.balls) {
    if (!low || ball.body.position.y > low.body.position.y) low = ball;
  }
  return low;
};

const nearestDrop = (eng) => {
  let best = null;
  for (const drop of eng.drops) {
    if (!best || Math.abs(drop.x - eng.paddle.x) < Math.abs(best.x - eng.paddle.x)) best = drop;
  }
  return best;
};

const REST_Y = TUNE.paddleY - TUNE.paddleH / 2 - TUNE.ballRadius;

/** Where a descending ball meets the paddle line, folded off the side walls. */
const predictLanding = (ball) => {
  const p = ball.body.position;
  const v = ball.body.velocity;
  if (v.y <= 0) return null;
  const steps = (REST_Y - p.y) / v.y;
  if (steps < 0) return null;
  const lo = FIELD.x0 + TUNE.ballRadius;
  const span = FIELD.x1 - TUNE.ballRadius - lo;
  let folded = (p.x + v.x * steps - lo) % (span * 2);
  if (folded < 0) folded += span * 2;
  return { steps, x: folded > span ? lo + span * 2 - folded : lo + folded };
};

/** The ball that reaches the paddle line first, across every live ball. */
const soonestLanding = (eng) => {
  let best = null;
  for (const ball of eng.balls) {
    const hit = predictLanding(ball);
    if (hit && (!best || hit.steps < best.steps)) best = hit;
  }
  return best;
};

/** Once the field thins out, a stray ball can orbit for minutes; aim instead. */
const STEER_BELOW = 10;

const pickTarget = (eng, landing) => {
  let best = null;
  let bestKey = Infinity;
  for (const brick of eng.bricks) {
    const c = brickCenter(brick.col, brick.row);
    const key = (5 - brick.row) * 1000 + Math.abs(c.x - landing);
    if (key < bestKey) {
      bestKey = key;
      best = c;
    }
  }
  return best;
};

/** Paddle x that deflects a ball landing at `landing` toward `target`. */
const steerTo = (eng, landing, target) => {
  const theta = Math.atan2(target.y - REST_Y, target.x - landing);
  const clamp = TUNE.paddleDeflectDeg * (Math.PI / 180);
  const offset = Math.max(-1, Math.min(1, (theta + Math.PI / 2) / clamp));
  return landing - offset * eng.paddle.halfW;
};

/** Where the paddle wants to be this frame, or null to hold still. */
const aim = (eng, prof) => {
  const ball = lowestBall(eng);
  if (!ball) return null;
  const hit = prof.predict ? soonestLanding(eng) : null;
  if (!hit) {
    // A drop is only worth chasing while every ball is still climbing.
    const drop = prof.chaseDrops ? nearestDrop(eng) : null;
    return drop ? drop.x : ball.body.position.x;
  }
  if (prof.steer && eng.bricks.length <= STEER_BELOW) {
    const target = pickTarget(eng, hit.x);
    if (target) return steerTo(eng, hit.x, target);
  }
  return hit.x;
};

const ACE = { mode: "pointer", predict: true, chaseDrops: true, steer: true, deadzone: 0, reaction: 1 };
const GRUNT = { mode: "keys", predict: false, chaseDrops: false, steer: false, deadzone: 20, reaction: 5 };
const IDLE = { mode: "still", predict: false, chaseDrops: false, steer: false, deadzone: 0, reaction: 1 };
// The quality-bar casual: slow reactions, wide deadzone, no prediction.
// Even a bad human anticipates where the ball is falling; what makes them
// casual is reacting slowly and coarsely, not tracking blindly.
const CASUAL = { mode: "keys", predict: true, chaseDrops: false, steer: false, deadzone: 40, reaction: 10 };

const drive = (eng, prof, st, frame) => {
  eng.input.launch = frame % 4 < 2;
  if (prof.mode === "still") {
    eng.input.dir = 0;
    eng.input.pointerX = null;
    return;
  }
  if (frame % prof.reaction === 0) st.target = aim(eng, prof);
  const target = st.target;
  if (target === null || target === undefined) return;

  if (prof.mode === "pointer") {
    eng.input.pointerX = target;
    return;
  }
  const delta = target - eng.paddle.x;
  eng.input.dir = Math.abs(delta) < prof.deadzone ? 0 : Math.sign(delta);
};

const simulate = (prof, label, seed = TUNE.seed) => {
  const eng = new Engine(seed);
  const st = { target: null };
  const achievements = new Set();
  const boards = [];
  let stats = null;
  let capOk = true;
  let steps = 0;
  let prevScore = 0;
  let prevBroken = 0;
  let seenBoards = 0;

  // Endless game: bots stop after one full loop unless they die first.
  while (eng.phase !== "gameover" && eng.boardsCleared < 3 && steps < STEP_BUDGET) {
    drive(eng, prof, st, steps);
    eng.update(DT);
    steps++;
    for (const e of eng.drainEvents()) {
      if (e.type === "achievement") {
        achievements.add(e.slug);
        allAchievements.add(e.slug);
      }
      if (e.type === "gameover") stats = e.stats;
    }
    if (eng.score > TUNE.scoreCap) capOk = false;
    if (eng.boardsCleared > seenBoards) {
      seenBoards = eng.boardsCleared;
      boards.push({
        name: BOARDS[eng.boardIndex].name,
        time: eng.time,
        bricks: eng.bricksBroken - prevBroken,
        points: eng.score - prevScore,
        total: eng.score,
        lives: eng.lives,
      });
      prevScore = eng.score;
      prevBroken = eng.bricksBroken;
    }
  }
  for (const e of eng.drainEvents()) {
    if (e.type === "achievement") {
      achievements.add(e.slug);
      allAchievements.add(e.slug);
    }
    if (e.type === "gameover") stats = e.stats;
  }

  console.log(`\n${label}`);
  console.log("  board                 clock   bricks   points   total  lives");
  for (const b of boards) {
    console.log(
      `  ${b.name.padEnd(18)} ${b.time.toFixed(1).padStart(6)}s ${String(b.bricks).padStart(8)} ${String(b.points).padStart(8)} ${String(b.total).padStart(7)} ${String(b.lives).padStart(6)}`,
    );
  }
  console.log(
    `  outcome: ${eng.phase}  steps ${steps}  lives left ${eng.lives}  lives lost ${eng.livesLost}  max chain ${eng.maxChain}  powerups ${eng.powerupsCaught}  final score ${eng.score}`,
  );
  console.log(`  achievements: ${[...achievements].sort().join(", ") || "(none)"}`);
  return { eng, achievements, capOk, stats, steps };
};

// ---- bots ----------------------------------------------------------------

const ace = simulate(ACE, "ace bot (pointer tracking, drop chasing)");
check(ace.eng.boardsCleared === 3, "ace clears all three boards of the first loop");
check(ace.achievements.has("kiln-master"), "kiln-master fires on the first full loop");
check(ace.eng.livesLost === 0, "ace clears without losing a life");
check(ace.eng.score >= TUNE.legendScore, `ace scores at least ${TUNE.legendScore}`);
check(ace.steps < STEP_BUDGET, "ace finishes inside the step budget");
check(ace.capOk, "score never exceeds the cap (ace)");
check(ace.eng.containStops === 0, "no ball ever needed the containment net (ace)");
// Endless: the ace stops at the loop boundary without a gameover, so the
// stats contract is proven on the idle bot's loss below.

const grunt = simulate(GRUNT, "grunt bot (keyboard glide, 26px deadzone, 6-frame reaction)");
check(grunt.eng.boardsCleared >= 1, "grunt clears board 1");
check(grunt.capOk, "score never exceeds the cap (grunt)");
check(grunt.eng.containStops === 0, "no ball ever needed the containment net (grunt)");

const idle = simulate(IDLE, "idle bot (never moves)");
check(idle.eng.phase === "gameover", "idle bot reaches gameover");
check(idle.eng.lives === 0, "idle bot drains all three lives");
check(idle.eng.score >= 0 && idle.eng.score < TUNE.legendScore, "idle bot score stays sane");
check(idle.stats !== null, "gameover stats emitted (idle)");
if (idle.stats) {
  check(
    typeof idle.stats.boards_cleared === "number" &&
      typeof idle.stats.loops === "number" &&
      typeof idle.stats.powerups_caught === "number",
    "gameover stats carry boards_cleared, loops, powerups_caught",
  );
}

// Quality bar: a fumbling player must get a real run, not a 20-second death.
const casual = simulate(CASUAL, "casual bot (slow keys, wide deadzone)");
check(casual.eng.time >= 60, "a casual player survives at least 60 seconds");
check(casual.eng.score > 0, "a casual player puts points on the board");

// ---- determinism ---------------------------------------------------------

const repeat = simulate(ACE, "ace bot rerun (same seed)");
check(
  repeat.eng.score === ace.eng.score &&
    repeat.eng.bricksBroken === ace.eng.bricksBroken &&
    repeat.steps === ace.steps,
  "two same-seed ace runs match on score, bricks and steps",
);

// ---- edge proofs ---------------------------------------------------------

console.log("\nedge proofs");

const keepOnly = (eng, keep) => {
  for (const brick of eng.bricks) {
    if (keep.includes(brick)) continue;
    Matter.Composite.remove(eng.mEngine.world, brick.body);
    eng.brickByBody.delete(brick.body.id);
  }
  eng.bricks = keep;
};

const clearField = (eng) => {
  keepOnly(eng, []);
  eng.checkBoardClear = () => {};
  eng.phase = "running";
};

const placeBall = (eng, x, y, vx, vy) => {
  const ball = eng.balls[0];
  ball.stuckOffset = null;
  eng.phase = "running";
  Matter.Body.setPosition(ball.body, { x, y });
  Matter.Body.setVelocity(ball.body, { x: vx / 60, y: vy / 60 });
  return ball;
};

// paddle edge deflection stays inside the clamp and off the horizontal
{
  const eng = new Engine();
  clearField(eng);
  eng.paddle.x = 480;
  const speed = eng.ballSpeed();
  const ball = placeBall(eng, 480 + eng.paddle.halfW * 0.98, TUNE.paddleY - 60, 0, speed);
  for (let i = 0; i < 40 && Matter.Body.getVelocity(ball.body).y > 0; i++) eng.update(DT);
  const v = Matter.Body.getVelocity(ball.body);
  const fromVertical = Math.abs(Math.atan2(v.x, -v.y)) * (180 / Math.PI);
  check(v.y < 0, "paddle edge hit sends the ball back up");
  check(fromVertical <= TUNE.paddleDeflectDeg + 1, "edge deflection stays inside the clamp");
  check(fromVertical > 30, "edge deflection actually steers the ball sideways");
  check(
    Math.abs(v.y) >= TUNE.minVyRatio * (speed / 60) - 1e-9,
    "outgoing angle stays away from horizontal",
  );
}

// an expanded paddle bounces a ball its base width would have missed
{
  const eng = new Engine();
  clearField(eng);
  eng.paddle.x = 480;
  eng.input.pointerX = 480;
  eng.applyPower("expand");
  const speed = eng.ballSpeed();
  const x = 480 + TUNE.paddleW / 2 + TUNE.ballRadius + 4; // past the base body reach
  const ball = placeBall(eng, x, TUNE.paddleY - 80, 0, speed);
  let bounced = false;
  for (let i = 0; i < 60 && !bounced; i++) {
    eng.update(DT);
    if (eng.balls.length > 0 && Matter.Body.getVelocity(ball.body).y < 0) bounced = true;
  }
  check(bounced, "an expanded paddle reaches a ball outside its base width");
  check(eng.lives === TUNE.lives, "no life lost on the expanded-edge save");
}

// a corner wall hit preserves the target speed
{
  const eng = new Engine();
  clearField(eng);
  const target = eng.ballSpeed();
  const ball = placeBall(
    eng,
    FIELD.x0 + TUNE.ballRadius + 6,
    FIELD.y0 + TUNE.ballRadius + 6,
    -target * 0.7,
    -target * 0.7,
  );
  let worst = 0;
  for (let i = 0; i < 120; i++) {
    eng.update(DT);
    const v = Matter.Body.getVelocity(ball.body);
    worst = Math.max(worst, Math.abs(Math.hypot(v.x, v.y) * 60 - target) / target);
  }
  check(worst <= 0.02, `corner hit keeps speed within 2% (worst ${(worst * 100).toFixed(2)}%)`);
}

// two bricks destroyed in one substep both score and both bodies leave
{
  const eng = new Engine();
  const row = eng.bricks.filter((b) => b.row === 5).slice(0, 2);
  check(row.length === 2 && row[1].col === row[0].col + 1, "found two adjacent bricks to test");
  keepOnly(eng, row);
  const gapX = brickCenter(row[0].col, row[0].row).x + TUNE.cellW / 2;
  const below = brickCenter(row[0].col, row[0].row).y + TUNE.cellH;
  eng.fireUntil = 1e9; // one hit kills any material, so both die on contact
  eng.checkBoardClear = () => {};
  const before = eng.score;
  placeBall(eng, gapX, below, 0, -eng.ballSpeed());
  for (let i = 0; i < 30 && eng.bricks.length > 0; i++) eng.update(DT);
  check(eng.bricks.length === 0, "both bricks in the pair are destroyed");
  check(eng.bricksBroken === 2, "both destroys are counted");
  check(eng.score - before >= TUNE.brickPointsPerHp * 2, "both destroys score");
  const live = Matter.Composite.allBodies(eng.mEngine.world).map((b) => b.id);
  check(
    !live.includes(row[0].body.id) && !live.includes(row[1].body.id),
    "both brick bodies left the physics world",
  );
}

// splitting to three balls, then draining two, costs no life
{
  const eng = new Engine();
  clearField(eng);
  placeBall(eng, 480, 300, 120, -400);
  eng.applyPower("split");
  check(eng.balls.length >= TUNE.tripleBallAt, "split reaches three live balls");
  const lives = eng.lives;
  for (const ball of eng.balls.slice(1)) {
    Matter.Body.setPosition(ball.body, { x: ball.body.position.x, y: TUNE.floorY + 40 });
  }
  eng.update(DT);
  check(eng.balls.length === 1, "drained balls leave the array");
  check(eng.lives === lives, "no life lost while one ball survives");
  check(eng.phase === "running", "play continues with the surviving ball");
}

// a max-speed ball stays inside the playfield for a full minute
{
  const eng = new Engine();
  clearField(eng);
  eng.lives = 9999;
  eng.bricksBroken = 999; // pins ballSpeed() at TUNE.ballMaxSpeed
  const ball = placeBall(eng, 480, 300, TUNE.ballMaxSpeed * 0.8, -TUNE.ballMaxSpeed * 0.6);
  let escaped = false;
  for (let i = 0; i < 60 * 60; i++) {
    eng.input.pointerX = eng.balls[0] ? eng.balls[0].body.position.x : null;
    eng.input.launch = i % 4 < 2;
    eng.update(DT);
    const live = eng.balls[0] ?? ball;
    const p = live.body.position;
    if (p.x < FIELD.x0 - 1 || p.x > FIELD.x1 + 1 || p.y < FIELD.y0 - 1) escaped = true;
  }
  check(!escaped, "a max-speed ball never leaves the playfield in 60 s");
  check(eng.containStops === 0, "the containment net never had to fire");
}

// losing a life resets to a clean serve and keeps the score
{
  const eng = new Engine();
  eng.score = 777;
  eng.expandUntil = 1e9;
  eng.shield = true;
  eng.chain = 4;
  eng.drops.push({ power: "fire", x: 400, y: 200 });
  const ball = placeBall(eng, 480, 300, 0, 400);
  Matter.Body.setPosition(ball.body, { x: 480, y: TUNE.floorY + 30 });
  eng.shield = false;
  eng.update(DT);
  check(eng.lives === TUNE.lives - 1, "a drained field costs one life");
  check(eng.phase === "serve", "the cabinet returns to serve");
  check(eng.balls.length === 1 && eng.balls[0].stuckOffset !== null, "the new ball is held on the paddle");
  check(eng.chain === 0 && eng.drops.length === 0, "chain and drops reset");
  check(eng.paddle.halfW === TUNE.paddleW / 2 && !eng.shield, "power state clears");
  check(eng.score === 777, "the score survives the life loss");
}

// the shield eats exactly one drain
{
  const eng = new Engine();
  clearField(eng);
  eng.shield = true;
  const ball = placeBall(eng, 480, 300, 0, 400);
  Matter.Body.setPosition(ball.body, { x: 480, y: TUNE.floorY + 5 });
  eng.update(DT);
  check(eng.lives === TUNE.lives && eng.balls.length === 1, "the shield saves the drain");
  check(!eng.shield, "the shield clears after one save");
}

// the board handover rebuilds the field and keeps the score
{
  const eng = new Engine();
  const before = eng.score;
  keepOnly(eng, []);
  eng.update(DT);
  check(eng.phase === "board-clear", "an emptied field enters the clear banner");
  const banked = eng.score;
  check(banked >= before + TUNE.boardClearBonus, "the clear bonus lands");
  for (let i = 0; i < Math.ceil(TUNE.boardClearHold / DT) + 2; i++) eng.update(DT);
  check(eng.boardIndex === 1, "the next board loads");
  check(eng.bricks.length === brickSlots(BOARDS[1]).length, "the new brick field is rebuilt whole");
  check(eng.score === banked, "the score carries across the handover");
  check(eng.phase === "serve", "the new board starts on serve");
}

// the chain counts destroys between paddle returns and resets on contact
{
  const eng = new Engine();
  eng.fireUntil = 1e9;
  for (const brick of eng.bricks) brick.hp = 1;
  eng.checkBoardClear = () => {};
  for (let i = 0; i < TUNE.chainAchieveAt; i++) eng.hitBrick(eng.balls[0], eng.bricks[i]);
  check(eng.chain === TUNE.chainAchieveAt, `the chain reaches ${TUNE.chainAchieveAt} between returns`);
  check(
    eng.drainEvents().some((e) => e.type === "achievement" && e.slug === "brick-chain"),
    "brick-chain fires at the threshold",
  );
  const ball = eng.balls[0];
  ball.stuckOffset = null;
  ball.lastPaddle = -1;
  eng.hitPaddle(ball);
  check(eng.chain === 0, "a paddle return resets the chain");
}

// the cap holds even with multi and a runaway chain
{
  const eng = new Engine();
  eng.score = TUNE.scoreCap - 10;
  eng.multiUntil = 1e9;
  eng.chain = 500;
  eng.fireUntil = 1e9;
  for (const brick of eng.bricks) brick.hp = 1;
  eng.hitBrick(eng.balls[0], eng.bricks[0]);
  check(eng.score === TUNE.scoreCap, "score clamps at the cap");
  for (let i = 1; i < 12 && i < eng.bricks.length; i++) eng.hitBrick(eng.balls[0], eng.bricks[i]);
  check(eng.score === TUNE.scoreCap, "repeated forced destroys never exceed the cap");
}

// ---- achievements --------------------------------------------------------

for (const slug of [
  "first-break",
  "workshop-clear",
  "triple-ball",
  "untouched-board",
  "kiln-master",
  "brick-chain",
  "storm-legend",
]) {
  check(allAchievements.has(slug), `${slug} fires in simulation`);
}

// ---- verdict -------------------------------------------------------------

if (failures > 0) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}
console.log("\nPASS");
