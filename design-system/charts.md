# Charts page

Keep PEA branding, existing logo, typography and semantic colors from MASTER.md.

- Three routes: overview, charts, details; shared authorized report and filters. Page changes do not reread Sheets.
- Global filters: unit → station, operating-date range (1–31 days), scheduled round. Quick ranges use the operating day supplied by the server.
- Discrete stacked bars compare closed patrol results across days and scheduled hours. Direct counts and accessible button names accompany colors. Each bar can drill into its date/hour; station bars drill into a station.
- Time-status bars count check-ins with percentage of all scoped check-ins. Unknown timing is included explicitly in the denominator.
- Station comparison switches between absolute IDEL, patrolled rounds and check-ins; top 10/20/all. These are counts, not normalized station rankings.
- Graphs use full filtered server aggregates, independent of record pagination. No synthetic missing rounds or historical schedule rewriting.
- Semantic native controls, 44px targets, visible keyboard focus, mobile page navigation and single-column chart layout. No chart dependency/CDN required.

UI Pro Max chart search: `daily trend station comparison`, chart domain. Trend-over-time guidance reviewed; discrete daily stacked counts retained to support one-day scopes and direct outcome comparison. Primary values are visible text rather than color-only labels.
