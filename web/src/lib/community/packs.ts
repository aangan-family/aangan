import type { Role } from '../kin/roles';
import { dravidian, fromTable, T, type KinTable, type Term } from './terms';
import { MENUS } from './menus';

/**
 * Community packs: the family words, menu language, calendar and festivals of one community.
 * A family picks its default in site.config.json ("community"); each member can pick their own
 * (Theme → Traditions), because married-in families bring their own traditions.
 *
 * Words are the everyday ones families use at home. Usage differs by region, caste and religion,
 * so every pack welcomes corrections (CONTRIBUTING.md). When a word is missing, only English shows.
 */
export type CommunityId =
  | 'hindi' | 'punjabi' | 'bengali' | 'marathi' | 'gujarati' | 'urdu'
  | 'tamil' | 'telugu' | 'kannada' | 'malayalam' | 'english';

/** Festival groups a member can switch on in the calendar. */
export type FestivalGroup =
  | 'national' | 'hindu' | 'north' | 'tamil' | 'kerala' | 'bengal' | 'punjab' | 'maharashtra' | 'gujarat'
  | 'telugu' | 'karnataka' | 'sikh' | 'muslim' | 'christian' | 'jain' | 'buddhist';

export const FESTIVAL_GROUPS: [FestivalGroup, string][] = [
  ['national', 'National days'], ['hindu', 'Hindu (all India)'], ['north', 'North Indian Hindu'], ['tamil', 'Tamil'], ['kerala', 'Kerala'],
  ['bengal', 'Bengali'], ['punjab', 'Punjabi'], ['maharashtra', 'Marathi'], ['gujarat', 'Gujarati'], ['telugu', 'Telugu'],
  ['karnataka', 'Kannada'], ['sikh', 'Sikh'], ['muslim', 'Muslim'], ['christian', 'Christian'], ['jain', 'Jain'], ['buddhist', 'Buddhist'],
];

/** How a day is named beside the English date. */
export type DateStyle = 'tamil' | 'malayalam' | 'bengali' | 'amanta' | 'purnimanta' | 'hijri' | 'none';

export interface Pack {
  id: CommunityId;
  name: string;          // in English
  native: string;        // in its own script
  lang: string;          // menus (BCP 47)
  hello: string;         // greeting used in wishes
  term: (r: Role) => Term | null;
  menus: Record<string, string>;
  /** what the tradition fields are called */
  labels: { gothram: string; kuladeivam: string };
  date: DateStyle;
  festivals: FestivalGroup[];
  /** star (nakshatra) birthdays, as kept in Tamil Nadu and Kerala */
  starBirthday: boolean;
  /** South Indian art in the interface: woven borders, kolam, gopuram */
  art: 'south' | 'plain';
  /** right-to-left script */
  rtl?: boolean;
}

// ---------------------------------------------------------------------------------------------- Hindi
const HINDI: KinTable = {
  father: 'Papa|पापा', mother: 'Maa|माँ',
  gfP: 'Dada|दादा', gmP: 'Dadi|दादी', gfM: 'Nana|नाना', gmM: 'Nani|नानी',
  ggf: 'Pardada|परदादा', ggm: 'Pardadi|परदादी', ggfM: 'Parnana|परनाना', ggmM: 'Parnani|परनानी',
  son: 'Beta|बेटा', daughter: 'Beti|बेटी',
  sonSon: 'Pota|पोता', sonDau: 'Poti|पोती', dauSon: 'Nati|नाती', dauDau: 'Natin|नातिन',
  ggson: 'Parpota|परपोता', ggdau: 'Parpoti|परपोती',
  husband: 'Pati|पति', wife: 'Patni|पत्नी',
  fil: 'Sasur ji|ससुर जी', mil: 'Saas ji|सास जी', spGf: 'Dada sasur|दादा ससुर', spGm: 'Dadi saas|दादी सास',
  sonInLaw: 'Damad|दामाद', dauInLaw: 'Bahu|बहू', coParentM: 'Samdhi|समधी', coParentF: 'Samdhan|समधन',
  eBro: 'Bhaiya|भैया', yBro: 'Bhai|भाई', bro: 'Bhai|भाई', eSis: 'Didi|दीदी', ySis: 'Behen|बहन', sis: 'Behen|बहन',
  fEBro: 'Tauji|ताऊजी', fYBro: 'Chacha|चाचा', fSis: 'Bua|बुआ',
  mBro: 'Mama|मामा', mSis: 'Mausi|मौसी',
  fEBroW: 'Taiji|ताईजी', fYBroW: 'Chachi|चाची', fSisH: 'Phupha|फूफा', mBroW: 'Mami|मामी', mSisH: 'Mausa|मौसा',
  broSon: 'Bhatija|भतीजा', broDau: 'Bhatiji|भतीजी', sisSon: 'Bhanja|भांजा', sisDau: 'Bhanji|भांजी',
  cousin: {
    fm: ['Chachera bhai|चचेरा भाई', 'Chacheri behen|चचेरी बहन'], ff: ['Phuphera bhai|फुफेरा भाई', 'Phupheri behen|फुफेरी बहन'],
    mm: ['Mamera bhai|ममेरा भाई', 'Mameri behen|ममेरी बहन'], mf: ['Mausera bhai|मौसेरा भाई', 'Mauseri behen|मौसेरी बहन'],
  },
  gpBroP: 'Dada|दादा', gpSisP: 'Dadi|दादी', gpBroM: 'Nana|नाना', gpSisM: 'Nani|नानी',
  hEBro: 'Jeth ji|जेठ जी', hYBro: 'Devar|देवर', hSis: 'Nanad|ननद', wBro: 'Saala|साला', wSis: 'Saali|साली',
  eBroW: 'Bhabhi|भाभी', broW: 'Bhabhi|भाभी', eSisH: 'Jija ji|जीजा जी', ySisH: 'Behnoi|बहनोई', sisH: 'Jija ji|जीजा जी',
  hEBroW: 'Jethani|जेठानी', hYBroW: 'Devrani|देवरानी', hSisH: 'Nandoi|ननदोई', wSisH: 'Saadu|साढ़ू', wBroW: 'Salhaj|सलहज',
};

// ---------------------------------------------------------------------------------------------- Urdu
const URDU: KinTable = {
  ...HINDI,
  father: 'Abbu|ابو', mother: 'Ammi|امی',
  gfP: 'Dada|دادا', gmP: 'Dadi|دادی', gfM: 'Nana|نانا', gmM: 'Nani|نانی', ggf: 'Pardada|پردادا', ggm: 'Pardadi|پردادی', ggfM: 'Parnana|پرنانا', ggmM: 'Parnani|پرنانی',
  son: 'Beta|بیٹا', daughter: 'Beti|بیٹی', sonSon: 'Pota|پوتا', sonDau: 'Poti|پوتی', dauSon: 'Nawasa|نواسہ', dauDau: 'Nawasi|نواسی',
  ggson: 'Parpota|پرپوتا', ggdau: 'Parpoti|پرپوتی', husband: 'Shohar|شوہر', wife: 'Biwi|بیوی',
  fil: 'Sasur|سسر', mil: 'Saas|ساس', spGf: undefined, spGm: undefined, sonInLaw: 'Damad|داماد', dauInLaw: 'Bahu|بہو', coParentM: 'Samdhi|سمدھی', coParentF: 'Samdhan|سمدھن',
  eBro: 'Bhai jaan|بھائی جان', yBro: 'Bhai|بھائی', bro: 'Bhai|بھائی', eSis: 'Baji|باجی', ySis: 'Behen|بہن', sis: 'Behen|بہن',
  fEBro: 'Taya|تایا', fYBro: 'Chacha|چچا', fSis: 'Phuphi|پھوپھی', mBro: 'Mamu|ماموں', mSis: 'Khala|خالہ',
  fEBroW: 'Tai|تائی', fYBroW: 'Chachi|چچی', fSisH: 'Phupha|پھوپھا', mBroW: 'Mumani|ممانی', mSisH: 'Khalu|خالو',
  broSon: 'Bhatija|بھتیجا', broDau: 'Bhatiji|بھتیجی', sisSon: 'Bhanja|بھانجا', sisDau: 'Bhanji|بھانجی',
  cousin: {
    fm: ['Chachazad bhai|چچازاد بھائی', 'Chachazad behen|چچازاد بہن'], ff: ['Phuphizad bhai|پھوپھی زاد بھائی', 'Phuphizad behen|پھوپھی زاد بہن'],
    mm: ['Mamuzad bhai|ماموں زاد بھائی', 'Mamuzad behen|ماموں زاد بہن'], mf: ['Khalazad bhai|خالہ زاد بھائی', 'Khalazad behen|خالہ زاد بہن'],
  },
  gpBroP: 'Dada|دادا', gpSisP: 'Dadi|دادی', gpBroM: 'Nana|نانا', gpSisM: 'Nani|نانی',
  hEBro: 'Jeth|جیٹھ', hYBro: 'Dewar|دیور', hSis: 'Nand|نند', wBro: 'Sala|سالا', wSis: 'Sali|سالی',
  eBroW: 'Bhabhi|بھابھی', broW: 'Bhabhi|بھابھی', eSisH: 'Behnoi|بہنوئی', ySisH: 'Behnoi|بہنوئی', sisH: 'Behnoi|بہنوئی',
  hEBroW: 'Jethani|جیٹھانی', hYBroW: 'Dewrani|دیورانی', hSisH: 'Nandoi|نندوئی', wSisH: 'Hamzulf|ہم زلف', wBroW: 'Salhaj|سلہج',
};

// ---------------------------------------------------------------------------------------------- Punjabi
const PUNJABI: KinTable = {
  father: 'Bapu ji|ਬਾਪੂ ਜੀ', mother: 'Bebe ji|ਬੇਬੇ ਜੀ',
  gfP: 'Dada ji|ਦਾਦਾ ਜੀ', gmP: 'Dadi ji|ਦਾਦੀ ਜੀ', gfM: 'Nana ji|ਨਾਨਾ ਜੀ', gmM: 'Nani ji|ਨਾਨੀ ਜੀ',
  ggf: 'Pardada|ਪੜਦਾਦਾ', ggm: 'Pardadi|ਪੜਦਾਦੀ', ggfM: 'Parnana|ਪੜਨਾਨਾ', ggmM: 'Parnani|ਪੜਨਾਨੀ',
  son: 'Putt|ਪੁੱਤ', daughter: 'Dhee|ਧੀ', sonSon: 'Pota|ਪੋਤਾ', sonDau: 'Poti|ਪੋਤੀ', dauSon: 'Dohta|ਦੋਹਤਾ', dauDau: 'Dohti|ਦੋਹਤੀ',
  ggson: 'Parpota|ਪੜਪੋਤਾ', ggdau: 'Parpoti|ਪੜਪੋਤੀ',
  husband: 'Gharwala|ਘਰਵਾਲਾ', wife: 'Gharwali|ਘਰਵਾਲੀ', fil: 'Sohra ji|ਸਹੁਰਾ ਜੀ', mil: 'Sass ji|ਸੱਸ ਜੀ',
  sonInLaw: 'Jawai|ਜਵਾਈ', dauInLaw: 'Nooh|ਨੂੰਹ', coParentM: 'Kurham|ਕੁੜਮ', coParentF: 'Kurmani|ਕੁੜਮਣੀ',
  eBro: 'Veer ji|ਵੀਰ ਜੀ', yBro: 'Veer|ਵੀਰ', bro: 'Veer|ਵੀਰ', eSis: 'Bhain ji|ਭੈਣ ਜੀ', ySis: 'Bhain|ਭੈਣ', sis: 'Bhain|ਭੈਣ',
  fEBro: 'Taya ji|ਤਾਇਆ ਜੀ', fYBro: 'Chacha ji|ਚਾਚਾ ਜੀ', fSis: 'Bhua ji|ਭੂਆ ਜੀ', mBro: 'Mama ji|ਮਾਮਾ ਜੀ', mSis: 'Massi ji|ਮਾਸੀ ਜੀ',
  fEBroW: 'Tayi ji|ਤਾਈ ਜੀ', fYBroW: 'Chachi ji|ਚਾਚੀ ਜੀ', fSisH: 'Phuphad ji|ਫੁੱਫੜ ਜੀ', mBroW: 'Mami ji|ਮਾਮੀ ਜੀ', mSisH: 'Massad ji|ਮਾਸੜ ਜੀ',
  broSon: 'Bhateeja|ਭਤੀਜਾ', broDau: 'Bhateeji|ਭਤੀਜੀ', sisSon: 'Bhanja|ਭਾਣਜਾ', sisDau: 'Bhanji|ਭਾਣਜੀ',
  cousin: {
    fm: ['Taaye/Chache da putt|ਤਾਏ/ਚਾਚੇ ਦਾ ਪੁੱਤ', 'Taaye/Chache di dhee|ਤਾਏ/ਚਾਚੇ ਦੀ ਧੀ'], ff: ['Bhua da putt|ਭੂਆ ਦਾ ਪੁੱਤ', 'Bhua di dhee|ਭੂਆ ਦੀ ਧੀ'],
    mm: ['Mame da putt|ਮਾਮੇ ਦਾ ਪੁੱਤ', 'Mame di dhee|ਮਾਮੇ ਦੀ ਧੀ'], mf: ['Massi da putt|ਮਾਸੀ ਦਾ ਪੁੱਤ', 'Massi di dhee|ਮਾਸੀ ਦੀ ਧੀ'],
  },
  gpBroP: 'Dada ji|ਦਾਦਾ ਜੀ', gpSisP: 'Dadi ji|ਦਾਦੀ ਜੀ', gpBroM: 'Nana ji|ਨਾਨਾ ਜੀ', gpSisM: 'Nani ji|ਨਾਨੀ ਜੀ',
  hEBro: 'Jeth|ਜੇਠ', hYBro: 'Diyor|ਦਿਓਰ', hSis: 'Nanaan|ਨਨਾਣ', wBro: 'Saala|ਸਾਲਾ', wSis: 'Saali|ਸਾਲੀ',
  eBroW: 'Bharjai|ਭਰਜਾਈ', broW: 'Bharjai|ਭਰਜਾਈ', eSisH: 'Jija ji|ਜੀਜਾ ਜੀ', sisH: 'Jija ji|ਜੀਜਾ ਜੀ',
  hEBroW: 'Jethani|ਜਠਾਣੀ', hYBroW: 'Darani|ਦਰਾਣੀ', hSisH: 'Nandoya|ਨਣਦੋਈਆ', wSisH: 'Saandu|ਸਾਂਢੂ', wBroW: 'Salehaj|ਸਲੇਹਜ',
};

// ---------------------------------------------------------------------------------------------- Bengali
const BENGALI: KinTable = {
  father: 'Baba|বাবা', mother: 'Ma|মা',
  gfP: 'Thakurda|ঠাকুরদা', gmP: 'Thakuma|ঠাকুমা', gfM: 'Dadu|দাদু', gmM: 'Didima|দিদিমা',
  son: 'Chhele|ছেলে', daughter: 'Meye|মেয়ে', sonSon: 'Nati|নাতি', sonDau: 'Natni|নাতনি', dauSon: 'Nati|নাতি', dauDau: 'Natni|নাতনি',
  husband: 'Swami|স্বামী', wife: 'Stree|স্ত্রী', fil: 'Shoshur moshai|শ্বশুরমশাই', mil: 'Shashuri|শাশুড়ি',
  sonInLaw: 'Jamai|জামাই', dauInLaw: 'Bouma|বৌমা', coParentM: 'Beyai|বেয়াই', coParentF: 'Beyan|বেয়ান',
  eBro: 'Dada|দাদা', yBro: 'Bhai|ভাই', eSis: 'Didi|দিদি', ySis: 'Bon|বোন',
  fEBro: 'Jethu|জেঠু', fYBro: 'Kaku|কাকু', fSis: 'Pishi|পিসি', mBro: 'Mama|মামা', mSis: 'Mashi|মাসি',
  fEBroW: 'Jethima|জেঠিমা', fYBroW: 'Kakima|কাকিমা', fSisH: 'Pishemoshai|পিসেমশাই', mBroW: 'Mami|মামি', mSisH: 'Meshomoshai|মেসোমশাই',
  broSon: 'Bhaipo|ভাইপো', broDau: 'Bhaijhi|ভাইঝি', sisSon: 'Bhagne|ভাগ্নে', sisDau: 'Bhagni|ভাগ্নী',
  cousin: {
    fm: ['Khurtuto/Jethtuto bhai|খুড়তুতো/জেঠতুতো ভাই', 'Khurtuto/Jethtuto bon|খুড়তুতো/জেঠতুতো বোন'], ff: ['Pishtuto bhai|পিসতুতো ভাই', 'Pishtuto bon|পিসতুতো বোন'],
    mm: ['Mamato bhai|মামাতো ভাই', 'Mamato bon|মামাতো বোন'], mf: ['Mashtuto bhai|মাসতুতো ভাই', 'Mashtuto bon|মাসতুতো বোন'],
  },
  gpBroP: 'Thakurda|ঠাকুরদা', gpSisP: 'Thakuma|ঠাকুমা', gpBroM: 'Dadu|দাদু', gpSisM: 'Didima|দিদিমা',
  hEBro: 'Bhashur|ভাসুর', hYBro: 'Deor|দেওর', hSis: 'Nanad|ননদ', wBro: 'Shala|শালা', wSis: 'Shali|শালি',
  eBroW: 'Boudi|বৌদি', eSisH: 'Jamaibabu|জামাইবাবু',
  hBroW: 'Ja|জা', hSisH: 'Nandai|নন্দাই', wSisH: 'Bhayra|ভায়রা', wBroW: 'Shalaj|শালাজ',
};

// ---------------------------------------------------------------------------------------------- Marathi
const MARATHI: KinTable = {
  father: 'Baba|बाबा', mother: 'Aai|आई',
  gfP: 'Ajoba|आजोबा', gmP: 'Aaji|आजी', gfM: 'Ajoba|आजोबा', gmM: 'Aaji|आजी', ggf: 'Panjoba|पणजोबा', ggm: 'Panji|पणजी',
  son: 'Mulga|मुलगा', daughter: 'Mulgi|मुलगी', sonSon: 'Natu|नातू', sonDau: 'Naat|नात', dauSon: 'Natu|नातू', dauDau: 'Naat|नात',
  husband: 'Navra|नवरा', wife: 'Bayko|बायको', fil: 'Sasre|सासरे', mil: 'Sasubai|सासूबाई',
  sonInLaw: 'Javai|जावई', dauInLaw: 'Soon|सून', coParentM: 'Vyahi|व्याही', coParentF: 'Vihin|विहीण',
  eBro: 'Dada|दादा', yBro: 'Bhau|भाऊ', bro: 'Bhau|भाऊ', eSis: 'Tai|ताई', ySis: 'Bahin|बहीण', sis: 'Bahin|बहीण',
  fBro: 'Kaka|काका', fSis: 'Atya|आत्या', mBro: 'Mama|मामा', mSis: 'Mavshi|मावशी',
  fBroW: 'Kaku|काकू', mBroW: 'Mami|मामी', mSisH: 'Kaka|काका',
  broSon: 'Putanya|पुतण्या', broDau: 'Putni|पुतणी', sisSon: 'Bhacha|भाचा', sisDau: 'Bhachi|भाची',
  cousin: {
    fm: ['Chulat bhau|चुलत भाऊ', 'Chulat bahin|चुलत बहीण'], ff: ['Atebhau|आतेभाऊ', 'Atebahin|आतेबहीण'],
    mm: ['Mamebhau|मामेभाऊ', 'Mamebahin|मामेबहीण'], mf: ['Mavasbhau|मावसभाऊ', 'Mavasbahin|मावसबहीण'],
  },
  gpBroP: 'Ajoba|आजोबा', gpSisP: 'Aaji|आजी', gpBroM: 'Ajoba|आजोबा', gpSisM: 'Aaji|आजी',
  hBro: 'Deer|दीर', hSis: 'Nanand|नणंद', wBro: 'Mehuna|मेहुणा', wSis: 'Mehuni|मेहुणी',
  broW: 'Vahini|वहिनी', sisH: 'Mehune|मेहुणे', hBroW: 'Jau|जाऊ', wSisH: 'Sadu|साडू',
};

// ---------------------------------------------------------------------------------------------- Gujarati
const GUJARATI: KinTable = {
  father: 'Pappa|પપ્પા', mother: 'Mummy|મમ્મી',
  gfP: 'Dada|દાદા', gmP: 'Dadi|દાદી', gfM: 'Nana|નાના', gmM: 'Nani|નાની',
  son: 'Dikro|દીકરો', daughter: 'Dikri|દીકરી', sonSon: 'Pautra|પૌત્ર', sonDau: 'Pautri|પૌત્રી', dauSon: 'Dohitra|દોહિત્ર', dauDau: 'Dohitri|દોહિત્રી',
  husband: 'Pati|પતિ', wife: 'Patni|પત્ની', fil: 'Sasra|સસરા', mil: 'Sasu|સાસુ',
  sonInLaw: 'Jamai|જમાઈ', dauInLaw: 'Vahu|વહુ', coParentM: 'Vevai|વેવાઈ', coParentF: 'Vevan|વેવાણ',
  eBro: 'Motabhai|મોટાભાઈ', yBro: 'Bhai|ભાઈ', bro: 'Bhai|ભાઈ', eSis: 'Motiben|મોટીબેન', ySis: 'Ben|બેન', sis: 'Ben|બેન',
  fBro: 'Kaka|કાકા', fSis: 'Foi|ફોઈ', mBro: 'Mama|મામા', mSis: 'Masi|માસી',
  fBroW: 'Kaki|કાકી', fSisH: 'Fua|ફુઆ', mBroW: 'Mami|મામી', mSisH: 'Masa|માસા',
  broSon: 'Bhatrijo|ભત્રીજો', broDau: 'Bhatriji|ભત્રીજી', sisSon: 'Bhanej|ભાણેજ', sisDau: 'Bhaneji|ભાણેજી',
  cousin: {
    fm: ['Pitrai bhai|પિતરાઈ ભાઈ', 'Pitrai ben|પિતરાઈ બેન'], ff: ['Foiyai bhai|ફોઈયાઈ ભાઈ', 'Foiyai ben|ફોઈયાઈ બેન'],
    mm: ['Mamai bhai|મામાઈ ભાઈ', 'Mamai ben|મામાઈ બેન'], mf: ['Masiyai bhai|માસિયાઈ ભાઈ', 'Masiyai ben|માસિયાઈ બેન'],
  },
  gpBroP: 'Dada|દાદા', gpSisP: 'Dadi|દાદી', gpBroM: 'Nana|નાના', gpSisM: 'Nani|નાની',
  hEBro: 'Jeth|જેઠ', hYBro: 'Diyar|દિયર', hSis: 'Nanand|નણંદ', wBro: 'Salo|સાળો', wSis: 'Sali|સાળી',
  broW: 'Bhabhi|ભાભી', sisH: 'Banevi|બનેવી', hEBroW: 'Jethani|જેઠાણી', hYBroW: 'Derani|દેરાણી', hSisH: 'Nandoi|નણદોઈ', wSisH: 'Sadhu|સાઢુ',
};

// ---------------------------------------------------------------------------------------------- Telugu
const TELUGU: KinTable = {
  father: 'Nanna|నాన్న', mother: 'Amma|అమ్మ',
  gfP: 'Tatayya|తాతయ్య', gmP: 'Nannamma|నానమ్మ', gfM: 'Tatayya|తాతయ్య', gmM: 'Ammamma|అమ్మమ్మ', ggf: 'Mutthata|ముత్తాత', ggm: 'Mutthavva|ముత్తవ్వ',
  son: 'Koduku|కొడుకు', daughter: 'Kuthuru|కూతురు', sonSon: 'Manavadu|మనవడు', sonDau: 'Manavaralu|మనవరాలు', dauSon: 'Manavadu|మనవడు', dauDau: 'Manavaralu|మనవరాలు',
  husband: 'Bharta|భర్త', wife: 'Bharya|భార్య', fil: 'Mavayya|మామయ్య', mil: 'Attayya|అత్తయ్య',
  sonInLaw: 'Alludu|అల్లుడు', dauInLaw: 'Kodalu|కోడలు', coParentM: 'Viyyankudu|వియ్యంకుడు', coParentF: 'Viyyapuralu|వియ్యపురాలు',
  eBro: 'Anna|అన్న', yBro: 'Tammudu|తమ్ముడు', eSis: 'Akka|అక్క', ySis: 'Chelli|చెల్లి',
  fEBro: 'Pedananna|పెదనాన్న', fYBro: 'Babai|బాబాయ్', fSis: 'Atta|అత్త', mBro: 'Mavayya|మామయ్య', mESis: 'Peddamma|పెద్దమ్మ', mYSis: 'Pinni|పిన్ని',
  fEBroW: 'Peddamma|పెద్దమ్మ', fYBroW: 'Pinni|పిన్ని', fSisH: 'Mavayya|మామయ్య', mBroW: 'Atta|అత్త', mESisH: 'Pedananna|పెదనాన్న', mYSisH: 'Babai|బాబాయ్',
  gpBroP: 'Tatayya|తాతయ్య', gpSisP: 'Nannamma|నానమ్మ', gpBroM: 'Tatayya|తాతయ్య', gpSisM: 'Ammamma|అమ్మమ్మ',
  hEBro: 'Bava|బావ', hYBro: 'Maridi|మరిది', hESis: 'Vadina|వదిన', hYSis: 'Adapaduchu|ఆడపడుచు', hSis: 'Adapaduchu|ఆడపడుచు',
  wEBro: 'Bava|బావ', wYBro: 'Bavamaridi|బావమరిది', wESis: 'Vadina|వదిన', wYSis: 'Maradalu|మరదలు',
  eBroW: 'Vadina|వదిన', yBroW: 'Maradalu|మరదలు', eSisH: 'Bava|బావ', ySisH: 'Maridi|మరిది',
  hBroW: 'Thoti kodalu|తోటికోడలు', wSisH: 'Todalludu|తోడల్లుడు',
};

// ---------------------------------------------------------------------------------------------- Kannada
const KANNADA: KinTable = {
  father: 'Appa|ಅಪ್ಪ', mother: 'Amma|ಅಮ್ಮ',
  gfP: 'Ajja|ಅಜ್ಜ', gmP: 'Ajji|ಅಜ್ಜಿ', gfM: 'Ajja|ಅಜ್ಜ', gmM: 'Ajji|ಅಜ್ಜಿ', ggf: 'Muttajja|ಮುತ್ತಜ್ಜ', ggm: 'Muttajji|ಮುತ್ತಜ್ಜಿ',
  son: 'Maga|ಮಗ', daughter: 'Magalu|ಮಗಳು', sonSon: 'Mommaga|ಮೊಮ್ಮಗ', sonDau: 'Mommagalu|ಮೊಮ್ಮಗಳು', dauSon: 'Mommaga|ಮೊಮ್ಮಗ', dauDau: 'Mommagalu|ಮೊಮ್ಮಗಳು',
  husband: 'Ganda|ಗಂಡ', wife: 'Hendathi|ಹೆಂಡತಿ', fil: 'Maava|ಮಾವ', mil: 'Atte|ಅತ್ತೆ',
  sonInLaw: 'Aliya|ಅಳಿಯ', dauInLaw: 'Sose|ಸೊಸೆ', coParentM: 'Beegaru|ಬೀಗರು', coParentF: 'Beegithi|ಬೀಗಿತ್ತಿ',
  eBro: 'Anna|ಅಣ್ಣ', yBro: 'Thamma|ತಮ್ಮ', eSis: 'Akka|ಅಕ್ಕ', ySis: 'Thangi|ತಂಗಿ',
  fEBro: 'Doddappa|ದೊಡ್ಡಪ್ಪ', fYBro: 'Chikkappa|ಚಿಕ್ಕಪ್ಪ', fSis: 'Atte|ಅತ್ತೆ', mBro: 'Maava|ಮಾವ', mESis: 'Doddamma|ದೊಡ್ಡಮ್ಮ', mYSis: 'Chikkamma|ಚಿಕ್ಕಮ್ಮ',
  fEBroW: 'Doddamma|ದೊಡ್ಡಮ್ಮ', fYBroW: 'Chikkamma|ಚಿಕ್ಕಮ್ಮ', fSisH: 'Maava|ಮಾವ', mBroW: 'Atte|ಅತ್ತೆ', mESisH: 'Doddappa|ದೊಡ್ಡಪ್ಪ', mYSisH: 'Chikkappa|ಚಿಕ್ಕಪ್ಪ',
  gpBroP: 'Ajja|ಅಜ್ಜ', gpSisP: 'Ajji|ಅಜ್ಜಿ', gpBroM: 'Ajja|ಅಜ್ಜ', gpSisM: 'Ajji|ಅಜ್ಜಿ',
  hEBro: 'Bhava|ಭಾವ', hYBro: 'Maiduna|ಮೈದುನ', hESis: 'Attige|ಅತ್ತಿಗೆ', hYSis: 'Naadini|ನಾದಿನಿ',
  wEBro: 'Bhava|ಭಾವ', wYBro: 'Bhavamaida|ಭಾವಮೈದ', wESis: 'Attige|ಅತ್ತಿಗೆ', wYSis: 'Naadini|ನಾದಿನಿ',
  eBroW: 'Attige|ಅತ್ತಿಗೆ', yBroW: 'Naadini|ನಾದಿನಿ', eSisH: 'Bhava|ಭಾವ', ySisH: 'Maiduna|ಮೈದುನ',
  hBroW: 'Oragitti|ಓರಗಿತ್ತಿ', wSisH: 'Shadaka|ಷಡ್ಡಕ',
};

// ---------------------------------------------------------------------------------------------- Malayalam
const MALAYALAM: KinTable = {
  father: 'Achan|അച്ഛൻ', mother: 'Amma|അമ്മ',
  gfP: 'Achachan|അച്ഛച്ഛൻ', gmP: 'Achamma|അച്ഛമ്മ', gfM: 'Appooppan|അപ്പൂപ്പൻ', gmM: 'Ammamma|അമ്മമ്മ',
  son: 'Makan|മകൻ', daughter: 'Makal|മകൾ', sonSon: 'Kochumakan|കൊച്ചുമകൻ', sonDau: 'Kochumakal|കൊച്ചുമകൾ', dauSon: 'Kochumakan|കൊച്ചുമകൻ', dauDau: 'Kochumakal|കൊച്ചുമകൾ',
  husband: 'Bharthavu|ഭർത്താവ്', wife: 'Bharya|ഭാര്യ', fil: 'Ammayiachan|അമ്മായിയച്ഛൻ', mil: 'Ammayiamma|അമ്മായിയമ്മ',
  sonInLaw: 'Marumakan|മരുമകൻ', dauInLaw: 'Marumakal|മരുമകൾ',
  eBro: 'Chettan|ചേട്ടൻ', yBro: 'Aniyan|അനിയൻ', eSis: 'Chechi|ചേച്ചി', ySis: 'Aniyathi|അനിയത്തി',
  fEBro: 'Valiyachan|വലിയച്ഛൻ', fYBro: 'Kochachan|കൊച്ചച്ഛൻ', fSis: 'Ammayi|അമ്മായി', mBro: 'Ammavan|അമ്മാവൻ', mESis: 'Valiyamma|വലിയമ്മ', mYSis: 'Kunjamma|കുഞ്ഞമ്മ',
  fEBroW: 'Valiyamma|വലിയമ്മ', fYBroW: 'Elayamma|ഇളയമ്മ', mBroW: 'Ammayi|അമ്മായി', mESisH: 'Valiyachan|വലിയച്ഛൻ', mYSisH: 'Kochachan|കൊച്ചച്ഛൻ',
  gpBroP: 'Appooppan|അപ്പൂപ്പൻ', gpSisP: 'Ammoomma|അമ്മൂമ്മ', gpBroM: 'Appooppan|അപ്പൂപ്പൻ', gpSisM: 'Ammoomma|അമ്മൂമ്മ',
  hBro: 'Aliyan|അളിയൻ', hSis: 'Naathoon|നാത്തൂൻ', wBro: 'Aliyan|അളിയൻ', wSis: 'Naathoon|നാത്തൂൻ',
  eBroW: 'Chettathi|ചേട്ടത്തി', sisH: 'Aliyan|അളിയൻ',
};

// ---------------------------------------------------------------------------------------------- Tamil
/**
 * Tamil, as Iyer families and most Tamil homes say it (the original pack: lib/tamil.test.ts).
 * Tamil kinship turns on older/younger and on cross vs parallel links, like the other South Indian packs,
 * but has a few words of its own, so it keeps its own function.
 */
function tamil(r: Role): Term | null {
  const m = r.sex === 'm', f = r.sex === 'f', known = m || f;
  const by = (a: string, b: string) => T(m ? a : f ? b : null);
  const sib = (older: boolean | null) =>
    m ? T(older === null ? 'Anna / Thambi' : older ? 'Anna|அண்ணா' : 'Thambi|தம்பி')
      : f ? T(older === null ? 'Akka / Thangai' : older ? 'Akka|அக்கா' : 'Thangai|தங்கை') : null;
  const uncle = (side: string | undefined, sex: string, older: boolean | null): string | null => {
    if (side === 'P') {
      if (sex === 'f') return 'Athai';
      if (sex === 'm') return older === null ? 'Periyappa / Chithappa' : older ? 'Periyappa' : 'Chithappa';
    }
    if (side === 'M') {
      if (sex === 'm') return 'Mama';
      if (sex === 'f') return older === null ? 'Periyamma / Chithi' : older ? 'Periyamma' : 'Chithi';
    }
    return null;
  };
  const SCRIPT: Record<string, string> = {
    Athai: 'அத்தை', Periyappa: 'பெரியப்பா', Chithappa: 'சித்தப்பா', Mama: 'மாமா', Periyamma: 'பெரியம்மா', Chithi: 'சித்தி',
    Mami: 'மாமி', Athimber: 'அத்திம்பேர்',
  };
  const W = (w: string | null) => (w ? T(SCRIPT[w] ? `${w}|${SCRIPT[w]}` : w) : null);
  switch (r.key) {
    case 'parent': return by('Appa|அப்பா', 'Amma|அம்மா');
    case 'grandparent': return by('Thatha|தாத்தா', 'Paati|பாட்டி');
    case 'ggparent': return by('Kollu thatha|கொள்ளுத் தாத்தா', 'Kollu paati|கொள்ளுப் பாட்டி');
    case 'child': return by('Magan|மகன்', 'Magal|மகள்');
    case 'grandchild': return by('Peran|பேரன்', 'Pethi|பேத்தி');
    case 'ggchild': return by('Kollu peran|கொள்ளுப் பேரன்', 'Kollu pethi|கொள்ளுப் பேத்தி');
    case 'spouse': return by('Aathukaarar|ஆத்துக்காரர்', 'Aathukaari|ஆத்துக்காரி');
    case 'spouse_parent': return by('Maamanar|மாமனார்', 'Maamiyar|மாமியார்');
    case 'spouse_grandparent': return by('Thatha|தாத்தா', 'Paati|பாட்டி');
    case 'child_spouse': return by('Maapillai|மாப்பிள்ளை', 'Marumagal|மருமகள்');
    case 'co_parent_in_law': return known ? T('Sambandhi|சம்பந்தி') : null;
    case 'sibling': return sib(r.older);
    case 'parent_sibling': return W(uncle(r.side, r.sex, r.older));
    case 'parent_sibling_spouse': {
      const u = uncle(r.side, r.via || '', r.older);
      return W(({ Periyappa: 'Periyamma', Chithappa: 'Chithi', Athai: 'Athimber', Mama: 'Mami', Periyamma: 'Periyappa', Chithi: 'Chithappa' } as Record<string, string>)[u || ''] || null);
    }
    case 'sibling_child':
      if (!r.ego || !r.via) return null;
      return r.ego === r.via ? by('Magan|மகன்', 'Magal|மகள்') : by('Marumagan|மருமகன்', 'Marumagal|மருமகள்');
    case 'cousin': {
      if (!r.side || !r.via) return null;
      if ((r.side === 'P' ? 'm' : 'f') === r.via) return sib(r.older); // parallel cousins are brothers and sisters
      const who = r.via === 'm' ? 'Mama' : 'Athai';
      return by(`${who} paiyan`, `${who} ponnu`);
    }
    case 'grandparent_sibling':
      if (f) return T('Paati|பாட்டி');
      if (!m) return null;
      return T(r.older === null ? 'Thatha|தாத்தா' : r.older ? 'Periya thatha|பெரிய தாத்தா' : 'Chinna thatha|சின்ன தாத்தா');
    case 'spouse_sibling':
      if (r.ego === 'f') { if (f) return T('Naathanaar|நாத்தனார்'); if (m) return r.older === false ? T('Kozhundhanar|கொழுந்தனார்') : null; }
      if (r.ego === 'm') { if (m) return T('Machinan|மச்சினன்'); if (f) return r.older === false ? T('Machini|மச்சினி') : null; }
      return null;
    case 'sibling_spouse':
      if (r.via === 'm' && f && r.older) return T('Manni|மன்னி');
      if (r.via === 'f' && m && r.older) return T('Athimber|அத்திம்பேர்');
      return null;
    case 'spouse_sibling_spouse':
      if (r.ego === 'm' && r.via === 'f' && m) return T('Sagalai|சகலை');
      if (r.ego === 'f' && r.via === 'm' && f) return T('Ooragathi|ஓரகத்தி');
      return null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- registry
const G = (gothram: string, kuladeivam: string) => ({ gothram, kuladeivam });
export const PACKS: Record<CommunityId, Pack> = {
  hindi: { id: 'hindi', name: 'Hindi', native: 'हिन्दी', lang: 'hi', hello: 'Namaste', term: (r) => fromTable(HINDI, r), menus: MENUS.hi, labels: G('Gotra', 'Kuldevta / Kuldevi'), date: 'purnimanta', festivals: ['national', 'hindu', 'north'], starBirthday: false, art: 'plain' },
  punjabi: { id: 'punjabi', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', lang: 'pa', hello: 'Sat Sri Akal', term: (r) => fromTable(PUNJABI, r), menus: MENUS.pa, labels: G('Gotra', 'Kuldevi / Jathera'), date: 'purnimanta', festivals: ['national', 'punjab', 'sikh', 'hindu', 'north'], starBirthday: false, art: 'plain' },
  bengali: { id: 'bengali', name: 'Bengali', native: 'বাংলা', lang: 'bn', hello: 'Nomoshkar', term: (r) => fromTable(BENGALI, r), menus: MENUS.bn, labels: G('Gotra', 'Kuladevata'), date: 'bengali', festivals: ['national', 'bengal', 'hindu'], starBirthday: false, art: 'plain' },
  marathi: { id: 'marathi', name: 'Marathi', native: 'मराठी', lang: 'mr', hello: 'Namaskar', term: (r) => fromTable(MARATHI, r), menus: MENUS.mr, labels: G('Gotra', 'Kuldaivat'), date: 'amanta', festivals: ['national', 'maharashtra', 'hindu'], starBirthday: false, art: 'plain' },
  gujarati: { id: 'gujarati', name: 'Gujarati', native: 'ગુજરાતી', lang: 'gu', hello: 'Kem cho', term: (r) => fromTable(GUJARATI, r), menus: MENUS.gu, labels: G('Gotra', 'Kuldevi'), date: 'amanta', festivals: ['national', 'gujarat', 'hindu', 'north', 'jain'], starBirthday: false, art: 'plain' },
  urdu: { id: 'urdu', name: 'Urdu', native: 'اردو', lang: 'ur', hello: 'Assalamu alaikum', term: (r) => fromTable(URDU, r), menus: MENUS.ur, labels: G('Family line (silsila)', 'Ancestral place'), date: 'hijri', festivals: ['national', 'muslim'], starBirthday: false, art: 'plain', rtl: true },
  tamil: { id: 'tamil', name: 'Tamil', native: 'தமிழ்', lang: 'ta', hello: 'Vanakkam', term: tamil, menus: MENUS.ta, labels: G('Gothram', 'Kuladeivam'), date: 'tamil', festivals: ['national', 'tamil', 'hindu'], starBirthday: true, art: 'south' },
  telugu: {
    id: 'telugu', name: 'Telugu', native: 'తెలుగు', lang: 'te', hello: 'Namaskaram',
    term: dravidian(TELUGU, (s, o) => (s === 'm' ? (o === false ? 'Maridi|మరిది' : 'Bava|బావ') : s === 'f' ? (o === false ? 'Maradalu|మరదలు' : 'Vadina|వదిన') : undefined), ['Menalludu|మేనల్లుడు', 'Menakodalu|మేనకోడలు']),
    menus: MENUS.te, labels: G('Gotram', 'Kuladaivam'), date: 'amanta', festivals: ['national', 'telugu', 'hindu'], starBirthday: false, art: 'south',
  },
  kannada: {
    id: 'kannada', name: 'Kannada', native: 'ಕನ್ನಡ', lang: 'kn', hello: 'Namaskara',
    term: dravidian(KANNADA, (s, o) => (s === 'm' ? (o === false ? 'Maiduna|ಮೈದುನ' : 'Bhava|ಭಾವ') : s === 'f' ? (o === false ? 'Naadini|ನಾದಿನಿ' : 'Attige|ಅತ್ತಿಗೆ') : undefined), ['Aliya|ಅಳಿಯ', 'Sose|ಸೊಸೆ']),
    menus: MENUS.kn, labels: G('Gotra', 'Manedevaru'), date: 'amanta', festivals: ['national', 'karnataka', 'hindu'], starBirthday: false, art: 'south',
  },
  malayalam: {
    id: 'malayalam', name: 'Malayalam', native: 'മലയാളം', lang: 'ml', hello: 'Namaskaram',
    term: dravidian(MALAYALAM, (s) => (s === 'm' ? 'Machunan|മച്ചുനൻ' : s === 'f' ? 'Machuni|മച്ചുനി' : undefined), ['Marumakan|മരുമകൻ', 'Marumakal|മരുമകൾ']),
    menus: MENUS.ml, labels: G('Gothram / Illam', 'Paradevata'), date: 'malayalam', festivals: ['national', 'kerala', 'hindu', 'christian'], starBirthday: true, art: 'south',
  },
  english: { id: 'english', name: 'English only', native: 'English', lang: 'en', hello: 'Hello', term: () => null, menus: {}, labels: G('Gotra / Gothram', 'Family deity'), date: 'none', festivals: ['national'], starBirthday: false, art: 'plain' },
};

export const PACK_LIST: Pack[] = ['hindi', 'punjabi', 'bengali', 'marathi', 'gujarati', 'urdu', 'tamil', 'telugu', 'kannada', 'malayalam', 'english'].map((k) => PACKS[k as CommunityId]);
export const isCommunity = (s: unknown): s is CommunityId => typeof s === 'string' && s in PACKS;
