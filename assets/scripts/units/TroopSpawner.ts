/**
 * TroopSpawner.ts
 * 兵营出兵定时器：
 *   - 1 级兵营：每 spawnInterval 秒出 1 只 Tier 1 兵（扣 5 金）
 *   - 2 级兵营：同时开启 Tier 2 计时器（额外每 spawnInterval2 秒出 1 只 Tier 2 兵，扣 12 金）
 *   - 金币不足时进队列等待，队列在金币到达阈值时由 GameManager.update 刷新
 *   - 全局兵力达到上限时也入队列等待
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { GameManager, TroopConfig, GamePhase, SpawnQueueItem } from '../core/GameManager';
import { TroopComponent } from './TroopComponent';
import { MapManager } from '../map/MapManager';

const { ccclass } = _decorator;

@ccclass('TroopSpawner')
export class TroopSpawner extends Component {
    factionId: string = '';
    laneKey:   string = '';
    level:     number = 1;
    active2:   boolean = false; // 是否已摧毁（外部设置）
    destroyed: boolean = false;

    private _troopRoot: Node | null = null;
    private _t1Timer: number = 0;
    private _t2Timer: number = 0;
    private _t1Cfg: TroopConfig | null = null;
    private _t2Cfg: TroopConfig | null = null;

    initSpawner(factionId: string, laneKey: string, troopRoot: Node): void {
        this.factionId  = factionId;
        this.laneKey    = laneKey;
        this._troopRoot = troopRoot;
        this._t1Cfg = GameManager.inst.getTroopConfig(factionId, 1);
        this._t2Cfg = GameManager.inst.getTroopConfig(factionId, 2);
    }

    upgradeToLevel2(): void {
        this.level = 2;
        this._t2Timer = 0;
    }

    update(dt: number): void {
        if (this.destroyed) return;
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;

        // Tier 1 出兵计时
        if (this._t1Cfg) {
            this._t1Timer += dt;
            if (this._t1Timer >= this._t1Cfg.spawnInterval) {
                this._t1Timer -= this._t1Cfg.spawnInterval;
                this._trySpawn(this._t1Cfg);
            }
        }

        // Tier 2 出兵计时（仅 2 级兵营）
        if (this.level >= 2 && this._t2Cfg) {
            this._t2Timer += dt;
            if (this._t2Timer >= this._t2Cfg.spawnInterval) {
                this._t2Timer -= this._t2Cfg.spawnInterval;
                this._trySpawn(this._t2Cfg);
            }
        }
    }

    private _trySpawn(cfg: TroopConfig): void {
        // 金币检测
        if (!GameManager.inst.spendGold(this.factionId, cfg.spawnCost)) {
            // 加入队列等待（当前轮次放弃，下一个间隔重试）
            return;
        }

        const doSpawn = () => this._doSpawn(cfg);

        // 全局上限检测
        if (!GameManager.inst.canSpawnNow()) {
            const item: SpawnQueueItem = {
                factionId:   this.factionId,
                laneKey:     this.laneKey,
                troopConfig: cfg,
                callback:    doSpawn,
            };
            GameManager.inst.enqueueSpawn(item);
            return;
        }

        doSpawn();
    }

    private _doSpawn(cfg: TroopConfig): void {
        if (!this._troopRoot) return;
        const mapMgr = MapManager.inst;
        if (!mapMgr) return;

        const waypoints = mapMgr.getLaneWaypoints(this.laneKey);
        if (waypoints.length === 0) return;

        // 出生位置 = 路径第一点附近（即本兵营位置）
        const spawnPos = this.node.getWorldPosition();
        spawnPos.y = 0.3;

        TroopComponent.spawn(this._troopRoot, spawnPos, cfg, waypoints);
    }
}
