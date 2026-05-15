/**
 * FactionManager.ts
 * 阵营状态读写门面（组件版），挂载于 Battle 场景根节点。
 * 主要提供 UI 层快捷访问，核心数据存于 GameManager。
 */
import { _decorator, Component } from 'cc';
import { GameManager, FactionState } from '../core/GameManager';

const { ccclass } = _decorator;

@ccclass('FactionManager')
export class FactionManager extends Component {
    private static _inst: FactionManager | null = null;
    static get inst(): FactionManager | null { return FactionManager._inst; }

    onLoad(): void { FactionManager._inst = this; }
    onDestroy(): void { if (FactionManager._inst === this) FactionManager._inst = null; }

    // ─── 金币快捷方法 ──────────────────────────────────────────────────────
    getGold(factionId: string): number {
        return GameManager.inst?.getGold(factionId) ?? 0;
    }

    spendGold(factionId: string, amount: number): boolean {
        return GameManager.inst?.spendGold(factionId, amount) ?? false;
    }

    addGold(factionId: string, amount: number): void {
        GameManager.inst?.addGold(factionId, amount);
    }

    getIncomeRate(factionId: string): number {
        return GameManager.inst?.getIncomeRate(factionId) ?? 0;
    }

    // ─── 阵营状态 ──────────────────────────────────────────────────────────
    getFactionState(factionId: string): FactionState | null {
        return GameManager.inst?.getFactionState(factionId) ?? null;
    }

    isAlive(factionId: string): boolean {
        return GameManager.inst?.getFactionState(factionId)?.alive ?? false;
    }

    getTroopCount(factionId: string): number {
        return GameManager.inst?.getFactionState(factionId)?.troopCount ?? 0;
    }

    hasAltarBonus(factionId: string): boolean {
        return GameManager.inst?.getFactionState(factionId)?.altarBonus ?? false;
    }

    /** 玩家阵营 ID */
    get playerFactionId(): string {
        return GameManager.inst?.playerFactionId ?? '';
    }
}
