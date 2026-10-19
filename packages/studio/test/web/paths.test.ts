import { describe, it, expect } from 'vitest'
import { resolveRel, linkTarget, assetUrl } from '../../web/lib/paths'

describe('document-relative paths', () => {
  it('resolves ./, ../ and anchors', () => {
    expect(resolveRel('00_F/04_sar.md', '05_geo.md')).toBe('00_F/05_geo.md')
    expect(resolveRel('00_F/04_sar.md', '../README.md#setup')).toBe('README.md#setup')
    expect(resolveRel('a.md', '../../etc/passwd')).toBeNull()
    expect(resolveRel('a.md', 'https://esa.int')).toBeNull()
  })
  it('routes Markdown links in-app and leaves the rest alone', () => {
    expect(linkTarget('ws', 'd/a.md', 'b.md#x')).toBe('/w/ws/doc?path=d%2Fb.md#x')
    expect(linkTarget('ws', 'd/a.md', '../learn/x/01.learn.md')).toBe('/w/ws/lesson?path=learn%2Fx%2F01.learn.md')
    expect(linkTarget('ws', 'd/a.md', 'data.csv')).toBeNull()
    expect(linkTarget('ws', 'd/a.md', '#sec')).toBe('#sec')
  })
  it('images become asset URLs', () => {
    expect(assetUrl('ws', 'd/a.md', 'img/p.png')).toBe('/api/w/ws/asset?path=d%2Fimg%2Fp.png')
  })
})
