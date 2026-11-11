import { P, clamp, TAU } from './palette.js';
import { box, ellipse, gradient, line, poly } from './primitives.js';

// Drawing dimensions only. Every quantity is supplied by the read-only hourly
// projection; no inventory is manufactured by the illustration.
export function drawRadioactiveGlyph(c, x, y, r = .17) {
  ellipse(c, x, y, r * 1.14, r * 1.14, '#e6d7a6', P.ink, .025);
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 - Math.PI / 2;
    c.beginPath(); c.arc(x, y, r * .88, a - .48, a + .48);
    c.arc(x, y, r * .36, a + .48, a - .48, true);
    c.closePath(); c.fillStyle = '#302439'; c.fill();
  }
  ellipse(c, x, y, r * .19, r * .19, '#302439');
}

export function drawFilterRack(c, x, y, remaining, empty = false) {
  // A partly used cartridge retains its casing but loses its pale pleats.
  // Each slot is one cartridge, capped at three visible physical slots.
  box(c, x - .08, y - .04, 1.12, .73, '#253533', .035, '#8f9d8f', .035);
  for (let i = 0; i < 3; i++) {
    const xx = x + .025 + i * .33;
    line(c, [xx + .12, y + .12, xx + .12, y + .58], '#51635c', .045);
    line(c, [xx + .02, y + .61, xx + .23, y + .61], '#9aab94', .035);
    const fraction = empty ? 0 : clamp(remaining - i);
    if (fraction <= 0) continue;
    box(c, xx, y + .1, .25, .47, '#4e574b', .04, '#c9c5a8', .025);
    box(c, xx + .035, y + .125 + .39 * (1 - fraction), .18, .39 * fraction,
      '#e6dcb4', .015, null);
    for (let j = 0; j < 3; j++) line(c,
      [xx + .06 + j * .065, y + .14, xx + .06 + j * .065, y + .49], '#9b9d83', .015);
    line(c, [xx + .06, y + .09, xx + .06, y + .035, xx + .19, y + .035, xx + .19, y + .09], '#d0c7a2', .028);
  }
}

export function drawColonyFilterMeter(c, x, y, reserve) {
  if (!reserve) return;
  // A stopped local machine does not prove that the whole colony is empty:
  // cartridges can still be in another room or carried by a transporter.
  const fill = reserve.colonyFiltersFill ?? 0, empty = fill <= 0;
  const color = empty || reserve.colonyFiltersStatus === 'red' ? '#ed795f'
    : reserve.colonyFiltersStatus === 'amber' ? '#e2bb63' : '#d3d8bc';
  // Bunker silhouette explicitly separates the entire shelter from the rack.
  poly(c, [x, y + .08, x + .11, y, x + .23, y + .08, x + .23, y + .23, x, y + .23], '#26342f', '#d2cbb0', .025);
  box(c, x + .09, y + .11, .055, .12, '#d2cbb0', .01, null);
  box(c, x + .29, y + .035, .57, .19, '#253330', .018, '#8d9a86', .02);
  if (fill > 0) box(c, x + .315, y + .06, .52 * fill, .14, color, .008, null);
  for (let i = 1; i < 5; i++) line(c, [x + .29 + i * .114, y + .035, x + .29 + i * .114, y + .225], '#435449', .018);
  if (empty) line(c, [x + .38, y + .05, x + .77, y + .21, x + .38, y + .21, x + .77, y + .05], '#f3d9c0', .035);
}

function storedWaterGlass(c, x, floor, level, radioactive) {
  const top = floor - 1.08, w = .59, glassTop = top + .2, glassHeight = .64;
  box(c, x, top, w, 1.08, gradient(c, x, 0, w, 0, '#728779', '#2b4342'), .09);
  line(c, [x + .16, top, x + .16, top - .1, x + .43, top - .1, x + .43, top], '#c7c4a5', .045);
  box(c, x + .08, glassTop, .43, glassHeight, '#203135', .028, '#afbaa5', .022);
  const y = glassTop + glassHeight * (1 - level), height = glassHeight * level;
  if (level > 0) {
    c.save(); c.beginPath(); c.rect(x + .1, y, .39, height); c.clip();
    box(c, x + .1, y, .39, height, radioactive ? '#aa83ad' : '#ae9867', 0, null);
    if (radioactive) {
      for (let yy = glassTop - .3; yy < floor; yy += .18)
        line(c, [x + .1, yy, x + .49, yy + .25], '#eee4d2', .033);
    } else for (let i = 0; i < 6; i++) ellipse(c, x + .17 + i % 2 * .18, glassTop + .12 + Math.floor(i / 2) * .19, .024, .018, '#6d6249');
    c.restore();
    line(c, [x + .1, y, x + .49, y], '#e4e3c5', .035);
  }
  if (radioactive) drawRadioactiveGlyph(c, x + .3, top + .88, .135);
  else {
    poly(c, [x + .3, top + .78, x + .22, top + .91, x + .24, top + .96, x + .36, top + .96, x + .38, top + .91], '#d6c59a', P.ink, .02);
    for (let i = 0; i < 3; i++) ellipse(c, x + .26 + i * .04, top + .91, .012, .012, '#685d43');
  }
}

export function drawStoredWater(c, w, h, reserve) {
  if (!reserve || !(reserve.dirtyWaterFill > 0 || reserve.radioactiveWaterFill > 0)) return;
  c.save();
  // Two honest local gauges: an empty dirty-water glass stays visible beside
  // radioactive contents, so replacement and mixture are both readable.
  const left = w - 1.6, floor = h - .1;
  box(c, left - .08, floor - .02, 1.47, .10, '#685d44', .02);
  storedWaterGlass(c, left, floor - .02, reserve.dirtyWaterFill ?? 0, false);
  storedWaterGlass(c, left + .73, floor - .02, reserve.radioactiveWaterFill ?? 0, true);
  c.restore();
}
