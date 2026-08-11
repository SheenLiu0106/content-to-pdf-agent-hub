/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        serif: ["Iowan Old Style", "Baskerville", "Georgia", "Times New Roman", "serif"],
      },
      transitionTimingFunction: {
        // Spring-like easing with real mass — the skill's signature curve.
        spring: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      // Warm-neutral production-workspace palette. The document surfaces are
      // deliberately warmer than the chrome so paper reads as paper.
      // Three distinct colour layers, deliberately not collapsed into one accent:
      //   1. application UI theme  — shell / hair / ink
      //   2. semantic status       — ember (primary action), review, success, alert
      //   3. document brand        — CSS variables, driven by the run's own config
      colors: {
        // 1. application UI theme
        shell: {
          bg: "#ededf0",
          surface: "#fcfcfa",
          pane: "#fafaf8",
          raised: "#ffffff",
          canvas: "#e9e9e7",
          paper: "#fffefa",
        },
        hair: {
          DEFAULT: "rgba(28,29,27,0.085)",
          soft: "rgba(28,29,27,0.055)",
          strong: "rgba(28,29,27,0.14)",
        },
        ink: {
          DEFAULT: "#202120",
          soft: "#5e5f5b",
          mute: "#747572",
          faint: "#a0a09b",
        },

        // 2. semantic status — each keeps its own hue
        ember: {
          DEFAULT: "#f36f3d",
          400: "#ff8355",
          500: "#f36f3d",
          600: "#d95528",
          ink: "#b44f27",
          tint: "#fff7f1",
          tint2: "#fff1e9",
          line: "rgba(243,111,61,0.22)",
        },
        review: {
          DEFAULT: "#a16207",
          ink: "#a16207",
          tint: "#fffbeb",
          line: "#fde68a",
        },
        success: {
          DEFAULT: "#55705e",
          ink: "#55705e",
          tint: "#f3f8f4",
          line: "rgba(85,112,94,0.22)",
        },
        alert: {
          DEFAULT: "#a75158",
          ink: "#a75158",
          tint: "#faeeee",
          line: "rgba(167,81,88,0.26)",
        },
      },
      boxShadow: {
        // Soft, highly diffused ambient shadows — never harsh dark drops.
        soft: "0 24px 60px -28px rgba(15, 23, 42, 0.18)",
        "soft-sm": "0 12px 32px -16px rgba(15, 23, 42, 0.14)",
        "soft-lg": "0 40px 90px -36px rgba(15, 23, 42, 0.22)",
        // Inner top highlight that makes a surface read as physical glass.
        bezel: "inset 0 1px 1px rgba(255, 255, 255, 0.7)",
        // Light skeuomorphic set: a top highlight plus a grounded, low-alpha drop.
        shell: "inset 0 1px 0 rgba(255,255,255,0.96), 0 10px 28px rgba(31,32,29,0.055)",
        raised:
          "inset 0 1px 0 rgba(255,255,255,0.98), 0 8px 22px rgba(35,36,33,0.055), 0 1px 3px rgba(35,36,33,0.045)",
        row: "inset 0 1px 0 rgba(255,255,255,0.92), 0 2px 5px rgba(32,33,30,0.028)",
        control:
          "inset 0 1px 0 rgba(255,255,255,0.98), 0 2px 4px rgba(38,39,35,0.08)",
        "control-ember":
          "inset 0 1px 0 rgba(255,255,255,0.24), 0 4px 10px rgba(217,85,40,0.18)",
        sunken: "inset 0 2px 5px rgba(38,39,35,0.07), inset 0 -1px 0 rgba(255,255,255,0.95)",
        // A printed sheet resting on the recessed canvas.
        paper: "0 18px 45px rgba(42,42,38,0.13), 0 3px 8px rgba(42,42,38,0.06)",
      },
      keyframes: {
        rise: {
          "0%": {
            opacity: "0",
            transform: "translateY(18px)",
            filter: "blur(6px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
            filter: "blur(0)",
          },
        },
        // Lighter, GPU-cheap entry — translate + opacity only. Used for the
        // staggered mount choreography so many elements can animate smoothly
        // at once without blur repaints.
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // Heavy, cinematic fade-up used for hero moments.
        rise: "rise 0.8s cubic-bezier(0.32, 0.72, 0, 1) both",
        // Buttery, restrained ease-out (easeOutQuint) for staggered entry.
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
