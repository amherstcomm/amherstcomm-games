/** @type {import('tailwindcss').Config} */

// Every color resolves through a CSS variable, so the light/dark themes and
// the color-blind palette swap by flipping variables in index.css instead of
// touching thousands of class names. Shade names keep their *role* across
// themes: the low numbers are text on the page, 400/500 are saturated fills.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (hue, shades) =>
  Object.fromEntries(shades.map((s) => [s, v(`${hue}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        white: v('white'),
        black: v('black'),
        // text that sits on a saturated fill — dark in both themes
        ink: v('ink'),
        // semantic text roles, kept readable against the page in both themes
        accent: v('accent'),
        success: v('success'),
        danger: v('danger'),
        slate: scale('slate', [200, 300, 400, 500, 600, 700, 800, 900, 950]),
        amber: scale('amber', [100, 200, 300, 400, 500]),
        emerald: scale('emerald', [100, 200, 300, 400, 500]),
        rose: scale('rose', [100, 200, 300, 400, 500, 950]),
        sky: scale('sky', [100, 200, 300, 400]),
        violet: scale('violet', [100, 200, 300, 400]),
      },
    },
  },
  plugins: [],
};
