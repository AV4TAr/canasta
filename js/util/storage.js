// Persistencia simple en localStorage para la partida en modo 'local'.

const KEY = 'canasta:local:v1';

export function saveLocal(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: Date.now(),
      state,
    }));
  } catch {
    // quota llena, modo privado, etc — ignoramos.
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.state) return null;
    return obj;
  } catch {
    return null;
  }
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function describeSave(saved) {
  if (!saved) return '';
  const s = saved.state;
  const ago = Math.max(0, Math.round((Date.now() - saved.savedAt) / 60000));
  const phase = s.phase === 'gameEnd' ? 'fin del partido'
    : s.phase === 'roundEnd' ? 'fin de mano'
    : `turno J${(s.turn ?? 0) + 1}`;
  const score = `J1 ${s.players?.[0]?.score ?? 0} · J2 ${s.players?.[1]?.score ?? 0}`;
  const when = ago === 0 ? 'recién' : `hace ${ago}m`;
  return `${score} · ${phase} · ${when}`;
}
