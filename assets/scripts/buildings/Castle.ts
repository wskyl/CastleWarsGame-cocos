/**
 * Castle.ts
 * 主城组件：HP 管理、受击处理、血条更新、出局触发。
 * 挂载于 Battle 场景中各阵营主城节点。
 */
import { _decorator, Component, Node, Vec3, MeshRenderer } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';

const { ccclass } = _decorator;

@ccclass('Castle')
export class Castle extends Component {
    factionId: string = '';

    private _hp:     number = 3000;
    private _maxHp:  number = 3000;
    private _target: AttackTarget | null = null;
    private _hpBarFg: Node | null = null;

    initCastle(factionId: string): void {
        this.factionId = factionId;
        this._maxHp    = GameManager.safeInst?.buildingConfig?.castle?.hp ?? 3000;
        this._hp       = this._maxHp;

        // 查找子节点血条前景
        this._hpBarFg = this.node.getChildByPath('HpBarRoot/HpFg') ?? null;

        // 注册为可攻击目标
        const pos = new Vec3();
        this.node.getWorldPosition(pos);

        this._target = {
            node:       this.node,
            factionId:  factionId,
            position:   pos,
            isBuilding: true,
            tags:       ['building', 'castle'],
            onHit:      this._onHit.bind(this),
        };
        GameManager.safeInst?.registerTarget(this._target);
    }

    update(_dt: number): void {
        // 持续同步坐标（建筑固定，但保持 position 引用最新）
        // 游戏未在进行中或目标已注销时跳过更新
        if (!this._target) return;
        if (GameManager.safeInst?.phase !== GamePhase.PLAYING) return;
        this.node.getWorldPosition(this._target.position);
    }

    private _onHit(damage: number, attackerTags: string[], attackerFactionId: string): void {
        if (!GameManager.inst || GameManager.inst.phase !== GamePhase.PLAYING) return;

        // 对建筑伤害加成
        let actualDmg = damage;
        // (加成已在 TroopComponent._doAttack 中计算)

        this._hp -= actualDmg;
        this._updateHpBar();

        if (this._hp <= 0) {
            this._hp = 0;
            this._die();
        }
    }

    private _updateHpBar(): void {
        if (!this._hpBarFg) return;
        const pct = Math.max(0, this._hp / this._maxHp);
        const s   = this._hpBarFg.getScale();
        this._hpBarFg.setScale(pct, s.y, s.z);
    }

    private _die(): void {
        // 注销目标
        if (this._target) {
            GameManager.safeInst?.unregisterTarget(this._target);
            this._target = null;
        }
        // 触发出局
        GameManager.safeInst?.eliminateFaction(this.factionId);
        // 摧毁整个阵营节点（父节点包含全部建筑）
        this.node.parent?.destroy();
    }

    onDestroy(): void {
        if (this._target) {
            GameManager.safeInst?.unregisterTarget(this._target);
        }
    }

    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
}
