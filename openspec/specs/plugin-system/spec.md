# plugin-system Specification

## Purpose
Defines the OpenCode plugin architecture for the background agent, including initialization, tool registration, and lifecycle management.

## Requirements

### Requirement: Plugin Initialization
The system SHALL initialize as an OpenCode plugin with proper context and client access, using a modular source structure that bundles into a single file.

#### Scenario: Plugin startup
- **WHEN** OpenCode loads the background agent plugin
- **THEN** plugin receives PluginInput context with client access
- **AND** initializes background task management system

#### Scenario: Modular source structure
- **WHEN** the plugin source code is organized
- **THEN** source files SHALL be split into logical modules (types, manager, tools, helpers)
- **AND** no single source file SHALL exceed 200 lines
- **AND** the build process SHALL bundle all modules into a single distributable file

### Requirement: Tool Registration
The system SHALL register multiple tools for background task operations using the OpenCode plugin framework, with each tool defined in its own source module.

#### Scenario: Register task management tools
- **WHEN** plugin initializes
- **THEN** registers tools for launching, cancelling, and querying background tasks
- **AND** each tool has proper type-safe schema definitions

#### Scenario: Tool module organization
- **WHEN** tools are defined in source code
- **THEN** each tool factory SHALL be in a separate file under `src/tools/`
- **AND** tools SHALL be re-exported via barrel export in `src/tools/index.ts`

### Requirement: Type-Safe Tool Schemas
The system SHALL use Zod schemas for all tool arguments to ensure type safety and validation.

#### Scenario: Validate tool inputs
- **WHEN** user invokes background task tools
- **THEN** input arguments are validated against defined schemas
- **AND** invalid inputs are rejected with clear error messages

### Requirement: Client Integration
The system SHALL integrate with OpenCode client for task execution and result handling.

#### Scenario: Execute tasks via client
- **WHEN** launching background tasks
- **THEN** uses provided client to execute agent prompts asynchronously
- **AND** handles client responses and errors appropriately

### Requirement: Plugin Lifecycle Management
The system SHALL properly manage plugin lifecycle including cleanup and resource management.

#### Scenario: Plugin shutdown
- **WHEN** OpenCode shuts down or unloads the plugin
- **THEN** gracefully terminates any running background tasks
- **AND** cleans up resources and temporary data
