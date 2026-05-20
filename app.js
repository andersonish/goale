const MAX_GUESSES = 6;
const SHUFFLE_VERSION = 3;
const EPOCH = new Date(2026, 4, 18).getTime();
let clubs = [];
let target = null;
let guesses = [];
let gameOver = false;
let hintUsed = false;
let patternUsed = false;
let shuffledCache = null;

// ── 8-bit Sound Effects ──
const SFX = {
  ctx: null,
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },
  tone(freq, duration, type = 'square', vol = 0.15, delay = 0) {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(this.ctx.currentTime + delay);
    osc.stop(this.ctx.currentTime + delay + duration);
  },
  guess() {
    this.tone(520, 0.08);
    this.tone(680, 0.08, 'square', 0.12, 0.07);
  },
  error() {
    this.tone(180, 0.15, 'sawtooth', 0.12);
    this.tone(140, 0.15, 'sawtooth', 0.1, 0.1);
  },
  win() {
    [523, 659, 784, 880, 1047].forEach((f, i) =>
      this.tone(f, 0.15, 'square', 0.12, i * 0.12)
    );
  },
  lose() {
    [400, 350, 280].forEach((f, i) =>
      this.tone(f, 0.25, 'triangle', 0.1, i * 0.2)
    );
  }
};

// ── Landing page ──
const landing = document.getElementById('landing');
const gameView = document.getElementById('game');
const playBtn = document.getElementById('play-btn');
const landingHelpBtn = document.getElementById('landing-help-btn');
const landingDate = document.getElementById('landing-date');
const landingNumber = document.getElementById('landing-number');

const input = document.getElementById('club-input');
const guessBtn = document.getElementById('guess-btn');
const guessesContainer = document.getElementById('guesses-container');
const acList = document.getElementById('autocomplete-list');
const resultContainer = document.getElementById('result-container');
const resultMessage = document.getElementById('result-message');
const shareBtn = document.getElementById('share-btn');
const helpBtn = document.getElementById('help-btn');
const statsBtn = document.getElementById('stats-btn');
const helpModal = document.getElementById('help-modal');
const statsModal = document.getElementById('stats-modal');
const progressBar = document.getElementById('progress-bar');
const hintBtn = document.getElementById('hint-btn');
const patternBtn = document.getElementById('pattern-btn');

// Set landing date
const today = new Date();
landingDate.textContent = today.toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

function showGame() {
  landing.classList.add('hidden');
  gameView.classList.remove('hidden');
  input.focus();
}

playBtn.addEventListener('click', showGame);
landingHelpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('logo-btn').addEventListener('click', () => {
  gameView.classList.add('hidden');
  landing.classList.remove('hidden');
});

fetch('clubs.json?v=7')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(data => {
    clubs = data;
    target = pickDaily(clubs);
    landingNumber.textContent = `No. ${getDayNumber()}`;
    renderProgress();
    showYesterday();
    showLandingStreak();
    loadState();
  })
  .catch(() => showToast('Failed to load — try refreshing'));

function getShuffled() {
  if (!shuffledCache) shuffledCache = shuffleWithVariety(clubs);
  return shuffledCache;
}

function pickDaily(list) {
  const shuffled = getShuffled();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor((today.getTime() - EPOCH) / 86400000);
  return shuffled[((dayIndex % shuffled.length) + shuffled.length) % shuffled.length];
}

function shuffleWithVariety(list) {
  function seededRandom(seed) {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  }
  const rng = seededRandom(382);
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const result = [copy.shift()];
  while (copy.length) {
    const lastLeague = result[result.length - 1].league;
    const idx = copy.findIndex(c => c.league !== lastLeague);
    if (idx >= 0) {
      result.push(copy.splice(idx, 1)[0]);
    } else {
      result.push(copy.shift());
    }
  }
  return result;
}

function getDayNumber() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - EPOCH) / 86400000) + 1;
}

function showYesterday() {
  const dayNum = getDayNumber();
  if (dayNum <= 1) return;
  const shuffled = getShuffled();
  const yesterdayIndex = dayNum - 2;
  const club = shuffled[((yesterdayIndex % shuffled.length) + shuffled.length) % shuffled.length];
  const el = document.getElementById('yesterday');
  el.textContent = `YESTERDAY: ${club.countryFlag} ${club.name}`;
  el.classList.remove('hidden');
}

function showLandingStreak() {
  const s = getStats();
  if (s.streak < 2) return;
  const el = document.getElementById('landing-streak');
  el.textContent = `🔥 ${s.streak}-DAY STREAK`;
  el.classList.remove('hidden');
}

// ── Progress bar ──
function renderProgress() {
  progressBar.innerHTML = '';
  for (let i = 0; i < MAX_GUESSES; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i < guesses.length) {
      const won = guesses[i] === target.name;
      dot.classList.add(won ? 'correct' : 'used');
    }
    progressBar.appendChild(dot);
  }
}

// ── Letter matching (Wordle algorithm) ──
function matchLetters(guess, answer) {
  const g = guess.toUpperCase().split('');
  const a = answer.toUpperCase().split('');
  const maxLen = Math.max(g.length, a.length);
  const result = [];
  const answerUsed = new Array(a.length).fill(false);

  // pad guess to answer length with empty slots if shorter
  while (g.length < a.length) g.push('');

  // pass 1: exact matches
  for (let i = 0; i < maxLen; i++) {
    if (i < a.length && g[i] === a[i]) {
      result[i] = { char: g[i], status: 'correct' };
      answerUsed[i] = true;
    } else {
      result[i] = { char: g[i] || '', status: null };
    }
  }

  // pass 2: wrong position
  for (let i = 0; i < g.length; i++) {
    if (result[i].status) continue;
    if (g[i] === '' || g[i] === ' ') { result[i].status = 'space'; continue; }

    let found = false;
    for (let j = 0; j < a.length; j++) {
      if (!answerUsed[j] && a[j] === g[i]) {
        found = true;
        answerUsed[j] = true;
        break;
      }
    }
    result[i].status = found ? 'close' : 'wrong';
  }

  // handle spaces in the guess
  for (let i = 0; i < result.length; i++) {
    if (result[i].char === ' ') result[i].status = 'space';
  }

  return result.slice(0, guess.length);
}

// ── Autocomplete ──
let acIndex = -1;

input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  acIndex = -1;
  if (q.length < 2) { acList.classList.add('hidden'); return; }

  const matches = clubs
    .filter(c => c.name.toLowerCase().includes(q))
    .filter(c => !guesses.includes(c.name))
    .slice(0, 8);

  if (!matches.length) { acList.classList.add('hidden'); return; }

  acList.innerHTML = matches.map(c =>
    `<div class="ac-item" data-name="${c.name}">
      <span class="ac-flag">${c.countryFlag}</span>
      <span>${c.name}</span>
      <span class="ac-league">${c.league}</span>
    </div>`
  ).join('');
  acList.classList.remove('hidden');

  acList.querySelectorAll('.ac-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      input.value = item.dataset.name;
      acList.classList.add('hidden');
    });
  });
});

input.addEventListener('keydown', e => {
  const items = acList.querySelectorAll('.ac-item');
  if (!items.length || acList.classList.contains('hidden')) {
    if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    updateAcHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, 0);
    updateAcHighlight(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (acIndex >= 0) {
      input.value = items[acIndex].dataset.name;
      acList.classList.add('hidden');
      acIndex = -1;
    } else {
      submitGuess();
    }
  } else if (e.key === 'Escape') {
    acList.classList.add('hidden');
  }
});

function updateAcHighlight(items) {
  items.forEach((it, i) => it.classList.toggle('active', i === acIndex));
}

input.addEventListener('blur', () => setTimeout(() => acList.classList.add('hidden'), 150));

// ── Hint ──
hintBtn.addEventListener('click', () => {
  if (hintUsed || gameOver) return;
  hintUsed = true;
  hintBtn.classList.add('hidden');
  SFX.tone(440, 0.1, 'square', 0.1);
  SFX.tone(550, 0.1, 'square', 0.1, 0.08);
  const leagueKnown = guesses.some(n => {
    const c = clubs.find(cl => cl.name === n);
    return c && c.league === target.league;
  });
  if (leagueKnown) {
    const firstChar = target.name[0].toUpperCase();
    showToast(`FIRST LETTER: ${firstChar}`);
  } else {
    showToast(`${target.countryFlag} ${target.league}`);
  }
  saveState();
});

// ── Pattern hint ──
patternBtn.addEventListener('click', () => {
  if (patternUsed || gameOver) return;
  patternUsed = true;
  patternBtn.classList.add('hidden');
  SFX.tone(330, 0.1, 'square', 0.1);
  SFX.tone(440, 0.1, 'square', 0.1, 0.08);
  SFX.tone(550, 0.1, 'square', 0.1, 0.16);
  const revealed = target.name.split('').map((ch, i) => {
    if (ch === ' ') return true;
    return guesses.some(g => {
      const letters = matchLetters(g, target.name);
      return letters[i] && letters[i].status === 'correct';
    });
  });
  const unrevealed = revealed.map((r, i) => r ? -1 : i).filter(i => i >= 0);
  if (unrevealed.length > 0 && revealed.filter(r => r).length <= 1) {
    const shuffled = unrevealed.slice().sort(() => Math.random() - 0.5);
    const count = Math.min(3, shuffled.length);
    for (let k = 0; k < count; k++) revealed[shuffled[k]] = true;
  }
  const pattern = target.name.split('').map((ch, i) =>
    ch === ' ' ? ' ' : revealed[i] ? ch.toUpperCase() : '_'
  ).join(' ');
  showToast(pattern);
  saveState();
});

// ── Guess logic ──
guessBtn.addEventListener('click', submitGuess);

function submitGuess() {
  if (gameOver) return;
  const name = input.value.trim();
  if (!name) return;

  const club = clubs.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!club) { SFX.error(); showToast('Not a valid club'); return; }
  if (guesses.includes(club.name)) { SFX.error(); showToast('Already guessed'); return; }

  guesses.push(club.name);
  input.value = '';
  input.blur();
  acList.classList.add('hidden');

  renderGuessRow(club);
  renderProgress();

  if (club.name === target.name) {
    endGame(true);
  } else if (guesses.length >= MAX_GUESSES) {
    endGame(false);
  } else {
    SFX.guess();
    if (guesses.length >= 4 && !hintUsed) {
      hintBtn.classList.remove('hidden');
    }
    if (guesses.length >= 5 && !patternUsed) {
      patternBtn.classList.remove('hidden');
    }
  }

  saveState();
}

function renderGuessRow(club) {
  const row = document.createElement('div');
  row.className = 'guess-row';

  // Letter tiles
  const letters = matchLetters(club.name, target.name);
  const letterRow = document.createElement('div');
  letterRow.className = 'letter-row';
  letters.forEach(l => {
    const tile = document.createElement('div');
    tile.className = `letter-tile ${l.status}`;
    tile.textContent = l.status === 'space' ? '' : l.char;
    letterRow.appendChild(tile);
  });
  row.appendChild(letterRow);

  // Attribute hints
  const countryMatch = club.country === target.country;
  const leagueMatch = club.league === target.league;
  const leagueStatus = leagueMatch ? 'correct' : countryMatch ? 'close' : 'wrong';
  const foundedDiff = club.founded - target.founded;
  const foundedStatus = foundedDiff === 0 ? 'correct' : 'wrong';
  const stadiumDiff = club.stadiumCapacity - target.stadiumCapacity;
  const stadiumStatus = stadiumDiff === 0 ? 'correct' : 'wrong';
  const foundedArrow = foundedDiff === 0 ? '' : foundedDiff > 0 ? '&#9660;' : '&#9650;';
  const stadiumArrow = stadiumDiff === 0 ? '' : stadiumDiff > 0 ? '&#9660;' : '&#9650;';
  const stadiumDisplay = club.stadiumCapacity >= 1000
    ? Math.round(club.stadiumCapacity / 1000) + 'k'
    : club.stadiumCapacity;

  const answerLen = target.name.replace(/\s/g, '').length;
  const matchCount = letters.filter(l => l.status === 'correct' || l.status === 'close').length;
  const nameStatus = matchCount === answerLen ? 'correct' : matchCount > 0 ? 'close' : 'wrong';

  const hints = document.createElement('div');
  hints.className = 'hints-row';
  hints.innerHTML = `
    <div class="hint-pill ${leagueStatus}">
      <span class="label">${club.countryFlag} LEAGUE</span>
      <span class="value">${club.league}</span>
    </div>
    <div class="hint-pill ${foundedStatus}">
      <span class="label">FOUNDED</span>
      <span class="value">${club.founded} ${foundedArrow}</span>
    </div>
    <div class="hint-pill ${stadiumStatus}">
      <span class="label">STADIUM</span>
      <span class="value">${stadiumDisplay} ${stadiumArrow}</span>
    </div>
    <div class="hint-pill ${nameStatus}">
      <span class="label">NAME</span>
      <span class="value">${matchCount}/${answerLen} LETTERS</span>
    </div>
  `;
  row.appendChild(hints);

  guessesContainer.appendChild(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function endGame(won) {
  gameOver = true;
  input.disabled = true;
  guessBtn.disabled = true;
  hintBtn.classList.add('hidden');
  patternBtn.classList.add('hidden');

  if (won) {
    resultMessage.textContent = `🎉 ${target.name}! Got it in ${guesses.length}/${MAX_GUESSES}`;
    SFX.win();
    launchConfetti();
  } else {
    resultMessage.textContent = `The answer was ${target.countryFlag} ${target.name}`;
    SFX.lose();
  }
  resultContainer.classList.remove('hidden');
  updateStats(won);
  startCountdown();
}

function startCountdown() {
  const cd = document.getElementById('countdown');
  function tick() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const diff = tomorrow - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    cd.textContent = `NEXT GOALE IN ${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── Share ──
shareBtn.addEventListener('click', () => {
  const dayNum = getDayNumber();
  const won = guesses[guesses.length - 1] === target.name;
  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const result = won ? `✅ Solved in ${score}` : `❌ Failed ${score}`;
  const answerLen = target.name.replace(/\s/g, '').length;

  const rows = guesses.map((name, i) => {
    const club = clubs.find(c => c.name === name);
    const countryMatch = club.country === target.country;
    const leagueMatch = club.league === target.league;
    const foundedDiff = club.founded - target.founded;
    const stadiumDiff = club.stadiumCapacity - target.stadiumCapacity;
    const nameLetters = matchLetters(club.name, target.name);
    const matchCount = nameLetters.filter(l => l.status === 'correct' || l.status === 'close').length;

    const nameCol = matchCount === answerLen ? '✅' : `${matchCount}L`;
    const leagueCol = leagueMatch ? '✅' : countryMatch ? '🟨' : '❌';
    const foundedCol = foundedDiff === 0 ? '✅' : foundedDiff > 0 ? '⬇️' : '⬆️';
    const stadiumCol = stadiumDiff === 0 ? '✅' : stadiumDiff > 0 ? '⬇️' : '⬆️';

    return `${i + 1}) ${nameCol} ${leagueCol} ${foundedCol} ${stadiumCol}`;
  }).join('\n');

  const reviews = won ? [
    guesses.length === 1 ? `Scout's dream. One look was enough. 🏆` :
    guesses.length === 2 ? `Clinical finish. No time wasted. 🎯` :
    guesses.length === 3 ? `Solid scouting report. Well played. 📋` :
    guesses.length === 4 ? `Took some digging, but got there. 🔍` :
    guesses.length === 5 ? `Squeezed it in. Nervy finish. 😅` :
    `Last-minute winner. Pure drama. 🥵`
  ] : [`Transfer window closed. Better luck tomorrow. 📝`];

  const stats = getStats();
  const streakLine = stats.streak > 0 ? `🔥 Streak: ${stats.streak}` : '';

  const hintTag = (hintUsed ? ' 💡' : '') + (patternUsed ? ' 🔍' : '');
  const blank = `​`;
  const lines = [
    `⚽ Goale #${dayNum} — ${result}${hintTag}`,
    `Guess the European football club in 6 tries`,
    blank,
    `    🔤  🏴  📅  🏟️`,
    rows,
    blank,
    reviews[0],
  ];
  if (streakLine) lines.push(streakLine);
  lines.push(blank, `▶️ https://goale.app`);
  const text = lines.join('\n');

  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
  }
});

// ── Stats ──
function getStats() {
  return JSON.parse(localStorage.getItem('goale-stats') || '{"played":0,"won":0,"streak":0,"maxStreak":0}');
}

function updateStats(won) {
  const s = getStats();
  s.played++;
  if (won) {
    s.won++;
    s.streak++;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
  } else {
    s.streak = 0;
  }
  localStorage.setItem('goale-stats', JSON.stringify(s));
  renderStats();
}

function renderStats() {
  const s = getStats();
  document.getElementById('stat-played').textContent = s.played;
  document.getElementById('stat-won').textContent = s.won;
  document.getElementById('stat-streak').textContent = s.streak;
  document.getElementById('stat-max').textContent = s.maxStreak;
}

// ── State persistence ──
function saveState() {
  const state = { day: getDayNumber(), guesses, gameOver, hintUsed, patternUsed, sv: SHUFFLE_VERSION };
  localStorage.setItem('goale-state', JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem('goale-state');
  if (!raw) return;
  const state = JSON.parse(raw);
  if (state.day !== getDayNumber()) {
    localStorage.removeItem('goale-state');
    return;
  }
  if ((state.sv || 1) !== SHUFFLE_VERSION) {
    localStorage.removeItem('goale-state');
    return;
  }
  showGame();
  state.guesses.forEach(name => {
    const club = clubs.find(c => c.name === name);
    if (club) {
      guesses.push(name);
      renderGuessRow(club);
    }
  });
  renderProgress();
  if (state.hintUsed) hintUsed = true;
  if (state.patternUsed) patternUsed = true;
  if (!state.gameOver && guesses.length >= 4 && !hintUsed) {
    hintBtn.classList.remove('hidden');
  }
  if (!state.gameOver && guesses.length >= 5 && !patternUsed) {
    patternBtn.classList.remove('hidden');
  }
  if (state.gameOver) {
    gameOver = true;
    input.disabled = true;
    guessBtn.disabled = true;
    const won = guesses[guesses.length - 1] === target.name;
    if (won) {
      resultMessage.textContent = `🎉 ${target.name}! Got it in ${guesses.length}/${MAX_GUESSES}`;
    } else {
      resultMessage.textContent = `The answer was ${target.countryFlag} ${target.name}`;
    }
    resultContainer.classList.remove('hidden');
  }
  renderStats();
}

// ── Modals ──
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
statsBtn.addEventListener('click', () => { renderStats(); statsModal.classList.remove('hidden'); });

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// ── Confetti ──
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#00E676','#FFB300','#FF5252','#2979FF','#fff'];
  const pieces = Array.from({length: 80}, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * Math.PI * 2,
    rv: (Math.random() - 0.5) * 0.2
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.rv;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (alive && frame < 300) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(draw);
}

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  t.offsetHeight;
  t.style.animation = '';
  setTimeout(() => t.classList.add('hidden'), 2000);
}
