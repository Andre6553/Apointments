/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                heading: ['Outfit', 'sans-serif'],
            },
            colors: {
                primary: {
                    DEFAULT: "#6366f1", // indigo-500
                    foreground: "#ffffff",
                },
                secondary: {
                    DEFAULT: "#06b6d4", // cyan-500
                    foreground: "#ffffff",
                },
                accent: {
                    DEFAULT: "#f59e0b", // amber-500
                    foreground: "#ffffff",
                },
                background: "#0f172a", // slate-900 essentially, deep blue-grey
                surface: "#1e293b", // slate-800
                card: "rgba(30, 41, 59, 0.7)",
            },
            backdropBlur: {
                xs: '2px',
            },
            boxShadow: {
                'glow': '0 0 20px -5px rgba(99, 102, 241, 0.4)',
                'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            }
        },
    },
    plugins: [],
}
