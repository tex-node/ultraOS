// G.19 Part XXX: found via visual QA - globals.css sets `body { background: var(--background) }`
// (an opaque dark color) for the whole app, including these browser-source routes. Each graphic
// page's own root div already used `bg-transparent`, but that div is only as large as its
// content (inline-flex) - the surrounding <body>, which fills whatever capture region an OBS/
// vMix Browser Source is given, stayed opaque dark underneath it. This overrides just the body
// background back to transparent for a page that renders it, without touching the rest of the
// app's dark theme (every other page keeps the normal opaque background).
export function TransparentBody() {
  return <style>{"body{background:transparent!important}"}</style>;
}
