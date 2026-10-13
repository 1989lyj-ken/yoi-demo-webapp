/** Stylesheets imported for their side effect (Vite bundles them); FSD-08A-1 loads Leaflet's CSS on demand. */
declare module "*.css";

/** Images imported for their URL (Vite copies them to dist/assets); FSD-08A-2 home mock. */
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.jpg" {
  const url: string;
  export default url;
}
