// Illustration catalog, mirrored from the game data on 2026-11-05.
// This module never imports simulation code. Extra art variants are explicit.
export const MATERIAL_IDS = Object.freeze(['air','topsoil','clay','sand','limestone','coal','sandstone','granite','rubble','concrete','bedrock']);
export const STRATA_IDS = Object.freeze(['topsoil','clay','sand','limestone','coal','sandstone','schist','granite','bedrock']);
export const DEPOSIT_IDS = Object.freeze(['none','iron','copper','lead','uranium','geode']);
export const LINING_IDS = Object.freeze(['none','timber','bolts','steelArch','shotcrete','boltsShotcrete']);
export const COATING_IDS = Object.freeze(['none','waterproof','insulation','leadLining','whitewash']);
export const STRUCTURE_IDS = Object.freeze(['airlock','antenna','geiger','solarPanel','rainCollector','ventShaft','lookout']);
export const WEATHER_IDS = Object.freeze(['clear','blackRain','dustStorm','clearing']);
// No src/data/poi/ exists yet in the read-only game checkout; these are SPEC §9.2.
export const POI_IDS = Object.freeze(['sewer','metro','neighborShelter','govBunker','karstCave','undergroundRiver','batColony','oldQuarry','cellar','animalBurrow','fossilBed','gasPocket','waterPocket']);
export const EFFECT_IDS = Object.freeze(['fallingDust','cracks','collapse','steam','smoke','flames','sparks','gas','radioactiveDust','ash']);
