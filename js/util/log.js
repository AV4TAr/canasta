// Logger en memoria con descarga como archivo de texto.

const _log = [];
const MAX = 5000;

export function logEvent(kind, data) {
  const entry = {
    t: new Date().toISOString(),
    kind,
    data: data ?? null,
  };
  _log.push(entry);
  if (_log.length > MAX) _log.splice(0, _log.length - MAX);
  // También a la consola para debugging en vivo
  // eslint-disable-next-line no-console
  try { console.debug('[log]', kind, data); } catch {}
}

export function getLog() { return _log.slice(); }

export function clearLog() { _log.length = 0; }

function fmt(entry) {
  let body = '';
  if (entry.data !== null && entry.data !== undefined) {
    try { body = ' ' + JSON.stringify(entry.data); }
    catch { body = ' [unserializable]'; }
  }
  return `[${entry.t}] ${entry.kind}${body}`;
}

export function downloadLog(extra = {}) {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a');
  const header = [
    `=== Canasta debug log ===`,
    `Generated: ${new Date().toISOString()}`,
    `URL: ${typeof location !== 'undefined' ? location.href : 'n/a'}`,
    `UserAgent: ${ua}`,
    `Extra: ${JSON.stringify(extra)}`,
    `Entries: ${_log.length}`,
    ``,
  ].join('\n');
  const body = _log.map(fmt).join('\n');
  const text = header + body + '\n';

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `canasta-log-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  return text;
}
