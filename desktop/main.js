'use strict';
// 启笔 · 独立桌面应用（Electron 主进程）
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;

  function freePort() {
    return new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = s.address().port;
        s.close(() => resolve(p));
      });
      s.on('error', () => resolve(9300));
    });
  }

  function setAppMenu() {
    // 隐藏的菜单栏仍提供编辑快捷键（Ctrl+C/V/X/A/Z 等）
    const menu = Menu.buildFromTemplate([
      {
        label: '编辑', submenu: [
          { label: '撤销', role: 'undo' },
          { label: '重做', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', role: 'cut' },
          { label: '复制', role: 'copy' },
          { label: '粘贴', role: 'paste' },
          { label: '全选', role: 'selectAll' }
        ]
      },
      {
        label: '视图', submenu: [
          { label: '重新加载', role: 'reload' },
          { label: '实际大小', role: 'resetZoom' },
          { label: '放大', role: 'zoomIn' },
          { label: '缩小', role: 'zoomOut' },
          { type: 'separator' },
          { label: '全屏', role: 'togglefullscreen' }
        ]
      }
    ]);
    Menu.setApplicationMenu(menu);
  }

  async function createWindow() {
    const userData = app.getPath('userData');
    const dataDir = path.join(userData, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.QIBI_DATA_DIR = dataDir;

    // 首次运行放一份配置样例
    try {
      const sample = path.join(__dirname, '..', 'config.sample.json');
      const dst = path.join(dataDir, 'config.sample.json');
      if (fs.existsSync(sample) && !fs.existsSync(dst)) fs.copyFileSync(sample, dst);
    } catch (e) { }

    const port = await freePort();
    process.env.QIBI_PORT = String(port);

    // 启动内置本地服务（同一进程）
    try {
      require(path.join(__dirname, '..', 'qibi-server.cjs'));
    } catch (e) {
      dialog.showErrorBox('启笔启动失败', String(e && e.message || e));
      app.quit();
      return;
    }

    win = new BrowserWindow({
      width: 1480,
      height: 920,
      minWidth: 1080,
      minHeight: 680,
      backgroundColor: '#0c0e12',
      title: '启笔',
      autoHideMenuBar: true,
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0b0d10', symbolColor: '#e8e4da', height: 33 },
      icon: path.join(__dirname, '..', 'app-icon.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    });
    win.setMenuBarVisibility(false);

    // 右键菜单：选中文字后可复制；输入框/正文编辑区可剪切、粘贴
    win.webContents.on('context-menu', (e, params) => {
      const items = [];
      if ((params.selectionText || '').trim()) {
        items.push({ label: '复制', role: 'copy' });
      }
      if (params.isEditable) {
        if (params.editFlags.canCut) items.push({ label: '剪切', role: 'cut' });
        if (params.editFlags.canPaste) items.push({ label: '粘贴', role: 'paste' });
      }
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: '全选', role: 'selectAll' });
      Menu.buildFromTemplate(items).popup({ window: win });
    });

    const url = 'http://127.0.0.1:' + port + '/ai-novel-editor-home.html';
    let tries = 0;
    const load = () => {
      win.loadURL(url).catch(() => {
        if (++tries < 40) setTimeout(load, 300);
        else dialog.showErrorBox('启笔启动失败', '本地服务未能就绪：' + url);
      });
    };
    win.once('ready-to-show', () => win.show());
    setTimeout(load, 350);

    // 外部链接交给系统浏览器
    win.webContents.setWindowOpenHandler(({ url: u }) => {
      if (/^https?:/i.test(u)) shell.openExternal(u);
      return { action: 'deny' };
    });
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS('.appbar{-webkit-app-region:drag;padding-right:150px !important}.appbar button,.appbar input,.appbar a,.appbar select,.appbar .search,.appbar .streak{-webkit-app-region:no-drag}');
    });
    win.webContents.on('will-navigate', (e, u) => {
      if (!/^http:\/\/127\.0\.0\.1:/i.test(u)) {
        e.preventDefault();
        shell.openExternal(u);
      }
    });

    win.on('closed', () => { win = null; });
  }

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => { setAppMenu(); return createWindow(); }).catch((e) => {
    dialog.showErrorBox('启笔启动失败', String(e && e.stack || e));
    app.quit();
  });

  app.on('window-all-closed', () => { app.quit(); });
}
