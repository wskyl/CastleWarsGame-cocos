/**
 * TroopComponent.ts
 * 士兵核心组件：状态机（MARCHING → COMBAT → DEAD）、寻路、战斗、地形响应。
 *
 * 状态说明：
 *   MARCHING  沿 Waypoint 行进，每帧检测攻击范围内是否有敌人。
 *   COMBAT    锁定最近目标攻击，目标消失或超出范围则回到 MARCHING。
 *   DEAD      播放 0.3 秒缩小动画后归还对象池，并发放击杀金币。
 */
import {
    _decorator, Component, Node, Vec3, MeshRenderer, Material, Color,
    primitives, utils, tween,
} from 'cc';
import { GameManager, AttackTarget, TroopConfig, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { ObjectPool } from '../core/ObjectPool';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';
import { Projectile } from './Projectile';

const { ccclass } = _decorator;

// ─── 士兵状态 ──────────────────────────────────────────────────────────────
export enum TroopState {
    MARCHING = 'MARCHING',
    COMBAT   = 'COMBAT',
    DEAD     = 'DEAD',
}

// ─── 灼烧 DOT ──────────────────────────────────────────────────────────────
interface BurnDOT {
    dmgPerSec: number;
    remaining: number;
    timer: number;
}

@ccclass('TroopComponent')
export class TroopComponent extends Component {
    // ─── 静态对象池 ─────────────────────────────────────────────────────
    private static _pool: ObjectPool | null = null;

    static initPool(parent: Node): void {
        if (TroopComponent._pool) return;
        TroopComponent._pool = new ObjectPool(() => {
            const n = new Node('Troop');
            n.parent = parent;
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = utils.createMesh(primitives.sphere({ radius: 0.3, segments: 8 }));
            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            mr.setMaterial(mat, 0);
            n.addComponent(TroopComponent);
            n.active = false;
            return n;
        }, 50, 200);
    }

    /**
     * 从对象池取出并初始化一个士兵。
     * @param parent    挂载父节点（TroopRoot）
     * @param spawnPos  出生位置
     * @param config    兵种配置
     * @param waypoints 行军路径点数组
     */
    static spawn(
        parent: Node,
        spawnPos: Vec3,
        config: TroopConfig,
        waypoints: Vec3[],
    ): TroopComponent | null {
        TroopComponent.initPool(parent);
        if (!GameManager.inst.canSpawnNow()) return null;

        const node = TroopComponent._pool!.get();
        node.parent = parent;
        node.setWorldPosition(spawnPos.x, spawnPos.y, spawnPos.z);
        node.setScale(1, 1, 1);

        const comp = node.getComponent(TroopComponent)!;
        comp._initInstance(config, waypoints);
        return comp;
    }

    // ─── 实例字段 ─────────────────────────────────────────────────────
    factionId: string = '';
    troopConfig: TroopConfig | null = null;
    factionConfig: import('../core/GameManager').FactionConfig | null = null;

    private _state: TroopState = TroopState.MARCHING;
    private _hp:    number     = 0;
    private _maxHp: number     = 0;

    private _waypoints:   Vec3[]   = [];
    private _waypointIdx: number   = 0;

    private _attackTimer: number   = 0;
    private _currentTarget: AttackTarget | null = null;

    // 移速系数（河道减速用）
    private _speedMultiplier: number = 1.0;

    // 灼烧 DOT
    private _burn: BurnDOT | null = null;

    // 检测间隔
    private _scanTimer: number = 0;
    private _scanInterval: number = 0.15;

    // AttackTarget 注册句柄
    private _targetHandle: AttackTarget | null = null;

    // 兵种克制：近战攻击远程时 atkSpeed +20%
    private _atkIntervalMultiplier: number = 1.0;

    // ─── 初始化 ──────────────────────────────────────────────────────
    private _initInstance(config: TroopConfig, waypoints: Vec3[]): void {
        this.troopConfig   = config;
        this.factionId     = config.factionId;
        this.factionConfig = GameManager.inst.getFactionConfig(config.factionId);
        this._hp           = config.hp;
        this._maxHp        = config.hp;
        this._waypoints    = waypoints;
        this._waypointIdx  = 0;
        this._state        = TroopState.MARCHING;
        this._attackTimer  = 0;
        this._currentTarget  = null;
        this._speedMultiplier = 1.0;
        this._burn           = null;
        this._scanTimer      = 0;
        this._atkIntervalMultiplier = 1.0;

        // 设置颜色
        const col = hexToColor(FACTION_COLORS[config.factionId] ?? '#ffffff');
        const mr = this.node.getComponent(MeshRenderer)!;
        const mat = mr.getMaterial(0)!;
        mat.setProperty('mainColor', col);
        mat.setProperty('albedo',    col);

        // 注册为可攻击目标
        this._targetHandle = {
            node:        this.node,
            factionId:   config.factionId,
            position:    new Vec3(),
            isBuilding:  false,
            tags:        config.tags,
            tier:        config.tier,
            onHit:       this._onHit.bind(this),
        };
        GameManager.inst.registerTarget(this._targetHandle);
        GameManager.inst.troopSpawned(config.factionId);
    }

    // ─── onEnable / onDisable ────────────────────────────────────────
    onDisable(): void {
        if (this._targetHandle) {
            GameManager.inst?.unregisterTarget(this._targetHandle);
            this._targetHandle = null;
        }
    }

    // ─── 外部调用：设置河道减速系数 ─────────────────────────────────
    setRiverDebuff(mult: number): void {
        this._speedMultiplier = mult;
    }

    // ─── update ──────────────────────────────────────────────────────
    update(dt: number): void {
        if (!this.troopConfig) return;
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        if (this._state === TroopState.DEAD) return;

        // 更新 AttackTarget 位置
        if (this._targetHandle) {
            this.node.getWorldPosition(this._targetHandle.position);
        }

        // 灼烧 DOT
        this._updateBurn(dt);

        switch (this._state) {
            case TroopState.MARCHING: this._updateMarching(dt); break;
            case TroopState.COMBAT:   this._updateCombat(dt);   break;
        }
    }

    // ─── MARCHING ────────────────────────────────────────────────────
    private _updateMarching(dt: number): void {
        // 定期扫描敌人
        this._scanTimer += dt;
        if (this._scanTimer >= this._scanInterval) {
            this._scanTimer = 0;
            const target = this._findNearestEnemy();
            if (target) {
                this._currentTarget = target;
                this._state = TroopState.COMBAT;
                return;
            }
        }

        // 前进
        if (this._waypointIdx >= this._waypoints.length) return;
        const dest    = this._waypoints[this._waypointIdx];
        const myPos   = this.node.getWorldPosition();
        const speed   = this.troopConfig!.moveSpeed * this._speedMultiplier;
        const dx      = dest.x - myPos.x;
        const dz      = dest.z - myPos.z;
        const dist    = Math.sqrt(dx * dx + dz * dz);
        const step    = speed * dt;

        if (dist <= step) {
            this.node.setWorldPosition(dest.x, dest.y, dest.z);
            this._waypointIdx++;
        } else {
            const nx = myPos.x + (dx / dist) * step;
            const nz = myPos.z + (dz / dist) * step;
            this.node.setWorldPosition(nx, myPos.y, nz);
        }
    }

    // ─── COMBAT ──────────────────────────────────────────────────────
    private _updateCombat(dt: number): void {
        const cfg = this.troopConfig!;

        // 验证目标是否仍然有效
        if (!this._isTargetValid(this._currentTarget)) {
            this._currentTarget = this._findNearestEnemy();
            if (!this._currentTarget) {
                this._state = TroopState.MARCHING;
                this._atkIntervalMultiplier = 1.0;
                return;
            }
        }

        const target = this._currentTarget!;
        const myPos  = this.node.getWorldPosition();
        const dist   = Vec3.distance(myPos, target.position);

        // 计算近战/远程克制效果
        this._atkIntervalMultiplier = this._calcAtkMultiplier(cfg, target);

        if (cfg.atkRange <= 1.5) {
            // 近战：需要靠近目标
            if (dist > cfg.atkRange) {
                const dx   = target.position.x - myPos.x;
                const dz   = target.position.z - myPos.z;
                const norm = Math.sqrt(dx * dx + dz * dz);
                const step = cfg.moveSpeed * this._speedMultiplier * dt;
                this.node.setWorldPosition(
                    myPos.x + (dx / norm) * step,
                    myPos.y,
                    myPos.z + (dz / norm) * step,
                );
                return;
            }
        } else {
            // 远程：超出范围则切换目标或回 MARCHING
            if (dist > cfg.atkRange * 1.1) {
                this._currentTarget = this._findNearestEnemy();
                if (!this._currentTarget) this._state = TroopState.MARCHING;
                return;
            }
        }

        // 攻击计时
        this._attackTimer += dt;
        const interval = cfg.atkInterval * this._atkIntervalMultiplier;
        if (this._attackTimer >= interval) {
            this._attackTimer = 0;
            this._doAttack(target);
        }
    }

    // ─── 攻击执行 ────────────────────────────────────────────────────
    private _doAttack(target: AttackTarget): void {
        const cfg = this.troopConfig!;
        let damage = cfg.atk;

        // 特殊加成：对建筑
        if (target.isBuilding && cfg.special.includes('building_bonus')) {
            const m = parseFloat(cfg.special.match(/building_bonus_([\d.]+)/)?.[1] ?? '1');
            damage *= m;
        }
        // 特殊加成：弩手对近战 +1.2
        if (cfg.special.includes('melee_bonus') && target.tags?.includes('melee')) {
            const m = parseFloat(cfg.special.match(/melee_bonus_([\d.]+)/)?.[1] ?? '1');
            damage *= m;
        }

        if (cfg.atkRange <= 1.5) {
            // 近战直接命中
            target.onHit(damage, cfg.tags, cfg.factionId);
        } else {
            // 远程发射抛射物
            const pos = this.node.getWorldPosition();
            Projectile.launch(
                this.node.parent!,
                pos,
                target,
                damage,
                cfg.factionId,
                cfg.tags,
                FACTION_COLORS[cfg.factionId] ?? '#ffffff',
            );
        }
    }

    // ─── 受击回调（由 AttackTarget.onHit 触发） ──────────────────────
    private _onHit(damage: number, attackerTags: string[], attackerFactionId: string): void {
        if (this._state === TroopState.DEAD) return;

        let actualDmg = damage;

        // 轻甲灼烧额外伤害
        if (attackerTags.includes('burn') && this.troopConfig?.tags.includes('light_armor')) {
            actualDmg *= 1.3;
        }

        // 灼烧效果（吴 T2）
        if (attackerTags.includes('fire_bow')) {
            this._applyBurn(3, 3);
        }

        this._hp -= actualDmg;
        if (this._hp <= 0) this._die(attackerFactionId);
    }

    // ─── 灼烧 ────────────────────────────────────────────────────────
    private _applyBurn(dmgPerSec: number, duration: number): void {
        if (!this._burn) {
            this._burn = { dmgPerSec, remaining: duration, timer: 0 };
        } else {
            // 刷新计时
            this._burn.remaining = duration;
        }
    }

    private _updateBurn(dt: number): void {
        if (!this._burn) return;
        this._burn.timer     += dt;
        this._burn.remaining -= dt;
        if (this._burn.timer >= 1.0) {
            this._burn.timer -= 1.0;
            this._hp -= this._burn.dmgPerSec;
            if (this._hp <= 0) {
                this._die('');
                return;
            }
        }
        if (this._burn.remaining <= 0) this._burn = null;
    }

    // ─── 死亡 ────────────────────────────────────────────────────────
    private _die(killerFactionId: string): void {
        if (this._state === TroopState.DEAD) return;
        this._state = TroopState.DEAD;

        // 注销目标
        if (this._targetHandle) {
            GameManager.inst?.unregisterTarget(this._targetHandle);
            this._targetHandle = null;
        }
        GameManager.inst?.troopDied(this.factionId);

        // 击杀金币奖励
        if (killerFactionId && killerFactionId !== this.factionId) {
            const reward = this.troopConfig?.tier === 1
                ? GameManager.inst?.economyConfig?.killReward.tier1Troop ?? 1
                : GameManager.inst?.economyConfig?.killReward.tier2Troop ?? 3;
            GameManager.inst?.addGold(killerFactionId, reward);
        }

        EventManager.emit(GameEvent.TROOP_KILLED,
            this.troopConfig?.tier ?? 1, this.factionId, killerFactionId);

        // 0.3 秒缩小动画后归还池
        const node = this.node;
        tween(node)
            .to(0.3, { scale: new Vec3(0, 0, 0) })
            .call(() => {
                this._reset();
                TroopComponent._pool?.put(node);
            })
            .start();
    }

    private _reset(): void {
        this._hp             = 0;
        this._state          = TroopState.MARCHING;
        this._currentTarget  = null;
        this._waypoints      = [];
        this._waypointIdx    = 0;
        this._attackTimer    = 0;
        this._speedMultiplier = 1.0;
        this._burn           = null;
        this.troopConfig     = null;
    }

    // ─── 目标查找 ────────────────────────────────────────────────────
    private _findNearestEnemy(): AttackTarget | null {
        const cfg    = this.troopConfig!;
        const myPos  = this.node.getWorldPosition();
        let best: AttackTarget | null = null;
        let bestDist = Infinity;

        const targets = GameManager.inst.getTargets();
        for (const t of targets) {
            if (t.factionId === this.factionId) continue;
            const d = Vec3.distance(myPos, t.position);
            if (d <= cfg.atkRange) {
                // 远程优先锁定近战（风筝效果）
                if (cfg.atkRange > 1.5 && t.tags?.includes('melee') && d < bestDist) {
                    best = t; bestDist = d;
                } else if (d < bestDist) {
                    best = t; bestDist = d;
                }
            }
        }
        return best;
    }

    private _isTargetValid(t: AttackTarget | null): boolean {
        if (!t) return false;
        if (!t.node || !t.node.isValid || !t.node.active) return false;
        const dist = Vec3.distance(this.node.getWorldPosition(), t.position);
        return dist <= this.troopConfig!.atkRange * 1.5;
    }

    private _calcAtkMultiplier(cfg: TroopConfig, target: AttackTarget): number {
        // 近战攻击远程时，攻速 +20%（间隔 × 0.833）
        if (cfg.tags.includes('melee') && target.tags?.includes('ranged')) {
            return 0.833;
        }
        return 1.0;
    }

    // ─── 公开属性 ────────────────────────────────────────────────────
    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
    get state(): TroopState { return this._state; }
}
