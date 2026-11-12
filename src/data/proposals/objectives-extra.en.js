const rows = [
  ['WaterReserve', 'Build up a drinking water reserve', 'Store nine units of drinking water per resident.', 'Now we can drink without counting every sip.'],
  ['FoodReserve', 'Build up a food reserve', 'Store five portions of food per resident.', 'Those meals will stay in storage. Just knowing they’re there helps.'],
  ['Insects', 'Set up an insect farm', 'Fit out an insect farm to diversify your food supply.', 'The farm is ready. “Little proteins” won the first vote.'],
  ['Lab', 'Open a laboratory', 'Fit out a powered laboratory to start researching.', 'The lab is open. Let’s leave room for mistakes, too.'],
  ['Archive', 'Make room for an archive', 'Fit out an archive to keep books and improve research.', 'The books are shelved. We can look for something without moving everything first.'],
  ['Storage', 'Add a storage room', 'Fit out a new storage room for parts and materials.', 'Every crate finally has a chance of finding its way back to its place.'],
  ['WorkshopMethods', 'Study workshop methods', 'Complete the Workshop Methods research project.', 'The new methods are written down. Let’s show the newcomers as well.'],
  ['FilterWeaving', 'Improve filter weaving', 'Complete the Filter Weaving research project.', 'We understand the process now. Keep the old notes nearby for comparison.'],
  ['Evenings', 'Make evening gatherings part of the Charter', 'Pass the Evening Gatherings law and keep it in force.', 'It’s written down. A little of the evening belongs to us.'],
  ['Work12', 'Adopt the twelve-hour shift', 'Pass the Twelve-Hour Shift law and keep it in force.', 'The next shift knows when it ends. That alone has changed the conversation.'],
  ['ThreeExpeditions', 'Bring back three expeditions', 'Bring three expeditions safely back to the shelter. Departures and lost crews do not count.', 'Three returns. Our maps are starting to carry the dust of the surface.'],
  ['FiveFinds', 'Collect five finds', 'Uncover five finds while digging.', 'Five things rescued from the wheelbarrow. We don’t know who owned them, but we know a little more about how they lived.'],
  ['Radio', 'Listen to ten messages from neighbors', 'Receive ten messages from nearby shelters, including introductions, news, requests for help, or offers to trade.', 'Ten messages in the notebook. It’s starting to look like a neighborhood.'],
  ['Kit', 'Complete the minimum Exodus kit', 'Craft the minimum kit in the Exodus depot and keep it ready for departure.', 'The kit is complete. We have a choice now. We don’t have to leave yet.'],
];

export const OBJECTIVE_TEXT_EXTRA_EN = Object.freeze(Object.fromEntries(rows.flatMap(([id, text, hint, done]) => {
  const key = `m6Objective${id}`;
  return [[key, text], [`${key}Hint`, hint], [`${key}Done`, done]];
})));
