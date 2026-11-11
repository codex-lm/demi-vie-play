import {P,TAU,hash} from './palette.js';
import {box,ellipse,line,poly,gradient} from './primitives.js';

export const ANIMAL_KINDS=Object.freeze(['dog','chicken','hen','rabbit','badger','goat','bat','batColony']);

// Local human coordinates are those of colonist.js's torso, above the hip.
export function drawOutsideClothes(c,f,kind,t) {
  if(kind==='raider'){
    poly(c,[-.23,-.57,.17,-.58,.25,-.16,-.15,-.07], '#5d6458');
    line(c,[-.15,-.55,.17,-.10],'#aa9270',.085);
    poly(c,[-.30,-.53,-.16,-.62,-.02,-.51,-.08,-.33,-.29,-.36], '#87918a',P.ink,.032);
    for(let i=0;i<3;i++)line(c,[-.26+i*.065,-.50,-.24+i*.065,-.39],'#b4b8a3',.019);
    box(c,.07,-.35,.17,.20,'#7f6852',.025);line(c,[.09,-.27,.22,-.27],'#c4ae84',.026);
    // Bent pipe wrapped with cloth: an improvised club, held at the hand position.
    line(c,[.35,-.18,.50,-.63,.71,-.75],P.ink,.105);
    line(c,[.35,-.18,.50,-.63,.71,-.75],'#a2a69a',.062);
    for(let i=0;i<4;i++)line(c,[.33+i*.012,-.13-i*.047,.40+i*.012,-.11-i*.047],'#ad8767',.033);
    line(c,[.48,-.61,.53,-.63],'#e0d7b9',.022);
  }else{
    const cloth=kind==='strangerChild'?'#938c74':'#7f8880';
    c.beginPath();c.moveTo(-.13,-.65);c.quadraticCurveTo(-.40,-.60,-.36,-.23);
    c.lineTo(-.30,.23);c.lineTo(-.15,.19);c.lineTo(-.06,.25);c.lineTo(.03,.18);c.lineTo(.15,.22);c.lineTo(.29,.12);
    c.quadraticCurveTo(.23,-.30,.16,-.62);c.quadraticCurveTo(.06,-.48,-.13,-.65);c.closePath();
    c.fillStyle=gradient(c,-.3,-.6,.6,.8,'#b7b5a0',cloth);c.fill();c.strokeStyle=P.ink;c.lineWidth=.032;c.stroke();
    line(c,[-.11,-.60,.11,-.31,-.06,.20],'#d2c7a6',.045);
    line(c,[-.28,-.36,-.20,-.05,-.23,.15],'#626e68',.021);
    line(c,[.16,-.35,.18,-.06,.13,.14],'#626e68',.025);
    for(let i=0;i<4;i++)line(c,[-.27+i*.13,.17,-.25+i*.13,.23],'#d1c4a1',.018);
    box(c,-.29,-.05,.12,.13,'#8d7663',.008,'#bdad89',.014);
  }
}

export function drawOutsideMask(c,f,age) {
  c.save();c.translate(age==='elder'?.055:.015,age==='elder'?-.69:-.72);
  line(c,[-.19,-.16,.18,-.13],'#b7b2a0',.032);
  poly(c,[.02,-.14,.20,-.17,.29,-.10,.24,.025,.04,.035,-.015,-.035], '#636e66',P.ink,.025);
  ellipse(c,.20,-.035,.079,.068,'#344846','#a7b2a0',.022);
  for(let i=0;i<3;i++)line(c,[.165,-.07+i*.027,.235,-.07+i*.027],'#a7b2a0',.012);
  // A tied strip frames the exposed brow rather than changing the person's hair.
  line(c,[-.18,-.25,.15,-.28],'#985e4d',.057);poly(c,[-.19,-.25,-.34,-.21,-.24,-.14],'#985e4d');
  c.restore();
}

function leg(c,x,y,swing,color,width=.07){
  line(c,[x,y,x+swing*.35,y+(0-y)*.55,x+swing,-.035],P.ink,width+.035);
  line(c,[x,y,x+swing*.35,y+(0-y)*.55,x+swing,-.035],color,width);
  line(c,[x+swing-.02,-.025,x+swing+.07,-.025],P.ink,.045);
}
function dog(c,o){
  const t=o.t,walk=o.pose==='walk',sit=o.pose==='sit',bark=o.pose==='bark';
  const fur=['#a79474','#8f8473','#b2a387','#756d62'][Math.floor(hash(o.seed,31)*4)],dark='#5b554d',cream='#d2c3a4';
  const stride=walk?Math.sin(t*8)*.18:0,breath=Math.sin(t*2)*.008;
  ellipse(c,-.03,-.015,.57,.055,'rgba(8,13,16,.23)');
  const headY=sit?-.75:-.65,bodyY=sit?-.37:-.43+breath;
  line(c,[-.43,bodyY,-.68,bodyY-.15+Math.sin(t*(bark?13:4))*.06,-.73,bodyY-.28],dark,.095);
  if(sit){ellipse(c,-.27,-.20,.22,.23,fur,P.ink,.027);line(c,[-.34,-.045,-.10,-.025],dark,.09);}
  else{leg(c,-.32,bodyY,stride,dark,.073);leg(c,.25,bodyY,-stride,dark,.065);}
  ellipse(c,-.03,bodyY,sit?.27:.48,sit?.31:.19,fur,P.ink,.029);
  c.save();c.translate(-.03,bodyY);c.rotate(sit?-.7:0);ellipse(c,-.09,-.06,.25,.10,dark);c.restore();
  if(!sit)leg(c,-.38,bodyY,-stride,fur,.08);
  leg(c,.29,sit?-.47:bodyY,sit?0:stride,cream,.077);
  poly(c,[.20,bodyY-.04,.28,headY-.08,.44,headY-.06,.43,bodyY+.09],fur,P.ink,.025);
  ellipse(c,.37,headY,.20,.17,fur,P.ink,.025);
  poly(c,[.23,headY-.08,.20,headY-.29,.36,headY-.17],dark,P.ink,.022);
  poly(c,[.40,headY-.12,.44,headY-.28,.52,headY-.08],fur,P.ink,.022);
  const jaw=bark?.035+Math.max(0,Math.sin(t*12))*.065:.01;
  poly(c,[.42,headY-.02,.67,headY+.025,.65,headY+.09,.42,headY+.10],cream,P.ink,.023);
  if(bark){poly(c,[.46,headY+.09,.64,headY+.08,.57,headY+.11+jaw,.43,headY+.10+jaw],P.ink);line(c,[.46,headY+.105+jaw,.56,headY+.11+jaw],'#b67e76',.035);}
  ellipse(c,.65,headY+.027,.055,.035,P.ink);ellipse(c,.445,headY-.055,.023,.027,P.ink);ellipse(c,.451,headY-.064,.006,.007,P.ivory);
  if(o.domesticated===true){line(c,[.25,headY+.14,.42,headY+.19], '#ad6550',.065);ellipse(c,.34,headY+.23,.035,.04,'#d0b37a');}
  if(bark&&Math.sin(t*12)>.25){line(c,[.78,headY-.08,.87,headY-.11],'#b6b6a0',.025);line(c,[.82,headY+.03,.94,headY+.03],'#b6b6a0',.025);}
}
function chicken(c,o){
  const step=o.pose==='walk'?Math.sin(o.t*10)*.11:0,peck=o.pose==='idle'?Math.max(0,Math.sin(o.t*1.9))*.12:0;
  ellipse(c,0,-.012,.29,.035,'rgba(8,13,16,.23)');
  leg(c,-.10,-.23,step,'#b08c54',.026);leg(c,.12,-.23,-step,'#c1a36b',.025);
  poly(c,[-.22,-.30,-.44,-.57,-.35,-.55,-.22,-.43,-.30,-.62,-.18,-.57,-.07,-.33],'#6b6656',P.ink,.018);
  ellipse(c,0,-.34,.27,.20,'#d2c6a4',P.ink,.023);ellipse(c,-.06,-.35,.16,.11,'#aa9b7d',null);
  for(let i=0;i<3;i++)line(c,[-.17,-.38+i*.04,.05,-.35+i*.03],'#dad0b1',.019);
  c.save();c.translate(.18,-.45);c.rotate(peck*3);
  ellipse(c,.01,-.10,.105,.15,'#e0d2b0',P.ink,.018);poly(c,[.08,-.13,.21,-.09,.08,-.045],'#d1a663',P.ink,.015);
  for(let i=0;i<3;i++)ellipse(c,-.045+i*.046,-.24-Math.sin(i)*.015,.035,.055,'#ad6152');
  ellipse(c,.08,-.02,.028,.045,'#ad6152');ellipse(c,.053,-.143,.014,.016,P.ink);c.restore();
}
function rabbit(c,o){
  const walking=o.pose==='walk',q=(Math.sin(o.t*9)+1)*.5,bounce=walking?-Math.sin(q*Math.PI)*.065:0,fur=hash(o.seed,7)>.5?'#b5afa0':'#9c9380';
  ellipse(c,0,-.012,.34,.035,'rgba(8,13,16,.23)');
  ellipse(c,-.21,-.08,.16,.065,fur,P.ink,.02);ellipse(c,.19+(walking?q*.08:0),-.035,.12,.035,'#cfc7b3',P.ink,.017);
  ellipse(c,-.05,-.23+bounce,.30,.21,fur,P.ink,.024);ellipse(c,-.34,-.20+bounce,.083,.085,'#d4cdb9',P.ink,.019);
  c.save();c.translate(.22,-.31+bounce);c.rotate(walking?-.08:Math.sin(o.t*1.2)*.025);
  ellipse(c,.025,-.02,.14,.13,fur,P.ink,.023);
  for(const [x,a]of [[-.035,-.25],[.065,.12]]){c.save();c.translate(x,-.10);c.rotate(a);ellipse(c,0,-.16,.043,.18,fur,P.ink,.019);ellipse(c,0,-.16,.018,.13,'#bb9c91');c.restore();}
  ellipse(c,.09,-.055,.018,.021,P.ink);ellipse(c,.145,.015,.025,.018,'#bb9c91');line(c,[.12,.04,.22,.045],'#ddd2b7',.012);c.restore();
}
function badger(c,o){
  const walking=o.pose==='walk',stride=walking?Math.sin(o.t*7)*.10:0;
  const fur=hash(o.seed,29)>.5?'#8e9188':'#7b837d',dark='#394543',cream='#d7d0b5';
  const breath=Math.sin(o.t*1.8)*.008;
  ellipse(c,-.06,-.012,.61,.055,'rgba(8,13,16,.23)');
  line(c,[-.49,-.28,-.70,-.23,-.78,-.28],fur,.095);
  leg(c,-.34,-.26,stride,dark,.095);leg(c,.30,-.24,-stride,dark,.085);
  // Low, broad shoulders and a rounded rump distinguish it from the slim dog.
  ellipse(c,-.12,-.31+breath,.49,.255,fur,P.ink,.030);
  ellipse(c,.22,-.30+breath,.27,.21,fur,null);
  poly(c,[-.48,-.23,-.15,-.12,.28,-.14,.41,-.25,.19,-.22,-.12,-.18],dark,null);
  line(c,[-.46,-.43,-.25,-.51,.02,-.49,.25,-.42],'#b8b8a5',.043);
  if(o.cellPx>=30)for(let i=0;i<7;i++)line(c,[-.43+i*.085,-.43+Math.sin(i*.6)*.035,-.38+i*.085,-.35+Math.sin(i*.6)*.025],'#b2b4a5',.016);
  leg(c,-.39,-.22,-stride,dark,.11);leg(c,.26,-.20,stride,dark,.095);
  for(const x of [-.39-stride,.26+stride])for(let i=0;i<3;i++)line(c,[x+.025+i*.021,-.035,x+.06+i*.022,-.015],cream,.014);
  c.save();c.translate(.38,-.30+breath);c.rotate(walking?-.04:Math.sin(o.t*1.5)*.025);
  ellipse(c,-.06,-.17,.085,.092,dark,P.ink,.018);ellipse(c,-.055,-.177,.045,.047,cream);
  // The long cream wedge carries the characteristic black eye-to-ear stripe.
  poly(c,[-.18,-.14,.00,-.24,.20,-.13,.44,.025,.39,.12,.17,.12,-.08,.07,-.18,-.02],cream,P.ink,.026);
  poly(c,[-.14,-.12,-.01,-.18,.19,-.07,.31,.035,.17,.055,.025,-.015,-.11,-.035],dark,null);
  line(c,[-.03,-.205,.12,-.125,.28,-.015],'#f0e6cb',.042);
  ellipse(c,.15,-.045,.023,.022,P.ink);ellipse(c,.156,-.053,.006,.006,P.ivory);
  ellipse(c,.42,.036,.047,.035,P.ink);
  line(c,[.30,.092,.39,.088],'#6d7567',.017);
  line(c,[.27,.07,.42,.12],'#aaa992',.010);line(c,[.27,.065,.44,.065],'#aaa992',.010);
  c.restore();
}
function goat(c,o){
  const stride=o.pose==='walk'?Math.sin(o.t*7)*.14:0,fur=hash(o.seed,15)>.5?'#b7b29b':'#c9c3a9',dark='#77766b';
  ellipse(c,-.03,-.015,.56,.055,'rgba(8,13,16,.22)');leg(c,-.32,-.42,stride,dark);leg(c,.25,-.42,-stride,dark);
  line(c,[-.43,-.66,-.59,-.77],'#d4ceb4',.075);ellipse(c,-.03,-.56,.48,.25,fur,P.ink,.028);
  poly(c,[-.25,-.48,.06,-.30,.22,-.40,.12,-.47], '#aaab92',null);
  leg(c,-.37,-.47,-stride,fur,.08);leg(c,.29,-.50,stride,fur,.075);
  poly(c,[.20,-.57,.26,-.96,.43,-1.03,.56,-.87,.45,-.49],fur,P.ink,.026);
  ellipse(c,.42,-.94,.16,.19,fur,P.ink,.025);poly(c,[.45,-.94,.68,-.88,.66,-.75,.49,-.75],fur,P.ink,.023);
  poly(c,[.50,-.76,.56,-.58,.46,-.63,.43,-.79],dark,P.ink,.019);
  line(c,[.31,-1.05,.20,-1.25,.22,-1.36],'#8e8772',.052);line(c,[.43,-1.08,.36,-1.30,.40,-1.39],'#b9ad90',.055);
  poly(c,[.33,-.99,.12,-1.06,.19,-.92,.31,-.89],dark,P.ink,.018);ellipse(c,.49,-.94,.023,.019,P.ink);ellipse(c,.65,-.84,.02,.014,P.ink);
}
function bat(c,o){
  const hanging=o.pose==='hang'||o.pose==='hanging'||o.pose==='idle';
  if(hanging){
    line(c,[-.035,0,-.045,.08,.015,.11,.055,.015],'#a9a394',.025);
    ellipse(c,0,.30,.15,.25,'#75696b',P.ink,.022);
    poly(c,[-.03,.08,-.19,.20,-.15,.46,0,.57,.14,.43,.17,.20,.04,.08],'#5e5661','#9c8b8e',.024);
    line(c,[-.08,.17,-.10,.37,0,.52,.08,.25],'#af9695',.019);
    ellipse(c,.01,.48,.10,.09,'#8d7771',P.ink,.018);poly(c,[-.08,.49,-.12,.61,-.01,.55],'#8d7771',P.ink,.015);poly(c,[.055,.51,.11,.62,.10,.47],'#8d7771',P.ink,.015);
    ellipse(c,-.025,.51,.014,.014,'#d6bcb0');ellipse(c,.055,.51,.014,.014,'#d6bcb0');
  }else{
    const flap=Math.sin(o.t*12+hash(o.seed,3)*TAU),tip=-.14+flap*.32;
    for(const side of [-1,1]){c.save();c.scale(side,1);c.beginPath();c.moveTo(.05,-.13);c.quadraticCurveTo(.30,-.45,.64,tip);c.quadraticCurveTo(.44,tip+.02,.42,.13);c.quadraticCurveTo(.29,-.01,.23,.18);c.quadraticCurveTo(.12,.03,.04,.15);c.closePath();c.fillStyle='#635d6d';c.fill();c.strokeStyle='#b0a29c';c.lineWidth=.021;c.stroke();line(c,[.06,-.10,.29,-.20,.64,tip],'#98908f',.017);line(c,[.29,-.20,.42,.13],'#8d7f88',.016);line(c,[.29,-.20,.23,.18],'#8d7f88',.015);c.restore();}
    ellipse(c,0,-.02,.09,.19,'#7e6d6b',P.ink,.022);ellipse(c,0,-.19,.10,.085,'#8d7771',P.ink,.02);
    poly(c,[-.08,-.20,-.10,-.34,-.015,-.26],'#8d7771');poly(c,[.02,-.26,.10,-.34,.08,-.19],'#8d7771');
    ellipse(c,-.04,-.20,.013,.016,P.ink);ellipse(c,.04,-.20,.013,.016,P.ink);
  }
}

/** Same anchor and units as drawColonist; hanging bats attach their feet to x/y. */
export function drawOutsideAnimal(c,x,y,cellPx,opts={}){
  if(!c||![x,y,cellPx].every(Number.isFinite)||cellPx<=0)return;
  const kind=opts.kind==='hen'?'chicken':opts.kind==='batColony'?'bat':opts.kind;
  const drawer={dog,chicken,rabbit,badger,goat,bat}[kind];if(!drawer)return;
  const o={...opts,cellPx,seed:Number.isFinite(opts.seed)?opts.seed|0:1,t:Number.isFinite(opts.t)?opts.t:0};
  c.save();c.translate(x,y);c.scale(cellPx*(opts.facing===-1?-1:1),cellPx);c.lineCap='round';c.lineJoin='round';drawer(c,o);c.restore();
}
