/**
 * MapManager.ts
 * 地图数据管理：提供路径点查询、地形区域数据、建筑位置数据。
 * 挂载于 Battle 场景的 MapRoot 节点。
 */
import { _decorator, Component, Vec3 } from 'cc';
import { GameManager } from '../core/GameManager';

const { ccclass } = _decorator;

@ccclass('MapManager')
export class MapManager extends Component {
    private static _inst: MapManager | null = null;
    static get inst(): MapManager | null { return MapManager._inst; }

    onLoad(): void { MapManager._inst = this; }
    onDestroy(): void { if (MapManager._inst === this) MapManager._inst = null; }

    /** 获取某条路线的路径点数组（Vec3，y=0） */
    getLaneWaypoints(laneKey: string): Vec3[] {
        const raw = GameManager.inst?.getLaneWaypoints(laneKey) ?? [];
        return raw.map(p => new Vec3(p.x, 0, p.z));
    }

    /** 获取主城世界坐标 */
    getCastlePosition(factionId: string): Vec3 {
        const pos = GameManager.inst?.mapConfig?.castlePositions[factionId];
        return pos ? new Vec3(pos.x, pos.y, pos.z) : Vec3.ZERO.clone();
    }

    /** 获取祭坛位置 */
    getAltarPosition(): Vec3 {
        const pos = GameManager.inst?.mapConfig?.altarPosition;
        return pos ? new Vec3(pos.x, pos.y, pos.z) : Vec3.ZERO.clone();
    }

    /** 河道列表（供 TerrainZone 初始化用） */
    getRivers(): Array<{ id: string; start: Vec3; end: Vec3; width: number }> {
        const rivers = GameManager.inst?.mapConfig?.rivers ?? [];
        return rivers.map(r => ({
            id:    r.id,
            start: new Vec3(r.start.x, 0, r.start.z),
            end:   new Vec3(r.end.x,   0, r.end.z),
            width: r.width,
        }));
    }

    /** 河道减速倍率 */
    get riverSlowMultiplier(): number {
        return GameManager.inst?.mapConfig?.riverSlowMultiplier ?? 0.7;
    }

    /** 祭坛占领半径 */
    get altarRadius(): number {
        return GameManager.inst?.mapConfig?.altarRadius ?? 4.5;
    }

    /** 祭坛蓄力时长（秒） */
    get altarCaptureDuration(): number {
        return GameManager.inst?.mapConfig?.altarCaptureDuration ?? 3;
    }

    /** 判断世界坐标点是否在河道内（点到线段距离 ≤ width/2） */
    isInRiver(worldPos: Vec3): boolean {
        const rivers = this.getRivers();
        for (const r of rivers) {
            if (pointToSegmentDist(worldPos, r.start, r.end) <= r.width / 2) return true;
        }
        return false;
    }
}

/** 点到线段的距离（忽略 y 轴） */
function pointToSegmentDist(p: Vec3, a: Vec3, b: Vec3): number {
    const ab = new Vec3(b.x - a.x, 0, b.z - a.z);
    const ap = new Vec3(p.x - a.x, 0, p.z - a.z);
    const lenSq = ab.x * ab.x + ab.z * ab.z;
    if (lenSq === 0) return Math.sqrt(ap.x * ap.x + ap.z * ap.z);
    let t = (ap.x * ab.x + ap.z * ab.z) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + t * ab.x);
    const dz = p.z - (a.z + t * ab.z);
    return Math.sqrt(dx * dx + dz * dz);
}
