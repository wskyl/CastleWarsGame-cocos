/**
 * RouteManager.ts
 * 集结旗系统：允许玩家切换己方兵营的进攻路线。
 * 每个兵营关联的 TroopSpawner.laneKey 可被动态修改。
 * 挂载于 Battle 场景的 RouteRoot 节点。
 *
 * 使用方式：
 *   RouteManager.inst.cycleBarracksRoute(barracks);
 *   // BattleUI 中为每个兵营提供切换按钮
 */
import { _decorator, Component } from 'cc';
import { GameManager } from '../core/GameManager';
import { Barracks } from '../buildings/Barracks';
import { TroopSpawner } from '../units/TroopSpawner';

const { ccclass } = _decorator;

/** 每个阵营可选路线表（按顺序循环） */
const FACTION_LANES: Record<string, string[][]> = {
    wei: [
        ['wei_shu', 'wu_wei_rev'],   // Slot0 主攻蜀，Slot1 主攻吴（默认）
        ['wu_wei_rev', 'wei_shu'],   // Slot0 主攻吴，Slot1 主攻蜀
        ['wei_shu', 'wei_shu'],      // 双路全压蜀
        ['wu_wei_rev', 'wu_wei_rev'],// 双路全压吴
    ],
    shu: [
        ['wei_shu_rev', 'shu_wu'],
        ['shu_wu', 'wei_shu_rev'],
        ['wei_shu_rev', 'wei_shu_rev'],
        ['shu_wu', 'shu_wu'],
    ],
    wu: [
        ['wu_wei', 'shu_wu_rev'],
        ['shu_wu_rev', 'wu_wei'],
        ['wu_wei', 'wu_wei'],
        ['shu_wu_rev', 'shu_wu_rev'],
    ],
};

@ccclass('RouteManager')
export class RouteManager extends Component {
    private static _inst: RouteManager | null = null;
    static get inst(): RouteManager | null { return RouteManager._inst; }

    /** 当前每阵营的路线方案索引 */
    private _routeIndex: Map<string, number> = new Map();

    onLoad(): void { RouteManager._inst = this; }
    onDestroy(): void { if (RouteManager._inst === this) RouteManager._inst = null; }

    /** 获取当前路线方案名称（用于 UI 显示） */
    getCurrentRouteName(factionId: string): string {
        const idx = this._routeIndex.get(factionId) ?? 0;
        const lanes = FACTION_LANES[factionId];
        if (!lanes || idx >= lanes.length) return '默认';
        const pair = lanes[idx];
        return `路线 ${idx + 1}：${pair[0]} | ${pair[1]}`;
    }

    /**
     * 切换到下一路线方案（轮回），并更新对应兵营的 TroopSpawner.laneKey。
     * @param barracksArray 该阵营的两个 Barracks 组件（Slot0, Slot1）
     */
    cycleRoute(factionId: string, barracksArray: Barracks[]): void {
        const lanes = FACTION_LANES[factionId];
        if (!lanes || lanes.length === 0) return;

        const cur = this._routeIndex.get(factionId) ?? 0;
        const next = (cur + 1) % lanes.length;
        this._routeIndex.set(factionId, next);

        const laneKeys = lanes[next];
        barracksArray.forEach((b, i) => {
            if (!b || !b.isBuilt) return;
            const newKey = laneKeys[i] ?? laneKeys[0];
            b.laneKey = newKey;
            const spawner = b.node.getComponent(TroopSpawner);
            if (spawner) spawner.laneKey = newKey;
        });
    }

    /** 直接设置指定兵营的路线 */
    setBarracksRoute(barracks: Barracks, laneKey: string): void {
        if (!barracks || !barracks.isBuilt) return;
        barracks.laneKey = laneKey;
        const spawner = barracks.node.getComponent(TroopSpawner);
        if (spawner) spawner.laneKey = laneKey;
    }
}
