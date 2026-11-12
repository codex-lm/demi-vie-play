// Display text only. These entries never enter the saved simulation journal.
export const JOURNAL_PEOPLE_TEXT_FR = Object.freeze({
  inhabitantsDeathFemale: '{name} est morte à {age} ans. Elle laisse {object}. Cause : {causes}.',
  inhabitantsDeathMale: '{name} est mort à {age} ans. Il laisse {object}. Cause : {causes}.',
  inhabitantsDeathNeutral: 'À {age} ans, {name} a perdu la vie. Dans son casier : {object}. Cause : {causes}.',
  inhabitantsDeathUnknownAge: '{name} a perdu la vie. Dans son casier : {object}. Cause : {causes}.',
});

export const JOURNAL_PEOPLE_TEXT_EN = Object.freeze({
  inhabitantsDeathFemale: '{name} died aged {age}. She leaves {object}. Cause: {causes}.',
  inhabitantsDeathMale: '{name} died aged {age}. He leaves {object}. Cause: {causes}.',
  inhabitantsDeathNeutral: '{name} died aged {age}. In their locker: {object}. Cause: {causes}.',
  inhabitantsDeathUnknownAge: '{name} died. In their locker: {object}. Cause: {causes}.',
});
