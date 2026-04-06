# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI/UX Pro Max Skill

This project has the **UI/UX Pro Max** design intelligence skill installed, providing searchable databases of UI styles, color palettes, font pairings, chart types, and UX guidelines.

### Search Command

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain> [-n <max_results>]
```

**Domain search:**
- `product` - Product type recommendations (SaaS, e-commerce, portfolio)
- `style` - UI styles (glassmorphism, minimalism, brutalism) + AI prompts and CSS keywords
- `typography` - Font pairings with Google Fonts imports
- `color` - Color palettes by product type
- `landing` - Page structure and CTA strategies
- `chart` - Chart types and library recommendations
- `ux` - Best practices and anti-patterns

**Stack search:**
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack <stack>
```
Available stacks: `html-tailwind` (default), `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

### Installed Skills

Located in `.claude/skills/`:
- `ui-ux-pro-max` - Core design intelligence with BM25 + regex hybrid search
- `ui-styling` - UI styling references (shadcn, Tailwind, canvas design system)
- `design` - General design skill
- `design-system` - Design system generation
- `brand` - Brand identity guidelines
- `banner-design` - Banner/graphic design
- `slides` - Slide/presentation design

### Prerequisites

Python 3.x (no external dependencies required)
