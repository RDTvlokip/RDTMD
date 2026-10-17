# RDTMD Changelog

All notable changes to the **RDTMD** project are documented in this file.

## [1.1.0] - 2026-10-17

### Added
- **Export**: `RDTMD: Export as HTML` writes a single self-contained file (styles, scripts, data and local images embedded, includes expanded, no network access). `RDTMD: Export as PDF` prints it with an installed Chromium-based browser (Edge, Chrome, Chromium, Brave; `rdtmd.browserPath` to choose), with print-friendly page breaks, and falls back to the system browser's print dialog when none is found.
- **Figure toolbar**: every chart and diagram can be saved as SVG (styles embedded) or PNG (2x). Diagrams can be zoomed (buttons, `Ctrl` + wheel), panned and reset, and hovering a node, participant or task highlights its links.
- **New diagram types**: `state` (state machine with `[*]`), `gantt` (sections, dates, durations, `after`, `done`/`active`/`crit`/`milestone`, `@today`), `quadrant` (prioritization matrix), `er` (entities and crow's-foot relations) and `class` (classes with stereotypes and UML relations).
- **Flowcharts**: node shapes (`[ ]`, `( )`, `{ }`, `(( ))`, `[( )]`, `{{ }}`), chained edges (`A -> B -> C`), titled `group ... end` frames, and parallel edges.
- **Sequence diagrams**: `participant ... as ...`, `activate`/`deactivate`, notes (`over`, `left of`, `right of`), `alt`/`else`, `opt`, `loop`, `par`/`and` blocks, and `@autonumber`.
- **Timelines**: `section` groups with a legend and `@orient vertical`. **Mindmaps**: per-branch colors (`{#hex}`) and click-to-collapse.
- **Charts**: `area`, `scatter` and `donut` types; `@stack`, `@horizontal`, a secondary axis (`@y2`, `@unit2`), `@xlabel`, `@ylabel` and `@center`.
- **Block options** on every chart and diagram: `@theme` (six palettes), `@width`, `@align`.
- **Document features**: `@toc`, heading anchors (`{#id}`), internal `#anchor` links, and footnotes (`[^id]`).
- **Preview themes and palette**: `rdtmd.theme` (`auto`, `light`, `dark`, `paper`, `contrast`) and `rdtmd.palette`. Print stylesheet for clean paper output.
- **Editor**: completion (directives, chart/diagram types, options, block keywords), 24 snippets (`rdt-...`), quick fixes (misspelled kinds and options, chart series length, missing `:::`, `end` and footnote definitions, stray `end`), folding of `:::` blocks, synchronized scrolling between the editor and the preview (`rdtmd.syncScroll`), and syntax highlighting for the new constructs.
- Diagnostics now carry a machine-readable `code` and `data`, and suggest the closest valid name ("did you mean").
- New example `example/demo.rdtmd` covering the whole language, and new tests (`test-v11.js`, `test-ext.js`, and `test-fuzz.js`, a deterministic fuzz suite that runs with `npm test`).

### Changed
- The preview re-renders incrementally: blocks whose content did not change keep their DOM element, so typing in a large document only rebuilds what changed (a document full of diagrams re-renders about 5 times faster) and zoom or active-tab state survives edits.
- The preview renderer is split into small modules (`svgkit`, `charts`, `graph`, `sequence`, `timeline`, `misc`, `interact`); the list of files is shared by the preview, the HTML export and the tests (`src/assets.js`).
- Diagram markers get unique ids, so arrowheads still render in tabs and collapsed sections.
- Unknown chart and diagram options are reported with a "did you mean" suggestion, and invalid `@theme`, `@width` and `@align` values are flagged.

### Fixed
- **Robustness (found by fuzzing and stress tests)**:
  - Typing a bare `http://` made the parser throw, which stopped the live preview and the diagnostics until the line was completed.
  - The characters U+2028 and U+2029 broke several line patterns and could throw.
  - Unclosed inline markers (`*`, `**`, `_`, `~~`, `[`, `![`, `$`) were quadratic: a paragraph with 20 000 of them took 8 to more than 30 seconds. Each paragraph now has a bounded work budget (a normal text never reaches it).
  - Headings, chart, diagram and metrics lines containing very long runs of spaces were quadratic; fixed.
  - Very deep nesting (quotes, lists, directives) overflowed the stack. Block nesting is capped at 256 levels and mindmaps at 100, with a `too-deep` diagnostic; deeper content is kept as text.
- **Rendering**: labels on dense flowcharts, state, ER and class diagrams no longer land on nodes or on each other as often (spatial index, offset candidates; from 30 % of random figures with a collision to about 5 %); Gantt tick labels, rotated chart axis labels and quadrant labels no longer overflow the figure; stacked back-edge labels in top-to-bottom flows no longer overlap; long chart categories are truncated with a tooltip and crowded axes show one label out of N; `javascript:` image sources are dropped.
- **Quick fixes**: closing an unclosed block now inserts `:::` before the next block (it was closing the wrong one when several were nested by mistake), and a footnote definition is added right after the paragraph that cites it (after the block when the citation is inside a chat).
- A flowchart line such as `Input -> Processor -> Storage` created a single node named "Processor -> Storage"; it now creates two edges.
- Back edges of a left-to-right flowchart no longer cross the nodes of their column when they can pass below.
- In class diagrams, parents and owners are placed above their children.

---

## [1.0.3] - 2026-10-17

### Fixed
- **Flow diagrams**: edge labels no longer hide arrows or get covered by nodes. Column spacing follows the width of the labels, labels are drawn on top and placed without collisions, and back edges route around the nodes (including in `@dir TD`).
- **Timeline diagrams**: card text is wrapped and cards are sized from the measured text, so nothing overflows. Cards interleave without overlapping, fonts are larger and the diagram can scale up instead of shrinking.
- **Sequence diagrams**: lifeline spacing adapts to the labels crossing it, labels have a background so lifelines do not strike through them, and self-message labels have room.
- **Mindmap diagrams**: nodes deeper than two levels were silently dropped; layout is now recursive with no depth limit. Sides are balanced by leaf count and box widths are measured.
- **Documentation**: refreshed the four diagram screenshots in the README with the new renderer, and updated the diagram descriptions and the install command.

---

## [1.0.2] - 2026-10-10

### Fixed
- **GitHub Hosted Documentation Assets**: Configured all 14 showcase images to load directly from the official GitHub raw repository CDN (`https://raw.githubusercontent.com/RDTvlokip/RDTMD/main/media/images/...`), complying with Microsoft Visual Studio Marketplace asset policies.
- **Repository URL Matching**: Updated package repository metadata to match exact GitHub repository casing (`RDTvlokip/RDTMD`).

---

## [1.0.1] - 2026-10-10

### Fixed
- **Marketplace Documentation Images**: Embedded self-contained Base64 image data directly within `README.md`, eliminating broken image links (404 errors) caused by unresolved remote GitHub URL rewrites.
- **English Localization**: Fully translated package manifest metadata, configuration settings descriptions, and editor commands into English.

---

## [1.0.0] - 2026-10-10

### Initial Stable Release (VS Code Marketplace)
- **Official v1.0.0 Release** for the Visual Studio Code Marketplace.
- **Zero Runtime Dependencies**: The entire pipeline (lexical tokenizer, AST parser, LaTeX mathematical layout engine, SVG chart/diagram generators, syntax highlighter, and include resolver) is built 100% from scratch with zero third-party packages.
- **Strict Content Security Policy (CSP) Compliance**: All rendering uses programmatic DOM and SVG element construction (`document.createElement`, `document.createElementNS`, and `textContent`). Zero calls to `innerHTML`, `eval()`, or dynamic scripts, guaranteeing safe operation in enterprise and sandbox environments.

### Visual Studio Code Extension Features
- **Synchronized Live Preview (`rdtmd.preview`)**:
  - Live side-by-side webview preview panel opened via `Ctrl+Shift+P` -> **`RDTMD: Open Preview`** or the preview icon in the editor tab bar.
  - Reactive document updates debounced in real time as you type.
  - Native theme integration dynamically conforming to VS Code's **Dark+**, **Light+**, and **High Contrast** color tokens.
  - One-click copy buttons on all code blocks with instant animated visual confirmation (`Copy` -> `Copied!`).
  - Active tab persistence and smooth scroll synchronization.
- **Interactive AST Inspector (`rdtmd.showAst`)**:
  - Side-by-side JSON split view displaying the generated Abstract Syntax Tree via **`RDTMD: Show AST (JSON)`** for introspection, diagnostics, and debugging.
- **Language Grammar & Syntax Highlighting**:
  - Custom TextMate grammar (`source.rdtmd`) providing rich editor syntax coloring for `.rdtmd` files.
  - Syntax highlighting for directives (`:::chart`, `:::diagram`, `:::tabs`, `:::metrics`, `:::chat`, `:::details`), LaTeX math delimiters (`$`, `$$`), checklists, headings, and embedded languages.
- **Real-Time Diagnostic Linter**:
  - Flags unclosed directives, syntax mismatches, and cyclical `@include` references directly in the VS Code **Problems** panel with file line and column positions.
- **Modular Document Architecture (`@include`)**:
  - Recursively resolves external `.rdtmd` files relative to the host document.
  - Automatic cycle detection and recursion depth clamping (up to 8 levels).
  - Interactive preview navigation: click on any included file chip to open it directly in the editor.
- **User Configuration Settings**:
  - `rdtmd.preserveLineBreaks` (boolean, default: `true`): Preserves source file line breaks in paragraphs and blockquotes within the preview.
  - `rdtmd.inlineIncludes` (boolean, default: `false`): Embeds included document content directly into the current preview or displays an interactive file navigation link.

### Core Markup & Visual Capabilities
- **Native LaTeX Mathematical Layout Engine**:
  - Formulates fractions (`\frac`), n-th roots (`\sqrt[n]`), integrals (`\int`, `\oint`), limits (`\lim`), summations (`\sum`), products (`\prod`), matrices (`pmatrix`, `bmatrix`), and piecewise cases (`cases`).
  - Modern machine learning and linear algebra operators: `\softmax`, `\sigmoid`, `\diag`, `\tr`, `\argmax`, `\argmin`, `\top`, `\mid`, `\to`, `\models`.
- **Native SVG Data Charts**:
  - Vector rendering for bar charts (`bar`), line charts (`line`), and pie charts (`pie`).
  - Automatic dynamic Y-axis label spacing, unit labels (`@unit`), automatic X-axis label rotation (-40°) for dense categories, and interactive color legends.
- **Native SVG Architecture Diagrams**:
  - **Flowcharts (`flow`)**: Longest-path topological level assignment, robust cycle prevention, and predecessor barycenter crossing minimization.
  - **Sequence diagrams (`sequence`)**: Participant lifelines, synchronous/asynchronous calls, dashed returns, and self-calls.
  - **Mindmaps (`mindmap`)**: Hierarchical tree layout with Bézier curves and balanced left/right branching.
  - **Timelines (`timeline`)**: Horizontal chronological axes with alternating milestone cards and multi-event slots.
- **Next-Generation Interactive Blocks**:
  - **Tabs (`:::tabs`)**: Accessible client-side tab switching with zero page reloads.
  - **Metrics (`:::metrics` / `:::kpi`)**: Responsive statistical card grids with explicit polarity qualifiers (`good`, `bad`, `neutral`).
  - **Conversations (`:::chat` / `:::dialog`)**: Role-based transcripts for human, AI assistant, and system messages with avatar badges.
  - **Collapsible Details (`:::details` / `:::accordion`)**: Disclosure sections with animated rotating vector chevrons and `@open` support.
- **Built-in Multi-Language Syntax Highlighter (25+ Languages)**:
  - Tokenizer supporting Python, JavaScript, TypeScript, Rust, C, C++, C#, Java, Go, PHP, Ruby, Kotlin, Swift, Lua, PowerShell, Shell, SQL, R, Perl, LaTeX, JSON, YAML, TOML, INI, Dockerfile, Makefile, Regex, and Diff.
  - Multi-line diff blocks featuring continuous outer rounded corners and squared interior seams.

---

## [0.7.0] - 2026-10-10

### Added
- **4 Native Interactive Block Directives**:
  1. **Interactive Tabs (`:::tabs`)**: Split by `=== Tab Title`, client-side tab button navigation with instant switching (`aria-selected`, `aria-hidden`), supporting arbitrary nested code, lists, charts, and math.
  2. **Metrics & KPI Grids (`:::metrics` / `:::kpi`)**: Responsive stat cards (`Label: Value (Change)`) with explicit polarity qualifiers (`good`, `bad`, `neutral`) preventing misleading automated colorations.
  3. **Conversational Transcripts (`:::chat` / `:::dialog`)**: Structured human-to-AI or multi-agent dialogues with avatar badges, sender labels, and differentiated bubble styling.
  4. **Collapsible Details (`:::details` / `:::accordion`)**: Expandable disclosure cards with rotating SVG chevrons and optional `@open` parameter.
- **Strict Adherence to Three Core Design Principles**:
  1. *Predictable Syntax*: Variable-length colon fences (`::::tabs`, `::::details`) and boundary protection for code blocks containing `:::` or `===`.
  2. *Legible Plain-Text Fallback*: Clean text extraction via built-in `plainText()` serializer without requiring a graphical renderer.
  3. *Unambiguous Data*: Explicit declarative polarity attributes in metric blocks.

---

## [0.6.3] - 2026-10-10

### Added
- **Rounded Exterior Corners for Diff Blocks**:
  - Automatic detection of the start and end of each diff hunk (`+` / `-`).
  - Exterior corners (top and bottom of hunk group) are rounded (`border-radius: 6px`).
  - Interior corners between consecutive lines and at deletion/addition seams remain flat.

---

## [0.6.2] - 2026-10-10

### Changed
- Removed emojis from code block header bars: preserves clean, professional file names and tags.

---

## [0.6.1] - 2026-10-10

### Fixed
- **Typography and Vector Proportions Normalization**:
  - Intrinsic dimension boundaries applied to SVG charts and diagrams (`maxWidth: 640px` for charts) preventing oversized scaling on wide screens.
  - Math block font sizing calibrated from `1.4em` to `1.15em` to harmonize formulas with prose text.
  - Explicit hierarchical scaling for headings (`h1` 1.75em, `h2` 1.35em, `h3` 1.15em, `h4` 1.05em).

---

## [0.6.0] - 2026-10-10

### Added
- **Native SVG Flowchart Generator (`:::diagram flow`)**: Topological ordering, cycle avoidance, and barycenter crossing minimization.
- **Sequence Diagram Generator (`:::diagram sequence`)**: Participant boxes, lifelines, and message arrows.
- **Mindmap Generator (`:::diagram mindmap`)**: Indentation-based hierarchical tree with Bézier branches.
- **Timeline Generator (`:::diagram timeline`)**: Chronological roadmap with alternating milestone cards.
- **Expanded Tokenizer (`RDTHighlight`)**: Added support for 19 additional languages and machine learning framework identifiers.

---

## [0.5.1] - 2026-10-09

### Added
- Initial standalone release with headings, lists, tables, custom LaTeX math engine, SVG bar/line/pie charts, callouts, and live webview preview.
