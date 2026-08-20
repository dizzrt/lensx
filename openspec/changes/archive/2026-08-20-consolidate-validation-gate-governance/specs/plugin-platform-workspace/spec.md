## MODIFIED Requirements

### Requirement: Standard root commands must fully validate all workspace members

The root `build`, `typecheck`, `test`, and `check` commands MUST each execute the corresponding lifecycle script for the root application and every actual workspace member. Every member MUST declare all four scripts, and aggregate commands MUST NOT silently skip a member with a missing script. A root application or member command failure MUST cause the aggregate command to return a non-zero status. The root application's `dev`, `preview`, and Tauri/Rust-specific commands MUST retain their existing purposes. Root package scripts MUST remain a governed stable interface: package-local lifecycle scripts MUST remain discoverable through the standard aggregate commands, while focused cross-layer capability validation MUST be selected through the unified Gate registry rather than by adding per-test, per-change, or forwarding scripts to the root manifest.

#### Scenario: An aggregate command covers the root application and members

- **WHEN** a developer runs any standard lifecycle command from the repository root
- **THEN** the corresponding validation runs for the root application and every workspace member
- **THEN** members execute in a valid workspace dependency order

#### Scenario: A member lacks a lifecycle script

- **WHEN** an actual workspace member omits any required `build`, `typecheck`, `test`, or `check` script
- **THEN** workspace validation returns a non-zero status
- **THEN** the diagnostics identify the member and missing script

#### Scenario: Member validation fails

- **WHEN** the root application or any workspace member's lifecycle script fails
- **THEN** the corresponding standard root command returns a non-zero status
- **THEN** CI does not report partial validation as a complete success

#### Scenario: Validate the root application when no leaf members exist

- **WHEN** none of the three member areas contains an actual package
- **THEN** standard root commands still execute and validate the root application
- **THEN** aggregation does not recursively invoke the root command itself

#### Scenario: Focused validation does not expand the root script surface

- **WHEN** a workspace or plugin capability requires validation beyond the four package-local lifecycle scripts
- **THEN** the root invokes that validation through a stable Gate registry identifier
- **THEN** no root script is added solely for a test subset, OpenSpec Change, or forwarding alias
