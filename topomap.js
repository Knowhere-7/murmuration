/**
 * TopoField + neon topographic contour renderer.
 * ────────────────────────────────────────────────────────────────
 * ONE height field feeds two things:
 *   1. buildTopoMap() — bakes glowing white/cyan iso-lines onto an offscreen
 *      canvas (blitted behind the swarm every frame — cheap).
 *   2. TopoField.height()/gradient() — sampled by the world so the terrain
 *      actually shapes movement: agents drift downhill and pool in valleys.
 *      The visual map and the emergent flow are the same surface.
 */

(function () {
  const TAU = Math.PI * 2;

  // Deterministic multi-octave field in [0,1]. Same seed every build so the
  // baked contours line up exactly with the movement gradient.
  // Basin floors — one per colony, and the king stands at the bottom of each.
  // Exported so the engine can plant kings and size arenas from the SAME
  // numbers the contours are drawn from; a map whose landmarks are declared
  // twice drifts apart the first time either copy is edited.
  const BASIN = { A: { x: 0.24, y: 0.50 }, B: { x: 0.76, y: 0.50 } };
  // Saddle passes through the meridian ridge — the only ways across.
  const PASS_Y = [0.26, 0.50, 0.74];

  /* THE COMPOSED RANGE (Ghost, 2026-08-24). Four ideas at four scales, added
     into one field — they compose rather than compete because each owns a
     different frequency:

       TWIN SINKS ...... the large shape: a deep bowl per colony, not one
                         central sink, so each side owns its own ground.
       DEFENSE IN DEPTH  concentric terraces inside each bowl, sharp at the
                         crown and fading outward — rings an attacker crosses.
       SEGMENTED RIFT .. a hard ridge on the meridian, notched by three passes.
       ARCHIPELAGO ..... scattered relief so no ground is ever flat.

     Because TopoField feeds movement as well as the contours, this is a
     behaviour spec, not a picture: agents drift downhill, so both colonies
     settle around their own king, and anything that enters a bowl slides
     toward the crown — easy to fall into, work to climb out of. */
  /* THE ORIGINAL OPEN-WORLD FIELD. murmuration.knowhere-group.com runs on this
     surface and its emergent results were recorded against it, so it stays the
     DEFAULT — the composed range below is opt-in. Two massifs, a border bowl,
     and drift that leans inward. */
  function rawClassic(nx, ny) {
    let v = 0;
    v += Math.sin(nx * TAU * 1.15 + 1.2) * Math.cos(ny * TAU * 0.85 + 0.4);
    v += 0.60 * Math.sin(nx * TAU * 2.10 + 3.1) * Math.cos(ny * TAU * 1.70 + 2.0);
    v += 0.32 * Math.sin(nx * TAU * 3.70 + 0.7) * Math.cos(ny * TAU * 3.10 + 1.1);
    v += 0.18 * Math.sin(nx * TAU * 6.30 + 2.4) * Math.cos(ny * TAU * 5.20 + 0.9);
    v += 1.05 * Math.exp(-(((nx - 0.28) ** 2 + (ny - 0.34) ** 2) / 0.05));
    v += 0.95 * Math.exp(-(((nx - 0.74) ** 2 + (ny - 0.68) ** 2) / 0.05));
    const edge = Math.min(Math.min(nx, 1 - nx), Math.min(ny, 1 - ny));
    v += (0.35 - edge) * 0.7;
    return v;
  }

  function rawComposed(nx, ny) {
    const dA = Math.hypot(nx - BASIN.A.x, ny - BASIN.A.y);
    const dB = Math.hypot(nx - BASIN.B.x, ny - BASIN.B.y);
    const d  = Math.min(dA, dB);            // distance to the nearer crown
    let v = 0;

    // TWIN SINKS — a deep well under each king
    v -= 2.20 * Math.exp(-(dA * dA) / 0.030);
    v -= 2.20 * Math.exp(-(dB * dB) / 0.030);

    // DEFENSE IN DEPTH — ring crests around whichever crown is nearer, the
    // amplitude decaying so the inner rings bite and the outer ones dissolve
    // into open ground rather than tiling the whole map with ripples.
    v += 0.42 * Math.cos(d * TAU / 0.085) * Math.exp(-(d * d) / 0.075);

    // SEGMENTED RIFT — meridian ridge, cut by the three saddle passes
    const spine = Math.exp(-((nx - 0.5) ** 2) / 0.0022);
    let pass = 0;
    for (const py of PASS_Y) pass += Math.exp(-((ny - py) ** 2) / 0.0016);
    v += 2.30 * spine * (1 - Math.min(1, pass));

    // ARCHIPELAGO — broad relief, plus islets seated on the approach lanes
    v += 0.30 * Math.sin(nx * TAU * 3.1 + 0.7) * Math.cos(ny * TAU * 2.6 + 1.4);
    v += 0.16 * Math.sin(nx * TAU * 5.7 + 2.2) * Math.cos(ny * TAU * 4.9 + 0.3);
    v += 0.55 * Math.exp(-(((nx - 0.50) ** 2 + (ny - 0.12) ** 2) / 0.004));
    v += 0.55 * Math.exp(-(((nx - 0.50) ** 2 + (ny - 0.88) ** 2) / 0.004));
    v += 0.40 * Math.exp(-(((nx - 0.36) ** 2 + (ny - 0.30) ** 2) / 0.003));
    v += 0.40 * Math.exp(-(((nx - 0.64) ** 2 + (ny - 0.70) ** 2) / 0.003));

    // NO CENTRAL PULL (Ghost, 2026-08-24). The old field lifted the border so
    // drift leaned toward the middle of the map. Under twin sinks that is
    // exactly wrong: it drags both colonies onto the meridian ridge and
    // undoes the basins. Each bowl now supplies its own gravity, so a colony
    // falls toward ITS king and the centre is a place you must choose to go.
    return v;
  }

  // Normalize the raw range (~[-2.05, 3.2]) into [0,1].
  // Each field carries its OWN measured range. Normalizing one field with the
  // other's constants silently clips the contours and flattens the gradient
  // that drives movement, so the pair travels together.
  const FIELDS = {
    classic:  { fn: rawClassic,  off: 2.000, span: 5.600 },
    composed: { fn: rawComposed, off: 2.797, span: 5.831 }  // 400x400 sweep: [-2.797, 3.034]
  };
  let MODE = 'classic';   // the live open world keeps the surface it was measured on

  function heightN(nx, ny) {
    const f = FIELDS[MODE] || FIELDS.classic;
    return Math.max(0, Math.min(1, (f.fn(nx, ny) + f.off) / f.span));
  }

  const TopoField = {
    /** Elevation in [0,1] at pixel (x,y) for a W×H world. */
    height(x, y, W, H) {
      return heightN(x / W, y / H);
    },
    /** Downhill gradient (points uphill) in pixel space, small magnitude. */
    gradient(x, y, W, H) {
      const e = 6;
      const gx = this.height(x + e, y, W, H) - this.height(x - e, y, W, H);
      const gy = this.height(x, y + e, W, H) - this.height(x, y - e, W, H);
      return { gx, gy };
    }
  };

  // ── Marching squares → glowing iso-lines ──────────────────────
  function buildTopoMap(W, H) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const step = Math.max(12, Math.round(Math.min(W, H) / 68)); // grid resolution
    const cols = Math.ceil(W / step);
    const rows = Math.ceil(H / step);

    // Pre-sample the field on the grid
    const grid = new Float32Array((cols + 1) * (rows + 1));
    const gidx = (i, j) => j * (cols + 1) + i;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        grid[gidx(i, j)] = heightN((i * step) / W, (j * step) / H);
      }
    }

    const levels = [0.14, 0.22, 0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78, 0.86, 0.92];

    // linear interpolation of the crossing point along a cell edge
    const lerp = (a, b, t) => a + (b - a) * t;

    for (let li = 0; li < levels.length; li++) {
      const L = levels[li];
      const path = new Path2D();

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x0 = i * step, y0 = j * step, x1 = x0 + step, y1 = y0 + step;
          const tl = grid[gidx(i, j)];
          const tr = grid[gidx(i + 1, j)];
          const br = grid[gidx(i + 1, j + 1)];
          const bl = grid[gidx(i, j + 1)];

          let cse = 0;
          if (tl > L) cse |= 8;
          if (tr > L) cse |= 4;
          if (br > L) cse |= 2;
          if (bl > L) cse |= 1;
          if (cse === 0 || cse === 15) continue;

          // edge crossing points
          const top    = () => [lerp(x0, x1, (L - tl) / (tr - tl)), y0];
          const right  = () => [x1, lerp(y0, y1, (L - tr) / (br - tr))];
          const bottom = () => [lerp(x0, x1, (L - bl) / (br - bl)), y1];
          const left   = () => [x0, lerp(y0, y1, (L - tl) / (bl - tl))];

          const seg = (A, B) => { path.moveTo(A[0], A[1]); path.lineTo(B[0], B[1]); };

          switch (cse) {
            case 1:  seg(left(), bottom()); break;
            case 2:  seg(bottom(), right()); break;
            case 3:  seg(left(), right()); break;
            case 4:  seg(top(), right()); break;
            case 5:  seg(left(), top()); seg(bottom(), right()); break;
            case 6:  seg(top(), bottom()); break;
            case 7:  seg(left(), top()); break;
            case 8:  seg(left(), top()); break;
            case 9:  seg(top(), bottom()); break;
            case 10: seg(left(), bottom()); seg(top(), right()); break;
            case 11: seg(top(), right()); break;
            case 12: seg(left(), right()); break;
            case 13: seg(bottom(), right()); break;
            case 14: seg(left(), bottom()); break;
          }
        }
      }

      // higher elevations read brighter/whiter — the ridgelines glow hottest
      const hot = li / (levels.length - 1);      // 0 low → 1 high
      const cyan = `40, ${170 + hot * 60}, ${210 + hot * 40}`;

      // outer glow
      ctx.strokeStyle = `rgba(${cyan}, ${0.07 + hot * 0.06})`;
      ctx.lineWidth = 5;
      ctx.stroke(path);
      // mid
      ctx.strokeStyle = `rgba(${cyan}, ${0.18 + hot * 0.14})`;
      ctx.lineWidth = 1.8;
      ctx.stroke(path);
      // white core
      ctx.strokeStyle = `rgba(235, 252, 255, ${0.42 + hot * 0.34})`;
      ctx.lineWidth = 0.9;
      ctx.stroke(path);
    }

    return cv;
  }

  window.TopoField = TopoField;
  window.buildTopoMap = buildTopoMap;
  // Landmarks in normalized [0,1] coords. Kings are planted at BASIN.A/B and
  // the per-colony arenas are sized around them, so terrain and engine read
  // the same map. PASS_Y are the gaps in the meridian ridge.
  window.TopoLandmarks = { BASIN, PASS_Y };
  /** Choose the height field. Call BEFORE the topo layer is baked — the
      contours and the movement gradient are the same surface, so switching
      after a build leaves the picture disagreeing with the physics.
      'classic' = the live open world. 'composed' = the Attrition range. */
  window.setTopoField = function (name) {
    if (!FIELDS[name]) return false;
    MODE = name;
    return true;
  };
  window.getTopoField = function () { return MODE; };
})();
