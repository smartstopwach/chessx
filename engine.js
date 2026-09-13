// Stockfish engine via Web Worker
// stockfish.js@10.0.2 is a Web Worker script — we load it in a Worker

class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.listeners = [];
    this.failed = false;
  }

  init() {
    if (this.worker || this.failed) return;
    try {
      // Load stockfish.js as a web worker - use local file to avoid CORS
      // The worker tries to load WASM files which need to be served with proper MIME types
      this.worker = new Worker('stockfish-worker.js');
      this.worker.onmessage = (e) => this._handle(e.data);
      this.worker.onerror = (e) => {
        console.error('Stockfish worker error:', e);
        this.failed = true;
        if (this.worker) { this.worker.terminate(); this.worker = null; }
      };
      this.postMessage('uci');
      this.postMessage('isready');
    } catch (err) {
      console.warn('Stockfish unavailable:', err.message || err);
      this.failed = true;
    }
  }

  postMessage(cmd) {
    try {
      if (this.worker) this.worker.postMessage(cmd);
    } catch (e) { this.failed = true; }
  }

  onMessage(fn) {
    this.listeners.push(fn);
  }

  _handle(line) {
    if (typeof line !== 'string') return;
    if (line === 'uciok') {
      this.ready = true;
    }
    this.listeners.forEach(fn => fn(line));
  }

  newGame() {
    this.postMessage('ucinewgame');
    this.postMessage('isready');
  }

  setPosition(fen) {
    this.postMessage(`position fen ${fen}`);
  }

  go(depth) {
    this.postMessage(`go depth ${depth}`);
  }

  stop() {
    this.postMessage('stop');
  }

  setMultiPV(n) {
    this.postMessage(`setoption name MultiPV value ${n}`);
  }
}

window.StockfishEngine = StockfishEngine;
