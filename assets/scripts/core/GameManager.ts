/**
 * GameManager.ts  ── Phase 2 扩展版
 * 在 Phase 1 基础上新增：将领系统、市集加成、防御塔配置、阵营 Buff、altarOwner 查询。
 */
import { _decorator, Component, JsonAsset, resources, director, sys } from 'cc';
import { EventManager, GameEvent } from './EventManager';
import { ObjectPool } from './ObjectPool';
import { GeneralConfig, GeneralState, GeneralBuff, TowerConfig } from '../generals/GeneralData';

const { ccclass } = _decorator;

// ─── 公共接口（Phase 1 保持不变） ─────────────────────────────────────────
export interface FactionConfig {
    factionId: string; displayName: string; color: string; riverImmune: boolean;
}
export interface TroopConfig {
    troopId: string; factionId: string; tier: number; name: string;
    hp: number; atk: number; atkInterval: number; moveSpeed: number;
    atkRange: number; spawnCost: number; spawnInterval: number;
    tags: string[]; special: string;
}
export interface BuildingConfig {
    castle: { hp: number; scaleX: number; scaleY: number; scaleZ: number };
    barracks: { level1Hp: number; buildCost: number; upgradeCost: number; level3UpgradeCost: number };
    generalAltar: { hp: number; radius: number; height: number; alpha: number };
    market: { hp: number; buildCost: number; incomeBonus: number; displayName: string };
}
export interface EconomyConfig {
    baseIncomePerSecond: number; altarBonusMultiplier: number; altarDurationSeconds: number;
    initialGold: number; maxGold: number;
    killReward: { tier1Troop: number; tier2Troop: number; barracks: number };
}
export interface MapConfig {
    maxTroopsOnField: number; altarRadius: number; altarCaptureDuration: number;
    riverSlowMultiplier: number; riverWidth: number;
    castlePositions: Record<string, { x: number; y: number; z: number }>;
    barracksSlots: Record<string, Array<{ id: string; x: number; y: number; z: number; laneKey: string }>>;
    generalAltarPositions: Record<string, { x: number; y: number; z: number }>;
    altarPosition: { x: number; y: number; z: number };
    towerSlots: Record<string, Array<{ id: string; x: number; y: number; z: number; laneKey: string; type: string }>>;
    marketPositions: Record<string, { x: number; y: number; z: number }>;
    lanes: Record<string, Array<{ x: number; z: number }>>;
    rivers: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number }; width: number }>;
}
export interface AiConfig {
    decisionIntervalSeconds: number; rebuildGoldThreshold: number;
    buildBarracks2GoldThreshold: number; upgradeGoldThreshold: number; upgradeMinTroopsOnField: number;
    upgradeTo3GoldThreshold: number; upgradeTo3MinTroopsOnField: number;
    buildMarketGoldThreshold: number; buildTowerGoldThreshold: number;
    summonGeneralGoldThreshold: number; useSkillEnemiesNearby: number;
}
export interface FactionState {
    factionId: string; displayName: string; color: string; riverImmune: boolean;
    gold: number; alive: boolean; troopCount: number;
    altarBonus: boolean; altarBonusTimer: number; isPlayer: boolean;
}
export enum GamePhase { INIT = 'INIT', COUNTDOWN = 'COUNTDOWN', PLAYING = 'PLAYING', GAME_OVER = 'GAME_OVER' }
export interface SpawnQueueItem { factionId: string; laneKey: string; troopConfig: TroopConfig; callback: () => void; }
export interface AttackTarget {
    node: import('cc').Node; factionId: string; position: import('cc').Vec3;
    isBuilding: boolean; tags?: string[]; tier?: number;
    onHit: (dmg: number, attackerTags: string[], attackerFactionId: string) => void;
}

// ─── GameManager 单例 ──────────────────────────────────────────────────────
@ccclass('GameManager')
export class GameManager extends Component {
    private static _inst: GameManager | null = null;
    /**
     * 非空断言访问器：调用方需确保 GameManager 已完成 onLoad 初始化。
     * 未初始化时会抛出明确错误，便于排查生命周期问题。
     */
    static get inst(): GameManager {
        if (!GameManager._inst) {
            throw new Error('[GameManager] inst accessed before onLoad. Ensure GameManager is mounted and onLoad has run.');
        }
        return GameManager._inst;
    }
    /** 安全访问器：未初始化时返回 null，适用于可选依赖场景。 */
    static get safeInst(): GameManager | null { return GameManager._inst; }

    // ── Phase 1 配置 ──
    factionsConfig: FactionConfig[]  = [];
    troopsConfig:   TroopConfig[]    = [];
    buildingConfig: BuildingConfig   = null!;
    economyConfig:  EconomyConfig    = null!;
    mapConfig:      MapConfig        = null!;
    aiConfig:       AiConfig         = null!;
    // ── Phase 2 配置 ──
    generalsConfig: GeneralConfig[]  = [];
    towersConfig:   TowerConfig      = null!;

    // ── 阵营状态 ──
    private _factions: Map<string, FactionState> = new Map();
    get factions(): Map<string, FactionState> { return this._factions; }

    // ── Phase 2：将领状态 / Buff / 市集加成 ──
    private _generalStates: Map<string, GeneralState> = new Map();
    private _generalBuffs:  Map<string, GeneralBuff>  = new Map();
    private _marketBonus:   Map<string, number>        = new Map();

    // ── 祭坛拥有者（供 MiniMap 查询） ──
    private _altarOwner: string = '';
    get altarOwner(): string { return this._altarOwner; }
    setAltarOwner(fId: string): void { this._altarOwner = fId; }

    // ── 游戏流程 ──
    phase: GamePhase = GamePhase.INIT;
    playerFactionId: string = 'wei';
    elapsedSeconds: number = 0;

    // ── 目标注册表 ──
    private _targets: Set<AttackTarget> = new Set();
    registerTarget(t: AttackTarget): void   { this._targets.add(t); }
    unregisterTarget(t: AttackTarget): void { this._targets.delete(t); }
    getTargets(): ReadonlySet<AttackTarget> { return this._targets; }

    // ── 兵力 ──
    private _totalTroops: number = 0;
    get totalTroops(): number { return this._totalTroops; }
    private _spawnQueue: SpawnQueueItem[] = [];
    private _incomeTimer: number = 0;

    troopPool:      ObjectPool | null = null;
    projectilePool: ObjectPool | null = null;

    // ─────────────────────────────────────────────────────────────────────
    onLoad(): void {
        // 若已存在不同实例（例如 Battle 场景 GameBoot 和跨场景持久节点同时存在），
        // 销毁多余组件，保留第一个实例，避免 __cid__ 重复注册警告。
        if (GameManager._inst && GameManager._inst !== this) {
            this.destroy();
            return;
        }
        GameManager._inst = this;
        // 仅在节点尚未进入持久列表时才调用 addPersistRootNode，
        // 防止热重载或多次场景加载时重复注册（触发 __cid__ 警告）。
        if (!director.isPersistRootNode(this.node)) {
            director.addPersistRootNode(this.node);
        }
    }

    /**
     * 加载所有配置文件（Phase 1: 6 个 + Phase 2: 2 个 = 8 个）。
     * 修复：无论成功还是失败都调用 done()，确保 onReady 始终触发；
     *       加载失败时输出明确错误日志，避免静默失败难以排查。
     */
    loadConfigs(onReady: () => void): void {
        let pending = 8;
        let hasError = false;

        const done = (configName: string, err: Error | null) => {
            if (err) {
                hasError = true;
                console.error(`[GameManager] Failed to load config "${configName}":`, err);
            }
            if (--pending === 0) {
                if (hasError) {
                    console.warn('[GameManager] Some configs failed to load; game may not function correctly.');
                }
                onReady();
            }
        };

        resources.load('configs/factions',  JsonAsset, (e, a) => {
            if (!e) this.factionsConfig  = a.json as FactionConfig[];
            done('factions', e);
        });
        resources.load('configs/troops',    JsonAsset, (e, a) => {
            if (!e) this.troopsConfig    = a.json as TroopConfig[];
            done('troops', e);
        });
        resources.load('configs/buildings', JsonAsset, (e, a) => {
            if (!e) this.buildingConfig  = a.json as BuildingConfig;
            done('buildings', e);
        });
        resources.load('configs/economy',   JsonAsset, (e, a) => {
            if (!e) this.economyConfig   = a.json as EconomyConfig;
            done('economy', e);
        });
        resources.load('configs/map',       JsonAsset, (e, a) => {
            if (!e) this.mapConfig       = a.json as MapConfig;
            done('map', e);
        });
        resources.load('configs/ai',        JsonAsset, (e, a) => {
            if (!e) this.aiConfig        = a.json as AiConfig;
            done('ai', e);
        });
        resources.load('configs/generals',  JsonAsset, (e, a) => {
            if (!e) this.generalsConfig  = a.json as GeneralConfig[];
            done('generals', e);
        });
        resources.load('configs/towers',    JsonAsset, (e, a) => {
            if (!e) this.towersConfig    = a.json as TowerConfig;
            done('towers', e);
        });
    }

    initFactions(playerFactionId: string): void {
        this.playerFactionId = playerFactionId;
        this._factions.clear();
        for (const cfg of this.factionsConfig) {
            this._factions.set(cfg.factionId, {
                factionId: cfg.factionId, displayName: cfg.displayName,
                color: cfg.color, riverImmune: cfg.riverImmune,
                gold: this.economyConfig.initialGold, alive: true, troopCount: 0,
                altarBonus: false, altarBonusTimer: 0, isPlayer: cfg.factionId === playerFactionId,
            });
        }
    }

    /** Phase 2：初始化将领状态 */
    initGenerals(): void {
        this._generalStates.clear();
        for (const cfg of this.generalsConfig) {
            this._generalStates.set(cfg.factionId, {
                generalId: cfg.generalId, factionId: cfg.factionId,
                onField: false, respawnTimer: 0, skillCooldown: 0, generalRef: null,
            });
        }
    }

    // ─── 金币 API ──────────────────────────────────────────────────────────
    getGold(factionId: string): number { return this._factions.get(factionId)?.gold ?? 0; }

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

    /** Phase 2: 包含市集加成的收入速率 */
    getIncomeRate(factionId: string): number {
        const f = this._factions.get(factionId);
        if (!f) return 0;
        const base = this.economyConfig.baseIncomePerSecond;
        const altarMult = f.altarBonus ? this.economyConfig.altarBonusMultiplier : 1.0;
        const market = this._marketBonus.get(factionId) ?? 0;
        return base * altarMult + market;
    }

    // ─── 祭坛加成 ──────────────────────────────────────────────────────────
    applyAltarBonus(factionId: string): void {
        const f = this._factions.get(factionId);
        if (!f) return;
        f.altarBonus = true; f.altarBonusTimer = this.economyConfig.altarDurationSeconds;
        this._altarOwner = factionId;
        EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f.gold, this.getIncomeRate(factionId));
    }
    clearAltarBonus(factionId: string): void {
        const f = this._factions.get(factionId);
        if (f) { f.altarBonus = false; f.altarBonusTimer = 0; }
        if (this._altarOwner === factionId) this._altarOwner = '';
        EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f?.gold ?? 0, this.getIncomeRate(factionId));
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
        this._flushSpawnQueue();
    }
    canSpawnNow(): boolean { return this._totalTroops < (this.mapConfig?.maxTroopsOnField ?? 150); }
    enqueueSpawn(item: SpawnQueueItem): void { this._spawnQueue.push(item); }
    private _flushSpawnQueue(): void {
        while (this._spawnQueue.length > 0 && this.canSpawnNow()) {
            const item = this._spawnQueue.shift()!;
            if (this._factions.get(item.factionId)?.alive) item.callback();
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
            sys.localStorage.setItem('sgzf_winner', alive[0].factionId);
            sys.localStorage.setItem('sgzf_duration', String(Math.floor(this.elapsedSeconds)));
            EventManager.emit(GameEvent.GAME_OVER, alive[0].factionId);
        }
    }

    // ─── 查询 API ──────────────────────────────────────────────────────────
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

    // ─── Phase 2：将领 API ─────────────────────────────────────────────────
    getGeneralState(factionId: string): GeneralState | null {
        return this._generalStates.get(factionId) ?? null;
    }
    canSummonGeneral(factionId: string): boolean {
        const gs = this._generalStates.get(factionId);
        return !!gs && !gs.onField && gs.respawnTimer <= 0;
    }
    /** 扣款并返回 true，由 GeneralAltar 调用后自行创建 GeneralComponent */
    chargeGeneralSummon(factionId: string): boolean {
        const cfg = this.generalsConfig.find(g => g.factionId === factionId);
        if (!cfg) return false;
        const gs = this._generalStates.get(factionId);
        if (!gs || gs.onField || gs.respawnTimer > 0) return false;
        if (!this.spendGold(factionId, cfg.summonCost)) return false;
        gs.onField = true;
        return true;
    }
    generalDied(factionId: string): void {
        const gs = this._generalStates.get(factionId);
        if (!gs) return;
        const cfg = this.generalsConfig.find(g => g.factionId === factionId);
        gs.onField = false; gs.generalRef = null;
        gs.respawnTimer = cfg?.respawnCooldown ?? 60;
    }

    // ─── Phase 2：阵营 Buff（将领技能 faction_buff） ───────────────────────
    applyGeneralBuff(factionId: string, buff: GeneralBuff): void {
        this._generalBuffs.set(factionId, buff);
        EventManager.emit(GameEvent.GOLD_CHANGED, factionId, this.getGold(factionId), this.getIncomeRate(factionId));
    }
    getGeneralBuff(factionId: string): GeneralBuff | null {
        const b = this._generalBuffs.get(factionId);
        if (!b) return null;
        if (b.expiresAt <= this.elapsedSeconds) { this._generalBuffs.delete(factionId); return null; }
        return b;
    }

    // ─── Phase 2：市集加成 ─────────────────────────────────────────────────
    registerMarketBonus(factionId: string, bonus: number): void {
        this._marketBonus.set(factionId, (this._marketBonus.get(factionId) ?? 0) + bonus);
        const f = this._factions.get(factionId);
        if (f) EventManager.emit(GameEvent.GOLD_CHANGED, factionId, f.gold, this.getIncomeRate(factionId));
    }
    unregisterMarketBonus(factionId: string, bonus: number): void {
        const cur = this._marketBonus.get(factionId) ?? 0;
        this._marketBonus.set(factionId, Math.max(0, cur - bonus));
    }

    // ─── update ────────────────────────────────────────────────────────────
    update(dt: number): void {
        if (this.phase !== GamePhase.PLAYING) return;
        this.elapsedSeconds += dt;
        this._incomeTimer += dt;

        if (this._incomeTimer >= 1.0) {
            this._incomeTimer -= 1.0;
            this._factions.forEach(f => {
                if (!f.alive) return;
                if (f.altarBonus) {
                    f.altarBonusTimer -= 1.0;
                    if (f.altarBonusTimer <= 0) this.clearAltarBonus(f.factionId);
                }
                this.addGold(f.factionId, this.getIncomeRate(f.factionId));
            });
            // 将领重生计时
            this._generalStates.forEach(gs => {
                if (!gs.onField && gs.respawnTimer > 0) gs.respawnTimer -= 1.0;
            });
        }
    }

    onDestroy(): void { if (GameManager._inst === this) GameManager._inst = null; }
}
