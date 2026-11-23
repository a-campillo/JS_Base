(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* =====================================================================
     Sandbox core — shared by the Web Worker and the inline fallback.
     Must stay self-contained: it is serialized with toString().
     ===================================================================== */
  function sandboxCore() {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    const quote = s => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
    const formatError = e => (e instanceof Error ? `${e.name}: ${e.message}` : inspect(e));

    function fmt(v, depth, seen) {
      const t = typeof v;
      if (t === "string") return quote(v);
      if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
      if (t === "boolean") return String(v);
      if (t === "bigint") return v + "n";
      if (t === "symbol") return v.toString();
      if (t === "undefined") return "undefined";
      if (v === null) return "null";
      if (t === "function") {
        const isClass = /^class\b/.test(Function.prototype.toString.call(v));
        return isClass ? `[class ${v.name || "(anonymous)"}]` : `[Function: ${v.name || "(anonymous)"}]`;
      }
      if (v instanceof Error) return formatError(v);
      if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
      if (v instanceof RegExp) return String(v);
      if (v instanceof Promise) return "Promise { … }";
      if (seen.has(v)) return "[Circular]";
      if (depth > 3) return Array.isArray(v) ? "[Array]" : "[Object]";

      seen.add(v);
      try {
        let items, open, close, prefix = "";
        if (Array.isArray(v)) {
          items = [];
          for (let i = 0; i < v.length; i++) items.push(i in v ? fmt(v[i], depth + 1, seen) : "<empty>");
          open = "["; close = "]";
        } else if (v instanceof Map) {
          items = [...v].map(([k, val]) => `${fmt(k, depth + 1, seen)} => ${fmt(val, depth + 1, seen)}`);
          prefix = `Map(${v.size}) `; open = "{"; close = "}";
        } else if (v instanceof Set) {
          items = [...v].map(val => fmt(val, depth + 1, seen));
          prefix = `Set(${v.size}) `; open = "{"; close = "}";
        } else {
          items = Object.keys(v).map(k =>
            `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k)}: ${fmt(v[k], depth + 1, seen)}`);
          const proto = Object.getPrototypeOf(v);
          const ctor = proto && proto.constructor && proto.constructor.name;
          if (proto === null) prefix = "[Object: null prototype] ";
          else if (ctor && ctor !== "Object") prefix = ctor + " ";
          open = "{"; close = "}";
        }
        if (!items.length) return prefix + open + close;
        const oneLine = `${prefix}${open} ${items.join(", ")} ${close}`;
        if (oneLine.length <= 72 && !oneLine.includes("\n")) return oneLine;
        const pad = "  ".repeat(depth + 1);
        return `${prefix}${open}\n${pad}${items.join(",\n" + pad)}\n${"  ".repeat(depth)}${close}`;
      } finally {
        seen.delete(v);
      }
    }

    function inspect(v) { return fmt(v, 0, new WeakSet()); }
    const format = args => args.map(a => (typeof a === "string" ? a : inspect(a))).join(" ");

    async function execute(code, emit) {
      const out = type => (...args) => emit({ type, text: format(args) });
      const fakeConsole = {
        log: out("log"), info: out("info"), warn: out("warn"), error: out("error"),
        debug: out("log"), table: out("log"), dir: out("log"), trace: out("log"),
      };
      try {
        await new AsyncFunction("console", code)(fakeConsole);
      } catch (err) {
        emit({ type: "error", text: "Uncaught " + formatError(err) });
      }
    }

    return { execute, inspect, formatError };
  }

  const inlineCore = sandboxCore();
  const RUN_TIMEOUT = 4000;
  const WORKER_SRC = `
    const core = (${sandboxCore.toString()})();
    self.addEventListener("error", e => {
      e.preventDefault();
      postMessage({ type: "error", text: e.error ? "Uncaught " + core.formatError(e.error) : (e.message || "Uncaught error") });
    });
    self.addEventListener("unhandledrejection", e => {
      e.preventDefault();
      postMessage({ type: "error", text: "Uncaught (in promise) " + core.formatError(e.reason) });
    });
    self.onmessage = async e => {
      postMessage({ type: "ready" });
      await core.execute(e.data, m => postMessage(m));
      postMessage({ type: "done" });
    };`;

  let workerUrl = null;
  let workersAvailable = typeof Worker !== "undefined";

  function runInline(code, emit, onDone) {
    inlineCore.execute(code, emit).then(onDone);
    return () => {};
  }

  // Runs code in a fresh worker so infinite loops can be killed. Returns a stop() function.
  function runCode(code, emit, onDone) {
    if (!workersAvailable) return runInline(code, emit, onDone);
    let worker;
    try {
      workerUrl = workerUrl || URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      worker = new Worker(workerUrl);
    } catch (_) {
      workersAvailable = false;
      return runInline(code, emit, onDone);
    }
    let started = false, finished = false, stopped = false;
    const stop = () => { stopped = true; clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => {
      worker.terminate();
      if (!finished) {
        emit({ type: "error", text: `⏱ Detenido tras ${RUN_TIMEOUT / 1000} s — ¿bucle infinito?` });
        onDone();
      }
    }, RUN_TIMEOUT);
    worker.onmessage = e => {
      if (stopped) return;
      const msg = e.data;
      if (msg.type === "ready") started = true;
      else if (msg.type === "done") { finished = true; onDone(); }
      else emit(msg);
    };
    worker.onerror = e => {
      e.preventDefault();
      if (!started) {             // worker could not even start (e.g. blocked by CSP) → fall back
        stop();
        workersAvailable = false;
        runInline(code, emit, onDone);
      }
    };
    worker.postMessage(code);
    return stop;
  }

  /* =====================================================================
     Syntax highlighter
     ===================================================================== */
  const KEYWORDS = new Set(("const let var function return if else for while do switch case break continue " +
    "default new class extends typeof instanceof in of try catch finally throw async await yield this delete " +
    "void import export super").split(" "));
  const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);
  const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(`(?:\\[\s\S]|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b0[xob][\da-fA-F_]+n?\b|\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?\b)|([A-Za-z_$][\w$]*)|(=>|[+\-*/%=!<>&|^~?:]+)/g;

  function highlight(code) {
    let html = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(code))) {
      const [tok, comment, str, num, ident, op] = m;
      let cls = null;
      if (comment) cls = "c";
      else if (str) cls = "s";
      else if (num) cls = "n";
      else if (op) cls = "o";
      else if (ident) {
        if (KEYWORDS.has(ident)) cls = "k";
        else if (LITERALS.has(ident)) cls = "l";
        else if (/^\s*\(/.test(code.slice(TOKEN.lastIndex, TOKEN.lastIndex + 40))) cls = "f";
        else if (code[m.index - 1] === ".") cls = "p";
        else if (/^[A-Z]/.test(ident)) cls = "t";
      }
      html += esc(code.slice(last, m.index));
      html += cls ? `<span class="tk-${cls}">${esc(tok)}</span>` : esc(tok);
      last = TOKEN.lastIndex;
    }
    return html + esc(code.slice(last));
  }

  function dedent(text) {
    const lines = text.replace(/\r/g, "").replace(/^\s*\n/, "").replace(/\s+$/, "").split("\n");
    const indents = lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map(l => l.slice(min)).join("\n");
  }

  /* =====================================================================
     Static snippets
     ===================================================================== */
  $$("textarea.snippet").forEach(ta => {
    const pre = document.createElement("pre");
    pre.className = "snippet";
    pre.innerHTML = `<code>${highlight(dedent(ta.value))}</code>`;
    ta.replaceWith(pre);
  });

  /* =====================================================================
     Playgrounds
     ===================================================================== */
  function buildTestCode(userCode, fnName, tests) {
    return `${userCode}
;(() => {
  const cases = ${JSON.stringify(tests)};
  if (typeof ${fnName} !== "function") { console.error("${fnName} no está definida como función"); return; }
  let passed = 0;
  for (const [args, expected] of cases) {
    const label = "${fnName}(" + args.map(a => JSON.stringify(a)).join(", ") + ")";
    try {
      const got = ${fnName}(...args);
      const ok = JSON.stringify(got) === JSON.stringify(expected);
      if (ok) passed++;
      (ok ? console.log : console.error)((ok ? "✅ " : "❌ ") + label + " → " + JSON.stringify(got) +
        (ok ? "" : "   (esperado " + JSON.stringify(expected) + ")"));
    } catch (e) {
      console.error("💥 " + label + " lanzó " + e.name + ": " + e.message);
    }
  }
  const all = passed === cases.length;
  (all ? console.info : console.warn)(passed + "/" + cases.length + " pruebas superadas" + (all ? " 🎉" : ""));
})();`;
  }

  function insertText(ta, text) {
    // execCommand keeps the native undo stack; fall back to setRangeText
    if (!document.execCommand || !document.execCommand("insertText", false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  }

  function setupPlayground(src) {
    const original = dedent(src.value);
    const challenge = src.dataset.challenge;
    const tests = challenge ? JSON.parse(src.dataset.tests) : null;
    const solutionEl = src.nextElementSibling && src.nextElementSibling.matches("textarea.solution") ? src.nextElementSibling : null;
    const solution = solutionEl ? dedent(solutionEl.value) : null;

    const pg = document.createElement("div");
    pg.className = "pg";
    if (src.getAttribute("style")) pg.setAttribute("style", src.getAttribute("style"));
    pg.innerHTML = `
      <div class="pg-bar">
        <div class="pg-dots"><i></i><i></i><i></i></div>
        <div class="pg-name">${esc(src.dataset.name || "playground.js")}</div>
        ${solution ? `<button class="btn" data-act="solution" title="Mostrar una posible solución">💡 Solución</button>` : ""}
        <button class="btn" data-act="reset" title="Restaurar el código original">↺ Reiniciar</button>
        <button class="btn primary" data-act="run" title="Ejecutar (Ctrl+Enter)">▶ ${challenge ? "Ejecutar pruebas" : "Ejecutar"}</button>
      </div>
      <div class="editor-scroll scroll">
        <div class="editor">
          <pre aria-hidden="true"><code></code></pre>
          <textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Editor de código"></textarea>
        </div>
      </div>
      <div class="console">
        <div class="console-head"><span>Consola</span><button data-act="clear">limpiar</button></div>
        <div class="out scroll" aria-live="polite"></div>
      </div>`;
    src.replaceWith(pg);
    if (solutionEl) solutionEl.remove();

    const ta = $("textarea", pg);
    const code = $("pre code", pg);
    const out = $(".out", pg);
    let stop = () => {};

    const render = () => {
      code.innerHTML = highlight(ta.value) + (ta.value.endsWith("\n") || !ta.value ? " " : "");
    };
    const setCode = value => { ta.value = value; render(); };
    const print = (type, text) => {
      const line = document.createElement("div");
      line.className = "line " + type;
      line.textContent = text;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    };
    const run = () => {
      stop();
      out.innerHTML = "";
      const runBtn = $('[data-act="run"]', pg);
      runBtn.disabled = true;
      const program = challenge ? buildTestCode(ta.value, challenge, tests) : ta.value;
      out.classList.add("ran");
      stop = runCode(program, msg => print(msg.type, msg.text), () => { runBtn.disabled = false; });
    };

    pg.addEventListener("click", e => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "run") run();
      else if (act === "reset") { stop(); setCode(original); out.innerHTML = ""; out.classList.remove("ran"); }
      else if (act === "clear") out.innerHTML = "";
      else if (act === "solution") { setCode(solution); run(); }
    });

    ta.addEventListener("input", render);
    ta.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); return; }
      if (e.key === "Escape") { ta.blur(); return; }
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); insertText(ta, "  "); return; }
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // keep the current line's indentation (+1 level after an opening bracket)
        const before = ta.value.slice(0, ta.selectionStart);
        const lineStart = before.lastIndexOf("\n") + 1;
        let indent = before.slice(lineStart).match(/^ */)[0];
        if (/[{[(]\s*$/.test(before)) indent += "  ";
        e.preventDefault();
        insertText(ta, "\n" + indent);
      }
    });

    setCode(original);
  }

  $$("textarea.code").forEach(setupPlayground);

  /* =====================================================================
     Widgets
     ===================================================================== */
  const evaluate = expr => Function(`"use strict"; return (${expr});`)();
  const typeName = v => (v === null ? "null" : Array.isArray(v) ? "object (array)" : typeof v);

  // ---- Equality explorer ----
  $$('[data-widget="equality"]').forEach(w => {
    const VALUES = ["0", "1", '""', '"0"', '"1"', '" "', "false", "true", "null", "undefined", "NaN", "[]", "[0]", "{}"];
    const selA = $(".eq-a", w), selB = $(".eq-b", w), results = $(".eq-results", w), table = $(".matrix", w);
    let mode = "==";
    VALUES.forEach(v => { selA.add(new Option(v, v)); selB.add(new Option(v, v)); });
    selA.value = "null"; selB.value = "0";

    const cmp = (a, b, op) => op === "Object.is" ? evaluate(`Object.is(${a}, ${b})`) : evaluate(`(${a}) ${op} (${b})`);

    function update() {
      const a = selA.value, b = selB.value;
      results.innerHTML = ["==", "===", "Object.is"].map(op => {
        const r = cmp(a, b, op);
        const expr = op === "Object.is" ? `Object.is(${a}, ${b})` : `${a} ${op} ${b}`;
        return `<div class="eq-res"><div class="e">${esc(expr)}</div><div class="v ${r ? "ok" : "bad"}">${r}</div></div>`;
      }).join("");
      $$("td", table).forEach(td => td.classList.toggle("sel", td.dataset.a === a && td.dataset.b === b));
    }

    function buildMatrix() {
      let html = "<thead><tr><th></th>" + VALUES.map(v => `<th>${esc(v)}</th>`).join("") + "</tr></thead><tbody>";
      for (const a of VALUES) {
        html += `<tr><th>${esc(a)}</th>`;
        for (const b of VALUES) {
          const r = cmp(a, b, mode);
          html += `<td class="${r ? "t" : ""} ${mode === "===" ? "strict" : ""}" data-a='${esc(a)}' data-b='${esc(b)}' title="${esc(`${a} ${mode} ${b} → ${r}`)}"></td>`;
        }
        html += "</tr>";
      }
      table.innerHTML = html + "</tbody>";
      update();
    }

    selA.addEventListener("change", update);
    selB.addEventListener("change", update);
    table.addEventListener("click", e => {
      const td = e.target.closest("td");
      if (!td) return;
      selA.value = td.dataset.a; selB.value = td.dataset.b;
      update();
    });
    $$("[data-mode]", w).forEach(btn => btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      $$("[data-mode]", w).forEach(b => b.classList.toggle("on", b === btn));
      buildMatrix();
    }));
    buildMatrix();
  });

  // ---- Coercion reveal cards ----
  $$(".widget-reveal").forEach(w => {
    const cards = $$(".reveal", w);
    const show = card => {
      const expr = $("code", card).textContent;
      let html;
      try {
        const v = evaluate(expr);
        html = `${esc(inlineCore.inspect(v))}<small>${typeName(v)}</small>`;
      } catch (err) {
        html = `${esc(inlineCore.formatError(err))}`;
      }
      $(".ans", card).innerHTML = html;
      card.classList.add("shown");
    };
    const hide = card => { $(".ans", card).textContent = "?"; card.classList.remove("shown"); };
    cards.forEach(card => card.addEventListener("click", () => (card.classList.contains("shown") ? hide(card) : show(card))));
    $(".reveal-all", w).addEventListener("click", () => cards.forEach(show));
    $(".reveal-reset", w).addEventListener("click", () => cards.forEach(hide));
  });

  // ---- Truthiness tester ----
  $$('[data-widget="truthy"]').forEach(w => {
    const input = $(".truthy-input", w), badge = $(".truth-badge", w), detail = $(".truthy-detail", w);
    const PRESETS = ["0", '"0"', '""', '" "', "[]", "{}", "null", "undefined", "NaN", "-0", "0n", '"false"', "Infinity", "() => {}"];
    function test() {
      try {
        const v = evaluate(input.value);
        const truthy = Boolean(v);
        badge.className = "truth-badge " + (truthy ? "truthy" : "falsy");
        badge.textContent = truthy ? "TRUTHY" : "FALSY";
        detail.textContent = `Boolean(${input.value}) → ${truthy}   ·   typeof → "${typeof v}"`;
      } catch (err) {
        badge.className = "truth-badge err";
        badge.textContent = inlineCore.formatError(err);
        detail.textContent = "";
      }
    }
    PRESETS.forEach(p => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = p;
      b.addEventListener("click", () => { input.value = p; test(); });
      $(".truthy-presets", w).appendChild(b);
    });
    $(".truthy-run", w).addEventListener("click", test);
    input.addEventListener("input", test);
    test();
  });

  // ---- Operator lab ----
  $$('[data-widget="lab"]').forEach(w => {
    const a = $(".lab-a", w), op = $(".lab-op", w), b = $(".lab-b", w), outBox = $(".lab-out", w);
    const PRESETS = [
      ['"5"', "+", "3"], ['"5"', "-", "3"], ["[1, 2]", "+", "[3]"], ["null", "==", "undefined"],
      ["null", "===", "undefined"], ["0", "||", '"default"'], ["0", "??", '"default"'], ['"hi"', "&&", "42"],
      ["2 + 3", "*", "4 ** 2"], ["10", "%", "4"], ['"manzana"', "<", '"banano"'], ["NaN", "===", "NaN"],
    ];
    function update() {
      const expr = `(${a.value || "undefined"}) ${op.value} (${b.value || "undefined"})`;
      $(".expr-line", outBox).textContent = `${a.value} ${op.value} ${b.value}`;
      try {
        const v = evaluate(expr);
        outBox.classList.remove("error");
        $(".val", outBox).textContent = inlineCore.inspect(v);
        $(".type", outBox).textContent = "typeof → " + typeName(v);
      } catch (err) {
        outBox.classList.add("error");
        $(".val", outBox).textContent = inlineCore.formatError(err);
        $(".type", outBox).textContent = "";
      }
    }
    PRESETS.forEach(([x, o, y]) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = `${x} ${o} ${y}`;
      btn.addEventListener("click", () => { a.value = x; op.value = o; b.value = y; update(); });
      $(".presets", w).appendChild(btn);
    });
    [a, b].forEach(el => el.addEventListener("input", update));
    op.addEventListener("change", update);
    update();
  });

  // ---- Quizzes ----
  function setupQuiz(quiz, onAnswer) {
    const buttons = $$(".opts button", quiz);
    const answer = Number(quiz.dataset.answer);
    buttons.forEach((btn, i) => btn.addEventListener("click", () => {
      buttons.forEach(b => (b.disabled = true));
      buttons[answer].classList.add("correct");
      if (i !== answer) btn.classList.add("wrong");
      const explain = $(".explain", quiz);
      if (explain) explain.hidden = false;
      onAnswer && onAnswer(i === answer);
    }));
    return () => {
      buttons.forEach(b => { b.disabled = false; b.classList.remove("correct", "wrong"); });
      const explain = $(".explain", quiz);
      if (explain) explain.hidden = true;
    };
  }

  const quizSetQuizzes = new Set();
  $$(".quiz-set").forEach(set => {
    const scope = set.closest(".slide, [data-quiz-scope]") || document;
    const quizzes = $$(".quiz", set);
    const scoreEl = $(".score", scope), resultEl = $(".quiz-result", scope);
    let score = 0, answered = 0;
    const render = () => {
      scoreEl.textContent = `Puntaje: ${score} / ${quizzes.length}`;
      if (!resultEl) return;
      const done = answered === quizzes.length;
      resultEl.hidden = !done;
      if (done) {
        resultEl.textContent = score === quizzes.length ? "🏆 ¡Puntaje perfecto! Estás listo para el siguiente nivel."
          : score >= quizzes.length / 2 ? "👏 ¡Buen trabajo! Repasa la hoja de referencia para las que fallaste."
          : "📚 Buen comienzo: la hoja de referencia y la página de recursos te ayudarán a subir de nivel.";
      }
    };
    const resets = quizzes.map(q => {
      quizSetQuizzes.add(q);
      return setupQuiz(q, ok => { answered++; if (ok) score++; render(); });
    });
    $(".quiz-reset", scope).addEventListener("click", () => { resets.forEach(r => r()); score = 0; answered = 0; render(); });
    render();
  });
  $$(".quiz").forEach(q => { if (!quizSetQuizzes.has(q)) setupQuiz(q); });

  /* =====================================================================
     Navigation, menu, notes
     ===================================================================== */
  const slides = $$(".slide");
  if (!slides.length) return;   // standalone pages (cheat sheet, quiz, Q&A) have no deck
  const menu = $("#menu"), notes = $("#notes"), notesBody = $("#notes-body");
  let current = -1;

  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === current) return;
    current = i;
    slides.forEach((s, idx) => {
      s.classList.toggle("active", idx === i);
      s.classList.toggle("past", idx < i);
    });
    const slide = slides[i];
    $("#progress").style.width = `${((i + 1) / slides.length) * 100}%`;
    $("#counter").textContent = `${i + 1} / ${slides.length}`;
    $("#section-name").textContent = slide.dataset.section || "";
    // slides that already show a logo hide the corner badge
    document.body.classList.toggle("hide-badge", slide.matches(".title-slide, .divider, [data-hide-badge]"));
    const n = $("aside.notes", slide);
    notesBody.innerHTML = n ? n.innerHTML : '<p class="muted">Esta diapositiva no tiene notas.</p>';
    $$("button", menu).forEach(b => b.classList.toggle("current", Number(b.dataset.index) === i));
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    history.replaceState(null, "", "#" + (i + 1));
  }

  // Menu
  let lastSection = null;
  slides.forEach((s, i) => {
    if (s.dataset.section !== lastSection) {
      lastSection = s.dataset.section;
      const h = document.createElement("h4");
      h.textContent = lastSection;
      menu.appendChild(h);
    }
    const b = document.createElement("button");
    b.dataset.index = i;
    b.innerHTML = `<span class="i">${i + 1}</span>${esc(s.dataset.title || "")}`;
    b.addEventListener("click", () => { go(i); toggleMenu(false); });
    menu.appendChild(b);
  });

  const toggleMenu = force => {
    const open = menu.classList.toggle("open", force);
    $("#btn-menu").classList.toggle("on", open);
  };
  const toggleNotes = force => {
    const open = notes.classList.toggle("open", force);
    $("#btn-notes").classList.toggle("on", open);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  $("#prev").addEventListener("click", () => go(current - 1));
  $("#next").addEventListener("click", () => go(current + 1));
  $("#btn-menu").addEventListener("click", () => toggleMenu());
  $("#btn-notes").addEventListener("click", () => toggleNotes());
  $("#btn-fs").addEventListener("click", toggleFullscreen);

  // Agenda cards jump to the first slide of a section
  $$("[data-goto]").forEach(btn => btn.addEventListener("click", () => {
    const idx = slides.findIndex(s => s.dataset.section === btn.dataset.goto && s.classList.contains("divider"));
    go(idx >= 0 ? idx : slides.findIndex(s => s.dataset.section === btn.dataset.goto));
  }));

  document.addEventListener("keydown", e => {
    const t = e.target;
    if (t.matches && t.matches("textarea, input, select, [contenteditable]")) {
      if (e.key === "Escape") t.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const onButton = t.matches && t.matches("button");
    switch (e.key) {
      case "ArrowRight": case "PageDown": go(current + 1); break;
      case "ArrowLeft": case "PageUp": go(current - 1); break;
      case " ": if (onButton) return; go(e.shiftKey ? current - 1 : current + 1); break;
      case "Home": go(0); break;
      case "End": go(slides.length - 1); break;
      case "m": case "M": toggleMenu(); break;
      case "n": case "N": toggleNotes(); break;
      case "f": case "F": toggleFullscreen(); break;
      case "Escape": toggleMenu(false); toggleNotes(false); break;
      default: return;
    }
    e.preventDefault();
  });

  // Touch swipe (ignored inside editors and widgets)
  let touchX = null;
  document.addEventListener("touchstart", e => {
    touchX = e.target.closest(".pg, .widget, .matrix-wrap") ? null : e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener("touchend", e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) go(current + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // Back links from the standalone pages use "#end" (final slide) or a slide's data-slug, e.g. "#closures"
  const fromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === "end") return slides.length - 1;
    const bySlug = slides.findIndex(s => s.dataset.slug === h);
    return bySlug >= 0 ? bySlug : (parseInt(h, 10) || 1) - 1;
  };
  window.addEventListener("hashchange", () => go(fromHash()));
  go(fromHash());
})();
