// The product's own Tailwind config (its theme, plugins and variants), scanning the product's source and these screens.
// The product's checkout sits beside this repository (vite.config.ts says where else it may be).
import path from "node:path";
import product from "../../../../npc-client-dashboard/tailwind.config.ts";

const PRODUCT =
  process.env.AURIXA_PRODUCT ?? path.resolve(__dirname, "../../../../npc-client-dashboard");
export default {
  ...product,
  content: [`${PRODUCT}/src/**/*.{ts,tsx}`, path.join(__dirname, "src/**/*.{ts,tsx}")],
};
