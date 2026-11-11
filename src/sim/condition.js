import { NEEDS } from '../data/balance.js';

// La faim au maximum ne tue plus en quelques jours, mais un habitant affamé
// ne tient plus le rythme : tout son travail progresse moins vite. Un seul
// endroit définit la règle, pour les chantiers comme pour les salles gérées
// par présence (cultures, puits, ateliers, laboratoires, kit d'exode).
export function starvingWorkFactor(colonist) {
  return (colonist?.hunger ?? 0) >= 100 ? NEEDS.STARVATION_WORK_FACTOR : 1;
}
