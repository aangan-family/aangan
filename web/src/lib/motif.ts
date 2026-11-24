// Which floor art sits faintly behind the pages, by tradition (Nov 2026). Plain data, tested.
//   kolam   — South India (the rice-flour dots and loops at the door)
//   rangoli — North and West India, Punjab, Sindh, Gujarat, Maharashtra, Goa's Hindus, Parsi chalk (chok)
//   alpana  — Bengal, Odisha (jhoti / chita), Assam
//   jali    — Muslim and Kashmiri homes: the carved stone lattice
//   vine    — Christian homes: a leafy vine, as on church doors and lace
export type Motif = 'kolam' | 'rangoli' | 'alpana' | 'jali' | 'vine';

export const MOTIF: Record<string, Motif | null> = {
  tamil: 'kolam', telugu: 'kolam', kannada: 'kolam', malayalam: 'kolam',
  hindi: 'rangoli', punjabi: 'rangoli', marathi: 'rangoli', gujarati: 'rangoli', sindhi: 'rangoli', konkani: 'rangoli', parsi: 'rangoli',
  bengali: 'alpana', odia: 'alpana', assamese: 'alpana',
  urdu: 'jali', kashmiri: 'jali',
  goan_catholic: 'vine', syrian_christian: 'vine',
  english: null,
};

/** The tradition's floor art, or null for none. New packs default to rangoli until someone chooses better. */
export const motifFor = (community: string): Motif | null => (community in MOTIF ? MOTIF[community] : 'rangoli');

export const MOTIF_NAME: Record<Motif, string> = { kolam: 'Kolam', rangoli: 'Rangoli', alpana: 'Alpana', jali: 'Jali', vine: 'Vine' };
