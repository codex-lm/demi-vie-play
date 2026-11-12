import { P, TAU, hash, clamp } from './palette.js';
import { box, ellipse, line, poly, gradient, halo } from './primitives.js';
import { DOMESTIC, drawKitchenLayer } from './props-domestic.js';
import { INDUSTRIAL } from './props-industrial.js';
import { COMMUNITY } from './props-community.js';
import { UTILITIES } from './props-utilities.js';
import { ENERGY } from './props-energy.js';
import { RADIO } from './props-radio.js';
import { HAZARD_PROPS } from './props-hazards.js';
import { drawBackWall } from './walls.js';
import { drawStoredWater } from './props-reserves.js';

const DRAWERS = { ...DOMESTIC, ...INDUSTRIAL, ...COMMUNITY, ...UTILITIES, ...ENERGY, ...RADIO, ...HAZARD_PROPS,
  pantry(c,w,h,o) { DOMESTIC.pantry(c,w,h,o); drawStoredWater(c,w,h,o.reserveArt); },
  storage(c,w,h,o) { DOMESTIC.storage(c,w,h,o); drawStoredWater(c,w,h,o.reserveArt); },
  cistern(c,w,h,o) { UTILITIES.cistern(c,w,h,o); drawStoredWater(c,w,h,o.reserveArt); },
  exodusDepot: drawExodusDepot, elevator: drawElevator };
// M4 rooms share the atelier palette and scale, with equipment specific to
// preparing departure and vertical transport. No contents or motion are invented.
function drawExodusDepot(c,w,h,o) {
  DOMESTIC.storage(c,w,h,o);
  const left=Math.max(.20,w*.46),floor=h-.08,count=Math.max(1,Math.floor((w-left)/1.1));
  for(let i=0;i<count;i++) {
    const x=left+(i+.5)*(w-left)/count;
    drawCrate(c,x,floor,1,{width:.82,height:.57});
    box(c,x-.36,floor-.84,.72,.25,P.green,.09);
    for(const dx of [-.22,.22])line(c,[x+dx,floor-.83,x+dx,floor-.61],P.cream,.045);
    ellipse(c,x-.25,floor-.90,.12,.09,P.metalDark,P.metalLight,.022);
    line(c,[x+.12,floor-.88,x+.29,floor-.88,x+.29,floor-.96],P.metalLight,.035);
  }
  line(c,[.20,h-.025,w-.20,h-.025],P.woodLight,.045);
}
function drawElevator(c,w,h,o) {
  const x=w/2,cabin=Math.min(1.28,w*.66),floor=h-.08,top=Math.max(.62,floor-2.05);
  for(const dx of [-cabin*.66,cabin*.66]) {
    line(c,[x+dx,.08,x+dx,floor],P.ink,.12);
    line(c,[x+dx,.08,x+dx,floor],P.metalLight,.065);
    for(let y=.22;y<floor;y+=.55)box(c,x+dx-.07,y,.14,.08,P.metalDark,.015);
  }
  const pulley=.17,angle=o.powered?o.t*1.2:0;
  ellipse(c,x,.30,pulley,pulley,P.metalDark,P.metalLight,.025);
  line(c,[x+Math.cos(angle)*pulley,.30+Math.sin(angle)*pulley,x-Math.cos(angle)*pulley,.30-Math.sin(angle)*pulley],P.cream,.028);
  for(const dx of [-.08,.08])line(c,[x+dx,.48,x+dx,top],P.metal,.024);
  box(c,x-cabin/2,top,cabin,floor-top,P.metalDark,.055,P.ink,.045);
  box(c,x-cabin*.43,top+.12,cabin*.86,floor-top-.24,'#2b3e40',.025,P.metalLight,.028);
  for(let y=top+.16;y<floor-.18;y+=.26) {
    line(c,[x-cabin*.39,y,x+cabin*.39,Math.min(floor-.13,y+.26)],P.metal,.018);
    line(c,[x+cabin*.39,y,x-cabin*.39,Math.min(floor-.13,y+.26)],P.metal,.018);
  }
  line(c,[x,top+.12,x,floor-.12],P.metalLight,.04);
  for(const y of [top+.06,floor-.07])box(c,x-cabin*.56,y,cabin*1.12,.10,P.woodLight,.02);
  box(c,x+cabin*.57,top+.70,.16,.27,P.metalDark,.02);
  ellipse(c,x+cabin*.65,top+.77,.034,.034,o.powered?'#a7cf7d':'#89918b');
}

export const ROOM_TYPES = Object.freeze(Object.keys(DRAWERS));
function options(o) {return {t:Number.isFinite(o.t)?o.t:0,seed:Number.isFinite(o.seed)?o.seed|0:1,powered:o.powered!==false,lit:o.lit!==false&&(o.powered!==false||o.independentLight===true),independentLight:o.independentLight===true,damage:clamp(Number(o.damage)||0),flood:clamp(Number(o.flood)||0),shade:o.shade!==false,water:o.water!==false,backWall:o.backWall!==false,glow:o.glow!==false,receiving:o.receiving===true,souvenirs:Array.isArray(o.souvenirs)?o.souvenirs:[],bedCount:Number.isFinite(o.bedCount)?Math.max(0,Math.floor(o.bedCount)):undefined,detectorPowered:o.detectorPowered!==false,methane:Number.isFinite(o.methane)?clamp(o.methane,0,100):null,gasAlert:['warning','danger'].includes(o.gasAlert)?o.gasAlert:null,reserveArt:o.reserveArt,noFilters:o.noFilters===true,filterRunning:o.filterRunning!==false};}
function local(c,x,y,cell,draw) { if(!Number.isFinite(cell)||cell<=0)return;c.save();c.translate(x,y);c.scale(cell,cell);draw();c.restore(); }

// These two raster layers contain only native Canvas drawing. Animated furniture,
// inhabitants, water and damage overlays remain live. Stationary furniture joins
// the back layer; fully static rooms need only that one bitmap. Kitchen pots are
// behind live steam, while hoods and counters share the front layer. A bounded LRU keeps a zoom/resize
// session from retaining every resolution it has ever visited.
const ROOM_LAYER_LIMIT=24*1024*1024,ROOM_LAYER_COUNT=64;
const STATIC_ROOM_FURNITURE=new Set(['dorm','canteen','pantry','storage','infirmary','mushroom','school','archive','ossuary','cistern','rtg','battery','surfaceSolar','exodusDepot']);
const LIVING_ROOM_FURNITURE=new Set(['insectFarm','ratFarm','fishTank']);
function staticFurniture(type,o) {
  // The reserve warning keeps blinking even if fuel starvation stops the engine.
  if(type==='diesel'&&o.reserveArt?.fuelStatus==='red')return false;
  return STATIC_ROOM_FURNITURE.has(type)||(type==='radio'&&!o.receiving)||
    (!o.powered&&!LIVING_ROOM_FURNITURE.has(type)&&typeof DRAWERS[type]==='function');
}
function furnitureReserveKey(type,o) {
  const r=o.reserveArt;
  if(!r)return null;
  if(type==='pantry')return [r.foodFill,r.dirtyWaterFill,r.radioactiveWaterFill];
  if(type==='cistern')return [r.waterFill,r.dirtyWaterFill,r.radioactiveWaterFill];
  if(type==='filterPlant')return [r.waterFill,r.localFilters,r.colonyFiltersFill,r.colonyFiltersStatus,o.noFilters,o.filterRunning];
  if(type==='diesel')return [r.fuelCans,r.fuelStatus,r.fuelEmpty];
  if(type==='storage'||type==='workshop')return [r.stoneFill,r.woodFill,r.metalFill,r.dirtyWaterFill,r.radioactiveWaterFill];
  return null;
}
function furnitureDamageKey(type,o) {
  // Damage overlays stay live. Most furniture has discrete damage details;
  // dormant diesel alone has a continuously sized leak inside its drawer.
  const thresholds={dorm:.58,pantry:.6,storage:.62,archive:.7,cistern:.55,battery:.6,surfaceSolar:.4,exodusDepot:.62};
  return type in thresholds?o.damage>thresholds[type]:o.damage;
}
const roomLayerCache=new Map();
const roomLayerStats={bytes:0,hits:0,misses:0,builds:0,evictions:0,bypasses:0};
export function getRoomLayerCacheStats() {
  return {...roomLayerStats,entries:roomLayerCache.size,maxBytes:ROOM_LAYER_LIMIT,maxEntries:ROOM_LAYER_COUNT};
}
function releaseRoomLayers(entry) {
  // Releasing the backing stores promptly matters when zooming on a large map.
  for(const canvas of [entry.back,entry.front])if(canvas){canvas.width=0;canvas.height=0;}
}
export function clearRoomLayerCache() {
  for(const entry of roomLayerCache.values())releaseRoomLayers(entry);
  roomLayerCache.clear();for(const name of Object.keys(roomLayerStats))roomLayerStats[name]=0;
}
function layerCanvas(width,height) {
  try {
    if(typeof globalThis.OffscreenCanvas==='function')return new globalThis.OffscreenCanvas(width,height);
    if(globalThis.document?.createElement) {
      const canvas=globalThis.document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
    }
  }catch { /* A browser may expose a constructor while disabling its context. */ }
  return null;
}
function roomBackground(c,type,w,h,o) {
  if(o.backWall)drawBackWall(c,type,w,h);
  // Soft cones and elliptical pools remain underneath furniture and inhabitants.
  if(o.lit&&o.glow)for(let x=Math.min(1.2,w/2);x<w-.20;x+=3.1){
    halo(c,x,.48,Math.min(2,h*.60),.23);
    const cone=gradient(c,0,.45,0,h-.45,'rgba(252,210,136,.015)','rgba(252,205,126,.10)');
    poly(c,[x-.03,.45,x+.03,.45,x+1.2,h,x-1.2,h],cone,null);
    c.save();c.translate(x,h-.035);c.scale(1,.13);halo(c,0,0,1.2,.25);c.restore();
  }
  line(c,[.05,h-.025,w-.05,h-.025],P.woodLight,.035);
}
function roomCeiling(c,w,h,o) {
  // This glow must remain above tall furniture, separate from the back layer.
  if(o.lit&&o.glow)for(let x=Math.min(1.2,w/2);x<w-.20;x+=3.1){
    c.save();c.translate(x,.46);c.scale(1,.70);halo(c,0,0,1.02,.32);c.restore();
  }
  for(let x=Math.min(1.2,w/2);x<w-.20;x+=3.1)drawLamp(c,x,.05,1,{lit:o.lit,powered:o.powered||o.independentLight,halo:false});
}
function cachedRoomLayers(c,type,w,h,cellPx,o,enabled,rasterTransform) {
  // Flattening several translucent primitives is equivalent only with ordinary
  // source-over painting at full caller alpha. Preserve all other Canvas uses
  // through the original path, including the DOM-free Node contract tests.
  if(!enabled||!(typeof globalThis.OffscreenCanvas==='function'||globalThis.document?.createElement)) {
    roomLayerStats.bypasses++;return null;
  }
  const shadow=c.shadowColor,transparentShadow=shadow==='transparent'||shadow==='#0000'||shadow==='#00000000'||/^rgba\([^)]*,\s*0(?:\.0*)?\s*\)$/.test(shadow);
  if(c.globalAlpha!==1||c.globalCompositeOperation!=='source-over'||(c.filter&&c.filter!=='none')||
      !transparentShadow||c.shadowBlur||c.shadowOffsetX||c.shadowOffsetY||c.getLineDash().length) {
    roomLayerStats.bypasses++;return null;
  }
  // With a fixed raster resolution the transform was captured before scaling
  // by the animated cell size. Other callers already draw in world units.
  const m=rasterTransform??c.getTransform(),rasterScale=rasterTransform?cellPx:1;
  const sx=Math.hypot(m.a,m.b)*rasterScale,sy=Math.hypot(m.c,m.d)*rasterScale;
  const frozen=staticFurniture(type,o),kitchen=type==='kitchen'&&!frozen;
  const furniture=frozen||kitchen;
  const pw=Math.ceil(w*sx),ph=Math.ceil(h*sy),bytes=pw*ph*(frozen?4:8);
  if(!Number.isFinite(bytes)||pw<=0||ph<=0||pw>4096||ph>4096||bytes>ROOM_LAYER_LIMIT) {
    roomLayerStats.bypasses++;return null;
  }
  // Reception, memories, beds and furniture damage belong to the retained drawing.
  // Water and room cracks are composited live after it and never enter this key.
  const key=JSON.stringify([typeof type==='string'?type:'',w,h,cellPx,pw,ph,o.seed,o.lit,o.powered,o.glow,o.backWall,o.bedCount,
    frozen?furnitureDamageKey(type,o):null,type==='radio'?o.receiving:null,type==='ossuary'?o.souvenirs:null,
    frozen?furnitureReserveKey(type,o):null]);
  let entry=roomLayerCache.get(key);
  if(entry) {
    roomLayerCache.delete(key);roomLayerCache.set(key,entry);roomLayerStats.hits++;return entry;
  }
  roomLayerStats.misses++;
  while(roomLayerCache.size&&(roomLayerStats.bytes+bytes>ROOM_LAYER_LIMIT||roomLayerCache.size>=ROOM_LAYER_COUNT)) {
    const oldest=roomLayerCache.keys().next().value,previous=roomLayerCache.get(oldest);
    roomLayerCache.delete(oldest);roomLayerStats.bytes-=previous.bytes;roomLayerStats.evictions++;releaseRoomLayers(previous);
  }
  const back=layerCanvas(pw,ph),front=frozen?null:layerCanvas(pw,ph);
  let bc,fc;
  try {bc=back?.getContext('2d');fc=front?.getContext('2d');}catch { /* Direct rendering still works if offscreen contexts are refused. */ }
  if(!bc||(!frozen&&!fc)) {
    if(back){back.width=0;back.height=0;}if(front){front.width=0;front.height=0;}
    roomLayerStats.bypasses++;return null;
  }
  bc.scale(pw/w,ph/h);if(fc)fc.scale(pw/w,ph/h);
  roomBackground(bc,type,w,h,o);
  if(kitchen){
    drawKitchenLayer(bc,w,h,o,'back');drawKitchenLayer(fc,w,h,o,'front');
  }else if(furniture)DRAWERS[type](bc,w,h,o);
  roomCeiling(fc??bc,w,h,o);
  entry={back,front,bytes,furniture,kitchen};roomLayerCache.set(key,entry);
  roomLayerStats.bytes+=bytes;roomLayerStats.builds++;return entry;
}

/** x/y: top centre, height: pixels. */
export function drawLadder(c,x,y,height,cellPx,opts={}) {
  local(c,x,y,cellPx,()=>{
    const h=height/cellPx, color=opts.metal?P.metal:P.woodLight;
    for(const rail of [-.24,.24]) {line(c,[rail,0,rail,h],P.ink,.12);line(c,[rail,0,rail,h],color,.065);}
    for(let r=.20;r<h;r+=.34){line(c,[-.24,r,.24,r],P.ink,.095);line(c,[-.24,r,.24,r],color,.05);}
    for(let r=.1;r<h;r+=1.4) {line(c,[-.33,r,-.24,r],P.metalDark,.07);line(c,[.24,r,.33,r],P.metalDark,.07);}
  });
}
/** x/y: top centre of the hanging fixture. */
export function drawLamp(c,x,y,cellPx,opts={}) {
  local(c,x,y,cellPx,()=>{
    const lit=opts.lit!==false&&opts.powered!==false;
    if(lit&&opts.halo!==false&&opts.glow!==false) halo(c,0,.52,1.9,.20);
    line(c,[0,0,0,.23],P.ink,.055);line(c,[.025,0,.025,.22],P.metal,.018);
    poly(c,[-.10,.21,.10,.21,.22,.36,-.22,.36],P.metalDark);
    ellipse(c,0,.35,.20,.045,P.metalLight,P.ink,.02);
    ellipse(c,0,.39,.075,.085,lit?'#ffe8b1':'#8a8b76',P.ink,.018);
    if(lit) ellipse(c,0,.39,.032,.05,'#fff5d5');
  });
}
/** x/y: wheel centre, .52 m handle circle; visual seconds shared with crank pose. */
export function drawCrank(c,x,y,cellPx,opts={}) {
  local(c,x,y,cellPx,()=>{
    const a=opts.powered===false?0:(opts.t??0)*3;
    ellipse(c,0,0,.30,.30,P.metalDark,P.ink,.055);
    ellipse(c,0,0,.26,.26,'#334746',P.woodLight,.055);
    for(let i=0;i<4;i++){const q=a+i*TAU/4;line(c,[0,0,Math.cos(q)*.25,Math.sin(q)*.25],P.cream,.045);}
    ellipse(c,0,0,.065,.065,P.woodLight,P.ink,.024);
    const xh=Math.cos(a)*.26,yh=Math.sin(a)*.26;
    box(c,xh-.04,yh-.06,.12,.12,'#f1d39a',.03,P.ink,.025);
  });
}
/** x/y: bottom centre; outer frame .96 m wide and 2.1 m tall. */
export function drawDoor(c,x,y,cellPx,opts={}) {
  local(c,x,y,cellPx,()=>{
    box(c,-.48,-2.10,.96,2.1,P.metalDark,.08);
    box(c,-.40,-2.02,.80,2.02,P.shadow,.04);
    if(opts.open) {
      poly(c,[-.38,-2.02,-.11,-1.87,-.11,-.08,-.38,0],P.metal);
      line(c,[-.16,-1.05,-.16,-.90],P.amber,.035);
    } else {
      box(c,-.36,-1.98,.72,1.96,gradient(c,-.36,-2,.72,2,P.metal,P.metalDark),.05);
      box(c,-.24,-1.74,.48,.32,'#283b3d',.06,P.metalLight,.035);
      line(c,[-.19,-1.70,.07,-1.70],'#77948e',.022);
      if(opts.airlock) {
        ellipse(c,0,-.96,.19,.19,P.metalDark,P.cream,.028);
        for(let i=0;i<4;i++){const a=i*TAU/4;line(c,[0,-.96,Math.cos(a)*.17,-.96+Math.sin(a)*.17],P.cream,.03);}
      } else line(c,[.20,-.94,.20,-.78],P.amber,.055);
      for(const ry of [-1.65,-.40])box(c,-.40,ry,.09,.16,P.metalLight,.015);
    }
    line(c,[-.50,-.01,.50,-.01],P.woodLight,.05);
  });
}
/** x/y: bottom centre. */
export function drawCrate(c,x,y,cellPx,opts={}) {
  local(c,x,y,cellPx,()=>{
    const w=opts.width??.78,h=opts.height??.62;
    box(c,-w/2,-h,w,h,gradient(c,-w/2,-h,w,h,P.woodLight,P.wood),.035);
    for(let k=1;k<4;k++)line(c,[-w/2,-h+k*h/4,w/2,-h+k*h/4],P.woodDark,.018);
    for(const k of [-.32,.32])line(c,[w*k,-h+.04,w*k,-.04],P.cream,.07);
    box(c,-.10,-h*.64,.20,.13,P.cream,.014,null);
  });
}
/** x/y: bottom centre; deterministic, asymmetric rock. */
export function drawRubbleChunk(c,x,y,cellPx,opts={}) {
  local(c,x,y,cellPx,()=>{
    const seed=opts.seed??1,w=.25+hash(seed,1)*.28,h=.15+hash(seed,2)*.25;
    poly(c,[-w/2,0,-w*.63,-h*.35,-w*.18,-h,w*.22,-h*.90,w*.55,-h*.25,w*.45,0],P.rockLight);
    poly(c,[-w*.55,-h*.35,-w*.18,-h,w*.22,-h*.90,w*.09,-h*.40], '#626964',null);
  });
}

function water(c,w,h,o,foreground=false) {
  if(o.flood<=0)return;
  const level=h*(1-o.flood),amp=.025+o.flood*.016;
  c.beginPath();c.moveTo(0,h);
  for(let x=0;x<=w+.05;x+=.08)c.lineTo(x,level+Math.sin(x*4+o.t*1.4)*amp);
  c.lineTo(w,h);c.closePath();c.fillStyle=foreground?'rgba(96,157,159,.24)':gradient(c,0,level,0,h-level,'rgba(103,156,156,.28)','rgba(27,61,69,.66)');c.fill();
  if(foreground) {
    const points=[];for(let x=0;x<=w;x+=.08)points.push(x,level+Math.sin(x*4+o.t*1.4)*amp);
    line(c,points,'rgba(188,211,188,.62)',.025);
    for(let i=0;i<Math.floor(w*2);i++){const x=hash(i,8)*w;line(c,[x,level+.10+hash(i,3)*.4,x+.18,level+.10+hash(i,3)*.4],'rgba(167,200,186,.20)',.018);}
  }
}

/** Furnish an interior rect in pixels; it is clipped, no simulation state is touched. */
export function drawRoomProps(c,roomType,rect,cellPx,opts={}) {
  if(!c||!Number.isFinite(cellPx)||cellPx<=0||!rect||rect.w<=0||rect.h<=0)return;
  const o=options(opts),w=opts.widthCells??rect.w/cellPx,h=opts.heightCells??rect.h/cellPx;
  const rasterTransform=opts.rasterCell?c.getTransform?.():null;
  c.save();c.beginPath();c.rect(rect.x,rect.y,rect.w,rect.h);c.clip();c.translate(rect.x,rect.y);c.scale(cellPx,cellPx);
  const cached=cachedRoomLayers(c,roomType,w,h,opts.rasterCell??cellPx,o,opts.cache!==false,rasterTransform);
  if(cached) {
    c.drawImage(cached.back,0,0,w,h);
    // The floor stroke is the final state inherited by the furniture drawer.
    c.strokeStyle=P.woodLight;c.lineWidth=.035;c.lineCap='round';c.lineJoin='round';
  }else {
    roomBackground(c,roomType,w,h,o);
  }
  const drawer=DRAWERS[roomType];if(drawer&&!cached?.furniture)drawer(c,w,h,o);
  if(cached?.kitchen)drawKitchenLayer(c,w,h,o,'motion');
  if(cached?.front)c.drawImage(cached.front,0,0,w,h);else if(!cached)roomCeiling(c,w,h,o);
  if(o.damage>.15) {
    for(let i=0;i<1+Math.floor(o.damage*6);i++) {
      const x=.15+hash(i,40)*(w-.3),d=.14+o.damage*.85;
      line(c,[x,0,x-.08,d*.23,x+.05,d*.43,x-.14,d*.7,x-.06,d],P.ink,.025+o.damage*.018);
      if(o.damage>.5)drawRubbleChunk(c,x,h-.02,.5+o.damage*.4,{seed:i});
    }
  }
  if(!o.lit&&o.shade){
    c.fillStyle='rgba(7,16,24,.68)';c.fillRect(0,0,w,h);
    // Battery-backed exit pilot: deliberately tiny, not a working room lamp.
    box(c,w-.29,.20,.16,.10,'#2c4141',.015,P.ink,.015);
    ellipse(c,w-.21,.25,.035,.027,'#abbc83');
  }
  if(o.water)water(c,w,h,o);c.restore();
}
/** Call after the inhabitants for translucent water in front of their legs. */
export function drawRoomEnvironmentForeground(c,rect,cellPx,opts={}) {
  if(!c||!Number.isFinite(cellPx)||cellPx<=0||!rect||rect.w<=0||rect.h<=0)return;
  c.save();c.beginPath();c.rect(rect.x,rect.y,rect.w,rect.h);c.clip();c.translate(rect.x,rect.y);c.scale(cellPx,cellPx);
  water(c,rect.w/cellPx,rect.h/cellPx,options(opts),true);c.restore();
}
