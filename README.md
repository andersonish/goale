# ⚽ Footle

A daily Wordle-style guessing game for European football clubs. Six chances to identify today's club using letter feedback and attribute hints.

## How to Play

1. Type a club name and submit your guess
2. Each letter is color-coded:
   - **Green** — right letter, right spot
   - **Yellow** — right letter, wrong spot
   - **Gray** — letter not in the name
3. Four attribute hints help narrow it down:
   - **League** — green = exact, yellow = right country wrong league, red = wrong
   - **Founded** — year with arrow pointing toward the answer
   - **Stadium** — capacity with arrow pointing toward the answer
   - **Name** — how many of your letters match the answer

## Data

329 clubs across 18 European leagues, including second divisions for England, Spain, Germany, Italy, France, and Norway.

## Tech

Static site — no backend, no build step. Just HTML, CSS, and vanilla JS.

- Daily puzzle seeded from date (deterministic, no server needed)
- Game state and stats persisted in localStorage
- Retro pixel-art design with Press Start 2P and VT323 fonts

## Run Locally

```bash
cd footle
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)
