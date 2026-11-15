/*
 * USER INTERFACE
 * --------------
 * Connects the page to the compiler. Every time the source text changes we
 * call TurtleCompiler.compile() and show the result of the selected phase.
 * No compiler logic lives here - this file only displays things.
 */
(function () {
  'use strict';

  var TABS = [
    { id: 'tokens', label: 'Tokens', phase: 'lexical', n: 1,
      note: 'Phase 1 - Lexical analysis: the scanner splits the source text into tokens.' },
    { id: 'ast', label: 'Syntax tree', phase: 'syntax', n: 2,
      note: 'Phase 2 - Syntax analysis: a recursive descent parser checks the grammar and builds the Abstract Syntax Tree (AST).' },
    { id: 'symbols', label: 'Symbol table', phase: 'semantic', n: 3,
      note: 'Phase 3 - Semantic analysis: checks meaning (colours, ranges, declarations) and records every variable in the symbol table.' },
    { id: 'ir', label: 'IR', phase: 'ir', n: 4,
      note: 'Phase 4 - Intermediate code: the tree becomes a flat list of simple instructions. Loops are unrolled and expressions are replaced by their values.' },
    { id: 'opt', label: 'Optimized IR', phase: 'optimizer', n: 5,
      note: 'Phase 5 - Optimization: peephole passes shorten the IR without changing the picture.' },
    { id: 'target', label: 'Target code', phase: 'codegen', n: 6,
      note: 'Phase 6 - Code generation: the optimized IR is translated into SVG, the target language.' },
    { id: 'output', label: 'Drawing', phase: 'codegen', n: null,
      note: 'The generated SVG, displayed by the browser.' }
  ];

  var PHASE_NAMES = {
    lexical: 'Lexical analysis', syntax: 'Syntax analysis', semantic: 'Semantic analysis',
    ir: 'IR generation', optimizer: 'Optimization', codegen: 'Code generation'
  };

  var $ = function (id) { return document.getElementById(id); };
  var sourceEl = $('source'), gutterEl = $('gutter'), messagesEl = $('messages');
  var tabsEl = $('tabs'), panelEl = $('panel'), noteEl = $('phase-note'), examplesEl = $('examples');

  var result = null;          // latest compile result
  var activeTab = 'output';
  var animTimer = null;       // drawing animation timer
  var astView = 'diagram';    // syntax tree shown as 'diagram' or 'outline'

  // ---------- small helpers ------------------------------------------------

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function table(headers, rows, cls) {
    var html = '<table class="data ' + (cls || '') + '"><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + esc(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (cells) {
      html += '<tr>';
      cells.forEach(function (c) { html += '<td>' + c + '</td>'; });
      html += '</tr>';
    });
    return html + '</tbody></table>';
  }

  function notReached() {
    return '<div class="empty"><strong>Not reached.</strong><br>Compilation stopped at ' +
      esc(PHASE_NAMES[result.stoppedAt]) + '. Fix the errors shown under the editor to continue.</div>';
  }

  function irListing(code) {
    if (!code.length) return '<div class="empty">No instructions.</div>';
    var rows = code.map(function (ins, i) {
      return '<div class="ins"><span class="ins-n">' + (i + 1) + '</span>' +
        '<span class="ins-op op-' + ins.op + '">' + ins.op + '</span>' +
        '<span class="ins-arg">' + (ins.arg === undefined ? '' : esc(ins.arg)) + '</span>' +
        '<span class="ins-src">line ' + ins.line + '</span></div>';
    });
    return '<div class="listing">' + rows.join('') + '</div>';
  }

  // ---------- panels: one function per tab --------------------------------

  function renderTokens() {
    var toks = result.tokens;
    var rows = toks.map(function (t, i) {
      return [i + 1, '<span class="tok tok-' + t.type + '">' + t.type + '</span>',
        t.type === 'EOF' ? '<span class="muted">(end of input)</span>' : '<code>' + esc(t.lexeme) + '</code>',
        t.line, t.col];
    });
    var extra = result.status.lexical === 'error'
      ? '<div class="banner error">Lexical errors found - invalid text was skipped and is not in this list.</div>' : '';
    return extra + '<p class="summary">' + toks.length + ' tokens (including EOF)</p>' +
      table(['#', 'Token type', 'Lexeme', 'Line', 'Column'], rows);
  }

  // Convert an AST node into { label, detail, children } for display.
  function describeNode(node) {
    var value = node.computed !== undefined && node.computed !== null ? node.computed : null;
    switch (node.type) {
      case 'Program': return { label: 'Program', children: node.body.map(describeNode) };
      case 'Pen': return { label: 'Pen', children: [{ label: 'Colour', detail: node.color, leaf: true }] };
      case 'Move': return { label: 'Move', children: [describeNode(node.value)] };
      case 'Turn': return { label: 'Turn', children: [describeNode(node.value)] };
      case 'Width': return { label: 'Width', children: [describeNode(node.value)] };
      case 'PenUp': return { label: 'PenUp', children: [] };
      case 'PenDown': return { label: 'PenDown', children: [] };
      case 'Let': return { label: 'Let', children: [{ label: 'Name', detail: node.name, leaf: true }, describeNode(node.value)] };
      case 'Repeat': return { label: 'Repeat', children: [
        { label: 'Count', cls: 'role', children: [describeNode(node.count)] },
        { label: 'Body', cls: 'role', children: node.body.map(describeNode) }] };
      case 'Number': return { label: 'Number', detail: node.value, leaf: true };
      case 'Var': return { label: 'Var', detail: node.name, value: value, leaf: true };
      case 'Neg': return { label: 'Negate', detail: '-', value: value, children: [describeNode(node.operand)] };
      case 'BinOp': return { label: 'BinOp', detail: node.op, value: value, children: [describeNode(node.left), describeNode(node.right)] };
    }
    return { label: node.type, children: [] };
  }

  function treeHtml(n) {
    var cls = 'node' + (n.leaf ? ' leaf' : '') + (n.cls ? ' ' + n.cls : '');
    var html = '<li><span class="' + cls + '">' + esc(n.label) +
      (n.detail !== undefined ? ' <b>' + esc(n.detail) + '</b>' : '') +
      (n.value !== null && n.value !== undefined ? ' <i>= ' + esc(n.value) + '</i>' : '') + '</span>';
    if (n.children && n.children.length) {
      html += '<ul>' + n.children.map(treeHtml).join('') + '</ul>';
    }
    return html + '</li>';
  }

  function renderAst() {
    if (result.status.lexical === 'error') return notReached();
    var extra = '';
    if (result.status.syntax === 'error') {
      extra = '<div class="banner error">Syntax errors found - this is a partial tree. Statements with errors were skipped.</div>';
    } else if (result.status.semantic === 'ok') {
      extra = '<p class="summary">Values in <i class="val">green</i> were computed by semantic analysis (annotated AST).</p>';
    }
    if (!result.ast.body.length) {
      return extra + '<div class="empty">' + (result.status.syntax === 'error'
        ? 'No statement could be parsed.' : 'The program is empty.') + '</div>';
    }
    var tree = treeHtml(describeNode(result.ast));
    var toggle = '<div class="row"><button class="btn ghost" id="ast-view" type="button">' +
      (astView === 'diagram' ? 'Show as outline' : 'Show as diagram') + '</button>' +
      '<span class="summary">' + (astView === 'diagram' ? 'Scroll sideways to see the whole tree.' : '') + '</span></div>';
    if (astView === 'outline') return extra + toggle + '<ul class="outline">' + tree + '</ul>';
    return extra + toggle + '<div class="tree-wrap"><div class="tree"><ul>' + tree + '</ul></div></div>';
  }

  function renderSymbols() {
    if (result.symbols === null) return notReached();
    var html = '';
    if (result.status.semantic === 'error') {
      html += '<div class="banner error">Semantic errors found - see the messages under the editor.</div>';
    }
    html += '<h3>Variables</h3>';
    if (!result.symbols.length) {
      html += '<div class="empty small">No variables declared. Use <code>LET name = value;</code> to add one.</div>';
    } else {
      html += table(['Name', 'Kind', 'Type', 'Value', 'Scope', 'Level', 'Declared at', 'Times used'],
        result.symbols.map(function (s) {
          return ['<code>' + esc(s.name) + '</code>', s.kind, s.type,
            s.value === null ? '<span class="muted">error</span>' : s.value,
            esc(s.scope), s.level, 'line ' + s.line, s.uses];
        }));
    }
    html += '<h3>Built-in colours</h3><div class="swatches">';
    Object.keys(TurtleSemantic.COLORS).forEach(function (name) {
      html += '<span class="swatch"><i style="background:' + TurtleSemantic.COLORS[name] + '"></i>' + name + '</span>';
    });
    html += '</div><h3>Allowed ranges</h3>';
    var L = TurtleSemantic.LIMITS;
    html += table(['Statement', 'Minimum', 'Maximum'], [
      ['MOVE', L.MOVE.min, L.MOVE.max], ['TURN', L.TURN.min, L.TURN.max],
      ['WIDTH', L.WIDTH.min, L.WIDTH.max], ['REPEAT count', L.REPEAT.min, L.REPEAT.max]]);
    return html;
  }

  function renderIr() {
    if (result.ir === null) return notReached();
    return '<p class="summary">' + result.ir.length + ' instructions</p>' + irListing(result.ir);
  }

  function renderOpt() {
    if (result.optimized === null) return notReached();
    var o = result.optimized;
    var saved = o.before - o.after;
    var pct = o.before ? Math.round(saved * 100 / o.before) : 0;
    var html = '<div class="stats">' +
      '<div class="stat"><b>' + o.before + '</b><span>instructions before</span></div>' +
      '<div class="stat"><b>' + o.after + '</b><span>instructions after</span></div>' +
      '<div class="stat"><b>' + pct + '%</b><span>smaller</span></div></div>';
    html += '<div class="two-col"><div><h3>Before</h3>' + irListing(result.ir) + '</div>' +
      '<div><h3>After</h3>' + irListing(o.code) + '</div></div>';
    html += '<h3>What the optimizer did</h3>';
    if (!o.log.length) html += '<div class="empty small">Nothing to optimize - the code was already minimal.</div>';
    else html += table(['#', 'Pass', 'Source line', 'Change'], o.log.map(function (e, i) {
      return [i + 1, esc(e.pass), e.line, esc(e.detail)];
    }));
    return html;
  }

  function renderTarget() {
    if (result.target === null) return notReached();
    return '<div class="row"><p class="summary">Target language: SVG - ' + result.target.stats.linesDrawn +
      ' &lt;line&gt; elements</p><span class="spacer"></span>' +
      '<button class="btn ghost" id="copy-svg" type="button">Copy</button>' +
      '<button class="btn ghost" id="save-svg" type="button">Download .svg</button></div>' +
      '<pre class="code">' + esc(result.target.svg) + '</pre>';
  }

  function renderOutput() {
    if (result.target === null) return notReached();
    var t = result.target;
    return '<div class="row">' +
      '<button class="btn" id="play" type="button">Play step by step</button>' +
      '<label class="speed">Speed <input id="speed" type="range" min="1" max="10" value="6"></label>' +
      '<span class="spacer"></span><span class="summary" id="step-info"></span></div>' +
      '<div class="canvas" id="canvas"></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + t.stats.linesDrawn + '</b><span>lines drawn</span></div>' +
      '<div class="stat"><b>' + t.stats.drawnLength + '</b><span>units of ink</span></div>' +
      '<div class="stat"><b>(' + t.final.x + ', ' + (-t.final.y || 0) + ')</b><span>final position</span></div>' +
      '<div class="stat"><b>' + t.final.heading + '&deg;</b><span>final heading</span></div></div>';
  }

  // Draw the first 'count' steps and put the turtle marker at the current spot.
  function drawSteps(count) {
    var canvas = $('canvas');
    if (!canvas) return;
    var t = result.target, vb = t.viewBox;
    var x = 0, y = 0, heading = 0, lines = '';
    for (var i = 0; i < count; i++) {
      var s = t.steps[i];
      if (s.drawn) {
        lines += '<line x1="' + s.x1 + '" y1="' + s.y1 + '" x2="' + s.x2 + '" y2="' + s.y2 +
          '" stroke="' + s.color + '" stroke-width="' + s.width + '" stroke-linecap="round"/>';
      }
      x = s.x2; y = s.y2; heading = s.heading;
    }
    if (count === t.steps.length) heading = t.final.heading;
    var m = Math.max(vb.w, vb.h) / 45;  // marker size follows the picture size
    var marker = '<polygon class="turtle" points="0,' + (-1.6 * m) + ' ' + m + ',' + m + ' 0,' + (0.4 * m) + ' ' + (-m) + ',' + m +
      '" transform="translate(' + x + ' ' + y + ') rotate(' + heading + ')"/>';
    canvas.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h +
      '" role="img" aria-label="Turtle drawing">' + lines + marker + '</svg>';
    var info = $('step-info');
    if (info) info.textContent = 'Move ' + count + ' of ' + t.steps.length;
  }

  function stopAnimation() {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
    var btn = $('play');
    if (btn) btn.textContent = 'Play step by step';
  }

  function playAnimation() {
    if (animTimer) { stopAnimation(); drawSteps(result.target.steps.length); return; }
    var total = result.target.steps.length;
    if (!total) return;
    var k = 0;
    $('play').textContent = 'Stop';
    drawSteps(0);
    var tick = function () {
      k++;
      drawSteps(k);
      if (k >= total) stopAnimation();
    };
    var delay = function () { return 1100 - Number($('speed').value) * 105; };
    animTimer = setInterval(tick, delay());
    $('speed').oninput = function () {
      if (!animTimer) return;
      clearInterval(animTimer);
      animTimer = setInterval(tick, delay());
    };
  }

  var RENDERERS = {
    tokens: renderTokens, ast: renderAst, symbols: renderSymbols,
    ir: renderIr, opt: renderOpt, target: renderTarget, output: renderOutput
  };

  // ---------- page rendering ----------------------------------------------

  function renderTabs() {
    tabsEl.innerHTML = TABS.map(function (t) {
      var st = result.status[t.phase];
      return '<button type="button" role="tab" class="tab' + (t.id === activeTab ? ' active' : '') +
        '" data-tab="' + t.id + '" aria-selected="' + (t.id === activeTab) + '" title="' + esc(PHASE_NAMES[t.phase]) + ': ' + st + '">' +
        (t.n ? '<span class="num ' + st + '">' + t.n + '</span>' : '<span class="dot ' + st + '"></span>') + esc(t.label) + '</button>';
    }).join('');
  }

  function renderPanel() {
    stopAnimation();
    var tab = TABS.filter(function (t) { return t.id === activeTab; })[0];
    noteEl.textContent = tab.note;
    panelEl.innerHTML = RENDERERS[activeTab]();
    panelEl.scrollTop = 0;

    if (activeTab === 'output' && result.target) {
      drawSteps(result.target.steps.length);
      $('play').onclick = playAnimation;
    }
    if (activeTab === 'ast' && $('ast-view')) {
      $('ast-view').onclick = function () {
        astView = astView === 'diagram' ? 'outline' : 'diagram';
        renderPanel();
      };
    }
    if (activeTab === 'target' && result.target) {
      $('copy-svg').onclick = function () {
        var btn = this;
        var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1200); };
        if (navigator.clipboard) navigator.clipboard.writeText(result.target.svg).then(done, function () {});
      };
      $('save-svg').onclick = function () {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([result.target.svg], { type: 'image/svg+xml' }));
        a.download = 'turtle-drawing.svg';
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }
  }

  function renderMessages() {
    var html = '';
    if (result.stoppedAt) {
      html += '<div class="msg-head error">' + result.errors.length + ' ' + esc(PHASE_NAMES[result.stoppedAt].split(' ')[0].toLowerCase()) +
        ' error' + (result.errors.length > 1 ? 's' : '') + ' - compilation stopped at ' + esc(PHASE_NAMES[result.stoppedAt]) + '</div>';
      result.errors.forEach(function (e) {
        html += '<button type="button" class="msg error" data-line="' + e.line + '" data-col="' + e.col + '">' +
          '<span class="badge">' + esc(e.phase) + '</span><span class="loc">' + e.line + ':' + e.col + '</span>' +
          '<span class="text">' + esc(e.message) + '</span></button>';
      });
    } else {
      html += '<div class="msg-head ok">Compiled successfully - ' + (result.tokens.length - 1) + ' tokens, ' +
        result.ir.length + ' IR instructions (' + result.optimized.after + ' after optimization), ' +
        result.target.stats.linesDrawn + ' lines drawn</div>';
    }
    result.warnings.forEach(function (w) {
      html += '<button type="button" class="msg warn" data-line="' + w.line + '" data-col="' + w.col + '">' +
        '<span class="badge">Warning</span><span class="loc">' + w.line + ':' + w.col + '</span>' +
        '<span class="text">' + esc(w.message) + '</span></button>';
    });
    messagesEl.innerHTML = html;
  }

  function renderGutter() {
    var count = sourceEl.value.split('\n').length;
    var bad = {}, warned = {};
    result.errors.forEach(function (e) { bad[e.line] = true; });
    result.warnings.forEach(function (w) { warned[w.line] = true; });
    var html = '';
    for (var i = 1; i <= count; i++) {
      html += '<div class="' + (bad[i] ? 'bad' : warned[i] ? 'warned' : '') + '">' + i + '</div>';
    }
    gutterEl.innerHTML = html;
    gutterEl.scrollTop = sourceEl.scrollTop;
  }

  function compileNow() {
    result = TurtleCompiler.compile(sourceEl.value);
    renderGutter();
    renderMessages();
    renderTabs();
    renderPanel();
  }

  // Put the cursor on a given line / column of the editor.
  function jumpTo(line, col) {
    var lines = sourceEl.value.split('\n');
    var offset = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
    offset += Math.max(0, col - 1);
    sourceEl.focus();
    sourceEl.setSelectionRange(offset, offset);
  }

  // ---------- events -------------------------------------------------------

  var debounce = null;
  sourceEl.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(compileNow, 150);
  });
  sourceEl.addEventListener('scroll', function () { gutterEl.scrollTop = sourceEl.scrollTop; });
  sourceEl.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {                       // Tab inserts two spaces
      e.preventDefault();
      var s = sourceEl.selectionStart;
      sourceEl.value = sourceEl.value.slice(0, s) + '  ' + sourceEl.value.slice(sourceEl.selectionEnd);
      sourceEl.setSelectionRange(s + 2, s + 2);
      compileNow();
    }
  });

  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    activeTab = btn.getAttribute('data-tab');
    renderTabs();
    renderPanel();
  });

  messagesEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.msg');
    if (btn) jumpTo(Number(btn.getAttribute('data-line')), Number(btn.getAttribute('data-col')));
  });

  TurtleExamples.forEach(function (ex, i) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = ex.name;
    examplesEl.appendChild(opt);
  });
  examplesEl.addEventListener('change', function () {
    sourceEl.value = TurtleExamples[Number(examplesEl.value)].code;
    sourceEl.scrollTop = 0;
    compileNow();
  });

  $('help-colors').textContent = Object.keys(TurtleSemantic.COLORS).join(', ');
  $('help-btn').addEventListener('click', function () { $('help').showModal(); });

  // Start with the first example.
  sourceEl.value = TurtleExamples[0].code;
  compileNow();
})();
