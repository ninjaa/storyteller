import { AST_NODE_TYPES, parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { diffLines, parsePatch } from 'diff';
import type { Change } from 'diff';
import type {
  SemanticDiffRequest,
  SemanticDiffResponse,
  SemanticChange,
  SplitPatchRequest,
  SplitPatchResponse,
} from './types.js';

type SupportedLanguage = 'ts' | 'tsx' | 'js' | 'jsx';

interface SymbolInfo {
  key: string;
  name: string;
  type: string;
  code: string;
  line: number;
  column: number;
}

export class AstDiffAdapter {
  private readonly supportedLanguages: SupportedLanguage[] = ['ts', 'tsx', 'js', 'jsx'];

  semanticDiff(request: SemanticDiffRequest): SemanticDiffResponse {
    const normalizedLanguage = request.language.toLowerCase();
    if (this.supportedLanguages.includes(normalizedLanguage as SupportedLanguage)) {
      return this.diffTypeScript(request);
    }
    return this.diffTextually(request);
  }

  splitPatchBySymbol(request: SplitPatchRequest): SplitPatchResponse {
    return this.splitByHunk(request.patch);
  }

  private diffTypeScript(request: SemanticDiffRequest): SemanticDiffResponse {
    const beforeSymbols = this.extractSymbols(request.before, request.filePath);
    const afterSymbols = this.extractSymbols(request.after, request.filePath);

    const changes: SemanticChange[] = [];

    for (const [key, afterSymbol] of afterSymbols.entries()) {
      const beforeSymbol = beforeSymbols.get(key);
      if (!beforeSymbol) {
        changes.push({
          type: 'insert',
          symbol: afterSymbol.name,
          detail: `${afterSymbol.type} added`,
          location: { line: afterSymbol.line, column: afterSymbol.column },
        });
        continue;
      }

      if (beforeSymbol.code !== afterSymbol.code) {
        changes.push({
          type: 'update',
          symbol: afterSymbol.name,
          detail: `${afterSymbol.type} modified`,
          location: { line: afterSymbol.line, column: afterSymbol.column },
        });
      }
    }

    for (const [key, beforeSymbol] of beforeSymbols.entries()) {
      if (!afterSymbols.has(key)) {
        changes.push({
          type: 'delete',
          symbol: beforeSymbol.name,
          detail: `${beforeSymbol.type} removed`,
          location: { line: beforeSymbol.line, column: beforeSymbol.column },
        });
      }
    }

    return {
      language: request.language,
      changes,
    };
  }

  private diffTextually(request: SemanticDiffRequest): SemanticDiffResponse {
    const diff = diffLines(request.before, request.after);
    const changes: SemanticChange[] = diff
      .filter((part) => part.added || part.removed)
      .map<SemanticChange>((part: Change, index) => {
        const lineCount = typeof part.count === 'number' ? part.count.toString() : '0';
        const action = part.added ? 'added' : 'removed';
        return {
          type: part.added ? 'insert' : part.removed ? 'delete' : 'update',
          symbol: 'chunk_' + index.toString(),
          detail: `${lineCount} line(s) ${action}`,
        };
      });

    return {
      language: request.language,
      changes,
    };
  }

  private extractSymbols(source: string, filePath?: string): Map<string, SymbolInfo> {
    const ast = parse(source, {
      jsx: true,
      loc: true,
      range: true,
      filePath,
    });

    const symbols = new Map<string, SymbolInfo>();

    for (const statement of ast.body) {
      this.collectSymbolFromNode(statement, source, symbols);
    }

    return symbols;
  }

  private collectSymbolFromNode(
    node: TSESTree.Node,
    source: string,
    symbols: Map<string, SymbolInfo>,
  ): void {
    if (isNamedFunction(node)) {
      const info = getRangeAndStart(node);
      this.storeSymbol(symbols, node.id.name, node.type, info.range, info.start, source);
      return;
    }

    if (isNamedClass(node)) {
      const info = getRangeAndStart(node);
      this.storeSymbol(symbols, node.id.name, node.type, info.range, info.start, source);
      return;
    }

    if (isNamedInterfaceOrAlias(node)) {
      const info = getRangeAndStart(node);
      this.storeSymbol(symbols, node.id.name, node.type, info.range, info.start, source);
      return;
    }

    if (isVariableDeclaration(node)) {
      const info = getRangeAndStart(node);
      for (const declarator of node.declarations) {
        if (declarator.id.type === AST_NODE_TYPES.Identifier) {
          this.storeSymbol(symbols, declarator.id.name, node.kind, info.range, info.start, source);
        }
      }
      return;
    }

    if (
      node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      node.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      const declaration = node.declaration;
      if (declaration) {
        this.collectSymbolFromNode(declaration, source, symbols);
      }
    }
  }

  private storeSymbol(
    symbols: Map<string, SymbolInfo>,
    name: string,
    type: string,
    range: TSESTree.Range,
    start: TSESTree.Position,
    source: string,
  ): void {
    const key = `${type}:${name}`;
    const [startIndex, endIndex] = range;
    const code = source.slice(startIndex, endIndex);
    symbols.set(key, {
      key,
      name,
      type,
      code,
      line: start.line,
      column: start.column,
    });
  }

  private splitByHunk(patch: string): SplitPatchResponse {
    const parsed = parsePatch(patch);
    const chunks: string[] = [];

    for (const file of parsed) {
      for (const hunk of file.hunks) {
        const header = [
          '@@ -',
          typeof hunk.oldStart === 'number' ? hunk.oldStart.toString() : '0',
          ',',
          typeof hunk.oldLines === 'number' ? hunk.oldLines.toString() : '0',
          ' +',
          typeof hunk.newStart === 'number' ? hunk.newStart.toString() : '0',
          ',',
          typeof hunk.newLines === 'number' ? hunk.newLines.toString() : '0',
          ' @@',
        ].join('');
        const body = hunk.lines.join('\n');
        chunks.push(['---', '+++', header, body].join('\n'));
      }
    }

    if (!chunks.length) {
      return { chunks: [patch] };
    }

    return { chunks };
  }
}

function isFunctionDeclaration(node: TSESTree.Node): node is TSESTree.FunctionDeclaration {
  return node.type === AST_NODE_TYPES.FunctionDeclaration;
}

function isClassDeclaration(node: TSESTree.Node): node is TSESTree.ClassDeclaration {
  return node.type === AST_NODE_TYPES.ClassDeclaration;
}

function isInterfaceDeclaration(node: TSESTree.Node): node is TSESTree.TSInterfaceDeclaration {
  return node.type === AST_NODE_TYPES.TSInterfaceDeclaration;
}

function isTypeAliasDeclaration(node: TSESTree.Node): node is TSESTree.TSTypeAliasDeclaration {
  return node.type === AST_NODE_TYPES.TSTypeAliasDeclaration;
}

function isNamedFunction(
  node: TSESTree.Node,
): node is TSESTree.FunctionDeclaration & { id: TSESTree.Identifier } {
  return isFunctionDeclaration(node) && node.id !== null;
}

function isNamedClass(
  node: TSESTree.Node,
): node is TSESTree.ClassDeclaration & { id: TSESTree.Identifier } {
  return isClassDeclaration(node) && node.id !== null;
}

function isNamedInterfaceOrAlias(
  node: TSESTree.Node,
): node is (TSESTree.TSInterfaceDeclaration | TSESTree.TSTypeAliasDeclaration) & {
  id: TSESTree.Identifier;
} {
  return isInterfaceDeclaration(node) || isTypeAliasDeclaration(node);
}

function isVariableDeclaration(node: TSESTree.Node): node is TSESTree.VariableDeclaration {
  return node.type === AST_NODE_TYPES.VariableDeclaration;
}

function getRangeAndStart(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.ClassDeclaration
    | TSESTree.TSInterfaceDeclaration
    | TSESTree.TSTypeAliasDeclaration
    | TSESTree.VariableDeclaration,
): { range: TSESTree.Range; start: TSESTree.Position } {
  return { range: node.range, start: node.loc.start };
}

export const astDiff = new AstDiffAdapter();
