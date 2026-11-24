import { describe, expect, it } from 'vitest';
import { encodeWav, normalise, RATE } from './wav';
import { insertSpoken, STYLES } from '../components/WritingHelp';

describe('speak to write', () => {
  it('makes a 16 kHz mono 16-bit WAV', () => {
    const w = encodeWav(new Float32Array([0, 1, -1, 0.5]));
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...w.slice(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(RATE);
    expect(v.getUint16(34, true)).toBe(16);
    expect(w.length).toBe(44 + 8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
  it('a minute stays well under the upload limit', () => {
    expect(encodeWav(new Float32Array(RATE * 60)).length).toBeLessThan(2_400_000);
  });
  it('makes quiet speech louder but leaves silence alone', () => {
    expect(Math.max(...normalise(new Float32Array([0.1, -0.2])))).toBeCloseTo(0.45);
    const quiet = new Float32Array([0.001, 0]); expect(normalise(quiet)).toBe(quiet);
  });
  it('puts spoken words at the cursor with sensible spaces', () => {
    expect(insertSpoken('', 'Hello Akka.')).toEqual({ value: 'Hello Akka.', caret: 11 });
    expect(insertSpoken('Hi all.', 'See you Sunday.')).toEqual({ value: 'Hi all. See you Sunday.', caret: 23 });
    expect(insertSpoken('Hi  there', ' dear ', 3).value).toBe('Hi dear there');
  });
});

describe('help me write', () => {
  it('offers the four styles the Worker knows', () => {
    expect(STYLES.map((s) => s.k)).toEqual(['grammar', 'clearer', 'shorter', 'warmer']);
  });
});
