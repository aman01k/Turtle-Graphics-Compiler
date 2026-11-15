/*
 * PHASE 1 - LEXICAL ANALYSIS (the "scanner")
 * ------------------------------------------
 * Input : the source program as one string of characters.
 * Output: a list of tokens + a list of lexical errors.
 *
 * A token is the smallest meaningful unit of the language, e.g.
 *   MOVE  -> KEYWORD      100 -> NUMBER      ;  -> SEMI
 *
 * The scanner reads the text left to right, one character at a time,
 * skips spaces and comments, and groups characters into tokens.
 * Every token remembers its line and column so later phases can
 * report errors at the right place.
 */
(function (root) {
  'use strict';

  // Reserved words of the language. They are case-insensitive (move == MOVE).
  var KEYWORDS = ['PEN', 'MOVE', 'TURN', 'WIDTH', 'PENUP', 'PENDOWN', 'REPEAT', 'LET'];

  // Single-character tokens.
  var SYMBOLS = {
    ';': 'SEMI',
    '{': 'LBRACE',
    '}': 'RBRACE',
    '(': 'LPAREN',
    ')': 'RPAREN',
    '=': 'ASSIGN',
    '+': 'PLUS',
    '-': 'MINUS',
    '*': 'STAR',
    '/': 'SLASH'
  };

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isLetter(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
  function isSpace(c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n'; }

  function tokenize(source) {
    var tokens = [];
    var errors = [];
    var i = 0;        // position in the source string
    var line = 1;     // current line (starts at 1)
    var col = 1;      // current column (starts at 1)

    function advance() {
      var c = source[i++];
      if (c === '\n') { line++; col = 1; } else { col++; }
      return c;
    }

    function addToken(type, lexeme, startLine, startCol, value) {
      var tok = { type: type, lexeme: lexeme, line: startLine, col: startCol };
      if (value !== undefined) tok.value = value;
      tokens.push(tok);
    }

    while (i < source.length) {
      var c = source[i];
      var startLine = line;
      var startCol = col;

      // 1. Whitespace is skipped - it only separates tokens.
      if (isSpace(c)) { advance(); continue; }

      // 2. Comments start with # and run to the end of the line.
      if (c === '#') {
        while (i < source.length && source[i] !== '\n') advance();
        continue;
      }

      // 3. Numbers: digits with an optional decimal part (e.g. 90, 12.5).
      if (isDigit(c)) {
        var num = '';
        while (i < source.length && isDigit(source[i])) num += advance();
        if (source[i] === '.' && isDigit(source[i + 1] || '')) {
          num += advance();
          while (i < source.length && isDigit(source[i])) num += advance();
        }
        // A letter glued to a number (e.g. 12abc) is not a valid token.
        if (i < source.length && isLetter(source[i])) {
          var bad = num;
          while (i < source.length && (isLetter(source[i]) || isDigit(source[i]))) bad += advance();
          errors.push({
            phase: 'Lexical', line: startLine, col: startCol,
            message: "Invalid token '" + bad + "': a name cannot start with a digit"
          });
          continue;
        }
        addToken('NUMBER', num, startLine, startCol, parseFloat(num));
        continue;
      }

      // 4. Words: either a keyword (MOVE, REPEAT...) or an identifier (size, BLUE...).
      if (isLetter(c)) {
        var word = '';
        while (i < source.length && (isLetter(source[i]) || isDigit(source[i]))) word += advance();
        var upper = word.toUpperCase();
        if (KEYWORDS.indexOf(upper) !== -1) addToken('KEYWORD', word, startLine, startCol, upper);
        else addToken('IDENT', word, startLine, startCol, word);
        continue;
      }

      // 5. Punctuation and operators.
      if (SYMBOLS[c]) {
        advance();
        addToken(SYMBOLS[c], c, startLine, startCol);
        continue;
      }

      // 6. Anything else is not part of the language -> lexical error.
      //    We report it and keep scanning so all bad characters are found in one run.
      advance();
      errors.push({
        phase: 'Lexical', line: startLine, col: startCol,
        message: "Unexpected character '" + c + "'"
      });
    }

    // EOF marks the end of input; the parser uses it to know when to stop.
    addToken('EOF', '', line, col);
    return { tokens: tokens, errors: errors };
  }

  var api = { tokenize: tokenize, KEYWORDS: KEYWORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleLexer = api;
})(typeof window !== 'undefined' ? window : globalThis);
