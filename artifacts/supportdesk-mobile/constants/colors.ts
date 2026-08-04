/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#0b1736',
    tint: '#2459d6',

    // Core surfaces
    background: '#f7f9fc',
    foreground: '#0b1736',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#0b1736',

    // Primary action color (buttons, links, active states)
    primary: '#2459d6',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#edf2fb',
    secondaryForeground: '#19305f',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#edf2fb',
    mutedForeground: '#62708c',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#e5edff',
    accentForeground: '#193f9e',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#dce4f1',
    input: '#cbd6e7',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
