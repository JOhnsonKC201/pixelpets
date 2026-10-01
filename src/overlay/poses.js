// Overlay renderer, part: canvas setup and the pose sprite tables.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// ===== Desktop pixel cat: 14 patterns, mochi-drag, typing, hunt, purr ========
// Role-coded sprites recolored per pattern, on a full-screen click-through overlay.
// Roles:  . transparent  O outline  H white halo  C coat  K markings  W white
//         X patch (tortie/calico)   E eye   N nose   I inner-ear

const canvas = document.getElementById('cat');
const ctx = canvas.getContext('2d');
const qp = new URLSearchParams(location.search);
const SHOT = qp.get('shot') === '1';
const SHEET = qp.get('sheet') === '1';   // contact-sheet QA mode (all poses x coats)
const FORCED_STATE = qp.get('state');
let viewW = 0, viewH = 0, viewDpr = 1;   // CSS-px layout dims, decoupled from the physical backing store
function resize() {
  if (SHEET) return;   // the contact sheet sizes its own canvas
  if (SHOT) {
    viewW = 260; viewH = 320; viewDpr = 1;
    canvas.width = 260; canvas.height = 320;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    // HiDPI crispness: size the backing store in PHYSICAL px (innerWidth*dpr) but keep the
    // CSS box at innerWidth and scale the context by dpr - so every draw/layout coordinate
    // stays in CSS px while pixels render at native device resolution (no compositor
    // upscale-blur at non-100% scaling). All geometry reads use viewW/viewH, never canvas.*.
    viewDpr = window.devicePixelRatio || 1;
    viewW = window.innerWidth; viewH = window.innerHeight;
    canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px';
    canvas.width = Math.round(viewW * viewDpr); canvas.height = Math.round(viewH * viewDpr);
    ctx.setTransform(viewDpr, 0, 0, viewDpr, 0, 0);
  }
  ctx.imageSmoothingEnabled = false;   // keep the sprite blit nearest-neighbor
}
resize();
if (!SHOT && !SHEET) window.addEventListener('resize', resize);



// --- hunting crouch (front-facing, low & wide, ears back) -------------------
function composeHunt() {
  const CX = 15;
  ellipse(CX, 12, 11, 5.4, 'C');         // wide low body
  ellipse(CX, 8, 6.2, 5, 'C');           // head, front-centre
  // flattened ears angled outward (pinned-back hunting look)
  triangle(9, 4, 6, 8, 13, 7, 'K'); triangle(21, 4, 17, 7, 24, 8, 'K');
  triangle(9, 5, 8, 8, 12, 7, 'I'); triangle(21, 5, 18, 7, 22, 8, 'I');
  // tail flicked low to the right
  [[26, 13], [27, 11]].forEach(([c, r]) => ellipse(c, r, 1.6, 1.6, 'C'));
  // white muzzle, low chest, two tucked front paws, tail tip
  ellipse(CX, 12, 2.6, 1.7, 'W', ['C']);
  ellipse(CX, 15, 3.2, 2.4, 'W', ['C']);
  ellipse(13, 17, 1.8, 1.5, 'W', ['C']); ellipse(17, 17, 1.8, 1.5, 'W', ['C']);
  ellipse(27, 11, 1.2, 1.2, 'W', ['C']);
  // big locked eyes + nose
  ellipse(12, 8, 2.2, 2.4, 'E'); ellipse(18, 8, 2.2, 2.4, 'E');
  setCell(15, 11, 'N'); setCell(14, 11, 'N');
  // markings: forehead hint + body bands + patches
  [[13, 5], [14, 6], [15, 5], [16, 6], [17, 5]].forEach(([c, r]) => { if (G[r][c] === 'C') setCell(c, r, 'K'); });
  for (let r = 10; r < 16; r += 2) for (let c = 4; c < GC; c++) if (G[r][c] === 'C' && c % 2 === 0) G[r][c] = 'K';
  ellipse(9, 12, 2.4, 2.4, 'X', ['C', 'K']); ellipse(21, 13, 2.2, 2.2, 'X', ['C', 'K']);
}

// --- typing cat (FRONT-FACING "keyboard kneading", Comnyang-style): the cat
//     faces the viewer and leans forward over two big keycaps. Grid 24x24. Both
//     eyes visible (they look down at the keys), tail curls up the right side.
//     Forelegs are NOT baked - drawn live kneading the keys in renderTypeFront,
//     where the keycaps are drawn too.
function composeTypeFront(B) {
  B = B || {};
  const CX = 12, fluff = !!B.fluff;
  // tail: emerges behind the right haunch and curls up beside the body - kept
  // clear of the torso silhouette so it reads as a tail, with a pale tip.
  // tail sweeps low to the right (a resting tail) - not curled up by the chest where its pale tip read as a 3rd paw
  [[20.5, 20.4], [22.2, 20.9], [23.2, 21.8], [22.6, 22.8]].forEach(([c, r]) => ellipse(c, r, 1.5, 1.5, 'C'));
  ellipse(21.8, 23.2, 1.0, 1.0, 'W', ['C']);               // tail tip (hooked over)
  // body: leaning forward - chest/shoulder mass under the head, haunches planted
  // wider at the bottom (the rear stays down while the cat reaches for the keys).
  ellipse(CX, 16, 6.0, 5.4, 'C');                          // shoulders / chest
  ellipse(6.6, 20.2, 3.4, 3.2, 'C');                       // left haunch
  ellipse(17.4, 20.2, 3.4, 3.2, 'C');                      // right haunch
  // head front-centre, slightly low (the forward lean)
  ellipse(CX, 8.5, 6.3, 5.6, 'C');
  if (fluff) { ellipse(5.6, 10.8, 1.9, 2.3, 'C'); ellipse(18.4, 10.8, 1.9, 2.3, 'C'); }  // cheek ruff
  // ears - proper cat triangles on top, slight outward tilt
  triangle(CX - 4.5, 1.2, CX - 6.4, 6.8, CX - 1.8, 5.6, 'K');
  triangle(CX + 4.5, 1.2, CX + 6.4, 6.8, CX + 1.8, 5.6, 'K');
  triangle(CX - 4.3, 3.0, CX - 5.4, 6.3, CX - 2.8, 5.6, 'I');
  triangle(CX + 4.3, 3.0, CX + 5.4, 6.3, CX + 2.8, 5.6, 'I');
  if (fluff) { ellipse(CX - 4.5, 5.6, 0.9, 1.3, 'W', ['C', 'K']); ellipse(CX + 4.5, 5.6, 0.9, 1.3, 'W', ['C', 'K']); }  // ear tufts
  // big round eyes (drawCat animates the pupils downward at the keys) + muzzle + nose
  ellipse(9, 8.7, 2.0, 2.4, 'E'); ellipse(15, 8.7, 2.0, 2.4, 'E');
  ellipse(CX, 12.2, 3, 2, 'W', ['C']);
  setCell(12, 11, 'N'); setCell(11, 11, 'N');
  // white chest bib - kept narrow so the lifted white paws never vanish against it
  ellipse(CX, 17.8, 2.1, 3.2, 'W', ['C']);
  // forelegs/paws are NOT baked - drawn live in drawKneadPaws (knead the keys)
  if (B.tabby) {
    [[11, 5], [12, 6], [13, 5]].forEach(([c, r]) => { if (G[r] && G[r][c] === 'C') setCell(c, r, 'K'); });  // forehead M
    for (let r = 13; r < 22; r += 2) for (let c = 3; c < 21; c++) if (G[r] && G[r][c] === 'C' && c % 2 === 0) setCell(c, r, 'K');
  }
  ellipse(7.5, 17.5, 2.2, 2.6, 'X', ['C', 'K']);           // tortie/calico patches
  ellipse(16.5, 20, 2.0, 2.0, 'X', ['C', 'K']);
}

// --- loafing cat ("cat bread"): a compact, content resting pose. The body is a
//     low rounded mound (no upright legs - paws are tucked under), the head rests
//     low and forward on top, and the tail wraps around the front. Grid 24x30 so
//     SW/SH match the sit sprite (the draw loop swaps sprites at the same size).
//     Built per coat from the same build descriptor B as composeSit.
function composeLoaf(B) {
  B = B || {};
  const CX = 12;
  const bw = B.bodyW || 1;
  const headRx = B.headRx || 6.3, headRy = B.headRy || 5.8;
  const earY = B.earApexY == null ? 1 : B.earApexY, ew = B.earW || 2.4, eo = B.earOut || 4;
  const eRx = B.eyeRx || 2, eRy = B.eyeRy || 2.4, fluff = !!B.fluff, cheek = B.cheek || 0;
  const EH = 6;   // ears/head drop vs the sit sprite (the loaf sits low)
  // baked tail wrapped around the front-right base (drawn first, behind the body)
  [[20.4, 26.6], [18.6, 28.2], [16.2, 29.2]].forEach(([c, r]) => ellipse(c, r, 1.7, 1.6, 'C'));
  ellipse(16.2, 29.2, 0.9, 0.9, 'W', ['C']);               // pale tail tip curled to the front
  // body: a wide, low loaf mound - base sits on the ground line (row ~29)
  ellipse(CX, 25, 8.9 * bw, 4.7 + (fluff ? 0.4 : 0), 'C'); // broad base
  ellipse(CX, 21, 8.0 * bw, 4.0, 'C');                     // rounded upper mound
  // head resting low and forward on the mound
  ellipse(CX, 8 + EH, headRx, headRy, 'C');
  if (cheek) { ellipse(CX - headRx * 0.7, 9.6 + EH, 1.7, 2.2, 'C'); ellipse(CX + headRx * 0.7, 9.6 + EH, 1.7, 2.2, 'C'); }
  if (fluff) { ellipse(5.4, 10.4 + EH, 1.9, 2.4, 'C'); ellipse(18.6, 10.4 + EH, 1.9, 2.4, 'C'); } // cheek ruff
  // ears - same triangles as the sit head, dropped by EH
  triangle(CX - eo - 0.5, earY + EH, CX - eo - ew, 7.6 + EH, CX - eo + ew, 6.4 + EH, 'K');
  triangle(CX + eo + 0.5, earY + EH, CX + eo + ew, 7.6 + EH, CX + eo - ew, 6.4 + EH, 'K');
  const iw = ew * 0.55;
  triangle(CX - eo - 0.3, earY + 2 + EH, CX - eo - iw, 7.2 + EH, CX - eo + iw, 6.6 + EH, 'I');
  triangle(CX + eo + 0.3, earY + 2 + EH, CX + eo + iw, 7.2 + EH, CX + eo - iw, 6.6 + EH, 'I');
  if (fluff) { ellipse(CX - eo, 6.0 + EH, 0.9, 1.4, 'W', ['C', 'K']); ellipse(CX + eo, 6.0 + EH, 0.9, 1.4, 'W', ['C', 'K']); } // ear tufts
  // muzzle + a small chest bib on the front of the mound
  ellipse(CX, 12 + EH, 3, 2, 'W', ['C']);
  ellipse(CX, 22, fluff ? 3.2 : 2.6, 3.4, 'W', ['C']);
  // two tucked front paws peeking out at the base
  ellipse(9.6, 28.4, 2.0, 1.4, 'W', ['C']); ellipse(14.4, 28.4, 2.0, 1.4, 'W', ['C']);
  setCell(12, 28, '.'); setCell(12, 29, '.');              // toe split between the tucked paws
  // eyes + nose (drawCat closes them to a happy curve for the content loaf)
  ellipse(9, 8.2 + EH, eRx, eRy, 'E'); ellipse(15, 8.2 + EH, eRx, eRy, 'E');
  setCell(12, 11 + EH, 'N'); setCell(11, 11 + EH, 'N');
  // tabby: forehead M + a couple of soft side bands (kept subtle so the loaf reads clean)
  if (B.tabby) {
    [[11, 6 + EH], [12, 7 + EH], [13, 6 + EH]].forEach(([c, r]) => { if (G[r] && G[r][c] === 'C') setCell(c, r, 'K'); });
    [[5, 23], [6, 25], [18, 23], [17, 25]].forEach(([c, r]) => { if (G[r] && G[r][c] === 'C') setCell(c, r, 'K'); });
  }
  // tortie/calico colour patches (invisible where patch == coat)
  ellipse(7.5, 24, 2.3, 2.8, 'X', ['C', 'K']); ellipse(16, 26, 2.2, 2.2, 'X', ['C', 'K']);
}

// --- rear-up "bat the butterfly": the cat sits up TALL on its haunches, reaching
//     for a butterfly overhead. Front legs are NOT baked - they're drawn live as
//     reaching/swiping paws in renderRearBat. Grid 24x30 (matches the sit sprite).
function composeRearUp(B) {
  B = B || {};
  const CX = 12, fluff = !!B.fluff, cheek = B.cheek || 0;
  const headRx = B.headRx || 6.3, headRy = B.headRy || 5.8;
  const earY = B.earApexY == null ? 1 : B.earApexY, ew = B.earW || 2.4, eo = B.earOut || 4;
  const eRx = B.eyeRx || 2, eRy = B.eyeRy || 2.4;
  // tail curling behind for balance (drawn first, behind the body)
  [[18.5, 27], [20.5, 26], [22, 24], [22.2, 22]].forEach(([c, r]) => ellipse(c, r, 1.6, 1.6, 'C'));
  ellipse(22.2, 22, 1.0, 1.0, 'W', ['C']);                 // pale tail tip
  // wide planted rear/haunches at the base
  ellipse(CX, 27, 7.6, 4.0, 'C');
  ellipse(8.4, 26, 3.0, 2.7, 'C'); ellipse(15.6, 26, 3.0, 2.7, 'C');
  // upright torso column rising from the base
  ellipse(CX, 18.5, 4.8, 7.4, 'C');
  // head up top
  ellipse(CX, 8, headRx, headRy, 'C');
  if (cheek) { ellipse(CX - headRx * 0.7, 9.6, 1.7, 2.2, 'C'); ellipse(CX + headRx * 0.7, 9.6, 1.7, 2.2, 'C'); }
  if (fluff) { ellipse(5.4, 10.4, 1.9, 2.4, 'C'); ellipse(18.6, 10.4, 1.9, 2.4, 'C'); }
  // ears up
  triangle(CX - eo - 0.5, earY, CX - eo - ew, 7.6, CX - eo + ew, 6.4, 'K');
  triangle(CX + eo + 0.5, earY, CX + eo + ew, 7.6, CX + eo - ew, 6.4, 'K');
  const iw = ew * 0.55;
  triangle(CX - eo - 0.3, earY + 2, CX - eo - iw, 7.2, CX - eo + iw, 6.6, 'I');
  triangle(CX + eo + 0.3, earY + 2, CX + eo + iw, 7.2, CX + eo - iw, 6.6, 'I');
  if (fluff) { ellipse(CX - eo, 6.0, 0.9, 1.4, 'W', ['C', 'K']); ellipse(CX + eo, 6.0, 0.9, 1.4, 'W', ['C', 'K']); }
  // exposed white throat + belly down the upright front
  ellipse(CX, 12.5, 3.0, 2.2, 'W', ['C']);
  ellipse(CX, 19.5, 3.2, 7.2, 'W', ['C']);
  // two little hind paws peeking at the base
  ellipse(9.4, 29, 2.0, 1.3, 'W', ['C']); ellipse(14.6, 29, 2.0, 1.3, 'W', ['C']);
  // eyes + nose (looking up)
  ellipse(9, 8.2, eRx, eRy, 'E'); ellipse(15, 8.2, eRx, eRy, 'E');
  setCell(12, 11, 'N'); setCell(11, 11, 'N');
  if (B.tabby) {
    [[11, 6], [12, 7], [13, 6]].forEach(([c, r]) => { if (G[r] && G[r][c] === 'C') setCell(c, r, 'K'); });
    for (let r = 14; r < 26; r += 2) for (let c = 6; c < 19; c++) if (G[r] && G[r][c] === 'C' && c % 2 === 0) setCell(c, r, 'K');
  }
  ellipse(8, 20, 2.2, 2.8, 'X', ['C', 'K']); ellipse(16, 24, 2.0, 2.2, 'X', ['C', 'K']);
}

// --- reared up, boxing at the butterfly overhead ------------------------------
// The reared body fills a 24x30 grid to its very top row, so a paw thrown ABOVE
// the head has nowhere to go - which is why these arms used to be drawn in screen
// space, and why at rest they showed up as a detached white square on the chest
// with a 4px stub of forearm. This pose gets its own TALLER grid: the reared body
// drops BAT_DROP rows and the freed rows at the top are where the strike lands.
// Species-agnostic: it reuses whichever upright pose the active species defines
// (composeRearUp / composeBegDog), so the dog boxes too, in its own silhouette.
const BAT_ROWS = 38, BAT_DROP = 6, BAT_H = BAT_ROWS * CELL;
function composeBat(B, o) {
  o = o || {};
  const up = (o.up || -1) < 0 ? -1 : 1;              // which paw is thrown this beat
  const ph = clamp(o.ph == null ? 1 : o.ph, 0, 1);   // how far through the strike
  const CX = 12;

  SPECIES_DEFS.rear(B);                              // the upright body, drawn at its own coords
  for (let r = BAT_ROWS - 1; r >= 0; r--) {          // then slid down to free the top rows
    for (let c = 0; c < 24; c++) G[r][c] = r - BAT_DROP >= 0 ? G[r - BAT_DROP][c] : '.';
  }

  // Both forelegs: the thrown one snaps up past the ears, the other loads low
  // against the chest. Real limbs, so they take the coat's shading and outline.
  const shoulderY = 20 + BAT_DROP;
  const arm = (side, reach) => {
    const shX = CX + side * 3.6;
    const pawX = CX + side * (5.4 + reach * 1.4), pawY = shoulderY - 4 - reach * 21;
    // The limb BOWS outward on the way up. A straight shoulder-to-paw line cuts
    // across the cheek and clips an eye on the way past; bowing it keeps the whole
    // arm clear of the skull, which is also how a cat actually throws a paw.
    const at = (f) => ({
      x: shX + (pawX - shX) * f + side * 3.0 * Math.sin(f * Math.PI) * reach,
      y: shoulderY + (pawY - shoulderY) * f,
    });
    for (let i = 0; i <= 14; i++) { const p = at(i / 14); ellipse(p.x, p.y, 1.5, 1.5, 'C'); }
    ellipse(pawX, pawY, 2.0, 1.6, 'W', ['C']);
    if (reach > 0.5) {                               // pads flash on the strike
      ellipse(pawX, pawY + 0.4, 1.0, 0.7, 'I', ['W']);
      ellipse(pawX - 1.5, pawY - 0.6, 0.6, 0.6, 'I', ['W']);
      ellipse(pawX + 1.5, pawY - 0.6, 0.6, 0.6, 'I', ['W']);
    }
    // seam the limb off the body so it reads as a separate arm on solid coats
    if (reach > 0.35) for (let i = 3; i <= 12; i++) { const p = at(i / 14); setCell(Math.round(p.x + side * 1.9), Math.round(p.y), '.'); }
  };
  arm(up, ph);
  arm(-up, 0.08);                                    // the loading paw stays tucked in
}

// --- seated with one front paw raised ---------------------------------------
// Grooming, pondering, tapping and batting all want the same thing: the cat sits
// and lifts ONE front paw. That used to be drawn as axis-aligned rectangles over
// the finished sprite, which ignored the coat's shading, outline halo, markings
// and breathing scale - so it read as a pale domino pasted on the chest rather
// than a limb. Composing it into the grid instead means the paw is made of the
// same cells as the rest of the cat and inherits all of that for free.
//   o.lift  0 = planted, 1 = held up at the muzzle
//   o.out   0 = tucked against the chest, 1 = reaching away from the body
const BOW = 2.6;   // cells the raised forearm bows outward at mid-limb (see composeBat)
const TAIL_HOT = 24;   // px the hot region extends past the sprite to cover the tail
function composePawUp(B, o) {
  B = B || {}; o = o || {};
  const lift = clamp(o.lift == null ? 1 : o.lift, 0, 1);
  const out = clamp(o.out || 0, 0, 1);
  composeSit(B);   // start from the real seated cat, then re-hang its left foreleg

  // Lift the planted left foreleg off the floor: erase it, close the haunch back
  // up behind it, then restore the chest bib composeSit had drawn underneath.
  for (let r = 19; r <= 29; r++) for (let c = 8; c <= 12; c++) setCell(c, r, '.');
  ellipse(12, 24, 7.6 * (B.bodyW || 1), 5 + (B.fluff ? 0.4 : 0), 'C', ['.']);
  ellipse(12, 17, B.fluff ? 3.4 : 2.7, 7, 'W', ['C']);

  // the raised limb: shoulder stays on the chest, paw swings up and outward
  const shX = 10.4, shY = 20.4;
  const pawX = 10 - out * 4.6, pawY = 27.0 - lift * 14.6;
  // The limb BOWS outward on the way up, the same trick composeBat uses. A straight
  // shoulder-to-paw line is dead vertical at out=0 (which is what grooming asks for),
  // running up the centre-left of the chest INSIDE the head's own column span and in
  // the same coat role - so it merged into the chin instead of reading as a raised
  // limb, and painted over the white bib that gives the face its contrast. Bowing it
  // walks the forearm out past the bib and back in to the muzzle.
  const at = (f) => ({
    x: shX + (pawX - shX) * f - BOW * Math.sin(f * Math.PI) * lift,
    y: shY + (pawY - shY) * f,
  });
  for (let i = 0; i <= 12; i++) { const p = at(i / 12); ellipse(p.x, p.y, 1.5, 1.5, 'C'); }
  ellipse(pawX, pawY, 2.0, 1.6, 'W', ['C']);
  // Near the face the underside of the paw turns toward you, so the toe beans
  // show. 'I' is the inner-ear role: already a palette-correct pink on every coat.
  if (lift > 0.62) {
    ellipse(pawX, pawY + 0.5, 1.0, 0.7, 'I', ['W']);
    ellipse(pawX - 1.5, pawY - 0.5, 0.6, 0.6, 'I', ['W']);
    ellipse(pawX + 1.5, pawY - 0.5, 0.6, 0.6, 'I', ['W']);
  }
  // re-carve the separations composeSit made for the leg we just moved
  for (let r = 22; r <= 28; r++) setCell(16, r, '.');            // planted right leg vs haunch
  setCell(14, 27, '.'); setCell(14, 28, '.');                    // its toe split
  // Seam the WHOLE limb off the chest, not just one row at the shoulder. On solid
  // coats the forearm and the chest are the same role, so a single-row seam left the
  // limb as an indistinguishable lobe of the body; outlineHalo needs a carved gap
  // down its full length to trace an edge the eye can follow.
  // Skip both ends, the way composeBat does: carving right up to the shoulder and
  // the mitt turns the seam into a row of disconnected notches instead of an edge.
  if (lift > 0.15) {
    for (let i = 3; i <= 10; i++) {
      const p = at(i / 12);
      setCell(Math.round(p.x + 1.9), Math.round(p.y), '.');
    }
    const seamR = Math.round(shY - 1);                           // and close it off at the shoulder
    for (let c = Math.round(Math.min(pawX, shX)) - 1; c <= Math.round(shX) + 1; c++) setCell(c, seamR, '.');
  }
}
