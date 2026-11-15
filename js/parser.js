/*
 * PHASE 2 - SYNTAX ANALYSIS (the "parser")
 * ----------------------------------------
 * Input : the token list from the lexer.
 * Output: an Abstract Syntax Tree (AST) + a list of syntax errors.
 *
 * Technique: RECURSIVE DESCENT (a top-down, LL(1) parser).
 * Each grammar rule below is written as one function. The parser looks at
 * ONE token ahead (the "lookahead") to decide which rule to use.
 *
 * GRAMMAR
 *   program    -> statement* EOF
 *   statement  -> PEN IDENT ';'
 *               | MOVE expr ';'
 *               | TURN expr ';'
 *               | WIDTH expr ';'
 *               | PENUP ';'
 *               | PENDOWN ';'
 *               | LET IDENT '=' expr ';'
 *               | REPEAT expr '{' statement* '}'
 *   expr       -> term   ( ('+' | '-') term )*
 *   term       -> factor ( ('*' | '/') factor )*
 *   factor     -> NUMBER | IDENT | '(' expr ')' | '-' factor
 *
 * Operator precedence comes from the grammar itself: 'term' sits below
 * 'expr', so * and / bind tighter than + and -.
 *
 * ERROR RECOVERY: "panic mode". When a statement is wrong we record the
 * error, skip tokens until the next ';' (or a keyword / '}'), and continue.
 * This lets us report several syntax errors in a single run.
 */
(function (root) {
  'use strict';

  var NICE_NAMES = {
    SEMI: "';'", LBRACE: "'{'", RBRACE: "'}'", LPAREN: "'('", RPAREN: "')'",
    ASSIGN: "'='", PLUS: "'+'", MINUS: "'-'", STAR: "'*'", SLASH: "'/'",
    NUMBER: 'a number', IDENT: 'a name', EOF: 'end of program', KEYWORD: 'a command'
  };

  function describe(tok) {
    if (tok.type === 'EOF') return 'end of program';
    return "'" + tok.lexeme + "'";
  }

  function parse(tokens) {
    var pos = 0;
    var errors = [];

    // ---- small helpers -------------------------------------------------
    function peek() { return tokens[pos]; }
    function previous() { return tokens[pos - 1]; }
    function atEnd() { return peek().type === 'EOF'; }
    function isKeyword(tok, name) { return tok.type === 'KEYWORD' && tok.value === name; }
    function check(type) { return peek().type === type; }
    function next() { if (!atEnd()) pos++; return previous(); }

    function fail(message, tok) {
      var err = new Error(message);
      err.isSyntaxError = true;
      err.token = tok || peek();
      throw err;
    }

    // Consume a token of the given type, or raise a syntax error.
    function expect(type, context) {
      if (check(type)) return next();
      var tok = peek();
      // A missing ';' is reported at the end of the previous token - that is
      // where the programmer actually forgot it.
      if (type === 'SEMI' && pos > 0) {
        var prev = previous();
        fail('Missing ' + NICE_NAMES[type] + ' ' + context,
          { line: prev.line, col: prev.col + prev.lexeme.length });
      }
      fail('Expected ' + NICE_NAMES[type] + ' ' + context + ' but found ' + describe(tok), tok);
    }

    // Panic-mode recovery: skip to a safe place to restart parsing.
    function synchronize() {
      while (!atEnd()) {
        if (check('SEMI')) { next(); return; }
        if (check('RBRACE')) return;
        if (check('KEYWORD')) return;
        next();
      }
    }

    // ---- grammar rules -------------------------------------------------

    // program -> statement* EOF
    function program() {
      var body = [];
      while (!atEnd()) {
        if (check('RBRACE')) {
          var stray = next();
          errors.push({ phase: 'Syntax', line: stray.line, col: stray.col,
            message: "Unexpected '}' - there is no matching '{'" });
          continue;
        }
        var stmt = safeStatement();
        if (stmt) body.push(stmt);
      }
      return { type: 'Program', body: body, line: 1, col: 1 };
    }

    // Parses one statement; on error records it and recovers.
    function safeStatement() {
      var start = pos;
      try {
        return statement();
      } catch (e) {
        if (!e.isSyntaxError) throw e;
        errors.push({ phase: 'Syntax', line: e.token.line, col: e.token.col, message: e.message });
        synchronize();
        if (pos === start && !atEnd()) next(); // always make progress
        return null;
      }
    }

    function statement() {
      var tok = peek();
      if (tok.type !== 'KEYWORD') {
        fail('Expected a command (PEN, MOVE, TURN, WIDTH, PENUP, PENDOWN, LET, REPEAT) but found ' + describe(tok), tok);
      }
      next();
      switch (tok.value) {
        case 'PEN': {
          var color = expect('IDENT', 'after PEN (a colour name such as BLUE)');
          expect('SEMI', 'after PEN ' + color.lexeme);
          return { type: 'Pen', color: color.lexeme, colorLine: color.line, colorCol: color.col, line: tok.line, col: tok.col };
        }
        case 'MOVE':
        case 'TURN':
        case 'WIDTH': {
          var value = expr();
          expect('SEMI', 'after ' + tok.value + ' statement');
          var kind = tok.value === 'MOVE' ? 'Move' : tok.value === 'TURN' ? 'Turn' : 'Width';
          return { type: kind, value: value, line: tok.line, col: tok.col };
        }
        case 'PENUP':
        case 'PENDOWN': {
          expect('SEMI', 'after ' + tok.value);
          return { type: tok.value === 'PENUP' ? 'PenUp' : 'PenDown', line: tok.line, col: tok.col };
        }
        case 'LET': {
          var name = expect('IDENT', 'after LET (the variable name)');
          expect('ASSIGN', "after variable name '" + name.lexeme + "'");
          var init = expr();
          expect('SEMI', 'after LET statement');
          return { type: 'Let', name: name.lexeme, value: init, line: tok.line, col: tok.col };
        }
        case 'REPEAT': {
          var count = expr();
          expect('LBRACE', 'to open the REPEAT body');
          var body = [];
          while (!check('RBRACE') && !atEnd()) {
            var s = safeStatement();
            if (s) body.push(s);
          }
          if (atEnd()) {
            fail("Missing '}' - the REPEAT block opened on line " + tok.line + ' is never closed', peek());
          }
          next();                       // consume '}'
          if (check('SEMI')) next();    // an optional ';' after '}' is allowed
          return { type: 'Repeat', count: count, body: body, line: tok.line, col: tok.col };
        }
      }
    }

    // expr -> term ( ('+' | '-') term )*
    function expr() {
      var left = term();
      while (check('PLUS') || check('MINUS')) {
        var op = next();
        var right = term();
        left = { type: 'BinOp', op: op.lexeme, left: left, right: right, line: op.line, col: op.col };
      }
      return left;
    }

    // term -> factor ( ('*' | '/') factor )*
    function term() {
      var left = factor();
      while (check('STAR') || check('SLASH')) {
        var op = next();
        var right = factor();
        left = { type: 'BinOp', op: op.lexeme, left: left, right: right, line: op.line, col: op.col };
      }
      return left;
    }

    // factor -> NUMBER | IDENT | '(' expr ')' | '-' factor
    function factor() {
      var tok = peek();
      if (check('NUMBER')) { next(); return { type: 'Number', value: tok.value, line: tok.line, col: tok.col }; }
      if (check('IDENT')) { next(); return { type: 'Var', name: tok.lexeme, line: tok.line, col: tok.col }; }
      if (check('LPAREN')) {
        next();
        var inner = expr();
        expect('RPAREN', "to close '('");
        return inner;
      }
      if (check('MINUS')) {
        next();
        return { type: 'Neg', operand: factor(), line: tok.line, col: tok.col };
      }
      fail('Expected a number, a variable or ( but found ' + describe(tok), tok);
    }

    var ast = program();
    return { ast: ast, errors: errors };
  }

  var api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
