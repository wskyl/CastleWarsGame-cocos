/**
 * DefenseTower.ts
 * 防御塔建筑：固定位置，自动攻击范围内最近敌军，支持箭楼和火油塔两种类型。
 * 挂载于 Battle 场景各阵营防御塔节点。
 * 由 MapBuilder 创建节点并调用 initTower() 初始化。
 */
import { _decorator, Component, Node, Vec3, MeshRenderer, Material } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { TowerTypeConfig } from '../generals/GeneralData';
import { Projectile } from '../units/Projectile';

const { ccclass } = _decorator;

@ccclass('DefenseTower')
export class DefenseTower extends Component {
    factionId:  string = '';
    towerType:  'arrowTower' | 'fireTower' = 'arrowTower';
    slotId:     string = '';
    isBuilt:    boolean = false;

    private _cfg:     TowerTypeConfig | null = null;
    private _hp:      number = 0;
    private _maxHp:   number = 0;
    private _atkTimer: number = 0;
    private _target:  AttackTarget | null = null;
    private _selfTarget: AttackTarget | null = null;
    private _hpBarFg: Node | null = null;
    private _troopRoot: Node | null = null;
    private _scanTimer: number = 0;
    private _currentTarget: AttackTarget | null = null;

    initTower(factionId: string, slotId: string, towerType: 'arrowTower' | 'fireTower', troopRoot: Node): void {
        this.factionId  = factionId;
        this.slotId     = slotId;
        this.towerType  = towerType;
        this._troopRoot = troopRoot;
        this.isBuilt    = false;
        // 初始不激活
        this.node.active = false;
    }

    /** 建造防御塔（由玩家 UI 或 AI 调用，扣除 buildCost） */
    build(): boolean {
        const gm = GameManager.inst;
        const tc = gm?.towersConfig?.[this.towerType];
        if (!tc) return false;
        if (!gm.spendGold(this.factionId, tc.buildCost)) return false;

        this._cfg    = tc;
        this._maxHp  = tc.hp;
        this._hp     = this._maxHp;
        this.isBuilt = true;
        this.node.active = true;
        this._hpBarFg = this.node.getChildByPath('HpBarRoot/HpFg') ?? null;

        // 注册为可攻击目标
        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._selfTarget = {
            node:       this.node,
            factionId:  this.factionId,
            position:   pos,
            isBuilding: true,
            tags:       ['building', 'tower', this.towerType],
            onHit:      this._onHit.bind(this),
        };
        gm.registerTarget(this._selfTarget);
        EventManager.emit(GameEvent.BUILDING_REBUILT, 'tower', this.factionId, this.slotId);
        return true;
    }

    update(dt: number): void {
        if (!this.isBuilt || !this._cfg) return;
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;

        // 同步自身 AttackTarget 位置
        if (this._selfTarget) this.node.getWorldPosition(this._selfTarget.position);

        // 扫描目标
        this._scanTimer += dt;
        if (this._scanTimer >= 0.2) {
            this._scanTimer = 0;
            this._currentTarget = this._findNearestEnemy();
        }

        if (!this._currentTarget || !this._currentTarget.node?.isValid || !this._currentTarget.node.active) {
            this._currentTarget = null;
            return;
        }

        // 攻击计时
        this._atkTimer += dt;
        if (this._atkTimer >= this._cfg.atkInterval) {
            this._atkTimer = 0;
            this._doAttack(this._currentTarget);
        }
    }

    private _doAttack(target: AttackTarget): void {
        const cfg = this._cfg!;
        const pos = this.node.getWorldPosition();

        if (this.towerType === 'fireTower' && cfg.aoeRadius) {
            // 火油塔：AOE splash（命中后扫描周围，由 Projectile onHit 触发）
            // 简化：当前版本发射单体弹，onHit 时触发 AOE
            Projectile.launchWithSplash(
                this._troopRoot!, pos, target,
                cfg.atk, this.factionId, ['tower', 'fire'],
                '#FF6600',
                cfg.aoeRadius,
                cfg.burnDmgPerSec ?? 0,
                cfg.burnDuration ?? 0,
            );
        } else {
            // 箭楼：单体
            Projectile.launch(
                this._troopRoot!, pos, target,
                cfg.atk, this.factionId, ['tower', 'arrow'],
                '#CCAA00',
            );
        }
    }

    private _findNearestEnemy(): AttackTarget | null {
        const myPos = this.node.getWorldPosition();
        let best: AttackTarget | null = null;
        let bestDist = Infinity;
        GameManager.inst.getTargets().forEach(t => {
            if (t.factionId === this.factionId || t.isBuilding) return;
            const d = Vec3.distance(myPos, t.position);
            if (d <= (this._cfg?.atkRange ?? 8) && d < bestDist) {
                best = t; bestDist = d;
            }
        });
        return best;
    }

    private _onHit(damage: number, _tags: string[], _factionId: string): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        this._hp -= damage;
        this._updateHpBar();
        if (this._hp <= 0) this._destroy();
    }

    private _destroy(): void {
        this.isBuilt = false;
        if (this._selfTarget) {
            GameManager.inst?.unregisterTarget(this._selfTarget);
            this._selfTarget = null;
        }
        EventManager.emit(GameEvent.BUILDING_DESTROYED, 'tower', this.factionId, this.slotId);
        this.node.active = false;
    }

    private _updateHpBar(): void {
        if (!this._hpBarFg) return;
        const pct = Math.max(0, this._hp / this._maxHp);
        const s = this._hpBarFg.getScale();
        this._hpBarFg.setScale(pct, s.y, s.z);
    }

    onDestroy(): void {
        if (this._selfTarget) GameManager.inst?.unregisterTarget(this._selfTarget);
    }

    get isDestroyed(): boolean { return !this.isBuilt; }
    get buildCost(): number { return GameManager.inst?.towersConfig?.[this.towerType]?.buildCost ?? 60; }
}
