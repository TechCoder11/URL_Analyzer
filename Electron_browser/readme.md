

/* README.md (brief run instructions)


1. Prereqs: Node.js (16+ recommended)
2. Save files above into a folder (e.g. electron-browser)
3. In the folder run:
npm install
npm start


4. Use the app menu: File → Load Unpacked Extension → select the folder that contains your extension's manifest.json
(Select the folder that directly contains manifest.json)


Notes:
- Extensions are loaded into Electron's persistent session. They are not automatically remembered across app restarts. To persist across restarts, you can store selected extension paths and call session.loadExtension on startup.
- Some Chrome extension APIs (especially some MV3 service-worker APIs) may have partial support depending on your Electron version. If an extension relies heavily on chrome.* APIs that Electron doesn't implement, it may not function fully.


*/