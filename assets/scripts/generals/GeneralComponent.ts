/**
 * GeneralComponent.ts
 * 将领单元：强力 AI 控制单元，跟随路线行进、战斗、使用主动技能。
 * 由 GeneralAltar.summonGeneral() 创建并激活。
 * 死亡后通知 GameManager 开始重生计时。
 *
 * 技能类型实现：
 *   "faction_buff"   → 设置 GameManager 中的 GeneralBuff，持续 duration 秒
 *   "invincible_aoe" → 本将领无敌 duration 秒 + AOE 伤害
 *   "lane_burn"      → 对前方直线内所有敌军施加灼烧 DOT
 */
import {
    _decorator, Component, Node, Vec3, MeshRenderer, Material, Color,
    primitives, utils, tween,
} from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { GeneralConfig, GeneralSkillConfig, GeneralSkillParams } from './GeneralData';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';
import { MapManager } from '../map/MapManager';
import { Projectile } from '../units/Projectile';

const { ccclass } = _decorator;

@ccclass('GeneralComponent')
export class GeneralComponent extends Component {
    // ─── 实例数据 ──────────────────────────────────────────────────────
    factionId:   string        = '';
    generalCfg:  GeneralConfig | null = null;

    private _hp:          number  = 0;
    private _maxHp:       number  = 0;
    private _isInvincible: boolean = false;
    private _skillCooldown: number = 0;

    // 行军
    private _waypoints:    Vec3[] = [];
    private _waypointIdx:  number = 0;
    private _troopRoot:    Node | null = null;

    // 战斗
    private _attackTimer:  number = 0;
    private _currentTarget: AttackTarget | null = null;
    private _scanTimer:    number = 0;

    // AttackTarget 注册句柄
    private _targetHandle: AttackTarget | null = null;

    // ─── 初始化 ─────────────────────────────────────────────────────
    init(cfg: GeneralConfig, waypoints: Vec3[], troopRoot: Node): void {
        this.generalCfg  = cfg;
        this.factionId   = cfg.factionId;
        this._hp         = cfg.hp;
        this._maxHp      = cfg.hp;
        this._waypoints  = waypoints;
        this._waypointIdx = 0;
        this._troopRoot  = troopRoot;
        this._skillCooldown = 0;

        // 设置颜色（亮金色区分将领）
        const mr = this.node.getComponent(MeshRenderer)!;
        const mat = mr.getMaterial(0)!;
        const factionCol = hexToColor(FACTION_COLORS[cfg.factionId] ?? '#ffffff');
        // 略微提亮
        const r = Math.min(255, factionCol.r + 60);
        const g = Math.min(255, factionCol.g + 60);
        const b = Math.min(255, factionCol.b + 20);
        const brightCol = new Color(r, g, b, 255);
        mat.setProperty('mainColor', brightCol);
        mat.setProperty('albedo',    brightCol);

        // 注册为可攻击目标
        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._targetHandle = {
            node:       this.node,
            factionId:  cfg.factionId,
            position:   pos,
            isBuilding: false,
            tags:       cfg.tags,
            tier:       10, // 将领特殊 tier（不计入普通兵力）
            onHit:      this._onHit.bind(this),
        };
        GameManager.inst.registerTarget(this._targetHandle);
    }

    // ─── update ─────────────────────────────────────────────────────
    update(dt: number): void {
        if (!this.generalCfg) return;
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;

        // 更新位置
        if (this._targetHandle) {
            this.node.getWorldPosition(this._targetHandle.position);
        }

        // 技能冷却
        if (this._skillCooldown > 0) {
            this._skillCooldown -= dt;
        }

        // 更新 GameManager 中的技能冷却显示
        const gs = GameManager.inst.getGeneralState(this.factionId);
        if (gs) gs.skillCooldown = this._skillCooldown;

        this._scanTimer += dt;
        if (this._scanTimer >= 0.15) {
            this._scanTimer = 0;
            const target = this._findNearestEnemy();
            if (target) {
                this._currentTarget = target;
            } else if (!this._isTargetValid(this._currentTarget)) {
                this._currentTarget = null;
            }
        }

        if (this._currentTarget) {
            this._updateCombat(dt);
        } else {
            this._updateMarching(dt);
        }
    }

    // ─── 行军 ───────────────────────────────────────────────────────
    private _updateMarching(dt: number): void {
        if (this._waypointIdx >= this._waypoints.length) return;
        const cfg   = this.generalCfg!;
        const dest  = this._waypoints[this._waypointIdx];
        const myPos = this.node.getWorldPosition();
        const dx    = dest.x - myPos.x;
        const dz    = dest.z - myPos.z;
        const dist  = Math.sqrt(dx * dx + dz * dz);
        const step  = cfg.moveSpeed * dt;
        if (dist <= step) {
            this.node.setWorldPosition(dest.x, dest.y, dest.z);
            this._waypointIdx++;
        } else {
            this.node.setWorldPosition(myPos.x + (dx/dist)*step, myPos.y, myPos.z + (dz/dist)*step);
        }
    }

    // ─── 战斗 ───────────────────────────────────────────────────────
    private _updateCombat(dt: number): void {
        if (!this._isTargetValid(this._currentTarget)) {
            this._currentTarget = this._findNearestEnemy();
            if (!this._currentTarget) return;
        }
        const cfg    = this.generalCfg!;
        const target = this._currentTarget!;
        const myPos  = this.node.getWorldPosition();
        const dist   = Vec3.distance(myPos, target.position);

        // 近战：靠近目标
        if (cfg.atkRange <= 2.0 && dist > cfg.atkRange) {
            const dx = target.position.x - myPos.x;
            const dz = target.position.z - myPos.z;
            const n  = Math.sqrt(dx*dx + dz*dz);
            const step = cfg.moveSpeed * dt;
            this.node.setWorldPosition(myPos.x + (dx/n)*step, myPos.y, myPos.z + (dz/n)*step);
            return;
        }

        this._attackTimer += dt;
        if (this._attackTimer >= cfg.atkInterval) {
            this._attackTimer = 0;
            this._doAttack(target);
        }
    }

    private _doAttack(target: AttackTarget): void {
        const cfg = this.generalCfg!;
        if (cfg.atkRange <= 2.0) {
            target.onHit(cfg.atk, cfg.tags, cfg.factionId);
        } else {
            const pos = this.node.getWorldPosition();
            Projectile.launch(this._troopRoot!, pos, target, cfg.atk, cfg.factionId, cfg.tags,
                FACTION_COLORS[cfg.factionId] ?? '#ffffff');
        }
    }

    // ─── 主动技能 ────────────────────────────────────────────────────
    useSkill(): void {
        if (!this.generalCfg || this._skillCooldown > 0) return;
        const skill = this.generalCfg.skill;
        this._skillCooldown = skill.cooldown;

        switch (skill.type) {
            case 'faction_buff':    this._skillFactionBuff(skill); break;
            case 'invincible_aoe':  this._skillInvincibleAoe(skill); break;
            case 'lane_burn':       this._skillLaneBurn(skill); break;
        }
    }

    private _skillFactionBuff(skill: GeneralSkillConfig): void {
        const p = skill.params;
        GameManager.inst.applyGeneralBuff(this.factionId, {
            factionId:       this.factionId,
            atkIntervalMult: p.atkIntervalMult ?? 1.0,
            dmgMult:         p.dmgMult         ?? 1.0,
            expiresAt:       GameManager.inst.elapsedSeconds + skill.duration,
        });
    }

    private _skillInvincibleAoe(skill: GeneralSkillConfig): void {
        const p = skill.params;
        this._isInvincible = true;
        // AOE 伤害
        const myPos = this.node.getWorldPosition();
        const aoeR  = p.aoeRadius ?? 5;
        const aoeDmg = p.aoeDamage ?? 80;
        GameManager.inst.getTargets().forEach(t => {
            if (t.factionId === this.factionId) return;
            if (Vec3.distance(myPos, t.position) <= aoeR) {
                t.onHit(aoeDmg, ['aoe', 'general'], this.factionId);
            }
        });
        // 无敌持续 duration 秒后解除
        this.scheduleOnce(() => { this._isInvincible = false; }, skill.duration);
    }

    private _skillLaneBurn(skill: GeneralSkillConfig): void {
        const p = skill.params;
        const myPos    = this.node.getWorldPosition();
        const burnR    = p.burnRange  ?? 10;
        const burnW    = p.burnRadius ?? 3;
        const burnDmg  = p.burnDmgPerSec ?? 8;
        const burnDur  = p.burnDuration   ?? 5;
        // 沿行进方向（当前路段方向）的锥形区域
        let dirX = 0; let dirZ = -1;
        if (this._waypointIdx < this._waypoints.length) {
            const wp = this._waypoints[this._waypointIdx];
            const dx = wp.x - myPos.x;
            const dz = wp.z - myPos.z;
            const n  = Math.sqrt(dx*dx + dz*dz);
            if (n > 0) { dirX = dx/n; dirZ = dz/n; }
        }
        GameManager.inst.getTargets().forEach(t => {
            if (t.factionId === this.factionId) return;
            const tx = t.position.x - myPos.x;
            const tz = t.position.z - myPos.z;
            const proj = tx * dirX + tz * dirZ; // 前方分量
            if (proj < 0 || proj > burnR) return;
            const perp = Math.abs(tx * (-dirZ) + tz * dirX); // 横向分量
            if (perp > burnW) return;
            // 施加灼烧（通过 onHit 附上 burn 标签，TroopComponent 处理）
            for (let i = 0; i < burnDur; i++) {
                const delay = i;
                this.scheduleOnce(() => {
                    if (t.node?.isValid && t.node.active) {
                        t.onHit(burnDmg, ['fire_bow', 'burn'], this.factionId);
                    }
                }, delay);
            }
        });
    }

    // ─── 受击 ───────────────────────────────────────────────────────
    private _onHit(damage: number, _tags: string[], _factionId: string): void {
        if (this._isInvincible) return;
        this._hp -= damage;
        if (this._hp <= 0) this._die();
    }

    private _die(): void {
        if (this._targetHandle) {
            GameManager.inst?.unregisterTarget(this._targetHandle);
            this._targetHandle = null;
        }
        GameManager.inst?.generalDied(this.factionId);
        tween(this.node).to(0.3, { scale: new Vec3(0, 0, 0) }).call(() => {
            this.node.destroy();
        }).start();
    }

    // ─── 目标查找 ────────────────────────────────────────────────────
    private _findNearestEnemy(): AttackTarget | null {
        const myPos = this.node.getWorldPosition();
        let best: AttackTarget | null = null;
        let bestDist = Infinity;
        GameManager.inst.getTargets().forEach(t => {
            if (t.factionId === this.factionId) return;
            const d = Vec3.distance(myPos, t.position);
            if (d <= this.generalCfg!.atkRange && d < bestDist) {
                best = t; bestDist = d;
            }
        });
        return best;
    }

    private _isTargetValid(t: AttackTarget | null): boolean {
        if (!t) return false;
        if (!t.node?.isValid || !t.node.active) return false;
        return Vec3.distance(this.node.getWorldPosition(), t.position) <= this.generalCfg!.atkRange * 1.5;
    }

    onDisable(): void {
        if (this._targetHandle) {
            GameManager.inst?.unregisterTarget(this._targetHandle);
            this._targetHandle = null;
        }
    }

    get skillCooldown(): number { return this._skillCooldown; }
    get skillReady(): boolean { return this._skillCooldown <= 0; }
    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
}
