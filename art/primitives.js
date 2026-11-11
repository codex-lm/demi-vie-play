import { P, TAU } from './palette.js';
export function line(c, points, color = P.ink, width = .035) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}
export function ellipse(c, x, y, rx, ry, fill, stroke = null, width = .025) {
  c.beginPath(); c.ellipse(x, y, Math.max(0,rx), Math.max(0,ry), 0, 0, TAU);
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
export function box(c, x, y, w, h, fill, radius = .045, stroke = P.ink, width = .028) {
  c.beginPath(); c.roundRect(x, y, w, h, radius); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
export function poly(c, points, fill, stroke = P.ink, width = .025) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
export function gradient(c, x, y, w, h, a, b) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  if (!g?.addColorStop) return a;
  g.addColorStop(0, a); g.addColorStop(1,b); return g;
}
export function halo(c, x, y, radius, alpha = .2) {
  const g = c.createRadialGradient(x,y,0,x,y,radius);
  if (!g?.addColorStop) return;
  g.addColorStop(0,`rgba(255,198,113,${alpha})`); g.addColorStop(1,'rgba(255,198,113,0)');
  ellipse(c,x,y,radius,radius,g);
}
