import { describe, expect, it } from 'vitest';

import { detectFormat, isXlsx } from '../detect';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

describe('detectFormat', () => {
  it('reconnaît un XLSX par la signature ZIP (PK\\x03\\x04)', () => {
    const xlsx = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
    expect(isXlsx(xlsx)).toBe(true);
    expect(detectFormat(xlsx)).toBe('xlsx');
  });

  it('traite tout contenu texte comme délimité', () => {
    const csv = new TextEncoder().encode('a,b,c\n1,2,3');
    expect(isXlsx(csv)).toBe(false);
    expect(detectFormat(csv)).toBe('delimited');
  });

  it('ne confond pas une archive ZIP tronquée', () => {
    expect(isXlsx(bytes(0x50, 0x4b))).toBe(false);
    expect(detectFormat(bytes(0x50, 0x4b))).toBe('delimited');
  });

  it('distingue une signature ZIP partielle non conforme', () => {
    expect(isXlsx(bytes(0x50, 0x4b, 0x05, 0x06))).toBe(false);
  });
});
