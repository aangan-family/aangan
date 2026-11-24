import { describe as suite, expect, it } from 'vitest';
import { buildFamily, rowOf } from './family';
import { describe } from './kinship';
import { tamilTerm } from './tamil';
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
const t = (other: string, ego = 'Arjun') => tamilTerm(f, other, ego);

suite('connected families', () => {
  it('groups each married-in person’s family as a side', () => {
    expect(f.root).toBe('Thatha');
    const amma = f.sides.find((s) => s.through === 'Amma')!;
    expect(amma.members.sort()).toEqual(['AmmaFather', 'AmmaMother', 'Mama', 'MamaDaughter', 'Mami']);
    expect(amma.tops).toEqual(['AmmaFather']);
    const wife = f.sides.find((s) => s.through === 'Kavya')!;
    expect(wife.members.sort()).toEqual(['Cobro', 'DF', 'DM', 'WifeBro', 'WifeSis']);
    expect(f.others).toEqual([]);
  });
  it('gives sides generations relative to the main tree', () => {
    expect(f.gen.get('Arjun')).toBe(3);
    expect(f.gen.get('DF')).toBe(2);
    expect(f.gen.get('AmmaFather')).toBe(1);
    expect(f.gen.get('MamaDaughter')).toBe(3);
    expect(f.maxGen).toBe(4);
  });
  it('places married-in people next to their partner, and side members on their own rows', () => {
    expect(rowOf(f, 'Kavya')).toBe('Arjun');
    expect(rowOf(f, 'WifeSis')).toBe('WifeSis');
    expect(rowOf(f, 'Cobro')).toBe('WifeSis');
    expect(f.kids.get('DF')).toEqual(['Kavya', 'WifeSis', 'WifeBro']);
  });
  it('describes relatives far out through marriage', () => {
    const txt = (a: string, b: string) => describe(f, a, b).sentence.map((s) => (s.t === 'name' ? s.id : s.s)).join('');
    expect(txt('Cobro', 'Arjun')).toBe('Cobro and Arjun are married to siblings: WifeSis is Kavya’s sister.');
    expect(txt('Cobro', 'Appa')).toBe('Cobro is Appa’s son’s wife’s sister’s husband.');
    expect(txt('MamaDaughter', 'Kavya')).toBe('MamaDaughter is the first cousin of Kavya’s husband, Arjun.');
  });
});

suite('Tamil kinship terms', () => {
  it('parents and grandparents', () => {
    expect(t('Appa')).toBe('Appa'); expect(t('Amma')).toBe('Amma');
    expect(t('Thatha')).toBe('Thatha'); expect(t('AmmaMother')).toBe('Paati');
  });
  it('elder and younger', () => {
    expect(t('Akka')).toBe('Akka');
    expect(t('Arjun', 'Akka')).toBe('Thambi');
    expect(t('Chithappa')).toBe('Chithappa');
    expect(t('Athai')).toBe('Athai');
    expect(t('Mama')).toBe('Mama');
  });
  it('spouses of uncles and aunts', () => {
    expect(t('Chithi')).toBe('Chithi'); expect(t('Athimber')).toBe('Athimber'); expect(t('Mami')).toBe('Mami');
  });
  it('parallel and cross cousins', () => {
    expect(t('Cousin')).toBe('Thambi');              // father's brother's son
    expect(t('AthaiSon')).toBe('Athai paiyan');       // father's sister's son
    expect(t('MamaDaughter')).toBe('Mama ponnu');     // mother's brother's daughter
  });
  it('nephews and nieces follow the sibling’s sex', () => {
    expect(t('Niece')).toBe('Marumagal');             // a man's sister's daughter
    expect(t('Niece', 'Amma')).toBe('Pethi');
  });
  it('in-laws', () => {
    expect(t('Kavya')).toBe('Aathukaari');
    expect(t('Arjun', 'Kavya')).toBe('Aathukaarar');
    expect(t('DF')).toBe('Maamanar'); expect(t('DM')).toBe('Maamiyar');
    expect(t('WifeBro')).toBe('Machinan');
    expect(t('WifeSis')).toBe('Machini');
    expect(t('AkkaHub')).toBe('Athimber');            // elder sister's husband
    expect(t('Cobro')).toBe('Sagalai');               // co-brother
    expect(t('Arjun', 'DF')).toBe('Maapillai');
    expect(t('Kavya', 'Appa')).toBe('Marumagal');
    expect(t('DF', 'Appa')).toBe('Sambandhi');
  });
});
