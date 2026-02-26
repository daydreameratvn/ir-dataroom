# Papaya — Brand & Design Guidelines

## Brand Identity

- **Company**: Papaya (just "Papaya" — never "Papaya Insurance Technology", "Papaya AI", or other verbose forms)
- **Platform name**: Oasis ("the Oasis" — Papaya's insurance operations platform)
- **AI agent**: Fatima ("the caretaker of the Oasis")
- **Copyright format**: `© 2026 Papaya` — keep it short
- **No "Powered by" footers** — the brand speaks for itself

## Color Palette — Papaya (the fruit)

The visual identity is inspired by the papaya fruit: warm corals, salmon pinks, deep reddish-browns. No teal, no emerald, no cool greens.

### Primary Colors

| Token             | Hex       | Usage                                         |
| ----------------- | --------- | --------------------------------------------- |
| `papaya-coral`    | `#E8533A` | Primary CTA buttons, active states, links      |
| `papaya-salmon`   | `#FF6B4A` | Hover states, warm highlights                  |
| `papaya-peach`    | `#FF8A6B` | Secondary accents, soft glows                  |
| `papaya-blush`    | `#FFAD8B` | Light backgrounds, subtle tints                |

### Dark / Brand Panel Colors

| Token             | Hex       | Usage                                         |
| ----------------- | --------- | --------------------------------------------- |
| `papaya-bark`     | `#3D1F14` | Dark brand panels (lightest dark)              |
| `papaya-earth`    | `#2A1209` | Dark brand panels (mid)                        |
| `papaya-night`    | `#1A0A04` | Dark brand panels (deepest)                    |

### Neutral / UI Colors

| Token             | Hex       | Usage                                         |
| ----------------- | --------- | --------------------------------------------- |
| `surface`         | `#FAFAF7` | Page backgrounds (warm white)                  |
| `text-primary`    | `#1A1A1A` | Headings, body text                            |
| `text-secondary`  | `#5A5550` | Descriptions, secondary labels                 |
| `text-muted`      | `#8B8178` | Captions, hints, timestamps                    |
| `text-faint`      | `#B5AFA6` | Disabled text, watermarks                      |
| `border`          | `#E5DDD3` | Card borders, dividers, input borders          |

### Gradients

- **Brand panel**: `linear-gradient(135deg, #3D1F14 0%, #2A1209 50%, #1A0A04 100%)`
- **CTA hover**: darken coral → `#D94A33`
- **Focus ring**: `rgba(232, 83, 58, 0.3)`
- **Sidebar logo**: `from-red-400 to-orange-500` (Tailwind gradient)
- **Glow orbs**: `rgba(255,107,74,0.08)` and `rgba(255,138,107,0.1)`

## Typography

- **Headings / Brand**: `'DM Serif Display', Georgia, serif`
- **Body / UI**: `'Plus Jakarta Sans', system-ui, sans-serif`
- Both loaded via Google Fonts in `index.html`

## Voice & Tone

- **Concise**: No verbose labels. "Papaya" not "Papaya Insurance Technology".
- **Confident**: No "Powered by" disclaimers. The product stands on its own.
- **Warm & professional**: The brand panel says "Where insurance operations find clarity." — that's the tone.

## Rules for AI Agents

1. **Never use teal, emerald, or cool green** in the UI. The brand is warm: corals, salmons, browns.
2. **Never write verbose company names**. It's just "Papaya".
3. **No "Powered by" footers** anywhere in the product.
4. **Use the papaya color tokens** above for all new UI work.
5. **Sidebar logo gradient**: `from-red-400 to-orange-500` — not emerald/teal.
6. **CTA buttons**: `#E8533A` background, white text, `#D94A33` hover.
7. When in doubt, reference the login page (`platform/libs/auth/src/LoginPage.tsx`) as the design reference.
