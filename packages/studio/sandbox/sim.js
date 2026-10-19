// Simulation runner (inside a sandboxed iframe with an opaque origin and a no-network CSP). The lesson's
// code runs in a Worker with an OffscreenCanvas when possible, so a runaway loop can be terminated.
(function () {
  'use strict'
  var canvas = document.getElementById('c')
  var worker = null, lastBeat = Date.now(), current = null
  function post(m) { parent.postMessage(m, '*') }
  var PRELUDE = [
    'var __params = {}, __frames = [], __paramFns = [], __seed = 1;',
    'function __rand() { __seed |= 0; __seed = (__seed + 0x6d2b79f5) | 0; var t = Math.imul(__seed ^ (__seed >>> 15), 1 | __seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }',
    'var __raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (f) { return setTimeout(function () { f(performance.now()) }, 16) };',
    'function __loop(t) { for (var i = 0; i < __frames.length; i++) { try { __frames[i](t) } catch (e) { postMessage({ type: "error", message: String(e && e.message || e) }); __frames = []; return } } postMessage({ type: "heartbeat" }); __raf(__loop) }',
    'onmessage = function (e) { var m = e.data; if (m.type === "init") { var c = m.canvas; c.width = m.width * m.dpr; c.height = m.height * m.dpr; var ctx = c.getContext("2d"); ctx.scale(m.dpr, m.dpr); __params = m.params; __seed = m.seed || 1;',
    '  var api = { ctx: ctx, canvas: c, width: m.width, height: m.height, params: __params, theme: m.theme, random: __rand, frame: function (f) { __frames.push(f) }, onParams: function (f) { __paramFns.push(f) } };',
    '  try { __user(api) } catch (err) { postMessage({ type: "error", message: String(err && err.message || err) }) } __raf(__loop) }',
    '  else if (m.type === "params") { for (var k in m.params) __params[k] = m.params[k]; for (var i = 0; i < __paramFns.length; i++) { try { __paramFns[i](__params) } catch (e) {} } } };',
    'setInterval(function () { postMessage({ type: "heartbeat" }) }, 500);',
  ].join('\n')
  function start(m) {
    stop()
    current = m
    var dpr = Math.min(2, self.devicePixelRatio || 1)
    var source = PRELUDE + '\nfunction __user(api) {\n' + m.code + '\n}\n'
    var off = canvas.transferControlToOffscreen ? canvas.transferControlToOffscreen() : null
    try {
      if (!off) throw new Error('no OffscreenCanvas')
      worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })))
      worker.onmessage = function (e) { if (e.data.type === 'heartbeat') { lastBeat = Date.now(); post({ type: 'heartbeat' }) } else post(e.data) }
      worker.onerror = function (e) { post({ type: 'error', message: e.message || 'The simulation failed.' }); e.preventDefault() }
      worker.postMessage({ type: 'init', canvas: off, width: m.width, height: m.height, dpr: dpr, params: m.params, theme: m.theme, seed: m.seed }, [off])
    } catch (err) {
      post({ type: 'error', message: 'This browser cannot run simulations safely (no OffscreenCanvas in workers).' })
    }
    post({ type: 'ready' })
  }
  function stop() { if (worker) { worker.terminate(); worker = null } }
  // a worker that stops sending heartbeats (an endless loop) is terminated
  setInterval(function () { if (worker && Date.now() - lastBeat > 3000) { stop(); post({ type: 'error', message: 'The simulation stopped responding and was stopped.' }) } }, 1000)
  addEventListener('message', function (e) {
    if (e.source !== parent) return
    var m = e.data || {}
    if (m.type === 'init' && typeof m.code === 'string') { lastBeat = Date.now(); start(m) }
    else if (m.type === 'params' && worker) worker.postMessage({ type: 'params', params: m.params })
  })
})()
