const MAX_GUESSES = 6;
let clubs = [];
let target = null;
let guesses = [];
let gameOver = false;

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

fetch('clubs.json')
  .then(r => r.json())
  .then(data => {
    clubs = data;
    target = pickDaily(clubs);
    landingNumber.textContent = `No. ${getDayNumber()}`;
    loadState();
  });

function pickDaily(list) {
  const epoch = new Date(2025, 0, 1).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor((today.getTime() - epoch) / 86400000);
  return list[((dayIndex % list.length) + list.length) % list.length];
}

function getDayNumber() {
  const epoch = new Date(2025, 0, 1).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - epoch) / 86400000);
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

// ── Guess logic ──
guessBtn.addEventListener('click', submitGuess);

function submitGuess() {
  if (gameOver) return;
  const name = input.value.trim();
  if (!name) return;

  const club = clubs.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!club) { showToast('Not a valid club'); return; }
  if (guesses.includes(club.name)) { showToast('Already guessed'); return; }

  guesses.push(club.name);
  input.value = '';
  acList.classList.add('hidden');

  renderGuessRow(club);

  if (club.name === target.name) {
    endGame(true);
  } else if (guesses.length >= MAX_GUESSES) {
    endGame(false);
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

  if (won) {
    resultMessage.textContent = `🎉 ${target.name}! Got it in ${guesses.length}/${MAX_GUESSES}`;
  } else {
    resultMessage.textContent = `The answer was ${target.countryFlag} ${target.name}`;
  }
  resultContainer.classList.remove('hidden');
  updateStats(won);
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

  let cta;
  if (won && guesses.length <= 2) {
    cta = `Think you can match that? 👀`;
  } else if (won) {
    cta = `Can you beat my score? ⚽`;
  } else {
    cta = `Can you crack today's club? ⚽`;
  }

  const text = [
    `⚽ Footle #${dayNum} — ${result}`,
    ``,
    rows,
    ``,
    cta,
    `▶️ andersonish.github.io/footle`
  ].join('\n');

  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
});

// ── Stats ──
function getStats() {
  return JSON.parse(localStorage.getItem('footle-stats') || '{"played":0,"won":0,"streak":0,"maxStreak":0}');
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
  localStorage.setItem('footle-stats', JSON.stringify(s));
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
  const state = { day: getDayNumber(), guesses, gameOver };
  localStorage.setItem('footle-state', JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem('footle-state');
  if (!raw) return;
  const state = JSON.parse(raw);
  if (state.day !== getDayNumber()) {
    localStorage.removeItem('footle-state');
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
