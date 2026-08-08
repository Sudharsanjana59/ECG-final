/* =========================================================================
   ECG-DATA.JS
   This is the master dataset. It is the single source of truth used by:
     - game.js      (to build each level's puzzle)
     - admin.html   (to display / export the dataset for the admin)
   An admin can edit waveform definitions, hints, and level composition here
   without touching any game logic.

   16 rhythms, 16 levels — one unique topic per level, no repeats, exactly
   the high-yield ECG diagnosis list: normal sinus rhythm, atrial flutter,
   atrial fibrillation, ventricular tachycardia, ventricular fibrillation,
   torsades de pointes, 2nd-degree AV block, complete heart block (AV
   dissociation), RBBB, LBBB, Brugada syndrome, Long QT syndrome, WPW
   syndrome, sick sinus syndrome, LVH, and RVH.
   ========================================================================= */

const ECG_TYPES = {
  NSR:      { id: "NSR",      name: "Normal Sinus Rhythm",              difficulty: "easy",   rate: "60-100 bpm",
    hint: "Regular rhythm, rate 60–100 bpm. Every P wave is followed by a QRS, every QRS by a T wave. Nothing irregular." },
  AFLUT:    { id: "AFLUT",    name: "Atrial Flutter",                   difficulty: "hard",   rate: "Variable, saw-tooth",
    hint: "A fast, regular saw-tooth pattern between QRS complexes — like the teeth of a saw — instead of a flat baseline with P waves." },
  AFIB:     { id: "AFIB",     name: "Atrial Fibrillation",              difficulty: "medium", rate: "Variable",
    hint: "No true P waves — just a wobbly, fibrillating baseline. The spacing between QRS spikes is irregularly irregular." },
  VTACH:    { id: "VTACH",    name: "Ventricular Tachycardia",          difficulty: "critical", rate: ">150 bpm",
    hint: "Wide, tall, smooth sine-like complexes racing very fast, one after another, with no visible P waves at all." },
  VFIB:     { id: "VFIB",     name: "Ventricular Fibrillation",         difficulty: "critical", rate: "None (chaotic)",
    hint: "Completely chaotic squiggle — no recognizable P, QRS, or T at all. There is no organized rhythm left to name." },
  TDP:      { id: "TDP",      name: "Torsades de Pointes",              difficulty: "critical", rate: "Very fast, chaotic",
    hint: "Looks like ventricular tachycardia, but the peaks visibly twist — growing and shrinking as they spiral around the baseline." },
  AVB2:     { id: "AVB2",     name: "2nd-Degree AV Block",              difficulty: "hard",   rate: "Variable, grouped",
    hint: "Watch the PR gap: it grows a little longer with each beat until one QRS is dropped entirely — then the pattern resets (Wenckebach)." },
  AVB3:     { id: "AVB3",     name: "Complete Heart Block (AV Dissociation)", difficulty: "critical", rate: "Independent P & QRS rates",
    hint: "P waves march through at their own steady beat, totally unrelated in timing to a separate, slower run of wide QRS complexes — the atria and ventricles have fully split apart." },
  RBBB:     { id: "RBBB",     name: "Right Bundle Branch Block",        difficulty: "hard",   rate: "60-100 bpm",
    hint: "Wide QRS with a double-humped 'rabbit ears' R wave (rSR' pattern), followed by a wide terminal S and a flipped T wave." },
  LBBB:     { id: "LBBB",     name: "Left Bundle Branch Block",         difficulty: "hard",   rate: "60-100 bpm",
    hint: "A very wide, broad, notched R wave with no small initial Q, and the T wave points the opposite way from the tall QRS." },
  BRUGADA:  { id: "BRUGADA",  name: "Brugada Syndrome",                 difficulty: "critical", rate: "60-100 bpm",
    hint: "A normal-ish QRS is followed by a raised, dome-shaped ('coved') ST segment that curves straight into an inverted, downward T wave." },
  LQT:      { id: "LQT",      name: "Long QT Syndrome",                 difficulty: "hard",   rate: "60-100 bpm",
    hint: "Normal-looking QRS, but everything from the QRS to the end of the T wave is stretched out much further than usual." },
  WPW:      { id: "WPW",      name: "Wolff–Parkinson–White Syndrome",   difficulty: "hard",   rate: "60-100 bpm",
    hint: "The PR gap is unusually short, and the QRS starts with a slow, slurred upstroke (a 'delta wave') before it shoots up." },
  SSS:      { id: "SSS",      name: "Sick Sinus Syndrome",              difficulty: "hard",   rate: "Variable, pauses",
    hint: "Normal beats run fine, then the sinus node simply goes quiet — a long flat pause with no P wave and no QRS before it resumes." },
  LVH:      { id: "LVH",      name: "Left Ventricular Hypertrophy",     difficulty: "medium", rate: "60-100 bpm",
    hint: "Unusually tall, high-voltage QRS spikes, with the ST segment sagging down into an inverted T wave (the 'strain' pattern)." },
  RVH:      { id: "RVH",      name: "Right Ventricular Hypertrophy",    difficulty: "medium", rate: "60-100 bpm",
    hint: "A tall, dominant R wave with almost no S wave afterward, plus a mildly flipped T wave — voltage shifted the opposite way from LVH." },
};

/* One topic (one rhythm) per level, ordered exactly as requested. Each
   level is a deep-dive on a single rhythm — no mixing multiple topics into
   one board, and no topic ever repeats across levels — so a player masters
   one pattern before moving to the next. */
const LEVELS = [
  { level: 1,  title: "Normal Sinus Rhythm",              description: "The textbook baseline every other rhythm gets compared to.",              waveforms: ["NSR"],     extraDistractors: ["SSS", "LVH"],     segments: 3, timeBonusSeconds: 45,  orderHint: "Slot 1 is a clean, unremarkable beat — P wave, narrow QRS, T wave, nothing stretched or skipped." },
  { level: 2,  title: "Atrial Flutter",                    description: "Lock onto the fast saw-tooth pattern between beats.",                     waveforms: ["AFLUT"],   extraDistractors: ["AFIB", "SSS"],    segments: 4, timeBonusSeconds: 80,  orderHint: "Slot 1 opens with the saw-tooth baseline already running — there's no flat lead-in beat." },
  { level: 3,  title: "Atrial Fibrillation",                description: "No true P waves — just an irregularly irregular wobble.",                waveforms: ["AFIB"],    extraDistractors: ["AFLUT", "SSS"],   segments: 4, timeBonusSeconds: 80,  orderHint: "Slot 1 already shows the wobbly, no-P-wave baseline — it never looks 'normal' at any point." },
  { level: 4,  title: "Ventricular Tachycardia",            description: "Wide, fast, smooth complexes — no P waves anywhere.",                     waveforms: ["VTACH"],   extraDistractors: ["TDP", "VFIB"],    segments: 4, timeBonusSeconds: 85,  orderHint: "Slot 1 opens with the wide, fast, smooth complexes — there's no normal beat leading in." },
  { level: 5,  title: "Ventricular Fibrillation",           description: "Total chaos — no organized pattern left to name.",                       waveforms: ["VFIB"],    extraDistractors: ["VTACH", "TDP"],   segments: 4, timeBonusSeconds: 85,  orderHint: "Slot 1 is already chaotic — there's no organized beat anywhere, including the start." },
  { level: 6,  title: "Torsades de Pointes",                description: "A twisting, spiraling amplitude gives this VT variant away.",             waveforms: ["TDP"],     extraDistractors: ["VTACH", "VFIB"],  segments: 5, timeBonusSeconds: 100, orderHint: "Slot 1 begins the twisting pattern at smaller amplitude, before it grows outward." },
  { level: 7,  title: "2nd-Degree AV Block",                description: "Watch the PR interval stretch, beat by beat, until one drops.",           waveforms: ["AVB2"],    extraDistractors: ["AVB3", "NSR"],    segments: 5, timeBonusSeconds: 100, orderHint: "Slot 1 has the shortest PR gap of the sequence — it's the start of the lengthening pattern." },
  { level: 8,  title: "Complete Heart Block (AV Dissociation)", description: "P waves and QRS complexes marching to two different drummers.",       waveforms: ["AVB3"],    extraDistractors: ["AVB2", "LBBB"],   segments: 5, timeBonusSeconds: 105, orderHint: "Slot 1 shows a P wave and QRS that don't line up — the independence starts immediately." },
  { level: 9,  title: "Right Bundle Branch Block",          description: "A double-humped 'rabbit ears' QRS gives RBBB away.",                     waveforms: ["RBBB"],    extraDistractors: ["LBBB", "WPW"],    segments: 4, timeBonusSeconds: 90,  orderHint: "Slot 1 already shows the normal P wave leading into the wide, notched QRS." },
  { level: 10, title: "Left Bundle Branch Block",           description: "A single broad, notched R wave with a discordant T wave.",               waveforms: ["LBBB"],    extraDistractors: ["RBBB", "WPW"],    segments: 4, timeBonusSeconds: 90,  orderHint: "Slot 1 already shows the wide, broad R wave building — no small Q ever appears before it." },
  { level: 11, title: "Brugada Syndrome",                   description: "A coved ST dome that curves straight into an inverted T wave.",           waveforms: ["BRUGADA"], extraDistractors: ["RBBB", "LQT"],    segments: 5, timeBonusSeconds: 105, orderHint: "Slot 1 already shows the coved ST dome curving into the inverted T wave." },
  { level: 12, title: "Long QT Syndrome",                   description: "Everything after the QRS is stretched out further than usual.",           waveforms: ["LQT"],     extraDistractors: ["BRUGADA", "NSR"], segments: 5, timeBonusSeconds: 105, orderHint: "Slot 1 already shows the stretched-out QT interval — it's long from the very first beat." },
  { level: 13, title: "Wolff–Parkinson–White Syndrome",     description: "Short PR interval plus a slurred delta-wave upstroke.",                   waveforms: ["WPW"],     extraDistractors: ["RBBB", "LBBB"],   segments: 5, timeBonusSeconds: 100, orderHint: "Slot 1 already shows the short PR gap and slurred delta-wave upstroke." },
  { level: 14, title: "Sick Sinus Syndrome",                description: "The sinus node itself drops out, leaving a long silent pause.",           waveforms: ["SSS"],     extraDistractors: ["NSR", "AFIB"],    segments: 5, timeBonusSeconds: 110, orderHint: "Slot 1 is a normal beat — the long flat pause with no P wave or QRS shows up later." },
  { level: 15, title: "Left Ventricular Hypertrophy",       description: "Tall, high-voltage QRS spikes with an ST/T 'strain' pattern.",            waveforms: ["LVH"],     extraDistractors: ["RVH", "BRUGADA"], segments: 4, timeBonusSeconds: 90,  orderHint: "Slot 1 already shows the taller-than-normal QRS spike and the sagging ST/T that follows it." },
  { level: 16, title: "Right Ventricular Hypertrophy",      description: "A dominant R wave with almost no S wave, plus a mild T-wave flip.",       waveforms: ["RVH"],     extraDistractors: ["LVH", "BRUGADA"], segments: 4, timeBonusSeconds: 90,  orderHint: "Slot 1 already shows the tall, dominant R wave with barely any S wave dipping after it." },
];

/* ---------------------------------------------------------------------
   COLOR THEMES — every level gets its own hue, spaced evenly around the
   color wheel, so no two levels can ever end up looking alike no matter
   how many levels this dataset grows to.
   ------------------------------------------------------------------- */
const LEVEL_ICONS = {
  1: "🫀", 2: "🪚", 3: "🌊", 4: "🏃", 5: "💥", 6: "🌀",
  7: "📉", 8: "🔌", 9: "🐇", 10: "🌐", 11: "🧬", 12: "⏱️",
  13: "🗡️", 14: "⏳", 15: "⬆️", 16: "➡️",
};

function themeForLevel(levelNum) {
  const total = LEVELS.length || 16;
  const hue = Math.round(((levelNum - 1) * (360 / total)) % 360);
  const accent = `hsl(${hue}, 78%, 58%)`;
  const accent2 = `hsl(${hue}, 70%, 32%)`;
  return { accent, accent2, icon: LEVEL_ICONS[levelNum] || "🫀", hue };
}

/* precomputed map, handy for admin table iteration */
const LEVEL_THEMES = {};
LEVELS.forEach((l) => { LEVEL_THEMES[l.level] = themeForLevel(l.level); });

/* Exposed globally so every page (game / admin) can read the same dataset. */
window.ECG_TYPES = ECG_TYPES;
window.LEVELS = LEVELS;
window.LEVEL_THEMES = LEVEL_THEMES;
window.themeForLevel = themeForLevel;
