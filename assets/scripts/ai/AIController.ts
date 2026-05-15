/**
 * AIController.ts
 * AI 行为树（普通难度）：每秒执行一次决策，按优先级顺序检查并执行操作。
 * 决策优先级：
 *   1. 重建被摧毁的兵营（gold ≥ rebuildGoldThreshold）
 *   2. 建造第 2 兵营（barracks < 2 && gold ≥ buildBarracks2GoldThreshold）
 *   3. 升级兵营至 2 级（有 1 级兵营 && 场上兵力 ≥ upgradeMinTroopsOnField && gold ≥ upgradeGoldThreshold）
 *   4. 持有（等待金币增长）
 * 挂载于 Battle 场景各 AI 专属节点。
 */
import { _decorator, Component, Node } from 'cc';
import { GameManager, AiConfig, GamePhase } from '../core/GameManager';
import { Barracks } from '../buildings/Barracks';

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

    initAI(factionId: string, factionRoot: Node, troopRoot: Node): void {
        this.factionId    = factionId;
        this._factionRoot = factionRoot;
        this._troopRoot   = troopRoot;
        this._cfg         = GameManager.inst?.aiConfig ?? null;
        this._refreshBarracks();
    }

    /** 收集该阵营所有 Barracks 组件 */
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
        const gm  = GameManager.inst;
        const cfg = this._cfg!;
        const gold = gm.getGold(this.factionId);
        const state = gm.getFactionState(this.factionId);
        if (!state) return;

        this._refreshBarracks();

        // ─ 1. 重建被摧毁的兵营 ─────────────────────────────────────────
        if (gold >= cfg.rebuildGoldThreshold) {
            const destroyed = this._barracks.find(b => b.isDestroyed && b.slotIndex === 0 && b.isBuilt === false);
            if (destroyed) {
                destroyed.rebuild(this._troopRoot!);
                return;
            }
        }

        // ─ 2. 建造第 2 兵营 ─────────────────────────────────────────────
        if (gold >= cfg.buildBarracks2GoldThreshold) {
            const slot1 = this._barracks.find(b => b.slotIndex === 1 && !b.isBuilt);
            if (slot1) {
                slot1.buildSlot1(this._troopRoot!);
                return;
            }
        }

        // ─ 3. 升级兵营至 2 级 ──────────────────────────────────────────
        if (
            gold >= cfg.upgradeGoldThreshold &&
            state.troopCount >= cfg.upgradeMinTroopsOnField
        ) {
            const upgradeable = this._barracks.find(
                b => b.isBuilt && b.barracksLevel === 1,
            );
            if (upgradeable) {
                upgradeable.upgradeToLevel2();
                return;
            }
        }

        // ─ 4. 持有（无操作） ─────────────────────────────────────────────
    }
}
