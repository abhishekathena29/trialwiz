---
name: TrialWiz Healthcare Design System
colors:
  surface: '#fef7ff'
  surface-dim: '#e1d4fd'
  surface-bright: '#fef7ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f1ff'
  surface-container: '#f3eaff'
  surface-container-high: '#eee4ff'
  surface-container-highest: '#e9ddff'
  on-surface: '#1f1635'
  on-surface-variant: '#4b4454'
  inverse-surface: '#342b4b'
  inverse-on-surface: '#f6edff'
  outline: '#7d7385'
  outline-variant: '#cec2d6'
  surface-tint: '#7c32d2'
  primary: '#6100b6'
  on-primary: '#ffffff'
  primary-container: '#7a2fd0'
  on-primary-container: '#e4cbff'
  inverse-primary: '#d9b9ff'
  secondary: '#aa352d'
  on-secondary: '#ffffff'
  secondary-container: '#fa7063'
  on-secondary-container: '#6c0507'
  tertiary: '#86005c'
  on-tertiary: '#ffffff'
  tertiary-container: '#a72276'
  on-tertiary-container: '#ffc5df'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eedcff'
  primary-fixed-dim: '#d9b9ff'
  on-primary-fixed: '#2a0054'
  on-primary-fixed-variant: '#6303b9'
  secondary-fixed: '#ffdad5'
  secondary-fixed-dim: '#ffb4aa'
  on-secondary-fixed: '#410002'
  on-secondary-fixed-variant: '#891d18'
  tertiary-fixed: '#ffd8e8'
  tertiary-fixed-dim: '#ffafd5'
  on-tertiary-fixed: '#3d0027'
  on-tertiary-fixed-variant: '#8a005f'
  background: '#fef7ff'
  on-background: '#1f1635'
  surface-variant: '#e9ddff'
typography:
  display-hero:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  stat-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 20px
  stack-gap: 24px
  touch-target-min: 48px
  card-padding: 20px
---

## Brand & Style

The design system is anchored in a philosophy of "Empathetic Clarity." It bridges the gap between professional healthcare reliability and the warmth of a personal wellness companion. The target audience includes patients and clinical trial participants who may be experiencing stress; therefore, the UI must act as a calming agent.

The aesthetic follows a **Modern Humanist** approach:
- **Minimalism with Warmth:** Generous white space (24px+) is mandatory to prevent cognitive overload.
- **Soft Tactility:** Depth is conveyed through subtle layering and high-radius cards rather than aggressive shadows.
- **Focused Intent:** Every view is optimized for a single primary action, reducing decision fatigue.
- **Vibrant Directives:** High-energy gradients are reserved strictly for the most critical touchpoints (Hero panels, Primary CTA, Brand identity) to provide a clear visual lighthouse in a soft environment.

## Colors

The palette avoids the sterile "hospital blue" in favor of a sophisticated violet and warm neutral base. 

- **Primary Canvas:** The background uses a soft lavender-tinted grey (#F6F3F7) to reduce screen glare. Cards are pure white (#FFFFFF) to pop against this base.
- **Hierarchy of Type:** The primary text color (#2A2140) provides high legibility without the harshness of pure black. Secondary information uses a muted mauve-grey (#7C7488).
- **The Signature Gradient:** A 135-degree linear blend of Coral, Magenta, and Violet. This is the "Pulse" of the system. It is high-contrast and should be used sparingly to indicate the "Next Step" or "Main Focus."
- **Accents:** The Brand Wash (#F1E9FA) is used for low-priority interactive surfaces like chips or selected states, ensuring the UI remains airy.

## Typography

This design system uses **Inter** exclusively to maintain a systematic, legible, and modern feel.

- **Big Friendly Numbers:** For health metrics and progress tracking, use `stat-lg`. These should feel prominent but grounded.
- **Section Headers:** Use `label-caps` for overlines and small section dividers. The 0.1em letter spacing is critical for readability at small scales and adds an editorial touch.
- **Scaling:** Headlines shift significantly between mobile and desktop to ensure the "single action" focus is maintained without the text crowding the viewport.

## Layout & Spacing

The layout is **Mobile-First** and relies on a fluid vertical stack.

- **The 24px Rule:** Use a default 24px (1.5rem) gap between major sections to maintain "generous white space."
- **Safe Margins:** Use a 20px side margin for mobile containers.
- **Tap Targets:** Buttons and interactive elements must have a minimum height of 48px, though 56px is preferred for primary actions to enhance the "warm and accessible" feel.
- **Grid:** On desktop, use a 12-column grid with a max-width of 1140px, centered, to prevent lines of text from becoming too long and intimidating.

## Elevation & Depth

Depth is used to signify "interactivity" rather than "distance."

- **Soft Elevation:** Cards use a very diffused, low-opacity shadow (Shadow: 0px 4px 20px rgba(42, 33, 64, 0.05)). This makes the card feel like it is resting gently on the background wash.
- **Tonal Layering:** For non-interactive sections, use the `brand_wash` background color with no shadow instead of a card.
- **Active State:** When a card or button is pressed, it should subtly scale down (98%) rather than increasing shadow, maintaining a tactile, physical response.

## Shapes

The shape language is consistently rounded to evoke friendliness and safety.

- **Cards:** Standardized at 16px (`rounded-lg` in this system).
- **Buttons:** Use 12px roundedness for a modern look, or full pill-shape for chips.
- **Inputs:** Follow the 12px rounding to match buttons, creating a cohesive form-entry experience.
- **Avoid Sharpness:** No element should have a radius below 8px unless it is a hairline divider.

## Components

- **Primary Buttons:** Apply the `hero_gradient`. Text should be white with a semi-bold weight. Ensure the button spans the full width of its container on mobile.
- **Secondary Buttons:** Use a 1px border of `brand_violet` or `hairlines` with `primary_text`.
- **Cards:** 16px radius, white background, soft elevation. One primary headline and one clear action per card.
- **Chips & Badges:** Use `brand_wash` background with `primary_text` or `primary_color` (violet) for the label. Radii should be 100px (pill).
- **Input Fields:** Soft grey background (#F6F3F7) or white with a subtle hairline border. Labels should use the `label-caps` style above the field.
- **Hero Panel:** This is the only place for large-scale application of the `hero_gradient`. Use it at the top of the dashboard or main landing screens to house the most important health metric or greeting.
- **Progress Bars:** Use `brand_wash` for the track and the `hero_gradient` for the fill to visualize health goals.