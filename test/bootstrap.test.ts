import { describe, expect, it } from 'vitest';
import { STORYTELLER_DESCRIPTION, STORYTELLER_VERSION } from '../src/index.js';

describe('bootstrap scaffolding', () => {
  it('exposes a semantic version', () => {
    expect(STORYTELLER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('describes the project succinctly', () => {
    expect(STORYTELLER_DESCRIPTION.length).toBeGreaterThan(10);
  });
});
