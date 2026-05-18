/**
 * UnitManager.ts  ── 单位全局注册表
 * 维护场上所有存活单位的活跃列表，提供空间查询接口，
 * 替代各模块频繁执行的 scene.getComponentsInChildren 遍历。
 *
 * 使用 IRegisteredUnit 接口而非直接导入 TroopComponent，
 * 彻底避免与 TroopComponent 的循环引用。
 *
 * 持久单例：挂载在 GameBoot 节点上。
 */
import { _decorator, Component, director, Vec3, Node } from 'cc';

const { ccclass } = _decorator;

// ─── 注册接口（TroopComponent 实现此接口，避免循环引用） ───────────────────
export interface IRegisteredUnit {
    /** 所属阵营 */
    readonly factionId: string;
    /** 挂载节点（Component.node 满足此接口） */
    readonly node: Node;
}

@ccclass('UnitManager')
export class UnitManager extends Component {

    // ─── 单例 ──────────────────────────────────────────────────────────────
    private static _inst: UnitManager | null = null;
    static get inst(): UnitManager | null { return UnitManager._inst; }

    // ─── 内部状态 ───────────────────────────────────────────────────────────
    /** factionId → 该阵营所有存活单位 */
    private _unitMap: Map<string, Set<IRegisteredUnit>> = new Map();
    /** 全局平铺列表（快速遍历用） */
    private _allUnits: Set<IRegisteredUnit> = new Set();

    // ─── 生命周期 ───────────────────────────────────────────────────────────
    onLoad(): void {
        if (UnitManager._inst && UnitManager._inst !== this) {
            this.destroy();
            return;
        }
        UnitManager._inst = this;
        if (!director.isPersistRootNode(this.node)) {
            director.addPersistRootNode(this.node);
        }
    }

    onDestroy(): void {
        if (UnitManager._inst === this) UnitManager._inst = null;
    }

    // ─── 注册 / 注销 ────────────────────────────────────────────────────────

    /**
     * 在单位出生时调用（TroopComponent.onEnable 或 initTroop 末尾）。
     */
    register(unit: IRegisteredUnit): void {
        const fid = unit.factionId;
        if (!fid) return;
        let set = this._unitMap.get(fid);
        if (!set) { set = new Set(); this._unitMap.set(fid, set); }
        set.add(unit);
        this._allUnits.add(unit);
    }

    /**
     * 在单位死亡/回收时调用（TroopComponent.onDisable 或 _die 末尾）。
     */
    unregister(unit: IRegisteredUnit): void {
        const fid = unit.factionId;
        if (fid) this._unitMap.get(fid)?.delete(unit);
        this._allUnits.delete(unit);
    }

    // ─── 查询 API ───────────────────────────────────────────────────────────

    /** 返回某阵营所有存活单位（只读集合） */
    getUnitsOfFaction(factionId: string): ReadonlySet<IRegisteredUnit> {
        return this._unitMap.get(factionId) ?? new Set();
    }

    /** 返回所有存活单位（只读集合） */
    getAllUnits(): ReadonlySet<IRegisteredUnit> {
        return this._allUnits;
    }

    /**
     * 返回距 origin 半径 radius 内的所有单位。
     * @param factionId 不传则不过滤阵营
     */
    getUnitsInRadius(
        origin: Vec3,
        radius: number,
        factionId?: string
    ): IRegisteredUnit[] {
        const r2     = radius * radius;
        const source = factionId
            ? (this._unitMap.get(factionId) ?? new Set<IRegisteredUnit>())
            : this._allUnits;
        const result: IRegisteredUnit[] = [];
        const tmp = new Vec3();
        source.forEach(u => {
            if (!u.node?.isValid) return;
            Vec3.subtract(tmp, u.node.worldPosition, origin);
            if (tmp.lengthSqr() <= r2) result.push(u);
        });
        return result;
    }

    /** 返回距 origin 最近的敌方单位（不属于 ownerFaction），无则返回 null */
    getNearestEnemy(origin: Vec3, ownerFaction: string): IRegisteredUnit | null {
        let nearest: IRegisteredUnit | null = null;
        let minDist = Infinity;
        const tmp = new Vec3();
        this._allUnits.forEach(u => {
            if (!u.node?.isValid) return;
            if (u.factionId === ownerFaction) return;
            Vec3.subtract(tmp, u.node.worldPosition, origin);
            const d = tmp.lengthSqr();
            if (d < minDist) { minDist = d; nearest = u; }
        });
        return nearest;
    }

    /** 某阵营当前场上存活单位数 */
    countUnits(factionId: string): number {
        return this._unitMap.get(factionId)?.size ?? 0;
    }

    /** 清空所有注册（重新开始游戏时调用） */
    clearAll(): void {
        this._unitMap.clear();
        this._allUnits.clear();
    }
}
