# ♟️ ChessX — Professional Chess Teaching Studio

A complete, professional chess teaching and screen-recording web app built for chess teachers and content creators who want to make high-quality educational chess videos.

## 🎯 What is ChessX?

ChessX is a **single-page, browser-based chess studio** designed for recording chess teaching videos. Unlike traditional chess platforms focused on playing or studying, ChessX combines a professional analysis board, drawing tools, Stockfish integration, position editor, lesson management, and built-in screen recording — all optimized for clean screen capture.

## ✨ Key Features

### 🎓 Professional Chessboard
- Drag & drop and click-to-move
- Legal move highlighting, last-move highlighting, check indication
- Board coordinates, flip, reset, undo
- Fullscreen and zoom controls
- 6 board themes (Classic, Tournament, Wooden, Dark, Minimal, Green)
- 3 piece styles (Alpha, Merida, Classic)

### ✏️ Teaching Drawing Tools
- Arrows (drag from one square to another)
- Circles (click to toggle)
- Square highlights
- Rectangle highlight areas
- Eraser (per-square)
- 7 colors
- "Clear all annotations" button

### 🧩 Position Setup
- Visual piece rack to add/remove pieces
- Castling rights toggles
- Side-to-move selector
- FEN input + paste + copy
- "Start from position" button

### 📜 Move List
- Clean SAN notation
- Click any move to jump to it
- Previous/Next/Delete
- Variation support
- Compact panel that doesn't distract during recording

### 🤖 Stockfish Analysis
- Real evaluation, best move, PV
- Configurable depth (10/15/20/25)
- Multi-PV (1/2/3/4)
- Eval bar visualization
- **"Hide Engine"** button — critical for clean recording

### 🎥 Recording Mode (one-click)
- Activated with the prominent red **RECORDING MODE** button
- Hides everything except the board, lesson title, and essential teaching controls
- Maximizes board size for video
- Toggle to fully hide UI for clean video capture

### 🖼️ Layout Presets (4)
- **Board Only** — huge board
- **Board + Moves** — board + move list
- **Board + Explanation** — board + notes
- **Presentation** — almost fullscreen

### 📝 Lesson Title & Subtitle
- Show above the board
- Toggle to hide before recording

### 📋 Teacher Notes Panel
- Markdown-friendly text area
- Hide/show toggle
- Auto-saved with lessons

### 🔖 Position Bookmarks
- Save, name, and navigate important positions
- Keyboard shortcuts: **N** (next), **P** (previous)

### ❓ Puzzle / Question Mode
- Display "YOUR MOVE?" with custom question
- Computes the best move from Stockfish
- "REVEAL ANSWER" button
- Perfect for YouTube "guess the move" segments

### ⏱️ Chess Clock
- Blitz / Rapid / Classical presets
- Custom time
- Hide/show toggle

### ⌨️ Keyboard Shortcuts
| Key | Action |
|---|---|
| `←` / `→` | Previous / Next move |
| `F` | Flip board |
| `R` | Reset board |
| `V` | Select tool |
| `A` | Arrow tool |
| `C` | Circle tool |
| `E` | Eraser tool |
| `H` | Highlight tool (or hide UI in recording mode) |
| `N` / `P` | Next / Previous bookmark |
| `Ctrl+Z` | Undo |
| `Esc` | Exit recording mode |

### 💾 Save / Load / Export
- **Save Lesson** — exports full lesson as JSON (position + moves + annotations + notes + bookmarks + theme)
- **Load Lesson** — restore from JSON
- **Export PGN** — download game as PGN
- **Import** — JSON or PGN
- Auto-saves current lesson to localStorage

### 🎬 Built-in Screen Recording
- Uses browser `getDisplayMedia` API
- Records entire screen / window / tab
- Optional microphone audio integration
- Pause / Resume / Stop controls
- Live timer
- Preview and download after stop
- Falls back gracefully to OBS instructions if permission denied

### 🎙 Microphone Support
- Toggle on/off
- Optional integration with screen recording for full video + audio capture

### 🎨 6 Board Themes + 3 Piece Sets
- Classic, Tournament, Wooden, Dark, Minimal, Green

### 📱 Responsive Design
- Optimized for Windows, Mac, iPad (landscape), Android tablets
- Rearranges panels on small screens

## 🚀 Usage

It's a pure static website. Open `index.html` in any modern browser, or serve the folder with any static server:

```bash
# Python 3
python3 -m http.server 8000

# Node
npx serve
```

Then visit `http://localhost:8000`.

## 🌐 Browser Compatibility

Works on all modern Chromium / Firefox / Safari browsers. Screen recording requires Chromium-based browsers (Chrome, Edge, Brave, Opera) for full API support.

## 📦 Tech Stack

- **Vanilla JavaScript** — no build step, no framework overhead
- **[chess.js](https://github.com/jhlywa/chess.js)** — move validation & FEN/PGN
- **[Stockfish.js](https://github.com/nmrugg/stockfish.js)** — engine analysis
- Pure CSS (no Tailwind, no Bootstrap)
- Browser MediaRecorder API for screen recording
- localStorage / IndexedDB for persistence
- SVG for crisp annotations

## 🪪 License

MIT
