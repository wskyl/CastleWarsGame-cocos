/**
 * Barracks.ts
 * 兵营组件：等级管理（1→2 级）、HP 管理、受击/摧毁/重建、出兵委托给 TroopSpawner。
 * 挂载于 Battle 场景中各阵营兵营节点。
 */
import { _decorator, Component, Node, Vec3, MeshRenderer, Material } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { TroopSpawner } from '../units/TroopSpawner';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';

const { ccclass } = _decorator;

@ccclass('Barracks')
export class Barracks extends Component {
    factionId: string  = '';
    slotIndex: number  = 0;
    laneKey:   string  = '';
    level:     number  = 1;
    isBuilt:   boolean = true;  // Slot 0 初始已建造；Slot 1 初始未建造

    private _hp:      number = 800;
    private _maxHp:   number = 800;
    private _target:  AttackTarget | null = null;
    private _spawner: TroopSpawner | null = null;
    private _hpBarFg: Node | null = null;

    initBarracks(factionId: string, slotIndex: number, laneKey: string): void {
        this.factionId  = factionId;
        this.slotIndex  = slotIndex;
        this.laneKey    = laneKey;
        this._maxHp     = GameManager.inst?.buildingConfig?.barracks?.level1Hp ?? 800;
        this._hp        = this._maxHp;
        this._spawner   = this.node.getComponent(TroopSpawner);
        this._hpBarFg   = this.node.getChildByPath('HpBarRoot/HpFg') ?? null;

        // Slot 1 默认未建造（不注册目标，不出兵）
        if (slotIndex === 1) {
            this.isBuilt = false;
            this.node.active = false;
            return;
        }

        this._registerTarget();
    }

    private _registerTarget(): void {
        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._target = {
            node:       this.node,
            factionId:  this.factionId,
            position:   pos,
            isBuilding: true,
            tags:       ['building', 'barracks'],
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
        this._updateHpBar();
        if (this._hp <= 0) this._destroy();
    }

    private _destroy(): void {
        this.isBuilt = false;
        if (this._spawner) this._spawner.destroyed = true;
        if (this._target) {
            GameManager.inst?.unregisterTarget(this._target);
            this._target = null;
        }
        const reward = GameManager.inst?.economyConfig?.killReward?.barracks ?? 15;
        // 奖励不确定攻击方，用事件广播让 AIController/BattleUI 处理
        EventManager.emit(GameEvent.BUILDING_DESTROYED, 'barracks', this.factionId, this.slotIndex.toString());
        // 视觉上半透明
        this.node.active = false;
    }

    /** 重建兵营（由玩家 UI 或 AI 调用，扣除 buildCost） */
    rebuild(troopRoot: Node): boolean {
        const cost = GameManager.inst?.buildingConfig?.barracks?.buildCost ?? 50;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;

        this.isBuilt = true;
        this._hp     = this._maxHp;
        this.node.active = true;

        // 重新注册目标
        this._registerTarget();

        // 重置 Spawner
        if (this._spawner) {
            this._spawner.destroyed = false;
        } else {
            const spawner = this.node.addComponent(TroopSpawner);
            spawner.initSpawner(this.factionId, this.laneKey, troopRoot);
            this._spawner = spawner;
        }

        EventManager.emit(GameEvent.BUILDING_REBUILT, 'barracks', this.factionId, this.slotIndex.toString());
        return true;
    }

    /** 建造第 2 兵营（Slot 1，由玩家 UI 或 AI 调用） */
    buildSlot1(troopRoot: Node): boolean {
        if (this.slotIndex !== 1 || this.isBuilt) return false;
        const cost = GameManager.inst?.buildingConfig?.barracks?.buildCost ?? 50;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;

        this.isBuilt    = true;
        this._hp        = this._maxHp;
        this.node.active = true;
        this._registerTarget();

        const spawner = this.node.addComponent(TroopSpawner);
        spawner.initSpawner(this.factionId, this.laneKey, troopRoot);
        this._spawner = spawner;

        EventManager.emit(GameEvent.BUILDING_REBUILT, 'barracks', this.factionId, '1');
        return true;
    }

    /** 升级兵营至 2 级 */
    upgradeToLevel2(): boolean {
        if (this.level >= 2 || !this.isBuilt) return false;
        const cost = GameManager.inst?.buildingConfig?.barracks?.upgradeCost ?? 80;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;

        this.level = 2;
        this._spawner?.upgradeToLevel2();
        return true;
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

    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
    get isDestroyed(): boolean { return !this.isBuilt; }
    get barracksLevel(): number { return this.level; }
}
