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
  variations: [],
  currentVariation: 'main',
  puzzle: null,
  clock: { wTime: 600, bTime: 600, running: false, activeColor: 'w', interval: null },
  layout: 'focus',
  uiHidden: false,
  clockHidden: false,
  engineHidden: false,
  setupMode: false,
  authoringMode: false,
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
  topbar: $('topbar'),
  movesList: $('movesList'),
  fenInput: $('fenInput'),
  puzzleOverlay: $('puzzleOverlay'),
  puzzleQuestion: $('puzzleQuestion'),
  puzzleAnswer: $('puzzleAnswer'),
  puzzleAnswerMove: $('puzzleAnswerMove'),
  toast: $('toast'),
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

      // Coordinates (CSS rotates board when flipped, so use same positions)
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

  // Right-click in setup mode = erase piece
  if (e.button === 2 && state.setupMode) {
    erasePieceAt(sqName);
    return;
  }

  if (state.setupMode) {
    // If holding a piece (from rack OR from board), place it
    if (state.heldPiece) {
      placePieceOnSetup(sqName, state.heldPiece.piece);
      return;
    }
    // Otherwise, single-click on a piece = pick it up (fast workflow)
    const existingPiece = getPieceAt(sqName);
    if (existingPiece) {
      pickPieceFromBoard(sqName);
      return;
    }
    // Click on empty square with nothing held = no-op
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
// POSITION SETUP — ADVANCED
// ============================================
function initPieceRack() {
  const rack = $('pieceRack');
  rack.innerHTML = '';
  const pieces = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
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
    // SINGLE click: select for placing
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRackPiece(p);
    });
    // DRAG start: begin drag-and-drop placement
    div.addEventListener('dragstart', (e) => {
      state.dragPiece = p;
      state.setupMode = true;
      e.dataTransfer.setData('text/plain', p);
      e.dataTransfer.effectAllowed = 'copy';
      div.classList.add('dragging');
      selectRackPiece(p);
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
    });
    div.setAttribute('draggable', 'true');
    rack.appendChild(div);
  });
}

function selectRackPiece(p) {
  state.selectedRackPiece = p;
  state.setupMode = true;
  state.heldPiece = { piece: p, source: 'rack' };
  $$('.rack-piece').forEach(x => x.classList.remove('selected'));
  const el = document.querySelector(`.rack-piece[data-piece="${p}"]`);
  if (el) el.classList.add('selected');
  // Also sync the inline rack (if it exists in the puzzle editor)
  $$('.rack-piece-mini').forEach(x => x.classList.toggle('selected', x.dataset.piece === p));
  toast(`Holding ${pieceName(p)} — click square to place, right-click square to erase.`);
  updateSetupHint();
  highlightDropSquares();
}

// PICK A PIECE FROM THE BOARD by double-click
function pickPieceFromBoard(sqName) {
  const piece = getPieceAt(sqName);
  if (!piece) {
    // Empty square — if we are holding a piece, place it here
    if (state.heldPiece) {
      placePieceOnSetup(sqName, state.heldPiece.piece);
      // After placing, automatically deselect for faster workflow
      // state.heldPiece = null;
      // state.selectedRackPiece = null;
      // $$('.rack-piece').forEach(x => x.classList.remove('selected'));
      return true;
    }
    return false;
  }
  // Pick up the piece — single click picks it
  state.heldPiece = { piece: piece, source: sqName };
  state.selectedRackPiece = piece;
  state.setupMode = true;
  $$('.rack-piece').forEach(x => x.classList.remove('selected'));
  const el = document.querySelector(`.rack-piece[data-piece="${piece}"]`);
  if (el) el.classList.add('selected');
  toast(`Picked ${pieceName(piece)} from ${sqName} — click destination square.`);
  updateSetupHint();
  highlightDropSquares();
  return true;
}

// Show squares where the held piece can be placed
function highlightDropSquares() {
  $$('.square').forEach(sq => sq.classList.remove('drop-target', 'drop-invalid'));
  if (!state.heldPiece) return;
  $$('.square').forEach(sq => {
    sq.classList.add('drop-target');
  });
}

function updateSetupHint() {
  const hint = $('setupHint');
  if (!hint) return;
  if (state.heldPiece) {
    hint.innerHTML = `<span class="hint-active">Holding: <strong>${pieceName(state.heldPiece.piece)}</strong></span> · click to place · right-click to erase`;
    hint.classList.add('active');
  } else {
    hint.innerHTML = `Click a piece in rack OR double-click a board piece · drag pieces too`;
    hint.classList.remove('active');
  }
  // also update inline hint if it's open
  updateInlineSetupHint();
}

function pieceName(p) {
  const names = { K:'White King', Q:'White Queen', R:'White Rook', B:'White Bishop', N:'White Knight', P:'White Pawn', k:'Black King', q:'Black Queen', r:'Black Rook', b:'Black Bishop', n:'Black Knight', p:'Black Pawn' };
  return names[p] || p;
}

function getPieceAt(sqName) {
  try {
    const fen = state.game.fen();
    const position = fen.split(' ')[0];
    const rows = position.split('/');
    const { r, c } = squareRC(sqName);
    const row = rows[r];
    const expanded = expandRow(row);
    return expanded[c] || null;
  } catch (e) { return null; }
}

function expandRow(row) {
  const result = [];
  for (const ch of row) {
    if (/\d/.test(ch)) {
      for (let i = 0; i < parseInt(ch); i++) result.push(null);
    } else {
      result.push(ch);
    }
  }
  return result;
}

function collapseRow(arr) {
  let result = '';
  let empty = 0;
  for (const cell of arr) {
    if (cell === null || cell === undefined) {
      empty++;
    } else {
      if (empty > 0) { result += empty; empty = 0; }
      result += cell;
    }
  }
  if (empty > 0) result += empty;
  return result;
}

function placePieceOnSetup(sq, piece) {
  if (!piece) return;
  try {
    const fen = state.game.fen();
    const parts = fen.split(' ');
    const rows = parts[0].split('/');

    const { r, c } = squareRC(sq);
    const row = rows[r];
    const expanded = expandRow(row);

    // If piece was picked from the board, remove it from old position (move/copy)
    if (state.heldPiece && state.heldPiece.source && state.heldPiece.source !== 'rack') {
      const oldRC = squareRC(state.heldPiece.source);
      const oldExpanded = expandRow(rows[oldRC.r]);
      oldExpanded[oldRC.c] = null;
      rows[oldRC.r] = collapseRow(oldExpanded);
    }

    expanded[c] = piece;
    rows[r] = collapseRow(expanded);

    parts[0] = rows.join('/');
    const newFen = parts.join(' ');
    state.game.load(newFen);

    pushSetupHistory(); // save for undo

    // If we moved a piece from the board, clear the held state
    if (state.heldPiece && state.heldPiece.source && state.heldPiece.source !== 'rack') {
      state.heldPiece = null;
      state.selectedRackPiece = null;
      $$('.rack-piece').forEach(x => x.classList.remove('selected'));
    }

    renderAll();
    updatePieceCount();
    updateSetupHint();
    highlightDropSquares();
  } catch (e) {
    toast('Invalid position', 'error');
  }
}

function erasePieceAt(sq) {
  try {
    const fen = state.game.fen();
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const { r, c } = squareRC(sq);
    const expanded = expandRow(rows[r]);
    expanded[c] = null;
    rows[r] = collapseRow(expanded);
    parts[0] = rows.join('/');
    state.game.load(parts.join(' '));
    pushSetupHistory();
    renderAll();
    updatePieceCount();
  } catch (e) {
    toast('Cannot erase', 'error');
  }
}

// Undo/redo for position setup
const setupHistory = [];
let setupHistoryIndex = -1;
function pushSetupHistory() {
  const fen = state.game.fen();
  // Remove future history if we're in the middle
  setupHistory.length = setupHistoryIndex + 1;
  setupHistory.push(fen);
  if (setupHistory.length > 50) setupHistory.shift();
  setupHistoryIndex = setupHistory.length - 1;
}
function setupUndo() {
  if (setupHistoryIndex <= 0) return;
  setupHistoryIndex--;
  state.game.load(setupHistory[setupHistoryIndex]);
  renderAll();
  updatePieceCount();
  toast('Undid position change');
}
function setupRedo() {
  if (setupHistoryIndex >= setupHistory.length - 1) return;
  setupHistoryIndex++;
  state.game.load(setupHistory[setupHistoryIndex]);
  renderAll();
  updatePieceCount();
  toast('Redid position change');
}

// Piece count display
function updatePieceCount() {
  const el = $('pieceCount');
  if (!el) return;
  const fen = state.game.fen().split(' ')[0];
  const counts = { K:0, Q:0, R:0, B:0, N:0, P:0, k:0, q:0, r:0, b:0, n:0, p:0 };
  for (const ch of fen) {
    if (counts[ch] !== undefined) counts[ch]++;
  }
  const wCount = counts.P + counts.N + counts.B + counts.R + counts.Q + counts.K;
  const bCount = counts.p + counts.n + counts.b + counts.r + counts.q + counts.k;
  el.innerHTML = `<span class="count-w">${wCount}</span><span class="count-sep">·</span><span class="count-b">${bCount}</span>`;
  // also update inline piece count
  updateInlinePieceCount();
}

// Quick position presets
function loadPreset(name) {
  const presets = {
    standard: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    empty: '8/8/8/8/8/8/8/8 w - - 0 1',
    kings: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    kk: '4k3/8/8/8/8/8/8/3K4 w - - 0 1',
    endgame_kq: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
    endgame_krk: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
    promotion: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
    middlegame: 'r1bqkbnr/pp2pppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4',
    castling_test: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
    scholars: 'rnbqkb1r/pppp1ppp/4p3/8/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
  };
  const fen = presets[name];
  if (!fen) return;
  try {
    state.game.load(fen);
    setupHistory.length = 0;
    setupHistoryIndex = -1;
    pushSetupHistory();
    renderAll();
    updatePieceCount();
    toast(`Loaded preset: ${name.replace(/_/g, ' ')}`);
  } catch (e) {
    toast('Invalid preset', 'error');
  }
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
// ============================================
// LIBRARY / CHAPTERS / PUZZLE AUTHORING
// ============================================
const LIBRARY_KEY = 'chessx-library-v1';

function getLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  // Default: one welcome chapter with one example puzzle
  return {
    chapters: [
      {
        id: uniqueId('chapter'),
        name: 'My First Chapter',
        expanded: true,
        puzzles: [
          {
            id: uniqueId('puzzle'),
            title: 'Mate in 2 (Example)',
            description: 'White to move. Find the forcing sequence.',
            solution: 'Qh5+, g6, Qxg6#',
            difficulty: 2,
            tags: 'mate, opening',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2',
            chapterId: null,
            createdAt: Date.now(),
          }
        ]
      }
    ],
    activeChapterId: null,
    activePuzzleId: null,
  };
}

function saveLibrary(lib) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  } catch (e) {
    toast('Could not save library (storage full?)', 'error');
  }
}

function getActiveChapter() {
  const lib = getLibrary();
  return lib.chapters.find(c => c.id === lib.activeChapterId);
}
function getActivePuzzle() {
  const lib = getLibrary();
  const chap = getActiveChapter();
  if (!chap) return null;
  return chap.puzzles.find(p => p.id === lib.activePuzzleId);
}

// ============================================
// UNIQUE ID GENERATOR (fixes Date.now() collision)
// ============================================
let __uidCounter = 0;
function uniqueId(prefix = 'id') {
  __uidCounter++;
  return prefix + '-' + Date.now().toString(36) + '-' + __uidCounter.toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

function autoName(prefix, lib) {
  // Auto-generate a name like "Puzzle 1", "Puzzle 2", "Chapter 1", etc.
  let n = 1;
  const existing = lib.chapters.flatMap(c => c.puzzles).map(p => p.title).filter(t => t && t.startsWith(prefix));
  while (existing.includes(prefix + ' ' + n)) n++;
  return prefix + ' ' + n;
}

function renderLibrary(filter = '') {
  const tree = $('libraryTree');
  if (!tree) return;
  const lib = getLibrary();
  const f = filter.toLowerCase().trim();
  if (!lib.chapters.length) {
    tree.innerHTML = '<div class="library-empty">No chapters yet. Click + to create one.</div>';
    return;
  }
  let html = '';
  for (const chap of lib.chapters) {
    // Filter puzzles by search
    const puzzles = chap.puzzles.filter(p => {
      if (!f) return true;
      return (p.title || '').toLowerCase().includes(f)
        || (p.description || '').toLowerCase().includes(f)
        || (p.tags || '').toLowerCase().includes(f)
        || (p.solution || '').toLowerCase().includes(f);
    });
    const isExpanded = chap.expanded !== false;
    const isActive = chap.id === lib.activeChapterId;
    const puzzleCount = chap.puzzles.length;
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

    html += `<div class="library-chapter" data-chapter-id="${chap.id}">
      <div class="library-chapter-header ${isExpanded ? 'expanded' : ''} ${isActive ? 'active' : ''}" data-action="toggle-chapter" data-chapter-id="${chap.id}">
        <span class="chapter-caret">▶</span>
        <span class="chapter-name" title="${escapeHtml(chap.name)}">${escapeHtml(chap.name)}</span>
        <span class="chapter-count">${puzzleCount}</span>
        <div class="chapter-actions">
          <button class="chapter-action" data-action="add-puzzle" data-chapter-id="${chap.id}" title="Add puzzle here">+</button>
          <button class="chapter-action" data-action="rename-chapter" data-chapter-id="${chap.id}" title="Rename">✎</button>
          <button class="chapter-action" data-action="delete-chapter" data-chapter-id="${chap.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="library-puzzles">`;

    for (const puz of puzzles) {
      const isActivePuz = puz.id === lib.activePuzzleId;
      html += `<div class="library-puzzle ${isActivePuz ? 'active' : ''}" data-action="select-puzzle" data-puzzle-id="${puz.id}" data-chapter-id="${chap.id}">
        <span class="puzzle-difficulty" title="Difficulty ${puz.difficulty}/5">${stars(puz.difficulty || 3)}</span>
        <span class="puzzle-name" title="${escapeHtml(puz.title || 'Untitled')}">${escapeHtml(puz.title || 'Untitled')}</span>
        <div class="puzzle-actions">
          <button class="puzzle-action" data-action="delete-puzzle" data-puzzle-id="${puz.id}" data-chapter-id="${chap.id}" title="Delete">✕</button>
        </div>
      </div>`;
    }

    html += '</div></div>';
  }
  tree.innerHTML = html;

  // Wire up event delegation
  tree.onclick = (e) => {
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (!action) return;
    const el = e.target.closest('[data-action]');
    const chapterId = el.dataset.chapterId;
    const puzzleId = el.dataset.puzzleId;
    handleLibraryAction(action, chapterId, puzzleId);
  };
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
}

function handleLibraryAction(action, chapterId, puzzleId) {
  const lib = getLibrary();
  if (action === 'toggle-chapter') {
    const chap = lib.chapters.find(c => c.id === chapterId);
    if (chap) {
      chap.expanded = !(chap.expanded !== false);
      lib.activeChapterId = chapterId;
      saveLibrary(lib);
      renderLibrary($('librarySearch')?.value || '');
    }
  } else if (action === 'select-puzzle') {
    lib.activeChapterId = chapterId;
    lib.activePuzzleId = puzzleId;
    saveLibrary(lib);
    renderLibrary($('librarySearch')?.value || '');
    loadPuzzleToEditor(puzzleId);
  } else if (action === 'add-puzzle') {
    const newPuzzle = {
      id: uniqueId('puzzle'),
      title: autoName('Puzzle', lib),
      description: '',
      solution: '',
      difficulty: 3,
      tags: '',
      fen: state.game.fen(),
      chapterId,
      createdAt: Date.now(),
    };
    const chap = lib.chapters.find(c => c.id === chapterId);
    if (chap) {
      chap.puzzles.push(newPuzzle);
      lib.activeChapterId = chapterId;
      lib.activePuzzleId = newPuzzle.id;
      chap.expanded = true;
      saveLibrary(lib);
      renderLibrary($('librarySearch')?.value || '');
      loadPuzzleToEditor(newPuzzle.id);
      setAuthoringMode(true);
      // Scroll to editor panel
      const panel = $('puzzleEditorPanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('New puzzle added — set its position and click SAVE', 'success');
    }
  } else if (action === 'rename-chapter') {
    const chap = lib.chapters.find(c => c.id === chapterId);
    if (chap) {
      const newName = prompt('Rename chapter:', chap.name);
      if (newName && newName.trim()) {
        chap.name = newName.trim();
        saveLibrary(lib);
        renderLibrary($('librarySearch')?.value || '');
      }
    }
  } else if (action === 'delete-chapter') {
    const chap = lib.chapters.find(c => c.id === chapterId);
    if (!chap) return;
    if (confirm(`Delete chapter "${chap.name}" and all its ${chap.puzzles.length} puzzle(s)?`)) {
      lib.chapters = lib.chapters.filter(c => c.id !== chapterId);
      if (lib.activeChapterId === chapterId) lib.activeChapterId = null;
      saveLibrary(lib);
      renderLibrary($('librarySearch')?.value || '');
      toast('Chapter deleted', 'success');
    }
  } else if (action === 'delete-puzzle') {
    const chap = lib.chapters.find(c => c.id === chapterId);
    if (!chap) return;
    const puz = chap.puzzles.find(p => p.id === puzzleId);
    if (!puz) return;
    if (confirm(`Delete puzzle "${puz.title}"?`)) {
      chap.puzzles = chap.puzzles.filter(p => p.id !== puzzleId);
      if (lib.activePuzzleId === puzzleId) lib.activePuzzleId = null;
      saveLibrary(lib);
      renderLibrary($('librarySearch')?.value || '');
      toast('Puzzle deleted', 'success');
    }
  }
}

function renderChapterSelect() {
  const sel = $('puzzleChapterSelect');
  if (!sel) return;
  const lib = getLibrary();
  let html = '<option value="">— Uncategorized —</option>';
  for (const chap of lib.chapters) {
    html += `<option value="${chap.id}">${escapeHtml(chap.name)}</option>`;
  }
  sel.innerHTML = html;
}

function loadPuzzleToEditor(puzzleId) {
  const lib = getLibrary();
  let puzzle = null;
  let chapterId = null;
  for (const chap of lib.chapters) {
    const p = chap.puzzles.find(p => p.id === puzzleId);
    if (p) { puzzle = p; chapterId = chap.id; break; }
  }
  if (!puzzle) {
    // Clear form
    $('puzzleTitle').value = '';
    $('puzzleDescription').value = '';
    $('puzzleSolution').value = '';
    $('puzzleDifficulty').value = '3';
    $('puzzleTags').value = '';
    $('puzzleFen').value = '';
    $('puzzleChapterSelect').value = '';
    return;
  }
  $('puzzleTitle').value = puzzle.title || '';
  $('puzzleDescription').value = puzzle.description || '';
  $('puzzleSolution').value = puzzle.solution || '';
  $('puzzleDifficulty').value = String(puzzle.difficulty || 3);
  $('puzzleTags').value = puzzle.tags || '';
  $('puzzleFen').value = puzzle.fen || '';
  updateFenDisplay(puzzle.fen || '');
  $('puzzleChapterSelect').value = chapterId;
  toast(`Loaded puzzle: ${puzzle.title}`);
}

function saveCurrentPuzzle() {
  const lib = getLibrary();
  let puzzle = null;
  let chap = null;
  if (lib.activePuzzleId) {
    for (const c of lib.chapters) {
      const p = c.puzzles.find(x => x.id === lib.activePuzzleId);
      if (p) { puzzle = p; chap = c; break; }
    }
  }
  // Get title — auto-generate if empty so save ALWAYS works
  let title = $('puzzleTitle').value.trim();
  if (!title) {
    title = autoName('Puzzle', lib);
    $('puzzleTitle').value = title;
  }
  const description = $('puzzleDescription').value.trim();
  const solution = $('puzzleSolution').value.trim();
  const difficulty = parseInt($('puzzleDifficulty').value) || 3;
  const tags = $('puzzleTags').value.trim();
  // ALWAYS use current board FEN — user expects what they see to be saved
  let fen = state.game.fen();
  $('puzzleFen').value = fen;
  updateFenDisplay(fen);
  const newChapterId = $('puzzleChapterSelect').value;

  if (!puzzle) {
    // Create new puzzle
    let targetChapId = newChapterId || lib.activeChapterId || lib.chapters[0]?.id;
    if (!targetChapId) {
      // Auto-create a chapter
      const newChap = { id: uniqueId('chapter'), name: 'My Puzzles', expanded: true, puzzles: [] };
      lib.chapters.push(newChap);
      targetChapId = newChap.id;
    }
    const target = lib.chapters.find(c => c.id === targetChapId);
    if (!target) {
      // Fallback: use first chapter
      const fallback = lib.chapters[0];
      if (!fallback) {
        toast('No chapter to save into — please create a chapter first', 'error');
        return;
      }
    }
    const tid = targetChapId || lib.chapters[0].id;
    const t = lib.chapters.find(c => c.id === tid) || lib.chapters[0];
    puzzle = {
      id: uniqueId('puzzle'),
      title, description, solution, difficulty, tags, fen,
      chapterId: tid, createdAt: Date.now(),
    };
    t.puzzles.push(puzzle);
    lib.activeChapterId = tid;
    lib.activePuzzleId = puzzle.id;
    t.expanded = true;
  } else {
    // Update existing
    puzzle.title = title;
    puzzle.description = description;
    puzzle.solution = solution;
    puzzle.difficulty = difficulty;
    puzzle.tags = tags;
    puzzle.fen = fen;

    // Move to new chapter if changed
    if (newChapterId && chap && chap.id !== newChapterId) {
      chap.puzzles = chap.puzzles.filter(p => p.id !== puzzle.id);
      const newChap = lib.chapters.find(c => c.id === newChapterId);
      if (newChap) {
        newChap.puzzles.push(puzzle);
        chap = newChap;
        lib.activeChapterId = newChap.id;
      }
    }
    if (chap) puzzle.chapterId = chap.id;
  }

  saveLibrary(lib);
  renderLibrary($('librarySearch')?.value || '');
  renderChapterSelect();
  updateFenDisplay(fen);
  toast('✓ Saved: ' + title, 'success');
}

function captureCurrentPosition() {
  const fen = state.game.fen();
  $('puzzleFen').value = fen;
  updateFenDisplay(fen);
  toast('Position captured', 'success');
}

function updateFenDisplay(fen) {
  const el = $('puzzleFenDisplay');
  if (!el) return;
  if (!fen) {
    el.textContent = 'No position set';
    el.classList.add('empty');
    return;
  }
  el.classList.remove('empty');
  el.textContent = fen;
  // Add a brief highlight
  el.style.borderColor = 'var(--accent)';
  setTimeout(() => el.style.borderColor = '', 500);
}

function loadFENToBoard(fen) {
  if (!fen) return;
  try {
    state.game.load(fen);
    state.history = [];
    state.historyIndex = -1;
    renderAll();
    toast('Position loaded to board', 'success');
  } catch (e) {
    toast('Invalid FEN', 'error');
  }
}

function newPuzzle() {
  enterAuthoringForNewPuzzle();
}

function deleteCurrentPuzzle() {
  const lib = getLibrary();
  if (!lib.activePuzzleId) { toast('No puzzle selected', 'error'); return; }
  const puz = getActivePuzzle();
  if (!puz) { toast('Puzzle not found', 'error'); return; }
  if (!confirm(`Delete puzzle "${puz.title}"?`)) return;
  for (const c of lib.chapters) {
    const idx = c.puzzles.findIndex(p => p.id === lib.activePuzzleId);
    if (idx >= 0) { c.puzzles.splice(idx, 1); break; }
  }
  lib.activePuzzleId = null;
  saveLibrary(lib);
  renderLibrary($('librarySearch')?.value || '');
  loadPuzzleToEditor(null);
  toast('Puzzle deleted', 'success');
}

function testPuzzleAsStudent() {
  const lib = getLibrary();
  const puz = getActivePuzzle();
  if (!puz) { toast('Select a puzzle first', 'error'); return; }
  if (!puz.fen) { toast('No position set', 'error'); return; }
  state.game.load(puz.fen);
  state.history = [];
  state.historyIndex = -1;
  state.puzzle = {
    title: puz.title,
    question: puz.description || 'Find the solution',
    solution: puz.solution || '',
    fen: puz.fen,
  };
  renderAll();
  // Show puzzle overlay
  const overlay = $('puzzleOverlay');
  const question = $('puzzleQuestion');
  if (overlay && question) {
    question.textContent = puz.description || 'Find the solution';
    overlay.classList.remove('hidden');
  }
  toast(`Testing puzzle: ${puz.title} — try to solve it!`);
}

// ============================================
// ============================================
// INLINE POSITION SETUP (inside Puzzle Editor)
// ============================================
// Mirrors the left-sidebar Position Setup but lives inside the puzzle editor.
// Both racks share state — picking a piece highlights both rack rows.
function initInlinePieceRack() {
  const rack = $('inlinePieceRack');
  if (!rack) return;
  rack.innerHTML = '';
  const pieces = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
  pieces.forEach(p => {
    const div = document.createElement('div');
    div.className = 'rack-piece-mini';
    div.dataset.piece = p;
    if (typeof PIECE_SVG !== 'undefined' && PIECE_SVG[p]) {
      div.innerHTML = PIECE_SVG[p];
    } else {
      div.textContent = PIECE_FONT[p];
      div.style.color = p === p.toUpperCase() ? '#ffffff' : '#1a1a1a';
    }
    // Click: select rack piece for placement
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRackPiece(p);
      // also highlight inline rack
      $$('.rack-piece-mini').forEach(x => x.classList.toggle('selected', x.dataset.piece === p));
    });
    // Drag: drag-and-drop placement
    div.addEventListener('dragstart', (e) => {
      state.dragPiece = p;
      state.setupMode = true;
      e.dataTransfer.setData('text/plain', p);
      e.dataTransfer.effectAllowed = 'copy';
      div.classList.add('dragging');
      selectRackPiece(p);
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
    });
    div.setAttribute('draggable', 'true');
    rack.appendChild(div);
  });
}

function updateInlinePieceCount() {
  const el = $('inlinePieceCount');
  if (!el) return;
  const fen = state.game.fen().split(' ')[0];
  const counts = { K:0, Q:0, R:0, B:0, N:0, P:0, k:0, q:0, r:0, b:0, n:0, p:0 };
  for (const ch of fen) {
    if (counts[ch] !== undefined) counts[ch]++;
  }
  const wCount = counts.P + counts.N + counts.B + counts.R + counts.Q + counts.K;
  const bCount = counts.p + counts.n + counts.b + counts.r + counts.q + counts.k;
  el.innerHTML = `<span class="count-w">${wCount}</span><span class="count-sep">·</span><span class="count-b">${bCount}</span>`;
}

function updateInlineSetupHint() {
  const hint = $('inlineSetupHint');
  if (!hint) return;
  if (state.heldPiece) {
    hint.innerHTML = `<span class="hint-active">Holding: <strong>${pieceName(state.heldPiece.piece)}</strong></span> · click square to place · right-click to erase`;
    hint.classList.add('active');
  } else {
    hint.textContent = 'Pick a piece from the rack or click a preset below';
    hint.classList.remove('active');
  }
}

function toggleInlineSetup() {
  const body = $('inlineSetupBody');
  const btn = $('btnToggleInlineSetup');
  if (!body || !btn) return;
  const collapsed = body.classList.toggle('collapsed');
  btn.classList.toggle('active', !collapsed);
  if (!collapsed) {
    // Auto-enable setup mode when opened
    state.setupMode = true;
    updateSetupHint();
    updateInlineSetupHint();
  }
}

function inlineCaptureToPuzzle() {
  captureCurrentPosition();
  // Toast extra context
  toast('Puzzle FEN updated from board position', 'success');
}

// Wrapper for inline undo/redo that also updates inline count + hint
function inlineSetupUndo() {
  setupUndo();
  updateInlinePieceCount();
  updateInlineSetupHint();
}
function inlineSetupRedo() {
  setupRedo();
  updateInlinePieceCount();
  updateInlineSetupHint();
}

// AUTHORING MODE — distinct visual state when making puzzles
// ============================================
function setAuthoringMode(on) {
  state.authoringMode = on;
  document.body.dataset.authoring = on ? 'true' : 'false';
  if (on) {
    state.setupMode = true; // auto-enable setup mode
    toast('Authoring Mode ON — set up your puzzle position', 'success');
  } else {
    toast('Authoring Mode OFF', 'success');
  }
  updateSetupHint();
  // Show/hide authoring button
  const btn = $('btnToggleAuthoring');
  if (btn) btn.classList.toggle('active', on);
}

function isAuthoringMode() {
  return state.authoringMode === true;
}

function enterAuthoringForNewPuzzle() {
  // SIMPLE FLOW: just enter authoring mode and clear the editor.
  // The puzzle is only created when the user clicks SAVE.
  const lib = getLibrary();
  // Auto-create chapter if none exists
  if (!lib.chapters.length) {
    const newChap = { id: uniqueId('chapter'), name: 'My Puzzles', expanded: true, puzzles: [] };
    lib.chapters.push(newChap);
    saveLibrary(lib);
    renderChapterSelect();
  }
  // Clear active puzzle so save creates a new one
  lib.activePuzzleId = null;
  saveLibrary(lib);

  // Clear the editor fields but pre-fill with auto-name and current position
  const autoTitle = autoName('Puzzle', lib);
  $('puzzleTitle').value = '';
  $('puzzleDescription').value = '';
  $('puzzleSolution').value = '';
  $('puzzleDifficulty').value = '3';
  $('puzzleTags').value = '';
  // Auto-capture the current board position
  const currentFen = state.game.fen();
  $('puzzleFen').value = currentFen;
  updateFenDisplay(currentFen);
  // Set chapter dropdown to active or first
  const chapId = lib.activeChapterId || lib.chapters[0].id;
  $('puzzleChapterSelect').value = chapId;

  renderLibrary($('librarySearch')?.value || '');

  setAuthoringMode(true);
  // Scroll to editor panel
  const panel = $('puzzleEditorPanel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('New puzzle — set the position and click SAVE', 'success');
}

function exitAuthoringMode() {
  setAuthoringMode(false);
  toast('Exited authoring mode', 'success');
}

function exportLibrary() {
  const lib = getLibrary();
  const json = JSON.stringify(lib, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chessx-library-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Library exported', 'success');
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const lib = JSON.parse(e.target.result);
      if (!lib.chapters || !Array.isArray(lib.chapters)) throw new Error('Invalid format');
      saveLibrary(lib);
      renderLibrary($('librarySearch')?.value || '');
      renderChapterSelect();
      toast(`Imported ${lib.chapters.length} chapter(s)`, 'success');
    } catch (err) {
      toast('Invalid library file', 'error');
    }
  };
  reader.readAsText(file);
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
// AUTO-FIT BOARD (always fills available space)
// ============================================
function autoFitBoard() {
  const wrapper = document.getElementById('boardWrapper');
  const boardContainer = document.getElementById('boardContainer');
  if (!wrapper || !boardContainer) return;

  // Available space inside wrapper (account for player-info rows above/below)
  const availW = wrapper.clientWidth - 24; // small padding buffer
  const availH = wrapper.clientHeight - 40; // minimal buffer for player info rows

  // Pick the smaller to keep square, then clamp to [320, 1100]
  const size = Math.max(320, Math.min(1100, Math.min(availW, availH)));

  boardContainer.style.setProperty('--board-size', Math.round(size) + 'px');
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
    case 'p': case 'P':
      // Toggle authoring mode
      if (isAuthoringMode()) exitAuthoringMode();
      else enterAuthoringForNewPuzzle();
      break;
    case 'e': case 'E':
      // Toggle setup mode
      state.setupMode = !state.setupMode;
      if (!state.setupMode) {
        state.heldPiece = null;
        state.selectedRackPiece = null;
        $$('.rack-piece').forEach(x => x.classList.remove('selected'));
        $$('.square').forEach(sq => sq.classList.remove('drop-target'));
      }
      toast(state.setupMode ? 'Setup Mode: ON — click/drag to edit position' : 'Setup Mode: OFF — play moves normally');
      updateSetupHint();
      break;
    case 'ArrowLeft': e.preventDefault(); prevMove(); break;
    case 'ArrowRight': e.preventDefault(); nextMove(); break;
    case 'f': case 'F': flipBoard(); break;
    case 'r': case 'R': if (!e.ctrlKey && !e.metaKey) resetBoard(); break;
    case 'a': case 'A': setTool('arrow'); break;
    case 'c': case 'C': setTool('circle'); break;
    case 'e': case 'E': setTool('eraser'); break;
    case 'v': case 'V': setTool('select'); break;
    case 'h': case 'H': setTool('highlight'); break;
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

  $$('.tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $$('.color-dot').forEach(b => b.addEventListener('click', () => {
    state.currentColor = b.dataset.color;
    $$('.color-dot').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));
  $('btnClearAnnotations').addEventListener('click', clearAllAnnotations);

  $('btnStartFromPosition').addEventListener('click', () => {
    state.setupMode = false;
    state.heldPiece = null;
    state.selectedRackPiece = null;
    $$('.rack-piece').forEach(x => x.classList.remove('selected'));
    $$('.square').forEach(sq => sq.classList.remove('drop-target', 'drop-invalid', 'held-source'));
    updateSetupHint();
    state.selectedRackPiece = null;
    $$('.rack-piece').forEach(x => x.classList.remove('selected'));
    state.history = [];
    state.historyIndex = -1;
    renderAll();
    requestEngineEval();
    toast('Position set', 'success');
  });

  // Position setup advanced controls
  $('btnSetupUndo').addEventListener('click', setupUndo);
  $('btnSetupRedo').addEventListener('click', setupRedo);
  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
  });
  $('btnLoadStandard').addEventListener('click', () => loadPreset('standard'));

  $('btnClearBoard').addEventListener('click', clearBoard);

  $('btnLoadFen').addEventListener('click', loadFen);
  $('btnCopyFen').addEventListener('click', copyFen);

  $('btnPrevMove').addEventListener('click', prevMove);
  $('btnNextMove').addEventListener('click', nextMove);
  $('btnDeleteMove').addEventListener('click', deleteMove);
  $('btnAddVariation').addEventListener('click', () => {
    const fen = state.game.fen();
    if (!state.variations.includes(fen)) state.variations.push(fen);
    toast('Variation saved', 'success');
  });

  $('btnEngineToggle').addEventListener('click', toggleEngine);
  // Toggle left sidebar (Tools) visibility
  $('btnToggleLeftSidebar').addEventListener('click', () => {
    els.layout.classList.toggle('left-sidebar-visible');
    setTimeout(autoFitBoard, 50);
  });

  $('btnHideEngine').addEventListener('click', hideEngine);
  $('engineDepth').addEventListener('change', (e) => setEngineDepth(e.target.value));
  $('engineMultiPV').addEventListener('change', (e) => setEngineMultiPV(e.target.value));

  $$('.theme-btn').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  $('pieceStyle').addEventListener('change', (e) => { state.pieceStyle = e.target.value; renderBoard(); });

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

  // Zoom buttons removed — board auto-fits to available space


  window.addEventListener('resize', () => { autoFitBoard(); renderAnnotations(); });
  setTimeout(autoFitBoard, 200);

  els.board.addEventListener('click', () => {
    if (state.clock.running) setTimeout(switchClockSide, 100);
  });

  // Prevent right-click menu on board AND erase piece in setup mode
  els.board.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.setupMode) {
      const sq = e.target.closest('.square');
      if (sq) {
        erasePieceAt(sq.dataset.square);
      }
    }
  });

  // Double-click: pick up piece under cursor (in setup mode)
  els.board.addEventListener('dblclick', (e) => {
    if (!state.setupMode) return;
    const sq = e.target.closest('.square');
    if (!sq) return;
    const sqName = sq.dataset.square;
    const piece = getPieceAt(sqName);
    if (piece) {
      pickPieceFromBoard(sqName);
      toast(`Picked ${pieceName(piece)} from ${sqName} — click destination.`);
    }
  });

  // Allow drop on board squares
  els.board.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  els.board.addEventListener('drop', (e) => {
    e.preventDefault();
    const sq = e.target.closest('.square');
    if (!sq) return;
    const sqName = sq.dataset.square;
    const piece = e.dataTransfer.getData('text/plain') || state.dragPiece;
    if (piece) {
      placePieceOnSetup(sqName, piece);
      toast(`Dropped ${pieceName(piece)} on ${sqName}`);
    }
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
  safeCall('initInlinePieceRack', initInlinePieceRack);
  renderLibrary();
  renderChapterSelect();
  loadPuzzleToEditor(null);
  pushSetupHistory(); // initial state
  updatePieceCount();
  updateSetupHint();
  // Library / Puzzle editor event listeners
  $('librarySearch').addEventListener('input', (e) => renderLibrary(e.target.value));
  $('btnNewChapter').addEventListener('click', () => {
    const name = prompt('Chapter name:', 'New Chapter');
    if (!name || !name.trim()) return;
    const lib = getLibrary();
    const newChap = { id: uniqueId('chapter'), name: name.trim(), expanded: true, puzzles: [] };
    lib.chapters.push(newChap);
    lib.activeChapterId = newChap.id;
    saveLibrary(lib);
    renderLibrary($('librarySearch')?.value || '');
    renderChapterSelect();
    toast(`Chapter "${name.trim()}" created`, 'success');
  });
  $('btnSavePuzzle').addEventListener('click', saveCurrentPuzzle);
  $('btnNewPuzzle').addEventListener('click', newPuzzle);
  $('btnToggleAuthoring').addEventListener('click', () => {
    if (isAuthoringMode()) exitAuthoringMode();
    else enterAuthoringForNewPuzzle();
  });
  $('btnQuickChapter').addEventListener('click', () => $('btnNewChapter').click());
  $('btnQuickPuzzle').addEventListener('click', enterAuthoringForNewPuzzle);
  $('btnQuickTest').addEventListener('click', testPuzzleAsStudent);

  // Authoring toolbar buttons
  $('btnAuthoringCapture').addEventListener('click', captureCurrentPosition);
  $('btnAuthoringLoad').addEventListener('click', () => loadFENToBoard($('puzzleFen').value.trim()));
  $('btnAuthoringSave').addEventListener('click', saveCurrentPuzzle);
  $('btnAuthoringTest').addEventListener('click', testPuzzleAsStudent);
  $('btnAuthoringNew').addEventListener('click', enterAuthoringForNewPuzzle);
  $('btnAuthoringExit').addEventListener('click', exitAuthoringMode);
  $('btnDeletePuzzle').addEventListener('click', deleteCurrentPuzzle);
  $('btnCapturePosition').addEventListener('click', captureCurrentPosition);
  $('btnLoadPosition').addEventListener('click', () => loadFENToBoard($('puzzleFen').value.trim()));

  // Inline position setup (inside puzzle editor)
  $('btnToggleInlineSetup').addEventListener('click', toggleInlineSetup);
  $('btnInlineSetupUndo').addEventListener('click', inlineSetupUndo);
  $('btnInlineSetupRedo').addEventListener('click', inlineSetupRedo);
  $('btnInlineClearBoard').addEventListener('click', () => {
    clearBoard();
    updateInlinePieceCount();
    updateInlineSetupHint();
    toast('Board cleared', 'success');
  });
  $('btnInlineLoadStandard').addEventListener('click', () => loadPreset('standard'));
  $('btnInlineCaptureToPuzzle').addEventListener('click', inlineCaptureToPuzzle);
  $$('.preset-btn-mini').forEach(btn => {
    btn.addEventListener('click', () => {
      loadPreset(btn.dataset.preset);
      updateInlinePieceCount();
      updateInlineSetupHint();
      // auto-capture the preset FEN to the puzzle's FEN field
      inlineCaptureToPuzzle();
    });
  });
  $('btnTestPuzzle').addEventListener('click', testPuzzleAsStudent);
  $('btnExportLibrary').addEventListener('click', exportLibrary);
  $('btnImportLibrary').addEventListener('click', () => $('libraryFileInput').click());
  $('libraryFileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) importLibrary(e.target.files[0]);
    e.target.value = '';
  });

  safeCall('bindEvents', bindEvents);

  // Try to init engine, but don't block the rest
  setTimeout(() => safeCall('initEngine', initEngine), 50);

  safeCall('updateClocks', updateClocks);

  console.log('ChessX initialized successfully');
}

// Fallback: if DOMContentLoaded already fired (script loaded late), init immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
