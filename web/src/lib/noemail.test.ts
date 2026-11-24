import { describe, expect, it } from 'vitest';
import { missingText, type Missing } from '../components/NoEmailList';

const m = (o: Partial<Missing>): Missing => ({ id: 'X', name: 'X', branch: '', parents: '', ask: [], email: null, phone: null, ...o });

describe('no-email list for WhatsApp', () => {
  it('groups by branch and says who to ask', () => {
    const t = missingText([
      m({ name: 'Ananya Ramesh', branch: 'Meera Iyer', parents: 'Ramesh & Uma', ask: ['Uma Ramesh'] }),
      m({ name: 'Arun Kumar', branch: 'Meera Iyer' }),
      m({ name: 'Sita Raman', branch: 'Lakshmi Menon' }),
    ]);
    expect(t).toContain('_Meera Iyer’s family_');
    expect(t).toContain('• Ananya Ramesh (child of Ramesh & Uma) — ask Uma Ramesh');
    expect(t).toContain('• Arun Kumar\n');
    expect(t.indexOf('Lakshmi')).toBeGreaterThan(t.indexOf('Arun'));
    expect(t).not.toMatch(/\n{3}/);
  });
  it('never includes emails or phone numbers', () => {
    const t = missingText([m({ name: 'A', email: 'a@x.in', phone: '+91 99999 99999' })]);
    expect(t).not.toContain('a@x.in');
    expect(t).not.toContain('99999');
  });
});
