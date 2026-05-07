import * as G from '../engine/game.js';
import { render, setHandlers } from './render.js';
import { HostPeer, ClientPeer } from '../net/peer.js';
import { sanitizeForClient } from '../net/protocol.js';

// ─────────── Estado UI / modo ───────────
const ui = {
  hotSeat: true,
  viewerIdx: 0,
  selection: new Set(),
  selectedMeldId: null,
  pendingPass: false, // pass screen activa (hot-seat)
};

let mode = 'menu';      // 'menu' | 'local' | 'host' | 'client'
let state = G.newGame({ targetScore: 5000 });
let net = null;         // HostPeer | ClientPeer

// ─────────── Helpers UI ───────────
function flash(msg) {
  state.message = msg;
  rerender();
}
function clearSelection() {
  ui.selection = new Set();
  ui.selectedMeldId = null;
}
function rerender() { render(state, ui); }
function selectedIds() { return Array.from(ui.selection); }

// ─────────── Lobby ───────────
const lobby = document.getElementById('lobby');
const lobbyMsg = document.getElementById('lobby-msg');
const codeInput = document.getElementById('code-input');
const roomCodeShow = document.getElementById('room-code-show');
const roomCodeBox = document.getElementById('room-code-box');

function showLobby() { lobby.hidden = false; document.body.classList.add('lobby-open'); }
function hideLobby() { lobby.hidden = true; document.body.classList.remove('lobby-open'); }
function setLobbyMsg(msg, kind = 'info') {
  lobbyMsg.textContent = msg;
  lobbyMsg.classList.toggle('error', kind === 'error');
}
function buzz() { try { navigator.vibrate?.(60); } catch {} }

// ─────────── Pass screen (hot-seat) ───────────
const passScreen = document.getElementById('pass-screen');
const passTitle = document.getElementById('pass-title');
function showPassScreen(playerIdx) {
  ui.pendingPass = true;
  passTitle.textContent = `Jugador ${playerIdx + 1}`;
  passScreen.hidden = false;
  rerender();
}
function hidePassScreen() {
  ui.pendingPass = false;
  passScreen.hidden = true;
  rerender();
}
document.getElementById('btn-pass-ready').addEventListener('click', hidePassScreen);

// Si en local cambia el turno, mostramos pantalla de pase.
function maybePass(prevTurn) {
  if (mode !== 'local') return;
  if (state.phase !== 'draw' && state.phase !== 'play') return;
  if (state.turn === prevTurn) return;
  showPassScreen(state.turn);
}
function flashInputError() {
  codeInput.classList.add('error');
  setTimeout(() => codeInput.classList.remove('error'), 600);
  buzz();
}

document.getElementById('btn-mode-local').addEventListener('click', () => {
  mode = 'local';
  ui.hotSeat = true;
  state = G.newGame({ targetScore: 5000 });
  state = G.newRound(state);
  clearSelection();
  hideLobby();
  showPassScreen(state.turn);
});

document.getElementById('btn-mode-host').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (btn.disabled) return;
  btn.disabled = true;
  setLobbyMsg('Conectando con el broker de PeerJS…');
  try {
    if (net) { net.destroy(); net = null; }
    net = new HostPeer();
    net.on('clientConnected', onClientConnected);
    net.on('clientDisconnected', () => flash('Rival desconectado. Esperando reconexión…'));
    net.on('intent', onClientIntent);
    net.on('error', err => setLobbyMsg('Error: ' + (err?.type || err?.message || err), 'error'));
    const code = await net.start();
    mode = 'host';
    ui.hotSeat = false;
    ui.viewerIdx = 0;
    state = G.newGame({ targetScore: 5000 });
    roomCodeShow.textContent = code;
    roomCodeBox.hidden = false;
    setLobbyMsg('Compartí el código y esperá al rival.');
  } catch (err) {
    setLobbyMsg('No pude crear la sala: ' + (err?.type || err?.message || err), 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-mode-client').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (btn.disabled) return;
  const code = (codeInput.value || '').trim().toUpperCase();
  if (!code || code.length < 4) {
    setLobbyMsg('Escribí primero el código de la sala (ej: K7M2PQ).', 'error');
    flashInputError();
    codeInput.focus();
    return;
  }
  btn.disabled = true;
  setLobbyMsg('Conectando a sala ' + code + '…');
  try {
    if (net) { net.destroy(); net = null; }
    net = new ClientPeer();
    net.on('message', onHostMessage);
    net.on('disconnected', () => flash('Te desconectaste del host.'));
    net.on('busy', () => setLobbyMsg('La sala ya tiene 2 jugadores.', 'error'));
    net.on('error', err => setLobbyMsg('Error: ' + (err?.type || err?.message || err), 'error'));
    await net.connect(code);
    mode = 'client';
    ui.hotSeat = false;
    ui.viewerIdx = 1;
    setLobbyMsg('Conectado. Esperando estado del host…');
  } catch (err) {
    setLobbyMsg('No pude conectar: ' + (err?.type || err?.message || err), 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-leave').addEventListener('click', () => {
  if (!confirm('¿Salir de la sala / partida?')) return;
  if (net) { net.destroy(); net = null; }
  mode = 'menu';
  state = G.newGame({ targetScore: 5000 });
  roomCodeBox.hidden = true;
  codeInput.value = '';
  setLobbyMsg('');
  showLobby();
  rerender();
});

// ─────────── Host: callbacks de red ───────────
function broadcastState() {
  if (mode !== 'host' || !net) return;
  const sanitized = sanitizeForClient(state, 1);
  net.send({ type: 'STATE', state: sanitized });
}

function onClientConnected() {
  setLobbyMsg('Rival conectado. Repartiendo…');
  // Empezar mano si todavía no empezó
  if (state.phase === 'gameStart') state = G.newRound(state);
  hideLobby();
  broadcastState();
  rerender();
}

function onClientIntent(msg) {
  if (mode !== 'host' || !msg || msg.type !== 'INTENT') return;
  const action = msg.action;
  const p = msg.payload || {};
  // El cliente siempre es viewerIdx=1
  const r = applyAction(action, 1, p);
  if (r?.error) {
    net.send({ type: 'ERROR', message: r.error });
    return;
  }
  broadcastState();
  rerender();
}

// ─────────── Client: callbacks de red ───────────
function onHostMessage(msg) {
  if (!msg) return;
  if (msg.type === 'STATE') {
    state = msg.state;
    clearSelection();
    hideLobby();
    rerender();
  } else if (msg.type === 'ERROR') {
    flash('Host: ' + msg.message);
  }
}

// ─────────── Aplicar acción según modo ───────────
function applyAction(action, playerIdx, payload) {
  switch (action) {
    case 'newRound':     state = G.newRound(state); return { ok: true };
    case 'drawStock':    return G.drawStock(state, playerIdx);
    case 'takeDiscard':  return G.takeDiscard(state, playerIdx);
    case 'meldNew':      return G.meldNew(state, playerIdx, payload.cardIds);
    case 'meldAdd':      return G.meldAdd(state, playerIdx, payload.meldId, payload.cardIds);
    case 'discard':      return G.discard(state, playerIdx, payload.cardId);
    case 'goOut':        return G.goOut(state, playerIdx, payload.lastDiscardCardId);
    default:             return { error: 'Acción desconocida: ' + action };
  }
}

// dispatch desde la UI: en local/host ejecuta, en client envía intent.
function dispatch(action, payload = {}) {
  if (mode === 'client') {
    net?.send({ type: 'INTENT', action, payload });
    clearSelection();
    return;
  }
  const prevTurn = state.turn;
  const playerIdx = mode === 'host' ? 0 : state.turn; // host = J1 (idx 0); local = jugador del turno
  const r = applyAction(action, playerIdx, payload);
  if (r?.error) return flash(r.error);
  if (mode === 'host') broadcastState();
  clearSelection();
  if (action === 'newRound' && mode === 'local') {
    showPassScreen(state.turn);
    return;
  }
  maybePass(prevTurn);
  rerender();
}

// ─────────── Botones de juego ───────────
document.getElementById('btn-new-round').addEventListener('click', () => {
  if (mode === 'menu') return showLobby();
  if (state.phase !== 'gameStart' && state.phase !== 'roundEnd' && state.phase !== 'gameEnd') {
    if (!confirm('¿Reiniciar la mano actual?')) return;
  }
  dispatch('newRound');
});

document.getElementById('btn-new-game').addEventListener('click', () => {
  if (mode === 'client') return flash('Solo el host puede reiniciar el partido.');
  if (!confirm('¿Empezar un nuevo partido (resetear puntaje)?')) return;
  state = G.newGame({ targetScore: 5000 });
  if (mode === 'host') broadcastState();
  clearSelection();
  rerender();
});

document.getElementById('btn-draw-stock').addEventListener('click', () => dispatch('drawStock'));
document.getElementById('btn-take-discard').addEventListener('click', () => dispatch('takeDiscard'));
document.getElementById('btn-meld').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length === 0) return flash('Seleccioná cartas para bajar.');
  dispatch('meldNew', { cardIds: ids });
});
document.getElementById('btn-add-meld').addEventListener('click', () => {
  if (!ui.selectedMeldId) return flash('Tocá primero un juego para agregar.');
  const ids = selectedIds();
  if (ids.length === 0) return flash('Seleccioná cartas para agregar.');
  dispatch('meldAdd', { meldId: ui.selectedMeldId, cardIds: ids });
});
document.getElementById('btn-discard').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length !== 1) return flash('Seleccioná exactamente 1 carta para descartar.');
  dispatch('discard', { cardId: ids[0] });
});
document.getElementById('btn-go-out').addEventListener('click', () => {
  const ids = selectedIds();
  const lastDiscardCardId = ids.length === 1 ? ids[0] : null;
  dispatch('goOut', { lastDiscardCardId });
});

// ─────────── Compartir / link de invitación ───────────
function shareLink(code) {
  const u = new URL(window.location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('room', code);
  return u.toString();
}

document.getElementById('btn-copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCodeShow.textContent.trim());
    setLobbyMsg('Código copiado.');
  } catch {
    setLobbyMsg('No pude copiar — copialo a mano.', 'error');
  }
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  const code = roomCodeShow.textContent.trim();
  if (!code || code === '------') return;
  const link = shareLink(code);
  try {
    await navigator.clipboard.writeText(link);
    setLobbyMsg('Link copiado: ' + link);
  } catch {
    setLobbyMsg(link, 'error');
  }
});

document.getElementById('btn-share-link').addEventListener('click', async () => {
  const code = roomCodeShow.textContent.trim();
  if (!code || code === '------') return;
  const link = shareLink(code);
  const text = `Te invito a jugar Canasta. Código: ${code}\n${link}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Canasta', text, url: link }); }
    catch { /* user cancelled */ }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      setLobbyMsg('Compartido al portapapeles. Pegalo en WhatsApp.');
    } catch {
      setLobbyMsg(text, 'error');
    }
  }
});

// ─────────── Gestos: tap mazo / doble-tap descarte ───────────
document.getElementById('stock').addEventListener('click', () => {
  if (state.phase !== 'draw') return;
  dispatch('drawStock');
});
document.getElementById('discard').addEventListener('click', () => {
  if (state.phase !== 'draw') return;
  dispatch('takeDiscard');
});
setHandlers({
  onCardDoubleTap: (cardId) => {
    if (state.phase !== 'play') return;
    // Limpiar selección previa para no interferir con el descarte
    ui.selection = new Set();
    dispatch('discard', { cardId });
  },
});

// ─────────── Boot ───────────
showLobby();
rerender();

// Si llegan con ?room=XXX en la URL, prellenar y auto-unirse
(function autoJoinFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get('room') || '').trim().toUpperCase();
    if (!code || code.length < 4) return;
    codeInput.value = code;
    setLobbyMsg('Sala detectada en el link. Tocá "Unirse" para conectarte.');
    // Auto-conectar después de un tick (que se hidrate todo primero)
    setTimeout(() => document.getElementById('btn-mode-client').click(), 200);
  } catch {}
})();
