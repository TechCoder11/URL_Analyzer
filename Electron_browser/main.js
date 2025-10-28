const { app, BrowserWindow, session, dialog, ipcMain } = require('electron');
const path = require('path');

async function createWindow() {
  // Force direct connection (avoids proxy / network switch issues)
  await session.defaultSession.setProxy({ mode: 'direct' });

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true, // enables <webview>
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools(); // Uncomment if needed
}

// ✅ Handle dynamic extension loading
ipcMain.handle('load-extension', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select Chrome Extension Folder',
    properties: ['openDirectory'],
  });

  if (canceled || !filePaths.length) {
    return { success: false, message: 'No folder selected.' };
  }

  const extPath = filePaths[0];
  try {
    const ext = await session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
    console.log('Extension loaded:', ext.name);
    return { success: true, name: ext.name };
  } catch (err) {
    console.error('Failed to load extension:', err);
    return { success: false, message: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
