/*
 * Test suite. Run with:   node tests/run-tests.js
 * Covers correct programs and lexical / syntax / semantic error cases.
 */
'use strict';
var path = require('path');
var Compiler = require(path.join(__dirname, '..', 'js', 'compiler.js'));
var IR = require(path.join(__dirname, '..', 'js', 'ir.js'));
var Codegen = require(path.join(__dirname, '..', 'js', 'codegen.js'));

var passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
function eq(actual, expected, label) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((label || 'value') + ': expected ' + b + ' but got ' + a);
}
function ok(cond, label) { if (!cond) throw new Error(label || 'condition was false'); }
function irText(list) { return list.map(IR.format); }
function hasError(r, phase, text) {
  ok(r.stoppedAt === phase, 'should stop at ' + phase + ' but stopped at ' + r.stoppedAt);
  ok(r.errors.some(function (e) { return e.message.indexOf(text) !== -1; }),
    'no error containing "' + text + '" in: ' + r.errors.map(function (e) { return e.message; }).join(' | '));
}

console.log('\nLexical analysis');
test('tokenizes the sample program', function () {
  var r = Compiler.compile('PEN BLUE;\nREPEAT 4 { MOVE 100; TURN 90; }');
  eq(r.tokens.map(function (t) { return t.type; }),
    ['KEYWORD', 'IDENT', 'SEMI', 'KEYWORD', 'NUMBER', 'LBRACE', 'KEYWORD', 'NUMBER', 'SEMI',
      'KEYWORD', 'NUMBER', 'SEMI', 'RBRACE', 'EOF']);
});
test('tracks line and column', function () {
  var r = Compiler.compile('PEN RED;\n  MOVE 10;');
  var move = r.tokens[3];
  eq([move.line, move.col], [2, 3]);
});
test('keywords are case-insensitive', function () {
  var r = Compiler.compile('move 10; Turn 90;');
  eq(r.stoppedAt, null);
});
test('comments and decimals', function () {
  var r = Compiler.compile('# a comment\nMOVE 12.5; # trailing');
  eq(irText(r.ir), ['MOVE 12.5']);
});
test('error: illegal character', function () {
  hasError(Compiler.compile('MOVE 100 @;'), 'lexical', "Unexpected character '@'");
});
test('error: name starting with a digit', function () {
  hasError(Compiler.compile('MOVE 12abc;'), 'lexical', "Invalid token '12abc'");
});
test('reports all lexical errors in one run', function () {
  eq(Compiler.compile('MOVE $ 10 ?;').errors.length, 2);
});

console.log('\nSyntax analysis');
test('builds an AST with nested REPEAT', function () {
  var r = Compiler.compile('REPEAT 2 { REPEAT 3 { MOVE 1; } }');
  eq(r.ast.body[0].type, 'Repeat');
  eq(r.ast.body[0].body[0].type, 'Repeat');
  eq(r.ast.body[0].body[0].body[0].type, 'Move');
});
test('operator precedence: * before +', function () {
  var r = Compiler.compile('MOVE 2 + 3 * 4;');
  eq(irText(r.ir), ['MOVE 14']);
});
test('parentheses and unary minus', function () {
  var r = Compiler.compile('MOVE (2 + 3) * 4; TURN -90;');
  eq(irText(r.ir), ['MOVE 20', 'TURN -90']);
});
test('error: missing semicolon', function () {
  var r = Compiler.compile('MOVE 100\nTURN 90;');
  hasError(r, 'syntax', "Missing ';'");
  eq(r.errors[0].line, 1);
});
test('error: missing closing brace', function () {
  hasError(Compiler.compile('REPEAT 4 { MOVE 10;'), 'syntax', "Missing '}'");
});
test('error: missing opening brace', function () {
  hasError(Compiler.compile('REPEAT 4 MOVE 10;'), 'syntax', "Expected '{'");
});
test('error: stray closing brace', function () {
  hasError(Compiler.compile('MOVE 10; }'), 'syntax', "Unexpected '}'");
});
test('error: missing value', function () {
  hasError(Compiler.compile('MOVE ;'), 'syntax', 'Expected a number');
});
test('error: unknown command', function () {
  hasError(Compiler.compile('JUMP 10;'), 'syntax', 'Expected a command');
});
test('recovers and reports several syntax errors', function () {
  var r = Compiler.compile('MOVE ;\nTURN 90\nPEN ;\nMOVE 5;');
  eq(r.errors.length, 3);
});

console.log('\nSemantic analysis');
test('symbol table records variables and scopes', function () {
  var r = Compiler.compile('LET side = 50;\nREPEAT 4 { LET half = side / 2; MOVE half; TURN 90; }');
  eq(r.symbols.map(function (s) { return [s.name, s.value, s.level]; }),
    [['side', 50, 0], ['half', 25, 1]]);
});
test('inner scope may shadow an outer variable', function () {
  var r = Compiler.compile('LET n = 10;\nREPEAT 2 { LET n = 20; MOVE n; }\nMOVE n;');
  eq(irText(r.ir), ['MOVE 20', 'MOVE 20', 'MOVE 10']);
});
test('error: unknown colour', function () {
  hasError(Compiler.compile('PEN MAGENTA;'), 'semantic', "Unknown colour 'MAGENTA'");
});
test('error: undeclared variable', function () {
  hasError(Compiler.compile('MOVE size;'), 'semantic', "'size' is used but was never declared");
});
test('error: variable used outside its scope', function () {
  hasError(Compiler.compile('REPEAT 2 { LET a = 5; MOVE a; }\nMOVE a;'), 'semantic', "'a' is used but was never declared");
});
test('error: duplicate declaration', function () {
  hasError(Compiler.compile('LET a = 1; LET a = 2; MOVE a;'), 'semantic', 'already declared');
});
test('error: MOVE out of range', function () {
  hasError(Compiler.compile('MOVE 5000;'), 'semantic', 'MOVE distance 5000 is out of range');
});
test('error: TURN out of range', function () {
  hasError(Compiler.compile('TURN 720;'), 'semantic', 'TURN angle 720 is out of range');
});
test('error: WIDTH out of range', function () {
  hasError(Compiler.compile('WIDTH 0;'), 'semantic', 'WIDTH 0 is out of range');
});
test('error: REPEAT count must be positive', function () {
  hasError(Compiler.compile('REPEAT 0 { MOVE 1; }'), 'semantic', 'must be positive');
  hasError(Compiler.compile('REPEAT -3 { MOVE 1; }'), 'semantic', 'must be positive');
});
test('error: REPEAT count must be a whole number', function () {
  hasError(Compiler.compile('REPEAT 2.5 { MOVE 1; }'), 'semantic', 'whole number');
});
test('error: division by zero', function () {
  hasError(Compiler.compile('LET z = 0; MOVE 10 / z;'), 'semantic', 'Division by zero');
});
test('error: program too large', function () {
  hasError(Compiler.compile('REPEAT 1000 { REPEAT 1000 { MOVE 1; } }'), 'semantic', 'too large');
});
test('warning: unused variable', function () {
  var r = Compiler.compile('LET unused = 5; MOVE 10;');
  eq(r.stoppedAt, null);
  ok(r.warnings.length === 1 && r.warnings[0].message.indexOf('never used') !== -1);
});

console.log('\nIR generation');
test('unrolls loops', function () {
  var r = Compiler.compile('REPEAT 2 { MOVE 10; TURN 90; }');
  eq(irText(r.ir), ['MOVE 10', 'TURN 90', 'MOVE 10', 'TURN 90']);
});
test('folds constants and emits nothing for LET', function () {
  var r = Compiler.compile('LET a = 10; LET b = a * 3; MOVE b + 1;');
  eq(irText(r.ir), ['MOVE 31']);
});

console.log('\nOptimization');
function opt(src) { return irText(Compiler.compile(src).optimized.code); }
test('removes no-ops', function () { eq(opt('MOVE 0; TURN 0; TURN 360; MOVE 5;'), ['MOVE 5']); });
test('merges turns', function () { eq(opt('TURN 30; TURN 60; MOVE 5;'), ['TURN 90', 'MOVE 5']); });
test('merges moves', function () { eq(opt('MOVE 50; MOVE 50;'), ['MOVE 100']); });
test('does not merge opposite moves while drawing', function () {
  eq(opt('MOVE 50; MOVE -50;'), ['MOVE 50', 'MOVE -50']);
});
test('merges opposite moves when the pen is up', function () {
  eq(opt('PENUP; MOVE 50; MOVE -20; PENDOWN; MOVE 5;'), ['PENUP', 'MOVE 30', 'PENDOWN', 'MOVE 5']);
});
test('removes redundant sets', function () {
  eq(opt('PEN BLACK; PENDOWN; WIDTH 2; PEN RED; MOVE 5; PEN RED; MOVE 5;'), ['PEN RED', 'MOVE 10']);
});
test('removes dead sets', function () {
  eq(opt('PEN RED; TURN 90; PEN BLUE; MOVE 5;'), ['TURN 90', 'PEN BLUE', 'MOVE 5']);
});
test('reaches a fixed point', function () {
  eq(opt('MOVE 10; TURN 180; TURN 180; MOVE 10;'), ['MOVE 20']);
});
test('optimized code draws the same picture', function () {
  var src = 'LET s = 40; PEN RED; PEN GREEN; REPEAT 6 { MOVE s; MOVE s; TURN 30; TURN 30; MOVE 0; PENUP; PENDOWN; }';
  var r = Compiler.compile(src);
  var plain = Codegen.generate(r.ir);
  ok(r.optimized.after < r.optimized.before, 'should get shorter');
  eq(r.target.final, plain.final, 'final turtle state');
  eq(r.target.stats.drawnLength, plain.stats.drawnLength, 'drawn length');
  eq(r.target.viewBox, plain.viewBox, 'bounding box');
});

console.log('\nCode generation');
test('square returns to the start', function () {
  var r = Compiler.compile('PEN BLUE;\nREPEAT 4 { MOVE 100; TURN 90; }');
  eq(r.target.stats.linesDrawn, 4);
  eq([r.target.final.x, r.target.final.y, r.target.final.heading], [0, 0, 0]);
});
test('first move goes up, right turn goes right', function () {
  var r = Compiler.compile('MOVE 100; TURN 90; MOVE 50;');
  eq([r.target.segments[0].x2, r.target.segments[0].y2], [0, -100]);
  eq([r.target.segments[1].x2, r.target.segments[1].y2], [50, -100]);
});
test('pen up draws nothing', function () {
  var r = Compiler.compile('PENUP; MOVE 100; PENDOWN; MOVE 10;');
  eq(r.target.stats.linesDrawn, 1);
});
test('emits SVG with colour and width', function () {
  var r = Compiler.compile('PEN RED; WIDTH 5; MOVE 10;');
  ok(r.target.svg.indexOf('<svg') === 0, 'starts with <svg');
  ok(r.target.svg.indexOf('stroke="#e03131" stroke-width="5"') !== -1, 'has stroke attributes');
});
test('empty program compiles to an empty drawing', function () {
  var r = Compiler.compile('');
  eq(r.stoppedAt, null);
  eq(r.target.stats.linesDrawn, 0);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
