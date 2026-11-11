import { P, clamp } from './palette.js';
import { box, ellipse, gradient, line, poly } from './primitives.js';

// Metres, like the other furniture drawers. Readouts are supplied by the game;
// the drawing never infers a warning threshold or discovers a pocket itself.
function gasDetector(c, w, h, o) {
  const scale = Math.max(.05, Math.min(1, (w - .3) / 2.7, (h - .25) / 2.65));
  const live = o.powered && o.detectorPowered !== false;
  const measured = live && Number.isFinite(o.methane);
  const level = measured ? clamp(o.methane / 100) : 0;
  const signal = !measured ? '#65746d' : o.gasAlert === 'danger' ? '#e18166'
    : o.gasAlert === 'warning' ? '#e4be73' : '#b2c892';
  c.save(); c.translate(w / 2, h - .10); c.scale(scale, scale);
  // A pair of wall probes and their exposed copper sampling lines.
  for (const x of [-1.05, 1.03]) {
    line(c, [x, -2.48, x, -1.36, x * .52, -1.36], P.ink, .105);
    line(c, [x, -2.48, x, -1.36, x * .52, -1.36], '#b29668', .057);
    box(c, x - .15, -2.56, .30, .48, '#748780', .065, P.ink, .029);
    for (let i = 0; i < 4; i++) line(c, [x - .105, -2.46 + i * .075, x + .105, -2.46 + i * .075], '#344a4b', .028);
    ellipse(c, x, -2.15, .028, .026, P.cream);
  }
  // Riveted cabinet, oversized analogue dial and a three-lamp warning column.
  for (const x of [-.49, .49]) box(c, x - .08, -.38, .16, .38, '#5a655e', .025);
  box(c, -.77, -1.91, 1.54, 1.61, gradient(c, -.8, -1.9, 1.6, 1.6, '#88988a', '#51665f'), .09, P.ink, .043);
  box(c, -.66, -1.78, 1.32, 1.05, '#384d4b', .055, '#b0b69a', .025);
  ellipse(c, -.17, -1.28, .43, .43, '#283e3f', '#afaa87', .045);
  ellipse(c, -.17, -1.28, .36, .36, measured ? '#ded0a4' : '#829082', P.ink, .018);
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI * (.77 + i * 1.46 / 8);
    line(c, [-.17 + Math.cos(angle) * .26, -1.28 + Math.sin(angle) * .26,
      -.17 + Math.cos(angle) * .31, -1.28 + Math.sin(angle) * .31], '#566255', .017);
  }
  if (measured) {
    const angle = Math.PI * (.77 + level * 1.46);
    line(c, [-.17, -1.28, -.17 + Math.cos(angle) * .27, -1.28 + Math.sin(angle) * .27], '#a7604c', .034);
  } else line(c, [-.31, -1.14, -.03, -1.42], '#62756c', .035);
  ellipse(c, -.17, -1.28, .042, .042, P.metalDark, '#c2b68c', .015);
  const activeLamp = o.gasAlert === 'danger' ? 0 : o.gasAlert === 'warning' ? 1 : 2;
  for (let i = 0; i < 3; i++) {
    ellipse(c, .43, -1.59 + i * .28, .095, .095, P.ink, '#9c9e81', .016);
    ellipse(c, .43, -1.59 + i * .28, .067, .067, measured && i === activeLamp ? signal : '#4a5b51');
    if (measured && i === activeLamp) ellipse(c, .412, -1.612 + i * .28, .018, .018, P.ivory);
  }
  box(c, -.59, -.63, .79, .19, '#344a47', .026);
  for (let i = 0; i < 5; i++) line(c, [-.52 + i * .14, -.59, -.52 + i * .14, -.48], '#a8a88b', .024);
  ellipse(c, .44, -.54, .085, .085, '#c1b488', P.ink, .023);
  line(c, [.44, -.59, .44, -.54], '#4a5d53', .023);
  for (const x of [-.68, .68]) for (const y of [-1.83, -.39]) ellipse(c, x, y, .025, .025, '#c9c2a1', P.ink, .012);
  // Gas-pipe symbol is pictorial; no new visible copy is introduced.
  poly(c, [-.20, -2.22, 0, -2.57, .20, -2.22], '#c6b17e', P.ink, .022);
  ellipse(c, 0, -2.33, .035, .052, '#4f6557');
  c.restore();
}

export const HAZARD_PROPS = Object.freeze({ gasDetector });
