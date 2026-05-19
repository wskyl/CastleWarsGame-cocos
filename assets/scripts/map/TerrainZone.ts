/**
 * TerrainZone.ts
 * 地形区域触发器：每帧检测场上士兵是否在河道内，并更新其移速系数。
 * 挂载于 Battle 场景的 TerrainZoneController 节点。
 * 依赖 MapManager（提供河道数据）和 GameManager（遍历活跃目标）。
 */
import { _decorator, Component, Vec3 } from 'cc';
import { GameManager, GamePhase } from '../core/GameManager';
import { MapManager } from './MapManager';
import { TroopComponent } from '../units/TroopComponent';

const { ccclass } = _decorator;

/** TerrainZone 只负责检测并通知 TroopComponent，不直接修改移速 */
@ccclass('TerrainZone')
export class TerrainZone extends Component {
    /** 检测间隔（秒），降低 CPU 开销 */
    private _checkInterval: number = 0.1;
    private _checkTimer: number = 0;

    update(dt: number): void {
        if (GameManager.safeInst?.phase !== GamePhase.PLAYING) return;

        this._checkTimer += dt;
        if (this._checkTimer < this._checkInterval) return;
        this._checkTimer = 0;

        const mapMgr = MapManager.inst;
        if (!mapMgr) return;

        // 遍历所有活跃目标，检测河道
        const targets = GameManager.safeInst?.getTargets();
        if (!targets) return;

        for (const target of targets) {
            if (target.isBuilding) continue;
            // 使用类型安全的 getComponent(TroopComponent) 替代 string 查找 + as any
            const troop = target.node.getComponent(TroopComponent);
            if (!troop) continue;
            if (troop.factionConfig?.riverImmune) continue;

            const pos = target.position;
            const inRiver = mapMgr.isInRiver(pos);
            troop.setRiverDebuff(inRiver ? mapMgr.riverSlowMultiplier : 1.0);
        }
    }
}
