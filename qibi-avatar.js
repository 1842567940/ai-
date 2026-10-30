/* 启笔 · 全站左下角用户头像同步（本机 localStorage，不上传） */
(function () {
  var KEY = 'qibi.user.avatar';
  var CSS = '.rail-avatar.is-set{border-style:solid;border-color:transparent;padding:0;overflow:hidden}'
    + '.rail-avatar img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.rail-avatar{cursor:pointer;padding:0}';
  function read() {
    var src = '';
    try { src = localStorage.getItem(KEY) || ''; } catch (e) { }
    if (!src) {
      // 旧版本把头像存在设置对象里，首次读取时迁移到统一 key
      try {
        var a = JSON.parse(localStorage.getItem('qibi.settings.ui') || '{}');
        if (a && a.avatar) src = a.avatar;
      } catch (e) { }
      if (!src) {
        try {
          var b = JSON.parse(localStorage.getItem('qibi.settings.state') || '{}');
          if (b && b.avatar) src = b.avatar;
        } catch (e) { }
      }
      if (src) { try { localStorage.setItem(KEY, src); } catch (e) { } }
    }
    return src;
  }
  function paint() {
    var src = read();
    var nodes = document.querySelectorAll('.rail-avatar');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.__qibiDefault) n.__qibiDefault = n.innerHTML;
      if (src) {
        n.innerHTML = '<img src="' + src.replace(/"/g, '&quot;') + '" alt="我的头像">';
        n.classList.add('is-set');
        n.title = '我的头像';
        if (n.getAttribute('aria-hidden') === 'true') n.removeAttribute('aria-hidden');
      } else {
        if (n.querySelector('img')) n.innerHTML = n.__qibiDefault;
        n.classList.remove('is-set');
        n.title = '未设置头像 · 点击更换';
      }
    }
  }
  function set(src) {
    try {
      if (src) localStorage.setItem(KEY, src);
      else localStorage.removeItem(KEY);
    } catch (e) { }
    if (!src) {
      // 移除头像时同步清掉两个设置对象里的旧值，避免回读时“复活”
      ['qibi.settings.ui', 'qibi.settings.state'].forEach(function (k) {
        try {
          var o = JSON.parse(localStorage.getItem(k) || 'null');
          if (o && typeof o === 'object' && o.avatar) {
            o.avatar = '';
            localStorage.setItem(k, JSON.stringify(o));
          }
        } catch (e) { }
      });
    }
    paint();
  }
  function css() {
    if (document.getElementById('qibi-avatar-css')) return;
    var s = document.createElement('style');
    s.id = 'qibi-avatar-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  window.QibiAvatar = { paint: paint, set: set, key: KEY };
  window.addEventListener('storage', function (e) { if (e.key === KEY) paint(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { css(); paint(); });
  } else { css(); paint(); }
  // 设置页里保存头像后，其它页面立刻跟随
  setTimeout(paint, 300);
})();
