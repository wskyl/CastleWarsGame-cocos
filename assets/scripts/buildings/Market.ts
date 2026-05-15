/**
 * Market.ts
 * 市集建筑：提供额外金币产出加成（+1.5/s），可被摧毁。
 * 每阵营 1 个市集槽，初始未建造。
 * 挂载于 Battle 场景市集节点。
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';

const { ccclass } = _decorator;

@ccclass('Market')
export class Market extends Component {
    factionId: string  = '';
    isBuilt:   boolean = false;

    private _hp:      number = 400;
    private _maxHp:   number = 400;
    private _target:  AttackTarget | null = null;
    private _hpBarFg: Node | null = null;
    private _incomeBonus: number = 1.5;

    initMarket(factionId: string): void {
        this.factionId = factionId;
        this.isBuilt   = false;
        this.node.active = false;
    }

    /** 建造市集（由玩家 UI 或 AI 调用） */
    build(): boolean {
        const gm  = GameManager.inst;
        const cfg = gm?.buildingConfig?.market;
        if (!cfg) return false;
        if (!gm.spendGold(this.factionId, cfg.buildCost)) return false;

        this._maxHp       = cfg.hp;
        this._hp          = this._maxHp;
        this._incomeBonus = cfg.incomeBonus;
        this.isBuilt      = true;
        this.node.active  = true;
        this._hpBarFg     = this.node.getChildByPath('HpBarRoot/HpFg') ?? null;

        // 注册目标
        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._target = {
            node:       this.node,
            factionId:  this.factionId,
            position:   pos,
            isBuilding: true,
            tags:       ['building', 'market'],
            onHit:      this._onHit.bind(this),
        };
        gm.registerTarget(this._target);

        // 注册收入加成
        gm.registerMarketBonus(this.factionId, this._incomeBonus);
        EventManager.emit(GameEvent.BUILDING_REBUILT, 'market', this.factionId, '');
        return true;
    }

    update(_dt: number): void {
        if (this._target) this.node.getWorldPosition(this._target.position);
    }

    private _onHit(damage: number, _tags: string[], _faction: string): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        this._hp -= damage;
        this._updateHpBar();
        if (this._hp <= 0) this._destroy();
    }

    private _destroy(): void {
        this.isBuilt = false;
        if (this._target) {
            GameManager.inst?.unregisterTarget(this._target);
            this._target = null;
        }
        // 移除收入加成
        GameManager.inst?.unregisterMarketBonus(this.factionId, this._incomeBonus);
        EventManager.emit(GameEvent.BUILDING_DESTROYED, 'market', this.factionId, '');
        this.node.active = false;
    }

    private _updateHpBar(): void {
        if (!this._hpBarFg) return;
        const pct = Math.max(0, this._hp / this._maxHp);
        const s   = this._hpBarFg.getScale();
        this._hpBarFg.setScale(pct, s.y, s.z);
    }

    onDestroy(): void {
        if (this._target) GameManager.inst?.unregisterTarget(this._target);
    }

    get isDestroyed(): boolean { return !this.isBuilt; }
    get buildCost(): number { return GameManager.inst?.buildingConfig?.market?.buildCost ?? 80; }
}
