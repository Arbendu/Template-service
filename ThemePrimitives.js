import { createTheme, alpha } from "@mui/material/styles";

const purple = {
  50: "#EDE8FF",
  100: "#D8CCFF",
  200: "#A28DF0", // light
  300: "#7C63E6",
  400: "#58469f", // main
  500: "#4F30C1",
  600: "#3E2C70", // dark
  700: "#2F2157",
  800: "#241A44",
  900: "#1B1435",
};

const gold = {
  50: "#FFF4CC",
  100: "#FFE580", // light
  200: "#FFD659",
  300: "#FCCC3D",
  400: "#F5C542", // main
  500: "#E6B51F",
  600: "#B48B00", // dark
  700: "#8A6B00",
  800: "#5C4800",
  900: "#3C2F00",
};

const gray = {
  50: "#F7F7F7",
  100: "#EDEDED",
  200: "#E0E0E0",
  300: "#C7C7C7",
  400: "#9E9E9E",
  500: "#6F6F6F",
  600: "#4F4F4F",
  700: "#424242",
  800: "#2E2E2E",
  900: "#1E1E1E",
};

// Semantic aliases for glassmorphism
export const glass = {
  panel: (opacity = 0.25) => `rgba(255,255,255,${opacity})`,
  border: "rgba(255,255,255,0.3)",
  chip: "rgba(255,255,255,0.35)",
  snackbar: "rgba(255,255,255,0.4)",
};

export const glassmorphismBaseStyles = (theme) => ({
  background: "rgba(255, 255, 255, 0.1)", // Semi-transparent white
  backdropFilter: "blur(20px) saturate(180%)", // Frosted glass effect
  WebkitBackdropFilter: "blur(10px) saturate(180%)", // For Safari support
  border: "1px solid rgba(255, 255, 255, 0.125)", // Subtle white border
  boxShadow: theme.shadows[10], // Stronger shadow for depth
  // borderRadius: "12px",
});

const base = createTheme();

export const typography = {
  fontFamily:
    "Poppins, Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  button: { textTransform: "none", fontWeight: 600 },
  h1: { fontWeight: 600, fontSize: "clamp(2rem, 2.4vw, 2.5rem)" },
  h2: { fontWeight: 600, fontSize: "clamp(1.6rem, 1.9vw, 2rem)" },
  h3: { fontWeight: 500, fontSize: base.typography.pxToRem(24) },
  h4: { fontWeight: 500, fontSize: base.typography.pxToRem(20) },
  h5: { fontWeight: 500, fontSize: base.typography.pxToRem(16) },
  body1: { fontSize: base.typography.pxToRem(16) },
  body2: { fontSize: base.typography.pxToRem(14) },
};

export const shape = { borderRadius: 12 };

// Use CSS variables color schemes (MUI v7) like your other project. ?filecite?turn0file0?
export const colorSchemes = {
  light: {
    palette: {
      mode: "light",
      primary: {
        light: purple[200],
        main: purple[400],
        dark: purple[600],
        contrastText: "#fff",
      },
      secondary: {
        light: gold[100],
        main: gold[400],
        dark: gold[600],
        contrastText: gray[900],
      },
      success: {
        light: "#81C784",
        main: "#006304",
        dark: "#2E7D32",
        contrastText: "#fff",
      },
      warning: {
        light: "#ffcb95",
        main: "#F57C00",
        dark: "#E65100",
        contrastText: "#fff",
      },
      error: {
        light: "#EF5350",
        main: "#9f0400",
        dark: "#B71C1C",
        contrastText: "#fff",
      },
      info: {
        light: "#64B5F6",
        main: "#2196F3",
        dark: "#1565C0",
        contrastText: "#fff",
      },
      // spacing: {
      //  marginTop:"10px"
      // },

      grey: { ...gray },
      purple: { ...purple },
      divider: alpha(purple[400], 0.2),
      background: {
        default: glass.panel(0.25),
        paper: glass.panel(0.25),
        glass: glass.panel(0.18),
      },
      text: { primary: "#402b7f", secondary: "#3E2C70", disabled: gray[400] },
      baseShadow: "0 8px 25px rgba(0,0,0,0.1)",
    },
  },
  dark: {
    palette: {
      mode: "dark",
      primary: {
        light: purple[300],
        main: purple[400],
        dark: purple[700],
        contrastText: "#fff",
      },
      secondary: {
        light: alpha(gold[100], 0.9),
        main: gold[400],
        dark: gold[700],
        contrastText: "#000",
      },
      success: {
        light: "#66BB6A",
        main: "#006304",
        dark: "#1B5E20",
        contrastText: "#fff",
      },
      warning: {
        light: "#FFA726",
        main: "#F57C00",
        dark: "#E65100",
        contrastText: "#fff",
      },
      error: {
        light: "#EF5350",
        main: "#9f0400",
        dark: "#B71C1C",
        contrastText: "#fff",
      },
      info: {
        light: "#64B5F6",
        main: "#2196F3",
        dark: "#1565C0",
        contrastText: "#fff",
      },
      grey: { ...gray },
      purple: { ...purple },
      divider: alpha(gray[700], 0.5),
      background: {
        default: "#0E0E12",
        paper: alpha("#0E0E12", 0.8),
        glass: alpha("#0E0E12", 0.5),
      },
      text: {
        primary: "#F5F6FA",
        secondary: alpha("#F5F6FA", 0.7),
        disabled: alpha("#F5F6FA", 0.4),
      },
      baseShadow: "0 8px 40px rgba(0,0,0,0.35)",
    },
  },
};

// Shadows: keep default but use palette.baseShadow for level 1 like your prior approach
const defaultTheme = createTheme();
export const shadows = [
  "none",
  "var(--template-palette-baseShadow)",
  ...defaultTheme.shadows.slice(2),
];
