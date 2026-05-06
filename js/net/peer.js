// Wrapper sobre PeerJS (cargado desde CDN como global `Peer`).
// Modelo: host autoritativo. El host corre el motor; el cliente envía intents
// y recibe el estado sanitizado.

const PEERJS_PREFIX = 'canasta-room-'; // namespace para evitar colisiones globales

// Genera un código corto, fácil de leer/dictar (sin chars ambiguos).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

function newPeerJs(id) {
  // Usa el broker público gratuito de PeerJS (cloud).
  return new Peer(id, { debug: 1 });
}

export class HostPeer {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.handlers = {};
  }
  on(event, fn) { this.handlers[event] = fn; return this; }
  emit(event, ...args) { this.handlers[event]?.(...args); }

  async start({ retries = 5 } = {}) {
    for (let i = 0; i < retries; i++) {
      const code = makeRoomCode();
      const id = PEERJS_PREFIX + code;
      try {
        await this._tryStart(id);
        this.code = code;
        return code;
      } catch (e) {
        // Si el ID ya existe, probamos con otro código
        if (i === retries - 1) throw e;
      }
    }
  }

  _tryStart(id) {
    return new Promise((resolve, reject) => {
      const p = newPeerJs(id);
      const onError = e => {
        p.removeAllListeners?.('open');
        p.destroy();
        reject(e);
      };
      p.on('open', () => {
        p.off?.('error', onError);
        this.peer = p;
        this._wireConnections();
        resolve();
      });
      p.on('error', onError);
    });
  }

  _wireConnections() {
    this.peer.on('connection', conn => {
      // Solo aceptamos un cliente a la vez
      if (this.conn && this.conn.open) {
        conn.on('open', () => {
          conn.send({ type: 'BUSY' });
          setTimeout(() => conn.close(), 300);
        });
        return;
      }
      this.conn = conn;
      conn.on('open', () => this.emit('clientConnected'));
      conn.on('data', data => this.emit('intent', data));
      conn.on('close', () => {
        if (this.conn === conn) this.conn = null;
        this.emit('clientDisconnected');
      });
      conn.on('error', err => this.emit('error', err));
    });
    this.peer.on('error', err => this.emit('error', err));
    this.peer.on('disconnected', () => this.emit('brokerDisconnected'));
  }

  send(message) {
    if (this.conn && this.conn.open) this.conn.send(message);
  }

  destroy() {
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null; this.peer = null;
  }
}

export class ClientPeer {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.handlers = {};
  }
  on(event, fn) { this.handlers[event] = fn; return this; }
  emit(event, ...args) { this.handlers[event]?.(...args); }

  connect(roomCode) {
    return new Promise((resolve, reject) => {
      const p = newPeerJs(undefined); // ID aleatorio del broker
      let opened = false;
      p.on('open', () => {
        const conn = p.connect(PEERJS_PREFIX + roomCode, { reliable: true });
        conn.on('open', () => {
          opened = true;
          this.peer = p;
          this.conn = conn;
          conn.on('data', data => {
            if (data?.type === 'BUSY') {
              this.emit('busy');
              this.destroy();
              return;
            }
            this.emit('message', data);
          });
          conn.on('close', () => this.emit('disconnected'));
          conn.on('error', err => this.emit('error', err));
          resolve();
        });
        conn.on('error', err => {
          if (!opened) reject(err);
          else this.emit('error', err);
        });
      });
      p.on('error', err => {
        if (!opened) reject(err);
        else this.emit('error', err);
      });
    });
  }

  send(intent) {
    if (this.conn && this.conn.open) this.conn.send(intent);
  }

  destroy() {
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null; this.peer = null;
  }
}
