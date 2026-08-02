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
Host Action Service and run unified search against the current Registry
snapshot. For an empty query, it MUST display neither a search-result collection
nor a search empty state and MUST return to the independent home presentation
state. For a non-empty query with matches, it MUST display a bounded, fixed
four-column grid of at most eight real Action tiles in one localized Search
Results section. It MUST NOT display an additional Matches, Recommendations,
Marketplace, or source section. For a non-empty query without matches, it MUST
display a localized empty state.

Results MUST show the resolved Action title and an icon or stable fallback icon
and MAY show the description, but MUST NOT expose the owner, internal score, or
executor as ordinary product copy. The interface MUST NOT automatically change
the native launcher window height based on result count.

#### Scenario: A query matches the built-in Action

- **WHEN** a user enters a non-empty query matching the title or keyword of
  `lensx.core.hide_launcher`
- **THEN** the App Shell displays that real localized Action result in the
  Search Results grid
- **THEN** the tile displays a valid Action icon or the stable generic fallback
  icon
- **THEN** the page does not display a simulated Action, plugin entry point, or
  second result section

#### Scenario: Clear the query

- **WHEN** a user removes all content from the query
- **THEN** the App Shell removes the result grid, selection, and search empty
  state
- **THEN** the launcher input remains editable and focusable
- **THEN** the App Shell displays the independent home Action collections

#### Scenario: A non-empty query has no results

- **WHEN** a user enters a non-empty query that matches no enabled Action
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

- **WHEN** result count, selection, or execution-pending state changes
- **THEN** the App Shell provides necessary status through an appropriate live
  region
- **THEN** ordinary count or success messages do not form another visible
  section outside Search Results

### Requirement: Users must be able to select and execute results with keyboard or pointer

When the result set is non-empty, the App Shell MUST select the first result by
default. When the query or result set changes, selection MUST reset to the new
first result. When no result exists, selection MUST be cleared. The input MUST
retain focus during navigation. `ArrowLeft` and `ArrowRight` MUST move between
adjacent results without wrapping. `ArrowUp` and `ArrowDown` MUST move by the
fixed four-column offset and MUST preserve the current selection when the target
does not exist. `Enter` MUST execute the selected `action_id` through the
existing Host Dispatcher. Pointer activation MUST use the same dispatch path.
`Escape` MUST clear the query, results, and selection and restore input focus.
While one dispatch is pending, the same interaction MUST NOT start a duplicate
execution.

#### Scenario: Select results horizontally

- **WHEN** the input retains focus and a result row contains multiple Actions
- **THEN** `ArrowRight` selects the next result and stops at the last result
- **THEN** `ArrowLeft` selects the previous result and stops at the first result

#### Scenario: Select results vertically

- **WHEN** the input retains focus and the four-column grid has multiple rows
- **THEN** `ArrowDown` selects the result at the current index plus four when it
  exists
- **THEN** `ArrowUp` selects the result at the current index minus four when it
  exists
- **THEN** selection remains unchanged when the target result does not exist

#### Scenario: Execute the selected Action with Enter

- **WHEN** a result is selected and a user presses `Enter`
- **THEN** the App Shell passes that result's `action_id` to the Host Dispatcher
- **THEN** neither the search layer nor React component reads or invokes the
  executor directly

#### Scenario: Execute a result with a pointer

- **WHEN** a user activates a search result with a pointer
- **THEN** the App Shell executes the Action through the same Dispatcher path
  used for keyboard execution

#### Scenario: Trigger an Action again while it is executing

- **WHEN** dispatch for the selected Action is pending and a user presses
  `Enter` again or activates the same result
- **THEN** the App Shell does not start a second concurrent dispatch

#### Scenario: Clear the current search

- **WHEN** results are visible and a user presses `Escape`
- **THEN** the App Shell clears the query, results, and selection
- **THEN** the launcher input regains focus

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
