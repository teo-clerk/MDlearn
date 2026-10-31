# Contributing

Bug reports, ideas and pull requests are welcome. For anything large, open an issue first so we can agree on the
shape before you spend time on it.

## Getting set up

You need Node.js 22.15 or newer and git.

```bash
git clone https://github.com/teo-clerk/MDlearn.git
cd MDlearn
npm install
npm run build
npm run dev        # Studio with hot reload
```

## Before you open a pull request

```bash
npm run build
npm run typecheck
npm test
npm run check-docs                     # every example in docs/ must compile
npm run test:e2e -w @mdlearn/studio    # Playwright, after a build
```

## How the project works

- **Write the test first**, and see it fail for the right reason.
- **Every visible string goes through `t()` or `tp()`.** English is the key, and each string needs Italian, Spanish,
  French and Catalan in `packages/studio/web/i18n/`. A test fails on any string that is missing or typed straight
  into JSX.
- **The interface stays quiet.** Read `packages/studio/DESIGN.md` before changing how something looks. Colour has a
  job or it doesn't appear.
- **Don't invent science.** Claims about learning belong in `docs/PEDAGOGICAL_SPEC.md`, with a source you have read.
- **New dependencies** should be at least two weeks old, with a licence compatible with MIT.
- **Commits** follow `type: description`, with the types `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`
  and `ci`.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
