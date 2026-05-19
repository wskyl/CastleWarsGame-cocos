const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.APP_PORT || 8912;
const COCOS_PROJECT = __dirname;

const CONFIGS_DIR = path.join(COCOS_PROJECT, 'assets', 'configs');
const SCRIPTS_DIR = path.join(COCOS_PROJECT, 'assets', 'scripts');
const SCENES_DIR = path.join(COCOS_PROJECT, 'assets', 'scenes');

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function listDir(dir, ext) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(ext) && !f.endsWith('.meta'))
      .map(f => f.replace(ext, ''));
  } catch (e) {
    return [];
  }
}

function readTsFile(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name + '.ts'), 'utf-8');
  } catch (e) {
    return '// File not found';
  }
}

const factions = loadJson(path.join(CONFIGS_DIR, 'factions.json'));
const generals = loadJson(path.join(CONFIGS_DIR, 'generals.json'));
const troops = loadJson(path.join(CONFIGS_DIR, 'troops.json'));
const buildings = loadJson(path.join(CONFIGS_DIR, 'buildings.json'));
const economy = loadJson(path.join(CONFIGS_DIR, 'economy.json'));
const aiConfig = loadJson(path.join(CONFIGS_DIR, 'ai.json'));
const mapConfig = loadJson(path.join(CONFIGS_DIR, 'map.json'));
const towers = loadJson(path.join(CONFIGS_DIR, 'towers.json'));

const scriptDirs = fs.readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => ({
    name: d.name,
    scripts: listDir(path.join(SCRIPTS_DIR, d.name), '.ts')
  }));

const scenes = listDir(SCENES_DIR, '.scene');

const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>三国争锋 Castle Wars - Cocos Creator 项目预览</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e1a; color: #e0e0e0; min-height: 100vh; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 30px 40px; border-bottom: 2px solid #e94560; }
  .header h1 { font-size: 28px; color: #e94560; margin-bottom: 6px; }
  .header p { color: #8899aa; font-size: 14px; }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
  .tab { padding: 10px 20px; background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 6px 6px 0 0; cursor: pointer; color: #8899aa; font-size: 14px; transition: all 0.2s; }
  .tab:hover { background: #16213e; color: #e0e0e0; }
  .tab.active { background: #0f3460; color: #e94560; border-bottom-color: #0f3460; }
  .panel { display: none; background: #12162a; border: 1px solid #2a2a4e; border-radius: 0 8px 8px 8px; padding: 24px; }
  .panel.active { display: block; }
  .card { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .card h3 { color: #e94560; font-size: 16px; margin-bottom: 10px; }
  .faction-wei { border-left: 3px solid #3366CC; }
  .faction-shu { border-left: 3px solid #33AA44; }
  .faction-wu { border-left: 3px solid #CC3333; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #0f3460; color: #e94560; padding: 8px 10px; text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #2a2a4e; }
  tr:hover td { background: rgba(15,52,96,0.3); }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin: 2px; background: #0f3460; color: #8899aa; }
  .skill-box { background: #0a0e1a; border: 1px solid #2a2a4e; border-radius: 6px; padding: 10px; margin-top: 8px; }
  .skill-box .skill-name { color: #ffd700; font-size: 14px; font-weight: bold; }
  .code-view { background: #0a0e1a; border: 1px solid #2a2a4e; border-radius: 6px; padding: 14px; font-family: 'Fira Code', monospace; font-size: 12px; overflow-x: auto; white-space: pre-wrap; max-height: 500px; overflow-y: auto; line-height: 1.5; }
  .script-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .script-btn { padding: 6px 14px; background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 4px; cursor: pointer; color: #8899aa; font-size: 12px; transition: all 0.2s; }
  .script-btn:hover { background: #0f3460; color: #e0e0e0; }
  .script-btn.active { background: #0f3460; color: #e94560; border-color: #e94560; }
  .scene-card { background: linear-gradient(135deg, #1a1a2e, #16213e); border: 1px solid #2a2a4e; border-radius: 8px; padding: 20px; text-align: center; }
  .scene-card .scene-icon { font-size: 48px; margin-bottom: 10px; }
  .scene-card .scene-name { font-size: 18px; color: #e94560; margin-bottom: 6px; }
  .scene-card .scene-desc { color: #8899aa; font-size: 13px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: bold; }
  .status-ok { background: #1a3a1a; color: #33AA44; }
  .status-warn { background: #3a3a1a; color: #ffd700; }
  .status-error { background: #3a1a1a; color: #e94560; }
  .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat-box { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 8px; padding: 16px 24px; text-align: center; min-width: 120px; }
  .stat-box .stat-num { font-size: 28px; color: #e94560; font-weight: bold; }
  .stat-box .stat-label { font-size: 12px; color: #8899aa; margin-top: 4px; }
  .arrow { color: #e94560; font-weight: bold; margin: 0 8px; }
</style>
</head>
<body>
<div class="header">
  <h1>三国争锋 Castle Wars</h1>
  <p>Cocos Creator 3.8 项目预览 &mdash; 项目元数据已修复，可正常导入编辑器</p>
</div>
<div class="container">
  <div class="tabs">
    <div class="tab active" onclick="showTab('overview')">项目概览</div>
    <div class="tab" onclick="showTab('factions')">阵营 & 武将</div>
    <div class="tab" onclick="showTab('troops')">兵种</div>
    <div class="tab" onclick="showTab('buildings')">建筑</div>
    <div class="tab" onclick="showTab('scenes')">场景</div>
    <div class="tab" onclick="showTab('scripts')">脚本代码</div>
    <div class="tab" onclick="showTab('config')">配置数据</div>
  </div>

  <div id="panel-overview" class="panel active">
    <div class="stats">
      <div class="stat-box"><div class="stat-num">3</div><div class="stat-label">阵营</div></div>
      <div class="stat-box"><div class="stat-num">3</div><div class="stat-label">武将</div></div>
      <div class="stat-box"><div class="stat-num">9</div><div class="stat-label">兵种</div></div>
      <div class="stat-box"><div class="stat-num">5</div><div class="stat-label">建筑类型</div></div>
      <div class="stat-box"><div class="stat-num">3</div><div class="stat-label">场景</div></div>
      <div class="stat-box"><div class="stat-num">31</div><div class="stat-label">脚本文件</div></div>
    </div>
    <div class="card">
      <h3>项目修复状态</h3>
      <table>
        <tr><th>检查项</th><th>状态</th><th>说明</th></tr>
        <tr><td>.ts.meta importer</td><td><span class="status-badge status-ok">已修复</span></td><td>31个文件: "typescript" → "script"</td></tr>
        <tr><td>.ts.meta ver</td><td><span class="status-badge status-ok">已修复</span></td><td>31个文件: "1.1.0" → "1.0.0"</td></tr>
        <tr><td>场景文件</td><td><span class="status-badge status-ok">已创建</span></td><td>MainMenu / FactionSelect / Battle</td></tr>
        <tr><td>engine.json</td><td><span class="status-badge status-ok">已添加</span></td><td>settings/v2/packages/engine.json</td></tr>
        <tr><td>目录 meta files</td><td><span class="status-badge status-ok">已修复</span></td><td>12个目录的 files 数组已填充</td></tr>
        <tr><td>JSON 配置根类型</td><td><span class="status-badge status-ok">已修复</span></td><td>factions/generals/troops.json 数组根→对象根</td></tr>
        <tr><td>startScene</td><td><span class="status-badge status-ok">已设置</span></td><td>指向 MainMenu 场景</td></tr>
      </table>
    </div>
    <div class="card">
      <h3>游戏流程</h3>
      <p style="line-height:2.2;font-size:15px;">
        <span style="color:#e94560;font-weight:bold;">主菜单</span>
        <span class="arrow">→</span>
        <span style="color:#33AA44;font-weight:bold;">选择阵营</span>（魏 / 蜀 / 吴）
        <span class="arrow">→</span>
        <span style="color:#3366CC;font-weight:bold;">战斗场景</span>（自动出兵 + 策略技能）
        <span class="arrow">→</span>
        <span style="color:#ffd700;font-weight:bold;">结算</span>
      </p>
    </div>
    <div class="card">
      <h3>项目结构</h3>
      <div class="code-view">assets/
├── configs/          # 游戏配置数据 (8个JSON)
│   ├── ai.json       # AI策略配置
│   ├── buildings.json # 建筑属性
│   ├── economy.json   # 经济系统
│   ├── factions.json  # 阵营定义
│   ├── generals.json  # 武将数据
│   ├── map.json       # 地图配置
│   ├── towers.json    # 防御塔
│   └── troops.json    # 兵种数据
├── scenes/           # 游戏场景
│   ├── MainMenu.scene
│   ├── FactionSelect.scene
│   └── Battle.scene
└── scripts/          # TypeScript 脚本
    ├── ai/           # AI控制器
    ├── buildings/    # 建筑逻辑
    ├── core/         # 核心系统 (6个)
    ├── faction/      # 阵营管理
    ├── generals/     # 武将系统
    ├── map/          # 地图系统
    ├── scenes/       # 场景初始化
    ├── systems/      # 音频 & 路由
    ├── ui/           # 界面组件
    └── units/        # 兵种 & 投射物</div>
    </div>
  </div>

  <div id="panel-factions" class="panel">
    <div class="grid">
      ${(factions?.list || factions || []).map(f => `
      <div class="card faction-${f.factionId}">
        <h3>${f.displayName} (${f.factionId.toUpperCase()})</h3>
        <p>颜色: <span style="color:${f.color}">${f.color}</span> | 水战免疫: ${f.riverImmune ? '是' : '否'}</p>
        ${(generals?.list || generals || []).filter(g => g.factionId === f.factionId).map(g => `
        <div class="skill-box">
          <div class="skill-name">${g.name} <span class="tag">武将</span></div>
          <p style="margin:6px 0;color:#8899aa">HP: ${g.hp} | ATK: ${g.atk} | 间隔: ${g.atkInterval}s | 射程: ${g.atkRange} | 速度: ${g.moveSpeed}</p>
          <p style="margin:4px 0;"><strong style="color:#ffd700">${g.skill.name}</strong>: ${g.skill.description}</p>
          <p style="color:#666;font-size:11px">CD: ${g.skill.cooldown}s | 持续: ${g.skill.duration}s | 类型: ${g.skill.type}</p>
        </div>`).join('')}
      </div>`).join('')}
    </div>
  </div>

  <div id="panel-troops" class="panel">
    <div class="card">
      <h3>全部兵种</h3>
      <table>
        <tr><th>兵种</th><th>阵营</th><th>阶</th><th>HP</th><th>ATK</th><th>间隔</th><th>速度</th><th>射程</th><th>费用</th><th>标签</th></tr>
        ${(troops?.list || troops || []).map(t => `
        <tr>
          <td>${t.name}</td>
          <td><span style="color:${t.factionId==='wei'?'#3366CC':t.factionId==='shu'?'#33AA44':'#CC3333'}">${t.factionId.toUpperCase()}</span></td>
          <td>T${t.tier}</td>
          <td>${t.hp}</td>
          <td>${t.atk}</td>
          <td>${t.atkInterval}s</td>
          <td>${t.moveSpeed}</td>
          <td>${t.atkRange}</td>
          <td>${t.spawnCost}</td>
          <td>${t.tags.map(tag=>'<span class="tag">'+tag+'</span>').join('')}</td>
        </tr>`).join('')}
      </table>
    </div>
  </div>

  <div id="panel-buildings" class="panel">
    <div class="card">
      <h3>建筑配置</h3>
      <div class="code-view">${JSON.stringify(buildings, null, 2)}</div>
    </div>
    <div class="card">
      <h3>防御塔配置</h3>
      <div class="code-view">${JSON.stringify(towers, null, 2)}</div>
    </div>
  </div>

  <div id="panel-scenes" class="panel">
    <div class="grid">
      <div class="scene-card">
        <div class="scene-icon">🏠</div>
        <div class="scene-name">MainMenu</div>
        <div class="scene-desc">主菜单场景 - 游戏入口</div>
        <p style="margin-top:10px"><span class="status-badge status-ok">startScene</span></p>
      </div>
      <div class="scene-card">
        <div class="scene-icon">⚔️</div>
        <div class="scene-name">FactionSelect</div>
        <div class="scene-desc">阵营选择 - 魏/蜀/吴</div>
      </div>
      <div class="scene-card">
        <div class="scene-icon">🏰</div>
        <div class="scene-name">Battle</div>
        <div class="scene-desc">战斗场景 - 自动对战</div>
      </div>
    </div>
  </div>

  <div id="panel-scripts" class="panel">
    ${scriptDirs.map(d => `
    <div class="card">
      <h3>${d.name}/</h3>
      <div class="script-list">
        ${d.scripts.map(s => `<div class="script-btn" onclick="loadScript('${d.name}','${s}')">${s}</div>`).join('')}
      </div>
      <div id="code-${d.name}" class="code-view">点击上方脚本名查看源码</div>
    </div>`).join('')}
  </div>

  <div id="panel-config" class="panel">
    <div class="card">
      <h3>经济系统</h3>
      <div class="code-view">${JSON.stringify(economy, null, 2)}</div>
    </div>
    <div class="card">
      <h3>AI配置</h3>
      <div class="code-view">${JSON.stringify(aiConfig, null, 2)}</div>
    </div>
    <div class="card">
      <h3>地图配置</h3>
      <div class="code-view">${JSON.stringify(mapConfig, null, 2)}</div>
    </div>
  </div>
</div>

<script>
function showTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('panel-' + id).classList.add('active');
}
function loadScript(dir, name) {
  fetch('/api/script?dir=' + dir + '&name=' + name)
    .then(r => r.text())
    .then(code => {
      document.getElementById('code-' + dir).textContent = code;
    });
}
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/script') {
    const dir = url.searchParams.get('dir');
    const name = url.searchParams.get('name');
    if (dir && name) {
      const safeDir = dir.replace(/[^a-zA-Z0-9_-]/g, '');
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
      const code = readTsFile(path.join(SCRIPTS_DIR, safeDir), safeName);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(code);
    } else {
      res.writeHead(400);
      res.end('Missing params');
    }
    return;
  }

  if (url.pathname === '/api/config') {
    const name = url.searchParams.get('name');
    const safeName = name ? name.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const data = loadJson(path.join(CONFIGS_DIR, safeName + '.json'));
    if (data) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', project: 'castle-wars-game-cocos', version: '1.0.0' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Castle Wars preview server running at http://0.0.0.0:' + PORT + '/');
});
