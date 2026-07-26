/**
 * `solid-js/dist/solid.js` is a real, published subpath of solid-js
 * (`"./dist/*"` is in the package's `exports` map) but it ships no declaration
 * file of its own — solid-js only types the bare `"solid-js"` specifier, which
 * under Node resolves to the non-reactive SSR build.
 *
 * This one-liner says: the client build exports the same API as the package
 * root. See the header of `./universal.js` for why the explicit path is needed
 * at all.
 */
declare module "solid-js/dist/solid.js" {
  export * from "solid-js"
}
