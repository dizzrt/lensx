# Launcher Action Search Specification

## Purpose

Define the accepted deterministic search over Host-owned launcher Action
Registry snapshots, result ranking and isolation, accessible App Shell
interaction, and Dispatcher-based execution behavior.

## Requirements

### Requirement: Action Search must consume Host Registry snapshots uniformly

The system MUST provide a framework-neutral Launcher Action Search that accepts
a query string, application locale, positive integer result limit, and read-only
descriptor snapshot from `LauncherActionRegistry`, and returns deterministically
sorted serializable Action results. Search MUST depend only on a valid Action
Descriptor's `action_id`, `owner_id`, localized `title`, optional
`description`, `default_keywords`, and Host-owned `enabled` state. It MUST NOT
use different search paths for built-in, plugin, or other provider sources.
Optional icon metadata and recent or pinned state MAY be carried with safe
display results, but MUST NOT affect matching, scoring, or ordering.
Each result MUST retain the `action_id`, `owner_id`, resolved localized display
text, deterministic relevance score, and optional safe icon metadata. A result
MUST NOT contain an executor, function, Registry internal state, React state,
Tauri object, or Rust object.

#### Scenario: Search a built-in Action

- **WHEN** a Registry snapshot contains a valid and enabled Host built-in Action
  whose searchable metadata matches the query
- **THEN** search returns a serializable result for that Action
- **THEN** the result may contain the descriptor's safe icon metadata
- **THEN** the result does not contain the Action executor

#### Scenario: Search an Action registered by another future source

- **WHEN** any provider registers a valid Action in the same Host Registry
  before search runs
- **THEN** search processes that Action with the same matching and ranking rules
  used for a built-in Action
- **THEN** search does not read provider-private data or branch on the source
  type

#### Scenario: Recent or pinned state changes

- **WHEN** recent or pinned state changes for a matching Action while the query
  and Registry snapshot remain the same
- **THEN** search returns the same matching set, scores, and order
- **THEN** collection state neither raises nor lowers search relevance

#### Scenario: A caller modifies search input or results

- **WHEN** a caller modifies the original query, original snapshot, or returned
  result after a search
- **THEN** the search process does not modify the Registry snapshot or
  descriptor
- **THEN** later Registry lookups, snapshots, and search results remain
  unaffected by that modification

### Requirement: Queries must be normalized and tokenized deterministically

Search MUST apply Unicode NFKC normalization to the query, perform case folding
with the current application locale, trim leading and trailing whitespace, and
collapse consecutive Unicode whitespace to one ASCII space. The normalized
query MUST be split on Unicode whitespace into non-empty tokens. An empty or
whitespace-only query MUST return no results and MUST NOT treat Registry default
order as recommendation order. The independent `home` presentation state MAY
display accepted Launcher Action collections for an empty query. Search itself
MUST NOT generate, order, or populate recent or pinned content.

#### Scenario: Normalize case and whitespace

- **WHEN** a user enters a query with different case, full-width compatibility
  characters, or repeated whitespace
- **THEN** search produces the same normalized query and tokens for equivalent
  input under the current locale before matching
- **THEN** equivalent input produces the same result order

#### Scenario: The query is empty

- **WHEN** the input is empty or contains no token after normalization
- **THEN** search returns no results
- **THEN** search does not treat the Registry's default order as a
  recommendation order
- **THEN** the App Shell may independently display home content from Launcher
  Action collections

### Requirement: Matching and ranking must be explainable and deterministic

Search MUST resolve Action titles, descriptions, and keywords for the current
locale while preserving the Action metadata `en-US` fallback. Every query token
MUST match the title, at least one keyword, or the description; otherwise the
Action MUST be excluded. Supported relationships in v0 MUST be limited to
exact, prefix, and substring matching. Search MUST NOT perform edit-distance,
semantic, or personalized matching in v0. Relevance MUST first consider exact
and prefix matches between the complete query and the title, then add the best
match for each token. The single-token priority MUST be title exact, keyword
exact, title prefix, keyword prefix, title substring, keyword substring, and
description substring. Results with equal scores MUST be sorted by ascending
`action_id`.

#### Scenario: A title match outranks a description match

- **WHEN** one Action title exactly matches the query and another Action only
  contains the query in its description
- **THEN** the exact title match appears before the description match

#### Scenario: Multiple tokens match across fields

- **WHEN** a query contains multiple tokens and an Action title matches some
  tokens while its keywords match the remaining tokens
- **THEN** the Action satisfies the all-token rule and enters the result set
- **THEN** only the best field match for each token contributes to its score

#### Scenario: Only some tokens match

- **WHEN** an Action matches only part of a multi-token query
- **THEN** search excludes that Action

#### Scenario: Two Actions have the same score

- **WHEN** two Actions produce the same relevance score for a query
- **THEN** search returns them in ascending `action_id` order
- **THEN** provider registration order does not change the result order

#### Scenario: Text for the current locale is absent

- **WHEN** the current application locale is `zh-CN` and an Action omits its
  optional Simplified Chinese title, description, or keywords
- **THEN** search uses the allowed `en-US` fallback for that field
- **THEN** the fallback text follows the same matching and ranking rules

### Requirement: Search must filter unavailable Actions and limit result count

Search MUST exclude Actions with `enabled = false`. The result limit MUST be a
positive integer, and search MUST return only the first N results after sorting.
The App Shell MUST use 8 as the v0 result limit. When nothing matches, search
MUST return an empty collection instead of simulated, disabled, or unregistered
Actions.

#### Scenario: A matching Action is disabled

- **WHEN** an Action's metadata matches the query but its descriptor has
  `enabled = false`
- **THEN** search does not return that Action

#### Scenario: Matches exceed the result limit

- **WHEN** the number of matching enabled Actions exceeds the result limit
- **THEN** search completes deterministic sorting first
- **THEN** search returns only the first N sorted results

#### Scenario: Nothing matches

- **WHEN** a non-empty query matches no enabled Action
- **THEN** search returns an empty collection
- **THEN** the system does not create simulated Actions to fill the result set

### Requirement: The App Shell must present real Action Search state

The React App Shell MUST connect its controlled launcher input to the default
Host Action Service and run unified search for the committed query against the
current Registry snapshot. Ordinary text edits MUST update the committed query
immediately. Draft text during IME composition MUST be used only for input
display and MUST NOT replace the committed query or change the search results,
selection, or window presentation determined by that query.

For an empty committed query, the App Shell MUST display neither a search-result
collection nor a search empty state and MUST return to the independent home
presentation. For a non-empty committed query with matches, it MUST display a
fixed four-column grid of at most eight real Action tiles in one localized
Search Results section. It MUST NOT display an additional Matches,
Recommendations, Marketplace, or source section. For a non-empty committed query
without matches, it MUST display a localized empty state.

Results MUST show the resolved Action title and a valid icon or stable fallback
icon and MAY show the description, but MUST NOT expose the owner, internal score,
or executor as ordinary product copy. The interface MUST NOT automatically
change the native launcher window height based on result count.

#### Scenario: A query matches the built-in Action

- **WHEN** a user commits a non-empty query matching the title or keyword of
  `lensx.core.hide_launcher`
- **THEN** the App Shell displays that real localized Action result in the
  Search Results grid
- **THEN** the tile displays a valid Action icon or the stable generic fallback
  icon
- **THEN** the page does not display a simulated Action, plugin entry point, or
  second result section

#### Scenario: Clear the query

- **WHEN** a user removes all query content outside composition
- **THEN** the App Shell removes the result grid, selection, and search empty
  state
- **THEN** the input remains editable and focusable
- **THEN** the App Shell displays the independent home Action collections

#### Scenario: A non-empty query has no results

- **WHEN** a user commits a non-empty query that matches no available Action
- **THEN** the App Shell displays the localized no-results state in the Search
  Results section
- **THEN** the page does not display an unavailable or fabricated Action

#### Scenario: Results reach the visible limit

- **WHEN** search returns eight Action results
- **THEN** the App Shell displays all eight items in a fixed four-column grid of
  at most two rows
- **THEN** the system does not change the native window height because of the
  result count

#### Scenario: Ordinary result status changes

- **WHEN** result count, selection, or execution-pending state changes for the
  committed query
- **THEN** the App Shell provides necessary status through an appropriate live
  region
- **THEN** ordinary count or success messages do not form another visible
  section outside Search Results

#### Scenario: Begin composition from home

- **WHEN** the committed query is empty and a user enters the first pinyin
  letter through an IME and continues composing
- **THEN** the input displays an editable draft and retains the input target
- **THEN** the committed query, home content, and home window presentation
  remain unchanged
- **THEN** the draft produces no search results, no-results feedback, or search
  size request

#### Scenario: Compose while existing results are visible

- **WHEN** the committed query has results and a user begins new composition
- **THEN** the draft remains visible and editable
- **THEN** the system preserves the existing results, selection, and search
  presentation while the query and Registry have not changed independently
- **THEN** the system does not announce the unconfirmed draft as a new query

### Requirement: Users must be able to select and execute results with keyboard or pointer

When the result set is non-empty, the App Shell MUST select the first result by
default. When the committed query or result set changes, selection MUST reset to
the new first result. When no result exists, selection MUST be cleared. The
input MUST retain focus during navigation.

The launcher MUST give priority to IME composition and candidate operations.
While a composition session is active, or the input system marks the current
key as a composition or confirmation key, the launcher MUST NOT execute an
Action, clear the query, change result selection, or prevent default IME
handling in response to Enter, Escape, or arrow keys. This rule MUST cover a
composition-end event arriving before the marked confirmation key.

Outside IME handling, `ArrowLeft` and `ArrowRight` MUST move between adjacent
results without wrapping. `ArrowUp` and `ArrowDown` MUST move by the fixed
four-column offset and MUST preserve the current selection when the target
does not exist. `Enter` MUST pass the selected `action_id` to the existing Host
Dispatcher. Pointer activation MUST use the same dispatch path. `Escape` MUST
clear the query, results, and selection and restore input focus. While one
dispatch is pending, the same interaction MUST NOT start a duplicate execution.

#### Scenario: Select results horizontally

- **WHEN** the input retains focus, a result row contains multiple Actions, and
  there is no IME composition or confirmation key
- **THEN** `ArrowRight` selects the next result and stops at the last result
- **THEN** `ArrowLeft` selects the previous result and stops at the first result

#### Scenario: Select results vertically

- **WHEN** the input retains focus, the four-column grid has multiple rows, and
  there is no IME composition or confirmation key
- **THEN** `ArrowDown` selects the result at the current index plus four when it
  exists
- **THEN** `ArrowUp` selects the result at the current index minus four when it
  exists
- **THEN** selection remains unchanged when the target result does not exist

#### Scenario: Execute the selected Action with Enter

- **WHEN** a result is selected and a user independently presses `Enter`
  outside IME composition and confirmation
- **THEN** the App Shell passes that result's `action_id` to the Host Dispatcher
- **THEN** neither the search layer nor React component reads or invokes the
  executor directly

#### Scenario: Execute a result with a pointer

- **WHEN** a user activates a search result with a pointer
- **THEN** the system executes the Action through the same Dispatcher path used
  for keyboard execution

#### Scenario: Trigger an Action again while it is executing

- **WHEN** dispatch for the selected Action is pending and a user presses
  `Enter` again or activates the same result
- **THEN** the App Shell does not start a second concurrent dispatch

#### Scenario: Clear the current search

- **WHEN** results are visible and a user presses `Escape` outside IME
  composition and confirmation
- **THEN** the App Shell clears the query, results, and selection
- **THEN** the launcher input regains focus

#### Scenario: Confirm a candidate with Enter

- **WHEN** an IME is composing text and a user confirms a candidate with
  `Enter`
- **THEN** the launcher neither executes the current Action nor prevents IME
  confirmation
- **THEN** that key is not reinterpreted as Action execution after composition
  ends
- **THEN** a subsequent independent ordinary `Enter` restores the existing
  execution behavior

#### Scenario: Cancel a candidate with Escape

- **WHEN** an IME is composing text and a user presses `Escape` to cancel a
  candidate or composition
- **THEN** the launcher does not proactively clear the committed query, results,
  or selection
- **THEN** the IME retains its default cancellation handling, and the final
  input value is reconciled under the composition-end contract

#### Scenario: Navigate candidates with arrow keys

- **WHEN** arrow keys in an IME composition session edit the draft or select a
  candidate
- **THEN** the launcher neither moves Action selection nor prevents the default
  IME operation

#### Scenario: A confirmation key arrives after composition end

- **WHEN** the composition-end event has arrived but the input system still
  marks the following key as an IME confirmation key
- **THEN** the launcher continues to preserve IME handling for that key
- **THEN** the key does not execute an Action, clear the query, or move result
  selection

### Requirement: Execution outcomes and failures must recover safely

After a successful dispatch, the App Shell MUST clear the current query,
results, and selection. The Action's Host executor decides whether to hide the
window or perform another controlled behavior. An `action_not_found`,
`action_unavailable`, or `action_execution_failed` result MUST display
localized, diagnosable feedback without leaking internal exceptions and MUST
preserve the current query and recoverable selection. Asynchronous search or
dispatch failure MUST NOT prevent later launcher input use.

#### Scenario: Execute Hide Launcher successfully

- **WHEN** a user executes `lensx.core.hide_launcher` and the Dispatcher returns
  success
- **THEN** the App Shell clears the search state
- **THEN** the Host-owned executor hides the launcher through the existing
  controlled path

#### Scenario: An Action becomes unavailable after search

- **WHEN** a displayed Action disappears or becomes unavailable before
  execution
- **THEN** the Dispatcher returns the corresponding typed failure
- **THEN** the App Shell displays a localized error and preserves the query so
  the user can recover

#### Scenario: Executor execution fails

- **WHEN** the Dispatcher returns `action_execution_failed`
- **THEN** the App Shell displays safe localized error feedback
- **THEN** the product interface does not display an exception stack, native
  object, or executor detail

### Requirement: Search interaction must be accessible, localized, and theme-aware

The launcher input and result collection MUST follow accessible combobox and
listbox interaction semantics. The input MUST expose expanded state, the result
container relationship, and the current active descendant. Every result MUST
have a stable option identity, selected state, and visible highlight. The CSS
four-column layout MUST NOT change listbox and option semantics. Result count,
no-results, executing, success, and failure states MUST be provided through an
appropriate live region and MUST NOT rely on color alone.

All user-visible copy MUST use application i18n, default to `en-US`, and provide
a semantically aligned `zh-CN` resource. Search Results MUST be the only visible
result-section title. Results, icon fallback, selection, hover, pending, focus,
and feedback MUST use Semi Design-supported light and dark theme tokens. Simple
grid and spacing MUST use UnoCSS, while complex selection, scrolling, theme,
and interaction states MUST use Less. The result container and individual
results MUST NOT depend on prominent borders or per-item dividers for hierarchy.

#### Scenario: A screen reader navigates results

- **WHEN** a non-empty query produces Action results
- **THEN** the input exposes the listbox relationship and currently selected
  option
- **THEN** a screen reader can determine the result count and selection
- **THEN** the four-column visual layout introduces no incorrect additional
  interaction roles

#### Scenario: Use Simplified Chinese

- **WHEN** the application locale is `zh-CN`
- **THEN** Search Results, input assistance, no-results, and execution feedback
  use Simplified Chinese
- **THEN** Action display text follows the existing `zh-CN` to `en-US` fallback

#### Scenario: Switch the theme

- **WHEN** the application switches between light and dark themes while results
  are visible
- **THEN** result tiles, icon fallback, selection, focus, and feedback use the
  corresponding Semi Design theme tokens
- **THEN** text, selection, and focus remain distinguishable

#### Scenario: Complete search with the keyboard only

- **WHEN** a user enters a query, navigates in two dimensions, and executes the
  Action without using a pointer
- **THEN** every operation can be completed through launcher-input keyboard
  interaction
- **THEN** focus is not captured by the non-interactive avatar or All
  placeholder

### Requirement: Launcher search MUST commit composition results without duplicate or stale transitions

At composition end, the launcher MUST update the committed query from the final
complete input value supplied by the input system and MUST NOT infer the final
query from a pinyin draft or displayed candidate text. One end notification and
its immediately following equivalent input notification MUST produce only one
semantic query update and at most one necessary presentation-target transition.
When cancellation discards the draft and returns the final value to the prior
query, the prior query MUST be preserved. Committing an empty value MUST return
to home.

An explicit Host query clear, reset after successful execution, navigation away
from the page containing the search input, or unmount MUST invalidate the old
composition session. Late events from an invalidated session MUST NOT restore
the old query, search results, or window presentation. Subsequent new input MUST
be able to begin normally.

This interaction MUST preserve the same input semantics under the `en-US` and
`zh-CN` application locales and light and dark themes. Committed results,
no-results feedback, and error feedback MUST follow the existing localization,
combobox/listbox, live-region, and failure-recovery contracts. Drafts MUST NOT
introduce an additional result section or falsely announce final query state.

#### Scenario: Commit selected Chinese text once

- **WHEN** a user begins composition from home, confirms Chinese text, and then
  receives an input notification with the same value
- **THEN** the complete Chinese value becomes the committed query and is
  searched using the existing algorithm
- **THEN** the system performs at most one necessary home-to-search
  presentation transition
- **THEN** the input continues to accept subsequent input without automatically
  executing an Action

#### Scenario: Cancel composition back to the prior query

- **WHEN** a user cancels and discards the composition draft and the input
  system's final complete value equals the prior committed query
- **THEN** the prior query, results, and selection remain unchanged
- **THEN** the discarded pinyin draft does not request a new window presentation

#### Scenario: End composition with empty or unmatched text

- **WHEN** composition ends with an empty value or a non-empty value matching
  no Action
- **THEN** the empty value follows the existing home behavior, and the
  non-empty unmatched value follows the localized no-results behavior
- **THEN** the input remains editable without automatically executing an Action

#### Scenario: A stale composition ends after Host reset

- **WHEN** the Host has reset the query or left the page containing the input
  and the old composition session subsequently delivers an end notification
- **THEN** the old query, results, and search presentation are not restored
- **THEN** the old event does not affect the current page or new input session

#### Scenario: Continue ordinary text input

- **WHEN** a user types, pastes, or deletes text directly without IME composition
- **THEN** the final input immediately updates the query and follows the
  existing search and home transition behavior
- **THEN** no timer delay or additional confirmation key is introduced

#### Scenario: Recover from dispatch failure after composition

- **WHEN** a user independently executes an Action after committing a Chinese
  query and dispatch returns an existing typed failure
- **THEN** the system preserves the committed query and recoverable selection
  and provides safe localized feedback
- **THEN** the user can continue composing, edit the query, and execute again

#### Scenario: Use IME under either application locale and theme

- **WHEN** a user completes the same composition in the English or Simplified
  Chinese interface under the light or dark theme
- **THEN** draft and commit timing, key priority, and focus-preservation
  semantics are the same
- **THEN** results and feedback use the current locale, and focus and selection
  follow the existing theme and accessibility semantics
