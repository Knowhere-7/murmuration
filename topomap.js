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
  /* Saddle passes through the meridian ridge — the only ways across, and they
     MUST sit exactly where the wall's gates are.

     Ghost, 2026-08-24: "knowhere only tries to use the north gate, and mainland
     only tries to use the central gate." That was this: the passes were seeded
     at 0.26/0.50/0.74 while world.js puts the gates at 0.14/0.50/0.86, so only
     the CENTRE lined up. The ridge was solid rock across the north and south
     gateways — terrain quietly overruling the wall, and a colony cannot walk
     through a door with a mountain in front of it.

     Defaults match world.js. syncPassesToGates() re-reads the real wall at
     build time so an edit to either file cannot silently re-open this gap. */
  let PASS_Y = [0.14, 0.50, 0.86];

  function syncPassesToGates(world) {
    const gates = world && world.wall && world.wall.gates;
    if (!gates || !gates.length) return false;
    const ys = gates.map(g => g.yf).filter(y => typeof y === 'number');
    if (!ys.length) return false;
    PASS_Y = ys;
    return true;
  }

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

    // SEGMENTED RIFT — meridian ridge, cut by a saddle at every gate.
    // The pass mouths are WIDE (0.0034 vs the old 0.0016) so a colony drifting
    // along the wall finds the opening instead of sliding past it.
    const spine = Math.exp(-((nx - 0.5) ** 2) / 0.0022);
    let pass = 0;
    for (const py of PASS_Y) pass += Math.exp(-((ny - py) ** 2) / 0.0034);
    pass = Math.min(1, pass);
    v += 2.30 * spine * (1 - pass);

    // APPROACH FUNNEL — Ghost, 2026-08-24: "we need more pull towards all
    // gates." Cutting the ridge only stops a gate being blocked; it gives an
    // agent no reason to WANT one. This carves a shallow bowl in front of each
    // opening, widening with distance from the seam, so downhill drift gathers
    // a colony toward every gate rather than only the one it happens to touch.
    // It is deliberately gentle — a hint in the ground, not a conveyor belt,
    // so which gate a colony commits to stays their decision.
    // Each gate is funnelled INDIVIDUALLY, and the outer ones are cut deeper.
    // The centre gate lies on the line between the two basins, so the ground is
    // naturally lower there — world.js says as much, calling north and south "a
    // committed detour". Left alone that reads as one obvious door and two
    // afterthoughts. Scaling the cut by distance from mid-height pays the outer
    // gates back what the basins take from them, so all three cost about the
    // same to reach and the choice is tactical rather than gravitational.
    const nearSeam = Math.exp(-((nx - 0.5) ** 2) / 0.045);
    for (const py of PASS_Y) {
      const m = Math.exp(-((ny - py) ** 2) / 0.0034);
      v -= (0.42 + 1.15 * Math.abs(py - 0.5)) * m * nearSeam;
    }

    // ARCHIPELAGO — broad relief, plus islets seated on the approach lanes
    v += 0.30 * Math.sin(nx * TAU * 3.1 + 0.7) * Math.cos(ny * TAU * 2.6 + 1.4);
    v += 0.16 * Math.sin(nx * TAU * 5.7 + 2.2) * Math.cos(ny * TAU * 4.9 + 0.3);
    // These two sit BETWEEN the gates, not on them. Seated at 0.12/0.88 they
    // landed squarely on the north and south gateways and quietly filled in the
    // funnels above — relief competing with the doors. Moved onto the ridge
    // segments instead, where they deepen the contrast between a way through
    // and a wall.
    v += 0.55 * Math.exp(-(((nx - 0.50) ** 2 + (ny - 0.32) ** 2) / 0.004));
    v += 0.55 * Math.exp(-(((nx - 0.50) ** 2 + (ny - 0.68) ** 2) / 0.004));
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
    composed: { fn: rawComposed, off: 2.944, span: 5.338 }  // 400x400 sweep: [-2.944, 2.395]
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

      /* ELEVATION AS HUE (Ghost, 2026-08-25: "how can we color code to express
         the elevation the map attempts to convey").

         The height was already here — `hot` runs 0 low to 1 high — but it only
         drove BRIGHTNESS inside one cyan, so a basin and a ridge differed by
         luminance alone and the map read as texture rather than terrain. Height
         now moves the HUE, which is the channel the eye reads as a category
         rather than as intensity.

         The ramp follows how a real relief map is read, and it is not arbitrary
         against this world: deep violet in the basins where each king stands,
         through cyan and green at the traversable middle where the passes and
         the circuit sit, to amber and finally white on the meridian ridge that
         cannot be crossed. Low is where you live, bright is where you cannot go. */
      const hot = li / (levels.length - 1);      // 0 low → 1 high
      // 275 violet → 190 cyan → 120 green → 45 amber, then desaturating to white
      const hue = 275 - hot * 230;
      const sat = 85 - Math.max(0, hot - 0.82) * 300;   // the crest washes out
      const lum = 46 + hot * 26;

      // outer glow — the band's own colour, wide and faint
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${0.07 + hot * 0.07})`;
      ctx.lineWidth = 5;
      ctx.stroke(path);
      // mid — where the colour actually reads
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${0.22 + hot * 0.20})`;
      ctx.lineWidth = 1.8;
      ctx.stroke(path);
      // core — hot ground keeps the white hairline, low ground keeps its colour,
      // so the ridge still reads as the brightest thing without flattening the
      // basins into the same white.
      ctx.strokeStyle = `hsla(${hue}, ${Math.max(0, sat - 40)}%, ${72 + hot * 24}%, ${0.30 + hot * 0.48})`;
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
  window.TopoLandmarks = { BASIN, get PASS_Y() { return PASS_Y; } };
  /** Point the terrain's passes at the REAL wall gates. Call before the topo
      layer is baked; returns false if the world has no wall yet. */
  window.syncTopoPassesToGates = syncPassesToGates;
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
