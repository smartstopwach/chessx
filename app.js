/* ============================================
   ChessX — Professional Chess Teaching Studio
   ============================================ */

const PIECES = {
  alpha: {
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
  },
  merida: {
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
  },
  classic: {
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
  }
};

// Use high-quality unicode chess pieces (rendered as text with font)
const PIECE_FONT = {
  'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
  'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
};

// ============================================
// STATE
// ============================================
// Chess.js might not have loaded yet — wait and retry
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
    load_pgn() { return null; }
  };
}

const state = {
  game: createGame(),
  history: [],
  historyIndex: -1,
  position: { fen: '' },
  flipped: false,
  selectedSquare: null,
  currentTool: 'select',
  currentColor: '#ef4444',
  annotations: [], // { type: 'arrow'|'circle'|'highlight'|'rect', squares: [], color }
  arrows: [],      // { from, to, color }
  circles: [],     // { square, color }
  highlights: [],  // { square, color }
  rectangles: [],  // { from, to, color }
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
  recording: { mode: false, mediaRecorder: null, chunks: [], stream: null, startTime: 0, timer: null, paused: false, micStream: null, micEnabled: false },
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
        p.innerHTML = PIECE_SVG[key];
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

  // Last move
  const history = state.game.history({ verbose: true });
  if (history.length > 0 && state.historyIndex >= 0) {
    const lastMove = history[state.historyIndex];
    if (lastMove) {
      const fromSq = showSquare(lastMove.from);
      const toSq = showSquare(lastMove.to);
      if (fromSq) fromSq.classList.add('last-move');
      if (toSq) toSq.classList.add('last-move');
    }
  }

  // Check
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

  // Selected square + legal moves
  if (state.selectedSquare) {
    const sel = showSquare(state.selectedSquare);
    if (sel) sel.classList.add('selected');

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
  }

  // Setup mode - allow placing pieces
  if (state.setupMode && state.selectedRackPiece) {
    // Show ghost on hover (handled by mouseover)
  }
}

// ============================================
// SVG ANNOTATIONS
// ============================================
function renderAnnotations() {
  const svg = els.boardSvg;
  svg.innerHTML = '';

  const rect = els.boardContainer.getBoundingClientRect();
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
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', p.x);
    rect.setAttribute('y', p.y);
    rect.setAttribute('width', sqSize);
    rect.setAttribute('height', sqSize);
    rect.setAttribute('fill', h.color);
    rect.setAttribute('class', 'highlight-sq');
    rect.dataset.type = 'highlight';
    rect.dataset.square = h.square;
    svg.appendChild(rect);
  });

  // Rectangles
  state.rectangles.forEach(r => {
    const a = sqTopLeft(r.from);
    const b = sqTopLeft(r.to);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x) + sqSize;
    const h2 = Math.abs(a.y - b.y) + sqSize;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h2);
    rect.setAttribute('fill', r.color);
    rect.setAttribute('fill-opacity', '0.3');
    rect.setAttribute('stroke', r.color);
    rect.setAttribute('stroke-width', '3');
    rect.setAttribute('rx', '4');
    rect.dataset.type = 'rectangle';
    svg.appendChild(rect);
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
    const ux = dx / dist;
    const uy = dy / dist;

    // Start point: from center, but skip the piece area
    const startOffset = sqSize * 0.45;
    const endOffset = sqSize * 0.30;
    const sx = from.x + ux * startOffset;
    const sy = from.y + uy * startOffset;
    const ex = to.x - ux * endOffset;
    const ey = to.y - uy * endOffset;

    // Defs for arrowhead
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrowhead-${a.color.replace('#','')}" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
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
    line.setAttribute('marker-end', `url(#arrowhead-${a.color.replace('#','')})`);
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

  // Setup mode
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
    // Select piece
    const piece = state.game.get(sqName);
    if (piece && piece.color === state.game.turn()) {
      state.selectedSquare = sqName;
      highlightSquares();
    }
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
      // Clear annotations on move
      // state.arrows = []; state.circles = []; state.highlights = []; state.rectangles = [];
      state.historyIndex = state.game.history().length - 1;
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
  // Toggle
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
  // Erase annotations that touch this square
  state.arrows = state.arrows.filter(a => a.from !== sq && a.to !== sq);
  state.circles = state.circles.filter(c => c.square !== sq);
  state.highlights = state.highlights.filter(h => h.square !== sq);
  // For rectangles, remove if any corner is the square
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
    div.innerHTML = PIECE_SVG[p];
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
  // Get current FEN
  const fen = state.game.fen();
  const position = fen.split(' ')[0];
  const rows = position.split('/');

  const { r, c } = squareRC(sq);
  const row = rows[r];
  const expanded = expandRow(row);
  expanded[c] = state.selectedRackPiece;
  rows[r] = collapseRow(expanded);

  const newFen = rows.join('/') + ' ' + fen.split(' ').slice(1).join(' ');
  try {
    state.game.load(newFen);
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
  renderAll();
}

// ============================================
// MOVE LIST
// ============================================
function renderMovesList() {
  els.movesList.innerHTML = '';
  const history = state.game.history({ verbose: true });

  let ply = 0;
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (i % 2 === 0) {
      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = `${Math.floor(i/2) + 1}.`;
      els.movesList.appendChild(num);
    }
    const moveSpan = document.createElement('span');
    moveSpan.className = 'move-san';
    if (i === state.historyIndex) moveSpan.classList.add('current');
    moveSpan.textContent = m.san;
    moveSpan.dataset.idx = i;
    moveSpan.addEventListener('click', () => goToMove(i));
    els.movesList.appendChild(moveSpan);
  }

  // Auto scroll
  const current = els.movesList.querySelector('.current');
  if (current) current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function goToMove(idx) {
  // Replay to move idx
  const targetFen = getFenAtMove(idx);
  if (targetFen) {
    state.game.load(targetFen);
    state.historyIndex = idx;
    state.selectedSquare = null;
    renderAll();
  }
}

function getFenAtMove(idx) {
  // We need to replay from start
  const game = new Chess();
  const verbose = state.game.history({ verbose: true });
  for (let i = 0; i <= idx && i < verbose.length; i++) {
    game.move(verbose[i].san);
  }
  return game.fen();
}

function nextMove() {
  const total = state.game.history().length;
  if (state.historyIndex < total - 1) {
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
  // Remove last move and go back
  const total = state.game.history().length;
  if (total === 0) return;
  state.game.undo();
  state.historyIndex = state.game.history().length - 1;
  renderAll();
  requestEngineEval();
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
    state.historyIndex = state.game.history().length - 1;
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
    state.arrows = [...bm.arrows];
    state.circles = [...bm.circles];
    state.highlights = [...bm.highlights];
    state.rectangles = [...bm.rectangles];
    state.historyIndex = state.game.history().length - 1;
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

  // Also save to localStorage
  try {
    localStorage.setItem('chessx_current_lesson', json);
  } catch (e) {}
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
      // Try PGN
      try {
        state.game.load_pgn(e.target.result);
        state.historyIndex = state.game.history().length - 1;
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
    state.historyIndex = state.game.history().length - 1;
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

// Auto-load last lesson
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
    state.engine.stockfish.init();
    state.engine.stockfish.onMessage((line) => handleEngineMessage(line));
    $('engineStatus').textContent = 'Ready';
  } catch (e) {
    console.error(e);
    $('engineStatus').textContent = 'Unavailable';
  }
}</old_text>

function handleEngineMessage(line) {
  if (typeof line !== 'string') return;

  if (line.startsWith('info') && line.includes('score')) {
    // Parse multipv info
    const parts = line.split(' ');
    let multipv = 1;
    let depth = 0;
    let cp = 0;
    let mate = null;
    let pv = '';
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

      // Update eval bar
      const whitePercent = Math.max(0, Math.min(100, 50 + (evalCp / 400) * 50));
      $('barWhite').style.width = whitePercent + '%';
      $('barBlack').style.width = (100 - whitePercent) + '%';

      $('engineStatus').textContent = `Analyzing d${depth}`;
    }

    // Multi-PV lines
    if (state.engine.multipv > 1) {
      renderMultiPV();
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

function renderMultiPV() {
  // Simplified - the engine messages are interleaved, we keep last for multipv
  const container = $('multipv');
  container.innerHTML = '';
  // For simplicity show just primary line
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
}</old_text>

// ============================================
// ZOOM
// ============================================
function setZoom(z) {
  state.zoom = Math.max(0.6, Math.min(1.6, z));
  const size = Math.round(640 * state.zoom);
  els.boardContainer.style.setProperty('--board-size', size + 'px');
  $('zoomLevel').textContent = Math.round(state.zoom * 100) + '%';
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
  if (state.game.history().length > 0 && !confirm('Reset board and clear moves?')) return;
  state.game.reset();
  state.historyIndex = -1;
  clearAllAnnotations();
  renderAll();
}

// ============================================
// PUZZLE MODE
// ============================================
function createPuzzle() {
  const question = els.puzzleInput.value || 'What should White play here?';
  // Compute best move
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
// RECORDING MODE
// ============================================
function enterRecordingMode() {
  document.body.classList.add('recording-mode');
  state.recording.mode = true;
  setLayout('board');
  $('recordingBar').classList.remove('hidden');
  startRecTimer();
}

function exitRecordingMode() {
  document.body.classList.remove('recording-mode');
  document.body.classList.remove('ui-hidden');
  state.recording.mode = false;
  state.uiHidden = false;
  $('recordingBar').classList.add('hidden');
  stopRecTimer();
}

function startRecTimer() {
  state.recording.startTime = Date.now();
  state.recording.timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.recording.startTime) / 1000);
    $('recTimer').textContent = formatTime(elapsed);
  }, 1000);
}

function stopRecTimer() {
  if (state.recording.timer) clearInterval(state.recording.timer);
  $('recTimer').textContent = '00:00';
}

function toggleUi() {
  state.uiHidden = !state.uiHidden;
  document.body.classList.toggle('ui-hidden', state.uiHidden);
}

async function toggleMic() {
  if (state.recording.micEnabled) {
    if (state.recording.micStream) {
      state.recording.micStream.getTracks().forEach(t => t.stop());
    }
    state.recording.micEnabled = false;
    $('btnToggleMic').classList.remove('active');
    toast('Microphone off');
    return;
  }
  try {
    state.recording.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recording.micEnabled = true;
    $('btnToggleMic').classList.add('active');
    toast('Microphone on', 'success');
  } catch (e) {
    toast('Microphone permission denied', 'error');
  }
}

// ============================================
// SCREEN RECORDING (Browser MediaRecorder)
// ============================================
async function startScreenRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: true
    });
    state.recording.stream = stream;
    state.recording.chunks = [];

    // Combine screen + mic if enabled
    let combinedStream = stream;
    if (state.recording.micStream) {
      const audioTracks = state.recording.micStream.getAudioTracks();
      combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...stream.getAudioTracks(),
        ...audioTracks
      ]);
    }

    state.recording.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: getSupportedMimeType()
    });

    state.recording.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recording.chunks.push(e.data);
    };

    state.recording.mediaRecorder.onstop = () => {
      const blob = new Blob(state.recording.chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      $('recordedVideo').src = url;
      $('videoModal').classList.remove('hidden');
      $('recPreviewBar').classList.add('hidden');
      $('btnDownloadRec').onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `chess-lesson-${Date.now()}.webm`;
        a.click();
      };
    };

    state.recording.mediaRecorder.start();
    state.recording.startTime = Date.now();
    $('recPreviewBar').classList.remove('hidden');
    $('recStatusText').textContent = 'Recording screen';

    const liveTimer = setInterval(() => {
      if (!state.recording.mediaRecorder || state.recording.mediaRecorder.state === 'inactive') {
        clearInterval(liveTimer);
        return;
      }
      const elapsed = Math.floor((Date.now() - state.recording.startTime) / 1000);
      $('recLiveTimer').textContent = formatTime(elapsed);
    }, 1000);

    // When stream ends (user stops sharing)
    stream.getVideoTracks()[0].onended = () => {
      stopScreenRecording();
    };

  } catch (err) {
    $('obsModal').classList.remove('hidden');
  }
}

function getSupportedMimeType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}

function pauseScreenRecording() {
  if (state.recording.mediaRecorder && state.recording.mediaRecorder.state === 'recording') {
    state.recording.mediaRecorder.pause();
    $('btnPauseRec').textContent = 'Resume';
    $('recStatusText').textContent = 'Paused';
  } else if (state.recording.mediaRecorder && state.recording.mediaRecorder.state === 'paused') {
    state.recording.mediaRecorder.resume();
    $('btnPauseRec').textContent = 'Pause';
    $('recStatusText').textContent = 'Recording...';
  }
}

function stopScreenRecording() {
  if (state.recording.mediaRecorder && state.recording.mediaRecorder.state !== 'inactive') {
    state.recording.mediaRecorder.stop();
  }
  if (state.recording.stream) {
    state.recording.stream.getTracks().forEach(t => t.stop());
  }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input
  if (e.target.matches('input, textarea, select')) return;

  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); prevMove(); break;
    case 'ArrowRight': e.preventDefault(); nextMove(); break;
    case 'f': case 'F': flipBoard(); break;
    case 'r': case 'R': if (e.ctrlKey || e.metaKey) { /* skip */ } else resetBoard(); break;
    case 'a': case 'A': setTool('arrow'); break;
    case 'c': case 'C': setTool('circle'); break;
    case 'e': case 'E': setTool('eraser'); break;
    case 'v': case 'V': setTool('select'); break;
    case 'h': case 'H': if (state.recording.mode) toggleUi(); else setTool('highlight'); break;
    case 'n': case 'N': nextBookmark(); break;
    case 'p': case 'P': prevBookmark(); break;
    case 'z': case 'Z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); state.game.undo(); state.historyIndex = state.game.history().length - 1; renderAll(); } break;
    case 'y': case 'Y': if (e.ctrlKey || e.metaKey) { e.preventDefault(); /* redo */ } break;
    case ' ': e.preventDefault(); /* space - could be play/pause */ break;
    case 'Escape': if (state.recording.mode) exitRecordingMode(); break;
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
  // Board
  els.board.addEventListener('mousedown', onSquareMouseDown);
  els.board.addEventListener('mouseup', onSquareMouseUp);

  // Top bar
  $('btnFlip').addEventListener('click', flipBoard);
  $('btnReset').addEventListener('click', resetBoard);
  $('btnUndo').addEventListener('click', () => { state.game.undo(); state.historyIndex = state.game.history().length - 1; renderAll(); });
  $('btnRedo').addEventListener('click', () => { /* no full redo, but we can move forward */ });
  $('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // Layout switcher
  $$('.layout-btn').forEach(b => b.addEventListener('click', () => setLayout(b.dataset.layout)));

  // Recording mode
  $('btnRecordMode').addEventListener('click', enterRecordingMode);
  $('btnExitRecMode').addEventListener('click', exitRecordingMode);
  $('btnToggleUi').addEventListener('click', toggleUi);
  $('btnToggleMic').addEventListener('click', toggleMic);

  // Drawing tools
  $$('.tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $$('.color-dot').forEach(b => b.addEventListener('click', () => {
    state.currentColor = b.dataset.color;
    $$('.color-dot').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));
  $('btnClearAnnotations').addEventListener('click', clearAllAnnotations);

  // Title
  $('btnToggleTitle').addEventListener('click', () => {
    state.titleHidden = !state.titleHidden;
    els.lessonHeader.style.display = state.titleHidden ? 'none' : 'flex';
  });

  // Position editor
  $('btnStartFromPosition').addEventListener('click', () => {
    state.setupMode = false;
    state.selectedRackPiece = null;
    $$('.rack-piece').forEach(x => x.classList.remove('selected'));
    state.historyIndex = state.game.history().length - 1;
    renderAll();
    requestEngineEval();
    toast('Position set', 'success');
  });
  $('btnClearBoard').addEventListener('click', clearBoard);

  // FEN
  $('btnLoadFen').addEventListener('click', loadFen);
  $('btnCopyFen').addEventListener('click', copyFen);

  // Bookmarks
  $('btnSaveBookmark').addEventListener('click', saveBookmark);
  $('btnPrevBookmark').addEventListener('click', prevBookmark);
  $('btnNextBookmark').addEventListener('click', nextBookmark);

  // Moves
  $('btnPrevMove').addEventListener('click', prevMove);
  $('btnNextMove').addEventListener('click', nextMove);
  $('btnDeleteMove').addEventListener('click', deleteMove);
  $('btnAddVariation').addEventListener('click', () => {
    // Save current as a variation, branch
    const fen = state.game.fen();
    if (!state.variations.includes(fen)) {
      state.variations.push(fen);
    }
    toast('Variation saved', 'success');
  });

  // Engine
  $('btnEngineToggle').addEventListener('click', toggleEngine);
  $('btnHideEngine').addEventListener('click', hideEngine);
  $('engineDepth').addEventListener('change', (e) => setEngineDepth(e.target.value));
  $('engineMultiPV').addEventListener('change', (e) => setEngineMultiPV(e.target.value));

  // Themes
  $$('.theme-btn').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  $('pieceStyle').addEventListener('change', (e) => { state.pieceStyle = e.target.value; renderBoard(); });

  // Teacher notes
  $('btnToggleNotes').addEventListener('click', () => {
    state.notesHidden = !state.notesHidden;
    $('teacherNotes').style.display = state.notesHidden ? 'none' : 'block';
  });

  // Puzzle
  $('btnCreatePuzzle').addEventListener('click', createPuzzle);
  $('btnClosePuzzle').addEventListener('click', closePuzzle);
  $('btnRevealAnswer').addEventListener('click', revealAnswer);

  // Clock
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

  // Switch clock on move
  const origTryMove = tryMakeMove;
  // (already wired through board interaction)

  // Lesson
  $('btnSaveLesson').addEventListener('click', saveLesson);
  $('btnLoadLesson').addEventListener('click', loadLesson);
  $('btnExportPgn').addEventListener('click', exportPgn);
  $('btnImportLesson').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) importLessonFile(e.target.files[0]);
  });

  // Zoom
  $('btnZoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('btnZoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));

  // Screen recording controls
  $('btnStopRec').addEventListener('click', stopScreenRecording);
  $('btnPauseRec').addEventListener('click', pauseScreenRecording);
  $('btnCloseModal').addEventListener('click', () => $('videoModal').classList.add('hidden'));
  $('btnDiscardRec').addEventListener('click', () => $('videoModal').classList.add('hidden'));
  $('btnCloseObsModal').addEventListener('click', () => $('obsModal').classList.add('hidden'));
  $('btnCloseObsOk').addEventListener('click', () => $('obsModal').classList.add('hidden'));

  // Window resize
  window.addEventListener('resize', () => renderAnnotations());

  // Switch clock on each successful move
  els.board.addEventListener('click', () => {
    if (state.clock.running) setTimeout(switchClockSide, 100);
  });
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
  // Wait a tick if Chess isn't loaded yet
  if (typeof Chess === 'undefined') {
    console.warn('Chess.js not loaded yet, retrying...');
    setTimeout(() => {
      state.game = createGame();
      try { doInit(); } catch (e) { console.error(e); }
    }, 100);
    return;
  }
  try { doInit(); } catch (e) { console.error('Init error:', e); }
}

function doInit() {
  initPieceRack();
  bindEvents();
  initEngine();
  updateFen();
  renderAll();
  updateClocks();
  autoLoadLesson();
  console.log('ChessX initialized successfully');
}

document.addEventListener('DOMContentLoaded', init);
