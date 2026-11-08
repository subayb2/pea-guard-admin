# PEA Guard Admin

User-requested skill: ui-ux-pro-max. Verified local search: `internal operations analytics dashboard`, design-system, density 8; stack guidance: responsive tables, keyboard forms, html-tailwind.

Use the matched **Data-Dense Dashboard** style: readable tables, scoped filters, restrained charts, minimal decoration, accessible focus, explicit states. The search's sales/landing-page pattern did not fit an internal dashboard; no verified pattern match was found after one retry. The operational composition below is authored general UI guidance.

Preserve PEA identity with purple #720969, dark purple #350d3e, warm ivory #f7f7fa and a restrained gold accent. Thai-first font stack: Noto Sans Thai / Leelawadee UI / Tahoma / sans-serif. Numeric data uses tabular figures. Status green = recorded patrol; red = IDEL, accompanied by text.

Sidebar → overview and scoped filters → four topline metrics → daily status distribution and station exceptions → paginated underlying records. IDEL is station × hour, never guard × hour. PATROLLED means at least one successful check-in, not all five points completed. Display only closed rounds in the patrol rate denominator. No fictional data, trend deltas or unverified targets.

Responsive: sidebar collapses at 1050px; charts stack at 850px; metrics become two columns; form fields wrap on mobile. Minimum control height 44px. Tables scroll inside their container. Visible keyboard focus, semantic labels, keyboard tabs, reduced-motion support, no essential animation or emoji icons.

Runtime: buildless HTML/CSS/ES modules. Static files on GitHub Pages. Separate read-only Apps Script API, with verified Google Admin identity and server-side password/session checks. Source logs and secrets never belong in the static repository.
