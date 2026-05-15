/**
 * MiniMap.ts
 * 小地图 UI 组件：在左上角绘制等边三角形缩略图，实时显示：
 *   - 三阵营角点（阵营色，出局后显示×）
 *   - 祭坛中心点（动态颜色）
 *   - 各阵营兵力强度（彩色小点密度）
 * 挂载于 Battle 场景 BattleUI Canvas 下的 MiniMapRoot 节点。
 */
import {
    _decorator, Component, Node, Label, Color, UITransform,
    Graphics, Vec2,
} from 'cc';
import { GameManager, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { hexToColor, FACTION_COLORS, COLOR_NEUTRAL } from '../faction/FactionData';

const { ccclass, property } = _decorator;

/** 小地图显示半径（CSS 像素） */
const MAP_HALF = 60;

/** 三角形顶点（归一化到 [-1,1] 坐标系，与世界坐标对应）：
 *   世界坐标: Wei(-14,10), Shu(14,10), Wu(0,-16)
 *   地图 X: [−14,14] → [−1,1]
 *   地图 Z: [−16,10] → [1,−1]（Z 轴翻转为 Y 轴）
 */
const WORLD_X_RANGE = 14;
const WORLD_Z_MIN   = -16;
const WORLD_Z_MAX   = 10;

function worldToMinimap(wx: number, wz: number): Vec2 {
    const nx =  wx / WORLD_X_RANGE;
    const ny = -(wz - WORLD_Z_MIN) / (WORLD_Z_MAX - WORLD_Z_MIN) * 2 + 1;
    return new Vec2(nx * MAP_HALF, ny * MAP_HALF);
}

@ccclass('MiniMap')
export class MiniMap extends Component {
    @property(Graphics) canvas: Graphics | null = null;

    /** 各阵营角标 Label（编辑器绑定或代码创建） */
    @property([Label]) cornerLabels: Label[] = [];

    private _updateTimer: number = 0;
    private static readonly UPDATE_INTERVAL = 0.5;

    onLoad(): void {
        EventManager.on(GameEvent.FACTION_ELIMINATED, this._onEliminated, this);
        EventManager.on(GameEvent.ALTAR_CAPTURED,     this._redraw,       this);
        EventManager.on(GameEvent.ALTAR_NEUTRAL,      this._redraw,       this);
    }

    onDestroy(): void {
        EventManager.targetOff(this);
    }

    update(dt: number): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        this._updateTimer += dt;
        if (this._updateTimer >= MiniMap.UPDATE_INTERVAL) {
            this._updateTimer = 0;
            this._redraw();
        }
    }

    private _redraw(): void {
        const g = this.canvas;
        if (!g) return;
        g.clear();

        const gm = GameManager.inst;
        if (!gm) return;

        // ─── 背景三角形轮廓 ───────────────────────────────────────────
        g.lineWidth = 1;
        g.strokeColor = new Color(180, 180, 180, 200);
        g.fillColor   = new Color(20, 20, 20, 160);
        const wPts = [
            worldToMinimap(-14, 10),
            worldToMinimap(14, 10),
            worldToMinimap(0, -16),
        ];
        g.moveTo(wPts[0].x, wPts[0].y);
        g.lineTo(wPts[1].x, wPts[1].y);
        g.lineTo(wPts[2].x, wPts[2].y);
        g.close();
        g.fill();
        g.stroke();

        // ─── 河道（简化线条） ─────────────────────────────────────────
        g.lineWidth = 3;
        g.strokeColor = new Color(80, 144, 204, 140);
        const altarPt = worldToMinimap(0, 1.3);
        const riverEnds = [worldToMinimap(0, 10.5), worldToMinimap(7, -3.3), worldToMinimap(-7, -3.3)];
        for (const re of riverEnds) {
            g.moveTo(altarPt.x, altarPt.y);
            g.lineTo(re.x, re.y);
            g.stroke();
        }

        // ─── 祭坛 ────────────────────────────────────────────────────
        const altarState = gm.altarOwner;
        const altarCol = altarState
            ? hexToColor(FACTION_COLORS[altarState] ?? COLOR_NEUTRAL)
            : new Color(140, 140, 140, 220);
        g.fillColor = altarCol;
        g.circle(altarPt.x, altarPt.y, 5);
        g.fill();

        // ─── 各阵营兵力热度（小点） ───────────────────────────────────
        const targets = gm.getTargets();
        for (const t of targets) {
            if (t.isBuilding) continue;
            const f = gm.getFactionState(t.factionId);
            if (!f?.alive) continue;
            const col = hexToColor(FACTION_COLORS[t.factionId] ?? '#ffffff', 0.7);
            g.fillColor = col;
            const mp = worldToMinimap(t.position.x, t.position.z);
            g.circle(mp.x, mp.y, 1.5);
            g.fill();
        }

        // ─── 主城角点 ────────────────────────────────────────────────
        const factions = ['wei', 'shu', 'wu'];
        const castleWPts = [
            worldToMinimap(-14, 10),
            worldToMinimap(14, 10),
            worldToMinimap(0, -16),
        ];
        factions.forEach((fId, i) => {
            const f = gm.getFactionState(fId);
            const col = hexToColor(FACTION_COLORS[fId] ?? '#888888', f?.alive ? 1 : 0.3);
            g.fillColor   = col;
            g.strokeColor = new Color(255, 255, 255, 200);
            g.lineWidth   = 1;
            const pt = castleWPts[i];
            g.circle(pt.x, pt.y, 5);
            g.fill();
            g.stroke();

            // 出局后画 ×
            if (!f?.alive) {
                g.strokeColor = new Color(255, 50, 50, 255);
                g.lineWidth   = 2;
                g.moveTo(pt.x - 5, pt.y - 5); g.lineTo(pt.x + 5, pt.y + 5); g.stroke();
                g.moveTo(pt.x + 5, pt.y - 5); g.lineTo(pt.x - 5, pt.y + 5); g.stroke();
            }
        });
    }

    private _onEliminated(_fId: string): void {
        this._redraw();
    }
}
