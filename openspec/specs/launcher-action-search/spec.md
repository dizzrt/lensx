# Launcher Action Search Specification

## Purpose

Define the accepted deterministic search over Host-owned launcher Action
Registry snapshots, result ranking and isolation, accessible App Shell
interaction, and Dispatcher-based execution behavior.

## Requirements

### Requirement: Action Search must consume Host Registry snapshots uniformly

The system MUST accept a query, an application locale for presentation, a
positive integer result limit, and a read-only Action descriptor snapshot, and
return deterministically sorted serializable results. Search text MUST come
only from explicitly declared Action `title` and `default_keywords` values in
all supported languages. `enabled` MUST control filtering, `action_id` MUST
provide identity and tie-breaking, and `owner_id` MUST provide owner identity.
Descriptions, plugin names, Page titles, and private metadata MUST NOT affect
matching or scoring. All sources MUST use the same rules. Icons and Recent or
Pinned state MAY accompany display data but MUST NOT affect matching, scoring,
or ordering. Results MUST retain identity, localized display text, scores, and
optional safe icons, and MUST NOT contain executors, functions, mutable Registry
internals, React state, Tauri objects, or Rust objects.

#### Scenario: Search a built-in Action

- **WHEN** an enabled Host Action in the current snapshot has a title or keyword
  matching the query
- **THEN** search returns its serializable result and optional safe icon
- **THEN** the result does not contain an executor

#### Scenario: Search an Action registered by another future source

- **WHEN** another trusted source registers a valid Action in the same snapshot
  before search
- **THEN** search applies the same cross-language rules as for Host Actions
- **THEN** search neither reads source-private data nor selects a different
  algorithm by source

#### Scenario: Recent or pinned state changes

- **WHEN** only Recent or Pinned state changes for the same query and descriptor
  snapshot
- **THEN** matching Action IDs, scores, and order remain identical
- **THEN** collection state neither raises nor lowers relevance

#### Scenario: A caller modifies search input or results

- **WHEN** a caller modifies the original input or attempts to modify results
  after search
- **THEN** search does not modify Registry descriptors or snapshots
- **THEN** later queries remain unaffected and results expose no mutable
  internal references

#### Scenario: Only non-search metadata contains the query

- **WHEN** the query appears only in an Action description, plugin name,
  plugin-wide description, Page title, ID text, or private metadata
- **THEN** those fields do not cause the Action to enter results
- **THEN** their contents do not affect scores of other matching Actions

### Requirement: Queries must be normalized and tokenized deterministically

Queries and each searchable text MUST use the same locale-independent
normalization: Unicode NFKC, locale-independent lowercase conversion, trimming,
and collapsing consecutive Unicode whitespace to one ASCII space. Queries MUST
be split on whitespace into non-empty tokens, and fields MUST be normalized
independently. Empty queries MUST return no results and MUST NOT simulate
recommendations from Registry order. Independent Home content MAY show existing
Action collections; search MUST NOT generate or order those collections.

#### Scenario: Normalize case and whitespace

- **WHEN** queries differ only by equivalent case, full-width compatibility
  characters, or consecutive whitespace
- **THEN** both interface languages produce the same normalized query and tokens
- **THEN** equivalent queries produce identical Action IDs, scores, and order

#### Scenario: The query is empty

- **WHEN** the query is empty or has no tokens after normalization
- **THEN** search returns no results or Registry-order recommendations
- **THEN** the App Shell may continue to show independent Home collections

#### Scenario: Field boundaries are not searchable text

- **WHEN** a continuous match would require concatenating titles in different
  languages or multiple keywords
- **THEN** search creates no such synthetic exact, prefix, or substring match
- **THEN** only separate query tokens may independently match different fields

### Requirement: Matching and ranking must be explainable and deterministic

Search MUST match explicitly declared Action titles and keywords from all
supported languages without filtering text by interface locale. Every query
token MUST match at least one title or keyword of the same Action; otherwise
the Action MUST be excluded. Matching MUST use only exact, prefix, and substring
relationships. Token priority MUST be title exact, keyword exact, title prefix,
keyword prefix, title substring, then keyword substring. Interface locale and
descriptions MUST NOT affect scores. Equal scores MUST sort by ascending
`action_id`. Search MUST NOT add edit-distance, pinyin, translation, semantic,
or personalized matching.

#### Scenario: A title match outranks a description match

- **WHEN** one Action title exactly matches the query and another Action
  contains the query only in a description in any language
- **THEN** search returns the title match and excludes the description-only match
- **THEN** descriptions receive no fallback matching score

#### Scenario: Multiple tokens match across fields

- **WHEN** some query tokens match an Action's English title and the remaining
  tokens match the same Action's Chinese keywords
- **THEN** that Action satisfies the all-token matching rule
- **THEN** Chinese and English interfaces produce identical matches and scores

#### Scenario: Only some tokens match

- **WHEN** at least one token matches none of an Action's titles or keywords,
  even if it appears in a description
- **THEN** search excludes that Action

#### Scenario: Two Actions have the same score

- **WHEN** two Actions have equal scores for the same query
- **THEN** both interface languages return them in ascending `action_id` order
- **THEN** registration order and metadata language-key order do not change
  result order

#### Scenario: Text for the current locale is absent

- **WHEN** the interface is Chinese and an Action declares only an English title
  and English keywords
- **THEN** those English texts remain searchable and the result title continues
  to use English display fallback
- **THEN** missing Chinese text neither raises nor lowers the Action's score

#### Scenario: Empty current-language keywords do not mask another language

- **WHEN** Chinese keywords are an empty array and English keywords declare
  `format`
- **THEN** entering `format` in either interface language can match the Action
- **THEN** an Action with no declared keywords can still be searched by its
  declared titles

#### Scenario: Changing only descriptions does not affect search

- **WHEN** descriptions in any language are added, changed, or removed while
  titles, keywords, identity, and availability remain unchanged
- **THEN** the same query produces identical matches, relevance scores, and order
- **THEN** descriptions remain available as independent display metadata

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

### Requirement: Cross-language duplicate matches MUST contribute relevance only once

Each Action's score MUST be the best complete-query exact or prefix bonus over
individual titles plus each query token's best match across all titles and
keywords. A token MUST NOT accumulate scores by field or language count; the
complete-query bonus MUST apply once. Identical or normalization-equivalent
text MUST NOT add points or duplicate results. A stronger match from another
language MUST contribute its best score.

#### Scenario: The same keyword appears in both languages

- **WHEN** `JSON` appears in both languages' keywords
- **THEN** querying `JSON` produces the same score and result count as retaining
  only one equivalent declaration
- **THEN** case-equivalent or NFKC-equivalent cross-language copies likewise
  contribute no additional score

#### Scenario: The best match can come from any language or field

- **WHEN** a token matches a title substring in one language and an exact keyword
  in another
- **THEN** only the higher exact-keyword score contributes
- **THEN** search neither adds the title-substring score nor favors the current
  interface language

#### Scenario: Complete-query title bonuses are not accumulated

- **WHEN** the complete query exactly matches equivalent titles in two languages,
  or exactly matches one title and prefix-matches another
- **THEN** only the highest complete-query title bonus contributes once
- **THEN** each query token still contributes only its best match once

#### Scenario: Another language provides a stronger match

- **WHEN** the original title `Format JSON` provides only a substring match for
  `JSON` and a new title `JSON 格式化` in another language provides a prefix match
- **THEN** search uses the stronger match and its applicable complete-query title
  bonus
- **THEN** the weaker original match is not added and both interface languages
  produce the same new score

### Requirement: Interface locale MUST affect result presentation only

For the same query, read-only Action snapshot, and result limit, switching the
interface locale MUST preserve result Action IDs, scores, and order. Result
titles, retained optional descriptions, and feedback MUST use the current
locale with existing English fallback for missing text. The matching language
MUST NOT force a different display language. Existing theme, accessibility,
and failure-recovery contracts MUST remain applicable.

#### Scenario: Switch locale after a cross-language match

- **WHEN** `format` matches an Action that has English and Chinese titles but
  contains that keyword only in English, and the interface locale changes
- **THEN** its identity, score, and order remain identical
- **THEN** its display title follows the interface language and the Action
  appears only once

#### Scenario: Mixed-language query has no complete match

- **WHEN** at least one token in a mixed-language query matches no searchable
  field
- **THEN** neither interface language returns that Action
- **THEN** no-results feedback uses the current locale and input remains usable

#### Scenario: Existing theme and failure recovery remain available

- **WHEN** cross-language results are navigated with the keyboard, or execution
  returns an existing typed failure, in either locale and either theme
- **THEN** combobox/listbox, focus, theme, and localized error feedback remain
  available
- **THEN** users can edit or resubmit the query after failure, and descriptions
  do not become a fallback search source
