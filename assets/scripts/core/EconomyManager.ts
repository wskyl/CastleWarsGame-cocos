/**
 * EconomyManager.ts  ── 经济系统管理器
 * 专职管理各阵营市集加成、额外收入来源的注册与注销。
 * 基础收入 tick 由 GameManager.update() 驱动，本类只维护加成层级。
 *
 * 持久单例：挂载在 GameBoot 节点上，与 GameManager 共存。
 */
import { _decorator, Component, director } from 'cc';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

// ─── 收入加成记录 ───────────────────────────────────────────────────────────
export interface IncomeBonus {
    /** 加成来源唯一 id（如 'market_wei'） */
    sourceId: string;
    /** 归属阵营 */
    factionId: string;
    /** 每秒额外金币 */
    bonusPerSecond: number;
}

@ccclass('EconomyManager')
export class EconomyManager extends Component {

    // ─── 单例 ──────────────────────────────────────────────────────────────
    private static _inst: EconomyManager | null = null;
    static get inst(): EconomyManager | null { return EconomyManager._inst; }

    // ─── 内部状态 ───────────────────────────────────────────────────────────
    /** factionId → 加成列表 */
    private _bonuses: Map<string, IncomeBonus[]> = new Map();
    private _incomeAccum: Map<string, number>    = new Map();   // 小数累积

    // ─── 生命周期 ───────────────────────────────────────────────────────────
    onLoad(): void {
        // 双重防护：① 已有其他实例时自毁；② 防止持久节点热重载触发 __cid__ 重复注册
        if (EconomyManager._inst && EconomyManager._inst !== this) {
            this.destroy();
            return;
        }
        EconomyManager._inst = this;
        if (!director.isPersistRootNode(this.node)) {
            director.addPersistRootNode(this.node);
        }
    }

    onDestroy(): void {
        if (EconomyManager._inst === this) EconomyManager._inst = null;
    }

    // ─── 公共 API ───────────────────────────────────────────────────────────

    /**
     * 注册一个持续性收入加成（如市集建造后调用）
     */
    registerBonus(bonus: IncomeBonus): void {
        let list = this._bonuses.get(bonus.factionId);
        if (!list) { list = []; this._bonuses.set(bonus.factionId, list); }
        // 防止重复注册同一来源
        if (list.find(b => b.sourceId === bonus.sourceId)) return;
        list.push(bonus);
    }

    /**
     * 注销一个收入加成（如市集被摧毁后调用）
     */
    unregisterBonus(sourceId: string, factionId: string): void {
        const list = this._bonuses.get(factionId);
        if (!list) return;
        const idx = list.findIndex(b => b.sourceId === sourceId);
        if (idx !== -1) list.splice(idx, 1);
    }

    /**
     * 获取某阵营当前每秒额外收入总量（不含基础收入）
     */
    getBonusRate(factionId: string): number {
        return (this._bonuses.get(factionId) ?? [])
            .reduce((sum, b) => sum + b.bonusPerSecond, 0);
    }

    /**
     * 由 GameManager.update() 每帧调用，将加成金币写入阵营账户。
     * （GameManager 也可直接在自己 update 里调用 getBonusRate 一并结算）
     */
    tick(dt: number): void {
        const gm = GameManager.inst;
        if (!gm) return;

        this._bonuses.forEach((bonusList, factionId) => {
            const rate = bonusList.reduce((s, b) => s + b.bonusPerSecond, 0);
            if (rate <= 0) return;

            const prev  = this._incomeAccum.get(factionId) ?? 0;
            const total = prev + rate * dt;
            const whole = Math.floor(total);
            this._incomeAccum.set(factionId, total - whole);
            if (whole > 0) gm.addGold(factionId, whole);
        });
    }

    // ─── 便捷查询 ──────────────────────────────────────────────────────────

    /** 获取某阵营所有已注册的加成来源 */
    getBonuses(factionId: string): ReadonlyArray<IncomeBonus> {
        return this._bonuses.get(factionId) ?? [];
    }

    /** 清空某阵营所有加成（场景销毁时调用） */
    clearBonuses(factionId: string): void {
        this._bonuses.delete(factionId);
        this._incomeAccum.delete(factionId);
    }

    /** 清空全部加成（重开游戏时调用） */
    clearAll(): void {
        this._bonuses.clear();
        this._incomeAccum.clear();
    }
}
