// Happy Hour design tokens (Tactile / Playful LIGHT)
export const colors = {
  surface: "#FFFDFB",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#F2EBE5",
  onSurface: "#2D2422",
  onSurfaceSecondary: "#2D2422",
  onSurfaceTertiary: "#544642",
  surfaceInverse: "#2D2422",
  onSurfaceInverse: "#FFFDFB",
  brand: "#FF5A36",
  brandPrimary: "#FF5A36",
  brandSecondary: "#FFA98F",
  brandTertiary: "#FFE3D9",
  onBrandPrimary: "#FFFFFF",
  onBrandTertiary: "#CC3714",
  success: "#05A660",
  warning: "#E59200",
  error: "#E82C2C",
  info: "#2BB8D6",
  border: "#E8DFD8",
  borderStrong: "#D1C4BC",
  divider: "#F2EBE5",
  muted: "#8A7C76",
  black: "#000000",
  white: "#FFFFFF",
  overlay: "rgba(45, 36, 34, 0.55)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const font = {
  display: "System",
  text: "System",
};

export const shadow = {
  card: {
    shadowColor: "#2D2422",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardStrong: {
    shadowColor: "#2D2422",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
};

export const CATEGORY_META: Record<string, { icon: string; color: string; label: string }> = {
  food: { icon: "restaurant", color: "#E82C2C", label: "Food" },
  cafe: { icon: "cafe", color: "#FF8A00", label: "Cafe" },
  bakery: { icon: "pizza", color: "#F5B300", label: "Bakery" },
  grocery: { icon: "leaf", color: "#05A660", label: "Grocery" },
  clothing: { icon: "shirt", color: "#2BB8D6", label: "Clothing" },
  kitchenware: { icon: "cafe", color: "#8B4FEF", label: "Kitchenware" },
};
