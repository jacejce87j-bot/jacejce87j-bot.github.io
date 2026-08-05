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
    text: '#132238',
    tint: '#1769E0',

    // Core surfaces
    background: '#F4F7FB',
    foreground: '#132238',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#132238',

    // Primary action color (buttons, links, active states)
    primary: '#1769E0',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8EEF7',
    secondaryForeground: '#20344F',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#E8EEF7',
    mutedForeground: '#60738D',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#DCEAFE',
    accentForeground: '#1455B8',

    // Destructive actions (delete, error states)
    destructive: '#D64545',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#D9E2EF',
    input: '#C8D5E5',
  },

  dark: {
    text: '#F5F8FC',
    tint: '#66A3FF',
    background: '#0E1A2B',
    foreground: '#F5F8FC',
    card: '#17263B',
    cardForeground: '#F5F8FC',
    primary: '#66A3FF',
    primaryForeground: '#0E1A2B',
    secondary: '#20344F',
    secondaryForeground: '#E7F0FF',
    muted: '#20344F',
    mutedForeground: '#A7B8CF',
    accent: '#263F63',
    accentForeground: '#BBD6FF',
    destructive: '#F07070',
    destructiveForeground: '#1A1010',
    border: '#2D4361',
    input: '#415574',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
