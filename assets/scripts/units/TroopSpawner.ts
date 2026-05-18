/**
 * TroopSpawner.ts  ── Phase 2 扩展版（支持 Tier 3 出兵计时器）
 */
import { _decorator, Component, Node } from 'cc';
import { GameManager, TroopConfig, GamePhase, SpawnQueueItem } from '../core/GameManager';
import { TroopComponent } from './TroopComponent';
import { MapManager } from '../map/MapManager';

const { ccclass } = _decorator;

@ccclass('TroopSpawner')
export class TroopSpawner extends Component {
    factionId: string  = '';
    laneKey:   string  = '';
    level:     number  = 1;
    destroyed: boolean = false;

    private _troopRoot: Node | null = null;
    private _t1Timer:   number = 0;
    private _t2Timer:   number = 0;
    private _t3Timer:   number = 0;   // Phase 2
    private _t1Cfg:     TroopConfig | null = null;
    private _t2Cfg:     TroopConfig | null = null;
    private _t3Cfg:     TroopConfig | null = null; // Phase 2

    initSpawner(factionId: string, laneKey: string, troopRoot: Node): void {
        this.factionId  = factionId;
        this.laneKey    = laneKey;
        this._troopRoot = troopRoot;
        const gm = GameManager.inst;
        if (!gm) { console.error('[TroopSpawner] GameManager not ready'); return; }
        this._t1Cfg = gm.getTroopConfig(factionId, 1);
        this._t2Cfg = gm.getTroopConfig(factionId, 2);
        this._t3Cfg = gm.getTroopConfig(factionId, 3);
    }

    upgradeToLevel2(): void { this.level = 2; this._t2Timer = 0; }

    /** Phase 2: 升级至 3 级，解锁 Tier 3 出兵 */
    upgradeToLevel3(): void { this.level = 3; this._t3Timer = 0; }

    update(dt: number): void {
        if (this.destroyed) return;
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;

        if (this._t1Cfg) {
            this._t1Timer += dt;
            if (this._t1Timer >= this._t1Cfg.spawnInterval) {
                this._t1Timer -= this._t1Cfg.spawnInterval;
                this._trySpawn(this._t1Cfg);
            }
        }
        if (this.level >= 2 && this._t2Cfg) {
            this._t2Timer += dt;
            if (this._t2Timer >= this._t2Cfg.spawnInterval) {
                this._t2Timer -= this._t2Cfg.spawnInterval;
                this._trySpawn(this._t2Cfg);
            }
        }
        // Phase 2: Tier 3 出兵
        if (this.level >= 3 && this._t3Cfg) {
            this._t3Timer += dt;
            if (this._t3Timer >= this._t3Cfg.spawnInterval) {
                this._t3Timer -= this._t3Cfg.spawnInterval;
                this._trySpawn(this._t3Cfg);
            }
        }
    }

    private _trySpawn(cfg: TroopConfig): void {
        const gm = GameManager.inst;
        if (!gm) return;
        if (!gm.spendGold(this.factionId, cfg.spawnCost)) return;
        const doSpawn = () => this._doSpawn(cfg);
        if (!gm.canSpawnNow()) {
            gm.enqueueSpawn({ factionId: this.factionId, laneKey: this.laneKey, troopConfig: cfg, callback: doSpawn });
            return;
        }
        doSpawn();
    }

    private _doSpawn(cfg: TroopConfig): void {
        if (!this._troopRoot || !MapManager.inst) return;
        const wps = MapManager.inst.getLaneWaypoints(this.laneKey);
        if (wps.length === 0) return;
        const spawnPos = this.node.getWorldPosition();
        spawnPos.y = 0.3;
        TroopComponent.spawn(this._troopRoot, spawnPos, cfg, wps);
    }
}
