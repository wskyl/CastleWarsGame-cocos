/**
 * Barracks.ts  ── Phase 2 扩展版（支持 3 级升级）
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { TroopSpawner } from '../units/TroopSpawner';

const { ccclass } = _decorator;

@ccclass('Barracks')
export class Barracks extends Component {
    factionId: string  = '';
    slotIndex: number  = 0;
    laneKey:   string  = '';
    level:     number  = 1;
    isBuilt:   boolean = true;

    private _hp:      number = 800;
    private _maxHp:   number = 800;
    private _target:  AttackTarget | null = null;
    private _spawner: TroopSpawner | null = null;
    private _hpBarFg: Node | null = null;

    initBarracks(factionId: string, slotIndex: number, laneKey: string): void {
        this.factionId = factionId; this.slotIndex = slotIndex; this.laneKey = laneKey;
        this._maxHp    = GameManager.inst?.buildingConfig?.barracks?.level1Hp ?? 800;
        this._hp       = this._maxHp;
        this._spawner  = this.node.getComponent(TroopSpawner);
        this._hpBarFg  = this.node.getChildByPath('HpBarRoot/HpFg') ?? null;
        if (slotIndex === 1) { this.isBuilt = false; this.node.active = false; return; }
        this._registerTarget();
    }

    private _registerTarget(): void {
        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._target = {
            node: this.node, factionId: this.factionId, position: pos,
            isBuilding: true, tags: ['building', 'barracks'],
            onHit: this._onHit.bind(this),
        };
        GameManager.inst?.registerTarget(this._target);
    }

    update(_dt: number): void { if (this._target) this.node.getWorldPosition(this._target.position); }

    private _onHit(damage: number, _t: string[], _f: string): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        this._hp -= damage; this._updateHpBar();
        if (this._hp <= 0) this._destroy();
    }

    private _destroy(): void {
        this.isBuilt = false;
        this._hp = 0;  // 确保 HP 归零，防止 hpPercent 返回负值
        if (this._spawner) this._spawner.destroyed = true;
        if (this._target) { GameManager.inst?.unregisterTarget(this._target); this._target = null; }
        EventManager.emit(GameEvent.BUILDING_DESTROYED, 'barracks', this.factionId, this.slotIndex.toString());
        this.node.active = false;
    }

    rebuild(troopRoot: Node): boolean {
        const cost = GameManager.inst?.buildingConfig?.barracks?.buildCost ?? 50;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;
        this.isBuilt = true; this._hp = this._maxHp; this.node.active = true;
        this._registerTarget();
        if (this._spawner) { this._spawner.destroyed = false; }
        else { const s = this.node.addComponent(TroopSpawner); s.initSpawner(this.factionId, this.laneKey, troopRoot); this._spawner = s; }
        EventManager.emit(GameEvent.BUILDING_REBUILT, 'barracks', this.factionId, this.slotIndex.toString());
        return true;
    }

    buildSlot1(troopRoot: Node): boolean {
        if (this.slotIndex !== 1 || this.isBuilt) return false;
        const cost = GameManager.inst?.buildingConfig?.barracks?.buildCost ?? 50;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;
        this.isBuilt = true; this._hp = this._maxHp; this.node.active = true;
        this._registerTarget();
        const s = this.node.addComponent(TroopSpawner); s.initSpawner(this.factionId, this.laneKey, troopRoot); this._spawner = s;
        EventManager.emit(GameEvent.BUILDING_REBUILT, 'barracks', this.factionId, '1');
        return true;
    }

    upgradeToLevel2(): boolean {
        if (this.level >= 2 || !this.isBuilt) return false;
        const cost = GameManager.inst?.buildingConfig?.barracks?.upgradeCost ?? 80;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;
        this.level = 2; this._spawner?.upgradeToLevel2(); return true;
    }

    /** Phase 2: 升级至 3 级（解锁 Tier 3 兵种） */
    upgradeToLevel3(): boolean {
        if (this.level >= 3 || !this.isBuilt) return false;
        const cost = GameManager.inst?.buildingConfig?.barracks?.level3UpgradeCost ?? 150;
        if (!GameManager.inst?.spendGold(this.factionId, cost)) return false;
        this.level = 3; this._spawner?.upgradeToLevel3(); return true;
    }

    private _updateHpBar(): void {
        if (!this._hpBarFg) return;
        const pct = Math.max(0, this._hp / this._maxHp);
        const s = this._hpBarFg.getScale(); this._hpBarFg.setScale(pct, s.y, s.z);
    }

    onDestroy(): void { if (this._target) GameManager.inst?.unregisterTarget(this._target); }

    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
    get isDestroyed(): boolean { return !this.isBuilt; }
    get barracksLevel(): number { return this.level; }
}
