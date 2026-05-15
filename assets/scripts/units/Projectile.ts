/**
 * Projectile.ts
 * 抛射物组件：从发射点飞向目标，命中触发伤害，目标死亡时自毁。
 * 通过 ObjectPool 管理，归还时重置状态。
 */
import { _decorator, Component, Node, Vec3, MeshRenderer, Material, Color, primitives, utils } from 'cc';
import { GameManager, AttackTarget } from '../core/GameManager';
import { ObjectPool } from '../core/ObjectPool';
import { hexToColor } from '../faction/FactionData';

const { ccclass } = _decorator;

/** 飞行速度（单位/秒） */
const PROJECTILE_SPEED = 10;

@ccclass('Projectile')
export class Projectile extends Component {
    // ─── 静态对象池（全局共享） ─────────────────────────────────────────
    private static _pool: ObjectPool | null = null;

    static initPool(parent: Node): void {
        if (Projectile._pool) return;
        Projectile._pool = new ObjectPool(() => {
            const n = new Node('Projectile');
            n.parent = parent;
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = utils.createMesh(
                primitives.sphere({ radius: 0.1, segments: 6 }),
            );
            const mat = new Material();
            mat.initialize({ effectName: 'builtin-unlit' });
            mr.setMaterial(mat, 0);
            n.addComponent(Projectile);
            n.active = false;
            return n;
        }, 30, 60);
    }

    /** 发射一枚抛射物 */
    static launch(
        parent: Node,
        startPos: Vec3,
        target: AttackTarget,
        damage: number,
        attackerFactionId: string,
        attackerTags: string[],
        factionColor: string,
    ): void {
        Projectile.initPool(parent);
        const node = Projectile._pool!.get();
        node.parent = parent;
        node.setWorldPosition(startPos);

        const proj = node.getComponent(Projectile)!;
        proj._target          = target;
        proj._damage          = damage;
        proj._attackerFaction = attackerFactionId;
        proj._attackerTags    = attackerTags;
        proj._alive           = true;

        // 设置颜色
        const mr = node.getComponent(MeshRenderer)!;
        const mat = mr.getMaterial(0)!;
        const col = hexToColor(factionColor);
        mat.setProperty('mainColor', col);
        mat.setProperty('albedo',    col);
    }

    // ─── 实例字段 ─────────────────────────────────────────────────────
    private _target:          AttackTarget | null = null;
    private _damage:          number = 0;
    private _attackerFaction: string = '';
    private _attackerTags:    string[] = [];
    private _alive:           boolean = false;

    update(dt: number): void {
        if (!this._alive || !this._target) {
            this._recycle();
            return;
        }

        // 目标失效（死亡/摧毁）
        if (!this._target.node || !this._target.node.isValid || !this._target.node.active) {
            this._recycle();
            return;
        }

        const myPos = this.node.getWorldPosition();
        const tgPos = this._target.position;

        const dir  = new Vec3(tgPos.x - myPos.x, tgPos.y - myPos.y, tgPos.z - myPos.z);
        const dist = Vec3.len(dir);

        const step = PROJECTILE_SPEED * dt;

        if (dist <= step) {
            // 命中
            this._target.onHit(this._damage, this._attackerTags, this._attackerFaction);
            this._recycle();
        } else {
            Vec3.normalize(dir, dir);
            this.node.setWorldPosition(
                myPos.x + dir.x * step,
                myPos.y + dir.y * step,
                myPos.z + dir.z * step,
            );
        }
    }

    private _recycle(): void {
        this._alive  = false;
        this._target = null;
        if (Projectile._pool) {
            Projectile._pool.put(this.node);
        } else {
            this.node.active = false;
        }
    }
}
