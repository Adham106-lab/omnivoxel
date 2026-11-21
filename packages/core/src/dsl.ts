import { Coord3D } from './types.js';

export interface SourceLocation {
  line: number;
  column: number;
}

export interface VoxelAstNode {
  type: 'VoxelDeclaration';
  id: string;
  coord: Coord3D;
  voxelType: string;
  role?: string;
  properties: Record<string, string | number | boolean>;
  loc?: SourceLocation;
}

export interface AssemblyAstMetadata {
  name?: string;
  properties: Record<string, string | number | boolean>;
}

export interface VoxelAst {
  type: 'VoxelAssemblyAst';
  metadata: AssemblyAstMetadata;
  voxels: VoxelAstNode[];
}

export class DslParseError extends Error {
  public constructor(
    message: string,
    public readonly line: number,
    public readonly column: number
  ) {
    super(`DSL Parse Error at line ${line}, column ${column}: ${message}`);
    this.name = 'DslParseError';
  }
}

/**
 * Token types recognized by the OmniVoxel DSL lexer.
 */
type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACE'
  | 'RBRACE'
  | 'COMMA'
  | 'COLON'
  | 'EQUALS'
  | 'AT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;

  public constructor(private readonly input: string) {}

  public nextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.input.length) {
      return { type: 'EOF', value: '', line: this.line, column: this.col };
    }

    const startLine = this.line;
    const startCol = this.col;
    const ch = this.input[this.pos];

    if (ch === '(') {
      this.advance();
      return { type: 'LPAREN', value: '(', line: startLine, column: startCol };
    }
    if (ch === ')') {
      this.advance();
      return { type: 'RPAREN', value: ')', line: startLine, column: startCol };
    }
    if (ch === '{') {
      this.advance();
      return { type: 'LBRACE', value: '{', line: startLine, column: startCol };
    }
    if (ch === '}') {
      this.advance();
      return { type: 'RBRACE', value: '}', line: startLine, column: startCol };
    }
    if (ch === ',') {
      this.advance();
      return { type: 'COMMA', value: ',', line: startLine, column: startCol };
    }
    if (ch === ':') {
      this.advance();
      return { type: 'COLON', value: ':', line: startLine, column: startCol };
    }
    if (ch === '=') {
      this.advance();
      return { type: 'EQUALS', value: '=', line: startLine, column: startCol };
    }
    if (ch === '@') {
      this.advance();
      return { type: 'AT', value: '@', line: startLine, column: startCol };
    }

    // String literal
    if (ch === '"' || ch === "'") {
      return this.readString(ch, startLine, startCol);
    }

    // Number literal (supports negative integers/floats)
    if (ch === '-' || ch === '+' || (ch >= '0' && ch <= '9')) {
      const nextChar = this.input[this.pos + 1];
      if (
        (ch === '-' || ch === '+') &&
        !(nextChar >= '0' && nextChar <= '9')
      ) {
        // Not a number, treat as identifier character
      } else {
        return this.readNumber(startLine, startCol);
      }
    }

    // Identifier or keyword
    return this.readIdentifier(startLine, startCol);
  }

  private advance(): string {
    const ch = this.input[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
        continue;
      }

      // Line comments: // or #
      if (
        ch === '#' ||
        (ch === '/' && this.input[this.pos + 1] === '/')
      ) {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
          this.advance();
        }
        continue;
      }

      // Block comments: /* ... */
      if (ch === '/' && this.input[this.pos + 1] === '*') {
        this.advance();
        this.advance();
        while (
          this.pos < this.input.length &&
          !(this.input[this.pos] === '*' && this.input[this.pos + 1] === '/')
        ) {
          this.advance();
        }
        if (this.pos < this.input.length) {
          this.advance(); // *
          this.advance(); // /
        }
        continue;
      }

      break;
    }
  }

  private readString(quote: string, line: number, col: number): Token {
    this.advance(); // skip opening quote
    let val = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.advance();
        const esc = this.advance();
        if (esc === 'n') val += '\n';
        else if (esc === 't') val += '\t';
        else val += esc;
      } else {
        val += this.advance();
      }
    }
    if (this.pos >= this.input.length) {
      throw new DslParseError('Unterminated string literal', line, col);
    }
    this.advance(); // skip closing quote
    return { type: 'STRING', value: val, line, column: col };
  }

  private readNumber(line: number, col: number): Token {
    let numStr = '';
    if (this.peek() === '-' || this.peek() === '+') {
      numStr += this.advance();
    }
    let hasDot = false;
    while (this.pos < this.input.length) {
      const c = this.peek();
      if (c >= '0' && c <= '9') {
        numStr += this.advance();
      } else if (c === '.' && !hasDot) {
        hasDot = true;
        numStr += this.advance();
      } else {
        break;
      }
    }
    return { type: 'NUMBER', value: numStr, line, column: col };
  }

  private readIdentifier(line: number, col: number): Token {
    let id = '';
    while (this.pos < this.input.length) {
      const c = this.peek();
      // Allow letters, digits, underscores, dashes, dots
      if (
        (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c === '_' ||
        c === '-' ||
        c === '.'
      ) {
        id += this.advance();
      } else {
        break;
      }
    }
    return { type: 'IDENTIFIER', value: id, line, column: col };
  }
}

/**
 * Recursive descent parser for the OmniVoxel declarative DSL.
 */
export class DslParser {
  private current!: Token;
  private lexer!: Lexer;

  public parse(input: string): VoxelAst {
    this.lexer = new Lexer(input);
    this.nextToken();

    const ast: VoxelAst = {
      type: 'VoxelAssemblyAst',
      metadata: { properties: {} },
      voxels: [],
    };

    while (this.current.type !== 'EOF') {
      if (this.current.type === 'IDENTIFIER') {
        if (this.current.value === 'assembly') {
          this.parseAssemblyHeader(ast);
        } else if (this.current.value === 'voxel') {
          ast.voxels.push(this.parseVoxelDeclaration());
        } else {
          throw new DslParseError(
            `Unexpected top-level statement "${this.current.value}". Expected "voxel" or "assembly".`,
            this.current.line,
            this.current.column
          );
        }
      } else {
        throw new DslParseError(
          `Unexpected token "${this.current.value}". Expected "voxel" declaration.`,
          this.current.line,
          this.current.column
        );
      }
    }

    return ast;
  }

  private is(type: TokenType): boolean {
    return (this.current.type as string) === type;
  }

  private nextToken(): Token {
    this.current = this.lexer.nextToken();
    return this.current;
  }

  private expect(type: TokenType, expectedDesc?: string): Token {
    if (!this.is(type)) {
      throw new DslParseError(
        `Expected ${expectedDesc || type}, found "${this.current.value}" (${this.current.type})`,
        this.current.line,
        this.current.column
      );
    }
    const tok = this.current;
    this.nextToken();
    return tok;
  }

  private parseAssemblyHeader(ast: VoxelAst): void {
    this.expect('IDENTIFIER'); // 'assembly'
    if (this.is('STRING') || this.is('IDENTIFIER')) {
      ast.metadata.name = this.current.value;
      this.nextToken();
    }
    if (this.is('LBRACE')) {
      this.nextToken();
      while (!this.is('RBRACE') && !this.is('EOF')) {
        const key = this.expect('IDENTIFIER').value;
        if (this.is('COLON') || this.is('EQUALS')) {
          this.nextToken();
        }
        const val = this.parseValue();
        ast.metadata.properties[key] = val;
      }
      this.expect('RBRACE');
    }
  }

  private parseVoxelDeclaration(): VoxelAstNode {
    const loc: SourceLocation = {
      line: this.current.line,
      column: this.current.column,
    };
    this.expect('IDENTIFIER'); // 'voxel'

    // ID
    const idTok = this.expect('IDENTIFIER', 'voxel ID');
    const id = idTok.value;

    // Coordinate: '@' '(' x ',' y ',' z ')' or 'at' '(' x ',' y ',' z ')'
    if (
      this.is('AT') ||
      (this.is('IDENTIFIER') && this.current.value === 'at')
    ) {
      this.nextToken();
    }
    this.expect('LPAREN', '"(" for coordinates');
    const x = Number(this.expect('NUMBER', 'X coordinate').value);
    this.expect('COMMA');
    const y = Number(this.expect('NUMBER', 'Y coordinate').value);
    this.expect('COMMA');
    const z = Number(this.expect('NUMBER', 'Z coordinate').value);
    this.expect('RPAREN', '")" closing coordinates');

    let voxelType = '';
    let role: string | undefined;
    const properties: Record<string, string | number | boolean> = {};

    // Block or inline attributes
    if (this.is('LBRACE')) {
      this.nextToken();
      while (!this.is('RBRACE') && !this.is('EOF')) {
        const key = this.expect('IDENTIFIER').value;
        if (this.is('COLON') || this.is('EQUALS')) {
          this.nextToken();
        }
        const val = this.parseValue();
        if (key === 'type') {
          voxelType = String(val);
        } else if (key === 'role') {
          role = String(val);
        } else {
          properties[key] = val;
        }
      }
      this.expect('RBRACE');
    } else {
      // Inline properties (e.g. type="...", role="...")
      while (
        this.is('IDENTIFIER') &&
        this.current.value !== 'voxel' &&
        this.current.value !== 'assembly'
      ) {
        const key = this.current.value;
        this.nextToken();

        // If it's a stand-alone type reference like 'vox.compute.gpu-module'
        if (!this.is('COLON') && !this.is('EQUALS')) {
          if (!voxelType && key.startsWith('vox.')) {
            voxelType = key;
            continue;
          }
        } else {
          this.nextToken(); // skip '=' or ':'
        }

        const val = this.parseValue();
        if (key === 'type') {
          voxelType = String(val);
        } else if (key === 'role') {
          role = String(val);
        } else {
          properties[key] = val;
        }
      }
    }

    if (!voxelType) {
      throw new DslParseError(
        `Voxel "${id}" is missing required "type" property.`,
        loc.line,
        loc.column
      );
    }

    return {
      type: 'VoxelDeclaration',
      id,
      coord: { x, y, z },
      voxelType,
      role,
      properties,
      loc,
    };
  }

  private parseValue(): string | number | boolean {
    if (this.current.type === 'STRING') {
      const v = this.current.value;
      this.nextToken();
      return v;
    }
    if (this.current.type === 'NUMBER') {
      const v = Number(this.current.value);
      this.nextToken();
      return v;
    }
    if (this.current.type === 'IDENTIFIER') {
      const v = this.current.value;
      this.nextToken();
      if (v === 'true') return true;
      if (v === 'false') return false;
      return v;
    }
    throw new DslParseError(
      `Unexpected token "${this.current.value}" while parsing property value.`,
      this.current.line,
      this.current.column
    );
  }
}

/**
 * Convenient helper to parse DSL code into an AST.
 */
export function parseDSL(source: string): VoxelAst {
  const parser = new DslParser();
  return parser.parse(source);
}

/**
 * Serializes an AST back into DSL text.
 */
export function printDSL(ast: VoxelAst): string {
  const lines: string[] = [];
  if (ast.metadata.name) {
    lines.push(`assembly "${ast.metadata.name}" {`);
    for (const [k, v] of Object.entries(ast.metadata.properties)) {
      lines.push(`  ${k}: ${typeof v === 'string' ? `"${v}"` : v}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const v of ast.voxels) {
    lines.push(`voxel ${v.id} @ (${v.coord.x}, ${v.coord.y}, ${v.coord.z}) {`);
    lines.push(`  type: "${v.voxelType}"`);
    if (v.role) {
      lines.push(`  role: "${v.role}"`);
    }
    for (const [pk, pv] of Object.entries(v.properties)) {
      lines.push(`  ${pk}: ${typeof pv === 'string' ? `"${pv}"` : pv}`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}
