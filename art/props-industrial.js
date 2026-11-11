import { P, TAU, clamp, hash } from './palette.js';
import { box, ellipse, gradient, line, poly } from './primitives.js';
import { drawStoredMaterials } from './props-domestic.js';
import { drawFilterRack, drawColonyFilterMeter } from './props-reserves.js';

// These drawings use metres, with the room floor at h. They never read game state.
const copper = '#b78b65';
const copperDark = '#75503d';
const brass = '#c6ac75';
const steel = '#83998d';
const deep = '#34484a';

function pipe(c, points, width = .13, color = copper) {
  line(c, points, P.ink, width + .045);
  line(c, points, color, width);
  const light = points.map((v, i) => v - (i % 2 ? .025 : .015));
  line(c, light, 'rgba(244,224,181,.26)', width * .22);
}

function bolts(c, x, y, w, h, spacing = .45) {
  for (let px = x + .1; px < x + w; px += spacing) {
    ellipse(c, px, y + .07, .025, .025, P.cream, P.ink, .012);
    if (h > .2) ellipse(c, px, y + h - .07, .025, .025, P.cream, P.ink, .012);
  }
}

function gauge(c, x, y, r = .16, level = .6) {
  ellipse(c, x, y, r + .035, r + .035, P.metalDark, P.ink, .025);
  ellipse(c, x, y, r, r, P.cream, P.ink, .018);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (.78 + i * .36);
    line(c, [x + Math.cos(a) * r * .67, y + Math.sin(a) * r * .67,
      x + Math.cos(a) * r * .83, y + Math.sin(a) * r * .83], P.inkSoft, .012);
  }
  const a = Math.PI * (.8 + level * 1.4);
  line(c, [x, y, x + Math.cos(a) * r * .7, y + Math.sin(a) * r * .7], P.rust, .022);
  ellipse(c, x, y, .025, .025, P.ink);
}

function wheel(c, x, y, r, angle, color = copper) {
  ellipse(c, x, y, r, r, P.metalDark, P.ink, .035);
  ellipse(c, x, y, r * .76, r * .76, P.shadow, color, .065);
  for (let i = 0; i < 5; i++) {
    const a = angle + i * TAU / 5;
    line(c, [x, y, x + Math.cos(a) * r * .77, y + Math.sin(a) * r * .77], color, .06);
  }
  ellipse(c, x, y, r * .2, r * .2, brass, P.ink, .025);
  ellipse(c, x - r * .04, y - r * .04, r * .045, r * .045, P.ivory);
}

function valve(c, x, y, r = .14, angle = 0) {
  c.save(); c.translate(x, y); c.rotate(angle);
  ellipse(c, 0, 0, r, r, P.rust, P.ink, .025);
  ellipse(c, 0, 0, r * .57, r * .57, P.inkSoft);
  line(c, [-r, 0, r, 0], P.rust, .055);
  line(c, [0, -r, 0, r], P.rust, .055);
  ellipse(c, 0, 0, .035, .035, brass); c.restore();
}

function status(c, x, y, on) {
  ellipse(c, x, y, .07, .07, P.ink);
  ellipse(c, x, y, .045, .045, on ? '#d6cb84' : '#675a43');
  if (on) ellipse(c, x - .01, y - .013, .014, .014, P.ivory);
}

function vapor(c, x, y, t, count = 3) {
  c.save();
  for (let i = 0; i < count; i++) {
    const age = (t * .55 + i / count) % 1;
    const px = x + Math.sin(age * 5 + i) * .09;
    ellipse(c, px, y - age * .65, .06 + age * .1, .04 + age * .08,
      `rgba(223,223,199,${.2 * (1 - age)})`);
  }
  c.restore();
}

function foot(c, x, y, width = .32) {
  box(c, x - width / 2, y - .12, width, .12, P.metalDark, .02);
  line(c, [x - width * .35, y - .1, x + width * .35, y - .1], P.metalLight, .022);
}

function tank(c, x, floor, width, height, color = P.teal, liquid = null, level = undefined) {
  const y = floor - height;
  foot(c, x + width * .2, floor); foot(c, x + width * .8, floor);
  box(c, x, y + .13, width, height - .25,
    gradient(c, x, y, width, 0, color, deep), width * .25);
  ellipse(c, x + width / 2, y + .16, width / 2, .15, P.metalLight, P.ink, .025);
  line(c, [x + .09, y + .22, x + .09, floor - .24], 'rgba(242,231,192,.3)', .045);
  box(c, x - .025, y + height * .33, width + .05, .11, P.metalDark, .02);
  box(c, x - .025, y + height * .73, width + .05, .11, P.metalDark, .02);
  bolts(c, x, y + height * .33, width, .11, .35);
  if (liquid) {
    if(level===undefined) {
      box(c, x + width * .43, y + .42, width * .16, height * .5, '#243d40', .025);
      box(c, x + width * .455, y + .64, width * .11, height * .5 - .25, liquid, .015, null);
      line(c, [x + width * .47, y + .47, x + width * .47, y + height * .65], 'rgba(245,241,219,.5)', .018);
    } else {
      // A broad inspection window survives the compact shelter zoom.
      const gx=x+width*.20,gy=y+.52,gw=width*.58,gh=height-.89;
      box(c,gx-.045,gy-.045,gw+.09,gh+.09,P.metalDark,.05,P.metalLight,.025);
      box(c,gx,gy,gw,gh,'#203639',.025,null);
      if(level>0) {
        box(c,gx+.025,gy+gh*(1-level),gw-.05,gh*level,liquid,.015,null);
        line(c,[gx+.025,gy+gh*(1-level),gx+gw-.025,gy+gh*(1-level)],'#dbd7ac',.035);
      }
      line(c,[gx+.07,gy+.06,gx+.07,gy+gh-.06],'rgba(233,239,211,.4)',.027);
      for(let k=1;k<5;k++)line(c,[gx+gw,gy+gh*k/5,gx+gw+.11,gy+gh*k/5],P.cream,.025);
    }
  }
}

function barrel(c, x, floor, color = '#8d6c4d', tilted = false) {
  c.save(); c.translate(x, floor); if (tilted) c.rotate(.95);
  box(c, -.31, -.85, .62, .8, gradient(c, -.3, 0, .6, 0, color, copperDark), .1);
  ellipse(c, 0, -.8, .31, .09, color, P.ink, .025);
  box(c, -.32, -.64, .64, .07, P.metalDark, .02);
  box(c, -.32, -.24, .64, .07, P.metalDark, .02);
  ellipse(c, .12, -.82, .05, .025, P.inkSoft); c.restore();
}

function fuelCan(c,x,floor,empty=false) {
  c.save();c.translate(x,floor);
  if(empty){c.translate(-.14,-.07);c.rotate(Math.PI/2);}
  box(c,-.22,-.62,.44,.59,gradient(c,-.22,-.62,.44,0,empty?'#796d55':'#d4ac59',empty?'#514e41':'#8c6b3f'),.055);
  line(c,[-.11,-.63,-.11,-.75,.09,-.75,.09,-.63],P.metalLight,.055);
  box(c,.105,-.69,.10,.075,empty?'#26302e':P.metalDark,.015);
  if(empty) {
    ellipse(c,.15,-.695,.047,.025,P.ink,P.metalLight,.015);
    line(c,[-.14,-.49,.14,-.14,-.14,-.14,.14,-.49],P.metalDark,.025);
  } else {
    box(c,-.16,-.46,.32,.22,P.cream,.015,null);
    poly(c,[0,-.43,-.065,-.33,-.045,-.28,.045,-.28,.065,-.33],P.woodDark,null);
    line(c,[-.16,-.1,.14,-.1],'#f1d197',.025);
  }
  c.restore();
}

function reserveLamp(c,x,y,reserve,t) {
  const color=reserve.fuelStatus==='red'?'#ff6951':reserve.fuelStatus==='amber'?'#ffd077':'#99e098';
  const bright=reserve.fuelStatus!=='red'||Math.cos(t*TAU*1.5)>=0;
  box(c,x-.24,y+.1,.48,.10,P.metalDark,.025);
  if(bright)ellipse(c,x,y,.25,.25,reserve.fuelStatus==='red'?'rgba(255,91,61,.18)':reserve.fuelStatus==='amber'?'rgba(255,198,96,.15)':'rgba(153,224,152,.13)');
  ellipse(c,x,y,.17,.17,P.ink,P.metalLight,.025);
  ellipse(c,x,y,.13,.13,bright?color:'#623e30');
  if(bright)ellipse(c,x-.035,y-.04,.045,.045,'#fff0ce');
}

function diesel(c, w, h, opts = {}) {
  c.save();
  const reserve=opts.reserveArt;
  const powered = opts.powered !== false&&!reserve?.fuelEmpty;
  const t = powered ? (opts.t || 0) : 0;
  const damage = clamp(opts.damage || 0);
  const floor = h - .08;
  const count = Math.max(1, Math.floor((w - .6) / 4.4));
  const span = (w - .6) / count;
  for (let n = 0; n < count; n++) {
    const x = .3 + n * span;
    const size = Math.min(1, (span - .1) / 4.2);
    c.save(); c.translate(x, floor); c.scale(size, size);
    ellipse(c, 1.7, -.06, 1.75, .09, 'rgba(13,20,20,.35)');
    pipe(c, [1.4, -1.7, 1.4, -2.4, 2.65, -2.4, 2.65, -3.2], .13, P.metal);
    box(c, 1.22, -2.63, .36, .58, P.metalDark, .07);
    for (let i = 0; i < 3; i++) line(c, [1.24, -2.51 + i * .12, 1.56, -2.51 + i * .12], P.metalLight, .025);
    box(c, .05, -.3, 3.05, .21, '#695d4e', .025); bolts(c, .05, -.3, 3.05, .21);
    foot(c, .4, 0, .45); foot(c, 2.7, 0, .45);
    const vibration = powered ? Math.sin(t * 25) * .009 : 0;
    c.translate(0, vibration);
    box(c, .2, -1.45, 2.6, 1.12, gradient(c, .2, -1.45, 0, 1.1, '#789289', '#47625e'), .14);
    box(c, .45, -1.68, 1.6, .3, P.metalDark, .07);
    for (let j = 0; j < 3; j++) {
      box(c, .57 + j * .48, -1.85, .3, .45, steel, .05);
      pipe(c, [.72 + j * .48, -1.85, .72 + j * .48, -2.05, 2.15, -2.05], .045, copper);
    }
    for (let j = 0; j < 6; j++) line(c, [1.57 + j * .15, -1.24, 1.57 + j * .15, -.73], P.metalDark, .065);
    box(c, 2.35, -1.31, .32, .62, '#9b8261', .03);
    gauge(c, 2.51, -1.08, .1, powered ? .6 + Math.sin(t * 4) * .035 : .08);
    if(reserve)reserveLamp(c,2.5,-1.61,reserve,opts.t||0);
    else status(c, 2.5, -.82, powered);
    wheel(c, .78, -.86, .55, t * 3.2);
    wheel(c, 2.96, -.6, .26, -t * 6.6, P.metalLight);
    line(c, [.77, -1.42, 3.05, -.85], P.ink, .06);
    line(c, [.79, -.31, 3.02, -.34], P.ink, .06);
    for (let j = 0; j < 4; j++) ellipse(c, 1.4 + j * .32, -.47, .025, .025, P.cream);
    if (damage > .35) {
      line(c, [1.93, -.98, 1.84, -.82, 2.04, -.74, 1.93, -.53], P.ink, .035);
      ellipse(c, 2.1, -.08, .4 * damage, .045, '#352e28');
    }
    if(reserve) {
      // One group per room, even when a wide room repeats the engine module.
      if(n===count-1) {
        if(reserve.fuelEmpty)fuelCan(c,3.62,0,true);
        else for(let can=0;can<reserve.fuelCans;can++)fuelCan(c,3.43+(can%2)*.51,-Math.floor(can/2)*.76);
      }
    } else barrel(c, 3.7, 0, '#9a794f', damage > .8);
    if (powered) vapor(c, 2.66, -3.15, t);
    c.restore();
  }
  c.restore();
}

function bench(c, x, floor, width, color = P.wood) {
  box(c, x + .1, floor - 1.05, .14, 1.05, P.woodDark, .015);
  box(c, x + width - .25, floor - 1.05, .14, 1.05, P.woodDark, .015);
  box(c, x + .05, floor - 1.16, width - .1, .18,
    gradient(c, x, floor - 1.16, 0, .18, P.woodLight, color), .035);
  line(c, [x + .12, floor - 1.13, x + width - .13, floor - 1.13], P.cream, .02);
  box(c, x + .22, floor - .9, width - .44, .53, color, .03);
  const drawers = Math.max(1, Math.floor((width - .4) / .85));
  for (let i = 0; i < drawers; i++) {
    const dw = (width - .48) / drawers;
    box(c, x + .24 + i * dw, floor - .86, dw - .035, .43, P.woodDark, .02);
    box(c, x + .28 + i * dw, floor - .82, dw - .11, .35, color, .02);
    line(c, [x + .24 + i * dw + dw * .35, floor - .66,
      x + .24 + i * dw + dw * .65, floor - .66], brass, .04);
  }
}

function workshop(c, w, h, opts = {}) {
  c.save();
  const powered = opts.powered !== false;
  const t = powered ? (opts.t || 0) : 0;
  const floor = h - .08;
  const count = Math.max(1, Math.floor((w - .4) / 4.7));
  const width = (w - .6) / count;
  for (let n = 0; n < count; n++) {
    const x = .3 + n * width;
    box(c, x + .18, floor - 2.75, width - .36, 1.2, '#655d4c', .04);
    for (let px = .32; px < width - .2; px += .24) {
      for (let py = 0; py < 4; py++) ellipse(c, x + px, floor - 2.58 + py * .24, .012, .012, '#b0a183');
    }
    for (let j = 0; j < 5; j++) {
      const tx = x + .5 + j * Math.min(.55, (width - 1) / 5);
      const ty = floor - 2.49;
      line(c, [tx, ty, tx, ty + .55], j % 2 ? P.woodLight : P.metalLight, .075);
      if (j % 2) box(c, tx - .16, ty - .05, .32, .12, P.metal, .025);
      else {
        line(c, [tx - .07, ty - .08, tx - .07, ty + .02, tx + .07, ty + .02, tx + .07, ty - .08], brass, .06);
      }
    }
    bench(c, x, floor, width - .15);
    const vx = x + .45;
    box(c, vx, floor - 1.4, .65, .24, P.metalDark, .025);
    box(c, vx + .1, floor - 1.62, .18, .3, steel, .02);
    box(c, vx + .49, floor - 1.62, .18, .3, steel, .02);
    line(c, [vx - .05, floor - 1.27, vx + .8, floor - 1.27], brass, .045);
    line(c, [vx + .8, floor - 1.43, vx + .8, floor - 1.11], brass, .04);
    box(c, x + width - 1.3, floor - 1.29, .9, .14, P.metalDark, .03);
    pipe(c, [x + width - 1.1, floor - 1.3, x + width - 1.1, floor - 2.22], .1, steel);
    box(c, x + width - 1.16, floor - 2.28, .64, .33, '#7d988a', .06);
    line(c, [x + width - .65, floor - 2, x + width - .65, floor - 1.65 + Math.sin(t * 3) * .05], brass, .055);
    wheel(c, x + width - .55, floor - 2.14, .13, t * 4, copper);
    status(c, x + width - .99, floor - 2.12, powered);
    // A rolled drawing, a carpenter's pencil, and a scattered handful of shavings.
    box(c, x + 1.6, floor - 1.23, .7, .08, P.cream, .03);
    ellipse(c, x + 1.62, floor - 1.19, .06, .06, P.cream, P.woodDark, .02);
    line(c, [x + 1.85, floor - 1.28, x + 2.13, floor - 1.34], P.rust, .035);
    for (let j = 0; j < 7; j++) {
      const px = x + .4 + hash(n, j) * (width - .8);
      line(c, [px, floor - .04, px + .08, floor - .09, px + .14, floor - .045], P.woodLight, .025);
    }
  }
  if(opts.reserveArt)drawStoredMaterials(c,.35,floor-.06,w-.7,opts.reserveArt);
  c.restore();
}

function well(c, w, h, opts = {}) {
  c.save();
  const powered = opts.powered !== false;
  const t = powered ? (opts.t || 0) : 0;
  const floor = h - .08;
  const count = Math.max(1, Math.floor((w - .4) / 5.5));
  const span = (w - .6) / count;
  for (let n = 0; n < count; n++) {
    const x = .3 + span * n;
    const center = x + Math.min(span * .42, 2.1);
    // Stone ring and a timber gantry with rope and brass winding gear.
    const left = center - .95;
    box(c, left, floor - .79, 1.9, .68, '#817c68', .1);
    for (let row = 0; row < 3; row++) {
      const yy = floor - .72 + row * .2;
      line(c, [left + .05, yy + .15, left + 1.85, yy + .15], '#4f544e', .025);
      for (let j = 0; j < 4; j++) {
        const xx = left + .2 + j * .48 + (row % 2) * .22;
        if (xx < left + 1.8) line(c, [xx, yy - .04, xx, yy + .15], '#4f544e', .025);
      }
    }
    ellipse(c, center, floor - .79, 1.02, .22, '#b5ac8c', P.ink, .03);
    ellipse(c, center, floor - .8, .78, .13, '#243d41', P.ink, .025);
    ellipse(c, center, floor - .79, .65, .055, '#527d7a');
    for (const xx of [center - .85, center + .85]) {
      box(c, xx - .06, floor - 2.65, .13, 2.18, P.wood, .03);
      line(c, [xx, floor - 2.62, xx, floor - .62], P.woodLight, .02);
    }
    box(c, center - 1.02, floor - 2.65, 2.04, .2, P.woodLight, .03);
    line(c, [center - .85, floor - 2.1, center - .4, floor - 2.45], P.woodDark, .11);
    line(c, [center + .85, floor - 2.1, center + .4, floor - 2.45], P.woodDark, .11);
    line(c, [center - .91, floor - 2.09, center + 1.03, floor - 2.09], copperDark, .11);
    box(c, center - .28, floor - 2.26, .56, .34, P.woodDark, .08);
    for (let j = 0; j < 8; j++) line(c, [center - .23 + j * .065, floor - 2.24, center - .23 + j * .065, floor - 1.95], '#beab7e', .025);
    wheel(c, center + 1, floor - 2.09, .33, t * .75, copper);
    const bucketY = floor - 1.15 - (powered ? (1 + Math.sin(t * .75)) * .19 : .1);
    line(c, [center, floor - 2.09, center, bucketY - .18], '#d0bd8e', .035);
    c.beginPath(); c.arc(center, bucketY + .03, .22, Math.PI, TAU); c.strokeStyle = P.metalLight; c.lineWidth = .035; c.stroke();
    poly(c, [center - .24, bucketY, center + .24, bucketY, center + .18, bucketY + .35, center - .18, bucketY + .35], P.metal, P.ink);
    line(c, [center - .2, bucketY + .05, center - .16, bucketY + .3], P.metalLight, .035);
    if (span > 4.3) {
      const px = x + span - 1.03;
      tank(c, px - .37, floor, .74, 1.15, P.teal, P.water);
      pipe(c, [px, floor - 1.15, px, floor - 1.8, px - .5, floor - 1.8, px - .5, floor - 1.45], .11);
      valve(c, px + .02, floor - 1.55, .14);
      if (powered) {
        for (let j = 0; j < 3; j++) {
          const a = (t * .8 + j / 3) % 1;
          ellipse(c, px - .5, floor - 1.44 + a * .58, .025, .045, 'rgba(146,195,187,.65)');
        }
      }
      ellipse(c, px - .5, floor - .12, .44, .1, '#547c7a', P.ink, .03);
    }
  }
  c.restore();
}

function filterPlant(c, w, h, opts = {}) {
  c.save();
  const powered = opts.powered !== false && opts.filterRunning !== false && !opts.noFilters;
  const t = powered ? (opts.t || 0) : 0;
  const floor = h - .08;
  const count = Math.max(1, Math.floor((w - .5) / 4.9));
  const span = (w - .6) / count;
  for (let n = 0; n < count; n++) {
    const x = .3 + span * n;
    const scale = Math.min(1, (span - .1) / 4.7);
    c.save(); c.translate(x, floor); c.scale(scale, scale);
    pipe(c, [.08, -2.35, .7, -2.35, .7, -2.6, 3.2, -2.6, 3.2, -2.1, 4.5, -2.1], .1);
    pipe(c, [.75, -.35, .75, -.23, 3.8, -.23, 3.8, -1.1, 4.5, -1.1], .12, P.metal);
    tank(c, .3, 0, 1.1, 2.36, '#8d8770', '#b2a06e', opts.reserveArt?.waterFill);
    tank(c, 1.9, 0, 1.1, 2.36, '#789a91', opts.reserveArt ? null : '#7fa9a2');
    for (let j = 0; j < 2; j++) {
      const xx = .85 + j * 1.6;
      gauge(c, xx, -1.82, .17, powered ? .55 + Math.sin(t * 1.5 + j) * .035 : .04);
      valve(c, xx, -.4, .16);
      if(!opts.reserveArt||j===1) {
        box(c, xx - .18, -1.4, .36, .25, '#b5b095', .025);
        for (let k = 0; k < 3; k++) line(c, [xx - .11, -1.34 + k * .05, xx + .11, -1.34 + k * .05], P.inkSoft, .014);
      }
      if (powered&&(!opts.reserveArt||opts.reserveArt.waterFill>0)) {
        for (let k = 0; k < 3; k++) {
          const age = (t * .35 + k / 3 + j * .1) % 1;
          ellipse(c, xx + .015, -1.06 - age * .48, .018, .025, 'rgba(234,230,188,.6)');
        }
      }
    }
    box(c, 3.45, -1.82, .85, 1.05, gradient(c, 3.45, -1.82, .85, 0, '#8b9b88', P.metalDark), .07);
    if (opts.noFilters) {
      // Bright stop plate and crossed cartridge silhouette remain readable
      // without red/green discrimination. Everything mechanical is still.
      box(c, 3.58, -1.76, .62, .48, '#b54f42', .045, '#e8cbb0', .03);
      line(c, [3.73, -1.66, 4.04, -1.36], '#fff0d2', .075);
      line(c, [4.04, -1.66, 3.73, -1.36], '#fff0d2', .075);
    } else gauge(c, 3.88, -1.5, .18, powered ? .72 : .08);
    status(c, 3.68, -1.08, powered);
    if (opts.noFilters) ellipse(c, 4.03, -1.08, .095, .095, '#fb7963', P.ink, .025);
    else status(c, 4.03, -1.08, false);
    line(c, [3.48, -1.8, 3.48, -.25], P.metalDark, .07);
    box(c, 3.52, -.61, .7, .27, P.metalDark, .04);
    wheel(c, 3.87, -.48, .15, t * 2, copper);
    if (opts.reserveArt && n === count - 1) {
      drawFilterRack(c, 3.44, -2.58, opts.reserveArt.localFilters ?? 0, opts.noFilters);
      drawColonyFilterMeter(c, 3.46, -.95, opts.reserveArt);
    }
    if (powered && (!opts.reserveArt || opts.reserveArt.waterFill > 0)) {
      // A clear, free outlet drop makes the running/stopped difference visible
      // beyond the tiny pressure needles at the ordinary 100% world zoom.
      for (let k = 0; k < 2; k++) {
        const age = (t * 1.25 + k / 2) % 1;
        ellipse(c, 4.5, -1.02 + age * .70, .045, .07, '#d2e0cb');
      }
    }
    if ((opts.damage || 0) > .45) {
      line(c, [2.8, -1.62, 2.64, -1.46, 2.76, -1.31, 2.61, -1.13], P.ink, .035);
      ellipse(c, 2.6, -.07, .4, .045, '#3d6464');
    }
    c.restore();
  }
  c.restore();
}

function fan(c, x, y, radius, angle) {
  ellipse(c, x, y, radius + .16, radius + .16, '#586d68', P.ink, .065);
  ellipse(c, x, y, radius + .09, radius + .09, '#24373b', '#b5c2ac', .05);
  ellipse(c, x, y, radius, radius, '#1c2b31', brass, .035);
  c.save(); c.translate(x, y); c.rotate(angle);
  for (let i = 0; i < 5; i++) {
    c.save(); c.rotate(i * TAU / 5);
    c.beginPath(); c.moveTo(-.035, -.04);
    c.bezierCurveTo(radius*.14,-radius*.58,radius*.64,-radius*.93,radius*.89,-radius*.34);
    c.bezierCurveTo(radius*.94,-radius*.07,radius*.49,radius*.14,.035,.065);
    c.closePath(); c.fillStyle = gradient(c,0,-radius,radius,radius,'#c5cbb2','#718e84'); c.fill(); c.strokeStyle = P.ink; c.lineWidth = .035; c.stroke();
    c.beginPath();c.moveTo(radius*.12,-radius*.11);c.quadraticCurveTo(radius*.43,-radius*.54,radius*.76,-radius*.46);
    c.strokeStyle='#d5d9bd';c.lineWidth=.026;c.stroke();
    c.restore();
  }
  ellipse(c, 0, 0, .19, .19, brass, P.ink, .035); c.restore();
  // Sparse guard ribs leave broad blade silhouettes visible at twenty pixels/metre.
  for(let j=0;j<8;j++) {
    const a=j*TAU/8;
    line(c,[x+Math.cos(a)*.27,y+Math.sin(a)*.27,x+Math.cos(a)*radius,y+Math.sin(a)*radius],'rgba(53,73,72,.45)',.028);
    ellipse(c,x+Math.cos(a)*(radius+.12),y+Math.sin(a)*(radius+.12),.035,.035,P.cream,P.ink,.015);
  }
  ellipse(c,x,y,radius*.68,radius*.68,'rgba(0,0,0,0)','rgba(177,192,170,.35)',.022);
}

// Shared room-space metre anchors, used by the gallery operator as well as art.
export function ventShaftLayout(w,h) {
  const scale=Math.min(1,(w-.24)/5.1,(h-.22)/3.2),floor=h-.08;
  const left=Math.max(.12,(w-5.1*scale)*.37);
  return {scale,left,floor,
    fan:{x:left+1.44*scale,y:floor-1.58*scale,radius:1.16*scale},
    crank:{x:left+4.34*scale,y:floor-1.05*scale,radius:.31*scale,handleOffset:.17*scale},
  };
}

function ventShaft(c, w, h, opts = {}) {
  c.save();
  const powered = opts.powered !== false;
  const t = powered ? (opts.t || 0) : 0;
  const {floor,scale:s,left}=ventShaftLayout(w,h);
  // One dominant wall extractor, 2.32 m blade diameter at normal room sizes.
  const cx=1.44,cy=-1.58,kx=4.34,ky=-1.05;
  c.translate(left,floor);c.scale(s,s);
  const ceiling=-floor/s;
  pipe(c,[cx,ceiling,cx,cy-.87],.94,'#839a90');
  for(let yy=ceiling+.36;yy<cy-.8;yy+=.62) {
    box(c,cx-.53,yy,1.06,.1,P.metalDark,.02);
    line(c,[cx-.44,yy+.025,cx+.44,yy+.025],P.metalLight,.028);
  }
  if(w>7) {
    const right=(w-left-.27)/s;
    pipe(c,[cx,-3.1,right,-3.1],.39,P.metal);
    for(let xx=cx+.65;xx<right;xx+=.74)line(c,[xx,-3.28,xx,-2.92],P.metalDark,.045);
    pipe(c,[right-.4,-3.1,right-.4,-1.93],.24,P.metal);
    gauge(c,right-.4,-1.68,.25,powered?.64:.06);
  }
  box(c,.1,cy-1.36,2.68,2.72,gradient(c,.1,cy-1.36,2.68,2.72,'#7d9185','#3c5858'),.18);
  bolts(c,.1,cy-1.36,2.68,2.72);
  fan(c,cx,cy,1.16,t*6);
  // Slotted wall bracket and a visible two-pulley transmission to the hand wheel.
  box(c,kx-.55,ky-.62,1.1,1.24,'#435956',.12,P.ink,.045);
  bolts(c,kx-.55,ky-.62,1.1,1.24);
  const angle=Math.atan2(ky-cy,kx-cx),tangent=Math.acos((.19-.4)/Math.hypot(kx-cx,ky-cy));
  for(const side of [-1,1]) {
    const a=angle+side*tangent,nx=Math.cos(a),ny=Math.sin(a);
    const ax=cx+nx*.19,ay=cy+ny*.19,bx=kx+nx*.4,by=ky+ny*.4;
    line(c,[ax,ay,bx,by],'#242d2b',.095);line(c,[ax,ay,bx,by],'#ae9366',.041);
    for(let j=0;j<3;j++) {
      const p=(((t*.4*side+j/3)%1)+1)%1,q=Math.min(1,p+.07);
      line(c,[ax+(bx-ax)*p,ay+(by-ay)*p,ax+(bx-ax)*q,ay+(by-ay)*q],'#d7c69b',.035);
    }
  }
  wheel(c,kx,ky,.4,t*3,brass);
  ellipse(c,cx,cy,.19,.19,brass,P.ink,.035);
  line(c,[cx,cy,cx+Math.cos(t*6)*.13,cy+Math.sin(t*6)*.13],P.woodDark,.045);
  const hx=kx+Math.cos(t*3)*.31,hy=ky+Math.sin(t*3)*.31;
  line(c,[hx,hy,hx+.18,hy],P.woodLight,.095);
  ellipse(c,hx+.17,hy,.052,.067,P.cream,P.ink,.022);
  gauge(c,3.03,-2.57,.22,powered?.6+Math.sin(t*1.3)*.02:.06);
  status(c,3.5,-2.55,powered);
  pipe(c,[3.03,-2.33,3.03,-1.97,2.67,-1.97],.075,copper);
  line(c,[.12,-.05,4.88,-.05],P.metalLight,.09);
  c.restore();
}

function bottle(c, x, y, color, size = 1) {
  c.save(); c.translate(x, y); c.scale(size, size);
  poly(c, [-.09, -.46, .09, -.46, .09, -.32, .19, -.24, .2, -.03, -.2, -.03, -.19, -.24, -.09, -.32], '#adba9d', P.ink, .022);
  box(c, -.16, -.22, .32, .16, color, .03, null);
  line(c, [-.13, -.29, -.13, -.1], P.ivory, .025);
  box(c, -.1, -.51, .2, .07, copperDark, .015); c.restore();
}

function lab(c, w, h, opts = {}) {
  c.save();
  const powered = opts.powered !== false;
  const t = powered ? (opts.t || 0) : 0;
  const floor = h - .08;
  const count = Math.max(1, Math.floor((w - .5) / 5));
  const span = (w - .5) / count;
  for (let n = 0; n < count; n++) {
    const x = .25 + span * n;
    // Pinned anatomical/geological sketch; marks are illustrative, never faux UI text.
    box(c, x + .12, floor - 2.82, 1.25, 1.18, '#d1c5a2', .025);
    ellipse(c, x + .22, floor - 2.72, .026, .026, copperDark);
    ellipse(c, x + 1.25, floor - 2.72, .026, .026, copperDark);
    for (let j = 0; j < 4; j++) {
      line(c, [x + .25, floor - 2.49 + j * .17, x + .52, floor - 2.55 + j * .18,
        x + .82, floor - 2.42 + j * .16, x + 1.22, floor - 2.5 + j * .18], ['#967858', '#7c8c73', '#bc9f70', '#8b8d7f'][j], .03);
    }
    box(c, x + 1.67, floor - 2.49, span - 2.02, .11, P.wood, .025);
    for (let j = 0; j < Math.max(2, Math.floor((span - 2) / .45)); j++) {
      bottle(c, x + 1.9 + j * .41, floor - 2.5, [P.teal, P.rust, '#b5a16c'][j % 3], .63);
    }
    bench(c, x, floor, span - .15, '#8b8163');
    const mx = x + .75;
    box(c, mx - .31, floor - 1.27, .64, .12, P.metalDark, .04);
    pipe(c, [mx + .22, floor - 1.26, mx + .3, floor - 1.64, mx + .07, floor - 1.92], .1, P.metal);
    line(c, [mx - .18, floor - 1.53, mx + .25, floor - 1.53], P.metalLight, .05);
    c.save(); c.translate(mx - .03, floor - 1.95); c.rotate(-.42);
    box(c, -.09, -.24, .18, .43, copper, .025);
    box(c, -.12, -.28, .24, .09, P.metalDark, .025); c.restore();
    ellipse(c, mx + .24, floor - 1.69, .09, .09, brass, P.ink, .02);
    bottle(c, x + 1.6, floor - 1.18, '#88a996', .86);
    bottle(c, x + 2.1, floor - 1.18, '#ac8769', .67);
    // Copper still with a spiral condenser and receiving flask.
    const sx = x + span - 1.42;
    box(c, sx - .42, floor - 1.28, .84, .12, P.metalDark, .025);
    ellipse(c, sx, floor - 1.64, .31, .39, '#bfa779', P.ink, .025);
    ellipse(c, sx - .09, floor - 1.69, .07, .2, 'rgba(246,235,198,.35)');
    box(c, sx - .09, floor - 2.14, .18, .24, brass, .025);
    pipe(c, [sx, floor - 2.12, sx, floor - 2.35, sx + .6, floor - 2.35, sx + .6, floor - 1.87], .055, copper);
    for (let j = 0; j < 3; j++) ellipse(c, sx + .6, floor - 1.97 + j * .09, .15, .055, copper, P.ink, .016);
    pipe(c, [sx + .6, floor - 1.71, sx + .6, floor - 1.55], .05, copper);
    bottle(c, sx + .6, floor - 1.18, '#8bafa2', .67);
    status(c, sx + .31, floor - 1.22, powered);
    if (powered) {
      const bob = Math.sin(t * 2) * .012;
      ellipse(c, sx, floor - 1.49 + bob, .18, .09, 'rgba(143,158,98,.45)');
      vapor(c, sx + .05, floor - 2.25, t, 2);
    }
    box(c, x + 2.44, floor - 1.25, .53, .06, P.cream, .015);
    box(c, x + 2.47, floor - 1.32, .5, .06, P.rust, .015);
    line(c, [x + 2.55, floor - 1.35, x + 2.85, floor - 1.44], P.woodLight, .025);
  }
  c.restore();
}

export const INDUSTRIAL = Object.freeze({ diesel, workshop, well, filterPlant, ventShaft, lab });
