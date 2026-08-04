# Plugin Upgrade and Rollback

## Purpose

Define safe Host-private replacement of one installed local plugin package with
another compatible package of the same identity while preserving a single
active registration, recovering from pre-commit failures, and retaining no
user-selectable rollback history.

## Requirements

### Requirement: Plugin replacement MUST use a private two-stage Host contract

The system MUST provide an independently versioned Host-private Plugin
Replacement Contract and expose prepare, commit, and cancel only to the trusted
lensX root application through strict Tauri commands. The contract MUST remain
independent from the initial-installation, Registration read, lifecycle,
Manifest, package, and Manager Store versions. Rust and TypeScript MUST fully
validate requests, results, and errors from `unknown`. The contract MUST NOT
become a Manifest, public plugin package, iframe Runtime, or SDK capability.

#### Scenario: Trusted application prepares and commits a replacement

- **WHEN** the root application prepares a local `.lxp` for a current healthy `entry_id` and `expected_revision`, then commits with the opaque token returned by the Host
- **THEN** the Host completes inspection, surface coordination, and a revision-bound commit through the independent replacement contract
- **THEN** plugin code and public packages cannot import or invoke this write boundary

#### Scenario: Replacement payload contains private or unknown fields

- **WHEN** a request, result, or error lacks the contract version or contains unknown fields, an invalid type, a path, digest, Store key, package bytes, function, or Host object
- **THEN** the corresponding boundary rejects the complete payload and returns a stable safe error
- **THEN** the Manager, Registry, filesystem, revision, and changed event remain unchanged

### Requirement: Preparation MUST inspect one immutable local package without changing active state

Prepare MUST read one local `.lxp` through a Rust-owned pathless file picker,
and picker cancellation MUST return the ordinary `cancelled` result. The Host
MUST reuse the existing capped source read, package inspection, Manifest,
resource, checksum, complete package SHA-256, and current Host compatibility
checks. Only a `compatible` candidate may enter installer-owned staging.
Prepare MUST confirm that the candidate `plugin_id` matches the target healthy
registration and MUST NOT modify the Manager, active payload, grants, Registry,
revision, event, or plugin data.

#### Scenario: User cancels local package selection

- **WHEN** the user cancels the native single-file picker during prepare
- **THEN** the Host returns `cancelled` rather than an error
- **THEN** no commit token, staging, Manager mutation, revision, or event is created

#### Scenario: Candidate package is invalid, incompatible, or belongs to another plugin

- **WHEN** the candidate package is invalid, incompatible with the current lensX or Host API version, or its normalized `plugin_id` differs from the target registration
- **THEN** prepare returns a stable invalid, incompatible, or identity-mismatch conclusion
- **THEN** the current record, payload, surfaces, grants, and data remain unchanged and no token is published

#### Scenario: Compatible candidate is prepared

- **WHEN** the candidate is valid and compatible, its identity matches, and the current entry and revision can be verified
- **THEN** the Host extracts and verifies the candidate in bounded staging and returns an opaque token, entry ID, current and candidate versions, replacement classification, and permission diff
- **THEN** the response contains no source path, staging or installation path, package digest, package bytes, or raw system error

### Requirement: Version ordering MUST classify but not forbid explicit local replacement

The system MUST classify the operation from the current and candidate package
identities. The same complete package digest MUST be `duplicate`; a higher
candidate SemVer MUST be `upgrade`; a lower candidate SemVer MUST be
`downgrade`; and the same SemVer with a different digest MUST be `reinstall`.
A valid, compatible, same-plugin local package explicitly selected by the user
MUST be allowed to proceed to commit as an upgrade, downgrade, or reinstall.
Version ordering MUST NOT be a rejection condition. Conflicting identity or
storage evidence MUST NOT be represented as a reinstall.

#### Scenario: Exact package is selected again

- **WHEN** the current and candidate packages have the same `plugin_id`, version, and complete package digest
- **THEN** prepare returns `duplicate` and creates no commit token
- **THEN** the Manager record, revision, event, surfaces, and filesystem remain unchanged

#### Scenario: Lower compatible version is selected explicitly

- **WHEN** the user selects a local package with the same plugin ID, a lower SemVer, and compatibility with the current Host
- **THEN** prepare classifies it as `downgrade` and allows it into the same commit flow
- **THEN** the Host does not mistake the explicit local choice for a prohibited silent automatic downgrade

#### Scenario: Same version has different complete bytes

- **WHEN** the current and candidate packages have the same plugin ID and SemVer but different complete package digests
- **THEN** prepare classifies the operation as `reinstall` and continues all checks
- **THEN** the Host neither overwrites the current payload in place nor skips permission, identity, or compatibility checks

#### Scenario: Package identity evidence conflicts

- **WHEN** the record key, Manifest plugin ID, canonical installation path, recorded digest, or candidate facts conflict
- **THEN** the Host returns a stable identity or unsafe-state error and preserves the anomalous evidence
- **THEN** the conflict cannot be committed as an upgrade, downgrade, reinstall, or quarantine repair

### Requirement: Preparation tokens MUST be bounded, opaque, and revision-bound

Each Host process MUST hold at most one valid preparation. The Host MUST
generate the token and bind it only to the target entry, expected revision,
candidate staging, and inspected facts in the current process. The token MUST
NOT survive a restart. A new preparation, explicit cancel, failed commit, or
service destruction MUST make a best effort to clean the previous preparation.
Startup recovery MUST remove valid staging abandoned by a crash. Commit MUST
revalidate the token, current revision, identity, staging type, and content
while holding the shared lock and MUST NOT rely on a stale conclusion obtained
outside that lock.

#### Scenario: Another preparation already exists

- **WHEN** the process has an uncancelled preparation and the caller starts another prepare
- **THEN** the Host returns stable `busy` until the caller explicitly cancels the current preparation
- **THEN** two candidates cannot be committed concurrently, overwrite each other's staging, or cause unbounded disk retention

#### Scenario: Revision changes after preparation

- **WHEN** another lifecycle or replacement operation changes the Registration revision after prepare
- **THEN** commit rejects the stale token, cleans its staging, and requires the caller to restart from the complete latest snapshot
- **THEN** the old preparation cannot overwrite concurrently committed enabled intent, grants, Manifest, payload, or diagnostics

#### Scenario: Process exits before commit

- **WHEN** the Host exits or crashes after successful prepare and before commit
- **THEN** the token is invalid in the new process and startup recovery removes conforming abandoned staging
- **THEN** the old active record and payload continue to recover without a fabricated revision or partial replacement

### Requirement: Commit MUST atomically replace the single active registration

Commit MUST share the same in-process and cross-process serialization boundary
as installation, enable, disable, uninstall, and recovery. The Host MUST first
revalidate the preparation, atomically move the candidate from staging to a
new canonical digest sibling under the same plugin key and flush it, then
atomically replace the complete Manager record for the same `plugin_id`, entry,
and expected revision. The Manifest, installation path, and package digest in
the Manager record MUST remain the only active pointer. The Host MUST NOT add a
second active pointer, publish a staging path, or publish multiple healthy
versions simultaneously.

#### Scenario: Replacement commits successfully

- **WHEN** candidate commit, Manager record persistence, and in-memory publication all succeed
- **THEN** snapshot and detail return only the candidate Manifest and Host facts at one new revision, and the installation path refers only to the committed candidate payload
- **THEN** the Host sends the existing Registration changed invalidation event so consumers can perform a complete refresh without a restart

#### Scenario: Candidate commit fails before Manager replacement

- **WHEN** staging revalidation, rename, flush, or Manager record creation, writing, flushing, or atomic replacement fails
- **THEN** the Host publishes no new record, revision, or event and removes the candidate or leaves it as a provable orphan
- **THEN** the old record, active payload, grants, enabled intent, diagnostics, and plugin data remain unchanged

#### Scenario: Another process holds the commit boundary

- **WHEN** installation, lifecycle, recovery, or replacement already holds the shared commit lock
- **THEN** concurrent commit waits in the defined serial order or returns stable `busy`
- **THEN** it does not clean, replace, or register another operation's staging, payload, data, or Manager state

### Requirement: Replacement MUST preserve and safely narrow Host-owned state

The next registration MUST inherit the current healthy record's Host source,
enabled intent, and bounded diagnostics, preserve the independent
`data/<plugin-key>` subtree unchanged, and publish Runtime as `inactive`.
Compatibility MUST be recomputed from the candidate Manifest and current lensX
and Host API versions. The next grants MUST equal exactly the intersection of
the old granted permission IDs and the candidate requested permission IDs. New
permission requests MUST NOT gain grants automatically, and removed requests
MUST NOT retain grants. Publisher text, version direction, local source, and
claims of official status MUST NOT alter these rules.

#### Scenario: Candidate adds and removes permission requests

- **WHEN** the candidate Manifest adds a new permission request, retains one granted request, and removes another granted request
- **THEN** prepare reports a deterministic added and removed permission diff, and the next registration retains only the old grant that is still requested
- **THEN** the new request remains ungranted, the removed request loses its grant, and replacement performs no authorization interaction

#### Scenario: Enabled plugin is replaced by a compatible candidate

- **WHEN** the current healthy registration has enabled intent set to true and replacement succeeds
- **THEN** the next registration preserves enabled intent, source, and the data boundary, recomputes compatibility, and publishes Runtime as `inactive`
- **THEN** version direction and Publisher text create no additional trust, provenance, or permission

#### Scenario: Disabled plugin is replaced

- **WHEN** the current healthy registration has enabled intent set to false and replacement succeeds
- **THEN** the next registration remains disabled and projects no Action or Page
- **THEN** replacement does not interpret local package selection as an enable operation

### Requirement: Trusted application MUST quiesce and converge plugin surfaces around commit

For a prepared replacement, the trusted TypeScript service MUST validate the
target entry and revision against the current snapshot before invoking Rust
commit. It MUST withdraw the provider through the existing Surface Projection
in Action-then-Page order, and Page withdrawal MUST close an active plugin
page. A quiescence failure MUST prevent commit. After a commit failure, the
service MUST fully restore the original revision in Page-then-Action order.
After a successful commit, it MUST actively refresh and await Page-then-Action
projection at the committed revision.

#### Scenario: Enabled plugin replacement succeeds

- **WHEN** the current plugin has projected Actions and Pages and quiescence, Rust commit, and new-revision projection all succeed
- **THEN** the old Actions and Pages are withdrawn before durable replacement, and an active Page returns to a safe Host page
- **THEN** the new Manifest's Page batch is published before its Action batch and old descriptors can no longer be dispatched

#### Scenario: Surface quiescence fails

- **WHEN** an Action or Page provider batch cannot be withdrawn completely
- **THEN** the service cancels the preparation, restores the original revision projection, and does not invoke Rust commit
- **THEN** the Manager, active payload, revision, and event remain unchanged

#### Scenario: Rust commit fails after quiescence

- **WHEN** the surfaces have been withdrawn but the candidate or Manager commit fails
- **THEN** the old durable registration remains active and the service restores Page-then-Action projection at the original revision
- **THEN** the failure result does not claim that the new version was installed

#### Scenario: Projection fails after durable commit

- **WHEN** Manager replacement succeeds but refresh, detail mapping, or Registry replacement fails
- **THEN** the new registration remains durably active and the service returns a safe convergence diagnostic containing the committed revision while surfaces fail closed
- **THEN** a complete refresh, listener recovery, or Launcher activation can converge, and the Host does not revert to the removed old version because of a frontend failure

### Requirement: Successful replacement MUST remove the old payload without retaining rollback history

After Manager replacement succeeds, the Host MUST attempt to delete the old
canonical payload and MUST NOT create a previous pointer, rollback catalog,
version history, or multiple-active-version state. An immediate deletion
failure MUST return committed success with `cleanup_pending` rather than report
the durable replacement as failed. Later trusted installer operations and
startup recovery MUST delete only canonical non-active siblings proven to be
owned by neither the current healthy record nor a quarantine identity.
Anomalous or unsafe evidence MUST be preserved and MUST cause related writes to
fail closed.

#### Scenario: Old payload cleanup succeeds

- **WHEN** the Manager record points to the candidate payload and the old canonical payload can be deleted safely
- **THEN** replacement returns committed success with complete cleanup
- **THEN** the plugin key retains no old payload for user-initiated rollback or version selection

#### Scenario: Old payload cleanup is interrupted

- **WHEN** Manager replacement succeeds but the process exits before deleting the old payload or deletion temporarily fails
- **THEN** the new record and payload remain active and the result or recovery diagnostic reports pending cleanup
- **THEN** the next safe recovery deletes the old canonical sibling that is not referenced by the active record without touching the current payload or plugin data

#### Scenario: Cleanup evidence is unsafe

- **WHEN** a non-active entry is a symlink, has an anomalous name, escapes the root, or conflicts with healthy or quarantine ownership facts
- **THEN** the Host neither follows nor deletes it and does not guess its ownership, and records a bounded safe diagnostic
- **THEN** replacement, installation, or lifecycle writes that might overwrite the evidence fail closed

### Requirement: Task 3.4 MUST not deliver later update, trust, Runtime, permission UI, or rollback capabilities

This capability MUST deliver only local package prepare, commit, and cancel;
arbitrary-version classification; single-active-record replacement; pre-commit
failure recovery; Host fact inheritance; surface convergence; and cleanup of
the old payload after success. It MUST NOT download remote packages,
automatically check for updates, provide user-initiated rollback or version
history, execute candidate code, roll back based on Runtime health, migrate
plugin data, grant new permissions, display complete management or
authorization UI, verify real signatures, or repair quarantine. The current
unsigned local policy MUST continue to treat source, Publisher text, package
digest, and permission requests as independent facts.

#### Scenario: Local replacement completes before later milestones

- **WHEN** this change completes before Runtime, Permission Management, management UI, and signing changes
- **THEN** trusted Host infrastructure can safely replace a local compatible package with the same identity without a failure damaging the old active version
- **THEN** plugin code still does not execute, new permissions remain ungranted, and remote updates, signature trust, and user-initiated rollback remain unavailable

#### Scenario: Publisher claims a trusted or official source

- **WHEN** candidate Manifest Publisher text claims an official or verified identity
- **THEN** replacement retains the current Host-owned local external source policy and applies the same package, identity, permission, and cleanup checks
- **THEN** the claim creates no signature status, trusted provenance, grant, or lifecycle exception
