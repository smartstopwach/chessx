/* ============================================
   ChessX — Professional Chess Teaching Studio
   ============================================ */

// Use high-quality unicode chess pieces (for fallback)
const PIECE_FONT = {
  'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
  'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
};

// ============================================
// STATE
// ============================================
function createGame() {
  if (typeof Chess !== 'undefined') {
    try { return new Chess(); } catch (e) {}
  }
  // Fallback stub
  return {
    _board: Array(8).fill(null).map(()=>Array(8).fill(null)),
    _turn: 'w',
    _history: [],
    board() { return this._board; },
    history() { return []; },
    moves() { return []; },
    fen() { return '8/8/8/8/8/8/8/8 w - - 0 1'; },
    in_check() { return false; },
    turn() { return 'w'; },
    move() { return null; },
    undo() { return null; },
    reset() {},
    pgn() { return ''; },
    load() { return null; },
    load_pgn() { return null; },
    get() { return null; }
  };
}

const state = {
  game: createGame(),
  history: [],           // Persistent move history (SAN strings), survives undo/load
  historyIndex: -1,      // Pointer into history: -1 = start, history.length-1 = latest
  position: { fen: '' },
  flipped: false,
  selectedSquare: null,
  currentTool: 'select',
  currentColor: '#ef4444',
  annotations: [],
  arrows: [],
  circles: [],
  highlights: [],
  rectangles: [],
  drawingFrom: null,
  isDrawing: false,
  boardTheme: 'classic',
  pieceStyle: 'alpha',
  boardSize: 640,
  zoom: 1,
  bookmarks: [],
  variations: [],
  currentVariation: 'main',
  puzzle: null,
  puzzleAnswer: null,
  clock: { wTime: 600, bTime: 600, running: false, activeColor: 'w', interval: null },
  layout: 'board',
  uiHidden: false,
  titleHidden: false,
  notesHidden: false,
  clockHidden: false,
  engineHidden: false,
  setupMode: false,
  selectedRackPiece: null,
  deletingMode: false,
  movesListData: [],
  engine: {
    stockfish: null,
    enabled: false,
    evaluating: false,
    depth: 15,
    multipv: 1,
    eval: 0,
    bestMove: '',
    pv: '',
    lines: []
  },
  drag: { active: false, piece: null, from: null }
};

// ============================================
// DOM ELEMENTS
// ============================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  board: $('board'),
  boardSvg: $('boardSvg'),
  boardContainer: $('boardContainer'),
  boardArea: $('boardArea'),
  layout: $('layout'),
  lessonHeader: $('lessonHeader'),
  lessonTitle: $('lessonTitle'),
  lessonSubtitle: $('lessonSubtitle'),
  topbar: $('topbar'),
  movesList: $('movesList'),
  fenInput: $('fenInput'),
  teacherNotes: $('teacherNotes'),
  puzzleInput: $('puzzleInput'),
  puzzleOverlay: $('puzzleOverlay'),
  puzzleQuestion: $('puzzleQuestion'),
  puzzleAnswer: $('puzzleAnswer'),
  puzzleAnswerMove: $('puzzleAnswerMove'),
  toast: $('toast'),
  zoomLevel: $('zoomLevel'),
};

// ============================================
// UTILITIES
// ============================================
function toast(message, type = '') {
  els.toast.textContent = message;
  els.toast.className = 'toast show ' + type;
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => { els.toast.classList.remove('show'); }, 2500);
}

function squareName(r, c) {
  return String.fromCharCode(97 + c) + (8 - r);
}

function squareRC(sq) {
  return { r: 8 - parseInt(sq[1]), c: sq.charCodeAt(0) - 97 };
}

function isLight(r, c) { return (r + c) % 2 === 0; }

function showSquare(name) {
  const { r, c } = squareRC(name);
  return els.board.children[r * 8 + c];
}

// ============================================
// BOARD RENDERING
// ============================================
function renderBoard() {
  els.board.innerHTML = '';
  let board;
  try {
    board = state.game.board();
  } catch (e) {
    console.error('Chess.js not loaded:', e);
    board = Array(8).fill(null).map(() => Array(8).fill(null));
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const sqName = squareName(r, c);
      const light = isLight(r, c);
      sq.className = 'square ' + (light ? 'light' : 'dark');
      sq.dataset.square = sqName;
      sq.dataset.row = r;
      sq.dataset.col = c;

      // Coordinates
      if (state.flipped) {
        if (c === 7) {
          const rank = document.createElement('div');
          rank.className = 'coord rank';
          rank.textContent = 8 - r;
          sq.appendChild(rank);
        }
        if (r === 7) {
          const file = document.createElement('div');
          file.className = 'coord file';
          file.textContent = String.fromCharCode(97 + c);
          sq.appendChild(file);
        }
      } else {
        if (c === 0) {
          const rank = document.createElement('div');
          rank.className = 'coord rank';
          rank.textContent = 8 - r;
          sq.appendChild(rank);
        }
        if (r === 7) {
          const file = document.createElement('div');
          file.className = 'coord file';
          file.textContent = String.fromCharCode(97 + c);
          sq.appendChild(file);
        }
      }

      // Piece
      const piece = board[r][c];
      if (piece) {
        const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
        const p = document.createElement('div');
        p.className = 'piece';
        if (typeof PIECE_SVG !== 'undefined' && PIECE_SVG[key]) {
          p.innerHTML = PIECE_SVG[key];
        } else {
          p.textContent = PIECE_FONT[key];
          p.style.color = piece.color === 'w' ? '#ffffff' : '#1a1a1a';
        }
        sq.appendChild(p);
      }

      els.board.appendChild(sq);
    }
  }
}

function highlightSquares() {
  // Clear previous highlights
  $$('.square').forEach(sq => {
    sq.classList.remove('selected', 'last-move', 'check');
    const md = sq.querySelector('.move-dot'); if (md) md.remove();
    const cd = sq.querySelector('.capture-dot'); if (cd) cd.remove();
  });

  // Last move (highlight from/to of the current move in the persistent history)
  try {
    if (state.historyIndex >= 0 && state.historyIndex < state.history.length) {
      const san = state.history[state.historyIndex];
      const game = new Chess();
      for (let i = 0; i <= state.historyIndex; i++) {
        try { game.move(state.history[i]); } catch (e) {}
      }
      const verbose = game.history({ verbose: true });
      const lastMove = verbose[verbose.length - 1];
      if (lastMove) {
        const fromSq = showSquare(lastMove.from);
        const toSq = showSquare(lastMove.to);
        if (fromSq) fromSq.classList.add('last-move');
        if (toSq) toSq.classList.add('last-move');
      }
    }
  } catch (e) {}

  // Check
  try {
    if (state.game.in_check()) {
      const turn = state.game.turn();
      state.game.board().forEach((row, r) => {
        row.forEach((p, c) => {
          if (p && p.type === 'k' && p.color === turn) {
            const sq = els.board.children[r * 8 + c];
            if (sq) sq.classList.add('check');
          }
        });
      });
    }
  } catch (e) {}

  // Selected square + legal moves
  if (state.selectedSquare) {
    const sel = showSquare(state.selectedSquare);
    if (sel) sel.classList.add('selected');

    try {
      const moves = state.game.moves({ square: state.selectedSquare, verbose: true });
      moves.forEach(m => {
        const sq = showSquare(m.to);
        if (!sq) return;
        if (m.flags.includes('e') || m.flags.includes('c')) {
          const dot = document.createElement('div');
          dot.className = 'capture-dot';
          sq.appendChild(dot);
        } else {
          const dot = document.createElement('div');
          dot.className = 'move-dot';
          sq.appendChild(dot);
        }
      });
    } catch (e) {}
  }
}

// ============================================
// SVG ANNOTATIONS
// ============================================
function renderAnnotations() {
  const svg = els.boardSvg;
  svg.innerHTML = '';

  const rect = els.boardContainer.getBoundingClientRect();
  if (rect.width === 0) return;
  const sqSize = rect.width / 8;
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

  const sqPos = (name) => {
    const { r, c } = squareRC(name);
    return {
      x: (c + 0.5) * sqSize,
      y: (r + 0.5) * sqSize
    };
  };

  const sqTopLeft = (name) => {
    const { r, c } = squareRC(name);
    return { x: c * sqSize, y: r * sqSize };
  };

  if (state.flipped) {
    svg.style.transform = 'rotate(180deg)';
  } else {
    svg.style.transform = 'none';
  }

  // Highlights
  state.highlights.forEach(h => {
    const p = sqTopLeft(h.square);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', p.x);
    r.setAttribute('y', p.y);
    r.setAttribute('width', sqSize);
    r.setAttribute('height', sqSize);
    r.setAttribute('fill', h.color);
    r.setAttribute('class', 'highlight-sq');
    r.dataset.type = 'highlight';
    r.dataset.square = h.square;
    svg.appendChild(r);
  });

  // Rectangles
  state.rectangles.forEach(rc => {
    const a = sqTopLeft(rc.from);
    const b = sqTopLeft(rc.to);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x) + sqSize;
    const h2 = Math.abs(a.y - b.y) + sqSize;
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', h2);
    r.setAttribute('fill', rc.color);
    r.setAttribute('fill-opacity', '0.3');
    r.setAttribute('stroke', rc.color);
    r.setAttribute('stroke-width', '3');
    r.setAttribute('rx', '4');
    r.dataset.type = 'rectangle';
    svg.appendChild(r);
  });

  // Circles
  state.circles.forEach(c => {
    const p = sqPos(c.square);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', sqSize * 0.42);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', c.color);
    circle.setAttribute('stroke-width', '4');
    circle.dataset.type = 'circle';
    circle.dataset.square = c.square;
    svg.appendChild(circle);
  });

  // Arrows
  state.arrows.forEach(a => {
    const from = sqPos(a.from);
    const to = sqPos(a.to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const ux = dx / dist;
    const uy = dy / dist;

    const startOffset = sqSize * 0.45;
    const endOffset = sqSize * 0.30;
    const sx = from.x + ux * startOffset;
    const sy = from.y + uy * startOffset;
    const ex = to.x - ux * endOffset;
    const ey = to.y - uy * endOffset;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const colorHex = a.color.replace('#','');
    defs.innerHTML = `
      <marker id="arrowhead-${colorHex}" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
        <polygon points="0 0, 4 2, 0 4" fill="${a.color}" />
      </marker>
    `;
    svg.appendChild(defs);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', sx);
    line.setAttribute('y1', sy);
    line.setAttribute('x2', ex);
    line.setAttribute('y2', ey);
    line.setAttribute('stroke', a.color);
    line.setAttribute('stroke-width', '6');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#arrowhead-${colorHex})`);
    line.dataset.type = 'arrow';
    svg.appendChild(line);
  });
}

// ============================================
// BOARD INTERACTIONS
// ============================================
function onSquareMouseDown(e) {
  if (!e.target.closest('.square')) return;
  const sq = e.target.closest('.square');
  const sqName = sq.dataset.square;

  if (state.setupMode && state.selectedRackPiece) {
    placePieceOnSetup(sqName);
    return;
  }

  if (state.currentTool === 'arrow' || state.currentTool === 'rectangle') {
    state.drawingFrom = sqName;
    state.isDrawing = true;
    return;
  }

  if (state.currentTool === 'circle') {
    addCircle(sqName);
    return;
  }

  if (state.currentTool === 'highlight') {
    addHighlight(sqName);
    return;
  }

  if (state.currentTool === 'eraser') {
    eraseAnnotationAt(sqName);
    return;
  }

  // Select tool
  if (state.selectedSquare === sqName) {
    state.selectedSquare = null;
    highlightSquares();
    return;
  }

  if (state.selectedSquare) {
    tryMakeMove(state.selectedSquare, sqName);
  } else {
    try {
      const piece = state.game.get(sqName);
      if (piece && piece.color === state.game.turn()) {
        state.selectedSquare = sqName;
        highlightSquares();
      }
    } catch (e) {}
  }
}

function onSquareMouseUp(e) {
  if (!e.target.closest('.square')) return;
  const sq = e.target.closest('.square');
  const sqName = sq.dataset.square;

  if (state.isDrawing && state.drawingFrom) {
    if (state.drawingFrom !== sqName) {
      if (state.currentTool === 'arrow') {
        addArrow(state.drawingFrom, sqName);
      } else if (state.currentTool === 'rectangle') {
        addRectangle(state.drawingFrom, sqName);
      }
    }
    state.drawingFrom = null;
    state.isDrawing = false;
    renderAnnotations();
  }
}

function tryMakeMove(from, to) {
  try {
    const result = state.game.move({ from, to, promotion: 'q' });
    if (result) {
      state.selectedSquare = null;
      // Append the new SAN to our persistent history, dropping any redo branch
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(result.san);
      state.historyIndex = state.history.length - 1;
      renderAll();
      requestEngineEval();
      return true;
    }
  } catch (e) {}
  return false;
}

// ============================================
// ANNOTATION HELPERS
// ============================================
function addArrow(from, to) {
  state.arrows.push({ from, to, color: state.currentColor });
  renderAnnotations();
}

function addCircle(sq) {
  const idx = state.circles.findIndex(c => c.square === sq && c.color === state.currentColor);
  if (idx >= 0) state.circles.splice(idx, 1);
  else state.circles.push({ square: sq, color: state.currentColor });
  renderAnnotations();
}

function addHighlight(sq) {
  const idx = state.highlights.findIndex(h => h.square === sq && h.color === state.currentColor);
  if (idx >= 0) state.highlights.splice(idx, 1);
  else state.highlights.push({ square: sq, color: state.currentColor });
  renderAnnotations();
}

function addRectangle(from, to) {
  state.rectangles.push({ from, to, color: state.currentColor });
  renderAnnotations();
}

function eraseAnnotationAt(sq) {
  state.arrows = state.arrows.filter(a => a.from !== sq && a.to !== sq);
  state.circles = state.circles.filter(c => c.square !== sq);
  state.highlights = state.highlights.filter(h => h.square !== sq);
  state.rectangles = state.rectangles.filter(r => r.from !== sq && r.to !== sq);
  renderAnnotations();
}

function clearAllAnnotations() {
  state.arrows = [];
  state.circles = [];
  state.highlights = [];
  state.rectangles = [];
  renderAnnotations();
}

// ============================================
// TOOL SELECTION
// ============================================
function setTool(tool) {
  state.currentTool = tool;
  $$('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  els.board.style.cursor = (tool === 'arrow' || tool === 'rectangle') ? 'crosshair' :
                           tool === 'eraser' ? 'not-allowed' : 'default';
}

// ============================================
// POSITION SETUP
// ============================================
function initPieceRack() {
  const rack = $('pieceRack');
  rack.innerHTML = '';
  const pieces = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
  pieces.forEach(p => {
    const div = document.createElement('div');
    div.className = 'rack-piece';
    div.dataset.piece = p;
    if (typeof PIECE_SVG !== 'undefined' && PIECE_SVG[p]) {
      div.innerHTML = PIECE_SVG[p];
    } else {
      div.textContent = PIECE_FONT[p];
      div.style.color = p === p.toUpperCase() ? '#ffffff' : '#1a1a1a';
    }
    div.addEventListener('click', () => {
      $$('.rack-piece').forEach(x => x.classList.remove('selected'));
      div.classList.add('selected');
      state.selectedRackPiece = p;
      state.setupMode = true;
      toast(`Selected ${p}. Click squares to place.`);
    });
    rack.appendChild(div);
  });
}

function placePieceOnSetup(sq) {
  if (!state.selectedRackPiece) return;
  try {
    const fen = state.game.fen();
    const position = fen.split(' ')[0];
    const rows = position.split('/');

    const { r, c } = squareRC(sq);
    const row = rows[r];
    const expanded = expandRow(row);
    expanded[c] = state.selectedRackPiece;
    rows[r] = collapseRow(expanded);

    const newFen = rows.join('/') + ' ' + fen.split(' ').slice(1).join(' ');
    state.game.load(newFen);
    state.history = [];
    state.historyIndex = -1;
    renderAll();
  } catch (e) {
    toast('Invalid position', 'error');
  }
}

function expandRow(row) {
  const result = [];
  for (const ch of row) {
    if (/[1-8]/.test(ch)) {
      for (let i = 0; i < parseInt(ch); i++) result.push('1');
    } else {
      result.push(ch);
    }
  }
  return result;
}

function collapseRow(arr) {
  let result = '';
  let empty = 0;
  for (const ch of arr) {
    if (ch === '1') {
      empty++;
    } else {
      if (empty > 0) { result += empty; empty = 0; }
      result += ch;
    }
  }
  if (empty > 0) result += empty;
  return result;
}

function clearBoard() {
  state.game.load('8/8/8/8/8/8/8/8 w - - 0 1');
  state.history = [];
  state.historyIndex = -1;
  renderAll();
}

// ============================================
// MOVE LIST
// ============================================
function renderMovesList() {
  els.movesList.innerHTML = '';
  const history = state.history || [];

  for (let i = 0; i < history.length; i++) {
    const san = history[i];
    if (i % 2 === 0) {
      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = `${Math.floor(i/2) + 1}.`;
      els.movesList.appendChild(num);
    }
    const moveSpan = document.createElement('span');
    moveSpan.className = 'move-san';
    if (i === state.historyIndex) moveSpan.classList.add('current');
    moveSpan.textContent = san;
    moveSpan.dataset.idx = i;
    moveSpan.addEventListener('click', () => goToMove(i));
    els.movesList.appendChild(moveSpan);
  }

  const current = els.movesList.querySelector('.current');
  if (current) current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function goToMove(idx) {
  if (idx < -1 || idx >= state.history.length) return;
  state.historyIndex = idx;
  if (idx < 0) {
    state.game.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  } else {
    state.game.load(getFenAtMove(idx));
  }
  state.selectedSquare = null;
  renderAll();
}

function getFenAtMove(idx) {
  // idx is into state.history (persistent, SAN strings)
  const game = new Chess();
  for (let i = 0; i <= idx && i < state.history.length; i++) {
    try { game.move(state.history[i]); } catch (e) {}
  }
  return game.fen();
}

function getCurrentFen() {
  // The actual FEN shown on the board, reconstructed from history up to historyIndex
  if (state.historyIndex < 0) {
    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }
  return getFenAtMove(state.historyIndex);
}

function nextMove() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    state.game.load(getFenAtMove(state.historyIndex));
    state.selectedSquare = null;
    renderAll();
  }
}

function prevMove() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    state.game.load(getFenAtMove(state.historyIndex));
    state.selectedSquare = null;
    renderAll();
  } else if (state.historyIndex === 0) {
    state.historyIndex = -1;
    state.game.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    state.selectedSquare = null;
    renderAll();
  }
}

function deleteMove() {
  if (state.history.length === 0) return;
  const lastSan = state.history[state.history.length - 1];
  state.history.pop();
  state.historyIndex = state.history.length - 1;
  if (state.historyIndex < 0) {
    state.game.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  } else {
    state.game.load(getFenAtMove(state.historyIndex));
  }
  state.selectedSquare = null;
  renderAll();
  requestEngineEval();
  toast(`Deleted: ${lastSan}`, 'success');
}

// ============================================
// FEN
// ============================================
function updateFen() {
  els.fenInput.value = state.game.fen();
}

function copyFen() {
  navigator.clipboard.writeText(state.game.fen()).then(() => toast('FEN copied to clipboard', 'success'));
}

function loadFen() {
  try {
    state.game.load(els.fenInput.value);
    state.history = [];           // reset history on FEN load (no PGN)
    state.historyIndex = -1;
    renderAll();
    toast('FEN loaded', 'success');
  } catch (e) {
    toast('Invalid FEN', 'error');
  }
}

// ============================================
// BOOKMARKS
// ============================================
function saveBookmark() {
  const name = prompt('Bookmark name:', `Position ${state.bookmarks.length + 1}`);
  if (!name) return;
  state.bookmarks.push({
    name,
    fen: state.game.fen(),
    pgn: state.game.pgn(),
    arrows: [...state.arrows],
    circles: [...state.circles],
    highlights: [...state.highlights],
    rectangles: [...state.rectangles]
  });
  renderBookmarks();
  toast('Position saved', 'success');
}

function renderBookmarks() {
  const list = $('bookmarkList');
  list.innerHTML = '';
  state.bookmarks.forEach((bm, i) => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.innerHTML = `
      <span class="bm-name">${bm.name}</span>
      <button class="bm-del">✕</button>
    `;
    item.querySelector('.bm-name').addEventListener('click', () => loadBookmark(i));
    item.querySelector('.bm-del').addEventListener('click', (e) => {
      e.stopPropagation();
      state.bookmarks.splice(i, 1);
      renderBookmarks();
    });
    list.appendChild(item);
  });
}

function loadBookmark(idx) {
  const bm = state.bookmarks[idx];
  if (!bm) return;
  try {
    state.game.load(bm.fen);
    state.history = [];
    state.historyIndex = -1;
    state.arrows = [...bm.arrows];
    state.circles = [...bm.circles];
    state.highlights = [...bm.highlights];
    state.rectangles = [...bm.rectangles];
    renderAll();
    toast(`Loaded: ${bm.name}`, 'success');
  } catch (e) {
    toast('Error loading bookmark', 'error');
  }
}

let bookmarkCursor = -1;
function nextBookmark() {
  if (state.bookmarks.length === 0) return;
  bookmarkCursor = (bookmarkCursor + 1) % state.bookmarks.length;
  loadBookmark(bookmarkCursor);
}

function prevBookmark() {
  if (state.bookmarks.length === 0) return;
  bookmarkCursor = (bookmarkCursor - 1 + state.bookmarks.length) % state.bookmarks.length;
  loadBookmark(bookmarkCursor);
}

// ============================================
// LESSON SAVE / LOAD
// ============================================
function saveLesson() {
  const lesson = {
    title: els.lessonTitle.value,
    subtitle: els.lessonSubtitle.value,
    fen: state.game.fen(),
    pgn: state.game.pgn(),
    arrows: state.arrows,
    circles: state.circles,
    highlights: state.highlights,
    rectangles: state.rectangles,
    notes: els.teacherNotes.value,
    bookmarks: state.bookmarks,
    theme: state.boardTheme,
    pieceStyle: state.pieceStyle
  };
  const json = JSON.stringify(lesson, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${els.lessonTitle.value || 'chess-lesson'}.chessx.json`;
  a.click();
  URL.revokeObjectURL(url);

  try { localStorage.setItem('chessx_current_lesson', json); } catch (e) {}
  toast('Lesson saved', 'success');
}

function loadLesson() {
  $('fileInput').click();
}

function importLessonFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const lesson = JSON.parse(e.target.result);
      applyLesson(lesson);
      toast('Lesson loaded', 'success');
    } catch (err) {
      try {
        state.game.load_pgn(e.target.result);
        // Rebuild history from loaded PGN
        state.history = state.game.history();
        state.historyIndex = state.history.length - 1;
        renderAll();
        toast('PGN loaded', 'success');
      } catch (err2) {
        toast('Could not parse file', 'error');
      }
    }
  };
  reader.readAsText(file);
}

function applyLesson(lesson) {
  if (lesson.title) els.lessonTitle.value = lesson.title;
  if (lesson.subtitle) els.lessonSubtitle.value = lesson.subtitle;
  if (lesson.fen) {
    state.game.load(lesson.fen);
    state.history = [];
    state.historyIndex = -1;
  }
  if (lesson.arrows) state.arrows = lesson.arrows;
  if (lesson.circles) state.circles = lesson.circles;
  if (lesson.highlights) state.highlights = lesson.highlights;
  if (lesson.rectangles) state.rectangles = lesson.rectangles;
  if (lesson.notes) els.teacherNotes.value = lesson.notes;
  if (lesson.bookmarks) state.bookmarks = lesson.bookmarks;
  if (lesson.theme) setTheme(lesson.theme);
  if (lesson.pieceStyle) state.pieceStyle = lesson.pieceStyle;
  renderAll();
  renderBookmarks();
}

function exportPgn() {
  const pgn = state.game.pgn();
  const blob = new Blob([pgn], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${els.lessonTitle.value || 'game'}.pgn`;
  a.click();
  URL.revokeObjectURL(url);
  toast('PGN exported', 'success');
}

function autoLoadLesson() {
  try {
    const saved = localStorage.getItem('chessx_current_lesson');
    if (saved) {
      const lesson = JSON.parse(saved);
      applyLesson(lesson);
    }
  } catch (e) {}
}

// ============================================
// THEMES
// ============================================
function setTheme(theme) {
  state.boardTheme = theme;
  document.body.dataset.theme = theme;
  $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  renderBoard();
  renderAnnotations();
}

// ============================================
// LAYOUTS
// ============================================
function setLayout(layout) {
  state.layout = layout;
  els.layout.dataset.layout = layout;
  $$('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  setTimeout(renderAnnotations, 50);
}

// ============================================
// ENGINE (STOCKFISH)
// ============================================
function initEngine() {
  try {
    if (typeof StockfishEngine === 'undefined') {
      $('engineStatus').textContent = 'Unavailable';
      return;
    }
    state.engine.stockfish = new StockfishEngine();
    state.engine.stockfish.onMessage((line) => handleEngineMessage(line));
    state.engine.stockfish.init();
    $('engineStatus').textContent = 'Ready';
  } catch (e) {
    console.warn('Engine init:', e.message || e);
    $('engineStatus').textContent = 'Unavailable';
  }
}

function handleEngineMessage(line) {
  if (typeof line !== 'string') return;

  if (line.startsWith('info') && line.includes('score')) {
    const parts = line.split(' ');
    let multipv = 1;
    let depth = 0;
    let cp = 0;
    let mate = null;
    let pvStart = false;
    let pvMoves = [];

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'multipv') multipv = parseInt(parts[i+1]);
      if (parts[i] === 'depth') depth = parseInt(parts[i+1]);
      if (parts[i] === 'score') {
        if (parts[i+1] === 'cp') cp = parseInt(parts[i+2]);
        if (parts[i+1] === 'mate') mate = parseInt(parts[i+2]);
      }
      if (parts[i] === 'pv') {
        pvStart = true;
        continue;
      }
      if (pvStart) pvMoves.push(parts[i]);
    }

    const evalCp = mate !== null ? (mate > 0 ? 9999 : -9999) : cp;
    const evalDisplay = mate !== null
      ? `#${mate > 0 ? '+' : ''}${mate}`
      : (cp / 100).toFixed(1);

    if (multipv === 1) {
      state.engine.eval = evalCp;
      state.engine.bestMove = pvMoves[0] || '';
      state.engine.pv = pvMoves.join(' ');
      state.engine.depth = depth;

      $('evalValue').textContent = (evalCp > 0 ? '+' : '') + evalDisplay;
      $('bestMove').textContent = pvMoves[0] ? formatMove(pvMoves[0]) : '—';
      $('depth').textContent = depth;
      $('pvMoves').textContent = pvMoves.map(formatMove).join(' ') || '—';

      const whitePercent = Math.max(0, Math.min(100, 50 + (evalCp / 400) * 50));
      $('barWhite').style.width = whitePercent + '%';
      $('barBlack').style.width = (100 - whitePercent) + '%';

      $('engineStatus').textContent = `Analyzing d${depth}`;
    }
  }

  if (line.startsWith('bestmove')) {
    const parts = line.split(' ');
    if (parts[1] && parts[1] !== '(none)') {
      state.engine.bestMove = parts[1];
    }
    $('engineStatus').textContent = 'Done';
    state.engine.evaluating = false;
  }
}

function formatMove(uci) {
  if (!uci || uci.length < 4) return uci;
  return uci.substring(0, 2) + '-' + uci.substring(2, 4);
}

function requestEngineEval() {
  if (!state.engine.enabled || !state.engine.stockfish) return;
  state.engine.evaluating = true;
  state.engine.stockfish.stop();
  state.engine.stockfish.setPosition(state.game.fen());
  state.engine.stockfish.go(state.engine.depth);
  $('engineStatus').textContent = 'Analyzing...';
}

function toggleEngine() {
  state.engine.enabled = !state.engine.enabled;
  const btn = $('btnEngineToggle');
  if (state.engine.enabled) {
    btn.textContent = 'Stop Analysis';
    requestEngineEval();
  } else {
    btn.textContent = 'Start Analysis';
    if (state.engine.stockfish) state.engine.stockfish.stop();
    $('engineStatus').textContent = 'Idle';
  }
}

function hideEngine() {
  $('engineDisplay').style.display = 'none';
  state.engineHidden = true;
}

function setEngineDepth(d) {
  state.engine.depth = parseInt(d);
  if (state.engine.enabled) requestEngineEval();
}

function setEngineMultiPV(n) {
  state.engine.multipv = parseInt(n);
  if (state.engine.stockfish) {
    state.engine.stockfish.setMultiPV(n);
    if (state.engine.enabled) requestEngineEval();
  }
}

// ============================================
// ZOOM
// ============================================
function setZoom(z) {
  state.zoom = Math.max(0.6, Math.min(1.6, z));
  const size = Math.round(640 * state.zoom);
  els.boardContainer.style.setProperty('--board-size', size + 'px');
  $('zoomLevel').textContent = Math.round(state.zoom * 100) + '%';
  // Disable buttons at limits
  const out = $('btnZoomOut');
  const inn = $('btnZoomIn');
  if (out) out.disabled = state.zoom <= 0.6;
  if (inn) inn.disabled = state.zoom >= 1.6;
  setTimeout(renderAnnotations, 50);
}

// ============================================
// FLIP / RESET
// ============================================
function flipBoard() {
  state.flipped = !state.flipped;
  document.body.dataset.flipped = state.flipped;
  renderBoard();
  renderAnnotations();
  highlightSquares();
}

function resetBoard() {
  if (state.history.length > 0 && !confirm('Reset board and clear moves?')) return;
  state.game.reset();
  state.history = [];
  state.historyIndex = -1;
  clearAllAnnotations();
  renderAll();
}

// ============================================
// PUZZLE MODE
// ============================================
function createPuzzle() {
  const question = els.puzzleInput.value || 'What should White play here?';
  let answer = 'Unknown';
  if (state.engine.stockfish) {
    state.engine.stockfish.stop();
    state.engine.stockfish.setPosition(state.game.fen());
    state.engine.stockfish.go(12);
    setTimeout(() => {
      if (state.engine.bestMove) {
        try {
          const m = state.game.move({ from: state.engine.bestMove.substring(0,2), to: state.engine.bestMove.substring(2,4), promotion: 'q' });
          if (m) {
            answer = m.san;
            state.game.undo();
          }
        } catch (e) {}
      }
      $('puzzleAnswerMove').textContent = answer;
    }, 1500);
  }
  state.puzzle = { question, answer };
  els.puzzleQuestion.textContent = question;
  els.puzzleOverlay.classList.remove('hidden');
  els.puzzleAnswer.classList.add('hidden');
}

function revealAnswer() {
  els.puzzleAnswer.classList.remove('hidden');
}

function closePuzzle() {
  els.puzzleOverlay.classList.add('hidden');
  state.puzzle = null;
}

// ============================================
// CHESS CLOCK
// ============================================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setClock(seconds) {
  state.clock.wTime = seconds;
  state.clock.bTime = seconds;
  updateClocks();
}

function updateClocks() {
  const w = $('clockWhite').querySelector('.clock-time');
  const b = $('clockBlack').querySelector('.clock-time');
  w.textContent = formatTime(state.clock.wTime);
  b.textContent = formatTime(state.clock.bTime);
  $('clockWhite').classList.toggle('low-time', state.clock.wTime < 30);
  $('clockBlack').classList.toggle('low-time', state.clock.bTime < 30);
}

function toggleClock() {
  state.clock.running = !state.clock.running;
  const btn = $('btnClockToggle');
  btn.textContent = state.clock.running ? 'Pause Clock' : 'Start Clock';

  if (state.clock.running) {
    state.clock.interval = setInterval(() => {
      if (state.clock.activeColor === 'w') state.clock.wTime--;
      else state.clock.bTime--;
      if (state.clock.wTime <= 0 || state.clock.bTime <= 0) {
        clearInterval(state.clock.interval);
        state.clock.running = false;
        btn.textContent = 'Start Clock';
        toast('Time expired!', 'error');
      }
      updateClocks();
    }, 1000);
  } else {
    clearInterval(state.clock.interval);
  }
  updateClocks();
}

function switchClockSide() {
  state.clock.activeColor = state.clock.activeColor === 'w' ? 'b' : 'w';
  $('clockWhite').classList.toggle('active', state.clock.activeColor === 'w' && state.clock.running);
  $('clockBlack').classList.toggle('active', state.clock.activeColor === 'b' && state.clock.running);
}
// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;

  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); prevMove(); break;
    case 'ArrowRight': e.preventDefault(); nextMove(); break;
    case 'f': case 'F': flipBoard(); break;
    case 'r': case 'R': if (!e.ctrlKey && !e.metaKey) resetBoard(); break;
    case 'a': case 'A': setTool('arrow'); break;
    case 'c': case 'C': setTool('circle'); break;
    case 'e': case 'E': setTool('eraser'); break;
    case 'v': case 'V': setTool('select'); break;
    case 'h': case 'H': setTool('highlight'); break;
    case 'n': case 'N': nextBookmark(); break;
    case 'p': case 'P': prevBookmark(); break;
    case 'z': case 'Z':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        prevMove();
      }
      break;
    case 'y': case 'Y':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        nextMove();
      }
      break;
    case '+': case '=':
      e.preventDefault();
      setZoom(state.zoom + 0.1);
      break;
    case '-': case '_':
      e.preventDefault();
      setZoom(state.zoom - 0.1);
      break;
    case '0':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(1);
      }
      break;
  }
});

// ============================================
// RENDER ALL
// ============================================
function renderAll() {
  renderBoard();
  renderAnnotations();
  highlightSquares();
  renderMovesList();
  updateFen();
  renderBookmarks();
}

// ============================================
// EVENT BINDINGS
// ============================================
function bindEvents() {
  els.board.addEventListener('mousedown', onSquareMouseDown);
  els.board.addEventListener('mouseup', onSquareMouseUp);

  $('btnFlip').addEventListener('click', flipBoard);
  $('btnReset').addEventListener('click', resetBoard);
  $('btnUndo').addEventListener('click', () => { prevMove(); });
  $('btnRedo').addEventListener('click', () => { nextMove(); });
  $('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  $$('.layout-btn').forEach(b => b.addEventListener('click', () => setLayout(b.dataset.layout)));


  $$('.tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $$('.color-dot').forEach(b => b.addEventListener('click', () => {
    state.currentColor = b.dataset.color;
    $$('.color-dot').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));
  $('btnClearAnnotations').addEventListener('click', clearAllAnnotations);

  $('btnToggleTitle').addEventListener('click', () => {
    state.titleHidden = !state.titleHidden;
    els.lessonHeader.style.display = state.titleHidden ? 'none' : 'flex';
  });

  $('btnStartFromPosition').addEventListener('click', () => {
    state.setupMode = false;
    state.selectedRackPiece = null;
    $$('.rack-piece').forEach(x => x.classList.remove('selected'));
    state.history = [];
    state.historyIndex = -1;
    renderAll();
    requestEngineEval();
    toast('Position set', 'success');
  });
  $('btnClearBoard').addEventListener('click', clearBoard);

  $('btnLoadFen').addEventListener('click', loadFen);
  $('btnCopyFen').addEventListener('click', copyFen);

  $('btnSaveBookmark').addEventListener('click', saveBookmark);
  $('btnPrevBookmark').addEventListener('click', prevBookmark);
  $('btnNextBookmark').addEventListener('click', nextBookmark);

  $('btnPrevMove').addEventListener('click', prevMove);
  $('btnNextMove').addEventListener('click', nextMove);
  $('btnDeleteMove').addEventListener('click', deleteMove);
  $('btnAddVariation').addEventListener('click', () => {
    const fen = state.game.fen();
    if (!state.variations.includes(fen)) state.variations.push(fen);
    toast('Variation saved', 'success');
  });

  $('btnEngineToggle').addEventListener('click', toggleEngine);
  $('btnHideEngine').addEventListener('click', hideEngine);
  $('engineDepth').addEventListener('change', (e) => setEngineDepth(e.target.value));
  $('engineMultiPV').addEventListener('change', (e) => setEngineMultiPV(e.target.value));

  $$('.theme-btn').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  $('pieceStyle').addEventListener('change', (e) => { state.pieceStyle = e.target.value; renderBoard(); });

  $('btnToggleNotes').addEventListener('click', () => {
    state.notesHidden = !state.notesHidden;
    $('teacherNotes').style.display = state.notesHidden ? 'none' : 'block';
  });

  $('btnCreatePuzzle').addEventListener('click', createPuzzle);
  $('btnClosePuzzle').addEventListener('click', closePuzzle);
  $('btnRevealAnswer').addEventListener('click', revealAnswer);

  $$('[data-clock]').forEach(b => b.addEventListener('click', () => {
    setClock(parseInt(b.dataset.time));
    if (state.clock.running) toggleClock();
  }));
  $('btnSetCustomClock').addEventListener('click', () => {
    const min = parseInt($('clockCustom').value) || 10;
    setClock(min * 60);
    if (state.clock.running) toggleClock();
  });
  $('btnClockToggle').addEventListener('click', toggleClock);
  $('btnToggleClock').addEventListener('click', () => {
    state.clockHidden = !state.clockHidden;
    $('clockPanel').querySelector('.clocks').style.display = state.clockHidden ? 'none' : 'grid';
  });

  $('btnSaveLesson').addEventListener('click', saveLesson);
  $('btnLoadLesson').addEventListener('click', loadLesson);
  $('btnExportPgn').addEventListener('click', exportPgn);
  $('btnImportLesson').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) importLessonFile(e.target.files[0]);
  });

  $('btnZoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('btnZoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));
  $('btnZoomReset').addEventListener('click', () => setZoom(1));


  window.addEventListener('resize', () => renderAnnotations());

  els.board.addEventListener('click', () => {
    if (state.clock.running) setTimeout(switchClockSide, 100);
  });
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
  if (typeof Chess === 'undefined') {
    console.warn('Chess.js not loaded yet, retrying...');
    setTimeout(() => {
      state.game = createGame();
      doInit();
    }, 100);
    return;
  }
  doInit();
}

function safeCall(name, fn) {
  try { fn(); } catch (e) { console.error(name + ' failed:', e); }
}

function doInit() {
  // CRITICAL: render the board FIRST so user sees something even if other things fail
  safeCall('renderBoard', renderBoard);
  safeCall('updateFen', updateFen);

  // Then do the rest independently
  safeCall('initPieceRack', initPieceRack);
  safeCall('bindEvents', bindEvents);

  // Try to init engine, but don't block the rest
  setTimeout(() => safeCall('initEngine', initEngine), 50);

  safeCall('updateClocks', updateClocks);
  safeCall('autoLoadLesson', autoLoadLesson);

  console.log('ChessX initialized successfully');
}

// Fallback: if DOMContentLoaded already fired (script loaded late), init immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
