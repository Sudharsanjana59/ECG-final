/* =========================================================================
   ECG-SVG.JS
   Procedurally draws each ECG rhythm as an SVG path, so the game never
   depends on external/copyrighted medical images. Every waveform is drawn
   large, on a classic monitor grid, so the trace is easy to read clearly.
   ========================================================================= */

/* ---- small deterministic PRNG so a given rhythm always looks the same ---- */ 
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

function gauss(t, c, w, a) {
  return a * Math.exp(-((t - c) * (t - c)) / (2 * w * w));
}
function triangle(t, c, w, a) {
  const d = Math.abs(t - c);
  if (d > w) return 0;
  return a * (1 - d / w);
}

/* One "textbook normal" beat shape, reused/modified by several rhythms.
   qAmp/rAmp/sAmp let individual rhythms give their QRS a distinct silhouette
   (taller spike, deeper S, etc.) instead of every "normal-QRS" rhythm
   looking pixel-identical. deltaA/deltaW draws an optional slurred
   pre-excitation ramp (WPW) in front of the R spike. */
function normalBeat(t, opts) {
  opts = opts || {};
  const pC = opts.pC ?? 0.15, pW = opts.pW ?? 0.035, pA = opts.pA ?? 8;
  const tC = opts.tC ?? 0.58, tW = opts.tW ?? 0.07, tA = opts.tA ?? 15;
  const qAmp = opts.qAmp ?? -8, rAmp = opts.rAmp ?? 42, sAmp = opts.sAmp ?? -16;
  const stLift = opts.stLift ?? 0;
  const deltaA = opts.deltaA ?? 0, deltaW = opts.deltaW ?? 0.045;
  let y = 0;
  y += gauss(t, pC, pW, pA);
  if (deltaA) y += triangle(t, 0.30, deltaW, deltaA); // delta wave (WPW slurred upstroke)
  y += triangle(t, 0.32, 0.02, qAmp);   // Q
  y += triangle(t, 0.345, 0.02, rAmp);  // R
  y += triangle(t, 0.37, 0.02, sAmp);   // S
  // ST segment lift (used for STEMI) - trapezoid plateau between QRS and T
  if (stLift) {
    const stStart = 0.39, stEnd = tC - tW * 0.6;
    if (t >= stStart && t <= stEnd) y += stLift;
    else if (t > stEnd && t < tC) y += stLift * Math.max(0, 1 - (t - stEnd) / (tC - stEnd));
  }
  y += gauss(t, tC, tW, tA);
  return y;
}

/* Builds an array of [x,y] SVG points for the requested rhythm type. */
function generateWaveformPoints(typeId, width, height, cycles) {
  const baseline = height * 0.55;
  const pts = [];
  const rand = mulberry32(seedFromString(typeId));
  const step = 2; // px between samples -> smooth curve, still cheap

  const push = (x, offsetUp) => pts.push([x, baseline - offsetUp]);

  switch (typeId) {
    case "NSR": {
      const cycleLen = width / 4.8;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        push(x, normalBeat(t));
      }
      break;
    }
    case "AFIB": {
      let x = 0;
      while (x <= width) {
        const cycleLen = width / 4.6 + (rand() - 0.5) * (width / 8); // irregularly irregular
        for (let lx = 0; lx <= cycleLen && x + lx <= width; lx += step) {
          const t = lx / cycleLen;
          // fibrillatory wobble instead of a clean P wave
          const wobble =
            3.5 * Math.sin((x + lx) * 0.18) +
            2 * Math.sin((x + lx) * 0.35 + 1.3) +
            1.5 * (rand() - 0.5);
          const y = triangle(t, 0.32, 0.02, -8) + triangle(t, 0.345, 0.02, 38) +
                    triangle(t, 0.37, 0.02, -16) + gauss(t, 0.6, 0.07, 12) + wobble;
          push(x + lx, y);
        }
        x += cycleLen;
      }
      break;
    }
    case "AFLUT": {
      const flutterLen = width / 26; // fast saw-tooth flutter waves
      let flutterCount = 0;
      for (let x = 0; x <= width; x += step) {
        const t = (x % flutterLen) / flutterLen;
        let y = 8 * (t < 0.5 ? t * 2 : (1 - t) * 2) - 3; // saw-tooth
        pts.push([x, baseline - y]);
      }
      // overlay a QRS every 3rd flutter wave (3:1 conduction)
      for (let x = flutterLen * 1.5; x <= width; x += flutterLen * 3) {
        for (let lx = -flutterLen * 0.4; lx <= flutterLen * 0.4; lx += step) {
          const idx = Math.round((x + lx) / step);
          if (idx >= 0 && idx < pts.length) {
            const localT = (lx + flutterLen * 0.4) / (flutterLen * 0.8);
            pts[idx][1] -= triangle(localT, 0.5, 0.45, 42) + triangle(localT, 0.5, 0.15, -12);
          }
        }
      }
      break;
    }
    case "VTACH": {
      const cycleLen = width / 11;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        // wide, smooth, sine-like complexes - no discernible P
        const y = 34 * Math.sin(2 * Math.PI * t) + 6 * Math.sin(6 * Math.PI * t);
        push(x, y);
      }
      break;
    }
    case "VFIB": {
      const freqs = [0.07, 0.13, 0.21, 0.34, 0.5].map((f) => f * (0.8 + rand() * 0.4));
      const phases = freqs.map(() => rand() * Math.PI * 2);
      const amps = [16, 12, 9, 7, 5].map((a) => a * (0.7 + rand() * 0.6));
      for (let x = 0; x <= width; x += step) {
        let y = 0;
        for (let i = 0; i < freqs.length; i++) y += amps[i] * Math.sin(freqs[i] * x + phases[i]);
        y += (rand() - 0.5) * 4;
        push(x, y);
      }
      break;
    }
    case "AVB2": {
      // Mobitz I / Wenckebach: PR grows each beat, then a P wave drops its QRS
      const cycleLen = width / 5.2;
      let beatIndex = 0, x = 0;
      const prShift = [0.15, 0.10, 0.045, null];
      while (x <= width) {
        const pc = prShift[beatIndex % 4];
        for (let lx = 0; lx <= cycleLen && x + lx <= width; lx += step) {
          const t = lx / cycleLen;
          const y = pc === null ? gauss(t, 0.15, 0.035, 8) : normalBeat(t, { pC: pc, pW: 0.03 });
          push(x + lx, y);
        }
        x += cycleLen;
        beatIndex++;
      }
      break;
    }
    case "AVB3": {
      // complete heart block: P waves and QRS complexes at independent rates
      const pCycle = width / 9;
      for (let x = 0; x <= width; x += step) {
        const t = (x % pCycle) / pCycle;
        push(x, gauss(t, 0.5, 0.06, 7));
      }
      const qrsCycle = width / 3.4;
      for (let qx = qrsCycle * 0.4; qx <= width; qx += qrsCycle) {
        for (let lx = -qrsCycle * 0.18; lx <= qrsCycle * 0.18; lx += step) {
          const idx = Math.round((qx + lx) / step);
          if (idx >= 0 && idx < pts.length) {
            const localT = (lx + qrsCycle * 0.18) / (qrsCycle * 0.36);
            pts[idx][1] -= triangle(localT, 0.5, 0.4, 46) + triangle(localT, 0.5, 0.15, -14);
          }
        }
      }
      break;
    }
    case "TDP": {
      // Torsades: polymorphic VT whose amplitude envelope twists/inverts slowly
      const cycleLen = width / 11;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        const envelope = Math.sin(x * 0.02);
        const y = envelope * (30 * Math.sin(2 * Math.PI * t) + 6 * Math.sin(6 * Math.PI * t));
        push(x, y);
      }
      break;
    }
    case "WPW": {
      // short PR interval plus a big, unmistakably slurred delta-wave ramp
      // climbing into the R spike - a clearly wider QRS than a normal beat.
      const cycleLen = width / 4.8;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        push(x, normalBeat(t, { pC: 0.115, pW: 0.028, deltaA: 20, deltaW: 0.06, rAmp: 40 }));
      }
      break;
    }
    case "BRUGADA": {
      // coved ST-segment dome curving straight into an inverted T wave
      const cycleLen = width / 4.8;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        let y = triangle(t, 0.32, 0.02, -8) + triangle(t, 0.345, 0.02, 42) + triangle(t, 0.37, 0.02, -16);
        y += gauss(t, 0.15, 0.035, 8);
        y += gauss(t, 0.44, 0.05, 12);
        y += gauss(t, 0.58, 0.06, -13);
        push(x, y);
      }
      break;
    }
    case "LQT": {
      // normal QRS, but the T wave is pushed far later and stretched wide -
      // a long, low, broad hump instead of the normal beat's tight T wave.
      const cycleLen = width / 3.2;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        push(x, normalBeat(t, { tC: 0.80, tW: 0.16, tA: 12 }));
      }
      break;
    }
    case "RBBB": {
      // wide QRS with a double-humped "rabbit ears" rSR' pattern, a wide
      // terminal S, and a secondary T-wave flip after the notch.
      const cycleLen = width / 4.4;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        let y = gauss(t, 0.15, 0.035, 8);              // P wave
        y += triangle(t, 0.315, 0.015, -6);             // Q
        y += triangle(t, 0.335, 0.018, 30);             // R
        y += triangle(t, 0.355, 0.012, -8);             // notch dip between the "ears"
        y += triangle(t, 0.375, 0.02, 34);               // R' (second, taller ear)
        y += triangle(t, 0.405, 0.02, -16);              // wide terminal S
        y += gauss(t, 0.62, 0.07, -10);                  // secondary T-wave inversion
        push(x, y);
      }
      break;
    }
    case "LBBB": {
      // very wide, broad, notched R wave with no septal Q, and a T wave
      // that points the opposite way from the tall QRS (discordance).
      const cycleLen = width / 4.2;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        let y = gauss(t, 0.15, 0.035, 8);               // P wave
        y += triangle(t, 0.345, 0.032, 44);              // broad, wide R
        y += triangle(t, 0.362, 0.008, -6);              // subtle mid-upstroke notch/slur
        y += triangle(t, 0.40, 0.025, -18);              // wide terminal S back to baseline
        y += gauss(t, 0.62, 0.08, -14);                  // discordant, inverted T wave
        push(x, y);
      }
      break;
    }
    case "SSS": {
      // sinus rhythm that periodically just stops - a long flat pause with
      // no P wave and no QRS at all, then resumes on its own.
      let x = 0, beatIndex = 0;
      const cycleLen = width / 4.6;
      while (x <= width) {
        const isPause = beatIndex % 4 === 3;
        if (isPause) {
          const pauseLen = cycleLen * 1.9;
          for (let lx = 0; lx <= pauseLen && x + lx <= width; lx += step) push(x + lx, 0);
          x += pauseLen;
        } else {
          for (let lx = 0; lx <= cycleLen && x + lx <= width; lx += step) {
            const t = lx / cycleLen;
            push(x + lx, normalBeat(t));
          }
          x += cycleLen;
        }
        beatIndex++;
      }
      break;
    }
    case "LVH": {
      // unusually tall, high-voltage QRS, with the ST segment sagging down
      // into an inverted, asymmetric T wave - the classic "strain" pattern.
      const cycleLen = width / 4.8;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        let y = normalBeat(t, { rAmp: 60, sAmp: -24, qAmp: -6, tC: 0.56, tW: 0.06, tA: -11 });
        y += triangle(t, 0.42, 0.045, -9); // downsloping ST depression before the inverted T
        push(x, y);
      }
      break;
    }
    case "RVH": {
      // tall, dominant R wave with almost no S wave afterward (voltage
      // shifted the opposite way from LVH), plus a mild T-wave flip.
      const cycleLen = width / 4.8;
      for (let x = 0; x <= width; x += step) {
        const t = (x % cycleLen) / cycleLen;
        push(x, normalBeat(t, { rAmp: 52, sAmp: -4, qAmp: -3, tC: 0.58, tW: 0.065, tA: -6 }));
      }
      break;
    }
    default: {
      for (let x = 0; x <= width; x += step) push(x, 0);
    }
  }
  return pts;
}

function pointsToPath(pts) {
  if (!pts.length) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  return d;
}

/* Public: returns a full, ready-to-inject <svg> string for a rhythm type. */
function renderWaveformSVG(typeId, width, height, opts) {
  opts = opts || {};
  const gridColor = opts.gridColor || "rgba(57,255,136,0.12)";
  const traceColor = opts.traceColor || "#39ff88";
  const pts = generateWaveformPoints(typeId, width, height);
  const path = pointsToPath(pts);
  const gridStep = 20;
  let gridLines = "";
  for (let gx = 0; gx <= width; gx += gridStep) {
    gridLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${height}" stroke="${gridColor}" stroke-width="${gx % 100 === 0 ? 1.4 : 0.6}"/>`;
  }
  for (let gy = 0; gy <= height; gy += gridStep) {
    gridLines += `<line x1="0" y1="${gy}" x2="${width}" y2="${gy}" stroke="${gridColor}" stroke-width="${gy % 100 === 0 ? 1.4 : 0.6}"/>`;
  }
  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
    <g>${gridLines}</g>
    <path d="${path}" fill="none" stroke="${traceColor}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" class="ecg-trace-path"/>
  </svg>`;
}

window.renderWaveformSVG = renderWaveformSVG;

/* ---------------------------------------------------------------------
   PIECE SLICING — cuts any rhythm's continuous trace into N equal-width
   segments so the game can hand out small draggable "puzzle pieces" that
   either continue a target strip correctly, or don't (decoys).
   Deterministic: the same typeId always produces the same full trace
   (seeded PRNG), so a piece sliced from segment i always lines up with
   the same piece sliced again later.
   --------------------------------------------------------------------- */
function renderPieceSVG(typeId, segIndex, totalSegments, trackWidth, trackHeight, opts) {
  opts = opts || {};
  const gridColor = opts.gridColor || "rgba(57,255,136,0.10)";
  const traceColor = opts.traceColor || "#39ff88";
  const full = generateWaveformPoints(typeId, trackWidth, trackHeight);
  const segW = trackWidth / totalSegments;
  const xStart = segIndex * segW;
  const xEnd = xStart + segW;
  const slice = full
    .filter((p) => p[0] >= xStart - 1 && p[0] <= xEnd + 1)
    .map((p) => [Math.max(0, Math.min(segW, p[0] - xStart)), p[1]]);
  const path = pointsToPath(slice);
  const gridStep = 20;
  let gridLines = "";
  for (let gx = 0; gx <= segW; gx += gridStep) {
    gridLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${trackHeight}" stroke="${gridColor}" stroke-width="0.6"/>`;
  }
  for (let gy = 0; gy <= trackHeight; gy += gridStep) {
    gridLines += `<line x1="0" y1="${gy}" x2="${segW}" y2="${gy}" stroke="${gridColor}" stroke-width="0.6"/>`;
  }
  return `
  <svg viewBox="0 0 ${segW} ${trackHeight}" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <g>${gridLines}</g>
    <path d="${path}" fill="none" stroke="${traceColor}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

window.renderPieceSVG = renderPieceSVG;
