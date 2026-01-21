# Design: Modularize Codebase

## Context

The plugin currently ships as a single 1391-line `src/index.ts` file. While the build already produces a single bundled output (required for OpenCode plugins), the source organization makes development and maintenance challenging.

**Stakeholders**: Plugin developers, contributors, maintainers

**Constraints**:
- Must maintain single-file bundled output for OpenCode plugin compatibility
- Must preserve all existing public API exports
- Must not introduce circular dependencies
- Must support tree-shaking in the bundled output

## Goals / Non-Goals

**Goals**:
- Split source into files with max ~200 lines each
- Group related code by concern (manager, tools, helpers)
- Enable parallel test development
- Improve IDE navigation and code discovery
- Reduce bundle size with minification

**Non-Goals**:
- Changing the public API
- Multi-file distribution (must remain single bundle)
- Adding new features

## Decisions

### Decision 1: Hybrid flat + nested structure

**Rationale**: Pure flat structure would have 15+ files in `src/`. Grouping manager and tools into folders provides logical organization without deep nesting.

**Structure**:
```
src/
├── types.ts              (~40 lines)  - Type definitions
├── constants.ts          (~5 lines)   - Constants
├── helpers.ts            (~150 lines) - Formatting utilities
├── manager/
│   ├── index.ts          (~100 lines) - BackgroundManager class shell + exports
│   ├── task-lifecycle.ts (~200 lines) - launch, cancel, clear methods
│   ├── polling.ts        (~150 lines) - polling and progress tracking
│   ├── notifications.ts  (~150 lines) - toast and parent notifications
│   └── events.ts         (~100 lines) - event subscription and handling
├── tools/
│   ├── index.ts          (~30 lines)  - Barrel export
│   ├── task.ts           (~60 lines)  - createBackgroundTask
│   ├── output.ts         (~80 lines)  - createBackgroundOutput
│   ├── cancel.ts         (~40 lines)  - createBackgroundCancel
│   ├── resume.ts         (~80 lines)  - createBackgroundResume
│   ├── list.ts           (~60 lines)  - createBackgroundList
│   └── clear.ts          (~40 lines)  - createBackgroundClear
└── index.ts              (~30 lines)  - Plugin entry point
```

### Decision 2: Manager class uses composition pattern

**Rationale**: The BackgroundManager class (800 lines) is split by extracting methods into separate files that are imported and used by the main class. This avoids inheritance complexity while enabling file-level separation.

**Implementation**:
- `manager/index.ts`: Class definition with constructor and public methods
- Other files export functions that receive `this` context or operate on task data
- Private state remains in the class instance

### Decision 3: Build with minification and source maps

**Rationale**: Current bundle is 450KB unminified. Minification reduces to ~200KB. Linked source maps enable debugging without bloating the bundle.

**Build command**:
```bash
bun build src/index.ts --outdir dist --format esm --minify --sourcemap linked
```

### Decision 4: Test files mirror source structure

**Rationale**: Matching test file structure to source makes it easy to locate tests and ensures comprehensive coverage.

**Structure**:
```
src/
├── manager/
│   ├── __tests__/
│   │   ├── task-lifecycle.test.ts
│   │   ├── polling.test.ts
│   │   └── ...
├── tools/
│   ├── __tests__/
│   │   ├── task.test.ts
│   │   ├── resume.test.ts
│   │   └── ...
└── __tests__/
    └── index.test.ts (integration)
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Circular dependencies | Dependency flow: types/constants → manager → helpers → tools → index |
| Import path complexity | Use relative imports, keep nesting to 2 levels max |
| Build breakage | Validate with typecheck + test + build after each task |
| Type declaration issues | Generate .d.ts per file, re-export from index.ts |

## Migration Plan

1. Create new file structure (empty files)
2. Move types and constants first (no dependencies)
3. Move helpers (depends only on types)
4. Split manager into files (depends on types, constants)
5. Split tools into files (depends on manager, helpers)
6. Update index.ts to compose and re-export
7. Update build scripts
8. Migrate tests to new structure
9. Validate everything works
10. Delete old index.ts content (now distributed)
