/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        "on-primary": "#ffffff",
        secondary: "#10b981",
        surface: "var(--color-surface)",
        background: "var(--color-background)",
        "on-background": "var(--color-on-background)",
        "on-surface": "var(--color-on-surface)",
        outline: "#737686",
        "outline-variant": "var(--color-outline-variant)",
        "surface-container": "var(--color-surface-container)",
        "msg-assistant": "var(--color-msg-assistant)",
        "msg-assistant-border": "var(--color-msg-assistant-border)",
        "msg-user": "#2563eb"
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        full: "9999px"
      },
      fontFamily: {
        "body-lg": ["Inter", "sans-serif"],
        "headline-md": ["Plus Jakarta Sans", "sans-serif"],
        "headline-lg": ["Plus Jakarta Sans", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "chat-bubble": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
