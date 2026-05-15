/**
 * GeneralAltar.ts
 * 将坛组件（预留架构）：
 *   - 有 HP，可被攻击摧毁
 *   - summonGeneral 接口预留（空实现）
 *   - UI 中展示锁定的将魂进度条，Tooltip 文字「将领系统即将上线」
 * 挂载于 Battle 场景中各阵营将坛节点（六棱柱 Cylinder）。
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';

const { ccclass } = _decorator;

@ccclass('GeneralAltar')
export class GeneralAltar extends Component {
    factionId: string = '';

    private _hp:    number = 500;
    private _maxHp: number = 500;
    private _target: AttackTarget | null = null;

    initAltar(factionId: string): void {
        this.factionId = factionId;
        this._maxHp = GameManager.inst?.buildingConfig?.generalAltar?.hp ?? 500;
        this._hp    = this._maxHp;

        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._target = {
            node:       this.node,
            factionId:  factionId,
            position:   pos,
            isBuilding: true,
            tags:       ['building', 'generalAltar'],
            onHit:      this._onHit.bind(this),
        };
        GameManager.inst?.registerTarget(this._target);
    }

    update(_dt: number): void {
        if (this._target) this.node.getWorldPosition(this._target.position);
    }

    private _onHit(damage: number, _tags: string[], _factionId: string): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        this._hp -= damage;
        if (this._hp <= 0) {
            this._hp = 0;
            if (this._target) {
                GameManager.inst?.unregisterTarget(this._target);
                this._target = null;
            }
            this.node.active = false;
        }
    }

    /**
     * 将领召唤接口预留 —— 本阶段为空实现。
     * TODO: 将领系统上线后实现召唤逻辑
     */
    summonGeneral(_factionId: string): void {
        // 预留接口，将领系统即将上线
    }

    onDestroy(): void {
        if (this._target) GameManager.inst?.unregisterTarget(this._target);
    }

    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
    /** UI 提示文本 */
    get tooltipText(): string { return '将领系统即将上线'; }
}
