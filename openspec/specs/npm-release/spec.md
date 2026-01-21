# npm-release Specification

## Purpose
Defines the npm package build, validation, and release workflow for the background agent plugin.

## Requirements

### Requirement: Package Build
The system SHALL compile TypeScript source code into publishable JavaScript with type declarations, using minification and source maps for optimal distribution.

#### Scenario: Build ESM module
- **WHEN** developer runs the build command
- **THEN** system compiles `src/index.ts` to `dist/index.js` as ESM module
- **AND** generates `dist/index.d.ts` type declaration file
- **AND** build completes without errors

#### Scenario: Build with minification
- **WHEN** developer runs the build command
- **THEN** system minifies the output bundle using `--minify` flag
- **AND** bundle size is reduced by approximately 50% compared to unminified output
- **AND** minification does not affect runtime behavior

#### Scenario: Build with source maps
- **WHEN** developer runs the build command
- **THEN** system generates linked source map file `dist/index.js.map`
- **AND** source map enables debugging of minified code back to original TypeScript
- **AND** source map file is included in published package

#### Scenario: Multi-file source bundling
- **WHEN** source code is organized across multiple files and directories
- **THEN** build process bundles all modules into single `dist/index.js` file
- **AND** all exports from `src/index.ts` are preserved in the bundle
- **AND** tree-shaking removes unused code from final bundle

#### Scenario: Clean build
- **WHEN** developer runs clean command before build
- **THEN** system removes all files from `dist/` directory
- **AND** subsequent build creates fresh output

### Requirement: Code Quality Validation
The system SHALL enforce code quality through linting and type checking before release.

#### Scenario: Lint source code
- **WHEN** developer runs lint command
- **THEN** system checks all TypeScript files with Biome
- **AND** reports any linting errors or warnings
- **AND** exits with non-zero code if errors found

#### Scenario: Type check source code
- **WHEN** developer runs type check command
- **THEN** system validates TypeScript types without emitting files
- **AND** reports any type errors
- **AND** exits with non-zero code if errors found

### Requirement: Test Execution
The system SHALL run automated tests as part of the release validation process.

#### Scenario: Run test suite
- **WHEN** developer runs test command
- **THEN** system executes all `*.test.ts` files using Bun test runner
- **AND** reports pass/fail status for each test
- **AND** exits with non-zero code if any tests fail

### Requirement: Version Management
The system SHALL manage semantic versioning based on conventional commit messages.

#### Scenario: Determine version bump from commits
- **WHEN** release script analyzes commit history since last tag
- **THEN** commits with `feat:` prefix indicate MINOR version bump
- **AND** commits with `fix:` prefix indicate PATCH version bump
- **AND** commits with `BREAKING CHANGE` or `!` indicate MAJOR version bump

#### Scenario: Update package version
- **WHEN** version bump is determined
- **THEN** system updates `version` field in `package.json`
- **AND** new version follows semantic versioning format (MAJOR.MINOR.PATCH)

### Requirement: Changelog Generation
The system SHALL automatically generate changelog from conventional commit messages.

#### Scenario: Generate changelog entry
- **WHEN** release script runs changelog generation
- **THEN** system parses commits since last release
- **AND** groups changes by type (Features, Bug Fixes, etc.)
- **AND** prepends new entry to `CHANGELOG.md`
- **AND** includes version number and release date

### Requirement: Git Tagging
The system SHALL create git tags for each release with consistent naming.

#### Scenario: Create release tag
- **WHEN** release completes version bump
- **THEN** system creates annotated git tag with `v` prefix (e.g., `v0.1.0`)
- **AND** tag message includes version number
- **AND** tag is pushed to remote repository

### Requirement: npm Publishing
The system SHALL publish the package to npm registry with proper authentication.

#### Scenario: Publish to npm
- **WHEN** developer runs release command (without --dry-run)
- **THEN** system authenticates using `NPM_TOKEN` environment variable
- **AND** publishes package to npm registry
- **AND** confirms successful publication

#### Scenario: Dry run release
- **WHEN** developer runs release command with `--dry-run` flag
- **THEN** system executes all validation steps (build, test, lint)
- **AND** shows what version would be published
- **AND** does NOT publish to npm registry
- **AND** does NOT create git tags or commits

### Requirement: Pre-publish Validation
The system SHALL validate package integrity before publishing.

#### Scenario: Validate before publish
- **WHEN** `prepublishOnly` hook executes
- **THEN** system runs build command
- **AND** runs type check command
- **AND** runs test command
- **AND** aborts publish if any validation fails

#### Scenario: Validate clean git state
- **WHEN** release script starts
- **THEN** system checks for uncommitted changes
- **AND** aborts with error if working directory is dirty
- **AND** provides clear message about required clean state

### Requirement: Single-Command Release
The system SHALL provide a single command to execute the complete release workflow.

#### Scenario: Execute full release
- **WHEN** developer runs `release` command
- **THEN** system executes in order:
  1. Validates clean git state
  2. Runs tests
  3. Runs linting
  4. Runs type checking
  5. Builds package
  6. Determines version bump
  7. Updates package.json version
  8. Generates changelog
  9. Creates git commit with changes
  10. Creates git tag
  11. Publishes to npm
  12. Pushes commit and tag to remote
- **AND** stops immediately if any step fails
- **AND** reports progress at each step

### Requirement: Package Distribution Configuration
The system SHALL configure package.json for proper npm distribution.

#### Scenario: Configure exports field
- **WHEN** package is consumed by another project
- **THEN** ESM import resolves to `dist/index.js`
- **AND** TypeScript types resolve to `dist/index.d.ts`
- **AND** default export resolves to `dist/index.js`

#### Scenario: Configure files field
- **WHEN** package is published to npm
- **THEN** only specified files are included: `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`
- **AND** source files, tests, and configuration are excluded
- **AND** package size is minimized through minification

#### Scenario: Configure peer dependencies
- **WHEN** package is installed by consumer
- **THEN** `@opencode-ai/plugin` is listed as peer dependency
- **AND** consumer receives warning if peer dependency not installed
- **AND** no version conflicts occur with host application
