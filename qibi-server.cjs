'use strict';
// 启笔后端：本地数据 + AI（DeepSeek）
// 端口默认 9300（可用 QIBI_PORT 或 data/config.json 覆盖）；数据存 data/db.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA_DIR = process.env.QIBI_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
let CONFIG = {};
try { CONFIG = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8')); } catch { }
const PORT = parseInt(process.env.QIBI_PORT || CONFIG.port, 10) || 9300;
function normDsModel(m) {
  if (!m) return '';
  if (m === 'deepseek-v4-pro') return 'deepseek-v4-pro';
  if (String(m).indexOf('deepseek') === 0) return 'deepseek-flash';
  return '';
}
function dsCfg() {
  const s = (typeof DB !== 'undefined' && DB.settings) || {};
  return {
    base: String(s.baseUrl || CONFIG.deepseekBase || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    key: s.apiKey || CONFIG.deepseekKey || process.env.DEEPSEEK_API_KEY || '',
    model: normDsModel(s.model) || CONFIG.deepseekModel || 'deepseek-flash'
  };
}
function qwenCfg() {
  const s = (typeof DB !== 'undefined' && DB.settings) || {};
  let base = s.imgBase || CONFIG.qwenBase || process.env.QWEN_BASE_URL || '';
  let key = s.imgKey || CONFIG.qwenKey || process.env.QWEN_API_KEY || '';
  return { base: base || 'https://maas.qianwenaiapi.com/compatible-mode/v1', key: key, model: (s.imgModel && String(s.imgModel).indexOf('qwen-image') === 0) ? s.imgModel : (CONFIG.qwenModel || 'qwen-image-3.0-pro') };
}
function pyBin() {
  const cands = [process.env.QIBI_PYTHON, path.join(ROOT, 'tts-venv', 'Scripts', 'python.exe'), path.join(ROOT, 'runtime', 'python', 'python.exe')];
  for (const p of cands) { if (p && fs.existsSync(p)) return p; }
  return 'python';
}
// 无 Python 时的程序化声景兜底（纯 Node 合成 WAV）
function jsSfx(scene, mood, seconds, outPath) {
  const SR = 22050;
  const sec = Math.max(5, Math.min(45, Math.round(seconds || 20)));
  const n = SR * sec;
  const mix = new Float64Array(n);
  const layers = [];
  const rnd = Math.random;
  const text = String(scene || '') + ' ' + String(mood || '');
  const hit = (arr) => arr.some((k) => text.indexOf(k) >= 0);
  function noiseLayer(alpha, gain) { let v = 0; for (let i = 0; i < n; i++) { v += alpha * ((rnd() * 2 - 1) - v); mix[i] += v * gain; } }
  function sineLayer(freq, gain, decay) { for (let i = 0; i < n; i++) mix[i] += Math.sin(2 * Math.PI * freq * i / SR) * gain * Math.exp(-i / (SR * (decay || 3))); }
  if (hit(['雨', 'rain', '湿', '淅沥'])) {
    layers.push('雨'); noiseLayer(0.10, 0.35);
    const drops = Math.floor(sec * 7);
    for (let k = 0; k < drops; k++) {
      const pos = Math.floor(rnd() * Math.max(1, n - 4000)), f = 900 + rnd() * 1500, len = 600 + Math.floor(rnd() * 1600), amp = 0.05 + rnd() * 0.11;
      for (let i = 0; i < len && pos + i < n; i++) mix[pos + i] += Math.sin(2 * Math.PI * f * i / SR) * amp * Math.exp(-i / (len * 0.28));
    }
  }
  if (hit(['风', 'wind', '山', '荒野', '吹'])) {
    layers.push('风');
    let v = 0;
    for (let i = 0; i < n; i++) { v += 0.015 * ((rnd() * 2 - 1) - v); const t = i / SR; mix[i] += v * 0.55 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.06 * t + 1.3)); }
  }
  if (hit(['夜', '虫', '静', 'night', '月'])) {
    layers.push('夜虫');
    const chirps = Math.floor(sec * 1.6);
    for (let k = 0; k < chirps; k++) {
      const pos = Math.floor(rnd() * Math.max(1, n - 8000)), f = 3200 + rnd() * 1400, len = 1200 + Math.floor(rnd() * 2000), amp = 0.02 + rnd() * 0.03;
      for (let i = 0; i < len && pos + i < n; i++) mix[pos + i] += Math.sin(2 * Math.PI * f * i / SR) * amp * Math.sin(Math.PI * i / len);
    }
    noiseLayer(0.02, 0.05);
  }
  if (hit(['火', '炉', '篝火', '柴', '烧'])) {
    layers.push('火');
    noiseLayer(0.06, 0.08);
    const cracks = Math.floor(sec * 9);
    for (let k = 0; k < cracks; k++) {
      const pos = Math.floor(rnd() * Math.max(1, n - 1500)), len = 200 + Math.floor(rnd() * 700), amp = 0.08 + rnd() * 0.22;
      for (let i = 0; i < len && pos + i < n; i++) mix[pos + i] += (rnd() * 2 - 1) * amp * Math.exp(-i / (len * 0.18));
    }
  }
  if (hit(['钟', '寺', '庙', 'bell', '古刹'])) {
    layers.push('钟');
    for (let t = 0; t < n; t += Math.floor(SR * 5.5)) {
      const ln = Math.min(Math.floor(SR * 4.5), n - t);
      for (let i = 0; i < ln; i++) {
        const e = Math.exp(-i / (SR * 1.2));
        mix[t + i] += (Math.sin(2 * Math.PI * 220 * i / SR) * 0.22 + Math.sin(2 * Math.PI * 440 * i / SR) * 0.12 + Math.sin(2 * Math.PI * 660 * i / SR) * 0.05) * e;
      }
    }
  }
  if (hit(['战', '鼓', '杀', '军', 'battle', '打'])) {
    layers.push('战鼓');
    let k = 0;
    for (let t = 0; t < n; t += Math.floor(SR * 0.72)) {
      const ln = Math.min(Math.floor(SR * 0.5), n - t), f = k % 2 === 0 ? 48 : 62;
      for (let i = 0; i < ln; i++) mix[t + i] += (Math.sin(2 * Math.PI * f * i / SR) * 0.5 + (rnd() * 2 - 1) * 0.12) * Math.exp(-i / (SR * 0.09));
      k++;
    }
  }
  if (hit(['海', '浪', '潮', 'sea', '水边', '渡口'])) {
    layers.push('海浪');
    let v = 0;
    for (let i = 0; i < n; i++) { v += 0.02 * ((rnd() * 2 - 1) - v); const t = i / SR; mix[i] += v * 0.9 * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.11 * t - 1))); }
  }
  if (hit(['街', '市', '集', '人声', '酒楼', '茶馆'])) {
    layers.push('市声');
    let v = 0, w = 0;
    for (let i = 0; i < n; i++) { v += 0.2 * ((rnd() * 2 - 1) - v); w += 0.02 * (v - w); const t = i / SR; mix[i] += (v - w) * 0.3 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.23 * t) * Math.sin(2 * Math.PI * 0.07 * t + 0.5)); }
  }
  if (hit(['屋', '室内', '房', '客栈', 'room'])) {
    layers.push('室内');
    noiseLayer(0.01, 0.05);
    sineLayer(60, 0.02, 9999); sineLayer(120, 0.008, 9999);
  }
  if (!layers.length) {
    layers.push('空灵底色');
    noiseLayer(0.008, 0.05);
    sineLayer(110, 0.06, 9999); sineLayer(164.8, 0.045, 9999); sineLayer(220, 0.02, 9999);
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const g = 0.88 / peak;
  const buf = Buffer.alloc(n * 2);
  const fadeN = Math.min(Math.floor(SR * Math.min(0.8, sec * 0.1)), Math.floor(n / 2));
  for (let i = 0; i < n; i++) {
    let v = Math.tanh(mix[i] * g * 1.2);
    if (i < fadeN) v *= i / Math.max(1, fadeN);
    if (i > n - fadeN) v *= (n - i) / Math.max(1, fadeN);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + n * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(outPath, Buffer.concat([header, buf]));
  return { layers, duration: sec };
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

fs.mkdirSync(DATA_DIR, { recursive: true });
let DB = { projects: [], settings: {} };
try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { }
DB.writelogs = Array.isArray(DB.writelogs) ? DB.writelogs : [];
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(DB)); }
const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();
function wc(s) { return (s || '').replace(/<[^>]*>/g, '').replace(/\s/g, '').length; }
function projWords(p) { return p.chapters.reduce((a, c) => a + wc(c.content), 0); }
function logWrite(p, prev, cur) {
  if (prev === cur) return;
  DB.writelogs.push({ t: Date.now(), pid: p.id, delta: cur - prev });
  if (DB.writelogs.length > 20000) DB.writelogs.splice(0, DB.writelogs.length - 20000);
}
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
function dateKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

function findProject(id) { return DB.projects.find((p) => p.id === id); }
function publicProject(p, full) {
  if (full) return p;
  return { id: p.id, title: p.title, author: p.author, cover: p.cover, mode: p.mode, genre: p.genre, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt, words: p.chapters.reduce((a, c) => a + wc(c.content), 0), chapters: p.chapters.length };
}
function ensureProject(body) {
  const p = {
    id: uid('bk'), title: body.title || '未命名作品', author: body.author || '', cover: body.cover || '',
    intro: body.intro || '',
    mode: body.mode || '自由创作', genre: body.genre || '', status: 'draft',
    createdAt: now(), updatedAt: now(),
    volumes: [{ id: uid('vol'), title: '第一卷' }],
    chapters: [], characters: [], lore: [], materials: [], notes: [],
    memory: null
  };
  p.chapters.push({ id: uid('ch'), volumeId: p.volumes[0].id, title: '第一章 · 未命名', content: '', updatedAt: now() });
  DB.projects.push(p); save(); return p;
}
function ensureMemory(p) {
  if (!p.memory || typeof p.memory !== 'object') p.memory = {};
  const m = p.memory;
  if (typeof m.book !== 'string') m.book = '';
  if (!Array.isArray(m.volumes)) m.volumes = [];
  if (!m.chapters || typeof m.chapters !== 'object') m.chapters = {};
  if (!Array.isArray(m.characters)) m.characters = [];
  if (!Array.isArray(m.lore)) m.lore = [];
  if (!Array.isArray(m.threads)) m.threads = [];
  if (!m.levels || typeof m.levels !== 'object') m.levels = { L1: {}, L2: [], L3: [], L4: [], L5: '' };
  if (!m.levels.L1 || typeof m.levels.L1 !== 'object') m.levels.L1 = {};
  if (!Array.isArray(m.levels.L2)) m.levels.L2 = [];
  if (!Array.isArray(m.levels.L3)) m.levels.L3 = [];
  if (!Array.isArray(m.levels.L4)) m.levels.L4 = [];
  if (typeof m.levels.L5 !== 'string') m.levels.L5 = '';
  if (!Array.isArray(m.entities)) m.entities = [];
  if (!m.canon || typeof m.canon !== 'object') m.canon = {};
  if (!Array.isArray(m.canon.facts)) m.canon.facts = [];
  if (!Array.isArray(m.canon.promises)) m.canon.promises = [];
  if (!m.state || typeof m.state !== 'object') m.state = { time: '', place: '', protagonist: '', items: [], injuries: [], openQuestions: [] };
  // 起笔页/人物页写入的项目设定，作为记忆的初始内容
  if (!m.characters.length && Array.isArray(p.characters)) {
    m.characters = p.characters.map((c) => ({
      name: c.name || '未命名', aliases: [], role: c.role || '', traits: c.traits || '', goal: c.goal || '',
      voice: c.voice || '', relations: c.relations || '', status: c.status || '', desc: c.desc || '', lastChapter: ''
    }));
  }
  if (!m.lore.length && Array.isArray(p.lore)) {
    m.lore = p.lore.map((l) => ({ name: l.name || '设定', detail: l.content || l.detail || l.desc || '' }));
  }
  return m;
}
const plain = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
function bigrams(s) {
  const out = new Set();
  const t = String(s || '').replace(/[^一-龥a-zA-Z0-9]/g, '');
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function ctxScore(text, grams) {
  let n = 0;
  grams.forEach((g) => { if (text.indexOf(g) >= 0) n++; });
  return n;
}
function buildContext(p, chapterId) {
  const m = ensureMemory(p);
  const parts = [];
  const bookSum = (m.levels && m.levels.L5) || m.book;
  if (bookSum) parts.push('【全书梗概】' + bookSum);
  if (p.intro) parts.push('【作品简介】' + String(p.intro).slice(0, 600));
  const outlineNote = (p.notes || []).filter((n) => n && n.kind === 'outline')[0];
  if (outlineNote && outlineNote.content) parts.push('【作者大纲】' + String(outlineNote.content).slice(0, 3200));
  const projChars = (p.characters || []).slice(0, 16).map((c) => c.name + '：' + [c.role, c.desc].filter(Boolean).join('，')).filter(Boolean);
  if (projChars.length) parts.push('【人物档案】' + projChars.join('；'));
  const projLore = (p.lore || []).slice(0, 14).map((l) => l.name + '：' + String(l.content || l.detail || '').slice(0, 240)).filter(Boolean);
  if (projLore.length) parts.push('【设定档案】' + projLore.join('；'));
  const projMats = (p.materials || []).slice(0, 8).map((x) => x.title + (x.content ? '：' + plain(x.content).slice(0, 120) : '')).filter(Boolean);
  if (projMats.length) parts.push('【作者参考资料】' + projMats.join('；'));
  const st = m.state || {};
  const stLine = [st.time && ('时间：' + st.time), st.place && ('地点：' + st.place), st.protagonist && ('主角状态：' + st.protagonist),
  Array.isArray(st.items) && st.items.length && ('持有：' + st.items.join('、')),
  Array.isArray(st.injuries) && st.injuries.length && ('伤势：' + st.injuries.join('、')),
  Array.isArray(st.openQuestions) && st.openQuestions.length && ('未决：' + st.openQuestions.join('；'))].filter(Boolean).join('｜');
  if (stLine) parts.push('【当前状态】' + stLine);
  const cur0 = p.chapters.find((c) => c.id === chapterId);
  const curText = plain(cur0 ? cur0.content : '').slice(-2000);
  const ents = (m.entities || []).filter((e) => ['character', 'place', 'item', 'faction', 'power'].indexOf(e.type) >= 0)
    .filter((e) => e.type === 'character' || curText.indexOf(e.name) >= 0).slice(0, 16)
    .map((e) => e.type + '·' + e.name + '：' + [e.profile, (e.constraints || []).slice(0, 2).join('；')].filter(Boolean).join('；'));
  if (ents.length) parts.push('【实体档案】' + ents.join(' | '));
  const chars = (m.characters || []).slice(0, 14).map((c) => {
    return c.name + '：' + [c.role, c.goal, c.status, c.relations].filter(Boolean).join('，');
  }).filter((x) => x.indexOf('：') < x.length - 1);
  if (chars.length) parts.push('【人物】' + chars.join('；'));
  const lore = (m.lore || []).slice(0, 12).map((l) => l.name + '：' + (l.detail || ''));
  if (lore.length) parts.push('【设定】' + lore.join('；'));
  const open = (m.threads || []).filter((t) => t.status !== 'resolved').slice(0, 12).map((t) => t.title);
  if (open.length) parts.push('【未回收伏笔】' + open.join('、'));
  const idx = p.chapters.findIndex((c) => c.id === chapterId);
  const cur = idx >= 0 ? p.chapters[idx] : null;
  // 分层摘要：本卷 / 本篇 / 本段
  if (m.levels) {
    const i = idx >= 0 ? idx : p.chapters.length - 1;
    const volId = p.chapters[i] && p.chapters[i].volumeId;
    const l4 = (m.levels.L4 || []).find((x) => x.volumeId === volId);
    if (l4) parts.push('【本卷摘要】' + l4.summary);
    const arcKey = 'arc-' + Math.floor(Math.max(0, i) / 20) * 20;
    const l3 = (m.levels.L3 || []).find((x) => x.key === arcKey);
    if (l3) parts.push('【本篇摘要】' + l3.summary);
    const chunkStart = Math.floor(Math.max(0, i) / 5) * 5;
    const list = p.chapters.slice(chunkStart, chunkStart + 5);
    const l2 = (m.levels.L2 || []).find((x) => list.length && x.key === list[0].id + '-' + list[list.length - 1].id);
    if (l2) parts.push('【本段摘要】' + l2.summary);
  }
  const recent = p.chapters.slice(Math.max(0, (idx < 0 ? p.chapters.length : idx) - 4), idx < 0 ? p.chapters.length : idx)
    .map((c) => { const mm = m.chapters[c.id]; return c.title + '：' + (mm && mm.summary ? mm.summary : plain(c.content).slice(0, 80)); })
    .filter((x) => x.indexOf('：') < x.length - 1);
  if (recent.length) parts.push('【最近章节】\n' + recent.join('\n'));
  // 检索相关旧章节摘要
  const query = curText.slice(-1800) + ' ' + chars.map((x) => x.split('：')[0]).join(' ') + ' ' + (m.entities || []).filter((e) => curText.indexOf(e.name) >= 0).map((e) => e.name).join(' ');
  const grams = bigrams(query);
  const scored = p.chapters.filter((c) => !cur || c.id !== cur.id).map((c) => {
    const mm = m.chapters[c.id];
    const text = (c.title || '') + (mm ? (mm.summary + ' ' + (mm.entities || []).join(' ')) : plain(c.content).slice(0, 400));
    return { title: c.title, summary: mm ? mm.summary : '', score: ctxScore(text, grams) };
  }).filter((x) => x.summary && x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  if (scored.length) parts.push('【相关旧章节】\n' + scored.map((x) => x.title + '：' + x.summary).join('\n'));
  if (cur) {
    const tail = plain(cur.content).slice(-1400);
    if (tail) parts.push('【当前章末尾】' + tail);
  }
  let out = parts.join('\n');
  if (out.length > 9000) out = out.slice(0, 9000);
  return out;
}
function cnToNum(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const d = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, cur = 0;
  for (const ch of String(s)) {
    if (d[ch]) cur = d[ch];
    else if (ch === '十') { total += (cur || 1) * 10; cur = 0; }
    else if (ch === '百') { total += (cur || 1) * 100; cur = 0; }
    else if (ch === '千') { total += (cur || 1) * 1000; cur = 0; }
  }
  return total + cur;
}
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
// 硬规则一致性检查（不依赖 AI）
function hardCheck(p, chapter, m) {
  const issues = [];
  const text = plain(chapter.content);
  const chIdx = p.chapters.findIndex((c) => c.id === chapter.id);
  // 1. 已死亡/退场角色再次出场
  (m.entities || []).filter((e) => e.type === 'character').forEach((e) => {
    const info = [e.profile, (e.constraints || []).join(' ')].concat((e.changes || []).map((c) => c.text)).join(' ');
    if (/已死|死亡|身亡|殁|阵亡|死去|死了/.test(info) && text.indexOf(e.name) >= 0) {
      issues.push({ type: '人物', quote: e.name, why: '记忆标记该角色已死亡/退场，但本章再次出现', fix: '确认是回忆、同名或复活，否则修正出场' });
    }
  });
  // 2. 伏笔欠账
  (m.canon.promises || []).filter((x) => x.status !== 'resolved').forEach((x) => {
    const pi = p.chapters.findIndex((c) => c.title === x.plantedChapter);
    if (pi >= 0 && chIdx >= 0 && chIdx - pi > 20) {
      issues.push({ type: '伏笔', quote: x.title, why: '伏笔已埋 ' + (chIdx - pi) + ' 章仍未回收', fix: '安排回收或后移' });
    }
  });
  // 3. 章节序号重复
  const seen = {};
  p.chapters.forEach((c) => {
    const mm = String(c.title).match(/第\s*([0-9〇零一二三四五六七八九十百千两]+)\s*[章回节]/);
    if (!mm) return;
    const n = cnToNum(mm[1]);
    if (!n) return;
    if (seen[n]) issues.push({ type: '章节', quote: c.title, why: '章节序号重复：第 ' + n + ' 章', fix: '核对章节序号' });
    seen[n] = 1;
  });
  // 4. 称呼相近
  const names = [...new Set((m.entities || []).filter((e) => e.type === 'character').map((e) => e.name).concat((m.characters || []).map((c) => c.name)).filter(Boolean))];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (names[i].length >= 2 && names[j].length >= 2 && names[i] !== names[j] && lev1(names[i], names[j])) {
        issues.push({ type: '称呼', quote: names[i] + ' / ' + names[j], why: '两个人物名非常接近，可能为同一人不同写法', fix: '核对称呼是否统一' });
      }
    }
  }
  // 5. 物品归属冲突
  const owners = {};
  (m.canon.facts || []).forEach((f) => {
    const t = f.fact;
    let mm = t.match(/^(.{1,12}?)(?:持有|拿着|带着|得到|获得|捡到)(.{1,16})$/);
    if (mm) {
      const who = mm[1], item = mm[2];
      if (owners[item] && owners[item] !== who) issues.push({ type: '物品', quote: f.fact, why: '物品「' + item + '」此前归 ' + owners[item] + '，此处归 ' + who, fix: '补一笔转移过程或修正归属' });
      owners[item] = who;
    }
    mm = t.match(/^(.{1,12}?)(?:失去|丢失|遗失|交出|被夺)(.{1,16})$/);
    if (mm) delete owners[mm[2]];
  });
  return issues;
}
function findMemoryChapter(m, chapterId) { return m.chapters[chapterId] || null; }
function mergeCharacter(m, u, chapterTitle) {
  if (!u || !u.name) return;
  let c = m.characters.find((x) => x.name === u.name);
  if (!c) { c = { name: u.name, aliases: [], role: '', traits: '', goal: '', voice: '', relations: '', status: '', lastChapter: '' }; m.characters.push(c); }
  ['role', 'traits', 'goal', 'voice', 'relations', 'status'].forEach((k) => { if (u[k]) c[k] = String(u[k]).slice(0, 300); });
  c.lastChapter = chapterTitle || c.lastChapter;
}
function mergeThreads(m, t, chapterTitle) {
  if (!t) return;
  (t.planted || []).forEach((x) => {
    const title = String(x && x.title || x || '').trim();
    if (!title) return;
    if (!m.threads.some((y) => y.title === title)) m.threads.push({ id: uid('th'), title: title, note: String(x.note || ''), plantedChapter: chapterTitle || '', status: 'open', payoffChapter: '' });
  });
  (t.resolved || []).forEach((x) => {
    const title = String(x && x.title || x || '').trim();
    if (!title) return;
    const hit = m.threads.find((y) => y.title === title || title.indexOf(y.title) >= 0 || y.title.indexOf(title) >= 0);
    if (hit) { hit.status = 'resolved'; hit.payoffChapter = chapterTitle || ''; }
  });
}
function mergeEntity(m, u, chapterTitle) {
  if (!u || !u.name) return;
  const type = String(u.type || 'other').toLowerCase();
  let e = m.entities.find((x) => x.type === type && x.name === u.name);
  if (!e) { e = { type: type, name: String(u.name).slice(0, 60), profile: '', constraints: [], changes: [], firstChapter: chapterTitle, lastChapter: '' }; m.entities.push(e); }
  if (u.profile) e.profile = String(u.profile).slice(0, 400);
  if (Array.isArray(u.constraints)) u.constraints.forEach((c) => { c = String(c).slice(0, 200); if (c && e.constraints.indexOf(c) < 0) e.constraints.push(c); });
  if (u.change) { e.changes.push({ chapter: chapterTitle, text: String(u.change).slice(0, 200) }); if (e.changes.length > 20) e.changes.shift(); }
  e.lastChapter = chapterTitle;
}
function addFact(m, f, chapterTitle) {
  if (!f || !f.fact) return;
  const fact = String(f.fact).slice(0, 300);
  if (m.canon.facts.some((x) => x.fact === fact)) return;
  m.canon.facts.push({ id: uid('cf'), fact: fact, quote: String(f.quote || '').slice(0, 200), knownBy: Array.isArray(f.knownBy) ? f.knownBy.slice(0, 12) : [], chapter: chapterTitle, at: now() });
  if (m.canon.facts.length > 2000) m.canon.facts.splice(0, m.canon.facts.length - 2000);
}
function mergePromises(m, p, chapterTitle) {
  if (!p) return;
  (p.planted || []).forEach((x) => {
    const title = String(x && x.title || x || '').trim();
    if (!title) return;
    if (!m.canon.promises.some((y) => y.title === title)) m.canon.promises.push({ id: uid('cp'), title: title, note: String(x.note || ''), plantedChapter: chapterTitle, status: 'open', payoffChapter: '' });
    if (!m.threads.some((y) => y.title === title)) m.threads.push({ id: uid('th'), title: title, note: String(x.note || ''), plantedChapter: chapterTitle, status: 'open', payoffChapter: '' });
  });
  (p.resolved || []).forEach((x) => {
    const title = String(x && x.title || x || '').trim();
    if (!title) return;
    [m.canon.promises, m.threads].forEach((list) => {
      const hit = list.find((y) => y.title === title || title.indexOf(y.title) >= 0 || y.title.indexOf(title) >= 0);
      if (hit) { hit.status = 'resolved'; hit.payoffChapter = chapterTitle; }
    });
  });
}
async function distillChapter(p, chapter, m) {
  const text = plain(chapter.content);
  if (!text) return null;
  const memBrief = [
    m.book ? ('全书梗概：' + m.book) : '',
    m.characters.slice(-10).map((c) => c.name + '：' + (c.status || c.role || '')).join('；'),
    m.threads.filter((t) => t.status !== 'resolved').slice(-10).map((t) => '伏笔：' + t.title).join('；')
  ].filter(Boolean).join('\n');
  const sys = '你是长篇小说的记忆整理器。只输出一个 JSON 对象，不要 markdown、不要解释。';
  const user = '章节标题：' + chapter.title + '\n已有记忆：\n' + (memBrief || '（空）') + '\n章节正文：\n' + text.slice(0, 7000)
    + '\n\n输出 JSON：{"summary":"120~200字本章摘要，按事件顺序",'
    + '"entities":[{"type":"character|place|item|faction|power|other","name":"","profile":"一句话档案","constraints":["不可违背的硬设定"],"change":"本章变化"}],'
    + '"timeline":{"time":"故事内时间","place":"地点","event":"本章关键事件","who":["相关人物"]},'
    + '"state":{"time":"","place":"","protagonist":"主角当前状态","items":[],"injuries":[],"openQuestions":[]},'
    + '"characters":[{"name":"","role":"","goal":"","status":"当前状态","relations":"与谁关系如何","change":"本章变化"}],'
    + '"promises":{"planted":[{"title":"新埋伏笔","note":""}],"resolved":[{"title":"已回收伏笔"}]},'
    + '"facts":[{"fact":"原子事实，如 X 持有 Y / X 在 Z / X 已死","quote":"原文短句","knownBy":["谁知道"]}],'
    + '"lore":[{"name":"设定名","detail":"规则或事实"}]}';
  const out = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], 2000, 0.3);
  let obj = null;
  try { obj = JSON.parse(out); } catch {
    const s = out.indexOf('{'), e = out.lastIndexOf('}');
    if (s >= 0 && e > s) { try { obj = JSON.parse(out.slice(s, e + 1)); } catch { } }
  }
  if (!obj) return null;
  const rec = {
    summary: String(obj.summary || '').slice(0, 600),
    entities: Array.isArray(obj.entities) ? obj.entities.slice(0, 30).map((x) => String(x).slice(0, 40)) : [],
    timeline: obj.timeline && typeof obj.timeline === 'object' ? {
      time: String(obj.timeline.time || ''), place: String(obj.timeline.place || ''),
      event: String(obj.timeline.event || ''), who: Array.isArray(obj.timeline.who) ? obj.timeline.who.slice(0, 12) : []
    } : null,
    words: wc(chapter.content), updatedAt: now()
  };
  m.chapters[chapter.id] = rec;
  m.levels.L1[chapter.id] = { summary: rec.summary, frozen: true, words: rec.words, updatedAt: now() };
  (Array.isArray(obj.entities) ? obj.entities : []).forEach((u) => {
    if (typeof u === 'string') mergeEntity(m, { type: 'other', name: u }, chapter.title);
    else mergeEntity(m, u, chapter.title);
  });
  (Array.isArray(obj.facts) ? obj.facts : []).forEach((f) => addFact(m, f, chapter.title));
  if (obj.promises) mergePromises(m, obj.promises, chapter.title);
  if (obj.state && typeof obj.state === 'object') {
    m.state = Object.assign({}, m.state, {
      time: String(obj.state.time || m.state.time || ''),
      place: String(obj.state.place || m.state.place || ''),
      protagonist: String(obj.state.protagonist || m.state.protagonist || ''),
      items: Array.isArray(obj.state.items) && obj.state.items.length ? obj.state.items.slice(0, 20) : (m.state.items || []),
      injuries: Array.isArray(obj.state.injuries) && obj.state.injuries.length ? obj.state.injuries.slice(0, 20) : (m.state.injuries || []),
      openQuestions: Array.isArray(obj.state.openQuestions) && obj.state.openQuestions.length ? obj.state.openQuestions.slice(0, 20) : (m.state.openQuestions || [])
    });
  }
  (Array.isArray(obj.characters) ? obj.characters : []).forEach((c) => mergeCharacter(m, c, chapter.title));
  mergeThreads(m, obj.threads, chapter.title);
  (Array.isArray(obj.lore) ? obj.lore : []).forEach((l) => {
    if (!l || !l.name) return;
    let hit = m.lore.find((x) => x.name === l.name);
    if (!hit) { hit = { name: String(l.name).slice(0, 60), detail: '' }; m.lore.push(hit); }
    if (l.detail) hit.detail = String(l.detail).slice(0, 500);
  });
  m.updatedAt = now();
  return rec;
}
async function summarizeBook(p, m) {
  const su = p.chapters.map((c) => {
    const mm = m.chapters[c.id];
    return c.title + '：' + (mm && mm.summary ? mm.summary : plain(c.content).slice(0, 120));
  }).filter((x) => x.indexOf('：') < x.length - 1);
  if (!su.length) return '';
  const sys = '你是长篇小说编辑。只输出一段 JSON：{"book":"300字以内的全书梗概","volumes":[{"title":"卷名","summary":"150字以内"}]}';
  const user = '章节摘要：\n' + su.join('\n').slice(0, 12000) + '\n卷结构：' + JSON.stringify((p.volumes || []).map((v) => v.title));
  const out = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], 1200, 0.4);
  let obj = null;
  try { obj = JSON.parse(out); } catch { const s = out.indexOf('{'), e = out.lastIndexOf('}'); if (s >= 0 && e > s) { try { obj = JSON.parse(out.slice(s, e + 1)); } catch { } } }
  if (obj) {
    if (obj.book) m.book = String(obj.book).slice(0, 800);
    if (Array.isArray(obj.volumes)) m.volumes = obj.volumes.slice(0, 20).map((v) => ({ title: String(v.title || '').slice(0, 60), summary: String(v.summary || '').slice(0, 400) }));
    m.updatedAt = now();
  }
  return m.book;
}
async function aiSummarize(label, lines, len) {
  const sys = '你是长篇小说编辑。只输出 JSON：{"summary":"' + len + '字左右，按时间顺序，保留关键人物、事件、因果与未决问题"}';
  const out = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: label + '\n' + lines }], 800, 0.3);
  let obj = null;
  try { obj = JSON.parse(out); } catch { const s = out.indexOf('{'), e = out.lastIndexOf('}'); if (s >= 0 && e > s) { try { obj = JSON.parse(out.slice(s, e + 1)); } catch { } } }
  return obj && obj.summary ? String(obj.summary).slice(0, 800) : '';
}
async function buildLevels(p, m, opts) {
  opts = opts || {};
  let calls = 0, pending = 0;
  const maxCalls = opts.maxCalls || 6;
  const force = !!opts.force;
  const curIdx = p.chapters.findIndex((c) => c.id === opts.currentChapterId);
  const cur = curIdx >= 0 ? curIdx : p.chapters.length - 1;
  // L2：每 5 章一段
  const chunks = [];
  for (let i = 0; i < p.chapters.length; i += 5) {
    const list = p.chapters.slice(i, i + 5);
    if (list.length >= 2 && list.every((c) => m.levels.L1[c.id])) chunks.push({ i: i, list: list });
  }
  chunks.sort((a, b) => Math.abs(a.i - cur) - Math.abs(b.i - cur));
  for (const ch of chunks) {
    const key = ch.list[0].id + '-' + ch.list[ch.list.length - 1].id;
    if (!force && m.levels.L2.some((x) => x.key === key)) continue;
    if (calls >= maxCalls) { pending++; continue; }
    const s = await aiSummarize('分段：' + ch.list[0].title + ' 至 ' + ch.list[ch.list.length - 1].title, ch.list.map((c) => c.title + '：' + m.levels.L1[c.id].summary).join('\n'), 180);
    if (s) { m.levels.L2 = m.levels.L2.filter((x) => x.key !== key); m.levels.L2.push({ key: key, from: ch.list[0].title, to: ch.list[ch.list.length - 1].title, summary: s, frozen: true }); calls++; }
  }
  // L3：每 20 章一段
  for (let i = 0; i < p.chapters.length; i += 20) {
    const list = p.chapters.slice(i, Math.min(i + 20, p.chapters.length));
    if (list.length < 5 || !list.every((c) => m.levels.L1[c.id])) continue;
    const key = 'arc-' + i;
    if (!force && m.levels.L3.some((x) => x.key === key)) continue;
    if (calls >= maxCalls) { pending++; continue; }
    const s = await aiSummarize('篇章：' + list[0].title + ' 至 ' + list[list.length - 1].title, list.map((c) => c.title + '：' + m.levels.L1[c.id].summary).join('\n'), 300);
    if (s) { m.levels.L3 = m.levels.L3.filter((x) => x.key !== key); m.levels.L3.push({ key: key, from: list[0].title, to: list[list.length - 1].title, summary: s, frozen: true }); calls++; }
  }
  // L4：卷摘要
  for (const v of (p.volumes || [])) {
    const list = p.chapters.filter((c) => c.volumeId === v.id && m.levels.L1[c.id]);
    if (!list.length) continue;
    const key = 'vol-' + v.id;
    if (!force && m.levels.L4.some((x) => x.key === key)) continue;
    if (calls >= maxCalls) { pending++; continue; }
    const s = await aiSummarize('卷：' + v.title, list.map((c) => c.title + '：' + m.levels.L1[c.id].summary).join('\n'), 300);
    if (s) { m.levels.L4 = m.levels.L4.filter((x) => x.key !== key); m.levels.L4.push({ key: key, volumeId: v.id, title: v.title, summary: s, frozen: true }); calls++; }
  }
  // L5：全书
  if ((force || !m.levels.L5) && calls < maxCalls) {
    const b = await summarizeBook(p, m);
    if (b) { m.levels.L5 = b; calls++; }
  } else if (!m.levels.L5) pending++;
  m.updatedAt = now();
  return { calls: calls, pending: pending };
}

const json = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });

async function aiChat(messages, maxTokens = 2200, temperature = 0.8, modelOverride) {
  const cfg = dsCfg();
  if (!cfg.key) throw new Error('未配置 DeepSeek API Key（请在设置 → AI 接入中填写，或配置 data/config.json）');
  const model = modelOverride || cfg.model;
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(cfg.base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages })
      });
      const t = await r.text();
      if (!r.ok) {
        lastErr = new Error('AI ' + r.status + ' ' + t.slice(0, 200));
        if (r.status >= 400 && r.status < 500) throw lastErr;
        await new Promise((rs) => setTimeout(rs, 900));
        continue;
      }
      const j = JSON.parse(t);
      const out = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      if (out) return out;
      lastErr = new Error('AI 空响应');
    } catch (e) {
      if (e === lastErr && /^AI 4\d\d/.test(e.message)) throw e;
      lastErr = e;
    }
    await new Promise((rs) => setTimeout(rs, 900));
  }
  throw lastErr || new Error('AI 调用失败');
}

async function aiChatStreamEx(messages, maxTokens, temperature, onDelta, modelOverride) {
  const cfg = dsCfg();
  if (!cfg.key) throw new Error('未配置 DeepSeek API Key（请在设置 → AI 接入中填写，或配置 data/config.json）');
  const r = await fetch(cfg.base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({ model: modelOverride || cfg.model, temperature, max_tokens: maxTokens, messages, stream: true })
  });
  if (!r.ok || !r.body) throw new Error('AI ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const reader = r.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let full = '';
  let finishReason = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const ch = j.choices && j.choices[0];
        const d = (ch && ch.delta && ch.delta.content) || '';
        if (ch && ch.finish_reason) finishReason = ch.finish_reason;
        if (d) { full += d; onDelta(d); }
      } catch (e) { }
    }
  }
  return { text: full, finishReason };
}
async function aiChatStream(messages, maxTokens, temperature, onDelta, modelOverride) {
  const out = await aiChatStreamEx(messages, maxTokens, temperature, onDelta, modelOverride);
  return out.text;
}

// 人化 / 去 AI 味 系统提示词（唯一来源，工具页与创作台都走这里）
const HUMANIZER_SYS = '你是「人味改写」编辑，依据 Humanizer-zh 的编辑原则工作。最高优先级：保留原文的信息与确定程度——不新增事实、数字、名字、日期、经历、引文或来源；不丢失否定、比较、范围、条件、时间、完成状态与归因；不把「可能」改成「确定」。只修改确实存在的表达问题，不为展示改动而重写已通顺的句子。\n'
  + '按以下模式检查（只在空泛、重复、歧义或与文体不符时改）：\n'
  + 'A 铺垫代替陈述：假对比「不是X而是Y」、戏剧性碎片、格言与伪深度、起跑式铺垫（让我们看看/以下是你需要知道的）、与假想敌辩论。\n'
  + 'B 公式化节奏：强凑三段式、连续句同头、破折号当万能连接、限定词堆叠、生造复合词、被动与缺主语。\n'
  + 'C 拔高与借权威：AI 高频词（赋能/至关重要/深入探讨/无缝/闭环）、意义拔高、模糊关联、句尾补充式拔高、宣传语、借权威、回避「是/有」。\n'
  + 'D 公式化排版：粗体当装饰、装饰性标题、引号与中文标点。\n'
  + 'E 聊天与草稿残留：客服腔、知识边界免责与猜测填充、首句复读标题、谈论上一稿。\n'
  + 'F 中文专项：层叠的「的」、「进行＋动词」、被字句堆叠、四字词排比、「随着……的发展」式开头、套话收尾。\n'
  + '小说正文额外要求：句长不齐、段落不匀；把抽象情绪换成动作、生理反应与器物细节；不替读者总结；对话可短、可打断、可答非所问；结尾落在具体动作或画面上。保持人物口吻、时代感与叙事视角；不新增情节，不改设定。\n'
  + '只输出改写后的正文，不要说明、不要标注改动。';
const DEAI_SYS = '你是「去 AI 味」编辑，依据 Humanizer-zh（源自维基百科 Signs of AI writing）清除中文 AIGC 痕迹。最高优先级仍是保留信息与确定程度，不能为了去味编造细节。\n'
  + '重点清除（命中后回到上下文判断，不搞词语黑名单）：\n'
  + '1. 假对比与拔高：「这不仅…更是…」「标志着…新时代」「彰显了…」；空泛赞美与句尾拔高。\n'
  + '2. 公式化结构：强凑三段式、排比对仗、句首复读、破折号链、限定词堆叠、生造复合词。\n'
  + '3. AI 高频词与句式：「值得注意的是」「总的来说」「首先/其次/最后」「在…的背景下」「随着…的发展」「起到了…的作用」「让我们…」「赋能/闭环/底层逻辑」。\n'
  + '4. 过度解释与重复：段首总结＋段尾升华、同一意思说多次、替读者下结论。\n'
  + '5. 中文专项：层叠的「的」、「进行＋动词」、被字句堆叠、四字词排比、「随着…的发展」开头、套话收尾。\n'
  + '6. 排版：粗体装饰、装饰性标题、中文正文里的半角标点。\n'
  + '7. 对话要像人：短句、打断、迟疑、答非所问。\n'
  + '改写强度按用户给出的执行：轻度只清痕迹，中度重写句子，重度可重组段落。保留人物口吻、视角与所有关键信息。只输出改写后的正文。';
const NOVEL_PLAN_SYS = '你是资深中文网文主编，按雪花写作法工作：一句话故事 → 一段式梗概 → 人物小传 → 世界观规则 → 分卷 → 章节节拍。只输出一个 JSON 对象，不要 markdown、不要解释。字段：{"logline":"一句话故事","synopsis":"300字以内","characters":[{"name":"","role":"","goal":"","conflict":"","arc":""}],"world":[{"name":"","rule":""}],"volumes":[{"title":"","summary":""}],"chapters":[{"title":"第X章 · 标题","brief":"60~120字本章发生什么","hook":"章末钩子"}]}。章节数按用户要求，控制在 8~30 章。';
const PROSE_CRAFT = '写作硬规则：1) 每场戏有明确目标、阻碍、转折与钩子，用动作、对白与感官细节推进，禁止用概述代替场景；2) 句子长短交错，避免连续同构句与形容词堆叠；3) 禁用陈词滥调与AI腔（如“空气仿佛凝固”“心中五味杂陈”“不禁”“仿佛整个世界”），比喻要具体、新鲜、与人物经验相关；4) 对白有潜台词，人物说话方式可区分；5) 视角一致，只写视角人物能感知的内容；6) 章末落在新问题、决定或反转上，不做总结；7) 不解释人物心理，让行为与细节说话；8) 人名、地名、设定前后一致，不新增未经确认的核心设定。';
function proseModel() {
  const s = (typeof DB !== 'undefined' && DB.settings) || {};
  // 用户要求只用 flash：默认与文本模型一致，不启用 Pro
  return s.proseModel || s.model || 'deepseek-flash';
}
async function aiProse(messages, maxTokens, temperature) {
  try { return await aiChat(messages, maxTokens, temperature, proseModel()); }
  catch (e) { return await aiChat(messages, maxTokens, temperature, 'deepseek-flash'); }
}
async function aiProseStream(messages, maxTokens, temperature, onDelta) {
  try { return await aiChatStream(messages, maxTokens, temperature, onDelta, proseModel()); }
  catch (e) { return await aiChatStream(messages, maxTokens, temperature, onDelta, 'deepseek-flash'); }
}
const NOVEL_CHAPTER_SYS = PROSE_CRAFT + ' 你是中文网文写手。用户会给出【本章节拍】【作品记忆】【目标字数】。你必须严格按节拍写：人物、地点、时间、事件都来自节拍与记忆，不得更换主角、不得另起一个故事、不得跳章或提前写后面的剧情。开场承接上一章结尾，中段推进冲突，结尾留下钩子。按目标字数写足场景、动作、对白与心理，不得用概述代替正文；不得新增用户未给出的关键设定。文风自然、克制、有画面感；不要解释、不要标题、不要列点。只输出本章正文。';

const server = http.createServer(async (req, res) => {
  // 只对本机来源放行 CORS：避免任意网页在应用运行时读走 /api/settings 里的密钥
  const origin = String(req.headers.origin || '');
  if (!origin || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) {
    res.setHeader('access-control-allow-origin', origin || '*');
  }
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const parts = u.pathname.split('/').filter(Boolean);

  try {
    // ── API ──
    if (parts[0] === 'api') {
      // projects
      if (parts[1] === 'projects' && !parts[2]) {
        if (req.method === 'GET') return json(res, { projects: DB.projects.map((p) => publicProject(p)) });
        if (req.method === 'POST') { const b = await readBody(req); return json(res, publicProject(ensureProject(b), true)); }
      }
      if (parts[1] === 'projects' && parts[2]) {
        const p = findProject(parts[2]);
        if (!p) return json(res, { error: 'project not found' }, 404);
        // /api/projects/:id
        if (!parts[3]) {
          if (req.method === 'GET') return json(res, p);
          if (req.method === 'PATCH' || req.method === 'PUT') {
            const b = await readBody(req);
            ['title', 'intro', 'author', 'cover', 'mode', 'genre', 'status'].forEach((k) => { if (k in b) p[k] = b[k]; });
            p.updatedAt = now(); save(); return json(res, p);
          }
          if (req.method === 'DELETE') {
            DB.projects = DB.projects.filter((x) => x.id !== p.id);
            DB.writelogs = DB.writelogs.filter((e) => e.pid !== p.id);
            save(); return json(res, { ok: true });
          }
        }
        // 记忆层：结构化记忆 / 章节摘要构建 / 一致性检查 / 上下文包
        if (parts[3] === 'memory') {
          const m = ensureMemory(p);
          if (!parts[4] && req.method === 'GET') return json(res, m);
          if (!parts[4] && (req.method === 'PUT' || req.method === 'POST')) {
            const b = await readBody(req);
            if (b && typeof b === 'object') {
              ['book', 'volumes', 'chapters', 'characters', 'lore', 'threads', 'state'].forEach((k) => { if (k in b) m[k] = b[k]; });
              m.updatedAt = now(); save();
            }
            return json(res, m);
          }
          if (parts[4] === 'build' && req.method === 'POST') {
            const b = await readBody(req);
            const force = !!b.all || !!b.force;
            let targets = [];
            if (b.chapterId) {
              const c = p.chapters.find((x) => x.id === b.chapterId);
              if (c) targets = [c];
            } else {
              targets = p.chapters.filter((c) => {
                if (!plain(c.content)) return false;
                if (force) return true;
                const rec = m.chapters[c.id];
                return !rec || rec.words !== wc(c.content);
              });
            }
            targets = targets.slice(0, 12);
            let processed = 0;
            for (const c of targets) {
              try { const r = await distillChapter(p, c, m); if (r) processed++; } catch (e) { }
            }
            let levels = { calls: 0, pending: 0 };
            if (force || processed > 0 || p.chapters.length >= 5) {
              try { levels = await buildLevels(p, m, { force: force, currentChapterId: b.chapterId, maxCalls: 6 }); } catch (e) { }
            }
            save();
            return json(res, { ok: true, processed, levels: levels, memory: m });
          }
          if (parts[4] === 'check' && req.method === 'POST') {
            const b = await readBody(req);
            const c = p.chapters.find((x) => x.id === b.chapterId) || p.chapters[p.chapters.length - 1];
            if (!c) return json(res, { issues: [] });
            const text = plain(c.content);
            if (!text) return json(res, { issues: [] });
            const sys = '你是长篇小说的一致性审校。对照记忆检查本章的矛盾。只输出 JSON：{"issues":[{"type":"人物/时间/地点/设定/伏笔","quote":"原文片段","why":"为什么矛盾","fix":"建议"}]}；没有矛盾就返回 {"issues":[]}。';
            const user = '【记忆】\n' + buildContext(p, c.id).slice(0, 6000) + '\n【本章】\n' + text.slice(0, 7000);
            const hard = hardCheck(p, c, m);
            const out = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], 1200, 0.2);
            let obj = null;
            try { obj = JSON.parse(out); } catch {
              const s = out.indexOf('{'), e = out.lastIndexOf('}');
              if (s >= 0 && e > s) { try { obj = JSON.parse(out.slice(s, e + 1)); } catch { } }
            }
            const ai = (obj && Array.isArray(obj.issues)) ? obj.issues : [];
            const seen = new Set(), merged = [];
            hard.concat(ai).forEach((it) => {
              const k = (it.type || '') + '|' + (it.quote || '') + '|' + (it.why || '');
              if (!seen.has(k)) { seen.add(k); merged.push(it); }
            });
            return json(res, { issues: merged, hard: hard.length });
          }
          if (parts[4] === 'context' && req.method === 'GET') {
            return json(res, { context: buildContext(p, u.searchParams.get('chapterId') || '') });
          }
          return json(res, { error: 'not found' }, 404);
        }
        const coll = parts[3];
        // 整本同步：PUT /api/projects/:id/book
        if (coll === 'book' && req.method === 'PUT') {
          const b = await readBody(req);
          const prevWords = projWords(p);
          if (b.name) p.title = b.name;
          if (Array.isArray(b.chapters)) {
            const defaultVol = p.volumes[0] && p.volumes[0].id;
            const old = {}; p.chapters.forEach((c) => { old[c.id] = c; });
            p.chapters = b.chapters.map((c) => ({
              id: c.id || uid('ch'),
              volumeId: (old[c.id] && old[c.id].volumeId) || defaultVol,
              title: c.title != null ? c.title : (c.t || '未命名'),
              content: c.content != null ? c.content : (c.body || ''),
              updatedAt: now()
            }));
          }
          p.updatedAt = now(); logWrite(p, prevWords, projWords(p)); save(); return json(res, publicProject(p, true));
        }
        const listMap = { chapters: 'chapters', characters: 'characters', lore: 'lore', materials: 'materials', notes: 'notes', volumes: 'volumes' };
        const key = listMap[coll];
        if (key) {
          const itemId = parts[4];
          // 批量追加：POST /api/projects/:id/materials/bulk
          if (coll === 'materials' && itemId === 'bulk' && req.method === 'POST') {
            const b = await readBody(req);
            const items = Array.isArray(b.items) ? b.items : [];
            let n = 0;
            items.forEach((it) => {
              if (!it || !it.title) return;
              p.materials.push(Object.assign({ id: uid('mat'), createdAt: now(), updatedAt: now() }, it));
              n++;
            });
            p.updatedAt = now(); save();
            return json(res, { ok: true, added: n });
          }
          if (!itemId) {
            if (req.method === 'GET') return json(res, p[key]);
            if (req.method === 'POST') {
              const b = await readBody(req);
              const it = Object.assign({ id: uid(coll.slice(0, 3)), createdAt: now(), updatedAt: now() }, b);
              if (key === 'chapters') { if (!it.volumeId) it.volumeId = p.volumes[0] && p.volumes[0].id; if (it.content == null) it.content = ''; }
              p[key].push(it); p.updatedAt = now(); save(); return json(res, it);
            }
          } else {
            const it = p[key].find((x) => x.id === itemId);
            if (!it) return json(res, { error: 'item not found' }, 404);
            if (req.method === 'GET') return json(res, it);
            if (req.method === 'PATCH' || req.method === 'PUT') {
              const b = await readBody(req);
              const prevWords = projWords(p);
              Object.assign(it, b, { updatedAt: now() });
              p.updatedAt = now(); logWrite(p, prevWords, projWords(p)); save(); return json(res, it);
            }
            if (req.method === 'DELETE') {
              const prevWords = projWords(p);
              p[key] = p[key].filter((x) => x.id !== itemId);
              p.updatedAt = now(); logWrite(p, prevWords, projWords(p)); save(); return json(res, { ok: true });
            }
          }
        }
      }
      // stats
      // 联网检索（DeepSeek Search）
      if (parts[1] === 'search' && req.method === 'POST') {
        const b = await readBody(req);
        const r = await fetch('https://api.deepseek.com/v1/tools/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + dsCfg().key },
          body: JSON.stringify({ query: String(b.query || ''), count: Math.max(1, Math.min(20, parseInt(b.count, 10) || 8)), need_content: false })
        });
        const t = await r.text();
        if (!r.ok) return json(res, { error: 'SEARCH ' + r.status + ' ' + t.slice(0, 160) }, 502);
        const j = JSON.parse(t);
        return json(res, {
          results: (j.results || []).map((x) => ({
            title: x.title, url: x.url, summary: x.summary || x.snippet || '',
            authority: x.authority, rerank: x.rerank_score, date: x.date, site: x.site_name
          }))
        });
      }
      // AI 生图
      if (parts[1] === 'ai' && parts[2] === 'image' && req.method === 'POST') {
        const b = await readBody(req);
        const cfg = qwenCfg();
        if (!cfg.key) return json(res, { error: '未配置生图 key' }, 400);
        const r = await fetch(cfg.base.replace(/\/+$/, '') + '/images/generations', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
          body: JSON.stringify({ model: b.model || cfg.model || 'qwen-image-3.0-pro', prompt: b.prompt || '', n: 1, size: b.size || '1024x1024' })
        });
        const t = await r.text();
        if (!r.ok) return json(res, { error: 'IMG ' + r.status + ' ' + t.slice(0, 180) }, 502);
        let j; try { j = JSON.parse(t); } catch { return json(res, { error: 'bad json' }, 502); }
        const it = (j.data || [])[0];
        if (!it) return json(res, { error: 'no image' }, 502);
        let buf;
        if (it.b64_json) buf = Buffer.from(it.b64_json, 'base64');
        else if (it.url) buf = Buffer.from(await (await fetch(it.url)).arrayBuffer());
        else return json(res, { error: 'no data' }, 502);
        const dir = path.join(DATA_DIR, 'images'); fs.mkdirSync(dir, { recursive: true });
        const fn = 'img_' + Date.now() + '.png';
        fs.writeFileSync(path.join(dir, fn), buf);
        return json(res, { url: '/data/images/' + fn });
      }
      // AI 配音 / 有声书（edge-tts，失败退回 Windows SAPI）
      if (parts[1] === 'ai' && parts[2] === 'tts' && req.method === 'POST') {
        const b = await readBody(req);
        const text = String(b.text || '').trim();
        if (!text) return json(res, { error: '文本为空' }, 400);
        const voiceMap = { '云夕 · 女声': 'zh-CN-XiaoxiaoNeural', '砚青 · 男声': 'zh-CN-YunxiNeural', '说书人': 'zh-CN-YunjianNeural', '童声': 'zh-CN-XiaoyiNeural' };
        const voice = voiceMap[b.voice] || (/^[a-z]{2}-[A-Z]{2}-/.test(b.voice || '') ? b.voice : 'zh-CN-XiaoxiaoNeural');
        let rate = '+0%';
        if (/慢/.test(b.speed || '')) rate = '-10%';
        else if (/快/.test(b.speed || '')) rate = '+15%';
        let pitch = '+0Hz';
        if (/激昂/.test(b.emotion || '')) pitch = '+12Hz';
        else if (/悲怆/.test(b.emotion || '')) pitch = '-12Hz';
        else if (/温柔/.test(b.emotion || '')) pitch = '-3Hz';
        const dir = path.join(DATA_DIR, 'audio'); fs.mkdirSync(dir, { recursive: true });
        const stamp = Date.now();
        const fn = 'tts_' + stamp + '.mp3';
        const out = path.join(dir, fn);
        const py = pyBin();
        let okEdge = false;
        if (fs.existsSync(path.join(ROOT, 'tts.py'))) {
          try {
            const r = spawnSync(py, [path.join(ROOT, 'tts.py')], {
              input: JSON.stringify({ text: text.slice(0, 4000), voice, rate, pitch, out }),
              encoding: 'utf8', timeout: 120000
            });
            try { okEdge = JSON.parse((r.stdout || '').trim()).ok === true; } catch { }
          } catch (e) { }
        }
        if (okEdge && fs.existsSync(out)) return json(res, { url: '/data/audio/' + fn, engine: 'edge-tts', voice });
        // 兜底：Windows SAPI（慧慧女声）
        const txtFile = path.join(dir, 'tts_' + stamp + '.txt');
        const wav = path.join(dir, 'tts_' + stamp + '.wav');
        fs.writeFileSync(txtFile, text.slice(0, 4000), 'utf8');
        const rateVal = /慢/.test(b.speed || '') ? -2 : (/快/.test(b.speed || '') ? 2 : 0);
        const ps = "Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          + "$s.SetOutputToWaveFile('" + wav.replace(/'/g, "''") + "'); $s.Rate=" + rateVal + "; "
          + "$s.Speak([IO.File]::ReadAllText('" + txtFile.replace(/'/g, "''") + "', [Text.Encoding]::UTF8)); $s.Dispose()";
        const r2 = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 120000 });
        try { fs.unlinkSync(txtFile); } catch { }
        if (fs.existsSync(wav)) return json(res, { url: '/data/audio/' + path.basename(wav), engine: 'sapi' });
        return json(res, { error: 'TTS 失败', detail: (r2.stderr || '').slice(0, 200) }, 502);
      }
      // 程序化声景 / 音效（按场景关键词合成雨/风/夜虫/火/钟/战鼓/海浪/市声/室内）
      if (parts[1] === 'ai' && parts[2] === 'sfx' && req.method === 'POST') {
        const b = await readBody(req);
        const scene = String(b.scene || b.text || '').trim();
        if (!scene) return json(res, { error: '场景描述为空' }, 400);
        const dir = path.join(DATA_DIR, 'audio'); fs.mkdirSync(dir, { recursive: true });
        const fn = 'sfx_' + Date.now() + '.wav';
        const out = path.join(dir, fn);
        const script = path.join(ROOT, 'sfx.py');
        const py = pyBin();
        let ok = false, info = null;
        if (fs.existsSync(script)) {
          try {
            const r = spawnSync(py, [script], {
              input: JSON.stringify({ scene, mood: b.mood || '', duration: b.duration || 20, out }),
              encoding: 'utf8', timeout: 120000
            });
            try { info = JSON.parse((r.stdout || '').trim()); ok = info.ok === true; } catch { }
          } catch (e) { }
        }
        if (!ok || !fs.existsSync(out)) {
          try { info = jsSfx(scene, b.mood || '', b.duration || 20, out); ok = fs.existsSync(out); } catch (e) { }
          if (ok && info) info.nodeFallback = true;
        }
        if (!ok || !fs.existsSync(out)) {
          return json(res, { error: '声景合成失败' }, 502);
        }
        return json(res, { url: '/data/audio/' + fn, engine: info.nodeFallback ? 'procedural-node' : 'procedural', layers: info.layers || [], duration: info.duration || 20 });
      }
      // analytics
      if (parts[1] === 'analytics' && req.method === 'GET') {
        const pid = u.searchParams.get('project');
        const p = pid ? findProject(pid) : DB.projects[0];
        if (!p) return json(res, { ok: false }, 404);
        const chs = p.chapters.map((c) => ({ title: c.title, words: wc(c.content) }));
        const total = chs.reduce((a, c) => a + c.words, 0);
        const allText = p.chapters.map((c) => (c.content || '').replace(/<[^>]*>/g, '')).join('\n');
        const chars = p.characters.map((ch) => {
          const name = ch.name || '';
          const n = name ? (allText.split(name).length - 1) : 0;
          return { name, role: ch.role || '', mentions: n };
        }).sort((a, b) => b.mentions - a.mentions);
        const quotes = (allText.match(/[「『“"][^」』”"]*[」』”"]/g) || []).join('').length;
        const dialogue = allText.length ? Math.round(quotes / allText.length * 100) : 0;
        const plainText = allText.replace(/\s+/g, ' ').trim();
        const paras = allText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        const paraLens = paras.map((s) => s.replace(/\s/g, '').length);
        const sentences = plainText.split(/[。！？!?…]+/).map((s) => s.trim()).filter((s) => s.length > 1);
        const sentLens = sentences.map((s) => s.replace(/\s/g, '').length);
        const big = {};
        allText.replace(/[^一-龥]/g, '|').split(/\|+/).forEach((seg) => {
          for (let i = 0; i < seg.length - 1; i++) { const w = seg.slice(i, i + 2); big[w] = (big[w] || 0) + 1; }
        });
        const totalBi = Object.keys(big).reduce((a, k) => a + big[k], 0);
        const uniqueBi = Object.keys(big).length;
        const topBigrams = Object.keys(big).map((w) => ({ w: w, n: big[w] })).sort((a, b) => b.n - a.n).slice(0, 12);
        const chaptersWithWords = chs.filter((c) => c.words > 0).length;
        const volumes = (p.volumes || []).map((v) => {
          const cs = p.chapters.filter((c) => c.volumeId === v.id);
          return { title: v.title, chapters: cs.length, filled: cs.filter((c) => wc(c.content) > 0).length, words: cs.reduce((a, c) => a + wc(c.content), 0) };
        });
        const ageDays = Math.max(1, Math.ceil((Date.now() - (Date.parse(p.createdAt) || Date.now())) / 86400000));
        return json(res, {
          title: p.title, totalWords: total, chapters: chs.length,
          avg: chs.length ? Math.round(total / chs.length) : 0,
          max: chs.length ? Math.max.apply(null, chs.map((c) => c.words)) : 0,
          perChapter: chs, characters: chars, dialogueRatio: dialogue,
          materials: p.materials.length, notes: p.notes.length,
          paragraphs: paras.length,
          avgPara: paras.length ? Math.round(paraLens.reduce((a, b) => a + b, 0) / paras.length) : 0,
          maxPara: paraLens.length ? Math.max.apply(null, paraLens) : 0,
          shortParas: paraLens.filter((n) => n < 40).length,
          sentences: sentences.length,
          avgSent: sentLens.length ? Math.round(sentLens.reduce((a, b) => a + b, 0) / sentLens.length) : 0,
          longSentences: sentLens.filter((n) => n > 50).length,
          shortSentences: sentLens.filter((n) => n <= 15).length,
          uniqueBigrams: uniqueBi, totalBigrams: totalBi,
          lexicalRichness: totalBi ? Math.round(uniqueBi / totalBi * 100) : 0,
          repRate: totalBi ? Math.round((totalBi - uniqueBi) / totalBi * 100) : 0,
          topBigrams: topBigrams,
          chaptersWithWords: chaptersWithWords,
          completion: chs.length ? Math.round(chaptersWithWords / chs.length * 100) : 0,
          volumes: volumes,
          projects: DB.projects.length,
          outline: (p.notes || []).some((n) => n && n.kind === 'outline'),
          genre: p.genre || '', mode: p.mode || '',
          createdAt: p.createdAt || '', ageDays: ageDays
        });
      }
      // 写作日志聚合（每日码字 / 时段 / 热力图 / 番茄钟）
      if (parts[1] === 'writelog' && req.method === 'GET') {
        const pid = u.searchParams.get('project');
        const p = pid ? findProject(pid) : DB.projects[0];
        if (!p) return json(res, { ok: false }, 404);
        const evs = DB.writelogs.filter((e) => e.pid === p.id).sort((a, b) => a.t - b.t);
        const dayMap = {}, hourMap = Array(24).fill(0), hourDayMap = {};
        let added = 0, deleted = 0, saves = 0, lastT = 0, activeMs = 0, sessions = 0;
        for (const e of evs) {
          saves++;
          const k = dateKey(e.t), h = new Date(e.t).getHours();
          if (e.delta > 0) {
            added += e.delta;
            dayMap[k] = (dayMap[k] || 0) + e.delta;
            hourMap[h] += e.delta;
            hourDayMap[k + '#' + h] = (hourDayMap[k + '#' + h] || 0) + e.delta;
          } else deleted += -e.delta;
          if (lastT && e.t - lastT <= 5 * 60000) activeMs += e.t - lastT;
          else sessions++;
          lastT = e.t;
        }
        const days = Math.max(7, Math.min(730, parseInt(u.searchParams.get('days'), 10) || 90));
        const t0 = new Date(); t0.setHours(0, 0, 0, 0);
        const daily = [];
        for (let i = days - 1; i >= 0; i--) {
          const k = dateKey(t0.getTime() - i * 86400000);
          daily.push({ d: k, w: dayMap[k] || 0 });
        }
        const todayKey = dateKey(Date.now());
        const week = daily.slice(-7).reduce((a, x) => a + x.w, 0);
        const month = daily.slice(-30).reduce((a, x) => a + x.w, 0);
        const allDays = Object.keys(dayMap).filter((k) => dayMap[k] > 0).sort();
        let longest = 0, run = 0, prev = null;
        for (const k of allDays) {
          if (prev && (new Date(k + 'T00:00:00') - new Date(prev + 'T00:00:00')) === 86400000) run++;
          else run = 1;
          if (run > longest) longest = run;
          prev = k;
        }
        let cur = 0;
        const has = (k) => (dayMap[k] || 0) > 0;
        let cursor = new Date(t0.getTime());
        if (!has(dateKey(cursor.getTime()))) cursor = new Date(cursor.getTime() - 86400000);
        while (has(dateKey(cursor.getTime()))) { cur++; cursor = new Date(cursor.getTime() - 86400000); }
        let breaks = 0;
        const firstIdx = daily.findIndex((x) => x.w > 0);
        if (firstIdx >= 0) for (let i = firstIdx + 1; i < daily.length - 1; i++) if (daily[i].w === 0) breaks++;
        const activeMinutes = Math.round(activeMs / 60000);
        const pomodoros = Math.floor(activeMinutes / 25);
        let peakHour = 0;
        Object.keys(hourDayMap).forEach((k) => { if (hourDayMap[k] > peakHour) peakHour = hourDayMap[k]; });
        const createdAt = Date.parse(p.createdAt) || Date.now();
        return json(res, {
          project: p.id, today: dayMap[todayKey] || 0, week, month,
          totalAdded: added, deletedWords: deleted, saves, sessions,
          activeMinutes, pomodoros, avgSpeed: activeMinutes > 0 ? Math.round(added / (activeMinutes / 60)) : 0,
          peakHour, activeDays: daily.filter((x) => x.w > 0).length,
          currentStreak: cur, longestStreak: longest, breaks,
          maxDay: allDays.length ? Math.max.apply(null, allDays.map((k) => dayMap[k])) : 0,
          ageDays: Math.max(1, Math.ceil((Date.now() - createdAt) / 86400000)),
          daily, hourly: hourMap,
          lastWrite: evs.length ? new Date(evs[evs.length - 1].t).toISOString() : null
        });
      }
      // 本地备份快照
      if (parts[1] === 'backup' && req.method === 'POST') {
        const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
        const fn = 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        const fp = path.join(dir, fn);
        fs.writeFileSync(fp, JSON.stringify(DB));
        return json(res, { ok: true, file: fn, size: fs.statSync(fp).size, at: now() });
      }
      // settings
      if (parts[1] === 'settings') {
        if (req.method === 'GET') return json(res, DB.settings || {});
        if (req.method === 'PUT' || req.method === 'POST') {
          const b = await readBody(req);
          DB.settings = Object.assign(DB.settings || {}, b);
          save();
          return json(res, DB.settings);
        }
      }
      if (parts[1] === 'stats' && req.method === 'GET') {
        const pid = u.searchParams.get('project');
        const p = pid ? findProject(pid) : DB.projects[0];
        if (!p) return json(res, { totalWords: 0, chapters: 0, projects: DB.projects.length });
        const words = p.chapters.reduce((a, c) => a + wc(c.content), 0);
        const genres = {}; p.characters.forEach((c) => { genres[c.role || '其他'] = (genres[c.role || '其他'] || 0) + 1; });
        return json(res, { project: p.id, title: p.title, totalWords: words, chapters: p.chapters.length, characters: p.characters.length, materials: p.materials.length, projects: DB.projects.length, genreMix: genres });
      }
      // AI chat
      // 联网搜索（DeepSeek Search API）
      if (parts[1] === 'ai' && parts[2] === 'search' && req.method === 'POST') {
        const b = await readBody(req);
        const q = String(b.query || '').trim().slice(0, 128);
        if (!q) return json(res, { error: '缺少搜索词' }, 400);
        const cfg = dsCfg();
        if (!cfg.key) return json(res, { error: '未配置 DeepSeek API Key' }, 500);
        try {
          const r = await fetch(cfg.base.replace(/\/+$/, '') + '/v1/tools/search', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
            body: JSON.stringify({ query: q, count: Math.min(20, Math.max(1, parseInt(b.count, 10) || 8)), need_content: !!b.need_content })
          });
          const t = await r.text();
          let j = null;
          try { j = JSON.parse(t); } catch (e) { }
          if (!r.ok) return json(res, { error: (j && j.error) || ('搜索失败 ' + r.status), detail: t.slice(0, 200) }, 502);
          return json(res, j || { results: [] });
        } catch (e) {
          return json(res, { error: String((e && e.message) || e) }, 502);
        }
      }
      // 抓取网页正文（DeepSeek Fetch API）
      if (parts[1] === 'ai' && parts[2] === 'fetch' && req.method === 'POST') {
        const b = await readBody(req);
        const u = String(b.url || '').trim();
        if (!/^https?:\/\//i.test(u)) return json(res, { error: '无效 URL' }, 400);
        const cfg = dsCfg();
        if (!cfg.key) return json(res, { error: '未配置 DeepSeek API Key' }, 500);
        try {
          const r = await fetch(cfg.base.replace(/\/+$/, '') + '/v1/tools/fetch', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
            body: JSON.stringify({ url: u })
          });
          const t = await r.text();
          let j = null;
          try { j = JSON.parse(t); } catch (e) { }
          if (!r.ok) return json(res, { error: (j && j.error) || ('抓取失败 ' + r.status) }, 502);
          return json(res, j || {});
        } catch (e) {
          return json(res, { error: String((e && e.message) || e) }, 502);
        }
      }
      // AI chat 流式（SSE）
      if (parts[1] === 'ai' && parts[2] === 'chat' && parts[3] === 'stream' && req.method === 'POST') {
        const b = await readBody(req);
        let msgs = b.messages || [{ role: 'user', content: b.prompt || '' }];
        if (b.project) {
          const p = findProject(b.project);
          if (p) {
            const ctx = buildContext(p, b.chapterId || '');
            if (ctx) msgs = [{ role: 'system', content: '【作品记忆】\n' + ctx }, ...msgs];
          }
        }
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        try {
          const out = await aiChatStreamEx(msgs, Math.min(8000, Math.max(1200, parseInt(b.maxTokens, 10) || 6000)), b.temperature == null ? 0.85 : b.temperature, (d) => {
            try { res.write('data: ' + JSON.stringify({ delta: d }) + '\n\n'); } catch (e) { }
          }, b.model || undefined);
          res.write('data: ' + JSON.stringify({ done: true, text: out.text, finishReason: out.finishReason }) + '\n\n');
          res.end();
        } catch (e) {
          res.write('data: ' + JSON.stringify({ error: String((e && e.message) || e) }) + '\n\n');
          res.end();
        }
        return;
      }
      // AI chat
      if (parts[1] === 'ai' && parts[2] === 'chat' && !parts[3] && req.method === 'POST') {
        const b = await readBody(req);
        let msgs = b.messages || [{ role: 'user', content: b.prompt || '' }];
        if (b.project) {
          const p = findProject(b.project);
          if (p) {
            const ctx = buildContext(p, b.chapterId || '');
            if (ctx) msgs = [{ role: 'system', content: '【作品记忆】\n' + ctx }, ...msgs];
          }
        }
        let text;
        try {
          text = await aiChat(msgs, b.maxTokens || 2000, b.temperature == null ? 0.8 : b.temperature, b.model || undefined);
        } catch (e) {
          if (b.model) {
            text = await aiChat(msgs, b.maxTokens || 2000, b.temperature == null ? 0.8 : b.temperature);
          } else if (dsCfg().model !== 'deepseek-flash') {
            // 默认模型不可用时自动降级到 flash，避免工具箱整体生成失败
            text = await aiChat(msgs, b.maxTokens || 2000, b.temperature == null ? 0.8 : b.temperature, 'deepseek-flash');
          } else {
            throw e;
          }
        }
        return json(res, { text });
      }
      // AI write (续写/润色/大纲)
      if (parts[1] === 'ai' && parts[2] === 'write' && req.method === 'POST') {
        const b = await readBody(req);
        const sys = b.system || '你是中文小说写作助手。文风自然、克制、有画面感；不要解释、不要加标题，只输出正文。';
        let prompt = b.prompt || ('请续写下面这段小说正文：\n\n' + (b.context || ''));
        if (b.project) {
          const p = findProject(b.project);
          if (p) {
            const ctx = buildContext(p, b.chapterId || '');
            if (ctx) prompt = '【作品记忆】\n' + ctx + '\n\n' + prompt;
          }
        }
        const text = await aiProse([{ role: 'system', content: sys + '\n\n' + PROSE_CRAFT }, { role: 'user', content: prompt }], b.maxTokens || 1600, b.temperature == null ? 0.85 : b.temperature);
        return json(res, { text });
      }
      // 人化 / 去 AI 味（后端统一提示词）
      if (parts[1] === 'ai' && (parts[2] === 'humanize' || parts[2] === 'deai') && req.method === 'POST') {
        const b = await readBody(req);
        const text = String(b.text || '').trim();
        if (!text) return json(res, { error: '文本为空' }, 400);
        const sys = parts[2] === 'humanize' ? HUMANIZER_SYS : DEAI_SYS;
        const extra = [];
        if (b.strength) extra.push('改写强度：' + b.strength);
        if (b.tone) extra.push('叙述口吻：' + b.tone);
        if (b.platform) extra.push('发布平台：' + b.platform);
        const prompt = (extra.length ? '【要求】' + extra.join('；') + '\n\n' : '') + '【正文】\n' + text;
        const out = await aiChat(
          [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
          Math.min(2400, Math.max(800, Math.round(wc(text) * 2))),
          parts[2] === 'humanize' ? 0.85 : 0.8
        );
        return json(res, { text: out });
      }
      // 长篇写作：雪花法大纲（DeepSeek 长篇提示词）
      if (parts[1] === 'ai' && parts[2] === 'novel' && parts[3] === 'plan' && req.method === 'POST') {
        const b = await readBody(req);
        let base = '标题：' + (b.title || '未命名') + '\n类型：' + (b.genre || '未定') + '\n核心创意：' + (b.premise || '') + '\n目标章数：' + (b.chapters || 12) + '\n';
        if (b.project) {
          const p = findProject(b.project);
          if (p) base = '【已有作品记忆】\n' + buildContext(p, b.chapterId || '') + '\n\n' + base;
        }
        let out = await aiChat([{ role: 'system', content: NOVEL_PLAN_SYS }, { role: 'user', content: base }], 6000, 0.7);
        let obj = null;
        try { obj = JSON.parse(out); } catch { const s = out.indexOf('{'), e = out.lastIndexOf('}'); if (s >= 0 && e > s) { try { obj = JSON.parse(out.slice(s, e + 1)); } catch { } } }
        if (!obj) {
          out = await aiChat([{ role: 'system', content: NOVEL_PLAN_SYS }, { role: 'user', content: base + '\n\n再次强调：只输出完整、可解析的 JSON；章节控制在 8 章以内，brief 60 字以内。' }], 6000, 0.4);
          try { obj = JSON.parse(out); } catch { const s = out.indexOf('{'), e = out.lastIndexOf('}'); if (s >= 0 && e > s) { try { obj = JSON.parse(out.slice(s, e + 1)); } catch { } } }
        }
        if (!obj) return json(res, { error: '大纲解析失败', raw: out.slice(0, 300) }, 502);
        return json(res, { plan: obj });
      }
      // 长篇写作：流式写一章（SSE，边写边返回）
      if (parts[1] === 'ai' && parts[2] === 'novel' && parts[3] === 'chapter' && parts[4] === 'stream' && req.method === 'POST') {
        const b = await readBody(req);
        let ctx = '';
        if (b.project) {
          const p = findProject(b.project);
          if (p) ctx = buildContext(p, b.chapterId || '');
        }
        const words = Math.max(500, Math.min(8000, parseInt(b.words, 10) || 2500));
        const user = '【本章节拍】\n' + (b.beats || '（按记忆与前文自然推进）') + '\n【目标字数】约 ' + words + ' 字：必须写满，允许 ±10%，用场景、动作、对白与心理写足，不得用概述代替。\n'
          + (ctx ? ('【作品记忆】\n' + ctx + '\n') : '')
          + '【硬性要求】严格按本章节拍推进，开头承接上一章结尾；不跳章、不提前写后面的剧情、不新增未经作者确认的核心设定。只输出本章正文。\n再次强调：本章只能写【本章节拍】里的内容，人物与地点不得更换，不得另起一个故事。';
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        try {
          const full = await aiProseStream(
            [{ role: 'system', content: NOVEL_CHAPTER_SYS }, { role: 'user', content: user }],
            Math.min(8000, Math.max(3000, words * 2)),
            b.temperature == null ? 0.85 : b.temperature,
            (d) => { try { res.write('data: ' + JSON.stringify({ delta: d }) + '\n\n'); } catch (e) { } }
          );
          res.write('data: ' + JSON.stringify({ done: true, text: full }) + '\n\n');
          res.end();
        } catch (e) {
          res.write('data: ' + JSON.stringify({ error: String((e && e.message) || e) }) + '\n\n');
          res.end();
        }
        return;
      }
      // 长篇写作：按本章节拍写一章（自动带记忆上下文）
      if (parts[1] === 'ai' && parts[2] === 'novel' && parts[3] === 'chapter' && !parts[4] && req.method === 'POST') {
        const b = await readBody(req);
        let ctx = '';
        if (b.project) {
          const p = findProject(b.project);
          if (p) ctx = buildContext(p, b.chapterId || '');
        }
        const words = Math.max(500, Math.min(8000, parseInt(b.words, 10) || 2500));
        const user = '【本章节拍】\n' + (b.beats || '（按记忆与前文自然推进）') + '\n【目标字数】约 ' + words + ' 字：必须写满，允许 ±10%，用场景、动作、对白与心理写足，不得用概述代替。\n'
          + (ctx ? ('【作品记忆】\n' + ctx + '\n') : '')
          + '【硬性要求】严格按本章节拍推进，开头承接上一章结尾；不跳章、不提前写后面的剧情、不新增未经作者确认的核心设定。只输出本章正文。\n再次强调：本章只能写【本章节拍】里的内容，人物与地点不得更换，不得另起一个故事。';
        const text = await aiProse([{ role: 'system', content: NOVEL_CHAPTER_SYS }, { role: 'user', content: user }], Math.min(8000, Math.max(3000, words * 2)), b.temperature == null ? 0.85 : b.temperature);
        return json(res, { text });
      }
      // 穿书：AI 推演世界线（关系 / 信任 / 热度 / 偏移）
      if (parts[1] === 'ai' && parts[2] === 'transmigrate' && req.method === 'POST') {
        const b = await readBody(req);
        const sys = '你是中文「穿书」互动小说的剧情推演器。根据底本、节点、人物、关系与用户的抉择，推演世界线状态。只输出一个 JSON 对象，不要 markdown、不要解释。格式：{"reply":"给作者的一步写作提示，60~120字，具体可写","shift":整数0-100,"people":[{"id":"...","trust":0-100,"heat":0-100}],"relations":[{"a":"..","b":"..","label":"..","value":0-100}]}。shift 为偏移度的新绝对值：顺势小幅回落，试探小升，改变这一幕明显上升；幅度要与对原著剧情的扰动程度相称，单次变化不超过 15。people 按传入 id 返回全部人物；relations 返回更新后的全部关系。';
        const user = JSON.stringify({ book: b.book, chapter: b.chapter, node: b.node, identity: b.identity, mode: b.mode, system: b.system, focus: b.focus, decision: b.decision, shift: b.shift, people: b.people || [], relations: b.relations || [] });
        function parseJson(text) {
          try { return JSON.parse(text); } catch {
            const s = text.indexOf('{'), e = text.lastIndexOf('}');
            if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch { } }
            return null;
          }
        }
        let text = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], 900, 0.7);
        let obj = parseJson(text);
        if (!obj) {
          text = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: user + '\n\n再次强调：只输出合法 JSON 对象，第一个字符必须是 {，最后一个字符必须是 }。' }], 900, 0.2);
          obj = parseJson(text);
        }
        if (!obj) {
          return json(res, {
            fallback: true,
            reply: String(text || '').replace(/[{}"\\]/g, '').replace(/\s+/g, ' ').slice(0, 160) || '已记下这一步，把它写成「动作 + 对方反应」两拍。',
            shift: typeof b.shift === 'number' ? b.shift : 0,
            people: b.people || [], relations: b.relations || []
          });
        }
        return json(res, obj);
      }
      return json(res, { error: 'not found' }, 404);
    }

    // ── 静态文件 ──
    let file = parts.length ? parts.join('/') : 'index.html';
    const fp = path.join(ROOT, decodeURIComponent(file));
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache'
    });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});
server.listen(PORT, '127.0.0.1', () => {
  try { fs.writeFileSync(path.join(DATA_DIR, 'server.pid'), String(process.pid)); } catch { }
  console.log('qibi → http://127.0.0.1:' + PORT);
});
