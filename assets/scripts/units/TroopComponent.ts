/**
 * TroopComponent.ts  ── Phase 2 扩展版
 * 新增：cavalry_charge（首击 2x）、iron_guard（受伤减免）、fire_volley_aoe（范围弹）、
 *       将领 Buff 检测（攻速 + 伤害系数）。
 */
import {
    _decorator, Component, Node, Vec3, MeshRenderer, Material, Color,
    primitives, utils, tween,
} from 'cc';
import { GameManager, AttackTarget, TroopConfig, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { ObjectPool } from '../core/ObjectPool';
import { UnitManager, IRegisteredUnit } from '../core/UnitManager';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';
import { Projectile } from './Projectile';

const { ccclass } = _decorator;

export enum TroopState { MARCHING = 'MARCHING', COMBAT = 'COMBAT', DEAD = 'DEAD' }

interface BurnDOT { dmgPerSec: number; remaining: number; timer: number; }

@ccclass('TroopComponent')
export class TroopComponent extends Component implements IRegisteredUnit {
    private static _pool: ObjectPool | null = null;

    static initPool(parent: Node): void {
        if (TroopComponent._pool) return;
        TroopComponent._pool = new ObjectPool(() => {
            const n = new Node('Troop'); n.parent = parent;
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = utils.createMesh(primitives.sphere({ radius: 0.3, segments: 8 }));
            const mat = new Material(); mat.initialize({ effectName: 'builtin-unlit' });
            mr.setMaterial(mat, 0);
            n.addComponent(TroopComponent); n.active = false; return n;
        }, 50, 200);
    }

    /**
     * 销毁静态对象池，释放所有池内节点引用。
     * 应在 Battle 场景卸载时（BattleSceneInit.onDestroy）调用，
     * 防止跨场景重入时旧节点引用残留导致内存泄漏。
     */
    static destroyPool(): void {
        if (TroopComponent._pool) {
            TroopComponent._pool.clear();
            TroopComponent._pool = null;
        }
    }

    static spawn(parent: Node, spawnPos: Vec3, config: TroopConfig, waypoints: Vec3[]): TroopComponent | null {
        TroopComponent.initPool(parent);
        const gm = GameManager.safeInst;
        if (!gm || !gm.canSpawnNow()) return null;
        const node = TroopComponent._pool!.get();
        node.parent = parent;
        node.setWorldPosition(spawnPos.x, spawnPos.y, spawnPos.z);
        node.setScale(1, 1, 1);
        const comp = node.getComponent(TroopComponent)!;
        comp._initInstance(config, waypoints);
        return comp;
    }

    // ─── 实例字段 ─────────────────────────────────────────────────────
    factionId:    string      = '';
    troopConfig:  TroopConfig | null = null;
    factionConfig: import('../core/GameManager').FactionConfig | null = null;

    private _state:        TroopState    = TroopState.MARCHING;
    private _hp:           number        = 0;
    private _maxHp:        number        = 0;
    private _waypoints:    Vec3[]        = [];
    private _waypointIdx:  number        = 0;
    private _attackTimer:  number        = 0;
    private _currentTarget: AttackTarget | null = null;
    private _speedMult:    number        = 1.0;
    private _burn:         BurnDOT | null = null;
    private _scanTimer:    number        = 0;
    private _targetHandle: AttackTarget | null = null;
    private _atkIntervalMult: number     = 1.0; // melee vs ranged counter

    // Phase 2
    private _cavalryChargeReady: boolean = false; // 虎豹骑首击
    private _enterCombatFlag:    boolean = false;  // 刚进入 COMBAT

    private _initInstance(config: TroopConfig, waypoints: Vec3[]): void {
        this.troopConfig   = config;
        this.factionId     = config.factionId;
        this.factionConfig = GameManager.safeInst?.getFactionConfig(config.factionId) ?? null;
        this._hp           = config.hp;
        this._maxHp        = config.hp;
        this._waypoints    = waypoints;
        this._waypointIdx  = 0;
        this._state        = TroopState.MARCHING;
        this._attackTimer  = 0;
        this._currentTarget = null;
        this._speedMult    = 1.0;
        this._burn         = null;
        this._scanTimer    = 0;
        this._atkIntervalMult = 1.0;
        this._cavalryChargeReady = config.special.includes('cavalry_charge');
        this._enterCombatFlag = false;

        const col = hexToColor(FACTION_COLORS[config.factionId] ?? '#ffffff');
        const mr  = this.node.getComponent(MeshRenderer)!;
        const mat = mr.getMaterial(0)!;
        mat.setProperty('mainColor', col); mat.setProperty('albedo', col);

        this._targetHandle = {
            node: this.node, factionId: config.factionId, position: new Vec3(),
            isBuilding: false, tags: config.tags, tier: config.tier,
            onHit: this._onHit.bind(this),
        };
        GameManager.safeInst?.registerTarget(this._targetHandle);
        GameManager.safeInst?.troopSpawned(config.factionId);
        UnitManager.inst?.register(this);   // 注册到全局单位表
    }

    onDisable(): void {
        if (this._targetHandle) { GameManager.inst?.unregisterTarget(this._targetHandle); this._targetHandle = null; }
        UnitManager.inst?.unregister(this);  // 从全局单位表注销
    }

    setRiverDebuff(mult: number): void { this._speedMult = mult; }

    update(dt: number): void {
        if (!this.troopConfig) return;
        const gm = GameManager.safeInst;
        if (!gm || gm.phase !== GamePhase.PLAYING) return;
        if (this._state === TroopState.DEAD) return;
        if (this._targetHandle) this.node.getWorldPosition(this._targetHandle.position);
        this._updateBurn(dt);
        if (this._state === TroopState.MARCHING) this._updateMarching(dt);
        else if (this._state === TroopState.COMBAT) this._updateCombat(dt);
    }

    private _updateMarching(dt: number): void {
        this._scanTimer += dt;
        if (this._scanTimer >= 0.15) {
            this._scanTimer = 0;
            const t = this._findNearestEnemy();
            if (t) {
                this._currentTarget = t;
                this._state = TroopState.COMBAT;
                this._enterCombatFlag = true;
                if (this.troopConfig?.special.includes('cavalry_charge')) this._cavalryChargeReady = true;
                return;
            }
        }
        if (this._waypointIdx >= this._waypoints.length) return;
        const dest = this._waypoints[this._waypointIdx];
        const myPos = this.node.getWorldPosition();
        const speed = this.troopConfig!.moveSpeed * this._speedMult;
        const dx = dest.x - myPos.x; const dz = dest.z - myPos.z;
        const dist = Math.sqrt(dx*dx + dz*dz); const step = speed * dt;
        if (dist <= step) { this.node.setWorldPosition(dest.x, dest.y, dest.z); this._waypointIdx++; }
        else { this.node.setWorldPosition(myPos.x+(dx/dist)*step, myPos.y, myPos.z+(dz/dist)*step); }
    }

    private _updateCombat(dt: number): void {
        const cfg = this.troopConfig!;
        if (!this._isTargetValid(this._currentTarget)) {
            this._currentTarget = this._findNearestEnemy();
            if (!this._currentTarget) { this._state = TroopState.MARCHING; this._atkIntervalMult = 1.0; return; }
        }
        const target = this._currentTarget!;
        const myPos  = this.node.getWorldPosition();
        const dist   = Vec3.distance(myPos, target.position);
        this._atkIntervalMult = this._calcAtkMult(cfg, target);

        // Phase 2: 将领 Buff 攻速加成
        // 注意：GameManager.inst 在 _inst 为 null 时抛出，必须使用 safeInst
        const buff   = GameManager.safeInst?.getGeneralBuff(this.factionId);
        const interval = cfg.atkInterval * this._atkIntervalMult * (buff?.atkIntervalMult ?? 1.0);

        if (cfg.atkRange <= 1.5 && dist > cfg.atkRange) {
            const dx = target.position.x - myPos.x; const dz = target.position.z - myPos.z;
            const n = Math.sqrt(dx*dx + dz*dz); const step = cfg.moveSpeed * this._speedMult * dt;
            this.node.setWorldPosition(myPos.x+(dx/n)*step, myPos.y, myPos.z+(dz/n)*step);
            return;
        }
        if (cfg.atkRange > 1.5 && dist > cfg.atkRange * 1.1) {
            this._currentTarget = this._findNearestEnemy();
            if (!this._currentTarget) this._state = TroopState.MARCHING;
            return;
        }

        this._attackTimer += dt;
        if (this._attackTimer >= interval) { this._attackTimer = 0; this._doAttack(target); }
    }

    private _doAttack(target: AttackTarget): void {
        const cfg = this.troopConfig!;
        let dmg = cfg.atk;

        // Phase 2: 将领 Buff 伤害加成（同上，使用 safeInst 避免 null 时抛出）
        const buff = GameManager.safeInst?.getGeneralBuff(this.factionId);
        if (buff) dmg *= buff.dmgMult;

        // Phase 2: 骑兵冲锋首击 ×2
        if (cfg.special.includes('cavalry_charge') && this._cavalryChargeReady) {
            dmg *= 2; this._cavalryChargeReady = false;
        }

        // Phase 1 加成
        if (target.isBuilding && cfg.special.includes('building_bonus')) {
            const m = parseFloat(cfg.special.match(/building_bonus_([\d.]+)/)?.[1] ?? '1'); dmg *= m;
        }
        if (cfg.special.includes('melee_bonus') && target.tags?.includes('melee')) {
            const m = parseFloat(cfg.special.match(/melee_bonus_([\d.]+)/)?.[1] ?? '1'); dmg *= m;
        }

        if (cfg.atkRange <= 1.5) {
            target.onHit(dmg, cfg.tags, cfg.factionId);
        } else {
            const pos = this.node.getWorldPosition();
            // Phase 2: fire_volley 支持 AOE splash
            if (cfg.special.includes('fire_volley_aoe')) {
                const aoeR = parseFloat(cfg.special.match(/fire_volley_aoe_([\d.]+)/)?.[1] ?? '0');
                Projectile.launchWithSplash(this.node.parent!, pos, target, dmg,
                    cfg.factionId, cfg.tags, FACTION_COLORS[cfg.factionId] ?? '#ffffff',
                    aoeR, 0, 0);
            } else {
                Projectile.launch(this.node.parent!, pos, target, dmg,
                    cfg.factionId, cfg.tags, FACTION_COLORS[cfg.factionId] ?? '#ffffff');
            }
        }
    }

    private _onHit(damage: number, attackerTags: string[], attackerFactionId: string): void {
        if (this._state === TroopState.DEAD) return;
        let actualDmg = damage;

        // Phase 2: 白毦兵铁甲减伤
        if (this.troopConfig?.special.includes('iron_guard')) {
            const r = parseFloat(this.troopConfig.special.match(/iron_guard_([\d.]+)/)?.[1] ?? '1');
            actualDmg *= r;
        }
        // 轻甲灼烧额外伤害
        if (attackerTags.includes('burn') && this.troopConfig?.tags.includes('light_armor')) actualDmg *= 1.3;
        // 灼烧附加
        if (attackerTags.includes('fire_bow') || attackerTags.includes('burn')) this._applyBurn(3, 3);

        this._hp -= actualDmg;
        if (this._hp <= 0) this._die(attackerFactionId);
    }

    private _applyBurn(dmgPerSec: number, duration: number): void {
        if (!this._burn) this._burn = { dmgPerSec, remaining: duration, timer: 0 };
        else this._burn.remaining = duration;
    }
    private _updateBurn(dt: number): void {
        if (!this._burn) return;
        this._burn.timer += dt; this._burn.remaining -= dt;
        if (this._burn.timer >= 1.0) { this._burn.timer -= 1.0; this._hp -= this._burn.dmgPerSec; if (this._hp <= 0) { this._die(''); return; } }
        if (this._burn.remaining <= 0) this._burn = null;
    }

    private _die(killerFactionId: string): void {
        if (this._state === TroopState.DEAD) return;
        this._state = TroopState.DEAD;
        if (this._targetHandle) { GameManager.inst?.unregisterTarget(this._targetHandle); this._targetHandle = null; }
        GameManager.inst?.troopDied(this.factionId);
        if (killerFactionId && killerFactionId !== this.factionId) {
            const r = this.troopConfig?.tier === 1 ? (GameManager.inst?.economyConfig?.killReward.tier1Troop ?? 1)
                    : this.troopConfig?.tier === 2 ? (GameManager.inst?.economyConfig?.killReward.tier2Troop ?? 3)
                    : 5; // Tier 3 击杀奖励 5 金（Phase 2）
            GameManager.inst?.addGold(killerFactionId, r);
        }
        EventManager.emit(GameEvent.TROOP_KILLED, this.troopConfig?.tier ?? 1, this.factionId, killerFactionId);
        const node = this.node;
        tween(node).to(0.3, { scale: new Vec3(0, 0, 0) }).call(() => {
            this._reset(); TroopComponent._pool?.put(node);
        }).start();
    }

    private _reset(): void {
        this._hp = 0; this._state = TroopState.MARCHING; this._currentTarget = null;
        this._waypoints = []; this._waypointIdx = 0; this._attackTimer = 0;
        this._speedMult = 1.0; this._burn = null; this.troopConfig = null;
        this._cavalryChargeReady = false;
    }

    private _findNearestEnemy(): AttackTarget | null {
        const cfg = this.troopConfig!;
        const myPos = this.node.getWorldPosition();
        const gm = GameManager.safeInst;
        if (!gm) return null;

        let best: AttackTarget | null = null;
        let bestDist = Infinity;

        // 优先用 UnitManager 空间查询来检测附近敌方单位（跳过建筑目标，减少迭代量）
        const nearbyUnits = UnitManager.inst?.getUnitsInRadius(myPos, cfg.atkRange) ?? [];
        for (const u of nearbyUnits) {
            if (u.factionId === this.factionId) continue;
            // 从 AttackTarget 注册表中找对应目标（保持 onHit 接口完整）
            // UnitManager 只存 IRegisteredUnit，需通过 GameManager targets 对应
            break; // fallback to full scan below if no direct mapping
        }

        // 从目标注册表扫描（包含建筑），仅在攻击范围内取最近目标
        gm.getTargets().forEach(t => {
            if (t.factionId === this.factionId) return;
            const d = Vec3.distance(myPos, t.position);
            if (d <= cfg.atkRange) {
                if (cfg.atkRange > 1.5 && t.tags?.includes('melee') && d < bestDist) { best = t; bestDist = d; }
                else if (d < bestDist) { best = t; bestDist = d; }
            }
        });
        return best;
    }
    private _isTargetValid(t: AttackTarget | null): boolean {
        if (!t || !t.node?.isValid || !t.node.active) return false;
        return Vec3.distance(this.node.getWorldPosition(), t.position) <= this.troopConfig!.atkRange * 1.5;
    }
    private _calcAtkMult(cfg: TroopConfig, target: AttackTarget): number {
        return (cfg.tags.includes('melee') && target.tags?.includes('ranged')) ? 0.833 : 1.0;
    }

    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
    get state(): TroopState { return this._state; }
}
