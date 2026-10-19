// The one Markdown parser: CommonMark + GFM + math + block-only directives (no text directives:
// `10:30`, `doi:…` and `localhost:3000` must stay text).
import { unified, type Processor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { directive } from 'micromark-extension-directive'
import { directiveFromMarkdown } from 'mdast-util-directive'

/** remark plugin: only the *flow* half of micromark-extension-directive (no text directives). */
export function remarkBlockDirectives(this: Processor) {
  const data = this.data()
  ;(data.micromarkExtensions ??= []).push({ flow: directive().flow })
  ;(data.fromMarkdownExtensions ??= []).push(directiveFromMarkdown())
}
export const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkBlockDirectives)
