/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      transitionTimingFunction: {
        // Spring-like easing with real mass — the skill's signature curve.
        spring: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      boxShadow: {
        // Soft, highly diffused ambient shadows — never harsh dark drops.
        soft: "0 24px 60px -28px rgba(15, 23, 42, 0.18)",
        "soft-sm": "0 12px 32px -16px rgba(15, 23, 42, 0.14)",
        "soft-lg": "0 40px 90px -36px rgba(15, 23, 42, 0.22)",
        // Inner top highlight that makes a surface read as physical glass.
        bezel: "inset 0 1px 1px rgba(255, 255, 255, 0.7)",
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
