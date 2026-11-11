import {P, TAU, clamp} from './palette.js';
import {box, ellipse, line, poly, gradient, halo} from './primitives.js';

export const FIND_TYPES=Object.freeze(['fossil','coin','pipe','bones','bottle','toy','photo']);
// Preserve the original gallery set; the complete catalogue includes M6B's relics.
export const LAB_FIND_TYPES=Object.freeze([
  'labChalkBox','labEnamelCup','labSeedEnvelope','labRepairNotebook','labCopperBell',
  'labDoorHinge','labCleanFlask','labTinSoldier','labRecipeCard','labWoodenFrame',
  'labCoalPencil','labSpareFuse','labMarbleBag','labGardenLabel','labBicycleChain',
  'labSealedBandage','labClayWhistle','labPreservedBeans','labPocketDictionary','labBrassKey',
]);
export const ALL_FIND_TYPES=Object.freeze([...FIND_TYPES,...LAB_FIND_TYPES]);
export const SOUVENIR_TYPES=Object.freeze(['recipeBook','minerJournal','guitar','helmet','letters','medal','drawing']);

// Bottom-centre anchors, metres internally. The objects are slightly enlarged
// illustrations so their defining contours survive at 40 px/m (zoom 2).
function local(c,x,y,cell,draw){
  if(!c||![x,y,cell].every(Number.isFinite)||cell<=0)return;
  c.save();c.translate(x,y);c.scale(cell,cell);draw();c.restore();
}
function fossil(c){
  poly(c,[-.53,-.06,-.58,-.36,-.33,-.75,.14,-.79,.52,-.55,.49,-.09,.2,0],gradient(c,-.5,-.7,1,.7,'#8f9381','#5b706c'),P.ink,.035);
  ellipse(c,.01,-.39,.31,.31,'#c4b68e','#514f41',.035);
  const p=[];for(let i=0;i<=65;i++){const a=i/65*TAU*2.1,r=.285*(1-i/70);p.push(.01+Math.cos(a)*r,-.39+Math.sin(a)*r);}
  line(c,p,'#6c6550',.032);
  for(let i=0;i<12;i++){const a=i/12*TAU;line(c,[.01+Math.cos(a)*.24,-.39+Math.sin(a)*.24,.01+Math.cos(a)*.30,-.39+Math.sin(a)*.30],'#8b7b5b',.018);}
  line(c,[-.44,-.2,-.35,-.13,-.20,-.17],'#a8ac98',.024);
}
function coin(c){
  ellipse(c,0,-.34,.34,.34,'#6f653f',P.ink,.028);
  ellipse(c,-.025,-.36,.30,.30,gradient(c,-.3,-.66,.6,.6,'#dfc786','#9c814e'),'#c5b076',.025);
  ellipse(c,-.025,-.36,.24,.24,'rgba(0,0,0,0)','#897449',.018);
  // A worn profile and two laurel branches, with no invented lettering.
  poly(c,[-.08,-.49,.035,-.54,.105,-.47,.10,-.40,.16,-.36,.10,-.32,.075,-.23,-.12,-.23,-.06,-.33,-.12,-.39],'#af9159',null);
  for(const s of [-1,1])for(let i=0;i<4;i++){
    const a=s*(.68+i*.33);ellipse(c,Math.sin(a)*.21,-.36+Math.cos(a)*.20,.025,.038,'#e4ca84');
  }
}
function pipe(c){
  line(c,[-.51,-.12,.16,-.12,.16,-.57,.48,-.57],P.ink,.24);
  line(c,[-.51,-.13,.16,-.13,.16,-.58,.48,-.58],'#90684f',.19);
  line(c,[-.49,-.19,.10,-.19,.10,-.62,.45,-.62],'#b7a18a',.038);
  for(const [x,y]of [[-.34,-.13],[.16,-.37],[.35,-.58]]){
    box(c,x-.065,y-.14,.13,.28,'#7b8b7b',.025,P.ink,.022);line(c,[x-.035,y-.12,x-.035,y+.1],'#a2b29b',.018);
  }
  ellipse(c,.50,-.58,.055,.10,'#293e3c','#ad8060',.035);
  ellipse(c,-.12,-.12,.058,.045,'#bb8260');
}
function bone(c,x,y,a,s=1){
  c.save();c.translate(x,y);c.rotate(a);c.scale(s,s);
  line(c,[-.27,0,.27,0],P.ink,.105);line(c,[-.27,0,.27,0],'#d9d0ad',.072);
  for(const end of [-.27,.27])for(const yy of [-.038,.038])ellipse(c,end,yy,.055,.05,'#ddd5b7',P.inkSoft,.012);
  c.restore();
}
function bones(c){
  bone(c,-.17,-.10,-.26,1.2);bone(c,.19,-.15,.36,.9);
  ellipse(c,.07,-.48,.24,.26,'#d3cbb0',P.ink,.025);
  box(c,-.075,-.32,.28,.13,'#c6bfa4',.035,P.inkSoft,.017);
  for(const x of [-.025,.15])ellipse(c,x,-.48,.067,.076,'#4c5550');
  poly(c,[.06,-.41,.025,-.34,.10,-.34],'#62665a',null);
  for(let i=0;i<4;i++)line(c,[-.038+i*.058,-.29,-.038+i*.058,-.20],'#777b69',.014);
  line(c,[-.05,-.69,.02,-.60,-.02,-.55],'#8e9380',.015);
}
function bottle(c){
  c.beginPath();c.moveTo(-.09,-.91);c.lineTo(.09,-.91);c.lineTo(.09,-.67);c.bezierCurveTo(.12,-.60,.24,-.59,.24,-.45);c.lineTo(.24,-.06);c.quadraticCurveTo(.24,0,.16,0);c.lineTo(-.16,0);c.quadraticCurveTo(-.24,0,-.24,-.06);c.lineTo(-.24,-.45);c.bezierCurveTo(-.24,-.59,-.12,-.60,-.09,-.67);c.closePath();
  c.fillStyle=gradient(c,-.25,-.8,.5,.7,'#739f91','#355e59');c.fill();c.strokeStyle=P.ink;c.lineWidth=.025;c.stroke();
  box(c,-.125,-.91,.25,.065,'#8fb4a4',.02,P.ink,.018);
  line(c,[-.10,-.77,-.10,-.66,-.17,-.52,-.17,-.13],'#bfd4b4',.026);
  poly(c,[-.2,-.41,.20,-.42,.20,-.18,-.12,-.15,-.20,-.22],'#d4c39c',P.inkSoft,.014);
  ellipse(c,.025,-.28,.07,.08,'#9a6651');
  line(c,[-.16,-.07,.12,-.07],'#7da08c',.025);
}
function toy(c){
  // Repaired teddy: rounded ears, muzzle, a patch and a missing button eye.
  ellipse(c,0,-.30,.22,.27,'#b38c69',P.ink,.028);
  for(const s of [-1,1]){
    ellipse(c,s*.18,-.71,.10,.105,'#a98364',P.ink,.025);
    ellipse(c,s*.18,-.71,.055,.06,'#c9a581');
    ellipse(c,s*.25,-.34,.09,.19,'#a58061',P.ink,.024);
    ellipse(c,s*.17,-.08,.12,.10,'#be9972',P.ink,.024);
  }
  ellipse(c,0,-.60,.23,.22,'#b99470',P.ink,.025);
  ellipse(c,0,-.52,.115,.08,'#d8b28a');
  ellipse(c,-.08,-.64,.028,.028,P.ink);
  line(c,[.05,-.67,.10,-.61,.05,-.61,.10,-.67],P.ink,.02);
  ellipse(c,0,-.55,.033,.024,'#544a3f');line(c,[0,-.53,0,-.49,.04,-.48],P.inkSoft,.015);
  box(c,-.1,-.35,.18,.16,'#769087',.025,P.inkSoft,.017);
  for(let i=0;i<3;i++)line(c,[-.12+i*.07,-.35,-.08+i*.07,-.32],'#d6c5a1',.013);
}
function photo(c){
  c.save();c.rotate(-.09);
  poly(c,[-.38,-.78,.36,-.78,.39,-.02,-.37,0],'#d1c4a3',P.ink,.026);
  box(c,-.31,-.70,.60,.52,'#6c7c73',.01,null);
  for(const [x,y,s]of [[-.16,-.48,1],[.13,-.48,1],[0,-.32,.64]]){
    ellipse(c,x,y,.078*s,.092*s,'#c3c0a3');poly(c,[x-.11*s,y+.09*s,x+.11*s,y+.09*s,x+.15*s,-.19,x-.14*s,-.19],'#a4ad98',null);
  }
  line(c,[.23,-.75,.14,-.58,.21,-.42,.13,-.21,.19,-.03],'#b0a88f',.015);
  c.restore();
}

// Small recovered things, painted at the same metre scale as the original seven.
// Each silhouette comes from FIND_TEXT_EXTRA; scuffs are drawn, never randomised.
function chalkBox(c){
  poly(c,[-.45,-.46,.37,-.51,.43,-.08,-.38,-.04],'#697c70',P.ink,.028);
  poly(c,[-.45,-.46,-.34,-.78,.34,-.81,.37,-.51],'#9caa8c',P.ink,.025);
  line(c,[-.30,-.72,.28,-.75],'#d6cb9f',.03);
  box(c,-.34,-.43,.66,.29,'#303d39',.015,P.ink,.02);
  for(const [x,h,color]of [[-.25,.25,'#e9dfbf'],[-.09,.18,'#c7b58c'],[.07,.23,'#c9d0bf']]){
    box(c,x,-.40,.105,h,color,.02,'#8c8f78',.015);
    line(c,[x+.025,-.37,x+.025,-.40+h-.035],'#f4e9ca',.012);
  }
  poly(c,[.25,-.15,.34,-.18,.39,-.06,.30,-.04],'#e6d9b7',P.inkSoft,.015);
  for(const [x,y]of [[-.43,-.025],[.20,-.02],[.47,-.08]])ellipse(c,x,y,.025,.018,'#cfc5a5');
}
function enamelCup(c){
  ellipse(c,.28,-.38,.20,.22,'rgba(0,0,0,0)',P.ink,.10);
  ellipse(c,.28,-.39,.18,.19,'rgba(0,0,0,0)','#799b96',.065);
  box(c,-.35,-.63,.57,.57,gradient(c,-.35,-.63,.57,.57,'#d1d8bc','#789c94'),.09,P.ink,.03);
  ellipse(c,-.065,-.63,.285,.085,'#385e5b','#d9debf',.035);
  line(c,[-.27,-.52,-.27,-.20,-.21,-.15],'#ece5c5',.028);
  // A worn label and chipped enamel; no invented lettering at this tiny scale.
  box(c,-.17,-.43,.25,.15,'#e6dcc0',.025,null);
  for(let i=0;i<3;i++)line(c,[-.13+i*.064,-.39,-.13+i*.064,-.32],'#697b72',.015);
  poly(c,[.16,-.13,.20,-.22,.22,-.08,.09,-.07],'#79614b',null);
}
function seedEnvelope(c){
  box(c,-.44,-.57,.88,.53,'#6e6150',.025,P.ink,.026);
  poly(c,[-.44,-.57,-.32,-.77,.39,-.79,.44,-.57],'#9d8a66',P.ink,.022);
  c.save();c.rotate(-.09);
  poly(c,[-.29,-.73,.24,-.73,.27,-.17,-.27,-.15],'#ded0a3',P.ink,.022);
  line(c,[-.29,-.73,-.02,-.55,.24,-.73],'#a99a73',.018);
  line(c,[-.02,-.26,-.02,-.45],'#6e8663',.026);
  ellipse(c,-.075,-.42,.065,.035,'#839575');ellipse(c,.035,-.48,.065,.035,'#839575');
  c.restore();
  for(const [x,y]of [[.29,-.17],[.38,-.11],[.22,-.06]])ellipse(c,x,y,.04,.026,'#b89b5e',P.inkSoft,.012);
}
function repairNotebook(c){
  box(c,-.39,-.84,.77,.79,'#506c68',.035,P.ink,.027);
  box(c,-.27,-.77,.57,.65,'#d0c4a3',.015,P.inkSoft,.015);
  for(let i=0;i<5;i++)line(c,[-.43,-.73+i*.13,-.31,-.73+i*.13],'#aeb69d',.026);
  // Pump section, pipe and repair notes, with oily corners.
  box(c,-.12,-.56,.20,.25,'#849187',.018,'#5a6e65',.018);
  line(c,[-.02,-.63,-.02,-.38,.15,-.38,.15,-.27],'#536d66',.024);
  line(c,[-.10,-.63,.14,-.63],'#536d66',.025);
  ellipse(c,.08,-.19,.10,.035,'#ac9e7d');
  for(let i=0;i<3;i++)line(c,[.14,-.52+i*.07,.24,-.52+i*.07],'#9b947b',.012);
  poly(c,[.24,-.77,.30,-.77,.30,-.64,.25,-.68],'#9b8b67',null);
}
function copperBell(c){
  ellipse(c,0,-.77,.075,.10,'rgba(0,0,0,0)','#c59b61',.035);
  c.beginPath();c.moveTo(-.34,-.17);c.quadraticCurveTo(-.18,-.31,-.20,-.53);c.quadraticCurveTo(-.19,-.73,0,-.72);c.quadraticCurveTo(.19,-.73,.20,-.53);c.quadraticCurveTo(.18,-.31,.34,-.17);c.closePath();
  c.fillStyle=gradient(c,-.3,-.7,.6,.6,'#d5a26a','#8c684a');c.fill();c.strokeStyle=P.ink;c.lineWidth=.025;c.stroke();
  ellipse(c,0,-.17,.35,.09,'#715b41','#d3aa6f',.032);
  ellipse(c,0,-.12,.065,.07,'#c29c61',P.ink,.02);
  line(c,[-.12,-.56,-.14,-.37,-.22,-.23],'#efd093',.027);
  poly(c,[.12,-.53,.19,-.47,.18,-.37,.13,-.40],'#7e9880',null);
}
function hinge(c,x,y,a){
  c.save();c.translate(x,y);c.rotate(a);
  box(c,-.25,-.21,.50,.42,'#9b8065',.025,P.ink,.024);
  box(c,-.045,-.25,.09,.50,'#b7a487',.02,P.ink,.018);
  for(const yy of [-.15,0,.15])line(c,[-.04,yy,.04,yy],'#726a57',.015);
  for(const xx of [-.17,.17])for(const yy of [-.12,.12])ellipse(c,xx,yy,.034,.034,'#384d48','#b6a280',.012);
  c.restore();
}
function doorHinge(c){hinge(c,-.14,-.48,-.18);hinge(c,.24,-.23,.22);}
function cleanFlask(c){
  line(c,[-.11,-.80,-.35,-.65,-.38,-.29,-.27,-.10],'#837666',.038);
  box(c,-.27,-.74,.54,.70,gradient(c,-.27,-.74,.54,.70,'#ca9c98','#986e73'),.15,P.ink,.03);
  box(c,-.12,-.91,.24,.20,'#8d8d80',.025,P.ink,.025);
  box(c,-.13,-.81,.26,.055,'#d2c6a5',.01,P.inkSoft,.012);
  for(const x of [-.075,0,.075])line(c,[x,-.89,x,-.84],'#bebba2',.013);
  line(c,[-.18,-.62,-.18,-.26,-.13,-.18],'#edcbc0',.028);
  ellipse(c,.04,-.39,.105,.13,'#d8bbb0','#aa8182',.018);
  line(c,[-.025,-.41,.04,-.48,.10,-.41,.04,-.32,-.025,-.41],'#799691',.022);
}
function tinSoldier(c){
  // Empty open hand, no weapon: a survivor of a toy's first career.
  for(const s of [-1,1]){
    line(c,[s*.075,-.37,s*.10,-.13,s*.15,-.06],'#8a9d91',.115);
    box(c,s<0?-.22:.055,-.075,.19,.075,'#5c7068',.02,P.ink,.018);
  }
  poly(c,[-.15,-.67,.15,-.67,.12,-.34,-.12,-.34],'#6b8b7f',P.ink,.026);
  line(c,[-.18,-.61,-.27,-.41,-.32,-.47],'#9bac98',.085);
  line(c,[.16,-.60,.24,-.43,.29,-.50],'#9bac98',.085);
  ellipse(c,0,-.78,.12,.13,'#bbc1a4',P.ink,.022);
  box(c,-.16,-.89,.32,.10,'#7d9184',.035,P.ink,.02);
  line(c,[-.14,-.84,.17,-.84],'#aec0a5',.025);
  line(c,[-.12,-.45,.12,-.45],'#c7ba8c',.035);
  for(const y of [-.59,-.52])ellipse(c,0,y,.019,.019,'#d0c89f');
}
function recipeCard(c){
  c.save();c.rotate(.09);
  box(c,-.43,-.71,.86,.66,'#d9c79e',.025,P.ink,.025);
  line(c,[-.31,-.61,.29,-.61],'#ab7960',.028);
  ellipse(c,-.12,-.37,.18,.065,'#796c4c','#ba9d6a',.02);
  poly(c,[-.30,-.37,.06,-.37,.02,-.22,-.25,-.22],'#82968a',P.inkSoft,.018);
  for(const x of [-.20,-.10])line(c,[x,-.43,x-.02,-.49,x+.01,-.54],'#b5a481',.018);
  for(let i=0;i<4;i++)line(c,[.15,-.47+i*.075,.32,-.47+i*.075],'#a69a78',.015);
  ellipse(c,-.32,-.16,.035,.025,'#b39b73');c.restore();
}
function woodenFrame(c){
  c.save();c.rotate(-.075);
  box(c,-.45,-.88,.90,.84,'#8d6d4e',.025,P.ink,.03);
  box(c,-.34,-.77,.68,.62,'#1b3030',.008,'#bd9a68',.03);
  line(c,[-.41,-.83,.40,-.83],'#c1a070',.025);
  line(c,[-.39,-.14,-.39,-.76],'#b08c61',.02);
  for(const [x,y,dx,dy]of [[-.44,-.87,.11,.11],[.44,-.87,-.11,.11],[-.44,-.05,.11,-.11],[.44,-.05,-.11,-.11]])line(c,[x,y,x+dx,y+dy],'#624f3d',.018);
  line(c,[.39,-.51,.40,-.35,.37,-.24],'#71513d',.015);c.restore();
}
function coalPencil(c){
  // The slightly square sun was drawn before the charcoal joined the stock.
  poly(c,[-.43,-.49,-.37,-.78,.09,-.84,.40,-.60,.37,-.14,-.36,-.10],'#797e6b',P.inkSoft,.02);
  box(c,-.15,-.62,.25,.23,'rgba(0,0,0,0)',.035,'#444e43',.03);
  for(const [x,y,xx,yy]of [[-.03,-.71,-.03,-.76],[-.03,-.30,-.03,-.25],[-.25,-.50,-.30,-.50],[.19,-.50,.25,-.50]])line(c,[x,y,xx,yy],'#444e43',.026);
  poly(c,[-.41,-.11,.24,-.35,.36,-.28,-.28,0],'#303e36',P.ink,.025);
  line(c,[-.31,-.095,.23,-.29],'#687361',.025);
  poly(c,[-.41,-.11,-.28,0,-.47,.035],'#202e2a',null);
}
function spareFuse(c){
  poly(c,[-.36,-.84,.29,-.80,.39,-.10,-.34,-.03],'rgba(181,202,177,.20)','#91a99c',.02);
  line(c,[-.32,-.76,.27,-.73],'#bccdb2',.03);
  c.save();c.rotate(.18);
  box(c,-.115,-.63,.23,.47,'rgba(159,193,174,.55)',.035,'#698d80',.018);
  for(const y of [-.72,-.20])box(c,-.15,y,.30,.15,gradient(c,-.15,y,.3,.1,'#d2ccb0','#829386'),.025,P.ink,.021);
  line(c,[0,-.58,-.04,-.46,.04,-.35,0,-.22],'#d5b77b',.027);
  line(c,[-.065,-.58,-.065,-.26],'#dbe4c3',.02);c.restore();
}
function marbleBag(c){
  poly(c,[-.38,-.13,-.42,-.39,-.27,-.61,-.22,-.77,.05,-.77,.09,-.60,.22,-.37,.13,-.09],'#a4916d',P.ink,.027);
  line(c,[-.24,-.63,.07,-.63],'#697f6d',.06);
  line(c,[-.04,-.62,.18,-.73,.24,-.67,.06,-.61,.30,-.53],'#b6c2a2',.022);
  for(const x of [-.24,-.06,.10])line(c,[x,-.53,x-.05,-.27,x,-.16],'#c5b28d',.018);
  for(const [x,y,r,color]of [[.30,-.16,.13,'#879d8b'],[-.23,-.075,.10,'#bca377'],[.04,-.10,.12,'#859da0']]){
    ellipse(c,x,y,r,r,color,P.ink,.022);
    line(c,[x-r*.6,y+r*.3,x-r*.1,y-r*.3,x+r*.6,y-r*.35],'#d1c5a1',.022);
    ellipse(c,x-r*.35,y-r*.42,.025,.023,'#e3dbc0');
  }
}
function gardenLabel(c){
  poly(c,[-.37,-.77,.38,-.72,.32,-.10,-.43,-.15],'#c8ba94',P.ink,.024);
  for(let i=0;i<4;i++)line(c,[-.27,-.62+i*.10,.23,-.58+i*.10],'#9c9778',.015);
  for(const [x,a,color]of [[-.16,-.18,'#a4b696'],[.17,.17,'#b8bf98']]){
    c.save();c.translate(x,-.11);c.rotate(a);
    poly(c,[-.045,0,.045,0,.045,-.39,.17,-.39,.17,-.65,-.17,-.65,-.17,-.39,-.045,-.39],color,P.ink,.023);
    line(c,[0,-.46,0,-.57],'#597c65',.024);
    ellipse(c,-.055,-.56,.065,.03,'#718a67');ellipse(c,.045,-.60,.055,.027,'#718a67');c.restore();
  }
  line(c,[-.34,-.33,.28,-.23],'#917557',.024);
}
function bicycleChain(c){
  // Connected alternating links: a single unbroken, collapsed loop.
  for(let i=0;i<12;i++){
    const a=i/12*TAU,x=Math.cos(a)*.35,y=-.33+Math.sin(a)*.22;
    c.save();c.translate(x,y);c.rotate(Math.atan2(.22*Math.cos(a),-.35*Math.sin(a)));
    box(c,-.13,-.065,.26,.13,i%2?'#877c62':'#a0825c',.06,P.ink,.025);
    for(const xx of [-.075,.075])ellipse(c,xx,0,.028,.028,'#374c43','#b59a72',.012);
    c.restore();
  }
  line(c,[-.20,-.52,-.08,-.55],'#bdac87',.018);
}
function sealedBandage(c){
  poly(c,[-.41,-.66,.42,-.60,.38,-.11,-.45,-.17],'#d8d7bc',P.ink,.025);
  for(let i=0;i<5;i++){
    line(c,[-.39+i*.055,-.64,-.40+i*.055,-.18],'#b3bba3',.008);
    line(c,[.33+i*.012,-.60,.29+i*.012,-.12],'#adb6a0',.008);
  }
  c.save();c.translate(0,-.37);c.rotate(.12);
  box(c,-.27,-.095,.54,.19,'#a8b6a0',.075,'#829784',.016);
  box(c,-.085,-.105,.17,.21,'#e6e3c6',.015,'#a9b39a',.012);
  for(const x of [-.19,.19])for(const y of [-.035,.035])ellipse(c,x,y,.013,.013,'#698675');
  c.restore();
  line(c,[-.34,-.57,.22,-.53],'#edecd5',.02);
}
function clayWhistle(c){
  poly(c,[-.37,-.28,-.12,-.48,.20,-.48,.45,-.36,.45,-.22,.17,-.21,.07,-.07,-.22,-.07],'#b5815e',P.ink,.028);
  ellipse(c,-.08,-.32,.25,.22,gradient(c,-.3,-.5,.5,.4,'#d0a27a','#a67152'),P.ink,.025);
  box(c,.23,-.36,.18,.075,'#644e3b',.01,P.inkSoft,.012);
  ellipse(c,-.09,-.41,.045,.04,'#4c4b3b','#dec09a',.012);
  line(c,[-.24,-.29,-.20,-.18,-.10,-.13],'#e0bb8d',.025);
  ellipse(c,-.28,-.27,.045,.04,'#6b6147');
  line(c,[-.29,-.28,-.47,-.41,-.46,-.55,-.32,-.52,-.29,-.28],'#819380',.022);
}
function beanTin(c,x,y,s){
  c.save();c.translate(x,y);c.scale(s,s);
  box(c,-.22,-.55,.44,.49,'#8f9f8c',.025,P.ink,.025);
  box(c,-.21,-.43,.42,.29,'#b5b48a',.01,null);
  ellipse(c,0,-.55,.22,.065,'#bcc2a6','#657e71',.024);
  ellipse(c,0,-.55,.15,.035,'rgba(0,0,0,0)','#8d9c87',.012);
  line(c,[-.19,-.09,.18,-.09],'#c8cfb2',.025);
  for(const [xx,yy]of [[-.07,-.32],[.08,-.28]]){
    ellipse(c,xx,yy,.055,.08,'#9d7853');ellipse(c,xx+.025,yy-.01,.035,.052,'#b8ac7f');
  }
  line(c,[-.15,-.46,-.15,-.15],'#ded9b3',.02);c.restore();
}
function preservedBeans(c){beanTin(c,-.18,-.19,.85);beanTin(c,.20,-.02,1);}
function pocketDictionary(c){
  // Open to the cherished beach page: water, shore and a thumb-worn binding.
  poly(c,[-.46,-.74,-.05,-.70,.02,-.67,.43,-.79,.46,-.13,.04,-.04,-.03,-.07,-.43,-.12],'#6c7e78',P.ink,.028);
  poly(c,[-.41,-.70,-.04,-.66,0,-.61,0,-.13,-.40,-.18],'#d4c8a5',P.inkSoft,.014);
  poly(c,[.02,-.61,.38,-.72,.41,-.18,.025,-.10],'#e1d2a9',P.inkSoft,.014);
  for(let i=0;i<5;i++)line(c,[-.33,-.57+i*.074,-.09,-.54+i*.074],'#a1997a',.013);
  line(c,[.02,-.62,.025,-.11],'#a68c67',.02);
  for(let i=0;i<3;i++)line(c,[.09,-.50+i*.07,.15,-.52+i*.07,.22,-.50+i*.07,.31,-.54+i*.07],'#7b9d94',.022);
  line(c,[.10,-.26,.21,-.29,.33,-.27],'#b99d67',.035);
  ellipse(c,.28,-.61,.037,.037,'#be9d61');
}
function brassKey(c){
  c.save();c.rotate(.42);
  ellipse(c,0,-.66,.18,.19,'#c5aa6a',P.ink,.028);
  ellipse(c,0,-.66,.09,.10,'#29443e','#e2c88a',.02);
  box(c,-.055,-.52,.11,.44,'#b99a5f',.018,P.ink,.025);
  poly(c,[.04,-.25,.22,-.25,.22,-.09,.15,-.09,.15,-.16,.10,-.16,.10,-.08,.04,-.08],'#c4a66b',P.ink,.022);
  line(c,[-.018,-.48,-.018,-.12],'#e6ca88',.02);
  line(c,[-.09,-.80,-.15,-.71],'#e7cf93',.024);c.restore();
}
function unknownFind(c){
  // An unidentified pocket-sized salvage parcel still has a readable presence.
  poly(c,[-.28,-.44,.18,-.49,.30,-.29,.23,-.06,-.24,-.04,-.33,-.23],gradient(c,-.3,-.5,.6,.5,'#afb49a','#758c7e'),P.ink,.03);
  line(c,[-.09,-.46,-.03,-.07],'#d7bd85',.065);
  line(c,[-.23,-.37,-.26,-.21],'#e0d9b5',.025);
}

function boundBook(c,color,miner=false){
  box(c,-.35,-.86,.68,.85,'#504b40',.025,P.ink,.025);
  box(c,-.28,-.81,.62,.77,'#d8caaa',.02,P.inkSoft,.017);
  for(let i=0;i<5;i++)line(c,[.27,-.71+i*.13,.32,-.70+i*.13],'#a79f86',.012);
  box(c,-.37,-.88,.64,.82,color,.025,P.ink,.024);
  line(c,[-.25,-.83,-.25,-.11],'#e3cba280',.02);
  box(c,-.16,-.73,.34,.49,'rgba(0,0,0,0)',.018,'#c7b385',.014);
  if(miner){
    line(c,[-.11,-.32,.13,-.63],'#d1b984',.036);line(c,[-.17,-.61,.02,-.67,.19,-.55],'#d8cfad',.041);
    line(c,[.28,-.63,.39,-.63,.39,-.46,.28,-.46],'#8d684e',.045);
  }else{
    ellipse(c,.01,-.54,.105,.08,'#dfcfaa');line(c,[-.09,-.51,-.06,-.40,.08,-.40,.11,-.51],'#dfcfaa',.025);
    for(let i=0;i<3;i++)line(c,[-.07+i*.07,-.64,-.08+i*.07,-.71],'#dfcfaa',.018);
    poly(c,[.13,-.11,.21,-.11,.21,.035,.17,-.005,.13,.035],'#b16d58',null);
  }
}
function guitar(c){
  c.save();c.rotate(.15);
  c.beginPath();c.moveTo(-.08,-.78);c.bezierCurveTo(-.32,-.85,-.38,-.63,-.23,-.48);c.bezierCurveTo(-.49,-.29,-.36,-.02,-.02,-.02);c.bezierCurveTo(.34,-.02,.42,-.27,.18,-.48);c.bezierCurveTo(.32,-.67,.24,-.83,.05,-.78);c.closePath();
  c.fillStyle=gradient(c,-.4,-.8,.7,.7,'#c99a5f','#976444');c.fill();c.strokeStyle=P.ink;c.lineWidth=.033;c.stroke();
  box(c,-.08,-1.33,.12,.68,'#654c3b',.015,P.ink,.018);
  box(c,-.10,-1.51,.16,.23,'#a2764e',.025,P.ink,.023);
  for(let i=0;i<3;i++)for(const s of [-1,1])ellipse(c,s*.11-.02,-1.46+i*.065,.026,.022,P.metalLight,P.inkSoft,.012);
  ellipse(c,-.02,-.57,.11,.11,'#463c30','#d3b077',.026);
  box(c,-.14,-.24,.24,.065,'#604734',.014,P.ink,.015);
  for(let i=0;i<4;i++)line(c,[-.055+i*.023,-1.38,-.055+i*.023,-.22],'#e2cda0',.009);
  for(let i=0;i<6;i++)line(c,[-.08,-1.22+i*.08,.04,-1.22+i*.08],'#c7b18b',.012);
  line(c,[-.29,-.29,-.26,-.17,-.15,-.10],'#e2b77b',.025);c.restore();
}
function helmet(c){
  c.beginPath();c.moveTo(-.39,-.12);c.lineTo(-.37,-.34);c.bezierCurveTo(-.34,-.77,.31,-.77,.36,-.34);c.lineTo(.39,-.12);c.closePath();
  c.fillStyle=gradient(c,-.35,-.6,.7,.5,'#c6a575','#8d7755');c.fill();c.strokeStyle=P.ink;c.lineWidth=.03;c.stroke();
  line(c,[-.13,-.61,-.14,-.17,.13,-.17,.13,-.60],'#dfc591',.035);
  box(c,-.48,-.16,.96,.12,'#b69d73',.045,P.ink,.025);
  box(c,-.10,-.43,.25,.22,'#485f5c',.04,P.ink,.02);ellipse(c,.025,-.33,.075,.075,'#ddce96','#2f4748',.024);
  line(c,[-.35,-.08,-.27,.02,.18,.02,.31,-.08],'#635744',.032);
}
function letters(c){
  poly(c,[-.43,-.43,.36,-.50,.44,-.08,-.36,-.01],'#b8ae91',P.ink,.02);
  poly(c,[-.43,-.49,.36,-.54,.42,-.14,-.38,-.08],'#e1d3ae',P.ink,.024);
  line(c,[-.43,-.49,.01,-.27,.36,-.54],'#aa9877',.022);
  line(c,[-.38,-.08,-.11,-.33,.01,-.27,.14,-.35,.42,-.14],'#c0ac84',.016);
  line(c,[-.18,-.53,-.12,-.09],'#7e927c',.055);
  ellipse(c,.005,-.28,.075,.067,'#b16b54',P.inkSoft,.015);ellipse(c,.005,-.28,.036,.032,'rgba(0,0,0,0)','#d2926b',.012);
}
function medal(c){
  poly(c,[-.20,-.86,.20,-.86,.13,-.46,0,-.37,-.13,-.46],'#8c6454',P.ink,.024);
  poly(c,[-.075,-.85,.075,-.85,.05,-.46,0,-.42,-.05,-.46],'#c2b28a',null);
  ellipse(c,0,-.40,.045,.065,'rgba(0,0,0,0)',P.amber,.025);
  ellipse(c,0,-.22,.205,.205,'#b8985d',P.ink,.025);ellipse(c,0,-.22,.155,.155,'#d9bd7e','#8e774b',.016);
  const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*TAU/10,r=i%2?.052:.12;p.push(Math.cos(a)*r,-.22+Math.sin(a)*r);}poly(c,p,'#a48750',null);
}
function drawing(c){
  box(c,-.48,-.83,.96,.81,'#8c6c4f',.025,P.ink,.023);box(c,-.42,-.77,.84,.69,'#dfd3ad',.012,null);
  line(c,[-.34,-.15,.34,-.15],'#849572',.026);
  poly(c,[-.25,-.22,-.25,-.47,.04,-.47,.04,-.22],'#9da28a',null);poly(c,[-.32,-.48,-.10,-.66,.12,-.48],'#b9775a',null);
  box(c,-.14,-.37,.09,.15,'#c7b177',.005,null);box(c,-.22,-.44,.07,.07,'#788f8b',.005,null);
  ellipse(c,.25,-.62,.075,.075,'#c5a85e');for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[.25+Math.cos(a)*.10,-.62+Math.sin(a)*.10,.25+Math.cos(a)*.13,-.62+Math.sin(a)*.13],'#c5a85e',.014);}
  line(c,[.20,-.17,.22,-.35,.23,-.21,.30,-.17,.23,-.28,.15,-.28],'#7f8981',.02);ellipse(c,.22,-.40,.04,.045,'#b49475');
}
const FINDS=Object.freeze({fossil,coin,pipe,bones,bottle,toy,photo,
  labChalkBox:chalkBox,labEnamelCup:enamelCup,labSeedEnvelope:seedEnvelope,
  labRepairNotebook:repairNotebook,labCopperBell:copperBell,labDoorHinge:doorHinge,
  labCleanFlask:cleanFlask,labTinSoldier:tinSoldier,labRecipeCard:recipeCard,
  labWoodenFrame:woodenFrame,labCoalPencil:coalPencil,labSpareFuse:spareFuse,
  labMarbleBag:marbleBag,labGardenLabel:gardenLabel,labBicycleChain:bicycleChain,
  labSealedBandage:sealedBandage,labClayWhistle:clayWhistle,
  labPreservedBeans:preservedBeans,labPocketDictionary:pocketDictionary,labBrassKey:brassKey,
});
const SOUVENIRS={recipeBook:c=>boundBook(c,'#94745f'),minerJournal:c=>boundBook(c,'#627c76',true),guitar,helmet,letters,medal,drawing};

/** t is seconds since discovery. A finite, fading glint does not repeat forever. */
export function drawFind(c,type,x,y,cellPx,opts={}){
  const draw=Object.hasOwn(FINDS,type)?FINDS[type]:unknownFind;
  local(c,x,y,cellPx,()=>{
    const t=opts.reduceMotion?0:Number.isFinite(opts.t)?opts.t:0,q=clamp(t/1.8),shine=t>=0&&t<1.8?Math.sin(Math.PI*(.12+.88*q))*(1-q):0;
    if(shine>0)halo(c,0,-.4,.95,.12*shine);
    draw(c);
    if(shine>0){
      c.save();c.globalAlpha*=shine;const xg=.27,yg=-.74,s=.10+.12*Math.sin(q*Math.PI);
      line(c,[xg-s,yg,xg+s,yg],'#fff1c6',.026);line(c,[xg,yg-s*1.4,xg,yg+s*1.4],'#fff1c6',.026);
      ellipse(c,xg,yg,.036,.036,'#fff6de');c.restore();
    }
  });
}
export function drawSouvenir(c,type,x,y,cellPx){const draw=SOUVENIRS[type];if(draw)local(c,x,y,cellPx,()=>draw(c));}
