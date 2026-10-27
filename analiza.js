import {Chess} from "./chess.js";
const SZ = window.SZ, $ = SZ.$;
const PLN = {N:"S", B:"G", R:"W", Q:"H"};
const pl = s => (PLN[s[0]] || s[0]) + s.slice(1);
const win = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const SAMPLE = '[Event "Przykład: Smażona wątróbka"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 *';
const TYPES = ["", "Niedokładność (?!)", "Błąd (?)", "Poważny błąd (??)"];
const MARK = ["", "?!", "?", "??"];
let worker = null, A = null, idx = 0, running = false, stop = false;

function msg(t){ $("anMsg").textContent = t || ""; }
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
function evalFen(fen, depth){
  return new Promise(res => {
    let last = null;
    worker.onmessage = e => {
      const l = String(e.data);
      if(l.startsWith("info") && / pv /.test(l) && !/bound/.test(l)){
        const m = l.match(/score (cp|mate) (-?\d+)/), p = l.match(/ pv (\S+)/);
        if(m && p) last = {t:m[1], v:+m[2], pv:p[1]};
      } else if(l.startsWith("bestmove")){
        const b = l.split(" ")[1];
        res({last, best: b && b !== "(none)" ? b : (last ? last.pv : null)});
      }
    };
    worker.postMessage("position fen " + fen);
    worker.postMessage("go depth " + depth);
  });
}
function fmt(e){
  if(e.mate) return (e.mate > 0 ? "+#" : "-#") + Math.abs(e.mate);
  const v = e.cp / 100; return (v > 0 ? "+" : "") + v.toFixed(1);
}
async function run(){
  if(running){ stop = true; return; }
  const text = $("pgn").value.trim();
  try { localStorage.setItem("szachy-pgn", text); } catch(e){}
  msg("");
  const g = new Chess();
  try { g.loadPgn(text); } catch(e){ msg("Nie udało się odczytać PGN. Wklej całą partię, razem z ruchami."); return; }
  const h = g.history({verbose:true});
  if(!h.length){ msg("Nie znaleziono ruchów w tekście."); return; }
  const fens = [h[0].before].concat(h.map(m => m.after));
  const depth = +$("anDepth").value;
  running = true; stop = false; $("anGo").textContent = "Przerwij"; $("anOut").hidden = true;
  try { if(!worker) await startEngine(); }
  catch(e){ msg("Nie udało się uruchomić silnika. Sprawdź, czy pliki stockfish-19-lite-single.js i .wasm leżą obok index.html i otwórz stronę przez https."); running = false; $("anGo").textContent = "Analizuj"; return; }
  const ev = [];
  for(let i = 0; i < fens.length; i++){
    if(stop) break;
    $("anProg").style.width = (i * 100 / fens.length) + "%";
    msg("Analiza pozycji " + (i + 1) + " z " + fens.length + "...");
    const f = fens[i], c = new Chess(f), sign = f.split(" ")[1] === "w" ? 1 : -1;
    if(c.isCheckmate()){ ev.push({cp:(c.turn() === "w" ? -1 : 1) * 20000, mate:0, best:null}); continue; }
    if(c.isDraw()){ ev.push({cp:0, best:null}); continue; }
    const r = await evalFen(f, depth);
    if(stop) break;
    const e = {cp:0, best:r.best, bestSan:null};
    if(r.last){
      if(r.last.t === "mate"){ e.mate = r.last.v * sign; e.cp = (e.mate > 0 ? 1 : -1) * (10000 - Math.abs(e.mate)); }
      else e.cp = r.last.v * sign;
    }
    try {
      const mv = new Chess(f).move({from:r.best.slice(0, 2), to:r.best.slice(2, 4), promotion:r.best[4]});
      e.bestSan = pl(mv.san);
    } catch(err){}
    ev.push(e);
  }
  running = false; $("anGo").textContent = "Analizuj"; $("anProg").style.width = "0";
  if(stop){ stop = false; try { worker.terminate(); } catch(e){} worker = null; msg("Analiza przerwana."); return; }
  msg("");
  const sums = {w:{n:0, acc:0, c:[0, 0, 0, 0]}, b:{n:0, acc:0, c:[0, 0, 0, 0]}};
  const cls = [], lab = [];
  h.forEach((mv, k) => {
    const sg = mv.color === "w" ? 1 : -1, prev = ev[k], cur = ev[k + 1];
    let loss = Math.max(0, win(prev.cp * sg) - win(cur.cp * sg));
    const best = prev.best === mv.from + mv.to + (mv.promotion || "");
    if(best) loss = 0;
    const t = loss >= 15 ? 3 : loss >= 10 ? 2 : loss >= 5 ? 1 : 0;
    cls.push({t, best, loss});
    lab.push((mv.color === "w" ? (k / 2 + 1) + "." : (Math.floor(k / 2) + 1) + "...") + pl(mv.san));
    const s = sums[mv.color]; s.n++; s.c[t]++;
    s.acc += Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  });
  A = {h, fens, ev, cls, lab, n:h.length, sums};
  idx = 0; $("anOut").hidden = false; build(); show();
}
function build(){
  let chips = "";
  A.lab.forEach((l, k) => { chips += '<button type="button" data-i="' + (k + 1) + '" class="t' + A.cls[k].t + '">' + l + (MARK[A.cls[k].t] ? '<sup>' + MARK[A.cls[k].t] + '</sup>' : '') + '</button>'; });
  $("anMoves").innerHTML = chips;
  const row = (nm, s) => '<tr><th>' + nm + '</th><td>' + (s.n ? Math.round(s.acc / s.n) + '%' : '-') + '</td><td>' + s.c[1] + '</td><td>' + s.c[2] + '</td><td>' + s.c[3] + '</td></tr>';
  $("anSum").innerHTML = '<table><tr><th></th><th>Dokładność</th><th>?!</th><th>?</th><th>??</th></tr>' + row("Białe", A.sums.w) + row("Czarne", A.sums.b) + '</table>';
  const W = 600, H = 120, n = A.n; let pts = "";
  A.ev.forEach((e, i) => { pts += " L" + (i * W / n).toFixed(1) + "," + (H * (1 - win(e.cp) / 100)).toFixed(1); });
  $("anGraph").innerHTML = '<rect width="600" height="120" fill="var(--bd)"/><path d="M0,' + H + pts + ' L' + W + ',' + H + ' Z" fill="#fff" opacity=".92"/><line x1="0" y1="60" x2="600" y2="60" stroke="#13202c" stroke-width="1" opacity=".4"/><line id="anMark" x1="0" y1="0" x2="0" y2="120" stroke="#d9981e" stroke-width="3"/>';
}
function show(){
  const i = idx, e = A.ev[i], mv = i ? A.h[i - 1] : null, c = i ? A.cls[i - 1] : null, prev = i ? A.ev[i - 1] : null;
  const arrows = [];
  if(c && c.t > 0 && prev.best) arrows.push([prev.best.slice(0, 2), prev.best.slice(2, 4), "#2f7d5b"]);
  $("anBd").innerHTML = SZ.board(A.fens[i].split(" ")[0], {hl: mv ? [mv.from, mv.to] : [], ar: arrows});
  $("evFill").style.height = win(e.cp) + "%";
  let t;
  if(!mv) t = '<b>Pozycja wyjściowa</b><p>Ocena: ' + fmt(e) + '. Naciśnij ▶ albo kliknij ruch, żeby przejść przez partię.</p>';
  else {
    t = '<b>' + A.lab[i - 1] + '</b> ' + (c.t ? '<span class="bad">' + TYPES[c.t] + '</span>' : (c.best ? '<span class="good">Najlepszy ruch</span>' : '<span class="good">Dobry ruch</span>'));
    t += '<p>Ocena po ruchu: ' + fmt(e) + '.';
    if(c.t && prev.bestSan) t += ' Lepiej było: <b>' + prev.bestSan + '</b> (strzałka na planszy).';
    t += '</p>';
  }
  $("anCap").innerHTML = t;
  $("anCtr").textContent = "Ruch " + i + " z " + A.n;
  $("anS").disabled = $("anP").disabled = i === 0; $("anN").disabled = $("anE").disabled = i === A.n;
  $("anMoves").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.i === i));
  const mk = $("anMark"); if(mk){ const x = i * 600 / A.n; mk.setAttribute("x1", x); mk.setAttribute("x2", x); }
}
function go(i){ if(!A) return; idx = Math.max(0, Math.min(A.n, i)); show(); }
$("anGo").addEventListener("click", run);
$("anEx").addEventListener("click", () => { $("pgn").value = SAMPLE; });
$("anS").addEventListener("click", () => go(0));
$("anP").addEventListener("click", () => go(idx - 1));
$("anN").addEventListener("click", () => go(idx + 1));
$("anE").addEventListener("click", () => go(A ? A.n : 0));
$("anMoves").addEventListener("click", e => { const b = e.target.closest ? e.target.closest("button") : null; if(b) go(+b.dataset.i); });
$("anGraph").addEventListener("click", e => { if(!A) return; const r = $("anGraph").getBoundingClientRect(); go(Math.round((e.clientX - r.left) / r.width * A.n)); });
document.addEventListener("keydown", e => {
  if($("view-an").hidden || !A || /TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(e.key === "ArrowRight") go(idx + 1); else if(e.key === "ArrowLeft") go(idx - 1);
});
try { const sv = localStorage.getItem("szachy-pgn"); if(sv) $("pgn").value = sv; } catch(e){}
