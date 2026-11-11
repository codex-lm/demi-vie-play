import {P,clamp,hash} from './palette.js';
import {box,ellipse,line,poly,gradient} from './primitives.js';
import {colonistFeatures,colonistOutfit,AGES,JOBS} from './colonist.js';

/** A framed bust; x/y are the square's top-left, size is pixels (48–160 intended).
 * Identity comes exclusively from the same seed/age/job selectors as drawColonist.
 * dose is cumulative mSv: an artistic overlay, never a medical/simulation rule.
 */
export function drawPortrait(c,x,y,size,opts={}){
  if(!c||![x,y,size].every(Number.isFinite)||size<=0)return;
  const age=AGES.includes(opts.age)?opts.age:'adult',job=JOBS.includes(opts.job)?opts.job:'none';
  const seed=Number.isFinite(opts.seed)?opts.seed|0:1,f=colonistFeatures(seed,age),outfit=colonistOutfit(job);
  if (typeof opts.skin === 'string' && /^#[0-9a-f]{6}$/i.test(opts.skin)) f.skin = opts.skin;
  const mood=clamp(Number.isFinite(opts.mood)?opts.mood:60,0,100),tired=clamp((50-mood)/45),happy=clamp((mood-55)/45);
  const dose=clamp(((Number.isFinite(opts.dose)?opts.dose:0)-250)/1750),elder=age==='elder',child=age==='child';
  c.save();c.translate(x,y);c.scale(size/100,size/100);c.beginPath();c.roundRect(0,0,100,100,7);c.clip();
  c.fillStyle=gradient(c,0,0,100,100,'#3b4c4b','#1e2d31');c.fillRect(0,0,100,100);
  const glow=c.createRadialGradient(42,32,3,45,40,66);if(glow?.addColorStop){glow.addColorStop(0,'rgba(191,171,127,.27)');glow.addColorStop(1,'rgba(191,171,127,0)');}c.fillStyle=glow??'rgba(191,171,127,.08)';c.fillRect(0,0,100,100);
  // Gentle board-like framing retains the handmade world of the rooms.
  line(c,[6,78,6,6,31,6],'#65726a',.55);line(c,[94,25,94,94,72,94],'#7a7765',.55);
  const wide=f.width,shoulder=child?29:37;
  c.save();c.translate(50,0);c.scale(wide,1);
  c.beginPath();c.moveTo(-shoulder,103);c.quadraticCurveTo(-shoulder+1,83,-25,79);c.lineTo(-12,73);c.lineTo(10,72);c.lineTo(27,80);c.quadraticCurveTo(shoulder,84,shoulder+3,103);c.closePath();
  c.fillStyle=gradient(c,-30,74,60,25,outfit[1],outfit[0]);c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
  // Neck colour is exactly the seed skin, with warm cast shadows separate.
  poly(c,[-10,61,11,61,13,77,3,84,-11,76],f.skin,P.ink,1.1);
  poly(c,[-10,65,10,66,10,73,0,77,-9,74],'rgba(73,42,34,.17)',null);
  poly(c,[-13,75,0,83,-9,88,-19,79],outfit[2],P.ink,.75);poly(c,[13,74,0,83,9,88,21,80],outfit[1],P.ink,.75);
  line(c,[0,84,2,100],outfit[2],.8);
  for(let i=0;i<2;i++)ellipse(c,5,91+i*7,1.05,1.05,'#d2c7a7',P.ink,.4);
  if(job==='none'){
    poly(c,[-14,74,-1,80,12,73,16,80,1,88,-16,81],f.scarf,P.ink,.75);
    poly(c,[-1,86,8,83,12,98,4,101],f.scarf,P.ink,.65);line(c,[4,87,7,96],'rgba(242,224,185,.36)',.8);
  }
  if(job==='digger')for(const sx of [-21,22])line(c,[sx,80,sx*.8,103],'#716047',4.7);
  if(job==='tech'){box(c,-27,86,15,14,outfit[2],1);line(c,[-23,82,-23,91],P.cream,1.8);line(c,[-17,84,-17,92],P.rust,1.7);}
  if(job==='medic'){box(c,-28,85,15,15,'#e4debf',2,P.ink,.8);line(c,[-20.5,88,-20.5,97],P.red,2.7);line(c,[-25,92.5,-16,92.5],P.red,2.7);}
  if(job==='hauler')line(c,[-25,79,13,103],'#544d3f',5.2);
  if(job==='farmer'||job==='cook'){
    poly(c,[-14,86,15,86,21,104,-20,104],job==='cook'?'#d3c39e':'#b5ad82',P.ink,.75);
    line(c,[-13,86,-17,77],'#ded3b3',2);line(c,[14,86,18,78],'#ded3b3',2);box(c,-9,94,18,9,'#b2a47d',1,P.ink,.6);
  }
  line(c,[-30,88,-28,98],outfit[2],.9);line(c,[29,88,31,100],outfit[2],.9);
  c.restore();

  // A slight turn, asymmetrical ears and nose echo the in-world three-quarter head.
  c.save();c.translate(50,child?1:0);if(mood<25)c.translate(0,2.5);
  const fw=(child?21:20)*wide,chin=child?69:elder?73:72;
  if(f.style===3)ellipse(c,-14,46,13,27,f.hair,P.ink,1.2);
  if(f.style===4)ellipse(c,-23,29,9,10,f.hair,P.ink,1.05);
  for(const side of [-1,1]){
    ellipse(c,side*(fw-.5),47,side<0?5.1:4.0,8,f.skin,P.ink,.9);
    line(c,[side*(fw+1),44,side*(fw-1),46,side*(fw+1),50],'rgba(90,51,40,.34)',.75);
  }
  function facePath(){
    c.beginPath();c.moveTo(-fw+2,30);c.bezierCurveTo(-fw-3,43,-fw+1,60,-11,chin-3);
    c.quadraticCurveTo(1,chin+4,12,chin-4);c.quadraticCurveTo(fw+1,60,fw,43);
    c.bezierCurveTo(fw+1,19,-12,15,-fw+2,30);c.closePath();
  }
  facePath();c.fillStyle=f.skin;c.fill();c.strokeStyle=P.ink;c.lineWidth=1.1;c.stroke();
  c.save();c.clip();
  c.fillStyle=gradient(c,-fw,32,fw*2,20,'rgba(255,229,188,.20)','rgba(80,45,34,.17)');c.fillRect(-30,18,60,62);
  if(dose>0){c.fillStyle=`rgba(220,224,198,${dose*.22})`;c.fillRect(-30,18,60,62);}
  ellipse(c,-10,55,7,3,`rgba(157,78,60,${.12*(1-dose*.6)})`);
  ellipse(c,13,53,5,2.8,`rgba(157,78,60,${.11*(1-dose*.6)})`);c.restore();
  // Broad, seed-specific hair masses survive downsampling to 48 px.
  c.beginPath();c.moveTo(-fw,46);c.bezierCurveTo(-fw-11,18,6,8,fw,29);
  if(f.style===0){c.quadraticCurveTo(7,27,-9,35);c.lineTo(-fw+3,49);}
  else if(f.style===1){c.lineTo(12,32);c.lineTo(5,28);c.lineTo(-3,36);c.lineTo(-10,31);c.lineTo(-fw+2,48);}
  else if(f.style===2){c.quadraticCurveTo(5,22,-13,32);c.lineTo(-fw+2,47);}
  else{c.quadraticCurveTo(15,40,4,34);c.lineTo(-10,31);c.lineTo(-fw+1,49);}
  c.closePath();c.fillStyle=f.hair;c.fill();c.strokeStyle=P.ink;c.lineWidth=1.05;c.stroke();
  line(c,[-15,27,-8,23,1,22],'rgba(255,230,185,.25)',1.15);
  if(f.style===1)line(c,[-11,28,-5,24,5,25],'rgba(255,230,185,.16)',.8);
  if(dose>0){
    // A sparse temple, never a new hairstyle or a changed identity palette.
    c.save();c.globalAlpha*=dose*.65;poly(c,[-fw+1,35,-fw+6,31,-fw+5,41,-fw+1,46],f.skin,null);
    line(c,[-fw+3,34,-fw+4,39],f.hair,.7);c.restore();
  }
  if(f.beard){
    c.beginPath();c.moveTo(-16,55);c.quadraticCurveTo(-9,60,-2,61);c.quadraticCurveTo(7,63,17,55);
    c.quadraticCurveTo(16,73,4,77);c.quadraticCurveTo(-12,76,-16,55);c.closePath();c.fillStyle=f.hair;c.fill();
    line(c,[-9,65,-7,70],'rgba(244,224,182,.17)',.8);line(c,[10,65,7,72],'rgba(244,224,182,.17)',.8);
  }
  // Eye placement and lids move with morale; low morale is tired, not monstrous.
  const eyeY=45+tired*1.9,pupilY=eyeY+tired*1.25,open=2.0-tired*.8;
  for(const [ex,rx]of [[-8,3.9],[11,3.2]]){
    if(tired>0)ellipse(c,ex,eyeY+3.5,rx+1.3,1.5,`rgba(79,64,63,${tired*.25})`);
    ellipse(c,ex,eyeY,rx,open,'#e1d6b8',null);ellipse(c,ex+.7,pupilY,1.45,1.8-tired*.6,'#373837');
    line(c,[ex-rx,eyeY-.8,ex,eyeY-1.6+happy*.6,ex+rx,eyeY-.7],P.ink,.85);
    const inner=ex<0?1:-1;
    line(c,[ex-rx,eyeY-5+(inner<0?tired*-1.1:happy*.6),ex,eyeY-5.8,ex+rx,eyeY-5+(inner>0?tired*-1.1:happy*.6)],f.hair,1.35);
  }
  // Bridge, wing and nose are soft contours, not a dark outline across the face.
  const nose=4+(f.nose-.055)*55;
  line(c,[3,43,2,52,2+nose,54,7,56],'rgba(103,63,43,.44)',.8);
  line(c,[5,54,8,54],'rgba(255,228,185,.30)',.75);
  const my=63+tired*1.1;
  c.beginPath();c.moveTo(-4,my);c.quadraticCurveTo(3,my+happy*4-tired*1.7,10,my-.7);c.strokeStyle=f.beard?'#bc9a80':'#805946';c.lineWidth=1.15;c.lineCap='round';c.stroke();
  if(happy>.45)line(c,[-1,my+1,7,my+.6],'#e9d7b2',.8);
  if(elder){
    for(const [ex,sgn]of [[-12,-1],[15,1]]){line(c,[ex,48,ex+sgn*3,49],'rgba(95,70,56,.36)',.65);line(c,[ex,51,ex+sgn*2,52],'rgba(95,70,56,.30)',.55);}
    line(c,[-7,36,1,35,9,36],'rgba(95,70,56,.25)',.65);line(c,[-9,38,2,37],'rgba(95,70,56,.23)',.55);
  }
  if(f.glasses){
    for(const [ex,rx]of [[-8,6.9],[11,6]])ellipse(c,ex,eyeY,rx,5.5,'rgba(211,224,209,.07)',P.inkSoft,.9);
    line(c,[-1,eyeY-.6,5,eyeY-.6],P.inkSoft,.9);line(c,[-15,eyeY-1,-fw,eyeY-3],P.inkSoft,.9);
  }
  if(opts.injured){poly(c,[-16,32,-4,29,-2,34,-14,37],'#ded4b8',P.ink,.5);line(c,[-12,32,-10,35],'#aa987b',.65);line(c,[-8,31,-6,34],'#aa987b',.65);}
  if(job==='digger'){
    c.beginPath();c.moveTo(-25,30);c.bezierCurveTo(-25,9,20,7,24,29);c.closePath();c.fillStyle='#c5a468';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.4;c.stroke();
    line(c,[-27,30,27,30],P.woodLight,4.4);line(c,[-2,13,-2,26],'#e0c58b',2.2);box(c,9,19,12,12,P.metalDark,2,P.ink,1);ellipse(c,16,25,3.6,3.7,'#ffe1a1',P.ink,.6);
  }
  if(job==='cook'){
    box(c,-22,20,44,12,'#e3d5b5',5,P.ink,.9);
    for(const [cx,cy,rx]of [[-15,18,10],[0,13,13],[15,17,10]])ellipse(c,cx,cy,rx,10,cx===0?P.ivory:P.cream,P.ink,.8);
    box(c,-22,26,44,7,'#c7b794',1.5,P.ink,.75);
  }
  c.restore();
  c.beginPath();c.roundRect(.7,.7,98.6,98.6,6.5);c.strokeStyle='#8b8c76';c.lineWidth=.7;c.stroke();c.restore();
}
