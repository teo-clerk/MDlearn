import { describe, it, expect } from 'vitest'
import { friendly } from '../../web/python/PythonBlock'

describe('Python error messages', () => {
  const tb = `Traceback (most recent call last):
  File "/lib/python314.zip/_pyodide/_base.py", line 420, in run_async
    await CodeRunner(
    ...<10 lines>...
    ).run_async(globals, locals)
  File "/lib/python314.zip/_pyodide/_base.py", line 420, in run_async
    coroutine = eval(self.code, globals, locals)
  File "<exec>", line 3, in <module>
ZeroDivisionError: division by zero`
  it('drops the interpreter frames and keeps the learner’s own', () => {
    const f = friendly(tb)
    expect(f).not.toMatch(/_pyodide/)
    expect(f).toContain('line 3, in <module>')
    expect(f).toContain('ZeroDivisionError: division by zero')
  })
  it('explains a library that cannot run in the browser, naming what can', () => {
    const f = friendly("Traceback (most recent call last):\n  File \"<exec>\", line 1, in <module>\nModuleNotFoundError: No module named 'torch.nn'")
    expect(f).toContain('“torch” is not available in the browser')
    expect(f).toMatch(/rasterio/)
  })
})
