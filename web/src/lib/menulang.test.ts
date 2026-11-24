import { describe, expect, it } from 'vitest';
import { menuText, TA } from './menulang';
import sidebar from '../components/Sidebar.tsx?raw';
import tabbar from '../components/TabBar.tsx?raw';

describe('Tamil menus', () => {
  it('translates menu words and leaves anything else in English', () => {
    expect(menuText('ta', 'Family tree')).toBe('குடும்ப மரம்');
    expect(menuText('en', 'Family tree')).toBe('Family tree');
    expect(menuText('ta', 'DevCenter')).toBe('DevCenter');
  });
  it('has Tamil for every label in the menu and tab bar', () => {
    const src = sidebar + tabbar;
    for (const m of src.matchAll(/\bt\('([^']+)'\)/g)) expect(TA[m[1]], m[1]).toBeTruthy();
    for (const m of src.matchAll(/I\.\w+, (?:isAdmin \? '[^']+' : )?'([^']+)'(?:, '([^']+)')?\)/g)) for (const w of [m[1], m[2]].filter(Boolean)) if (w !== 'DevCenter') expect(TA[w], w).toBeTruthy();
    for (const m of src.matchAll(/'#\/[a-z-]*', route\.page === '[a-z]+', '([^']+)'/g)) expect(TA[m[1]], m[1]).toBeTruthy();
    for (const v of Object.values(TA)) expect(v).toMatch(/[஀-௿]/);
  });
});
