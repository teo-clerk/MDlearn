// Python runner (a sandboxed iframe with an opaque origin). Pyodide runs in a Worker that can be
// terminated; the page relays messages between the app and the worker.
(function () {
  'use strict'
  var base = new URL('/sandbox/pyodide/', location.href).href
  var worker = null
  var readyAt = 0
  function post(m) { parent.postMessage(m, '*') }

  // The Worker's source: loads Pyodide, runs cells in one shared namespace, captures output and figures.
  var WORKER = [
    'var py = null, loading = null, cell = 0;',
    'function say(type, extra) { postMessage(Object.assign({ type: type }, extra)) }',
    'async function boot(base) {',
    '  importScripts(base + "pyodide.js");',
    '  say("status", { text: "Loading Python…" });',
    '  py = await loadPyodide({ indexURL: base });',
    '  py.setStdout({ batched: function (s) { say("stdout", { id: cell, text: s }) } });',
    '  py.setStderr({ batched: function (s) { say("stderr", { id: cell, text: s }) } });',
    '  await py.runPythonAsync("import os, sys, io, json, ast, base64, traceback\\nos.environ[\\"MPLBACKEND\\"] = \\"Agg\\"");',
    '}',
    'var HARNESS = ' + JSON.stringify([
      'def __mdl_figures():',
      '    if "matplotlib.pyplot" not in sys.modules: return []',
      '    import matplotlib.pyplot as plt',
      '    out = []',
      '    for n in plt.get_fignums():',
      '        buf = io.BytesIO(); plt.figure(n).savefig(buf, format="png", dpi=110, bbox_inches="tight")',
      '        out.append(base64.b64encode(buf.getvalue()).decode())',
      '    plt.close("all")',
      '    return out',
      'def __mdl_tests(src, ns):',
      '    tree = ast.parse(src)',
      '    results = []',
      '    for node in tree.body:',
      '        code = compile(ast.Module([node], []), "<tests>", "exec")',
      '        is_test = isinstance(node, ast.Assert)',
      '        try:',
      '            exec(code, ns)',
      '            if is_test: results.append({"ok": True, "text": ast.unparse(node)})',
      '        except AssertionError as e:',
      '            results.append({"ok": False, "text": ast.unparse(node), "message": str(e)})',
      '        except Exception as e:',
      '            results.append({"ok": False, "text": ast.unparse(node), "message": type(e).__name__ + ": " + str(e)})',
      '    return results',
    ].join('\n')) + ';',
    'onmessage = async function (e) {',
    '  var m = e.data;',
    '  try {',
    '    if (m.type === "boot") { loading = boot(m.base); await loading; say("ready"); return }',
    '    await loading;',
    '    cell = m.id;',
    '    if (m.type === "run") {',
    '      await py.loadPackagesFromImports(m.code, { messageCallback: function (t) { say("status", { text: t }) } });',
    '      if (!py.globals.get("__mdl_figures")) py.runPython(HARNESS);',
    '      say("status", { text: "Running…" });',
    '      var result = await py.runPythonAsync(m.code);',
    '      var figs = py.runPython("json.dumps(__mdl_figures())");',
    '      say("done", { id: m.id, result: result === undefined || result === null ? null : String(result), figures: JSON.parse(figs) });',
    '    } else if (m.type === "tests") {',
    '      await py.loadPackagesFromImports(m.code + "\\n" + m.tests);',
    '      if (!py.globals.get("__mdl_tests")) py.runPython(HARNESS);',
    '      py.runPython("__mdl_ns = {\\"__name__\\": \\"__main__\\"}");',
    '      try { await py.runPythonAsync(m.code, { globals: py.globals.get("__mdl_ns") }) } catch (err) { say("tests", { id: m.id, error: String(err.message || err), results: [] }); return }',
    '      py.globals.set("__mdl_src", m.tests);',
    '      var res = py.runPython("json.dumps(__mdl_tests(__mdl_src, __mdl_ns))");',
    '      say("tests", { id: m.id, results: JSON.parse(res) });',
    '    }',
    '  } catch (err) { say("error", { id: m.id, message: String(err && err.message || err) }) }',
    '};',
  ].join('\n')

  function start() {
    stop()
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })))
    worker.onmessage = function (e) { post(e.data) }
    worker.onerror = function (e) { post({ type: 'error', id: -1, message: e.message || 'Python failed to start.' }); e.preventDefault() }
    worker.postMessage({ type: 'boot', base: base })
  }
  function stop() { if (worker) { worker.terminate(); worker = null } }
  addEventListener('message', function (e) {
    if (e.source !== parent) return
    var m = e.data || {}
    if (m.type === 'start') start()
    else if (m.type === 'stop') { stop(); post({ type: 'stopped' }) }
    else if ((m.type === 'run' || m.type === 'tests') && typeof m.id === 'number') { if (!worker) start(); worker.postMessage(m) }
  })
  post({ type: 'frame-ready' })
})()
