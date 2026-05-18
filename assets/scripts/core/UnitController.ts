/**
 * UnitController.ts  ── 单位调度控制器
 * 负责上层"下令"逻辑：何时往哪条路线派兵、何时全线推进、何时收缩防守。
 * 底层生成由 TroopSpawner 执行；AI 决策由 AIController 触发；
 * 本类作为二者的中间桥梁，同时供玩家 UI 调用。
 *
 * 持久单例：挂载在 GameBoot 节点上。
 */
import { _decorator, Component, director } from 'cc';
import { GameManager } from './GameManager';
import { EventManager, GameEvent } from './EventManager';
import { UnitManager } from './UnitManager';

const { ccclass } = _decorator;

// ─── 进军令类型 ─────────────────────────────────────────────────────────────
export type MarchOrder = 'normal' | 'reinforce' | 'all_in' | 'retreat';

export interface LaneMarchState {
    laneKey:  string;
    factionId: string;
    order:    MarchOrder;
    /** 当前路线上的兵力（由 UnitManager 实时查询后刷新） */
    troopCount: number;
}

@ccclass('UnitController')
export class UnitController extends Component {

    // ─── 单例 ──────────────────────────────────────────────────────────────
    private static _inst: UnitController | null = null;
    static get inst(): UnitController | null { return UnitController._inst; }

    // ─── 内部状态 ───────────────────────────────────────────────────────────
    /** factionId → laneKey → 当前指令 */
    private _orders: Map<string, Map<string, MarchOrder>> = new Map();

    // ─── 生命周期 ───────────────────────────────────────────────────────────
    onLoad(): void {
        if (UnitController._inst && UnitController._inst !== this) {
            this.destroy();
            return;
        }
        UnitController._inst = this;
        if (!director.isPersistRootNode(this.node)) {
            director.addPersistRootNode(this.node);
        }
    }

    onDestroy(): void {
        if (UnitController._inst === this) UnitController._inst = null;
    }

    // ─── 指令 API ───────────────────────────────────────────────────────────

    /**
     * 对某阵营的某路线下达进军令。
     * TroopSpawner 在决定派兵优先级时可查询本类。
     */
    setOrder(factionId: string, laneKey: string, order: MarchOrder): void {
        let fMap = this._orders.get(factionId);
        if (!fMap) { fMap = new Map(); this._orders.set(factionId, fMap); }
        fMap.set(laneKey, order);
        EventManager.emit(GameEvent.MARCH_ORDER_CHANGED); // 通知 UI 刷新行军路线按钮
    }

    /**
     * 获取某路线当前指令，默认 'normal'。
     */
    getOrder(factionId: string, laneKey: string): MarchOrder {
        return this._orders.get(factionId)?.get(laneKey) ?? 'normal';
    }

    /**
     * 对某阵营所有路线下达相同指令（全线推进 / 全线收缩）。
     */
    setOrderAll(factionId: string, order: MarchOrder): void {
        const gm = GameManager.inst;
        if (!gm) return;
        const lanes = Object.keys(gm.mapConfig?.lanes ?? {});
        lanes.forEach(lk => this.setOrder(factionId, lk, order));
    }

    /**
     * 返回某阵营优先级最高的进攻路线（兵力最少但仍在 normal/reinforce 状态）。
     * AIController 可调用此接口决定下一条派兵路线。
     */
    getPriorityLane(factionId: string): string | null {
        const gm = GameManager.inst;
        if (!gm) return null;
        const lanes = Object.keys(gm.mapConfig?.lanes ?? {});
        if (lanes.length === 0) return null;

        // 找出非 retreat 的路线中兵力最少的那条
        const fMap = this._orders.get(factionId);
        let best: string | null = null;
        let bestCount = Infinity;

        const um = UnitManager.inst;
        // 以总兵力 / 路线数估算各路线压力（完整版可按路线过滤）
        const totalTroops = um ? um.countUnits(factionId) : 0;
        const avgPerLane  = lanes.length > 0 ? totalTroops / lanes.length : 0;
        lanes.forEach(lk => {
            const ord = fMap?.get(lk) ?? 'normal';
            if (ord === 'retreat') return;
            if (avgPerLane < bestCount) { bestCount = avgPerLane; best = lk; }
        });
        return best ?? lanes[0];
    }

    /**
     * 清空某阵营所有指令（重开游戏时调用）。
     */
    clearOrders(factionId: string): void {
        this._orders.delete(factionId);
    }

    /** 清空全部指令 */
    clearAll(): void {
        this._orders.clear();
    }
}
