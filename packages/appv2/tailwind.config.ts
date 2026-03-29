import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Metropolis'", "var(--font-sans)", "sans-serif"],
        display: ["'Metropolis'", "var(--font-display)", "sans-serif"],
        mono: ["'JetBrains Mono'", "var(--font-mono)", "monospace"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          bright: "hsl(var(--surface-bright))",
          dim: "hsl(var(--surface-dim))",
          low: "hsl(var(--surface-container-low))",
          lowest: "hsl(var(--surface-container-lowest))",
          container: "hsl(var(--surface-container))",
          high: "hsl(var(--surface-container-high))",
          highest: "hsl(var(--surface-container-highest))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          container: "hsl(var(--primary-container))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        tertiary: {
          DEFAULT: "hsl(var(--tertiary))",
          foreground: "hsl(var(--tertiary-foreground))",
        },
        gain: "hsl(var(--gain))",
        loss: "hsl(var(--loss))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        outline: "hsl(var(--outline))",
      },
      boxShadow: {
        glass: "0 8px 32px hsl(var(--primary-foreground) / 0.06)",
        "glass-hover": "0 12px 40px hsl(var(--primary-foreground) / 0.1)",
        ambient: "0 32px 70px hsl(var(--primary-foreground) / 0.08)",
        panel: "0 26px 60px hsl(var(--primary-foreground) / 0.06)",
        slab: "0 8px 24px -8px hsl(var(--primary) / 0.4)",
        "slab-loss": "0 8px 24px -8px hsl(var(--surface-container-high))",
      },
      borderRadius: {
        none: "0",
        lg: "var(--radius)",
        md: "var(--radius)",
        sm: "var(--radius)",
      },
      backgroundImage: {
        "light-leak":
          "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary-container) / 0.09) 45%, transparent 100%)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2.2s ease-in-out infinite",
        shimmer: "shimmer 1.5s linear infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "glass-in": "glass-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": {
            opacity: "0.55",
          },
          "50%": {
            opacity: "1",
          },
        },
        shimmer: {
          "0%": {
            transform: "translateX(-100%)",
          },
          "100%": {
            transform: "translateX(100%)",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
        "slide-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "glass-in": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
