# LinkGuard - Click Safety Popup

## How to load (Chrome / Edge)
1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (where `manifest.json` is).
4. Visit any website and click a link — the LinkGuard popup will appear before navigation.

## Notes / Caveats
- This extension uses only heuristics (no remote threat-checking). It's educational/experimental.
- It intercepts left-clicks on anchor tags; some site-specific JS might conflict.
- Add icons in the `icons/` folder or update `manifest.json` with your icon paths.
- To integrate an authoritative threat feed (like Google Safe Browsing), you'll need a server-side component or an API key and extra permissions.
