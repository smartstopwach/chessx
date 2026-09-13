// Stockfish engine via Web Worker
// stockfish.js@10.0.2 is a Web Worker script — we load it in a Worker

class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.listeners = [];
  }

  init() {
    if (this.worker) return;
    try {
      // Load stockfish.js as a web worker - use local file to avoid CORS
      this.worker = new Worker('stockfish-worker.js');
      this.worker.onmessage = (e) => this._handle(e.data);
      this.worker.onerror = (e) => {
        console.error('Stockfish worker error:', e);
      };
      this.postMessage('uci');
      this.postMessage('isready');
    } catch (err) {
      console.error('Stockfish init failed:', err);
    }
  }

  postMessage(cmd) {
    if (this.worker) this.worker.postMessage(cmd);
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
