# Release Process

## Option 1: Manual Release (Recommended)

To create a new release with explicit version:

```bash
npm run deploy -- <version>
```

Example:
```bash
npm run deploy -- 1.0.0
```

This will:
- Validate clean git state
- Validate tag doesn't exist
- Check npm login
- Run typecheck and tests
- Build the package
- Commit and tag the release
- Publish to npm
- Push to GitHub
- Create GitHub release with title "Release vX.Y.Z"

## Option 2: Semantic Release (Automated)

For fully automated releases based on commit messages:

```bash
npm run release
```

Dry run (no publish):
```bash
npm run release:dry-run
```

This will:
- Analyze commit messages to determine version bump
- Auto-generate CHANGELOG.md
- Create Git tag
- Publish to npm
- Create GitHub release

### Commit Message Format

Semantic release requires [Conventional Commits](https://conventionalcommits.org/):

| Prefix | Version Bump | Example |
|--------|--------------|---------|
| `fix:` | Patch (0.0.X) | `fix: resolve polling issue` |
| `feat:` | Minor (0.X.0) | `feat: add task resume` |
| `feat!:` or `BREAKING CHANGE:` | Major (X.0.0) | `feat!: change API` |
| `docs:` | No release | `docs: update README` |
| `chore:` | No release | `chore: update deps` |

## Prerequisites

Before releasing:

```bash
# Ensure you're logged in
npm login
gh auth login

# Verify clean state
git status
```

## Release Checklist

- [ ] All tests pass (`bun test`)
- [ ] Type check passes (`bun run typecheck`)
- [ ] Build succeeds (`bun run build:all`)
- [ ] Working directory is clean
- [ ] Logged in to npm and gh
