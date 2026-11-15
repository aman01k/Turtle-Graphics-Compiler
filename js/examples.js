/*
 * Example programs shown in the "Examples" menu.
 * The last three contain deliberate errors, one for each analysis phase.
 */
(function (root) {
  'use strict';

  var EXAMPLES = [
    {
      name: 'Square',
      code: [
        '# A blue square',
        'PEN BLUE;',
        'REPEAT 4 {',
        '  MOVE 100;',
        '  TURN 90;',
        '}'
      ].join('\n')
    },
    {
      name: 'Star',
      code: [
        '# A five-pointed star',
        'PEN ORANGE;',
        'WIDTH 3;',
        'REPEAT 5 {',
        '  MOVE 200;',
        '  TURN 144;',
        '}'
      ].join('\n')
    },
    {
      name: 'Flower (variables + nested loops)',
      code: [
        '# 12 squares, each rotated a little',
        'LET petals = 12;',
        'LET size = 80;',
        '',
        'PEN PURPLE;',
        'REPEAT petals {',
        '  REPEAT 4 {',
        '    MOVE size;',
        '    TURN 90;',
        '  }',
        '  TURN 360 / petals;',
        '}'
      ].join('\n')
    },
    {
      name: 'Dashed triangle (pen up / down)',
      code: [
        '# PENUP moves without drawing',
        'LET dash = 10;',
        'PEN RED;',
        'WIDTH 3;',
        'TURN 30;',
        'REPEAT 3 {',
        '  REPEAT 8 {',
        '    MOVE dash;',
        '    PENUP;',
        '    MOVE dash;',
        '    PENDOWN;',
        '  }',
        '  TURN 120;',
        '}'
      ].join('\n')
    },
    {
      name: 'House (expressions)',
      code: [
        '# Walls, then a roof',
        'LET wall = 120;',
        'LET roof = wall * 0.7071;',
        '',
        'PEN BROWN;',
        'WIDTH 3;',
        'REPEAT 4 {',
        '  MOVE wall;',
        '  TURN 90;',
        '}',
        '',
        'MOVE wall;',
        'PEN RED;',
        'TURN 45;',
        'MOVE roof;',
        'TURN 90;',
        'MOVE roof;'
      ].join('\n')
    },
    {
      name: 'Optimizer demo',
      code: [
        '# Wasteful on purpose - open the "Optimized IR" tab',
        'PEN RED;',
        'PEN GREEN;      # RED is never used',
        'PENDOWN;        # pen is already down',
        'REPEAT 3 {',
        '  MOVE 60;',
        '  MOVE 60;      # two moves -> one',
        '  TURN 100;',
        '  TURN 20;      # two turns -> one',
        '  MOVE 0;       # does nothing',
        '}'
      ].join('\n')
    },
    {
      name: 'Error demo: lexical',
      code: [
        '# Characters and words the language does not have',
        'PEN BLUE;',
        'MOVE 100 @;',
        'TURN 9x0;',
        'MOVE $50;'
      ].join('\n')
    },
    {
      name: 'Error demo: syntax',
      code: [
        '# Broken grammar - the good lines still appear in the tree',
        'WIDTH 3;',
        'PEN BLUE',
        'MOVE ;',
        'TURN 45;',
        'JUMP 20;',
        'REPEAT 4 {',
        '  MOVE 100',
        '  TURN 90;',
        '}',
        '}'
      ].join('\n')
    },
    {
      name: 'Error demo: semantic',
      code: [
        '# Grammar is fine, but the meaning is not allowed',
        'LET side = 100;',
        'LET side = 200;',
        'PEN MAGENTA;',
        'MOVE 5000;',
        'TURN angle;',
        'WIDTH 50;',
        'REPEAT 0 {',
        '  MOVE side / 0;',
        '}'
      ].join('\n')
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = { EXAMPLES: EXAMPLES };
  else root.TurtleExamples = EXAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
