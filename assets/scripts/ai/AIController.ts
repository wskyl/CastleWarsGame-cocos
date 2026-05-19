/**
 * AIController.ts  ── Phase 2 扩展版
 * 决策优先级（Phase 2 完整版）：
 *   1. 使用将领技能（将领在场 && 技能 CD 到 && 附近敌军 ≥ useSkillEnemiesNearby）
 *   2. 召唤将领（将领不在场 && 未在复活 CD && gold ≥ summonGeneralGoldThreshold）
 *   3. 重建被摧毁的兵营（gold ≥ rebuildGoldThreshold）
 *   4. 建造第 2 兵营（gold ≥ buildBarracks2GoldThreshold）
 *   5. 升级兵营至 3 级（level=2 && troopCount ≥ upgradeTo3MinTroops && gold ≥ upgradeTo3Threshold）
 *   6. 升级兵营至 2 级（level=1 && troopCount ≥ upgradeMinTroops && gold ≥ upgradeThreshold）
 *   7. 建造市集（未建 && gold ≥ buildMarketGoldThreshold）
 *   8. 建造防御塔（有未建槽位 && gold ≥ buildTowerGoldThreshold）
 *   9. 持有（等待金币增长）
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { GameManager, AiConfig, GamePhase } from '../core/GameManager';
import { Barracks } from '../buildings/Barracks';
import { DefenseTower } from '../buildings/DefenseTower';
import { Market } from '../buildings/Market';
import { GeneralAltar } from '../buildings/GeneralAltar';
import { UnitManager } from '../core/UnitManager';

const { ccclass } = _decorator;

@ccclass('AIController')
export class AIController extends Component {
    factionId: string = '';

    private _factionRoot: Node | null = null;
    private _troopRoot:   Node | null = null;
    private _decisionTimer: number = 0;
    private _cfg: AiConfig | null = null;

    /** 阵营所有兵营组件（包括未建造的 Slot 1） */
    private _barracks: Barracks[] = [];

    // Phase 2 建筑引用（由 MapBuilder 注入）
    private _generalAltar: GeneralAltar | null = null;
    private _towers:       DefenseTower[]      = [];
    private _market:       Market | null       = null;

    initAI(
        factionId: string,
        factionRoot: Node,
        troopRoot: Node,
        generalAltar: GeneralAltar | null = null,
        towers: DefenseTower[]            = [],
        market: Market | null             = null,
    ): void {
        this.factionId       = factionId;
        this._factionRoot    = factionRoot;
        this._troopRoot      = troopRoot;
        this._cfg            = GameManager.inst?.aiConfig ?? null;
        this._generalAltar   = generalAltar;
        this._towers         = towers;
        this._market         = market;
        this._refreshBarracks();
    }

    /** 收集该阵营所有 Barracks 组件（含 Slot 1 未建的） */
    private _refreshBarracks(): void {
        this._barracks = [];
        if (!this._factionRoot) return;
        this._factionRoot.walk((node: Node) => {
            const b = node.getComponent(Barracks);
            if (b && b.factionId === this.factionId) this._barracks.push(b);
        });
    }

    update(dt: number): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        if (!GameManager.inst?.getFactionState(this.factionId)?.alive) return;

        this._decisionTimer += dt;
        const interval = this._cfg?.decisionIntervalSeconds ?? 1.0;
        if (this._decisionTimer < interval) return;
        this._decisionTimer -= interval;

        this._decide();
    }

    private _decide(): void {
        const gm    = GameManager.inst;
        const cfg   = this._cfg!;
        const gold  = gm.getGold(this.factionId);
        const state = gm.getFactionState(this.factionId);
        if (!state) return;

        this._refreshBarracks();

        // ─ 1. 使用将领技能 ──────────────────────────────────────────────
        const gs = gm.getGeneralState(this.factionId);
        if (gs?.onField && gs.generalRef) {
            const skillCd = gm.generalsConfig.find(g => g.factionId === this.factionId)?.skill.cooldown ?? 30;
            if (gs.skillCooldown <= 0) {
                // 检测附近敌军数量
                const myPos  = this._getGeneralPos();
                const nearby = myPos ? this._countNearbyEnemies(myPos, 8) : 0;
                if (nearby >= (cfg.useSkillEnemiesNearby ?? 3)) {
                    (gs.generalRef as import('../generals/GeneralComponent').GeneralComponent).useSkill();
                    return;
                }
            }
        }

        // ─ 2. 召唤将领 ──────────────────────────────────────────────────
        if (gold >= (cfg.summonGeneralGoldThreshold ?? 200)) {
            if (gm.canSummonGeneral(this.factionId) && this._generalAltar) {
                this._generalAltar.summonGeneral();
                return;
            }
        }

        // ─ 3. 重建被摧毁的兵营 ─────────────────────────────────────────
        if (gold >= cfg.rebuildGoldThreshold) {
            const destroyed = this._barracks.find(b => b.isDestroyed && b.slotIndex === 0);
            if (destroyed) {
                destroyed.rebuild(this._troopRoot!);
                return;
            }
        }

        // ─ 4. 建造第 2 兵营 ─────────────────────────────────────────────
        if (gold >= cfg.buildBarracks2GoldThreshold) {
            const slot1 = this._barracks.find(b => b.slotIndex === 1 && !b.isBuilt);
            if (slot1) {
                slot1.buildSlot1(this._troopRoot!);
                return;
            }
        }

        // ─ 5. 升级兵营至 3 级 ──────────────────────────────────────────
        if (
            gold >= (cfg.upgradeTo3GoldThreshold ?? 150) &&
            state.troopCount >= (cfg.upgradeTo3MinTroopsOnField ?? 10)
        ) {
            const upgradeable = this._barracks.find(b => b.isBuilt && b.barracksLevel === 2);
            if (upgradeable) {
                upgradeable.upgradeToLevel3();
                return;
            }
        }

        // ─ 6. 升级兵营至 2 级 ──────────────────────────────────────────
        if (
            gold >= cfg.upgradeGoldThreshold &&
            state.troopCount >= cfg.upgradeMinTroopsOnField
        ) {
            const upgradeable = this._barracks.find(b => b.isBuilt && b.barracksLevel === 1);
            if (upgradeable) {
                upgradeable.upgradeToLevel2();
                return;
            }
        }

        // ─ 7. 建造市集 ──────────────────────────────────────────────────
        if (gold >= (cfg.buildMarketGoldThreshold ?? 150)) {
            if (this._market && !this._market.isBuilt) {
                this._market.build();
                return;
            }
        }

        // ─ 8. 建造防御塔 ────────────────────────────────────────────────
        if (gold >= (cfg.buildTowerGoldThreshold ?? 100)) {
            const unbuit = this._towers.find(t => !t.isBuilt);
            if (unbuit) {
                unbuit.build();
                return;
            }
        }

        // ─ 9. 持有（无操作） ─────────────────────────────────────────────
    }

    // ─── 辅助：获取己方将领位置 ─────────────────────────────────────────
    private _getGeneralPos(): Vec3 | null {
        const gs = GameManager.inst?.getGeneralState(this.factionId);
        if (!gs?.generalRef) return null;
        const comp = gs.generalRef as import('../generals/GeneralComponent').GeneralComponent;
        return comp.node?.isValid ? comp.node.getWorldPosition() : null;
    }

    // ─── 辅助：统计指定半径内敌军数量 ──────────────────────────────────
    /**
     * 使用 UnitManager.getUnitsInRadius 空间查询替代遍历全部 AttackTarget，
     * 避免将建筑目标（castle/barracks）计入"附近敌军"统计，
     * 同时为后续引入空间加速结构（四叉树/网格）预留接口。
     */
    private _countNearbyEnemies(pos: Vec3, radius: number): number {
        const units = UnitManager.inst?.getUnitsInRadius(pos, radius) ?? [];
        return units.filter(u => u.factionId !== this.factionId).length;
    }
}
