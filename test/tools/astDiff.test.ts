import { describe, expect, it } from 'vitest';
import { astDiff } from '../../src/index.js';

describe('AstDiffAdapter.semanticDiff', () => {
  it('detects added, updated, and removed symbols in TypeScript', () => {
    const before = `function stay() {\n  return true;\n}\n\nfunction toRemove() {\n  return false;\n}`;
    const after = `function stay() {\n  return true;\n}\n\nfunction added() {\n  return 1;\n}`;

    const result = astDiff.semanticDiff({ before, after, language: 'ts', filePath: 'example.ts' });

    const changeTypes = result.changes.map((change) => change.type);
    expect(changeTypes).toContain('insert');
    expect(changeTypes).toContain('delete');
    expect(changeTypes).not.toContain('update');
  });

  it('falls back to textual diff for unsupported languages', () => {
    const before = 'line one\nline two';
    const after = 'line one\nline three';

    const result = astDiff.semanticDiff({ before, after, language: 'py' });
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].symbol).toBe('chunk_0');
  });
});

describe('AstDiffAdapter.splitPatchBySymbol', () => {
  it('splits patch into hunks when AST support unavailable', () => {
    const patch = `diff --git a/sample.py b/sample.py\nindex 111..222 100644\n--- a/sample.py\n+++ b/sample.py\n@@ -1,2 +1,2 @@\n-line_one\n-line_two\n+line_one\n+line_three\n`;

    const result = astDiff.splitPatchBySymbol({ patch, language: 'py' });
    expect(result.chunks.length).toBeGreaterThanOrEqual(1);
  });
});
