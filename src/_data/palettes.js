/*
 * The accent palette source of truth.
 *
 * Keep the roles semantic: a game or component should ask for `primary` or
 * `danger`, never for a hue such as "blue". The generated stylesheet and the
 * /design/ guide both consume this file.
 */

const foundation = {
  success: { light: "#2f7d4a", dark: "#79d69a" },
  warning: { light: "#8a5a13", dark: "#f0c273" },
  danger: { light: "#a43d35", dark: "#ff8a80" },
  info: { light: "#315fba", dark: "#8fb9ff" },
};

const makeSwatches = (theme) => [
  { role: "background", label: "Canvas", hex: theme.background, ink: theme.ink },
  { role: "surface", label: "Surface", hex: theme.surface, ink: theme.ink },
  { role: "surface-soft", label: "Soft", hex: theme.surfaceSoft, ink: theme.ink },
  { role: "surface-sunken", label: "Sunken", hex: theme.surfaceSunken, ink: theme.ink },
  { role: "ink", label: "Ink", hex: theme.ink, ink: theme.background },
  { role: "muted", label: "Muted", hex: theme.muted, ink: theme.background },
  { role: "border", label: "Rule", hex: theme.border, ink: theme.ink },
  { role: "border-strong", label: "Strong rule", hex: theme.borderStrong, ink: theme.ink },
  { role: "primary", label: "Primary", hex: theme.primary, ink: theme.onPrimary },
  { role: "primary-strong", label: "Primary strong", hex: theme.primaryStrong, ink: theme.onPrimary },
  { role: "secondary", label: "Secondary", hex: theme.secondary, ink: theme.onSecondary },
  { role: "secondary-strong", label: "Secondary strong", hex: theme.secondaryStrong, ink: theme.onSecondary },
  { role: "success", label: "Success", hex: theme.success, ink: theme.onStatus },
  { role: "warning", label: "Warning", hex: theme.warning, ink: theme.onStatus },
  { role: "danger", label: "Danger", hex: theme.danger, ink: theme.onStatus },
  { role: "info", label: "Info", hex: theme.info, ink: theme.onStatus },
];

const palette = (details) => {
  const light = {
    ...details.light,
    success: foundation.success.light,
    warning: foundation.warning.light,
    danger: foundation.danger.light,
    info: foundation.info.light,
    onStatus: "#ffffff",
  };
  const dark = {
    ...details.dark,
    success: foundation.success.dark,
    warning: foundation.warning.dark,
    danger: foundation.danger.dark,
    info: foundation.info.dark,
    onStatus: "#111111",
  };
  light.swatches = makeSwatches(light);
  dark.swatches = makeSwatches(dark);
  return {
    ...details,
    light,
    dark,
    themes: [
      { id: "light", label: "Light field", note: "paper, ink, and daylight" , values: light },
      { id: "dark", label: "Dark field", note: "ink, glow, and night" , values: dark },
    ],
  };
};

module.exports = [
  palette({
    id: "indigo",
    name: "Indigo Signal",
    shortName: "Indigo",
    descriptor: "Clear, analytical, and quietly electric.",
    mood: "The default working palette: precise enough for notes, bright enough for ideas.",
    bestFor: "The main blog, technical writing, dashboards, and general-purpose tools.",
    light: {
      background: "#fafafa", surface: "#ffffff", surfaceSoft: "#f4f5f8", surfaceSunken: "#eceff4",
      ink: "#302b2a", muted: "#586f87", subtle: "#8392a4", border: "#d5dbe4", borderStrong: "#9aa8bb",
      primary: "#315fba", primaryStrong: "#244a91", secondary: "#6f4aa8", secondaryStrong: "#583783",
      internal: "#315fba", external: "#6f4aa8", onPrimary: "#ffffff", onSecondary: "#ffffff",
    },
    dark: {
      background: "#1a1a1a", surface: "#232323", surfaceSoft: "#202329", surfaceSunken: "#111317",
      ink: "#f0e6dc", muted: "#96a3b5", subtle: "#6e7a8f", border: "#3a424f", borderStrong: "#68778c",
      primary: "#8fb9ff", primaryStrong: "#b2ceff", secondary: "#c5a3ff", secondaryStrong: "#ded2ff",
      internal: "#8fb9ff", external: "#c5a3ff", onPrimary: "#111522", onSecondary: "#16121f",
    },
  }),
  palette({
    id: "forest",
    name: "Forest Study",
    shortName: "Forest",
    descriptor: "Grounded, patient, and observant.",
    mood: "A reading-room green with a warm pencil mark for emphasis.",
    bestFor: "Long essays, learning tools, planning interfaces, and calm progress systems.",
    light: {
      background: "#fafbf8", surface: "#ffffff", surfaceSoft: "#f0f5ef", surfaceSunken: "#e7eee5",
      ink: "#293229", muted: "#4d6350", subtle: "#728676", border: "#cfdacf", borderStrong: "#8fa38e",
      primary: "#2e7d32", primaryStrong: "#1b5e20", secondary: "#8a5a13", secondaryStrong: "#6c450d",
      internal: "#2e7d32", external: "#8a5a13", onPrimary: "#ffffff", onSecondary: "#ffffff",
    },
    dark: {
      background: "#171c18", surface: "#202820", surfaceSoft: "#1c241d", surfaceSunken: "#0f140f",
      ink: "#e8f0e4", muted: "#7a9574", subtle: "#607760", border: "#354639", borderStrong: "#657c65",
      primary: "#9ecb70", primaryStrong: "#b8e18b", secondary: "#e5c07b", secondaryStrong: "#f0d69f",
      internal: "#9ecb70", external: "#e5c07b", onPrimary: "#132014", onSecondary: "#211b10",
    },
  }),
  palette({
    id: "amber",
    name: "Amber Workshop",
    shortName: "Amber",
    descriptor: "Warm, tactile, and a little combustible.",
    mood: "The feeling of a desk lamp, a marked-up paper, and an idea that wants to ship.",
    bestFor: "Making, prototyping, personal utilities, and playful game interfaces.",
    light: {
      background: "#fcfaf7", surface: "#ffffff", surfaceSoft: "#f7f1e9", surfaceSunken: "#f0e7dc",
      ink: "#3a2a1f", muted: "#6d5644", subtle: "#8f7c6a", border: "#e0d3c5", borderStrong: "#b69f88",
      primary: "#8a5a13", primaryStrong: "#6b450c", secondary: "#943f35", secondaryStrong: "#76312a",
      internal: "#8a5a13", external: "#943f35", onPrimary: "#ffffff", onSecondary: "#ffffff",
    },
    dark: {
      background: "#201b17", surface: "#2a241e", surfaceSoft: "#27201a", surfaceSunken: "#15110e",
      ink: "#f1e5d7", muted: "#a89472", subtle: "#87785f", border: "#4e4234", borderStrong: "#81715b",
      primary: "#e5c07b", primaryStrong: "#f0d69f", secondary: "#e58f6a", secondaryStrong: "#f2ac8e",
      internal: "#e5c07b", external: "#e58f6a", onPrimary: "#21190e", onSecondary: "#28130f",
    },
  }),
  palette({
    id: "rose",
    name: "Rose Current",
    shortName: "Rose",
    descriptor: "Human, expressive, and gently defiant.",
    mood: "A strong editorial red softened by a violet counterpoint.",
    bestFor: "Personal writing, collections, social features, and experiences with a point of view.",
    light: {
      background: "#fcf9fa", surface: "#ffffff", surfaceSoft: "#f8eff1", surfaceSunken: "#f1e4e7",
      ink: "#382b2d", muted: "#7d5758", subtle: "#9b7b7d", border: "#e2d1d5", borderStrong: "#b9999f",
      primary: "#a23b43", primaryStrong: "#822d35", secondary: "#6e4f9b", secondaryStrong: "#563b7b",
      internal: "#a23b43", external: "#6e4f9b", onPrimary: "#ffffff", onSecondary: "#ffffff",
    },
    dark: {
      background: "#21191d", surface: "#2b2025", surfaceSoft: "#281d23", surfaceSunken: "#160f13",
      ink: "#f4e7ea", muted: "#b0888d", subtle: "#8d6d75", border: "#503941", borderStrong: "#82616b",
      primary: "#e88991", primaryStrong: "#f4afb4", secondary: "#c7a8ee", secondaryStrong: "#dfc9fa",
      internal: "#e88991", external: "#c7a8ee", onPrimary: "#281417", onSecondary: "#1d1625",
    },
  }),
  palette({
    id: "teal",
    name: "Teal Circuit",
    shortName: "Teal",
    descriptor: "Fresh, capable, and slightly futuristic.",
    mood: "A cool interface color that still feels handmade rather than corporate.",
    bestFor: "Interactive tools, data views, experiments, and responsive game systems.",
    light: {
      background: "#f8fbfb", surface: "#ffffff", surfaceSoft: "#edf6f5", surfaceSunken: "#e1efee",
      ink: "#253334", muted: "#3a6866", subtle: "#6f9290", border: "#c8dddb", borderStrong: "#8baead",
      primary: "#007a78", primaryStrong: "#005b5a", secondary: "#4964a8", secondaryStrong: "#374f8a",
      internal: "#007a78", external: "#4964a8", onPrimary: "#ffffff", onSecondary: "#ffffff",
    },
    dark: {
      background: "#14201f", surface: "#1c2b29", surfaceSoft: "#192724", surfaceSunken: "#0b1413",
      ink: "#e2f1ef", muted: "#5f948e", subtle: "#48736e", border: "#2f4c49", borderStrong: "#5d8782",
      primary: "#64d3c8", primaryStrong: "#91e4db", secondary: "#8fb9ff", secondaryStrong: "#b6d1ff",
      internal: "#64d3c8", external: "#8fb9ff", onPrimary: "#10201e", onSecondary: "#141c2b",
    },
  }),
  palette({
    id: "purple",
    name: "Purple Static",
    shortName: "Purple",
    descriptor: "Imaginative, synthetic, and deliberately off-center.",
    mood: "A playful violet-pink pairing for the moments when the system should feel more like a world.",
    bestFor: "Games, creative experiments, generative projects, and exploratory pages.",
    light: {
      background: "#fbf9fd", surface: "#ffffff", surfaceSoft: "#f5effa", surfaceSunken: "#ece2f4",
      ink: "#302936", muted: "#6e6288", subtle: "#9188a8", border: "#dacee5", borderStrong: "#aa97bd",
      primary: "#6f45b5", primaryStrong: "#58348f", secondary: "#a23b6a", secondaryStrong: "#812b54",
      internal: "#6f45b5", external: "#a23b6a", onPrimary: "#ffffff", onSecondary: "#ffffff",
    },
    dark: {
      background: "#1c1822", surface: "#27202e", surfaceSoft: "#241d2a", surfaceSunken: "#120e17",
      ink: "#eee7f5", muted: "#a894c4", subtle: "#806e9e", border: "#493b55", borderStrong: "#766184",
      primary: "#c792ea", primaryStrong: "#dfbafa", secondary: "#ef9bc2", secondaryStrong: "#fac1d9",
      internal: "#c792ea", external: "#ef9bc2", onPrimary: "#1d1326", onSecondary: "#26131d",
    },
  }),
];
