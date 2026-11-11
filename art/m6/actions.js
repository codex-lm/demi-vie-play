import { drawColonist, colonistFeatures, colonistOutfit } from '../colonist.js';
import { box, ellipse, line, poly, gradient } from '../primitives.js';
import { P, finite, identityOf, seedOf } from './common.js';

export const COLONIST_ACTIONS = Object.freeze(['reading','teaching','mourning','music','celebrating','listeningRock','carryingChild','climbingOut']);
const ageScale = age => age === 'child' ? .70 : age === 'elder' ? .95 : 1;

// The source renderer owns the face: clip a standing head, never a sleeping
// blanket or a separately invented portrait. Preserve seed, skin and hairstyle.
function residentHead(c,person,x,y,size,t) {
  const sc=ageScale(person.age);
  c.save();c.translate(x,y);c.scale(size,size);c.translate(0,1.53*sc);
  c.beginPath();c.rect(-.40*sc,-2.02*sc,.84*sc,.76*sc);c.clip();
  c.scale(.01,.01);drawColonist(c,0,0,100,{...person,pose:'idle',facing:1,t});c.restore();
}
function articulatedLimb(c,a,k,b,color,width) {
  line(c,[...a,...k,...b],P.ink,width+.035);
  line(c,[...a,...k,...b],color,width);
  line(c,[a[0]-.014,a[1],k[0]-.014,k[1]],'rgba(240,222,185,.16)',width*.23);
}
const ease=value=>{const p=Math.max(0,Math.min(1,value));return p*p*(3-2*p);};

/** Visual climb in place: the rungs travel down while alternate limbs regrip.
 * Contacts are locked to a rung during stance; the free foot lifts away first. */
export function sampleClimbingOut(t=0) {
  const phase=((finite(t)/1.8)%1+1)%1,spacing=.32;
  const contact=(offset,base,x,arc)=>{
    const p=(phase+offset)%1,u=ease((p-.68)/.32);
    return {x:x-Math.sin(u*Math.PI)*arc,y:base+p*spacing*2-u*spacing*2,planted:p<=.68};
  };
  return {phase,rungOffset:(phase*spacing*2)%spacing,spacing,
    hands:[contact(0,-1.82,.22,.08),contact(.5,-1.82,.72,.09)],
    feet:[contact(.5,-.54,.43,.16),contact(0,-.54,.68,.18)],
    bob:Math.cos(phase*Math.PI*4)*.018};
}

/** World actors move up an existing shaft. Planted contacts stay on its fixed
 * rungs (top + .20 + n * .34), irrespective of the actor's visual body scale. */
export function sampleWorldClimbingOut({top=0,feetY=0,bodyScale=1}={}) {
  const scale=Math.max(.25,finite(bodyScale,1)),spacing=.34/scale,base=-.54;
  const phase=(((finite(top)+.20-finite(feetY)-base*scale)/(.34*2))%1+1)%1;
  const firstRung=(finite(top)+.20-finite(feetY))/scale;
  const contact=(offset,y,x,arc)=>{
    const p=(phase+offset)%1,u=ease((p-.68)/.32);
    const reach=y+p*spacing*2-u*spacing*2;
    // Above the last available rung, keep pushing on that rung while the torso
    // rises through the hatch. Never invent ladder contacts in the open sky.
    return {x:x-Math.sin(u*Math.PI)*arc,y:Math.max(firstRung,reach),planted:p<=.68||reach<firstRung};
  };
  const handBase=base-Math.max(2,Math.round(1.28/spacing))*spacing;
  return {phase,spacing,
    hands:[contact(0,handBase,.29,.065),contact(.5,handBase,.70,.07)],
    feet:[contact(.5,base,.43,.13),contact(0,base,.68,.14)],
    bob:Math.cos(phase*Math.PI*4)*.018};
}

function climbingOut(c,p,t) {
  const sc=ageScale(p.age),pose=p.worldLadder?sampleWorldClimbingOut(p.worldLadder):sampleClimbingOut(t),f=colonistFeatures(p.seed,p.age);
  const suited=p.suit===true,skin=suited?'#4f6663':p.skin??f.skin;
  const colors=suited?['#a5a483','#cebf91','#737e6d']:colonistOutfit(p.job);
  c.save();c.scale(sc,sc);
  if(!p.worldLadder){
    line(c,[.16,.22,.16,-2.08],P.metalDark,.09);line(c,[.84,.22,.84,-2.08],P.metalDark,.09);
    c.save();c.beginPath();c.rect(.10,-2.08,.80,2.30);c.clip();
    for(let j=-1;j<9;j++)line(c,[.16,.10+pose.rungOffset-j*pose.spacing,.84,.10+pose.rungOffset-j*pose.spacing],P.metalLight,.045);
    c.restore();
  }
  const hip=[.48,-.76+pose.bob];
  for(let i=0;i<2;i++){
    const foot=pose.feet[i],ankle=[foot.x,foot.y-.09],knee=[foot.x-.20,(hip[1]+ankle[1])*.5-.015];
    articulatedLimb(c,[hip[0]+(i? .04:-.05),hip[1]],knee,ankle,i?colors[2]:suited?'#717c69':'#3e484b',suited?.18:.15);
    box(c,foot.x-.09,foot.y-.11,.21,.10,i?'#55524a':'#353638',.035,P.ink,.023);
    line(c,[foot.x-.075,foot.y-.012,foot.x+.12,foot.y-.012],i?'#a69a7c':'#6b6659',.025);
  }
  const shoulders=[[.34,-1.24+pose.bob],[.55,-1.22+pose.bob]];
  const arm=(i)=>{
    const h=pose.hands[i],a=shoulders[i],k=[i?.72:.12,(a[1]+h.y)*.5+.055];
    articulatedLimb(c,a,k,[h.x,h.y],i?colors[0]:colors[2],.135);
    line(c,[h.x+(k[0]-h.x)*.17,h.y+(k[1]-h.y)*.17,h.x,h.y],colors[1],.125);
    ellipse(c,h.x,h.y,.059,.063,skin,P.ink,.016);
    line(c,[h.x-.025,h.y-.027,h.x+.025,h.y-.027],'rgba(255,226,182,.35)',.016);
  };
  arm(0);
  c.save();c.translate(.44,pose.bob);
  if(suited){box(c,-.32,-1.23,.22,.50,'#697c70',.055);line(c,[-.30,-1.13,-.34,-.85],'#b2b89a',.04);}
  poly(c,[-.12,-1.34,.11,-1.33,.22,-1.20,.23,-.72,.12,-.66,-.17,-.70,-.20,-1.17],gradient(c,-.2,-1.3,.4,.6,colors[1],colors[0]),P.ink,.032);
  line(c,[.09,-1.24,.14,-.74],colors[2],.022);
  box(c,-.19,-.75,.42,.07,'#695342',.016,P.ink,.014);
  box(c,.06,-.735,.08,.05,'#c1ab76',.008,P.ink,.01);
  if(suited){
    line(c,[.02,-1.31,.02,-.72],'#596d61',.038);
    box(c,.08,-1.16,.13,.17,'#344e4f',.025);box(c,.10,-1.135,.09,.055,'#b3c5a3',.012,null);
    line(c,[-.17,-.88,.20,-.88],'#d9c797',.045);
    c.beginPath();c.moveTo(.12,-1.36);c.bezierCurveTo(.31,-1.28,.30,-1.02,.15,-1.02);c.strokeStyle='#435a58';c.lineWidth=.055;c.stroke();
  }else if(p.job==='none')poly(c,[-.11,-1.34,.12,-1.34,.09,-1.23,-.05,-1.24,-.11,-1.02,-.17,-1.08,-.12,-1.24],f.scarf,P.ink,.014);
  else{line(c,[-.12,-1.25,-.12,-.77],colors[2],.055);box(c,.02,-1.10,.14,.13,colors[0],.015,colors[2],.012);}
  line(c,[-.14,-.84,-.08,-.87],colors[2],.015);c.restore();
  residentHead(c,p,.49,-1.58+pose.bob,1/sc,t);
  arm(1);c.restore();
}

function carriedBaby(c,identity,t,adultSkin) {
  const child={...identityOf(identity),age:'child',job:'none'},f=colonistFeatures(child.seed,'child');
  const skin=child.skin??f.skin,sway=Math.sin(t*2)*.009;
  c.save();c.translate(0,sway);
  // A small swaddled newborn rests diagonally against the parent's chest. The
  // face uses the actual child's appearance; there are no dangling toddler legs.
  poly(c,[.24,-1.23,.43,-1.24,.62,-1.02,.68,-.89,.60,-.76,.45,-.76,.29,-.95,.18,-1.12],
    gradient(c,.20,-1.22,.46,.46,'#e2d9ba','#a8b5a3'),P.ink,.028);
  residentHead(c,child,.29,-1.23,.64,t);
  poly(c,[.19,-1.17,.30,-1.05,.58,-.80,.66,-.91,.48,-1.16],P.cream,P.ink,.018);
  line(c,[.24,-1.12,.50,-.93,.62,-.88],'#96a38c',.022);
  line(c,[.32,-.96,.52,-.84],f.scarf,.038);
  ellipse(c,.30,-1.10,.034,.038,skin,P.ink,.012);
  // The near forearm is painted last to make the support of the bundle clear.
  line(c,[.24,-.90,.43,-.88,.60,-.88],adultSkin,.082);
  ellipse(c,.59,-.89,.050,.044,adultSkin,P.ink,.012);
  c.restore();
}

function carriedChild(c,identity,t,adultSkin) {
  if(identity.lifeStage==='baby'){carriedBaby(c,identity,t,adultSkin);return;}
  const child={...identityOf(identity),age:'child'},f=colonistFeatures(child.seed,'child');
  const skin=child.skin??f.skin,colors=colonistOutfit(child.job),sway=Math.sin(t*2)*.012;
  c.save();c.translate(0,sway);
  // The far arm reaches behind the adult's neck; both legs hang separately.
  articulatedLimb(c,[.32,-1.22],[.19,-1.37],[-.055,-1.32],colors[2],.075);
  ellipse(c,-.055,-1.32,.038,.042,skin,P.ink,.012);
  articulatedLimb(c,[.34,-.94],[.24,-.75],[.19,-.49],colors[2],.105);
  articulatedLimb(c,[.47,-.94],[.66,-.77],[.57,-.53],colors[2],.115);
  for(const [bx,by]of [[.19,-.49],[.57,-.53]]){
    box(c,bx-.052,by-.062,.15,.084,'#635b50',.027,P.ink,.019);
    line(c,[bx-.042,by+.014,bx+.09,by+.014],'#c1ad89',.015);
  }
  poly(c,[.31,-1.27,.50,-1.26,.56,-1.12,.53,-.92,.30,-.92,.26,-1.11],gradient(c,.28,-1.26,.28,.35,colors[1],colors[0]),P.ink,.024);
  poly(c,[.32,-1.27,.46,-1.27,.47,-1.19,.35,-1.17],f.scarf,P.ink,.012);
  line(c,[.44,-1.15,.45,-.96],colors[2],.014);
  ellipse(c,.47,-1.07,.012,.013,P.cream);ellipse(c,.47,-1.00,.012,.013,P.cream);
  residentHead(c,child,.39,-1.42,.84,t);
  // Visible embrace, with the little hand resting on the adult's near shoulder.
  articulatedLimb(c,[.48,-1.20],[.27,-1.29],[.075,-1.30],colors[0],.082);
  line(c,[.14,-1.295,.075,-1.30],colors[1],.078);
  ellipse(c,.075,-1.30,.043,.041,skin,P.ink,.012);
  line(c,[.055,-1.31,.085,-1.32],'rgba(255,226,182,.32)',.01);
  // The parent's forearm cradles the seated hips, above the child's trousers.
  line(c,[.24,-.90,.43,-.89,.52,-.95],adultSkin,.075);
  ellipse(c,.50,-.94,.053,.047,adultSkin,P.ink,.012);
  c.restore();
}

function book(c,t) {
  c.save();c.translate(.43,-.80);c.rotate(-.14);
  poly(c,[-.28,-.17,-.02,-.11,.27,-.19,.29,.13,.02,.22,-.27,.15],P.woodDark,P.ink,.022);
  poly(c,[-.25,-.18,0,-.12,.25,-.19,.24,.10,0,.18,-.25,.12],P.cream,P.ink,.016);
  line(c,[0,-.11,0,.17],'#ab9471',.017);
  for(let i=0;i<4;i++) {line(c,[-.21,-.11+i*.052,-.055,-.07+i*.052],'#9f967b',.009);line(c,[.045,-.08+i*.052,.20,-.12+i*.052],'#9f967b',.009);}
  const leaf=(Math.sin(t*.9)+1)*.5;
  if(leaf>.8)poly(c,[0,-.12,.18*(1-(leaf-.8)*5),-.23,.18*(1-(leaf-.8)*5),.09,0,.18],'#ecdec1',null);
  line(c,[.16,.13,.17,.25],P.rust,.021);c.restore();
}
function candle(c,x,y,t) {
  ellipse(c,x,y+.02,.12,.036,P.metalDark,P.ink,.018);
  box(c,x-.05,y-.19,.10,.19,P.cream,.016,P.ink,.014);
  line(c,[x,y-.19,x,y-.23],P.ink,.012);
  ellipse(c,x+Math.sin(t*3)*.012,y-.27,.035,.065,P.amber);
  ellipse(c,x,y-.26,.016,.038,P.ivory);
}
function music(c,t) {
  c.save();c.translate(.31,-.91);c.rotate(-.23);
  // A modest four-string guitar, repaired along its lower bout.
  c.beginPath();c.moveTo(-.11,-.19);c.bezierCurveTo(-.33,-.16,-.25,.05,-.33,.16);
  c.bezierCurveTo(-.49,.39,-.03,.47,.07,.28);c.bezierCurveTo(.22,.15,-.03,.02,.08,-.12);c.closePath();
  c.fillStyle=gradient(c,-.35,-.15,.5,.5,P.woodLight,P.woodDark);c.fill();c.strokeStyle=P.ink;c.lineWidth=.025;c.stroke();
  line(c,[-.12,.18,.31,-.45],P.ink,.092);line(c,[-.12,.18,.31,-.45],P.woodDark,.06);
  box(c,.25,-.54,.14,.17,P.woodLight,.026,P.ink,.02);
  ellipse(c,-.10,.13,.063,.075,P.ink,P.woodLight,.018);
  line(c,[-.26,.32,-.10,.35],P.woodDark,.038);
  for(let i=0;i<4;i++)line(c,[-.25+i*.018,.31,.27+i*.015,-.47],'#ddca98',.006);
  for(let i=0;i<3;i++)line(c,[-.34+i*.035,.26,-.31+i*.035,.31],P.cream,.01);
  c.restore();
  const f=(t*.35)%1;
  c.save();c.globalAlpha*=Math.sin(f*Math.PI)*.6;
  line(c,[.78,-1.52-f*.25,.78,-1.73-f*.25,.9,-1.75-f*.25],P.amber,.024);
  ellipse(c,.735,-1.52-f*.25,.045,.027,P.amber);c.restore();
}

/** Draw an action using the existing resident renderer. Feet anchor x/y.
 * identity.cellPx sets pixels/metre (48 default), identity.facing mirrors all props.
 * identity.child can carry the real child's appearance; no input is modified. */
export function drawColonistAction(c,x,y,identity={},action='reading',t=0) {
  if(!c||![x,y].every(Number.isFinite))return;
  const p=identityOf(identity),s=p.cellPx,at=finite(t),a=COLONIST_ACTIONS.includes(action)?action:'reading';
  const scale=ageScale(p.age),facing=p.facing===-1?-1:1;
  const skin=p.skin??colonistFeatures(p.seed,p.age).skin;
  let pose='idle',target={x:.36,y:-.84};
  if(a==='reading'){pose='sit';target={x:.58,y:-.64};}
  if(a==='teaching'){pose='talk';target={x:.62,y:-1.19+Math.sin(at*1.4)*.055};}
  if(a==='mourning'){pose='crisis';target={x:.34,y:-.71};}
  if(a==='music'){pose='sit';target={x:.26,y:-.83+Math.sin(at*8)*.035};}
  if(a==='celebrating'){pose='talk';target={x:.30+Math.sin(at*2.7)*.07,y:-1.70};}
  if(a==='listeningRock'){target=p.listeningContact===false?{x:.23,y:-1.46}:{x:.49,y:-1.10};}
  if(a==='carryingChild'){pose='walk';target={x:.43,y:-.91};}
  if(a==='climbingOut'){pose='climb';target=null;}
  c.save();c.setLineDash([]);c.translate(x,y);c.scale(s*facing,s);
  if(a==='climbingOut'){climbingOut(c,p,at);c.restore();return;}
  if(a==='reading'||a==='music'){
    box(c,-.40,-.58,.54,.10,P.woodLight,.035,P.ink,.027);
    line(c,[-.31,-.49,-.34,0],P.woodDark,.08);line(c,[.04,-.49,.07,0],P.woodDark,.08);
  }
  c.save();if(a==='mourning')c.rotate(.035);
  if(a==='celebrating')c.translate(0,-Math.max(0,Math.sin(at*2.7))*.065);
  const drawBody=(withHandTarget=true)=>{
    c.save();c.scale(1/s,1/s);
    drawColonist(c,0,0,s,{...p,pose,t:at,facing:1,handTarget:withHandTarget&&target?{x:target.x*scale,y:target.y*scale}:undefined});
    c.restore();
  };
  if(a==='listeningRock'){
    // Turn the original head toward the viewer: the visible ear is then the
    // rightmost feature against the wall, rather than the nose. Both pieces
    // come from the same renderer and appearance, preserving face and helmet.
    c.save();c.beginPath();c.rect(-2,-1.31*scale,4,3);c.clip();drawBody();c.restore();
    c.save();c.translate(.07*scale,-1.31*scale);c.rotate(.18);c.scale(-1,1);c.translate(-.02*scale,1.31*scale);
    // Lower the unused arm in this head-only copy: its elbow would otherwise
    // rise into the neck clipping rectangle and create a stray ochre wedge.
    c.beginPath();c.rect(-.35*scale,-2.4*scale,.72*scale,1.11*scale);c.clip();drawBody(false);c.restore();
  }else drawBody();
  c.restore();
  c.save();c.scale(scale,scale);
  if(a==='reading')book(c,at);
  if(a==='teaching'){
    // Chalk is held at the actual near-hand target, no floating pointer.
    line(c,[target.x,target.y,target.x+.18,target.y-.14],P.cream,.027);
    ellipse(c,target.x,target.y,.051,.053,skin,P.ink,.012);
  }
  if(a==='mourning'){
    candle(c,.62,0,at);
    line(c,[.34,-.70,.47,-.66,.48,-.52],P.green,.023);
    for(let j=0;j<5;j++)ellipse(c,.46+Math.cos(j*1.256)*.035,-.70+Math.sin(j*1.256)*.035,.033,.023,P.cream);
    ellipse(c,.46,-.70,.018,.02,P.amber);
  }
  if(a==='music'){music(c,at);ellipse(c,target.x,target.y,.051,.048,skin,P.ink,.015);}
  if(a==='celebrating'){
    const yy=target.y-Math.max(0,Math.sin(at*2.7))*.065;
    box(c,target.x-.035,yy-.19,.15,.20,P.metal,.025,P.ink,.018);
    ellipse(c,target.x+.04,yy-.19,.071,.022,P.cream,P.ink,.01);
    ellipse(c,target.x+.13,yy-.09,.057,.062,'#75948b',P.ink,.016);
    ellipse(c,target.x+.13,yy-.09,.028,.033,P.rock);
    ellipse(c,target.x,yy,.05,.05,skin,P.ink,.012);
  }
  if(a==='listeningRock'){
    if(p.listeningContact===false){
      // The simulation can listen from a remote work stance. Cup the ear instead
      // of pretending that a wall exists beside the worker's hand.
      // Rejoin the forearm above the head/body clip used by this turned pose.
      line(c,[.31,-1.23,.25,-1.38,target.x,target.y],P.ink,.12);
      line(c,[.31,-1.23,.25,-1.38],colonistOutfit(p.job)[0],.09);
      line(c,[.25,-1.38,target.x,target.y],skin,.08);
      ellipse(c,target.x,target.y,.045,.072,skin,P.ink,.014);
      line(c,[target.x+.012,target.y-.035,target.x+.024,target.y+.025],'#976e56',.012);
    }else ellipse(c,.50,-1.10,.043,.075,skin,P.ink,.014);
  }
  if(a==='carryingChild'){
    const child=identityOf(identity?.child??{seed:seedOf(p.seed+701),age:'child',job:'none'});
    carriedChild(c,child,at,skin);
  }
  c.restore();c.restore();
}
