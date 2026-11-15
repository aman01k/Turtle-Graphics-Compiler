/*
 * PHASE 6 - CODE GENERATION
 * -------------------------
 * Input : the optimized IR.
 * Output: the TARGET CODE. Our target language is SVG (Scalable Vector
 *         Graphics), which every web browser can display directly.
 *
 * How it works: we keep the turtle's state
 *     position (x, y), heading (angle), pen up/down, colour, width
 * and walk through the IR once. Every MOVE made with the pen down is
 * translated into one SVG <line> element.
 *
 * Conventions:
 *   - The turtle starts at (0, 0) facing UP (heading 0 degrees).
 *   - TURN n turns RIGHT (clockwise) by n degrees; a negative n turns left.
 *   - MOVE n goes forward n units; a negative n goes backward.
 *
 * Geometry for MOVE d with heading h (SVG's y axis points down):
 *     newX = x + d * sin(h)        newY = y - d * cos(h)
 */
(function (root) {
  'use strict';

  var IR = typeof require !== 'undefined' ? require('./ir.js') : root.TurtleIR;
  var Semantic = typeof require !== 'undefined' ? require('./semantic.js') : root.TurtleSemantic;

  function round(n) {
    var r = Math.round(n * 100) / 100;
    return r === 0 ? 0 : r; // avoid "-0"
  }

  function generate(code) {
    var x = 0, y = 0, heading = 0;
    var penDown = IR.DEFAULTS.penDown;
    var color = IR.DEFAULTS.color;
    var width = IR.DEFAULTS.width;

    var steps = [];      // every MOVE (drawn or not) - used for the animation
    var minX = 0, minY = 0, maxX = 0, maxY = 0;
    var drawnLength = 0;

    code.forEach(function (ins) {
      switch (ins.op) {
        case 'PEN': color = ins.arg; break;
        case 'WIDTH': width = ins.arg; break;
        case 'PENUP': penDown = false; break;
        case 'PENDOWN': penDown = true; break;
        case 'TURN': heading = (((heading + ins.arg) % 360) + 360) % 360; break;
        case 'MOVE': {
          var rad = heading * Math.PI / 180;
          var nx = x + ins.arg * Math.sin(rad);
          var ny = y - ins.arg * Math.cos(rad);
          steps.push({
            x1: round(x), y1: round(y), x2: round(nx), y2: round(ny),
            drawn: penDown, color: Semantic.COLORS[color], width: width,
            heading: heading, line: ins.line
          });
          if (penDown) drawnLength += Math.abs(ins.arg);
          x = nx; y = ny;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          break;
        }
      }
    });

    var segments = steps.filter(function (s) { return s.drawn; });

    // The viewBox is the bounding box of the drawing plus some padding,
    // so any picture is automatically centred and scaled to fit.
    var pad = 20;
    var viewBox = {
      x: round(minX - pad), y: round(minY - pad),
      w: round(Math.max(maxX - minX, 1) + 2 * pad), h: round(Math.max(maxY - minY, 1) + 2 * pad)
    };

    var lines = segments.map(function (s) {
      return '  <line x1="' + s.x1 + '" y1="' + s.y1 + '" x2="' + s.x2 + '" y2="' + s.y2 +
        '" stroke="' + s.color + '" stroke-width="' + s.width + '" stroke-linecap="round"/>';
    });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
      viewBox.x + ' ' + viewBox.y + ' ' + viewBox.w + ' ' + viewBox.h + '">\n' +
      lines.join('\n') + (lines.length ? '\n' : '') + '</svg>';

    return {
      svg: svg,
      steps: steps,
      segments: segments,
      viewBox: viewBox,
      final: { x: round(x), y: round(y), heading: round(heading), penDown: penDown, color: color, width: width },
      stats: { linesDrawn: segments.length, drawnLength: round(drawnLength) }
    };
  }

  var api = { generate: generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleCodegen = api;
})(typeof window !== 'undefined' ? window : globalThis);
