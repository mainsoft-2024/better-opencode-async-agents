# Change: Modularize codebase and optimize build for npm distribution

## Why

The current codebase has a single 1391-line `src/index.ts` file that is difficult to maintain, test, and navigate. Modularizing into smaller, focused files improves code organization, enables parallel development, and makes the codebase more accessible for contributors.

## What Changes

- **NEW**: Split `src/index.ts` into modular structure with ~15 files
- **NEW**: Create `src/manager/` folder with 5 files for BackgroundManager concerns
- **NEW**: Create `src/tools/` folder with 6 individual tool files + barrel export
- **NEW**: Separate `types.ts`, `constants.ts`, `helpers.ts` at root level
- **MODIFIED**: Build script to include minification (`--minify`)
- **MODIFIED**: Build script to include linked source maps (`--sourcemap linked`)
- **MODIFIED**: TypeScript config to generate `.d.ts` files matching source structure
- **MODIFIED**: Test structure to match new source module layout

## Impact

- Affected specs: `plugin-system`, `npm-release`
- Affected code: All of `src/` directory restructured
- No breaking changes to public API
- npm package structure unchanged (single bundled output)
- Build output size reduced ~50% with minification
- Source maps added for debugging minified code
