import { hash } from './palette.js';
import { line, ellipse, box, poly, gradient, halo } from './primitives.js';

export const DILEMMA_IDS = Object.freeze([
  'strangerAtHatch', 'rationTheft', 'elderSky', 'childQuota', 'gasPocket', 'radioPlea', 'sickness', 'generic',
  'generatorShift', 'seedStock', 'eveningCurfew',
  'labDryBoots', 'labLastPencil', 'labCrackedCup', 'labFalseDawn', 'labSoupName', 'labNightKnock',
  'labBorrowedShift', 'labSavedSeeds', 'labQuietBench', 'labCleanSheet', 'labMeasureWall', 'labWeddingWire',
  'labRadioRecipe', 'labMissingSpanner', 'labGreyLaundry', 'labCalendarDispute', 'labWarmPipe',
  'labUnsentLetter', 'labBadBatch', 'labWornMask', 'labQuietPatient', 'labReturnToken',
  'labSharedSilence', 'labRadioWrongName',
]);

// Small narrative paintings. Coordinates below belong to a 320 × 180 illustration,
// never to simulation space. No decisions or consequences are inferred here.
const stroke = (c, p, color = '#9c8262', width = 1) => line(c, p, color, width);
const oval = (c, x, y, rx, ry, fill, outline = null, width = 1) => ellipse(c, x, y, rx, ry, fill, outline, width);
const panel = (c, x, y, w, h, fill, radius = 1, outline = null, width = 1) => box(c, x, y, w, h, fill, radius, outline, width);
const shape = (c, p, fill, outline = null, width = 1) => poly(c, p, fill, outline, width);

function backdrop(c, seed, cool = false) {
  c.fillStyle = gradient(c, 0, 0, 320, 180, cool ? '#253337' : '#332e29', '#171c1d');
  c.fillRect(0, 0, 320, 180);
  for (let i = 0; i < 26; i++) {
    const x = hash(seed, i * 4) * 350 - 15, y = hash(seed, i * 4 + 1) * 136;
    const w = 17 + hash(seed, i * 4 + 2) * 65;
    stroke(c, [x, y, x + w * .45, y - 2, x + w, y + 1], i % 4 ? '#403b32' : '#544939', .6);
  }
  panel(c, 0, 139, 320, 41, gradient(c, 0, 139, 0, 41, '#3e3b31', '#202322'));
  stroke(c, [0, 140, 320, 140], '#75634b', 1);
  for (let i = 0; i < 8; i++) stroke(c, [hash(seed, i) * 320, 149 + i * 4, hash(seed, i) * 320 + 42, 147 + i * 4], '#51483a', .7);
}

function lamp(c, x, y, t, hanging = true, scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  if (hanging) stroke(c, [0, -65, 0, -12], '#252827', 2);
  halo(c, 0, 5, 95, .21 + Math.sin(t * 1.7) * .015);
  shape(c, [-11, -5, -6, -13, 6, -13, 11, -5], '#58574a', '#a39065', .7);
  panel(c, -7, -4, 14, 20, '#d4b272', 3, '#58513c', 1.5);
  panel(c, -3, 0, 6, 12, '#f4dc9d', 2);
  stroke(c, [-7, 14, 7, 14], '#62583d', 2);
  stroke(c, [-4, -5, -4, 16, 4, 16, 4, -5], '#77633e', 1);
  c.restore();
}

function dust(c, seed, t, x, y, w, h) {
  for (let i = 0; i < 18; i++) {
    const px = x + hash(seed, i * 2) * w + Math.sin(t * .3 + i) * 1.5;
    const py = y + ((hash(seed, i * 2 + 1) * h + t * 1.3) % h + h) % h;
    oval(c, px, py, .45 + hash(seed, i + 50) * .35, .6, '#baa07744');
  }
}

function figure(c, x, floor, height, { coat = '#4b514a', scarf = '#b29469', facing = 1, elder = false, seated = false, hood = false, arm = null } = {}) {
  c.save(); c.translate(x, floor); c.scale(height / 90 * facing, height / 90);
  oval(c, 0, 0, 19, 3.2, '#11191a88');
  const legs = seated ? [-13, -30, 5, -29, 19, -20, 20, -2, 11, -2, 8, -18, -8, -19] : [-11, -32, 11, -32, 10, -2, 2, -2, -1, -23, -4, -2, -12, -2];
  shape(c, legs, '#323a38', '#1d2727', 1);
  shape(c, [-13, -4, -4, -4, -2, 0, -15, 0], '#1a2526');
  shape(c, [3, -4, 11, -4, 16, 0, 3, 0], '#192325');
  const lean = elder ? 5 : 0;
  shape(c, [-8 + lean, -68, 5 + lean, -69, 13, -61, 17, -33, 12, -25, -15, -26, -17, -47, -13, -61], coat, '#242c2b', 1);
  stroke(c, [-8, -58, -10, -35, 2, -30], '#87917a55', 1.4);
  stroke(c, [3, -57, 5, -30], '#1e2a2999', 1);
  oval(c, lean + 1, -76, 10, 12, hood ? '#776f5c' : '#a58b6b');
  shape(c, [-8 + lean, -79, -5 + lean, -88, 4 + lean, -89, 11 + lean, -83, 11 + lean, -78, 4 + lean, -83, -6 + lean, -80], elder ? '#a4a69a' : '#3d3e35');
  if (elder) oval(c, -8 + lean, -82, 4, 5, '#acaca0');
  shape(c, [8 + lean, -80, 13 + lean, -75, 9 + lean, -74, 7 + lean, -67, 0 + lean, -66, -3 + lean, -72], '#aa9070');
  stroke(c, [7 + lean, -79, 10 + lean, -78], '#3b423b', .8);
  shape(c, [-10 + lean, -66, 8 + lean, -68, 13 + lean, -62, -3 + lean, -59, -11 + lean, -62], scarf);
  if (hood) {
    shape(c, [-12, -73, -10, -85, -3, -93, 6, -90, 12, -82, 8, -79, 3, -84, -4, -83, -7, -72], coat);
    stroke(c, [-10, -84, -3, -90, 5, -87], '#a99a7b', .9);
  }
  const hand = arm || [13, -36];
  stroke(c, [9, -58, 14, -47, hand[0], hand[1]], coat, 8);
  oval(c, hand[0], hand[1] + 2, 3.3, 4.3, '#b39b78');
  if (elder) stroke(c, [hand[0] + 2, hand[1] + 2, hand[0] + 5, -2], '#9f8462', 2.5);
  c.restore();
}

function stranger(c, t) {
  c.fillStyle = gradient(c, 0, 0, 100, 180, '#49463d', '#20292b'); c.fillRect(0, 0, 320, 180);
  for (let i = 0; i < 8; i++) {
    const x = i * 48 - 14, top = 42 + hash(41, i) * 24;
    shape(c, [x, 107, x, top, x + 12, top, x + 16, top - 9, x + 30, top - 7, x + 35, top + 14, x + 38, 108], '#363b36');
    panel(c, x + 8, top + 14, 5, 12, '#55564a');
  }
  shape(c, [0, 112, 53, 104, 101, 115, 175, 106, 242, 115, 320, 110, 320, 180, 0, 180], '#48473a');
  for (let i = 0; i < 29; i++) {
    const x = hash(19, i) * 320, y = 117 + hash(23, i) * 57;
    stroke(c, [x, y, x + 4 + hash(29, i) * 8, y - 1], '#7c725444', .8);
  }
  // Warmth beyond the threshold; the hatch is still shut, no choice is illustrated.
  shape(c, [199, 131, 239, 120, 290, 132, 250, 147], '#1c2b2c', '#88816a', 2);
  shape(c, [204, 129, 238, 121, 284, 132, 250, 141], '#53605a', '#a39471', 1);
  stroke(c, [224, 129, 235, 126, 248, 130], '#adab87', 2);
  stroke(c, [205, 135, 250, 147, 286, 137], '#d1a360', 1.2);
  halo(c, 246, 142, 64, .13);
  figure(c, 139, 145, 96, { coat: '#6f7363', scarf: '#bb9d78', hood: true, arm: [19, -24] });
  figure(c, 171, 150, 57, { coat: '#938b6c', scarf: '#b98565', hood: true, arm: [-12, -40] });
  stroke(c, [158, 121, 166, 125], '#b49c7a', 3);
  panel(c, 108, 121, 22, 20, '#655945', 4, '#908265', 1);
  stroke(c, [114, 122, 116, 116, 122, 116, 124, 122], '#b29b75', 1.5);
  for (let i = 0; i < 15; i++) {
    const x = (hash(39, i) * 350 + t * 3) % 350 - 15, y = hash(44, i) * 120;
    stroke(c, [x, y, x + 5, y + 1], '#c1b79b25', .6);
  }
}

function ration(c, t) {
  backdrop(c, 11); lamp(c, 240, 29, t);
  for (const x of [30, 242]) {
    panel(c, x, 57, 53, 80, '#242b26', 0);
    for (let row = 0; row < 3; row++) {
      const y = 72 + row * 25;
      for (let j = 0; j < 3; j++) {
        panel(c, x + 6 + j * 15, y - 13, 10, 13, ['#66745c', '#93835e', '#765f47'][j], 2, '#272d29', .7);
        stroke(c, [x + 7 + j * 15, y - 13, x + 15 + j * 15, y - 13], '#a7a18a', 2);
      }
      panel(c, x - 4, y, 61, 4, '#746345');
    }
  }
  // The open black mouth and broken hasp remain the focal point at card size.
  shape(c, [109, 101, 169, 85, 213, 101, 151, 120], '#35291e', '#a58b5b', 2);
  shape(c, [109, 101, 151, 116, 151, 155, 108, 139], '#795634', '#a3814d', 1.5);
  shape(c, [151, 116, 213, 101, 212, 138, 151, 155], '#937045', '#b2935a', 1.5);
  for (let y = 114; y < 143; y += 10) {
    stroke(c, [111, y, 149, y + 14], '#493b2b', 1);
    stroke(c, [153, y + 13, 210, y - 1], '#5a472f', 1);
  }
  shape(c, [111, 98, 125, 58, 186, 47, 171, 84], '#82613c', '#b69964', 2);
  stroke(c, [125, 67, 181, 56], '#443c2b', 1.5); stroke(c, [120, 83, 174, 72], '#b69b68', 1);
  shape(c, [166, 110, 171, 109, 174, 120, 170, 124, 166, 118], '#414a44', '#aaa181', 1);
  shape(c, [181, 147, 187, 140, 191, 141, 189, 149], '#9b8b67');
  stroke(c, [199, 153, 235, 134, 241, 135], '#374544', 4); stroke(c, [199, 152, 234, 133], '#a5ad91', .9);
  shape(c, [119, 146, 111, 161, 115, 160, 123, 146], '#c0a16c');
  oval(c, 91, 150, 8, 4, '#6e7659', '#b1ac87', 1); stroke(c, [86, 147, 86, 143, 97, 142, 98, 149], '#adb094', 1);
  dust(c, 11, t, 170, 35, 120, 100);
}

function elder(c, t) {
  backdrop(c, 31, true);
  panel(c, 194, 0, 57, 141, gradient(c, 0, 0, 0, 141, '#64716b', '#222d2b'));
  shape(c, [199, 0, 243, 0, 274, 139, 155, 139], '#d3d9ad10');
  stroke(c, [205, 0, 205, 140], '#9a9475', 4); stroke(c, [237, 0, 237, 140], '#9a9475', 4);
  for (let y = 9; y < 137; y += 15) stroke(c, [205, y, 237, y], '#737e6b', 3);
  stroke(c, [205, 0, 205, 140], '#c5b68b', .8);
  panel(c, 192, 0, 60, 6, '#bcc6ad');
  figure(c, 149, 153, 87, { elder: true, coat: '#636c62', scarf: '#b59d7d', arm: [22, -40] });
  // A profile turned upward, not an already departing figure.
  oval(c, 155, 78, 8, 9, '#c1ad89');
  shape(c, [146, 73, 148, 65, 156, 65, 163, 71, 160, 74, 155, 70, 148, 76], '#b4b7a8');
  shape(c, [160, 72, 165, 70, 164, 77, 158, 83], '#c8b18e');
  stroke(c, [160, 73, 162, 72], '#46514b', .8);
  lamp(c, 61, 87, t, false, .65);
  panel(c, 38, 99, 47, 5, '#776545'); stroke(c, [44, 104, 44, 142, 80, 142, 80, 104], '#5a5240', 4);
  dust(c, 31, t, 186, 9, 65, 128);
}

function childQuota(c, t) {
  backdrop(c, 73); lamp(c, 202, 29, t);
  panel(c, 28, 54, 51, 51, '#2a3834', 1, '#716849', 2);
  shape(c, [36, 95, 47, 79, 57, 88, 66, 72, 73, 96], '#697457');
  panel(c, 49, 66, 9, 10, '#b09d6e');
  panel(c, 59, 115, 89, 6, '#766549');
  stroke(c, [65, 121, 64, 146, 144, 146, 141, 121], '#4d4d3c', 5);
  figure(c, 78, 143, 88, { coat: '#737462', scarf: '#a48b6f', seated: true, arm: [23, -35] });
  figure(c, 133, 144, 85, { coat: '#876f58', scarf: '#c5ab7b', seated: true, facing: -1, arm: [25, -35] });
  stroke(c, [99, 111, 108, 111], '#c5ad85', 3);
  // Empty mattress, no infant silhouette: the absence is the image's subject.
  shape(c, [173, 119, 221, 112, 280, 124, 231, 136], '#312b23', '#b5955e', 2);
  shape(c, [183, 121, 220, 117, 267, 126, 230, 132], '#c1b58a');
  oval(c, 201, 121, 10, 3, '#e2d1a3');
  shape(c, [174, 121, 231, 135, 278, 125, 274, 149, 231, 161, 180, 147], '#846641', '#b18e56', 1.5);
  for (let i = 0; i < 6; i++) {
    const x = 185 + i * 8; stroke(c, [x, 125 + i * 2, x + 1, 148 + i * 2], '#d0aa70', 2);
    const rx = 237 + i * 6; stroke(c, [rx, 133 - i * 1.3, rx - 1, 158 - i * 1.5], '#c2a16c', 2);
  }
  stroke(c, [176, 122, 231, 135, 279, 125], '#d8b77e', 3);
  stroke(c, [188, 151, 187, 166, 201, 171, 250, 172, 270, 162], '#ac8a55', 3);
  dust(c, 73, t, 178, 30, 100, 80);
}

function gas(c, t) {
  backdrop(c, 94, true);
  shape(c, [199, 0, 320, 0, 320, 180, 257, 180, 241, 145, 216, 131, 228, 95, 202, 68, 213, 37], '#3d4034');
  for (let i = 0; i < 14; i++) {
    const x = 232 + hash(17, i) * 65, y = hash(18, i) * 168;
    stroke(c, [x, y, x + 17, y - 4, x + 35, y + 2], '#6c685044', 1);
  }
  stroke(c, [259, 28, 246, 53, 253, 74, 237, 98, 244, 110, 230, 135], '#151f1d', 5);
  stroke(c, [260, 28, 249, 53, 256, 74, 240, 98, 247, 110, 234, 135], '#9a8d61', 1.4);
  stroke(c, [251, 73, 273, 82, 279, 96], '#16241f', 2);
  figure(c, 111, 154, 92, { coat: '#786b49', scarf: '#b1a478', arm: [23, -50] });
  panel(c, 99, 64, 27, 6, '#b69c5b', 3); oval(c, 112, 63, 11, 6, '#8a8054');
  panel(c, 122, 63, 5, 5, '#e6d6a1', 1);
  shape(c, [128, 64, 240, 43, 235, 114, 128, 69], '#c6cbab16');
  halo(c, 225, 88, 54, .12);
  stroke(c, [96, 146, 82, 104, 78, 91], '#a58e61', 3);
  stroke(c, [63, 90, 78, 86, 96, 91], '#9aa591', 3);
  for (let i = 0; i < 5; i++) {
    const drift = Math.sin(t * .8 + i) * 3;
    c.beginPath(); c.moveTo(240, 79 + i * 5);
    c.bezierCurveTo(225, 73 + i * 6, 215 + drift, 93 + i * 3, 191 + drift, 86 + i * 7);
    c.strokeStyle = `rgba(173,192,166,${.08 + i * .022})`; c.lineWidth = 2 + i; c.stroke();
  }
  dust(c, 94, t, 174, 40, 63, 90);
}

function radio(c, t) {
  backdrop(c, 115, true); lamp(c, 266, 27, t);
  stroke(c, [35, 138, 35, 158, 292, 158, 292, 138], '#554c37', 5);
  panel(c, 25, 128, 276, 10, '#806644', 2, '#b1915d', 1);
  panel(c, 67, 46, 188, 84, '#765a36', 5, '#bd9960', 1.5);
  panel(c, 74, 53, 174, 67, '#3c463b', 3, '#262c25', 1);
  panel(c, 86, 62, 57, 44, '#202c29', 3, '#9c8c62', 1);
  for (let x = 90; x < 143; x += 5) stroke(c, [x, 66, x, 102], '#68725a', 1);
  panel(c, 156, 62, 77, 23, '#d8be7a', 2, '#292f26', 2);
  for (let x = 160; x < 233; x += 5) stroke(c, [x, 68, x, x % 2 ? 75 : 79], '#6d6745', .7);
  const needle = 190 + Math.sin(t * .9) * 4;
  stroke(c, [needle, 66, needle - 2, 81], '#985b40', 1.2);
  oval(c, 166, 102, 9, 9, '#283a34', '#989e77', 1.5); stroke(c, [166, 96, 169, 99], '#d0c18b', 1.2);
  oval(c, 220, 102, 11, 11, '#27382e', '#a0a27a', 1.5); stroke(c, [220, 94, 223, 97], '#d0c18b', 1.2);
  halo(c, 195, 102, 19, .1 + .05 * Math.sin(t * 2.3));
  oval(c, 195, 102, 3, 3, '#e3b96b');
  stroke(c, [96, 45, 89, 18, 79, 7], '#8b9a82', 2);
  stroke(c, [190, 45, 191, 38, 199, 35, 207, 38, 207, 45], '#343c30', 4);
  // Waiting headphones, abandoned pencil and notebook keep the caller off-screen.
  c.beginPath(); c.ellipse(41, 109, 16, 22, .45, Math.PI, Math.PI * 2); c.strokeStyle = '#a39a75'; c.lineWidth = 4; c.stroke();
  panel(c, 21, 109, 10, 18, '#283834', 4, '#7a8c79', 1);
  panel(c, 50, 96, 10, 18, '#283834', 4, '#7a8c79', 1);
  c.beginPath(); c.moveTo(26, 125); c.bezierCurveTo(20, 151, 98, 148, 83, 128); c.strokeStyle = '#25302a'; c.lineWidth = 2; c.stroke();
  shape(c, [218, 139, 264, 132, 286, 144, 241, 152], '#c9b987', '#66573d', .8);
  stroke(c, [229, 140, 260, 136], '#8f855f', 1); stroke(c, [237, 144, 270, 140], '#8f855f', 1);
  stroke(c, [251, 150, 279, 129], '#ba8854', 2);
  dust(c, 115, t, 230, 30, 77, 90);
}

function sickness(c, t) {
  backdrop(c, 121, true);
  panel(c, 21, 26, 45, 58, '#52635b', 2, '#9d9f81', 1);
  panel(c, 40, 38, 8, 31, '#c4c2a0'); panel(c, 29, 49, 30, 8, '#c4c2a0');
  panel(c, 244, 54, 50, 79, '#34423d', 1, '#6b7b66', 1);
  for (let i = 0; i < 3; i++) { panel(c, 252, 68 + i * 20, 11, 10, '#74917b', 2); panel(c, 273, 65 + i * 20, 9, 13, '#9b9b79', 2); stroke(c, [246, 80 + i * 20, 291, 80 + i * 20], '#71816b', 2); }
  figure(c, 220, 145, 89, { facing: -1, coat: '#76867a', scarf: '#b6b697', arm: [26, -37] });
  stroke(c, [53, 112, 53, 158, 198, 158, 198, 116], '#8f9c85', 3);
  panel(c, 52, 123, 146, 15, '#767f6b', 3, '#a0ad94', 1);
  panel(c, 57, 119, 132, 12, '#aaa98a', 5);
  oval(c, 76, 113, 17, 8, '#d3c7a0'); oval(c, 80, 109, 12, 8, '#b8a180');
  shape(c, [70, 105, 77, 101, 88, 104, 88, 108, 77, 105, 72, 110], '#65675a');
  stroke(c, [82, 110, 88, 111], '#64604c', 1);
  shape(c, [92, 109, 115, 107, 152, 111, 184, 121, 189, 143, 93, 140], '#738b7e', '#abb69b', .8);
  stroke(c, [101, 113, 117, 117, 138, 116, 155, 123], '#b1b99b', 1.2);
  stroke(c, [119, 126, 148, 128, 173, 136], '#526c63', 1);
  lamp(c, 129, 29, t, true, .65);
  stroke(c, [34, 89, 34, 142, 24, 151, 43, 151], '#819784', 2);
  panel(c, 31, 72, 12, 20, '#889e8a', 3, '#c6cfac', 1);
  stroke(c, [37, 91, 37, 99, 58, 113], '#a2ad8e', 1);
  dust(c, 121, t, 82, 39, 104, 63);
}

function generic(c, t) {
  backdrop(c, 151);
  panel(c, 73, 108, 181, 11, '#82633d', 2, '#b18f56', 1);
  stroke(c, [87, 119, 83, 163, 93, 163, 98, 119], '#645439', 4);
  stroke(c, [232, 119, 238, 162, 247, 162, 243, 119], '#5b5038', 4);
  lamp(c, 161, 89, t, false, 1);
  stroke(c, [154, 77, 154, 68, 168, 68, 168, 77], '#9a8860', 2);
  shape(c, [190, 105, 220, 101, 234, 108, 203, 114], '#c0b080', '#695b3d', 1);
  stroke(c, [199, 106, 219, 104], '#89815b', .8); stroke(c, [204, 109, 224, 107], '#89815b', .8);
  panel(c, 113, 94, 14, 13, '#77907b', 3, '#a9b293', 1);
  c.beginPath(); c.arc(128, 100, 4, -Math.PI / 2, Math.PI / 2); c.strokeStyle = '#a9b293'; c.lineWidth = 2; c.stroke();
  stroke(c, [43, 103, 42, 164, 51, 164, 53, 109, 68, 109, 70, 161], '#7c6b48', 5);
  panel(c, 40, 89, 30, 15, '#6f5a3c', 2, '#a48756', 1);
  panel(c, 42, 130, 35, 5, '#9d7c49', 1);
  dust(c, 151, t, 92, 30, 137, 85);
}

// Laboratory stories use the same rubbed timber, desaturated cloth and lamp light.
// Props are shared; the staging and focal object belong to each individual story.
function table(c, x = 54, y = 124, w = 214) {
  panel(c, x, y, w, 9, '#806645', 2, '#b39868', 1);
  stroke(c, [x + 12, y + 9, x + 9, 168, x + 18, 168, x + 22, y + 9], '#534b3a', 4);
  stroke(c, [x + w - 22, y + 9, x + w - 15, 166], '#5c513d', 5);
  stroke(c, [x + 3, y + 3, x + w - 4, y + 3], '#c0a37766', .8);
}

function paper(c, x, y, w, h, marks = true) {
  shape(c, [x, y, x + w - 4, y - 3, x + w, y + h - 2, x + 3, y + h], '#c3b18a', '#665a42', .8);
  if (marks) for (let row = 0; row < Math.floor((h - 12) / 6); row++) {
    stroke(c, [x + 7, y + 7 + row * 6, x + w - 9 - (row % 3) * 3, y + 5 + row * 6], '#7b775c', .8);
  }
}

function bowl(c, x, y, s = 1, filled = true) {
  c.save(); c.translate(x, y); c.scale(s, s);
  shape(c, [-20, 0, -13, 15, 12, 15, 20, 0], '#6c8071', '#b0b596', 1);
  oval(c, 0, 0, 20, 6, filled ? '#837349' : '#36483e', '#b8ba96', 1);
  if (filled) for (let i = 0; i < 5; i++) oval(c, -13 + i * 6, Math.sin(i) * 2, 2.5, 1.1, '#b5a374');
  c.restore();
}

function steam(c, x, y, t, width = 16) {
  for (let i = 0; i < 3; i++) {
    const drift = Math.sin(t * .65 + i) * 2;
    c.beginPath(); c.moveTo(x + (i - 1) * width / 2, y);
    c.bezierCurveTo(x - 8 + i * width / 2 + drift, y - 11, x + 5 + i * width / 2, y - 14, x + (i - 1) * width / 2 + drift, y - 25);
    c.strokeStyle = '#d6d0ac32'; c.lineWidth = 1.2; c.stroke();
  }
}

function clockFace(c, x, y, r = 16) {
  oval(c, x, y, r + 3, r + 3, '#4a5147', '#9c9776', 1.2);
  oval(c, x, y, r, r, '#b9b391', '#393f34', 1);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    stroke(c, [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3), x + Math.sin(a) * (r - 1), y - Math.cos(a) * (r - 1)], '#62634e', .8);
  }
  stroke(c, [x - 6, y - 4, x, y, x + 2, y - r + 4], '#4f5140', 1.5);
}

function cot(c, x, y, w, blanket = '#788778') {
  stroke(c, [x, y - 20, x, y + 20, x + 4, y + 20, x + 4, y + 3], '#768676', 2);
  stroke(c, [x + w, y - 9, x + w, y + 19], '#788b7c', 2.5);
  panel(c, x + 1, y - 7, w - 1, 12, '#9c9e83', 3, '#b8b594', .8);
  oval(c, x + 18, y - 9, 14, 5, '#c7bc96');
  shape(c, [x + 35, y - 11, x + w - 4, y - 6, x + w - 2, y + 15, x + 37, y + 13], blanket, '#9da78e', .8);
  for (let i = 0; i < 3; i++) stroke(c, [x + 43 + i * 15, y - 8, x + 46 + i * 15, y + 10], '#b5b49855', 1);
}

function radioProp(c, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s);
  panel(c, 0, 0, 100, 64, '#705536', 4, '#b29565', 1.2);
  panel(c, 6, 6, 88, 51, '#3b493e', 2, '#242c27', 1);
  for (let i = 0; i < 6; i++) stroke(c, [12 + i * 5, 15, 12 + i * 5, 47], '#78846c', 1);
  panel(c, 49, 12, 39, 16, '#c4b376', 1, '#222d27', 1);
  for (let i = 0; i < 7; i++) stroke(c, [53 + i * 5, 15, 53 + i * 5, 20 + i % 2 * 3], '#626245', .7);
  stroke(c, [67 + Math.sin(t * .7) * 2, 14, 66 + Math.sin(t * .7) * 2, 25], '#9d6446', 1);
  for (const px of [57, 81]) oval(c, px, 43, 7, 7, '#293a31', '#a4a780', 1);
  stroke(c, [14, 0, 7, -29], '#9ca68b', 1.6);
  stroke(c, [34, 0, 35, -7, 62, -7, 63, 0], '#5f6754', 3);
  c.restore();
}

function wrench(c, x, y, scale = 1, angle = 0) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale, scale);
  shape(c, [-4, 6, -7, 0, -6, -8, -2, -13, -1, -4, 5, -3, 9, -11, 10, -3, 7, 4, 3, 7, 2, 36, -3, 36], '#98a48e', '#46594f', 1);
  stroke(c, [-1, 9, -1, 32], '#d0cab0', .8); oval(c, -.5, 32, 1.2, 1.3, '#354c42');
  c.restore();
}

function engine(c, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s);
  panel(c, 0, 47, 132, 10, '#333e36', 2, '#8a8e6f', 1);
  panel(c, 12, 5, 104, 45, '#626d58', 5, '#a4a17a', 1);
  for (let i = 0; i < 8; i++) stroke(c, [22 + i * 7, 16, 22 + i * 7, 39], '#303e34', 2);
  oval(c, 104, 28, 23, 23, '#37493d', '#9b9f7a', 2);
  oval(c, 104, 28, 17, 17, '#63715a', '#24372d', 1);
  // Only the indicator breathes: no implied failure or repaired machine.
  oval(c, 14, 14, 2.5, 2.5, '#d1b06c'); halo(c, 14, 14, 10, .07 + Math.sin(t) * .01);
  stroke(c, [27, 5, 27, -15, 3, -15, 3, -39], '#5f7567', 8);
  stroke(c, [24, 3, 24, -12, 0, -12, 0, -39], '#9b9f7e', 1);
  stroke(c, [8, 57, 8, 65, 122, 65, 122, 57], '#242e2a', 4);
  c.restore();
}

function dryBoots(c, t) {
  backdrop(c, 201, true); lamp(c, 179, 30, t);
  for (const [x, h] of [[35, 76], [277, 83], [249, 68]]) figure(c, x, 147, h, { coat: '#414e46', facing: x > 200 ? -1 : 1 });
  oval(c, 117, 154, 57, 5, '#60766c55'); stroke(c, [81, 154, 131, 156, 153, 152], '#91a49844', 1);
  panel(c, 91, 135, 135, 11, '#796244', 2, '#b39b6b', 1.2);
  for (const [x, y] of [[110, 66], [164, 71]]) {
    shape(c, [x, y, x + 30, y - 2, x + 28, y + 48, x + 45, y + 55, x + 43, y + 65, x - 2, y + 65, x - 3, y + 52], '#8b7551', '#c1a77b', 1.2);
    oval(c, x + 15, y, 15, 4, '#2e392f', '#a69068', 1);
    stroke(c, [x + 3, y + 7, x + 4, y + 46, x + 9, y + 51], '#b7a075', 1.3);
    stroke(c, [x - 2, y + 61, x + 42, y + 61], '#2d3830', 4);
    for (let i = 0; i < 5; i++) stroke(c, [x + 14, y + 12 + i * 6, x + 24, y + 15 + i * 6], '#4c4935', 1.3);
  }
  dust(c, 201, t, 98, 31, 130, 93);
}

function lastPencil(c, t) {
  backdrop(c, 205); lamp(c, 251, 39, t, false, .7); table(c, 35, 137, 252);
  paper(c, 53, 65, 87, 68); paper(c, 178, 72, 79, 59, false);
  // A little portrait anchors oral histories; dimension arrows anchor workshop use.
  oval(c, 78, 84, 8, 9, '#8c795b'); stroke(c, [66, 104, 67, 96, 77, 92, 88, 99], '#8c795b', 3);
  shape(c, [192, 88, 231, 84, 241, 107, 201, 112], '#ac9f79', '#68674d', 1);
  stroke(c, [190, 120, 242, 115, 238, 112, 242, 115, 238, 119], '#5c6654', 1);
  panel(c, 124, 141, 109, 7, '#b5a176', 0, '#675b40', 1);
  for (let i = 0; i < 19; i++) stroke(c, [129 + i * 5, 142, 129 + i * 5, 144 + i % 3], '#605b40', .7);
  c.save(); c.translate(162, 106); c.rotate(.36);
  shape(c, [-3, -48, 3, -48, 3, 37, 0, 47, -3, 37], '#b08a4b', '#d1b277', 1);
  shape(c, [-3, 37, 3, 37, 0, 47], '#d3bb8b'); shape(c, [-1.3, 43, 1.3, 43, 0, 47], '#344039');
  stroke(c, [-1, -43, -1, 35], '#d7ba7d', .8); c.restore();
  dust(c, 205, t, 75, 20, 176, 100);
}

function crackedCup(c, t) {
  backdrop(c, 209); table(c, 44, 139, 229); lamp(c, 69, 65, t, false, .75);
  panel(c, 104, 139, 110, 4, '#83998a22'); oval(c, 163, 139, 38, 4, '#95ada06b');
  c.beginPath(); c.ellipse(212, 94, 18, 22, 0, -1.9, 1.9); c.strokeStyle = '#b1b99d'; c.lineWidth = 8; c.stroke();
  c.beginPath(); c.ellipse(212, 94, 18, 22, 0, -1.9, 1.9); c.strokeStyle = '#657e72'; c.lineWidth = 4; c.stroke();
  shape(c, [126, 66, 206, 66, 200, 127, 186, 136, 144, 135, 132, 127], '#9ba68c', '#c0c6a2', 1.2);
  oval(c, 166, 66, 40, 10, '#3a5146', '#d0cbab', 2);
  oval(c, 166, 69, 32, 6, '#7d9180'); stroke(c, [137, 78, 139, 116], '#d6cfa85c', 3);
  shape(c, [151, 99, 160, 88, 170, 96, 179, 91, 187, 106, 150, 108], '#69836b');
  stroke(c, [182, 73, 176, 88, 182, 100, 174, 113, 179, 130], '#38483e', 1.3);
  const dropY = 130 + (t * 2.8 % 8 + 8) % 8;
  oval(c, 179, dropY, 1.2, 2, '#a5bca6');
  panel(c, 236, 121, 17, 8, '#788577', 1); panel(c, 245, 132, 13, 5, '#98a38c', 1);
  dust(c, 209, t, 95, 13, 143, 80);
}

function falseDawn(c, t) {
  backdrop(c, 213, true); cot(c, 22, 123, 116, '#566d62'); cot(c, 177, 123, 119, '#5a6f65');
  panel(c, 115, 17, 91, 44, '#45564b', 1, '#7f927b', 1);
  // A drawing pinned above the bunks, not an already completed invention.
  paper(c, 125, 23, 71, 31, false);
  oval(c, 138, 36, 7, 7, '#00000000', '#70735a', 1);
  stroke(c, [138, 31, 138, 36, 142, 38, 147, 38, 151, 36], '#70735a', .8);
  stroke(c, [165, 24, 165, 29], '#70735a', 1);
  shape(c, [154, 37, 158, 29, 171, 29, 176, 37], '#aaa075', '#70735a', .9);
  oval(c, 165, 41, 3, 5, '#d7bd80', '#807951', .6);
  for (const p of [[154, 41, 150, 45], [177, 41, 181, 45], [165, 48, 165, 51]]) stroke(c, p, '#938452', .9);
  clockFace(c, 270, 37, 13);
  figure(c, 159, 159, 86, { coat: '#7d816b', arm: [20, -55] });
  paper(c, 174, 95, 27, 24, false); stroke(c, [179, 111, 183, 104, 192, 107], '#63705b', 1);
  lamp(c, 73, 39, t, true, .65); dust(c, 213, t, 80, 44, 170, 82);
}

function soupName(c, t) {
  backdrop(c, 217); lamp(c, 161, 29, t);
  figure(c, 51, 150, 96, { coat: '#79806a', arm: [28, -46] });
  figure(c, 269, 151, 92, { coat: '#756d57', facing: -1, arm: [27, -49] });
  table(c, 78, 135, 164);
  shape(c, [119, 90, 198, 90, 195, 123, 186, 132, 130, 132, 121, 121], '#63786b', '#a2af93', 1.5);
  oval(c, 158, 90, 40, 10, '#806d43', '#c0bd92', 2);
  for (let i = 0; i < 6; i++) {
    const x = 133 + i * 10, y = 89 + Math.sin(i * 3) * 4;
    oval(c, x, y, 4, 2, '#b0a078'); stroke(c, [x - 3, y - 3, x - 1, y + 3, x + 3, y - 3], '#514f32', .6);
  }
  stroke(c, [119, 101, 110, 101, 109, 114, 121, 114], '#98a48b', 3);
  stroke(c, [198, 101, 207, 101, 208, 113, 196, 113], '#98a48b', 3);
  stroke(c, [181, 88, 203, 60], '#b29b6e', 3); bowl(c, 101, 139, .65, false); bowl(c, 217, 140, .65, false);
  paper(c, 139, 145, 48, 13, false); stroke(c, [146, 151, 177, 149], '#837651', 1);
  steam(c, 158, 78, t, 21); dust(c, 217, t, 97, 14, 127, 71);
}

function nightKnock(c, t) {
  backdrop(c, 221, true);
  panel(c, 198, 16, 91, 126, '#1c2c29', 4, '#727c67', 5);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++) {
    const x = 202 + col * 28 + row % 2 * 4;
    panel(c, x, 24 + row * 19, Math.min(25, 285 - x), 16, '#545e50', 1, '#7c8268', .6);
  }
  stroke(c, [185, 5, 185, 68, 163, 68, 163, 163], '#3e574c', 13);
  stroke(c, [180, 5, 180, 64, 158, 64, 158, 163], '#849680', 1.6);
  for (const y of [35, 104]) { panel(c, y === 35 ? 176 : 154, y, 18, 8, '#8b9176', 1, '#303f35', 1); }
  // Two quiet vibration marks at the loose collar; no supernatural silhouette.
  const d = Math.sin(t * .8) * .7;
  stroke(c, [172 + d, 108, 177 + d, 105, 177 + d, 99], '#c4b27c77', 1);
  stroke(c, [178 + d, 111, 183 + d, 107, 184 + d, 99], '#c4b27c44', 1);
  figure(c, 120, 159, 91, { coat: '#6c7868', hood: true, arm: [24, -61] });
  lamp(c, 66, 117, t, false, .55); dust(c, 221, t, 149, 20, 49, 112);
}

function borrowedShift(c, t) {
  backdrop(c, 225, true); clockFace(c, 247, 38, 17); lamp(c, 123, 33, t, true, .8);
  panel(c, 15, 49, 63, 87, '#314339', 2, '#747c62', 1);
  for (let i = 0; i < 4; i++) { stroke(c, [21, 63 + i * 18, 71, 63 + i * 18], '#8a8463', 2); wrench(c, 36 + i % 2 * 21, 59 + i * 17, .35, .3); }
  table(c, 94, 119, 195); figure(c, 191, 161, 97, { coat: '#7c7b64', seated: true, facing: -1, arm: [30, -47] });
  stroke(c, [170, 105, 156, 99, 148, 107], '#b9a07a', 4);
  panel(c, 104, 92, 35, 26, '#53695b', 3, '#a4a78a', 1); oval(c, 121, 105, 10, 10, '#31473b', '#95a087', 1);
  for (const [x, y] of [[239, 107], [258, 113], [270, 100]]) { oval(c, x, y, 6, 6, '#9c9b7b', '#485c4a', 1); oval(c, x, y, 2, 2, '#263d31'); }
  wrench(c, 227, 129, .62, 1.3); dust(c, 225, t, 95, 25, 137, 85);
}

function savedSeeds(c, t) {
  backdrop(c, 229); table(c, 40, 137, 243); lamp(c, 249, 41, t, false, .75);
  // The open, carefully stitched pocket distinguishes these personal seeds from stores.
  shape(c, [60, 51, 136, 45, 144, 126, 62, 131], '#60715d', '#a4a37d', 1);
  shape(c, [75, 77, 127, 73, 132, 113, 118, 126, 81, 122], '#839078', '#b0b38e', 1.2);
  stroke(c, [78, 79, 127, 75], '#253a2e', 4);
  for (let i = 0; i < 8; i++) stroke(c, [80 + i * 6, 117 + Math.sin(i) * 2, 81 + i * 6, 121 + Math.sin(i) * 2], '#d0c59a', .7);
  paper(c, 174, 83, 51, 43, false);
  shape(c, [181, 118, 190, 101, 199, 112, 212, 96, 219, 117], '#78815d');
  stroke(c, [181, 123, 217, 119], '#9b8256', 2);
  shape(c, [132, 139, 159, 116, 198, 135, 174, 153], '#c1ad7e', '#786849', 1);
  for (let i = 0; i < 14; i++) oval(c, 145 + hash(229, i) * 42, 130 + hash(230, i) * 16, 2.3, 1.2, i % 2 ? '#8f743f' : '#c8ae6d', '#554c31', .4);
  dust(c, 229, t, 131, 12, 129, 108);
}

function quietBench(c, t) {
  backdrop(c, 233, true); lamp(c, 174, 30, t);
  shape(c, [198, 31, 282, 15, 282, 141, 198, 141], '#24372f', '#687b65', 2);
  for (const y of [69, 102]) stroke(c, [218, y, 279, y - 5], '#364d3d', 1);
  // The elderly person is still resting on a tool crate. The bench is a proposal.
  panel(c, 54, 126, 48, 27, '#6b5b3f', 1, '#aa9062', 1); stroke(c, [57, 133, 97, 133, 97, 145, 57, 145], '#9a8054', 1);
  figure(c, 81, 159, 91, { elder: true, seated: true, coat: '#7a806a', arm: [23, -33] });
  shape(c, [133, 66, 146, 65, 162, 151, 149, 153], '#9b8254', '#c1a475', 1);
  stroke(c, [137, 72, 153, 145], '#544b33', .9);
  figure(c, 235, 143, 72, { coat: '#4c6555', facing: -1, arm: [20, -40] });
  panel(c, 192, 93, 55, 31, '#65563c', 1, '#a28b5a', 1); stroke(c, [199, 96, 199, 120, 238, 120, 238, 96], '#9c8356', 2);
  dust(c, 233, t, 105, 23, 104, 96);
}

function cleanSheet(c, t) {
  backdrop(c, 237, true); lamp(c, 161, 29, t);
  panel(c, 23, 30, 36, 37, '#547365', 2, '#9cae8e', 1); panel(c, 38, 37, 6, 23, '#c1c3a3'); panel(c, 30, 45, 22, 6, '#c1c3a3');
  cot(c, 16, 124, 88, '#5a7868'); cot(c, 226, 107, 82, '#6f735e'); cot(c, 226, 144, 82, '#696c58');
  table(c, 99, 136, 121);
  // A single folded white sheet sits between the two needs, neither allocated.
  shape(c, [113, 111, 180, 105, 205, 119, 140, 130, 114, 122], '#d1c9a8', '#e4d8b5', 1);
  shape(c, [114, 122, 140, 130, 204, 119, 204, 128, 139, 139, 115, 130], '#aeb49a', '#d6cba7', 1);
  stroke(c, [126, 117, 180, 112, 190, 118], '#aba98b', 1);
  stroke(c, [228, 67, 305, 65], '#a39165', 1); panel(c, 233, 67, 31, 24, '#646b5a', 1);
  dust(c, 237, t, 87, 25, 130, 82);
}

function measureWall(c, t) {
  backdrop(c, 241); lamp(c, 64, 32, t, true, .7);
  panel(c, 108, 30, 185, 105, '#484c3d', 0, '#747558', 1);
  stroke(c, [122, 49, 122, 125, 255, 125, 255, 49], '#c5be91', 1.5);
  stroke(c, [122, 72, 255, 72, 250, 68, 255, 72, 250, 76], '#d0c59c', 1.5);
  stroke(c, [127, 68, 122, 72, 127, 76], '#d0c59c', 1.5);
  stroke(c, [271, 50, 271, 126], '#b99266', 1.3);
  for (let y = 52; y < 125; y += 9) stroke(c, [268, y, 275, y + 4], '#b9926655', 1);
  figure(c, 93, 160, 96, { coat: '#827a57', arm: [34, -61] });
  stroke(c, [132, 97, 146, 98], '#d9cdaa', 2);
  stroke(c, [163, 143, 247, 134], '#b19c6d', 6);
  for (let i = 0; i < 16; i++) stroke(c, [168 + i * 5, 141 - i * .55, 168 + i * 5, 144 - i * .55], '#514e38', .7);
  dust(c, 241, t, 133, 20, 125, 89);
}

function weddingWire(c, t) {
  backdrop(c, 245); lamp(c, 166, 31, t);
  figure(c, 57, 149, 95, { coat: '#78816b', arm: [25, -35] });
  figure(c, 263, 148, 89, { coat: '#917d62', facing: -1, arm: [25, -35] });
  table(c, 83, 137, 155); paper(c, 109, 103, 102, 34, false);
  // Loose copper and two tentative loops: the feast has not yet happened.
  oval(c, 146, 118, 15, 11, '#00000000', '#b67f4b', 4); oval(c, 179, 119, 15, 11, '#00000000', '#b67f4b', 4);
  c.beginPath(); c.ellipse(146, 117, 15, 10, 0, 3.2, 6); c.strokeStyle = '#e6b978'; c.lineWidth = 1.4; c.stroke();
  c.beginPath(); c.ellipse(179, 118, 15, 10, 0, 3.2, 6); c.strokeStyle = '#e6b978'; c.lineWidth = 1.4; c.stroke();
  stroke(c, [195, 120, 219, 117, 223, 126, 218, 132], '#a97648', 1.5);
  stroke(c, [91, 143, 103, 131, 108, 135, 103, 145], '#9da58b', 2); stroke(c, [98, 139, 91, 149, 95, 152, 104, 144], '#b48a5e', 3);
  dust(c, 245, t, 102, 32, 119, 69);
}

function radioRecipe(c, t) {
  backdrop(c, 249, true); lamp(c, 254, 30, t, true, .8); table(c, 25, 134, 271);
  radioProp(c, 38, 66, .96, t); paper(c, 163, 61, 63, 67, false);
  stroke(c, [174, 87, 176, 98, 209, 96, 211, 85, 174, 87], '#737353', 1);
  oval(c, 192, 86, 18, 4, '#aba179', '#767151', 1);
  for (let i = 0; i < 3; i++) stroke(c, [173, 107 + i * 5, 214 - i * 6, 105 + i * 5], '#8c825b', .7);
  // Empty ingredient jars make the missing supplies visible.
  for (const [x, y, w, h] of [[240, 95, 26, 39], [272, 110, 19, 25]]) {
    panel(c, x, y, w, h, '#7a93812b', 5, '#a1b19a', 1);
    panel(c, x + 2, y - 3, w - 4, 5, '#969e7e', 1); stroke(c, [x + 4, y + 7, x + 4, y + h - 5], '#b6c4aa66', 1);
  }
  bowl(c, 155, 145, .7, false); stroke(c, [175, 147, 204, 127], '#b49a6a', 2);
  dust(c, 249, t, 84, 13, 174, 81);
}

function missingSpanner(c, t) {
  backdrop(c, 253, true); lamp(c, 262, 39, t, true, .8);
  panel(c, 25, 31, 61, 66, '#4b5747', 1, '#8c8e6c', 1);
  // Empty matching hook on the wall, actual tool under the raised blanket.
  stroke(c, [50, 43, 50, 52, 55, 54, 58, 50], '#ada98b', 1.5);
  stroke(c, [49, 60, 47, 67, 51, 85], '#7e866944', 5);
  cot(c, 43, 139, 217, '#77866d'); oval(c, 87, 126, 25, 8, '#c3bd99');
  shape(c, [118, 130, 173, 96, 222, 127, 243, 145, 158, 152], '#87927a', '#b4b596', 1.4);
  shape(c, [118, 130, 149, 135, 173, 96, 159, 139], '#2c4437');
  wrench(c, 140, 120, 1.04, 1.06);
  stroke(c, [178, 103, 195, 127, 232, 141], '#c1bca044', 1.2);
  dust(c, 253, t, 109, 24, 139, 88);
}

function greyLaundry(c, t) {
  backdrop(c, 257, true); lamp(c, 216, 30, t);
  panel(c, 27, 44, 54, 92, '#4b6a5d', 8, '#8eaa92', 1.2);
  oval(c, 54, 46, 25, 7, '#6a8470', '#a3af8e', 1); stroke(c, [69, 61, 69, 119], '#a6b49b', 2); stroke(c, [69, 105, 69, 119], '#caaf78', 3);
  stroke(c, [79, 119, 93, 119, 93, 127], '#8da38a', 4);
  for (let i = 0; i < 3; i++) {
    shape(c, [182, 109 - i * 14, 250, 102 - i * 14, 274, 114 - i * 14, 210, 126 - i * 14, 182, 119 - i * 14], ['#686f5a', '#7c7a61', '#777561'][i], '#9a9676', 1);
    for (let j = 0; j < 4; j++) stroke(c, [195 + j * 13, 112 - i * 14, 201 + j * 13, 119 - i * 14], '#4b5b4c66', 2);
  }
  shape(c, [99, 126, 177, 126, 167, 154, 110, 154], '#647a69', '#a8b196', 1.5);
  oval(c, 138, 126, 39, 11, '#3e5646', '#adb69b', 1.5); oval(c, 136, 130, 29, 5, '#78958566');
  panel(c, 228, 139, 23, 10, '#c3b891', 3, '#d7c99f', .8);
  stroke(c, [96, 15, 307, 24], '#928763', 1); panel(c, 290, 24, 12, 12, '#8e7d57', 1);
  dust(c, 257, t, 89, 19, 112, 95);
}

function calendarDispute(c, t) {
  backdrop(c, 261); lamp(c, 255, 32, t);
  panel(c, 30, 26, 107, 105, '#655c42', 2, '#b19b6d', 1.5); paper(c, 39, 39, 89, 81, false);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
    const x = 46 + col * 10, y = 54 + row * 12;
    stroke(c, [x, y, x + 6, y], '#898062', .7);
    if (row < 3 || row === 3 && col < 4) stroke(c, [x, y - 3, x + 5, y + 3], '#6c7055', 1);
  }
  oval(c, 86, 90, 6, 6, '#00000000', '#ac7d52', 1.2);
  figure(c, 191, 155, 89, { elder: true, coat: '#7b7d65', facing: -1, arm: [33, -48] });
  paper(c, 143, 104, 37, 38, false);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) stroke(c, [149 + col * 6, 115 + row * 7, 152 + col * 6, 115 + row * 7], '#7a7758', .8);
  oval(c, 158, 128, 4, 4, '#00000000', '#ad8159', 1);
  panel(c, 227, 134, 49, 6, '#7a6242', 1); panel(c, 235, 125, 30, 7, '#a28f63', 1);
  dust(c, 261, t, 123, 25, 138, 74);
}

function warmPipe(c, t) {
  backdrop(c, 265, true);
  stroke(c, [233, -5, 233, 151, 311, 151], '#765e3e', 16); stroke(c, [228, -5, 228, 151, 309, 156], '#b79b62', 2);
  for (const y of [31, 73, 126]) panel(c, 223, y, 21, 9, '#879071', 1, '#424f39', 1);
  halo(c, 218, 109, 85, .14 + Math.sin(t * .55) * .005);
  cot(c, 109, 138, 109, '#8c8c6c'); oval(c, 128, 124, 10, 7, '#b79d77');
  shape(c, [138, 125, 171, 120, 207, 134, 208, 149, 141, 148], '#949774', '#b9b292', 1);
  for (const [x, y, h] of [[33, 148, 88], [69, 140, 72]]) figure(c, x, y, h, { coat: '#566b5c', arm: [19, -43] });
  lamp(c, 86, 34, t, true, .6); dust(c, 265, t, 120, 20, 109, 95);
}

function unsentLetter(c, t) {
  backdrop(c, 269, true); lamp(c, 270, 35, t, true, .75); table(c, 38, 137, 247);
  radioProp(c, 44, 75, .82, t);
  paper(c, 158, 45, 76, 83);
  stroke(c, [167, 61, 178, 58, 192, 61], '#595e48', 1.3); // personal salutation, deliberately no invented words
  stroke(c, [167, 112, 181, 115, 194, 110], '#777459', 1);
  shape(c, [187, 135, 242, 128, 269, 147, 214, 157], '#c9b98c', '#887250', 1);
  stroke(c, [187, 135, 226, 143, 242, 128], '#947e55', 1);
  // The envelope's address area is conspicuously blank.
  stroke(c, [231, 151, 247, 149], '#b5a87c', .8);
  figure(c, 138, 170, 77, { coat: '#697c6b', facing: 1, arm: [35, -60] });
  dust(c, 269, t, 137, 17, 105, 90);
}

function badBatch(c, t) {
  backdrop(c, 273); lamp(c, 88, 32, t, true, .8); table(c, 101, 137, 193);
  figure(c, 63, 155, 95, { coat: '#788169', arm: [30, -40] });
  shape(c, [129, 92, 222, 79, 277, 103, 185, 122], '#423d2c', '#a48b57', 1.5);
  for (let i = 0; i < 5; i++) {
    const x = 145 + i * 23, y = 93 + i % 2 * 6;
    panel(c, x, y - 22, 18, 31, i === 2 ? '#92926a' : '#65745a', 3, '#a9ab80', .8);
    oval(c, x + 9, y - 22, 9, 3, i === 2 ? '#a9a77c' : '#91a080', '#c2bea0', .7);
    panel(c, x + 2, y - 11, 14, 8, '#b6ad80', 0);
  }
  // The suspect central tin has been opened for inspection, not served.
  oval(c, 200, 71, 9, 3, '#6f7247', '#c0b68c', .8);
  shape(c, [192, 68, 198, 59, 210, 62, 208, 69], '#a4a782', '#c4c1a0', .7);
  for (const [x, y] of [[197, 70], [202, 72], [205, 70]]) oval(c, x, y, 1.7, 1, '#aaa476');
  for (let i = 0; i < 2; i++) {
    const drift = Math.sin(t * .6 + i) * 2;
    c.beginPath(); c.moveTo(197 + i * 8, 65);
    c.bezierCurveTo(191 + drift + i * 8, 54, 209 + i * 4, 51, 201 + drift + i * 8, 41);
    c.strokeStyle = '#a7ad7b44'; c.lineWidth = 1.2; c.stroke();
  }
  shape(c, [129, 92, 185, 115, 277, 103, 275, 135, 184, 153, 129, 132], '#81623c', '#b49460', 1.2);
  stroke(c, [132, 106, 184, 127, 274, 115], '#c0a16b', 2); stroke(c, [133, 121, 184, 140, 274, 129], '#52492f', 1);
  // Doubt is on the table; no consumption or sickness is shown before the choice.
  bowl(c, 106, 145, .65, false); dust(c, 273, t, 98, 18, 157, 68);
}

function wornMask(c, t) {
  backdrop(c, 277, true); table(c, 37, 142, 252); lamp(c, 75, 50, t, false, .7);
  stroke(c, [128, 78, 107, 51, 146, 40, 211, 63, 223, 95], '#666e58', 6);
  stroke(c, [126, 79, 111, 54, 145, 44, 209, 66], '#a49e78', 1);
  shape(c, [134, 61, 173, 56, 209, 80, 204, 115, 177, 138, 144, 129, 123, 98], '#78856e', '#b8b495', 1.5);
  oval(c, 153, 84, 18, 11, '#2f4a3f', '#c0c2a1', 3); oval(c, 193, 88, 15, 10, '#2e483e', '#b9bc9c', 3);
  stroke(c, [141, 80, 156, 76], '#b8c7ad77', 1.2);
  oval(c, 168, 118, 19, 17, '#4c6250', '#a4af8f', 2);
  for (let x = 158; x <= 178; x += 4) stroke(c, [x, 108, x, 127], '#8e9b7e', 1);
  shape(c, [201, 101, 210, 106, 200, 122, 193, 121], '#233c30');
  for (let i = 0; i < 4; i++) stroke(c, [197 + i * 2, 104 + i * 4, 207 + i, 102 + i * 4], '#cfbf92', .8);
  panel(c, 244, 121, 18, 21, '#6d846f', 3, '#a0b192', 1); stroke(c, [235, 146, 250, 137, 262, 148], '#b9b59a', 1);
  dust(c, 277, t, 95, 17, 151, 95);
}

function quietPatient(c, t) {
  backdrop(c, 281, true);
  panel(c, 185, 17, 103, 124, '#4b6354', 2, '#95a185', 2);
  panel(c, 196, 29, 80, 110, '#283f33', 0); lamp(c, 244, 45, t, true, .65); cot(c, 209, 119, 61, '#81957c');
  panel(c, 138, 28, 28, 31, '#536d58', 1, '#8f9d7d', 1); panel(c, 150, 34, 5, 19, '#c0c2a0'); panel(c, 144, 41, 17, 5, '#c0c2a0');
  panel(c, 43, 133, 67, 6, '#7e6846', 1); stroke(c, [49, 139, 49, 161, 104, 161, 104, 139], '#5b523c', 4);
  figure(c, 75, 159, 89, { seated: true, coat: '#63735f', arm: [11, -67] });
  shape(c, [63, 98, 64, 118, 85, 123, 81, 107], '#75836b');
  figure(c, 164, 155, 90, { coat: '#8b9982', facing: -1, arm: [25, -38] });
  panel(c, 147, 118, 14, 10, '#a6ad8f', 1); dust(c, 281, t, 183, 31, 85, 87);
}

function returnToken(c, t) {
  backdrop(c, 285, true); lamp(c, 76, 32, t, true, .75);
  panel(c, 45, 50, 55, 94, '#3f5748', 3, '#92a082', 2); oval(c, 86, 99, 4, 4, '#b6b58f');
  panel(c, 123, 32, 148, 100, '#705839', 3, '#b09461', 1.2);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
    const x = 140 + col * 26, y = 55 + row * 37;
    paper(c, x - 7, y - 12, 17, 7, false); stroke(c, [x, y, x, y + 4, x + 3, y + 5, x + 4, y + 1], '#a6ae8b', 1.2);
  }
  // Unhung sample tokens on the work surface; nobody has been sent out.
  table(c, 99, 151, 188);
  for (let i = 0; i < 6; i++) {
    const x = 133 + i * 23, y = 142 + Math.sin(i * 2) * 3;
    oval(c, x, y, 9, 5, i % 2 ? '#b09a67' : '#8d9e80', '#d0bf91', .8);
    oval(c, x - 2, y - 1, 1.2, 1, '#3f4c37'); stroke(c, [x + 1, y - 2, x + 3, y + 2], '#5d6145', .8);
  }
  dust(c, 285, t, 101, 16, 142, 104);
}

function sharedSilence(c, t) {
  backdrop(c, 289, true); engine(c, 211, 71, .72, t); lamp(c, 157, 32, t, true, .75);
  // Empty chair and a held list make the absent people central, not the engine.
  panel(c, 132, 83, 38, 30, '#796747', 2, '#ac9668', 1);
  stroke(c, [131, 109, 130, 160, 139, 160, 140, 122, 168, 122, 175, 158], '#756445', 4);
  panel(c, 128, 123, 49, 7, '#9a7f51', 2, '#c3a16d', 1);
  figure(c, 63, 157, 94, { elder: true, coat: '#7b816d', arm: [24, -49] });
  paper(c, 80, 104, 30, 33); figure(c, 202, 161, 92, { coat: '#657d69', facing: -1, arm: [10, -35] });
  figure(c, 264, 166, 76, { coat: '#6c765f', facing: -1 });
  dust(c, 289, t, 114, 20, 80, 98);
}

function radioWrongName(c, t) {
  backdrop(c, 293, true); lamp(c, 270, 28, t, true, .7); table(c, 26, 139, 273); radioProp(c, 183, 66, 1.02, t);
  figure(c, 89, 166, 102, { coat: '#788471', arm: [12, -75] });
  c.beginPath(); c.ellipse(90, 82, 16, 19, 0, Math.PI, 2 * Math.PI); c.strokeStyle = '#a8af8e'; c.lineWidth = 3; c.stroke();
  panel(c, 103, 77, 9, 19, '#334d3e', 3, '#9aa68a', 1);
  stroke(c, [110, 95, 117, 127, 183, 132], '#293c30', 1.8);
  paper(c, 129, 100, 47, 43, false);
  // Two uncertain sketches echo the misheard person / sugar, without resolving it.
  oval(c, 142, 112, 4, 5, '#8e805c'); stroke(c, [136, 125, 138, 118, 146, 118, 149, 125], '#8e805c', 1.5);
  shape(c, [155, 122, 162, 117, 169, 121, 162, 127], '#cfc7a2', '#8b8560', .7);
  shape(c, [155, 122, 162, 127, 169, 121, 169, 129, 162, 134, 155, 129], '#bdb48d', '#8b8560', .7);
  stroke(c, [151, 109, 153, 107, 156, 109, 153, 114], '#8e805c', .9);
  dust(c, 293, t, 121, 18, 132, 79);
}

function generatorShift(c, t) {
  backdrop(c, 297, true); lamp(c, 97, 32, t, true, .75); clockFace(c, 271, 31, 15);
  engine(c, 151, 84, 1.1, t);
  figure(c, 102, 159, 95, { coat: '#7a8068', arm: [27, -40] }); wrench(c, 135, 127, .62, -.4);
  panel(c, 22, 88, 35, 54, '#687354', 4, '#99a77e', 1); oval(c, 39, 88, 17, 5, '#829073', '#b4b08b', .8);
  stroke(c, [29, 104, 29, 133, 48, 133, 48, 104, 29, 104], '#454e37', 1);
  paper(c, 55, 47, 33, 35); dust(c, 297, t, 97, 17, 149, 83);
}

function seedStock(c, t) {
  backdrop(c, 301); lamp(c, 166, 31, t); table(c, 37, 139, 252);
  bowl(c, 82, 127, 1.35, false); stroke(c, [100, 139, 125, 112], '#b59968', 2.5);
  panel(c, 139, 65, 51, 71, '#9b9e6c55', 6, '#b2bb99', 1.5); oval(c, 164, 66, 25, 6, '#929e77', '#c6c49f', 1.5);
  for (let i = 0; i < 28; i++) oval(c, 146 + hash(301, i) * 36, 96 + hash(302, i) * 33, 2.5, 1.3, i % 2 ? '#b19b5f' : '#82733f');
  panel(c, 141, 61, 47, 5, '#aaa17a', 1, '#c8bc91', .8);
  shape(c, [221, 115, 259, 115, 252, 139, 229, 139], '#896a43', '#b89662', 1);
  oval(c, 240, 115, 19, 5, '#403f2b', '#aa8f62', 1);
  // An empty seedling pot and a bowl flank the closed seed jar: both futures open.
  stroke(c, [245, 115, 247, 98], '#a49870', 2); paper(c, 242, 94, 17, 11, false);
  dust(c, 301, t, 104, 22, 142, 95);
}

function eveningCurfew(c, t) {
  backdrop(c, 305, true); clockFace(c, 44, 33, 14);
  panel(c, 146, 5, 12, 157, '#555f4d', 0, '#909579', 1);
  cot(c, 10, 128, 99, '#506c5c'); oval(c, 29, 116, 10, 7, '#a59172');
  figure(c, 132, 158, 93, { coat: '#697c68', facing: 1, arm: [21, -57] });
  table(c, 178, 129, 129); lamp(c, 241, 61, t, false, .7);
  figure(c, 195, 160, 81, { coat: '#807b60', seated: true, arm: [20, -41] });
  figure(c, 286, 160, 83, { coat: '#7d8a6f', seated: true, facing: -1, arm: [24, -42] });
  bowl(c, 224, 129, .5); bowl(c, 264, 129, .5); paper(c, 230, 142, 27, 11, false);
  dust(c, 305, t, 174, 18, 123, 101);
}

const SCENES = Object.freeze({
  strangerAtHatch: stranger, rationTheft: ration, elderSky: elder, childQuota, gasPocket: gas,
  radioPlea: radio, sickness, generic, generatorShift, seedStock, eveningCurfew,
  labDryBoots: dryBoots, labLastPencil: lastPencil, labCrackedCup: crackedCup, labFalseDawn: falseDawn,
  labSoupName: soupName, labNightKnock: nightKnock, labBorrowedShift: borrowedShift, labSavedSeeds: savedSeeds,
  labQuietBench: quietBench, labCleanSheet: cleanSheet, labMeasureWall: measureWall, labWeddingWire: weddingWire,
  labRadioRecipe: radioRecipe, labMissingSpanner: missingSpanner, labGreyLaundry: greyLaundry,
  labCalendarDispute: calendarDispute, labWarmPipe: warmPipe, labUnsentLetter: unsentLetter,
  labBadBatch: badBatch, labWornMask: wornMask, labQuietPatient: quietPatient, labReturnToken: returnToken,
  labSharedSilence: sharedSilence, labRadioWrongName: radioWrongName,
});

/** Draw into exactly the supplied rectangle; t is elapsed illustration seconds. */
export function drawDilemmaVignette(ctx, id, x, y, w, h, options = {}) {
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
  const t = !options?.reduceMotion && Number.isFinite(options?.t) ? options.t % 7200 : 0;
  ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.scale(w / 320, h / 180);
  ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  (Object.hasOwn(SCENES, id) ? SCENES[id] : generic)(ctx, t);
  // A thin rubbed edge holds the image together without becoming a UI border.
  const shade = ctx.createRadialGradient(164, 91, 38, 164, 91, 188);
  shade.addColorStop(0, '#10191b00'); shade.addColorStop(.72, '#10191b10'); shade.addColorStop(1, '#10191b99');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 320, 180);
  ctx.restore();
}
