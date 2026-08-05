## MODIFIED Requirements

### Requirement: Session lifecycle MUST distinguish loaded, Session ready, SDK ready, disconnect, and disposal

Iframe `loaded` MUST continue to mean only browser load completion and MUST NOT
mean that the Session or SDK is ready. A Host-private Session MUST use at least
`awaiting_handshake`, `ready`, `disconnected`, and `disposed`: only the first
valid acknowledgement can transition `awaiting_handshake` to `ready`; an
invalid acknowledgement, `messageerror`, Host reload, handshake deadline,
unexpected Port failure, or loss of trusted identity MUST terminate the current
Session; and disposal MUST be idempotent and clean up the Session's nonce,
Ports, message handlers, subscribers, deadline and window/Port leases.
`disconnected` and `disposed` MUST be terminal, and the system MUST NOT
automatically reauthenticate or reuse an old Port. A 5,000 millisecond
handshake deadline MUST start only after the bootstrap is successfully posted,
and a matching first acknowledgement or terminal cleanup MUST clear only that
Session's deadline. The Session MUST participate in the owning Runtime
attempt's unified terminal cleanup, and every late acknowledgement, timer or
Port event MUST compare the owning attempt before publishing state.

#### Scenario: Iframe loaded without a valid acknowledgement

- **WHEN** the iframe has fired its load event but has not passed this attempt's
  nonce and Port acknowledgement
- **THEN** the existing container still reports only `loaded`, and the Session
  remains `awaiting_handshake` until acknowledgement, failure or its 5 second
  deadline
- **THEN** UI, logs, state, and documentation do not call it Session ready, SDK
  ready, or Host API available

#### Scenario: Session authentication completes before deadline

- **WHEN** an awaiting Session receives its only valid acknowledgement before
  the 5,000 millisecond deadline
- **THEN** the Session clears its deadline and enters `ready` without creating
  an SDK Runtime context, RPC method, or Host API capability
- **THEN** that cleared timer cannot later disconnect or fail the Session

#### Scenario: Session handshake expires

- **WHEN** the current Session does not receive its exact acknowledgement within
  5,000 milliseconds after bootstrap
- **THEN** it reports bounded `runtime_handshake_timeout`, closes both
  controllable Ports, clears nonce/listeners/deadline, and requests the owning
  Runtime's terminal cleanup
- **THEN** a late or replayed acknowledgement cannot enter `ready`, publish a
  lease, or affect a later Runtime attempt

#### Scenario: Host reload or Port error

- **WHEN** the Host JavaScript realm reloads, the Port emits `messageerror`, an
  unexpected ready Port disconnects, or the current Session can no longer prove
  its identity
- **THEN** the old Session reaches terminal disconnect or disposal and the
  owning Runtime terminates without automatically reconnecting
- **THEN** a new realm cannot restore the old nonce, Port, deadline or listener,
  and a new document must establish a new Session from current facts

#### Scenario: Repeated cleanup or late event

- **WHEN** close, retry, invalidation, timeout, Host teardown and App teardown
  race to dispose, then an old acknowledgement, timer or Port event arrives
- **THEN** resources are safely cleaned up once and the Session remains
  terminal
- **THEN** the late event changes no current iframe, Session, Runtime attempt or
  Registration state
