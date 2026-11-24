import { describe, expect, it } from 'vitest';
import { buildFamily } from './family';
import { kinTerm, PACKS, PACK_LIST, termText, type CommunityId } from './community';
import { MENUS } from './community/menus';
import { roleOf } from './kin/roles';
import type { Person } from './types';

const P = (id: string, gender: string, birth_year: number): Person => ({
  id, given_name: id, surname: '', birth_surname: '', gender, birth_year, is_living: true, death_date: null, death_place: null, sort_key: `${birth_year}.001`,
});
// Main tree: Thatha+Paati → Appa(m,1955), Athai(f,1950), Chithappa(m,1960)
//   Appa+Amma → Arjun(m,1983), Akka(f,1980)   Athai+Athimber → AthaiSon(m,1978)
//   Chithappa+Chithi → Cousin(m,1990)          Akka+AkkaHub → Niece(f,2010)
// Amma's side: AmmaFather+AmmaMother → Amma(f,1958), Mama(m,1962) ; Mama+Mami → MamaDaughter(f,1988)
// Arjun+Kavya ; Kavya's side: DF+DM → Kavya(f,1986), WifeSis(f,1990), WifeBro(m,1992) ; WifeSis+Cobro
const people = [
  P('Thatha', 'm', 1925), P('Paati', 'f', 1930), P('Appa', 'm', 1955), P('Athai', 'f', 1950), P('Chithappa', 'm', 1960),
  P('Amma', 'f', 1958), P('Athimber', 'm', 1945), P('Chithi', 'f', 1965), P('Arjun', 'm', 1983), P('Akka', 'f', 1980),
  P('AthaiSon', 'm', 1978), P('Cousin', 'm', 1990), P('AkkaHub', 'm', 1975), P('Niece', 'f', 2010),
  P('AmmaFather', 'm', 1930), P('AmmaMother', 'f', 1935), P('Mama', 'm', 1962), P('Mami', 'f', 1966), P('MamaDaughter', 'f', 1988),
  P('Kavya', 'f', 1986), P('DF', 'm', 1955), P('DM', 'f', 1960), P('WifeSis', 'f', 1990), P('WifeBro', 'm', 1992), P('Cobro', 'm', 1987),
];
const L: [string, string][] = [
  ['Appa', 'Thatha'], ['Appa', 'Paati'], ['Athai', 'Thatha'], ['Athai', 'Paati'], ['Chithappa', 'Thatha'], ['Chithappa', 'Paati'],
  ['Arjun', 'Appa'], ['Arjun', 'Amma'], ['Akka', 'Appa'], ['Akka', 'Amma'], ['AthaiSon', 'Athai'], ['AthaiSon', 'Athimber'],
  ['Cousin', 'Chithappa'], ['Cousin', 'Chithi'], ['Niece', 'Akka'], ['Niece', 'AkkaHub'],
  ['Amma', 'AmmaFather'], ['Amma', 'AmmaMother'], ['Mama', 'AmmaFather'], ['Mama', 'AmmaMother'], ['MamaDaughter', 'Mama'], ['MamaDaughter', 'Mami'],
  ['Kavya', 'DF'], ['Kavya', 'DM'], ['WifeSis', 'DF'], ['WifeSis', 'DM'], ['WifeBro', 'DF'], ['WifeBro', 'DM'],
];
const S: [string, string][] = [['Thatha', 'Paati'], ['Appa', 'Amma'], ['Athai', 'Athimber'], ['Chithappa', 'Chithi'], ['Akka', 'AkkaHub'],
  ['AmmaFather', 'AmmaMother'], ['Mama', 'Mami'], ['Arjun', 'Kavya'], ['DF', 'DM'], ['WifeSis', 'Cobro']];
const f = buildFamily(people, L.map(([c, p]) => ({ child_id: c, parent_id: p, kind: 'biological' })),
  S.map(([a, b]) => ({ person_a: a, person_b: b, kind: 'married', is_current: true, start_date: null, place: null })));
const w = (c: CommunityId, other: string, ego = 'Arjun') => kinTerm(f, other, ego, PACKS[c])?.word ?? null;

describe('roles', () => {
  it('knows the side, the link and who is older', () => {
    expect(roleOf(f, 'Chithappa', 'Arjun')).toMatchObject({ key: 'parent_sibling', side: 'P', sex: 'm', older: false });
    expect(roleOf(f, 'Mama', 'Arjun')).toMatchObject({ key: 'parent_sibling', side: 'M', sex: 'm' });
    expect(roleOf(f, 'AthaiSon', 'Arjun')).toMatchObject({ key: 'cousin', side: 'P', via: 'f', older: true });
    expect(roleOf(f, 'Niece', 'Arjun')).toMatchObject({ key: 'sibling_child', via: 'f', ego: 'm' });
    expect(roleOf(f, 'WifeBro', 'Arjun')).toMatchObject({ key: 'spouse_sibling', ego: 'm', older: false });
  });
});

describe('Hindi', () => {
  it('tells Tauji from Chacha, and Bua, Mama, Mausi apart', () => {
    expect(w('hindi', 'Chithappa')).toBe('Chacha');
    expect(w('hindi', 'Athai')).toBe('Bua');
    expect(w('hindi', 'Mama')).toBe('Mama');
    expect(w('hindi', 'Athimber')).toBe('Phupha');
    expect(w('hindi', 'Mami')).toBe('Mami');
    expect(w('hindi', 'Thatha')).toBe('Dada');
    expect(w('hindi', 'AmmaFather')).toBe('Nana');
  });
  it('names cousins by the link: chachera, phuphera, mamera', () => {
    expect(w('hindi', 'Cousin')).toBe('Chachera bhai');
    expect(w('hindi', 'AthaiSon')).toBe('Phuphera bhai');
    expect(w('hindi', 'MamaDaughter')).toBe('Mameri behen');
  });
  it('in-laws: saala, saali, saadu, didi, jija, bhanji', () => {
    expect(w('hindi', 'WifeBro')).toBe('Saala');
    expect(w('hindi', 'WifeSis')).toBe('Saali');
    expect(w('hindi', 'Cobro')).toBe('Saadu');
    expect(w('hindi', 'Akka')).toBe('Didi');
    expect(w('hindi', 'AkkaHub')).toBe('Jija ji');
    expect(w('hindi', 'Niece')).toBe('Bhanji');
    expect(w('hindi', 'Arjun', 'Kavya')).toBe('Pati');
    expect(w('hindi', 'Akka', 'Kavya')).toBe('Nanad');
  });
  it('shows the word in its own script too', () => {
    expect(termText(kinTerm(f, 'Athai', 'Arjun', PACKS.hindi))).toBe('Bua (बुआ)');
  });
});

describe('other North Indian packs', () => {
  it('Punjabi, Bengali, Marathi, Gujarati, Urdu', () => {
    expect(w('punjabi', 'Chithappa')).toBe('Chacha ji');
    expect(w('punjabi', 'Athai')).toBe('Bhua ji');
    expect(w('bengali', 'Chithappa')).toBe('Kaku');
    expect(w('bengali', 'Athai')).toBe('Pishi');
    expect(w('bengali', 'Akka')).toBe('Didi');
    expect(w('marathi', 'Athai')).toBe('Atya');
    expect(w('marathi', 'Niece')).toBe('Bhachi');
    expect(w('gujarati', 'Athai')).toBe('Foi');
    expect(w('gujarati', 'Mami')).toBe('Mami');
    expect(w('urdu', 'Mama')).toBe('Mamu');
    expect(w('urdu', 'AmmaMother')).toBe('Nani');
    expect(kinTerm(f, 'Mama', 'Arjun', PACKS.urdu)?.native).toBe('ماموں');
  });
});

describe('South Indian packs', () => {
  it('parallel cousins are brothers and sisters; cross cousins have their own words', () => {
    expect(w('telugu', 'Cousin')).toBe('Tammudu');
    expect(w('telugu', 'AthaiSon')).toBe('Bava');
    expect(w('telugu', 'MamaDaughter')).toBe('Maradalu'); // younger than Arjun
    expect(w('kannada', 'Cousin')).toBe('Thamma');
    expect(w('kannada', 'AthaiSon')).toBe('Bhava');
    expect(w('malayalam', 'AthaiSon')).toBe('Machunan');
  });
  it('a man\'s sister\'s child is a cross niece or nephew', () => {
    expect(w('telugu', 'Niece')).toBe('Menakodalu');
    expect(w('kannada', 'Niece')).toBe('Sose');
    expect(w('telugu', 'Chithappa')).toBe('Babai');
    expect(w('kannada', 'Chithappa')).toBe('Chikkappa');
    expect(w('malayalam', 'Mama')).toBe('Ammavan');
  });
});

describe('every pack', () => {
  it('has a word for parents and spouses (except English only), and menus in its language', () => {
    for (const p of PACK_LIST) {
      if (p.id === 'english') { expect(w('english', 'Appa')).toBeNull(); continue; }
      expect(kinTerm(f, 'Appa', 'Arjun', p), p.id).not.toBeNull();
      expect(kinTerm(f, 'Kavya', 'Arjun', p), p.id).not.toBeNull();
      expect(Object.keys(p.menus).length, p.id).toBe(Object.keys(MENUS.ta).length);
    }
  });
});
