<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Important Documentation References

The following documentation files from `@docs/` are particularly important for understanding and working with this project:

### Core Development Documents (MUST READ if you need to develop plugins!)
- **`sdk.mdx`** - Software Development Kit documentation, essential for understanding the development framework and APIs
- **`server.mdx`** - Server architecture and configuration, critical for backend development and deployment
- **`tools.mdx`** - Available tools and utilities, important for development workflow and automation
- **`custom-tools.mdx`** - Custom tool development and integration, key for extending functionality

These documents should be referenced frequently when:
- Setting up development environment
- Understanding project architecture
- Extending or modifying functionality
- Troubleshooting issues
- Planning new features

All documentation files are sourced from: `https://github.com/anomalyco/opencode/tree/dev/packages/web/src/content/docs`

* Using ToDo tool is ESSENTIAL!!!

## Development Constraints

### Plugin Hot-Reload Limitation
**IMPORTANT**: After making changes to the plugin code and running `npm run build`, OpenCode must be **restarted** for the plugin changes to take effect. The plugin is loaded at OpenCode startup and does not support hot-reload.

Steps to test plugin changes:
1. Make code changes
2. Run `npm run build`
3. **Restart OpenCode** (the host application)
4. Test the updated functionality
