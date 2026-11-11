export const DILEMMA_PREVIEW_KEY = 'dilemmaChoicePreview';

const sign = (amount) => amount > 0 ? '+' : '−';

export function dilemmaPreviewText(choice, translate, target = {}) {
  const effects = choice.effects ?? {};
  const name = target.name ?? translate('dilemmaPreviewTarget');
  const parts = [];
  for (const [resource, delta] of Object.entries(effects.resources ?? {})) {
    if (delta) parts.push(translate('dilemmaPreviewResource', { resource: translate(resource), sign: sign(delta) }));
  }
  if (effects.morale) parts.push(translate('dilemmaPreviewMorale', { sign: sign(effects.morale) }));
  if (effects.targetMorale) {
    parts.push(translate('dilemmaPreviewTargetMorale', { name, sign: sign(effects.targetMorale) }));
  }
  if (effects.arrivals?.length) {
    const count = effects.arrivals.length;
    parts.push(translate(count === 1 ? 'dilemmaPreviewArrivalOne' : 'dilemmaPreviewArrivals', { count }));
  }
  if (effects.targetDisease) {
    parts.push(translate('dilemmaPreviewDisease', { disease: translate(effects.targetDisease) }));
  }
  if (effects.killTarget) parts.push(translate('dilemmaPreviewDeath', { name }));
  if (effects.targetDose) parts.push(translate('dilemmaPreviewTargetDose', { name, sign: sign(effects.targetDose) }));
  if (effects.targetWorkBlockedDays) {
    const days = effects.targetWorkBlockedDays;
    parts.push(translate(days === 1 ? 'dilemmaPreviewWorkBlockedOne' : 'dilemmaPreviewWorkBlocked', { days }));
  }
  for (const [faction, delta] of Object.entries(effects.factions ?? {})) {
    if (delta) parts.push(translate('dilemmaPreviewFaction', { faction: translate(faction), sign: sign(delta) }));
  }
  if (effects.law) parts.push(translate('dilemmaPreviewLaw', { law: translate(`law_${effects.law}`) }));
  if (effects.surfaceDeposit) parts.push(translate('dilemmaPreviewSurfaceDeposit'));
  return parts.join(' · ') || translate(DILEMMA_PREVIEW_KEY);
}
