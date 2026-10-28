import './style.css';

const COLUMNS = 10;
const ROWS = 20;
const CELL = 30;

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Matrix = number[][];
type Piece = { type: PieceType; matrix: Matrix; x: number; y: number };

const SHAPES: Record<PieceType, Matrix> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

const COLORS: Record<PieceType, [string, string]> = {
  I: ['#39d8ef', '#1199c4'], O: ['#ffd166', '#e89a35'], T: ['#b78aff', '#8053d6'],
  S: ['#63e6a4', '#28aa78'], Z: ['#ff6b85', '#d83c65'], J: ['#5b9cff', '#3864d8'], L: ['#ffad61', '#e5773b'],
};

const gameCanvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const holdCanvas = document.querySelector<HTMLCanvasElement>('#hold-canvas')!;
const nextCanvas = document.querySelector<HTMLCanvasElement>('#next-canvas')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const overlayKicker = document.querySelector<HTMLSpanElement>('#overlay-kicker')!;
const overlayTitle = document.querySelector<HTMLElement>('#overlay-title')!;
const overlayCopy = document.querySelector<HTMLSpanElement>('#overlay-copy')!;
const overlayButton = document.querySelector<HTMLButtonElement>('#overlay-button')!;
const scoreElement = document.querySelector<HTMLElement>('#score')!;
const bestElement = document.querySelector<HTMLElement>('#best')!;
const levelElement = document.querySelector<HTMLElement>('#level')!;
const linesElement = document.querySelector<HTMLElement>('#lines')!;
const holdStatus = document.querySelector<HTMLElement>('#hold-status')!;

if (!gameCanvas || !holdCanvas || !nextCanvas || !overlay || !overlayKicker || !overlayTitle || !overlayCopy || !overlayButton || !scoreElement || !bestElement || !levelElement || !linesElement || !holdStatus) {
  throw new Error('The game UI is incomplete.');
}

const context = gameCanvas.getContext('2d')!;
const holdContext = holdCanvas.getContext('2d')!;
const nextContext = nextCanvas.getContext('2d')!;
if (!context || !holdContext || !nextContext) throw new Error('Canvas rendering is unavailable.');

let board = createBoard();
let bag: PieceType[] = [];
let upcoming: PieceType[] = [];
let active = createPiece(drawFromBag());
let held: PieceType | null = null;
let canHold = true;
let score = 0;
let lines = 0;
let level = 1;
let best = readBest();
let paused = false;
let gameOver = false;
let lastDrop = 0;
let animationFrame = 0;

function createBoard(): (PieceType | null)[][] {
  return Array.from({ length: ROWS }, () => Array<PieceType | null>(COLUMNS).fill(null));
}

function refillBag(): void {
  const types = Object.keys(SHAPES) as PieceType[];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  bag.push(...types);
}

function drawFromBag(): PieceType {
  if (bag.length === 0) refillBag();
  return bag.pop()!;
}

function createPiece(type: PieceType): Piece {
  const matrix = SHAPES[type].map((row) => [...row]);
  return { type, matrix, x: Math.floor((COLUMNS - matrix[0].length) / 2), y: 0 };
}

function collision(piece: Piece, dx = 0, dy = 0, matrix = piece.matrix): boolean {
  return matrix.some((row, rowIndex) => row.some((value, columnIndex) => {
    if (!value) return false;
    const x = piece.x + columnIndex + dx;
    const y = piece.y + rowIndex + dy;
    return x < 0 || x >= COLUMNS || y >= ROWS || (y >= 0 && board[y][x] !== null);
  }));
}

function fillUpcoming(): void {
  while (upcoming.length < 6) upcoming.push(drawFromBag());
}

function spawnNext(): void {
  fillUpcoming();
  active = createPiece(upcoming.shift()!);
  fillUpcoming();
  canHold = true;
  holdStatus.textContent = 'SAVE FOR LATER';
  if (collision(active)) finishGame();
}

function rotate(matrix: Matrix): Matrix {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]).reverse());
}

function rotateActive(): void {
  if (paused || gameOver) return;
  const rotated = rotate(active.matrix);
  for (const offset of [0, -1, 1, -2, 2]) {
    if (!collision(active, offset, 0, rotated)) {
      active.matrix = rotated;
      active.x += offset;
      return;
    }
  }
}

function move(dx: number, dy: number): boolean {
  if (paused || gameOver || collision(active, dx, dy)) return false;
  active.x += dx;
  active.y += dy;
  if (dy > 0) score += 1;
  return true;
}

function holdPiece(): void {
  if (paused || gameOver || !canHold) return;
  const currentType = active.type;
  if (held) {
    active = createPiece(held);
    held = currentType;
    if (collision(active)) finishGame();
  } else {
    held = currentType;
    spawnNext();
  }
  canHold = false;
  holdStatus.textContent = 'HOLD USED';
}

function hardDrop(): void {
  if (paused || gameOver) return;
  let distance = 0;
  while (!collision(active, 0, 1)) {
    active.y += 1;
    distance += 1;
  }
  score += distance * 2;
  lockPiece();
}

function lockPiece(): void {
  for (let y = 0; y < active.matrix.length; y++) {
    for (let x = 0; x < active.matrix[y].length; x++) {
      if (!active.matrix[y][x]) continue;
      const boardY = active.y + y;
      const boardX = active.x + x;
      if (boardY >= 0) board[boardY][boardX] = active.type;
    }
  }

  let cleared = 0;
  board = board.filter((row) => {
    if (row.every((cell) => cell !== null)) {
      cleared += 1;
      return false;
    }
    return true;
  });
  while (board.length < ROWS) board.unshift(Array<PieceType | null>(COLUMNS).fill(null));

  const rewards = [0, 100, 300, 500, 800];
  if (cleared > 0) {
    score += (rewards[cleared] ?? 800) * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
  }
  updateStats();
  spawnNext();
}

function finishGame(): void {
  gameOver = true;
  best = Math.max(best, score);
  try { localStorage.setItem('vector-blocks-best', String(best)); } catch { /* Storage can be unavailable in private browsing. */ }
  showOverlay('RUN COMPLETE', 'That was a good one.', 'Every great run starts with another.', 'PLAY AGAIN', restart);
  updateStats();
}

function readBest(): number {
  try {
    const saved = Number(localStorage.getItem('vector-blocks-best'));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

function updateStats(): void {
  scoreElement.textContent = String(score).padStart(6, '0');
  bestElement.textContent = String(best).padStart(6, '0');
  levelElement.textContent = String(level).padStart(2, '0');
  linesElement.textContent = String(lines).padStart(2, '0');
}

function showOverlay(kicker: string, title: string, copy: string, buttonText: string, action: () => void): void {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  overlayButton.innerHTML = `${buttonText} <span>→</span>`;
  overlayButton.onclick = action;
  overlay.hidden = false;
}

function togglePause(): void {
  if (gameOver) return;
  paused = !paused;
  if (paused) showOverlay('TAKE A MOMENT', 'Take a breath.', 'Your stack will be right here.', 'RESUME GAME', togglePause);
  else overlay.hidden = true;
  lastDrop = performance.now();
}

function restart(): void {
  board = createBoard();
  bag = [];
  upcoming = [];
  held = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  active = createPiece(drawFromBag());
  fillUpcoming();
  overlay.hidden = true;
  holdStatus.textContent = 'SAVE FOR LATER';
  lastDrop = performance.now();
  updateStats();
}

function paintBlock(ctx: CanvasRenderingContext2D, type: PieceType, x: number, y: number, size: number): void {
  const [light, dark] = COLORS[type];
  const inset = Math.max(1, size * 0.045);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x + inset * 2, y + inset * 2, size - inset * 4, Math.max(1, size * 0.08));
  ctx.fillStyle = 'rgba(8,12,22,0.16)';
  ctx.fillRect(x + inset * 2, y + size - inset * 3, size - inset * 4, Math.max(1, size * 0.06));
}

function drawBoard(): void {
  context.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  context.fillStyle = '#0c101a';
  context.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  context.strokeStyle = 'rgba(145, 163, 194, 0.075)';
  context.lineWidth = 1;
  for (let x = 0; x <= COLUMNS; x++) {
    context.beginPath(); context.moveTo(x * CELL + 0.5, 0); context.lineTo(x * CELL + 0.5, gameCanvas.height); context.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    context.beginPath(); context.moveTo(0, y * CELL + 0.5); context.lineTo(gameCanvas.width, y * CELL + 0.5); context.stroke();
  }

  board.forEach((row, y) => row.forEach((type, x) => { if (type) paintBlock(context, type, x * CELL, y * CELL, CELL); }));

  if (!gameOver) {
    let ghostY = active.y;
    while (!collision(active, 0, ghostY - active.y + 1)) ghostY++;
    active.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (!value || ghostY + y < 0) return;
      const px = (active.x + x) * CELL;
      const py = (ghostY + y) * CELL;
      context.strokeStyle = 'rgba(190, 204, 229, 0.32)';
      context.lineWidth = 1;
      context.strokeRect(px + 3.5, py + 3.5, CELL - 7, CELL - 7);
    }));
    active.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (value) paintBlock(context, active.type, (active.x + x) * CELL, (active.y + y) * CELL, CELL);
    }));
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, types: (PieceType | null)[], slots: number): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#111622';
  ctx.fillRect(0, 0, width, height);
  const slotHeight = height / slots;

  types.slice(0, slots).forEach((type, index) => {
    if (!type) return;
    const matrix = SHAPES[type];
    const tile = Math.min(20, (width - 28) / Math.max(matrix[0].length, matrix.length));
    const shapeWidth = matrix[0].length * tile;
    const shapeHeight = matrix.length * tile;
    const startX = (width - shapeWidth) / 2;
    const startY = index * slotHeight + (slotHeight - shapeHeight) / 2;
    matrix.forEach((row, y) => row.forEach((value, x) => {
      if (value) paintBlock(ctx, type, startX + x * tile, startY + y * tile, tile);
    }));
    if (index > 0) {
      ctx.strokeStyle = 'rgba(145, 163, 194, 0.09)';
      ctx.beginPath(); ctx.moveTo(14, index * slotHeight); ctx.lineTo(width - 14, index * slotHeight); ctx.stroke();
    }
  });
}

function render(time: number): void {
  if (!paused && !gameOver) {
    const interval = Math.max(90, 800 - (level - 1) * 65);
    if (time - lastDrop >= interval) {
      if (!move(0, 1)) lockPiece();
      lastDrop = time;
    }
  }
  drawBoard();
  drawPreview(holdContext, [held], 1);
  drawPreview(nextContext, upcoming.slice(0, 5), 5);
  animationFrame = requestAnimationFrame(render);
}

function handleKey(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' '].includes(key)) event.preventDefault();
  if (key === 'p' || key === 'escape') { togglePause(); return; }
  if (paused || gameOver) {
    if (key === 'enter' && gameOver) restart();
    return;
  }
  switch (key) {
    case 'arrowleft': case 'a': move(-1, 0); break;
    case 'arrowright': case 'd': move(1, 0); break;
    case 'arrowdown': case 's': move(0, 1); break;
    case 'arrowup': case 'x': case 'w': rotateActive(); break;
    case ' ': hardDrop(); break;
    case 'c': case 'shift': holdPiece(); break;
  }
}

window.addEventListener('keydown', handleKey);
document.querySelector('#restart-button')?.addEventListener('click', restart);
document.querySelector('[data-action="left"]')?.addEventListener('click', () => move(-1, 0));
document.querySelector('[data-action="right"]')?.addEventListener('click', () => move(1, 0));
document.querySelector('[data-action="down"]')?.addEventListener('click', () => move(0, 1));
document.querySelector('[data-action="rotate"]')?.addEventListener('click', rotateActive);
document.querySelector('[data-action="drop"]')?.addEventListener('click', hardDrop);
document.querySelector('[data-action="hold"]')?.addEventListener('click', holdPiece);

updateStats();
fillUpcoming();
lastDrop = performance.now();
animationFrame = requestAnimationFrame(render);

window.addEventListener('pagehide', () => cancelAnimationFrame(animationFrame));
