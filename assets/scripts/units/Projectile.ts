/**
 * Projectile.ts  ── Phase 2 扩展版
 * 新增 launchWithSplash()：命中时触发 AOE splash 伤害（供火油塔和解烦军使用）。
 */
import { _decorator, Component, Node, Vec3, MeshRenderer, Material, Color, primitives, utils } from 'cc';
import { GameManager, AttackTarget } from '../core/GameManager';
import { ObjectPool } from '../core/ObjectPool';
import { hexToColor } from '../faction/FactionData';

const { ccclass } = _decorator;

const PROJECTILE_SPEED = 10;

@ccclass('Projectile')
export class Projectile extends Component {
    private static _pool: ObjectPool | null = null;

    static initPool(parent: Node): void {
        if (Projectile._pool) return;
        Projectile._pool = new ObjectPool(() => {
            const n = new Node('Projectile'); n.parent = parent;
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = utils.createMesh(primitives.sphere({ radius: 0.1, segments: 6 }));
            const mat = new Material(); mat.initialize({ effectName: 'builtin-unlit' });
            mr.setMaterial(mat, 0);
            n.addComponent(Projectile); n.active = false; return n;
        }, 30, 60);
    }

    /** 发射普通单体抛射物 */
    static launch(parent: Node, startPos: Vec3, target: AttackTarget,
        damage: number, attackerFactionId: string, attackerTags: string[], factionColor: string): void {
        Projectile.initPool(parent);
        const node = Projectile._pool!.get();
        node.parent = parent;
        node.setWorldPosition(startPos);
        const proj = node.getComponent(Projectile)!;
        proj._initProj(target, damage, attackerFactionId, attackerTags, factionColor, 0, 0, 0);
    }

    /** Phase 2: 发射 AOE splash 抛射物 */
    static launchWithSplash(parent: Node, startPos: Vec3, target: AttackTarget,
        damage: number, attackerFactionId: string, attackerTags: string[], factionColor: string,
        splashRadius: number, burnDmgPerSec: number, burnDuration: number): void {
        Projectile.initPool(parent);
        const node = Projectile._pool!.get();
        node.parent = parent;
        node.setWorldPosition(startPos);
        const proj = node.getComponent(Projectile)!;
        proj._initProj(target, damage, attackerFactionId, attackerTags, factionColor, splashRadius, burnDmgPerSec, burnDuration);
    }

    // ─── 实例字段 ─────────────────────────────────────────────────────
    private _target:          AttackTarget | null = null;
    private _damage:          number = 0;
    private _attackerFaction: string = '';
    private _attackerTags:    string[] = [];
    private _alive:           boolean = false;
    private _splashRadius:    number = 0;
    private _burnDmgPerSec:   number = 0;
    private _burnDuration:    number = 0;

    private _initProj(target: AttackTarget, damage: number, attackerFactionId: string,
        attackerTags: string[], factionColor: string,
        splashRadius: number, burnDmgPerSec: number, burnDuration: number): void {
        this._target          = target;
        this._damage          = damage;
        this._attackerFaction = attackerFactionId;
        this._attackerTags    = attackerTags;
        this._alive           = true;
        this._splashRadius    = splashRadius;
        this._burnDmgPerSec   = burnDmgPerSec;
        this._burnDuration    = burnDuration;

        const mr  = this.node.getComponent(MeshRenderer)!;
        const mat = mr.getMaterial(0)!;
        const col = hexToColor(factionColor);
        mat.setProperty('mainColor', col); mat.setProperty('albedo', col);
    }

    update(dt: number): void {
        if (!this._alive || !this._target) { this._recycle(); return; }
        if (!this._target.node?.isValid || !this._target.node.active) { this._recycle(); return; }

        const myPos = this.node.getWorldPosition();
        const tgPos = this._target.position;
        const dir   = new Vec3(tgPos.x - myPos.x, tgPos.y - myPos.y, tgPos.z - myPos.z);
        const dist  = Vec3.len(dir);
        const step  = PROJECTILE_SPEED * dt;

        if (dist <= step) {
            this._onHitTarget();
            this._recycle();
        } else {
            Vec3.normalize(dir, dir);
            this.node.setWorldPosition(myPos.x + dir.x*step, myPos.y + dir.y*step, myPos.z + dir.z*step);
        }
    }

    private _onHitTarget(): void {
        // 主目标伤害
        this._target!.onHit(this._damage, this._attackerTags, this._attackerFaction);

        // Phase 2: AOE splash 伤害
        if (this._splashRadius > 0) {
            const hitPos = this._target!.position;
            GameManager.inst.getTargets().forEach(t => {
                if (t === this._target) return;
                if (t.factionId === this._attackerFaction) return;
                if (Vec3.distance(hitPos, t.position) <= this._splashRadius) {
                    const splashDmg = this._damage * 0.5; // splash 为主伤害 50%
                    const tags = [...this._attackerTags];
                    if (this._burnDuration > 0) tags.push('fire_bow', 'burn');
                    t.onHit(splashDmg, tags, this._attackerFaction);
                }
            });
        }
    }

    private _recycle(): void {
        this._alive = false; this._target = null;
        Projectile._pool ? Projectile._pool.put(this.node) : (this.node.active = false);
    }
}
