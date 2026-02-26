# Papaya — Brand & Design Guidelines

## Brand Identity

- **Company**: Papaya (just "Papaya" — never "Papaya Insurance Technology", "Papaya AI", or other verbose forms)
- **Platform name**: Oasis ("the Oasis" — Papaya's insurance operations platform)
- **AI agent**: Fatima ("the caretaker of the Oasis")
- **Copyright format**: `© 2026 Papaya` — keep it short
- **No "Powered by" footers** — the brand speaks for itself

## Design System Reference

**Live reference page**: `/design-system` route in the platform shell (`platform/apps/shell/src/features/design-system/DesignSystemPage.tsx`). This page showcases every component, color token, and pattern with the correct brand applied. Always consult it before building new UI.

**Color tokens are defined in**: `platform/libs/shared-ui/src/globals.css` — the single source of truth for all Tailwind CSS custom properties.

## Brand Summary

- **Primary color**: `#ED1B55` (rose-pink) — used as `bg-papaya`, `text-papaya`, and shadcn `primary`
- **Aesthetic**: Clean, modern, pinkish-white. White backgrounds, cool gray text, pink accents.
- **Font**: `Plus Jakarta Sans` — no serif fonts
- **Dark panels**: cool dark zinc (`papaya-dark` #292D32), never warm browns
- **No warm corals, salmons, or earthy tones** — the brand is pink and white

## Tailwind Token Quick-Reference

| Token               | Value     | Class usage           |
| -------------------- | --------- | --------------------- |
| `papaya`             | `#ED1B55` | `bg-papaya`, `text-papaya` |
| `papaya-light`       | `#FAC8D6` | Hover highlights       |
| `papaya-lightest`    | `#FEF3F6` | Tinted backgrounds     |
| `papaya-muted`       | `#637381` | Secondary text         |
| `papaya-border`      | `#DFE3E8` | Borders, dividers      |
| `papaya-dark`        | `#292D32` | Dark panels            |
| `papaya-darker`      | `#1A1D21` | Dark gradients         |
| `papaya-darkest`     | `#111316` | Deepest dark           |

## Voice & Tone

- **Concise**: No verbose labels. "Papaya" not "Papaya Insurance Technology".
- **Confident**: No "Powered by" disclaimers. The product stands on its own.
- **Clean & professional**: Modern, minimal, pinkish-white aesthetic.

## Rules for AI Agents

1. **Check the design system page first** (`/design-system`) — it has live examples of every component with correct brand styling.
2. **Never use warm corals, salmons, or browns**. The brand is rose-pink (`#ED1B55`) and white.
3. **Never write verbose company names**. It's just "Papaya".
4. **No "Powered by" footers** anywhere in the product.
5. **Use the `papaya-*` Tailwind tokens** from `globals.css` for all brand colors.
6. **CTA buttons**: `bg-papaya text-white` or shadcn `<Button>` (which uses `primary` = `#ED1B55`).
7. **Backgrounds**: white or near-white. Use `papaya-lightest` for subtle pink tints.
8. **Font**: Plus Jakarta Sans only. No serif fonts.
9. When in doubt, reference papaya.asia for the design language.
