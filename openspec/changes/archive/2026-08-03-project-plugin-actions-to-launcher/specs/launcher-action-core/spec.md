## MODIFIED Requirements

### Requirement: The Host registry must register atomically and provide deterministic immutable snapshots

One trusted Host application service MUST own the running launcher action
registry. The registry MUST support single and batch registration, lookup by
`action_id`, descriptor snapshots sorted in ascending `action_id` order, and
trusted provider-scoped replacement or unregistration of one owner's complete
Action batch. Batch registration and provider replacement MUST be atomic. If
any descriptor is invalid, duplicates an existing Action owned by another
provider, duplicates another Action in the batch, or does not belong to the
declared provider owner, the registry MUST reject the entire batch. A failed
provider replacement MUST preserve the complete pre-call Registry state. A
successful provider replacement MUST remove the provider's previous batch and
commit the new complete batch in one transition; an empty provider batch MUST
unregister only that provider's Actions. Public descriptors and snapshots MUST
be isolated from caller input and MUST NOT expose or allow mutation of internal
executors or provider bookkeeping.

#### Scenario: Register a valid action batch

- **WHEN** the Host registers a batch of valid actions with unique IDs
- **THEN** the registry stores every action atomically
- **THEN** ID lookup returns the corresponding descriptor
- **THEN** the snapshot is sorted in ascending `action_id` order

#### Scenario: A batch contains an invalid action

- **WHEN** a registration batch contains at least one invalid descriptor
- **THEN** the registry rejects the entire batch
- **THEN** the registry stores none of the actions from that batch

#### Scenario: Register a duplicate action ID

- **WHEN** a new action ID duplicates an existing action or another action in
  the same batch
- **THEN** the registry rejects the registration or entire batch
- **THEN** the registry remains in its pre-registration state
- **THEN** the diagnostic identifies the duplicate `action_id`

#### Scenario: A caller attempts to modify a descriptor

- **WHEN** a caller modifies original input, a lookup result, or a snapshot
  after registration
- **THEN** the registry's internal descriptor remains unchanged
- **THEN** later lookups and snapshots expose neither executors nor mutable
  internal references

#### Scenario: Look up an unknown action

- **WHEN** a caller looks up an unregistered `action_id`
- **THEN** the registry returns no value
- **THEN** the registry state remains unchanged

#### Scenario: Replace one provider's complete Action batch

- **WHEN** a trusted provider submits a valid complete batch whose descriptors
  all belong to that provider owner
- **THEN** the Registry atomically removes that provider's previous Actions and
  commits the new batch
- **THEN** no snapshot exposes a partial mixture of the provider's old and new
  batches
- **THEN** Actions owned by other providers remain unchanged

#### Scenario: Provider replacement contains invalid or cross-owner input

- **WHEN** a provider replacement contains an invalid descriptor, duplicate ID,
  ID owned by another provider, or descriptor whose `owner_id` differs from the
  declared provider owner
- **THEN** the Registry rejects the entire replacement with deterministic
  diagnostics
- **THEN** the complete pre-call Registry state remains unchanged

#### Scenario: Unregister one provider

- **WHEN** a trusted provider replaces its complete batch with an empty batch
- **THEN** the Registry removes every Action owned by that provider
- **THEN** the Registry preserves every Action and executor owned by another
  provider
