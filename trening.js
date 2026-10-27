import {Chess} from "./chess.js";
const SZ = window.SZ, $ = SZ.$;
const PIECE = {k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟\uFE0E"};
const PLN = {N:"S", B:"G", R:"W", Q:"H"};
const pl = s => (PLN[s[0]] || s[0]) + s.slice(1);
const S = 40, O = 18;
const LEVELS = [
  {n:"1. Początkujący", skill:0, depth:1},
  {n:"2. Łatwy", skill:3, depth:4},
  {n:"3. Średni", skill:8, depth:8},
  {n:"4. Trudny", skill:14, depth:12},
  {n:"5. Mistrz", skill:20, depth:16}
];
let game = new Chess(), flip = false, sel = null, targets = [], last = null, promo = null, hint = null;
let mode = "self", worker = null, thinking = false, busyMsg = "", token = 0;

function pos(sq){
  const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
  return [O + (flip ? 7 - f : f) * S, O + (flip ? r : 7 - r) * S];
}
function squareAt(x, y){
  const col = Math.floor((x - O) / S), row = Math.floor((y - O) / S);
  if(col < 0 || col > 7 || row < 0 || row > 7) return null;
  return "abcdefgh"[flip ? 7 - col : col] + ((flip ? row : 7 - row) + 1);
}
function kingSq(color){
  for(const row of game.board()) for(const p of row) if(p && p.type === "k" && p.color === color) return p.square;
  return null;
}
const engineColor = () => mode === "w" ? "b" : mode === "b" ? "w" : null;
function note(t){ $("trHint").textContent = t || ""; }

function draw(){
  let h = '<svg viewBox="0 0 356 356" class="bd" role="img" aria-label="Szachownica treningowa">';
  for(let r = 0; r < 8; r++) for(let c = 0; c < 8; c++)
    h += '<rect class="' + ((r + c) % 2 ? "sd" : "sl") + '" x="' + (O + c * S) + '" y="' + (O + r * S) + '" width="40" height="40"/>';
  const rect = (sq, fill) => { const p = pos(sq); return '<rect x="' + p[0] + '" y="' + p[1] + '" width="40" height="40" fill="' + fill + '"/>'; };
  if(last) h += rect(last.from, "rgba(240,178,68,.5)") + rect(last.to, "rgba(240,178,68,.5)");
  if(game.isCheck()){ const k = kingSq(game.turn()); if(k) h += rect(k, "rgba(179,64,47,.65)"); }
  if(sel) h += rect(sel, "rgba(240,178,68,.75)");
  for(let i = 0; i < 8; i++){
    h += '<text class="co" x="' + (O + i * S + 20) + '" y="347" text-anchor="middle">' + "abcdefgh"[flip ? 7 - i : i] + '</text>';
    h += '<text class="co" x="9" y="' + (O + i * S + 24) + '" text-anchor="middle">' + (flip ? i + 1 : 8 - i) + '</text>';
  }
  for(const row of game.board()) for(const p of row){
    if(!p) continue;
    const q = pos(p.square);
    h += '<text class="' + (p.color === "w" ? "pw" : "pb") + '" x="' + (q[0] + 20) + '" y="' + (q[1] + 20) + '" text-anchor="middle" dy=".35em" font-size="34">' + PIECE[p.type] + '</text>';
  }
  if($("trHints").checked) targets.forEach(t => {
    const q = pos(t.to), cx = q[0] + 20, cy = q[1] + 20;
    h += t.captured || t.flags.includes("e")
      ? '<circle cx="' + cx + '" cy="' + cy + '" r="18" fill="none" stroke="rgba(47,125,91,.75)" stroke-width="4"/>'
      : '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="rgba(47,125,91,.7)"/>';
  });
  if(hint){
    const p = pos(hint.from), q = pos(hint.to), x1 = p[0] + 20, y1 = p[1] + 20, x2 = q[0] + 20, y2 = q[1] + 20;
    const dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L, ex = x2 - ux * 14, ey = y2 - uy * 14;
    h += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + ex + '" y2="' + ey + '" stroke="#2f7d5b" stroke-width="6" stroke-linecap="round" opacity=".9"/>';
    h += '<polygon points="' + x2 + ',' + y2 + ' ' + (ex - uy * 9) + ',' + (ey + ux * 9) + ' ' + (ex + uy * 9) + ',' + (ey - ux * 9) + '" fill="#2f7d5b"/>';
  }
  $("trBd").innerHTML = h + '</svg>';
  let t;
  if(thinking) t = busyMsg;
  else if(game.isCheckmate()) t = "Mat. Wygrywają " + (game.turn() === "w" ? "czarne" : "białe") + ".";
  else if(game.isStalemate()) t = "Pat. Remis.";
  else if(game.isDraw()) t = "Remis (" + (game.isInsufficientMaterial() ? "za mało materiału" : game.isThreefoldRepetition() ? "trzykrotne powtórzenie pozycji" : "reguła 50 ruchów") + ").";
  else t = "Ruch: " + (game.turn() === "w" ? "białe" : "czarne") + (game.isCheck() ? " (szach!)" : "");
  $("trStatus").textContent = t;
  let o = ""; game.history().forEach((s, i) => { if(i % 2 === 0) o += (i / 2 + 1) + ". "; o += pl(s) + " "; });
  $("trMoves").textContent = o.trim() || "Brak ruchów. Dotknij figury, żeby ją przesunąć.";
  const n = game.history().length;
  $("trUndo").disabled = !n || thinking || (mode === "b" && n <= 1);
  $("trAn").disabled = !n;
  $("trHintBtn").disabled = thinking || game.isGameOver();
  $("trLevel").disabled = mode === "self";
  $("trPromo").hidden = !promo;
}

// ---- Silnik ----
function startEngine(){
  return new Promise((res, rej) => {
    try { worker = new Worker("stockfish-19-lite-single.js"); } catch(e){ rej(e); return; }
    let ready = false;
    worker.onerror = e => rej(e);
    worker.onmessage = e => {
      const l = String(e.data);
      if(l === "uciok") worker.postMessage("isready");
      else if(l === "readyok" && !ready){ ready = true; res(); }
    };
    worker.postMessage("uci");
  });
}
async function ask(fen, skill, depth, ms){
  if(!worker) await startEngine();
  return new Promise(res => {
    let lastInfo = null;
    worker.onmessage = e => {
      const l = String(e.data);
      if(l.startsWith("info") && / pv /.test(l) && !/bound/.test(l)){
        const m = l.match(/score (cp|mate) (-?\d+)/);
        if(m) lastInfo = {t:m[1], v:+m[2]};
      } else if(l.startsWith("bestmove")){
        const b = l.split(" ")[1];
        res({last:lastInfo, best:b && b !== "(none)" ? b : null});
      }
    };
    worker.postMessage("setoption name Skill Level value " + skill);
    worker.postMessage("position fen " + fen);
    worker.postMessage("go depth " + depth + " movetime " + ms);
  });
}
function cancel(){
  token++;
  if(thinking){ thinking = false; try { worker.terminate(); } catch(e){} worker = null; }
}
const engErr = () => { thinking = false; worker = null; note("Nie udało się uruchomić silnika. Sprawdź, czy pliki stockfish-19-lite-single.js i .wasm leżą obok index.html."); draw(); };

async function maybeEngine(){
  const ec = engineColor();
  if(!ec || game.turn() !== ec || game.isGameOver() || thinking) return;
  thinking = true; busyMsg = "Stockfish myśli..."; const my = ++token; draw();
  try {
    const lv = LEVELS[+$("trLevel").value];
    const r = await ask(game.fen(), lv.skill, lv.depth, 1500);
    if(my !== token) return;
    thinking = false;
    if(r.best) play({from:r.best.slice(0, 2), to:r.best.slice(2, 4), promotion:r.best[4]});
    else draw();
  } catch(e){ if(my === token) engErr(); }
}
async function getHint(){
  if(thinking || game.isGameOver()) return;
  thinking = true; busyMsg = "Szukam najlepszego ruchu..."; const my = ++token; note(""); draw();
  try {
    const fen = game.fen();
    const r = await ask(fen, 20, 14, 1500);
    if(my !== token) return;
    thinking = false;
    if(r.best){
      hint = {from:r.best.slice(0, 2), to:r.best.slice(2, 4)};
      let san = r.best;
      try { san = pl(new Chess(fen).move({from:hint.from, to:hint.to, promotion:r.best[4]}).san); } catch(e){}
      let ev = "";
      if(r.last){
        const sg = fen.split(" ")[1] === "w" ? 1 : -1;
        ev = r.last.t === "mate" ? " (mat w " + Math.abs(r.last.v) + ")" : " (ocena dla białych: " + ((r.last.v * sg) / 100 > 0 ? "+" : "") + ((r.last.v * sg) / 100).toFixed(1) + ")";
      }
      note("Podpowiedź: " + san + ev + ". Strzałka na planszy.");
    }
    draw();
  } catch(e){ if(my === token) engErr(); }
}

// ---- Ruchy ----
function play(m){
  try { game.move(m); } catch(e){ return; }
  last = {from:m.from, to:m.to}; sel = null; targets = []; promo = null; hint = null; note(""); draw(); maybeEngine();
}
function reset(){
  cancel(); game = new Chess(); sel = null; targets = []; last = null; promo = null; hint = null; note(""); draw(); maybeEngine();
}
$("trBd").addEventListener("click", e => {
  if(thinking) return;
  const svg = $("trBd").querySelector("svg"); if(!svg) return;
  const r = svg.getBoundingClientRect();
  const sq = squareAt((e.clientX - r.left) / r.width * 356, (e.clientY - r.top) / r.height * 356);
  if(promo) promo = null;
  if(!sq || game.isGameOver()){ sel = null; targets = []; draw(); return; }
  const hit = sel ? targets.filter(t => t.to === sq) : [];
  if(hit.length){
    if(hit[0].promotion){ promo = {from:sel, to:sq}; draw(); return; }
    play({from:sel, to:sq}); return;
  }
  const p = game.get(sq);
  if(p && p.color === game.turn() && sq !== sel){ sel = sq; targets = game.moves({square:sq, verbose:true}); }
  else { sel = null; targets = []; }
  draw();
});
$("trPromo").addEventListener("click", e => {
  const b = e.target.closest ? e.target.closest("button") : null;
  if(b && promo) play({from:promo.from, to:promo.to, promotion:b.dataset.p});
});
$("trUndo").addEventListener("click", () => {
  cancel(); game.undo();
  const ec = engineColor();
  if(ec && game.turn() === ec && game.history().length) game.undo();
  sel = null; targets = []; promo = null; hint = null; note("");
  const h = game.history({verbose:true}); last = h.length ? {from:h[h.length - 1].from, to:h[h.length - 1].to} : null;
  draw(); maybeEngine();
});
$("trNew").addEventListener("click", () => {
  if(game.history().length && !confirm("Zacząć nową partię? Obecna zostanie usunięta.")) return;
  reset();
});
$("trFlip").addEventListener("click", () => { flip = !flip; draw(); });
$("trHints").addEventListener("change", draw);
$("trHintBtn").addEventListener("click", getHint);
$("trMode").addEventListener("change", () => {
  const nm = $("trMode").value;
  if(game.history().length && !confirm("Zmiana trybu rozpocznie nową partię. Kontynuować?")){ $("trMode").value = mode; return; }
  mode = nm; flip = mode === "b"; reset();
});
$("trAn").addEventListener("click", () => { $("pgn").value = game.pgn(); SZ.showView("an"); });
$("trLevel").innerHTML = LEVELS.map((l, i) => '<option value="' + i + '"' + (i === 1 ? " selected" : "") + '>' + l.n + '</option>').join("");
draw();
