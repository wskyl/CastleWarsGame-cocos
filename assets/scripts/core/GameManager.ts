/**
 * GameManager.ts
 * 游戏全局单例：负责加载配置、管理游戏状态、阵营金币/兵力、胜负判断、计时、对象注册。
 * 挂载于 Battle 场景中一个永驻节点上（或通过 director.addPersistRootNode 持久化）。
 */
import {
    _decorator, Component, JsonAsset, resources, director, sys,
} from 'cc';
import { EventManager, GameEvent } from './EventManager';
import { ObjectPool } from './ObjectPool';

const { ccclass, property } = _decorator;

// ─── 公共接口 ──────────────────────────────────────────────────────────────
export interface FactionConfig {
    factionId: string;
    displayName: string;
    color: string;
    riverImmune: boolean;
}

export interface TroopConfig {
    troopId: string;
    factionId: string;
    tier: number;
    name: string;
    hp: number;
    atk: number;
    atkInterval: number;
    moveSpeed: number;
    atkRange: number;
    spawnCost: number;
    spawnInterval: number;
    tags: string[];
    special: string;
}

export interface BuildingConfig {
    castle: { hp: number; scaleX: number; scaleY: number; scaleZ: number };
    barracks: { level1Hp: number; buildCost: number; upgradeCost: number };
    generalAltar: { hp: number; radius: number; height: number; alpha: number };
}

export interface EconomyConfig {
    baseIncomePerSecond: number;
    altarBonusMultiplier: number;
    altarDurationSeconds: number;
    initialGold: number;
    maxGold: number;
    killReward: { tier1Troop: number; tier2Troop: number; barracks: number };
}

export interface MapConfig {
    maxTroopsOnField: number;
    altarRadius: number;
    altarCaptureDuration: number;
    riverSlowMultiplier: number;
    riverWidth: number;
    castlePositions: Record<string, { x: number; y: number; z: number }>;
    barracksSlots: Record<string, Array<{ id: string; x: number; y: number; z: number; laneKey: string }>>;
    generalAltarPositions: Record<string, { x: number; y: number; z: number }>;
    altarPosition: { x: number; y: number; z: number };
    lanes: Record<string, Array<{ x: number; z: number }>>;
    rivers: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number }; width: number }>;
}

export interface AiConfig {
    decisionIntervalSeconds: number;
    rebuildGoldThreshold: number;
    buildBarracks2GoldThreshold: number;
    upgradeGoldThreshold: number;
    upgradeMinTroopsOnField: number;
}

// ─── 阵营运行时状态 ────────────────────────────────────────────────────────
export interface FactionState {
    factionId: string;
    displayName: string;
    color: string;
    riverImmune: boolean;
    gold: number;
    alive: boolean;
    troopCount: number;
    altarBonus: boolean;
    altarBonusTimer: number;
    isPlayer: boolean;
}

// ─── 游戏状态枚举 ──────────────────────────────────────────────────────────
export enum GamePhase {
    INIT       = 'INIT',
    COUNTDOWN  = 'COUNTDOWN',
    PLAYING    = 'PLAYING',
    GAME_OVER  = 'GAME_OVER',
}

// ─── 出兵队列项 ────────────────────────────────────────────────────────────
export interface SpawnQueueItem {
    factionId: string;
    laneKey: string;
    troopConfig: TroopConfig;
    callback: () => void;
}

// ─── 可攻击目标描述（供 TroopComponent 查询） ─────────────────────────────
export interface AttackTarget {
    node: import('cc').Node;
    factionId: string;
    position: import('cc').Vec3;
    isBuilding: boolean;
    tags?: string[];
    tier?: number;
    onHit: (dmg: number, attackerTags: string[], attackerFactionId: string) => void;
}

// ─── GameManager 单例 ──────────────────────────────────────────────────────
@ccclass('GameManager')
export class GameManager extends Component {
    private static _inst: GameManager | null = null;
    static get inst(): GameManager {
        return GameManager._inst!;
    }

    // ── 已加载配置 ──
    factionsConfig: FactionConfig[]   = [];
    troopsConfig:   TroopConfig[]     = [];
    buildingConfig: BuildingConfig    = null!;
    economyConfig:  EconomyConfig     = null!;
    mapConfig:      MapConfig         = null!;
    aiConfig:       AiConfig          = null!;

    // ── 阵营状态表 ──
    private _factions: Map<string, FactionState> = new Map();
    get factions(): Map<string, FactionState> { return this._factions; }

    // ── 游戏流程 ──
    phase: GamePhase = GamePhase.INIT;
    playerFactionId: string = 'wei';
    elapsedSeconds: number = 0;

    // ── 全局目标注册表（TroopComponent/Castle/Barracks 注册） ──
    private _targets: Set<AttackTarget> = new Set();
    registerTarget(t: AttackTarget): void   { this._targets.add(t); }
    unregisterTarget(t: AttackTarget): void { this._targets.delete(t); }
    getTargets(): ReadonlySet<AttackTarget> { return this._targets; }

    // ── 总场上兵力计数 ──
    private _totalTroops: number = 0;
    get totalTroops(): number { return this._totalTroops; }

    // ── 出兵等待队列（超出上限时入队） ──
    private _spawnQueue: SpawnQueueItem[] = [];

    // ── 收入计时器 ──
    private _incomeTimer: number = 0;

    // ── 对象池（供 TroopSpawner / Projectile 使用） ──
    troopPool:      ObjectPool | null = null;
    projectilePool: ObjectPool | null = null;

    // ─────────────────────────────────────────────────────────────────────
    onLoad(): void {
        if (GameManager._inst && GameManager._inst !== this) {
            this.destroy();
            return;
        }
        GameManager._inst = this;
        director.addPersistRootNode(this.node);
    }

    /** 加载所有配置文件（异步），完成后调用 onReady */
    loadConfigs(onReady: () => void): void {
        let pending = 6;
        const done = () => { if (--pending === 0) onReady(); };

        resources.load('configs/factions',   JsonAsset, (e, a) => { if (!e) this.factionsConfig = a.json as FactionConfig[]; done(); });
        resources.load('configs/troops',     JsonAsset, (e, a) => { if (!e) this.troopsConfig   = a.json as TroopConfig[]; done(); });
        resources.load('configs/buildings',  JsonAsset, (e, a) => { if (!e) this.buildingConfig  = a.json as BuildingConfig; done(); });
        resources.load('configs/economy',    JsonAsset, (e, a) => { if (!e) this.economyConfig   = a.json as EconomyConfig; done(); });
        resources.load('configs/map',        JsonAsset, (e, a) => { if (!e) this.mapConfig        = a.json as MapConfig; done(); });
        resources.load('configs/ai',         JsonAsset, (e, a) => { if (!e) this.aiConfig         = a.json as AiConfig; done(); });
    }

    /** 初始化阵营状态（配置加载完成后调用） */
    initFactions(playerFactionId: string): void {
        this.playerFactionId = playerFactionId;
        this._factions.clear();
        for (const cfg of this.factionsConfig) {
            this._factions.set(cfg.factionId, {
                factionId:       cfg.factionId,
                displayName:     cfg.displayName,
                color:           cfg.color,
                riverImmune:     cfg.riverImmune,
                gold:            this.economyConfig.initialGold,
                alive:           true,
                troopCount:      0,
                altarBonus:      false,
                altarBonusTimer: 0,
                isPlayer:        cfg.factionId === playerFactionId,
            });
        }
    }

    // ─── 金币 API ──────────────────────────────────────────────────────────
    getGold(factionId: string): number {
        return this._factions.get(factionId)?.gold ?? 0;
    }

    /** 尝试扣款，若成功返回 true */
    spendGold(factionId: string, amount: number): boolean {
        const f = this._factions.get(factionId);
        if (!f || f.gold < amount) return false;
        f.gold = Math.max(0, f.gold - amount);
        EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f.gold, this.getIncomeRate(factionId));
        return true;
    }

    addGold(factionId: string, amount: number): void {
        const f = this._factions.get(factionId);
        if (!f || !f.alive) return;
        f.gold = Math.min(this.economyConfig.maxGold, f.gold + amount);
        EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f.gold, this.getIncomeRate(factionId));
    }

    getIncomeRate(factionId: string): number {
        const f = this._factions.get(factionId);
        if (!f) return 0;
        const base = this.economyConfig.baseIncomePerSecond;
        return f.altarBonus ? base * this.economyConfig.altarBonusMultiplier : base;
    }

    // ─── 祭坛加成 ──────────────────────────────────────────────────────────
    applyAltarBonus(factionId: string): void {
        const f = this._factions.get(factionId);
        if (!f) return;
        f.altarBonus      = true;
        f.altarBonusTimer = this.economyConfig.altarDurationSeconds;
        EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f.gold, this.getIncomeRate(factionId));
    }

    clearAltarBonus(factionId: string): void {
        const f = this._factions.get(factionId);
        if (f) {
            f.altarBonus      = false;
            f.altarBonusTimer = 0;
            EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f.gold, this.getIncomeRate(factionId));
        }
    }

    // ─── 兵力计数 ──────────────────────────────────────────────────────────
    troopSpawned(factionId: string): void {
        const f = this._factions.get(factionId);
        if (f) { f.troopCount++; this._totalTroops++; }
        EventManager.emit(GameEvent.TROOP_COUNT_CHANGED, factionId, f?.troopCount ?? 0);
    }

    troopDied(factionId: string): void {
        const f = this._factions.get(factionId);
        if (f && f.troopCount > 0) { f.troopCount--; this._totalTroops = Math.max(0, this._totalTroops - 1); }
        EventManager.emit(GameEvent.TROOP_COUNT_CHANGED, factionId, f?.troopCount ?? 0);
        // 处理等待队列
        this._flushSpawnQueue();
    }

    /** 是否可以立即出兵（未达到全局上限） */
    canSpawnNow(): boolean {
        return this._totalTroops < (this.mapConfig?.maxTroopsOnField ?? 150);
    }

    // ─── 出兵队列 ──────────────────────────────────────────────────────────
    enqueueSpawn(item: SpawnQueueItem): void {
        this._spawnQueue.push(item);
    }

    private _flushSpawnQueue(): void {
        while (this._spawnQueue.length > 0 && this.canSpawnNow()) {
            const item = this._spawnQueue.shift()!;
            const f = this._factions.get(item.factionId);
            if (f && f.alive) item.callback();
        }
    }

    // ─── 阵营出局 ──────────────────────────────────────────────────────────
    eliminateFaction(factionId: string): void {
        const f = this._factions.get(factionId);
        if (!f || !f.alive) return;
        f.alive = false;
        EventManager.emit(GameEvent.FACTION_ELIMINATED, factionId);
        this._checkWinCondition();
    }

    private _checkWinCondition(): void {
        const alive = [...this._factions.values()].filter(f => f.alive);
        if (alive.length === 1) {
            this.phase = GamePhase.GAME_OVER;
            const winner = alive[0];
            // 保存结果
            sys.localStorage.setItem('sgzf_winner', winner.factionId);
            sys.localStorage.setItem('sgzf_duration', String(Math.floor(this.elapsedSeconds)));
            EventManager.emit(GameEvent.GAME_OVER, winner.factionId);
        }
    }

    // ─── 配置查询助手 ──────────────────────────────────────────────────────
    getTroopConfig(factionId: string, tier: number): TroopConfig | null {
        return this.troopsConfig.find(t => t.factionId === factionId && t.tier === tier) ?? null;
    }

    getFactionConfig(factionId: string): FactionConfig | null {
        return this.factionsConfig.find(f => f.factionId === factionId) ?? null;
    }

    getFactionState(factionId: string): FactionState | null {
        return this._factions.get(factionId) ?? null;
    }

    getLaneWaypoints(laneKey: string): Array<{ x: number; z: number }> {
        return this.mapConfig?.lanes[laneKey] ?? [];
    }

    // ─── update：收入 + 祭坛计时 ───────────────────────────────────────────
    update(dt: number): void {
        if (this.phase !== GamePhase.PLAYING) return;

        this.elapsedSeconds += dt;
        this._incomeTimer += dt;

        if (this._incomeTimer >= 1.0) {
            this._incomeTimer -= 1.0;
            this._factions.forEach((f) => {
                if (!f.alive) return;
                // 祭坛加成计时
                if (f.altarBonus) {
                    f.altarBonusTimer -= 1.0;
                    if (f.altarBonusTimer <= 0) this.clearAltarBonus(f.factionId);
                }
                this.addGold(f.factionId, this.getIncomeRate(f.factionId));
            });
        }
    }

    onDestroy(): void {
        if (GameManager._inst === this) GameManager._inst = null;
    }
}
