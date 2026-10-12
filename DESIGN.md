---
name: J. Armando — Storefront Design Direction
description: Editorial, restrained fashion e-commerce language for the J. Armando storefront. Zero-radius architectural forms, ivory/ink palette, serif + grotesk pairing, quiet AI surfaces. Direction only — assets are a proposal and may be redesigned where MVP scope requires it.
designAssets:
  sourceOfTruth: []
  references:
    - path: stitch_image_based_application/lumen_atelier/DESIGN.md
      role: Design system tokens and rationale (colors, typography, spacing, elevation, shapes, components)
      status: proposal
    - path: stitch_image_based_application/cat_logo_colecci_n_editorial/
      role: Catalog / collection screen (listing, filters, sorting, product cards)
      status: proposal
    - path: stitch_image_based_application/detalle_de_producto_probador_virtual_ia/
      role: Product detail + virtual try-on screen
      status: proposal
    - path: stitch_image_based_application/carrito_pasarela_de_pago_simulada/
      role: Cart + simulated payment / checkout screen
      status: proposal
---

# Design Direction

## Overview

This document is the persistent visual direction for coding agents working on the **J. Armando** storefront. It exists so that UI work stays coherent across agents and turns.

The authoritative token values (colors, typography scale, spacing, elevation, shapes, component rules) live in the reference design system file. **Do not duplicate them here** — read them from the source listed below and apply the guidance in this document.

## Existing Design Assets

| Path | Role | Authority |
| --- | --- | --- |
| `stitch_image_based_application/lumen_atelier/DESIGN.md` | Design system: tokens + rationale | **Proposal / direction.** Source of token values, not a rigid spec. |
| `stitch_image_based_application/cat_logo_colecci_n_editorial/` | Catalog screen (HTML + PNG) | Proposal. Shows listing, filters, sorting, product cards, AI badge. |
| `stitch_image_based_application/detalle_de_producto_probador_virtual_ia/` | Product detail + virtual try-on (HTML + PNG) | Proposal. Shows gallery, size/color selection, fit hints, try-on flow. |
| `stitch_image_based_application/carrito_pasarela_de_pago_simulada/` | Cart + checkout + simulated payment (HTML + PNG) | Proposal. Shows cart steppers, order summary, guest identification, shipping, payment form. |

**Authority statement:** these assets were produced before the product brief and are explicitly a **proposal that may be redesigned** where MVP scope requires. Use them for visual language, tone and composition. Do **not** treat their copy, feature set or pixel spacing as specification. Where a screen shows a feature that `docs/mvp-scope.md` excludes, the scope document wins.

## Brand

The brand is **J. Armando**. Wherever the assets show `LUMEN STUDIO`, `LUMEN Atelier`, `LUMEN Lens`, `LUMEN Stylist IA` or `LUMEN`, replace with the J. Armando naming convention. Suggested mapping:

| In assets | Use |
| --- | --- |
| `LUMEN STUDIO` / `LUMEN Atelier` | `J. Armando` |
| `LUMEN Lens Badge` | `J. Armando Lens` (or simply the AI badge) |
| `LUMEN Stylist IA` (chatbot) | `Asistente J. Armando` (Chat Assistant) |
| `LUMEN Stylist IA` (cross-sell) | Out of MVP scope — do not build |
| `FITIQ` / fit predictor | Out of MVP scope — do not build |

## Language

- **UI copy: English.** The market is the United States. The reference screens are in Spanish and their copy must be **rewritten into English**; the Spanish text is not to be shipped.
- **Documentation: English.**

## Pricing and Tax Display

The reference checkout screen shows an IVA-inclusive total (`Impuestos … incluido`). For the US market this changes:

- Catalog prices are **tax-exclusive** and displayed as such.
- Sales tax appears as a **separate line** in the order summary, calculated at checkout from the shipping address (state / ZIP).
- Currency is **USD** everywhere (the references show EUR).

Follow the reference composition and hierarchy, but replace the tax and currency treatment with the above.

## Product Feel

Poised, serene, deliberate. Editorial haute-couture restraint fused with quiet computational intelligence. AI should feel like an invisible master tailor — discreet and context-aware — never playful, never synthetic, never loud.

Three principles to preserve:

1. **Editorial restraint** — generous negative space, calibrated hierarchy, gallery-like composition. The interface defers to the garment photography.
2. **Architectural precision** — razor-sharp alignments, hairline structural dividers, quiet tactile feedback.
3. **Synthesized intelligence** — generative features render as bespoke, quiet surfaces (luminous glass, hairline accents), not as novelty widgets.

## Colors

Read the full palette from `stitch_image_based_application/lumen_atelier/DESIGN.md`. Directional summary:

- **Primary / ink** — deep charcoal, grounding tone for typography, structural frames and definitive interactions. Never pure digital black.
- **Neutral / canvas** — warm ivory alabaster background that avoids harsh glare and enhances fabric texture.
- **Secondary** — warm stone mid-tone for metadata, editorial subheadings and secondary actions.
- **Tertiary / AI** — slate steel, reserved for algorithmic intelligence indicators, virtual try-on surfaces and interactive tailoring states.

AI surfaces use a very low-opacity tint of the tertiary tone plus a luminescent white highlight on hover. Hairline borders throughout; no heavy shadows.

> Note: the reference file's front matter and its prose section use slightly different hex values for the same roles. Treat the **prose palette description** as the intent and the **front-matter tokens** as the concrete values; flag any conflict before applying it.

## Typography

Pairing: **Newsreader** (editorial serif) for major headings, **Hanken Grotesk** (geometric sans) for functional data.

Rules:

- Major headings render in Newsreader, italic or regular. Never bold for editorial serifs — hierarchy comes from scale, posture (italic vs. upright) and tonal contrast.
- Functional data (sizing, composition tables, navigation, AI metadata) uses Hanken Grotesk.
- Micro-tags, SKUs and category markers use the uppercase label style.

## Layout

12-column editorial grid, Swiss-poster discipline.

- **Mobile (< 768px)** — 4 columns, single or staggered asymmetric pairs for product listings.
- **Tablet (768–1024px)** — 8 columns, balanced 4:4 splits for editorial hero modules.
- **Desktop (> 1024px)** — 12 columns, max-width 1600px, wide margins framing garments like museum artifacts.

Use asymmetric column spans (e.g. 7 columns of imagery with 5 columns of commentary) to break e-commerce monotony. Separate narrative sections with a large vertical pause.

## Shapes

**Zero radius everywhere.** Rectilinear geometry mirrors textile bolts, photographic framing and print publications. Form fields, image containers, dialogs, drawers and buttons all keep 90-degree corners.

The only permitted exceptions: circular AI status pips and circular color swatch selectors.

## Components

Direction only; read concrete values from the reference file.

- **Primary button** — solid ink background, white uppercase label, zero radius. Hover deepens the value and expands letter-spacing subtly.
- **Secondary / ghost button** — transparent with a 1px ink border; hover inverts to solid ink with ivory text.
- **AI action button** — hairline border in the tertiary tint, ambient tinted background, accompanied by a small starlet or status dot.
- **AI badge / micro-chip** — compact label in the AI style, inverted colors, hairline border. Used for "IA Try-On" and similar markers on product cards.
- **Product card** — frameless image container (3:4 or 4:5), title in the serif heading style, price and fabric origin in the sans body style. An inline fit/AI annotation may sit under the price. Hover may transition still → drape video with a gentle ease.
- **Inputs** — flat bottom border only, transparent background, uppercase label. Focus darkens the border with no outer glow.
- **Size / radio tiles** — rectangular border-only matrix; selected becomes solid ink with white text; out-of-stock shows a diagonal hairline slash.
- **Checkboxes** — square, unrounded.

## Core Screens

Map to the MVP in `docs/mvp-scope.md`. Reference screens exist for three of these; the rest are design direction only.

| Screen | Reference | MVP? |
| --- | --- | --- |
| Catalog listing (filters, sorting, product grid) | Yes | Yes |
| Product detail (gallery, variants, composition/care) | Yes | Yes |
| Virtual try-on (photo upload → result) | Yes | Yes |
| Cart | Yes | Yes |
| Checkout / simulated payment | Yes | Yes |
| Order confirmation | — | Yes |
| Order history | — | Yes |
| Account / sign-in | Partial (guest identification block) | Yes |
| Backoffice (products, variants, stock, orders) | — | Yes, minimal |
| Chat assistant panel | Indicated in header of reference screens | Yes |
| AI Stylist cross-sell module | Yes | **No — out of scope** |
| Fit predictor (FITIQ) | Yes | **No — out of scope** |
| Newsletter / editorial footer | Yes | **No — out of scope** |

## Responsive Baseline

Must work at 375px, 768px, 1024px and 1440px. Product grids collapse from 4 columns to 2 to 1. The checkout summary column stacks above or below the form on mobile. Filter controls become a drawer or stacked panel on mobile.

## Accessibility Baseline

- Contrast: ink on ivory meets AA for body and heading text; verify the tertiary AI tint does not fall below AA for any text it carries.
- Keyboard: all interactive elements reachable and visible-focusable. Size tiles and filter controls must be operable without a pointer.
- The zero-radius, hairline aesthetic must not remove focus indicators — use a visible focus ring or border change.
- Alt text on product imagery; try-on result images need meaningful alternatives.
- Do not rely on color alone for out-of-stock or selected states (use the diagonal slash / border weight as in the reference).
- Reduced-motion: disable the still→drape hover video and the AI status pip pulse when `prefers-reduced-motion` is set.

## Do's and Don'ts

**Do**
- Let garment photography dominate; keep UI chrome quiet.
- Use hairline borders and tonal layering instead of drop shadows.
- Keep AI surfaces translucent, low-contrast and calm.
- Replace all LUMEN branding with J. Armando.
- Write UI copy in English (US market).

**Don't**
- Add border radius to anything except AI pips and color swatches.
- Use bold weights on the editorial serif.
- Build AI Stylist cross-sell, fit prediction, newsletter or returns — they are out of MVP scope.
- Treat the reference screens' copy, prices or feature list as specification.
- Invent new accent colors, gradients or playful illustration styles.

## Open Design Questions

- Confirm the exact brand lockup and whether a monogram (`J. Armando`) or wordmark is used in the header.
- Resolve the hex discrepancy between the reference file's front matter and its prose palette.
- Decide whether try-on results are presented as a gallery, a comparison slider, or a single output.
- Decide the empty, loading and failure states for virtual try-on (not covered by the references).
- Decide the backoffice visual language: same editorial system, or a denser tool-like treatment.
- Confirm whether product cards need the hover still→video transition in the MVP (cost/latency) or a static image is enough.
- Decide the order confirmation and order history visual treatment (no reference exists).
