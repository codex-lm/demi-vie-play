import { drawSouvenirIcon } from '../../art/m6/souvenirs.js';

export const OBJECTIVE_ART = Object.freeze({
  digRoom: 'dig', fitDorm: 'bed', findWater: 'water', ventilate: 'ventilation',
  repairRoom: 'repair', buildCommons: 'commons', firstExpedition: 'seeds',
  growFood: 'food', filterWater: 'hygiene', buildWorkshop: 'repair', buildSchool: 'school',
  completeResearch: 'research', buildInfirmary: 'medicine', buildCanteen: 'kitchen',
  storeFood: 'storage', addSupport: 'support', lineRoom: 'support', waterproofRoom: 'water',
  storePower: 'power', heatRoom: 'heat', buildAntenna: 'radio', contactNeighbors: 'radio',
  signLaw: 'heritage', prepareExodus: 'exodus',
  // Laboratory content: specific silhouettes for its objects, rooms and laws.
  waterReserve: 'waterReserve', foodReserve: 'food', insects: 'insects', storage: 'storage',
  lab: 'lab', workshopMethods: 'workshopMethods', filterWeaving: 'filterWeaving', archive: 'archive',
  threeExpeditions: 'expedition', fiveFinds: 'finds', radio: 'radio', evenings: 'evenings',
  work12: 'work12', kit: 'kit',
});
export const SOUVENIR_ART = Object.freeze({recipeBook: 'recipes', minerJournal: 'minerJournal', songs: 'songs', gardenNotes: 'herbarium'});

// Medic and engineer books are actual books: neither is substituted with an
// unrelated relic from the standalone pack. Symbols remain readable at 40 px.
export function drawGameSouvenir(ctx, type, size) {
  const mapped = SOUVENIR_ART[type];
  if (mapped) return drawSouvenirIcon(ctx, mapped, 0, 0, size);
  ctx.save(); ctx.scale(size / 64, size / 64);
  ctx.fillStyle = '#10191c'; ctx.fillRect(0, 0, 64, 64);
  ctx.translate(32, 32); ctx.rotate(-.08); ctx.translate(-32, -32);
  ctx.fillStyle = '#d7c7a2'; ctx.fillRect(15, 10, 36, 47);
  ctx.fillStyle = type === 'medicManual' ? '#6b887c' : '#977c50'; ctx.fillRect(12, 7, 38, 47);
  ctx.strokeStyle = '#d8c49a'; ctx.lineWidth = 1; ctx.strokeRect(12.5, 7.5, 37, 46);
  ctx.fillStyle = '#353f38'; ctx.fillRect(15, 8, 4, 44);
  ctx.strokeStyle = '#dfd4b4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(20, 49); ctx.lineTo(47, 49); ctx.stroke();
  if (type === 'medicManual') {
    ctx.fillStyle = '#eee2ba'; ctx.fillRect(27, 19, 8, 23); ctx.fillRect(20, 26, 22, 8);
  } else {
    ctx.strokeStyle = '#eee2ba'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 30, 9, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(32 + Math.cos(angle) * 8, 30 + Math.sin(angle) * 8);
      ctx.lineTo(32 + Math.cos(angle) * 13, 30 + Math.sin(angle) * 13); ctx.stroke();
    }
    ctx.fillStyle = '#eee2ba'; ctx.beginPath(); ctx.arc(32, 30, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
