# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
