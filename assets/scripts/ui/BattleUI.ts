/**
 * BattleUI.ts  ── Phase 2 扩展版
 * 战斗 HUD：顶部金币 / 速率 / 兵力、右下操作面板、左上小地图缩略图。
 * Phase 2 新增：将领召唤/技能、市集建造、防御塔建造、兵营3级升级、路线切换。
 * 脚本挂载于 Battle 场景的 BattleUI Canvas 节点。
 */
import {
    _decorator, Component, Node, Label, Button, Color,
    EventTarget, UIOpacity, tween, Vec3,
} from 'cc';
import { GameManager, GamePhase, FactionState } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';
import { Barracks } from '../buildings/Barracks';
import { GeneralAltar } from '../buildings/GeneralAltar';
import { DefenseTower } from '../buildings/DefenseTower';
import { Market } from '../buildings/Market';
import { MapBuilder } from '../map/MapBuilder';
import { RouteManager } from '../systems/RouteManager';

const { ccclass, property } = _decorator;

@ccclass('BattleUI')
export class BattleUI extends Component {
    // ── 顶部栏 ──────────────────────────────────────────────────────
    @property(Label) goldLabel:     Label | null = null;
    @property(Label) rateLabel:     Label | null = null;
    @property(Label) troopLabel:    Label | null = null;

    // ── 操作面板（Phase 1） ───────────────────────────────────────────
    @property(Button) btnBuild2:    Button | null = null;
    @property(Label)  lblBuild2:    Label  | null = null;
    @property(Button) btnUpgrade:   Button | null = null;
    @property(Label)  lblUpgrade:   Label  | null = null;

    // ── 操作面板（Phase 2） ───────────────────────────────────────────
    @property(Button) btnUpgrade3:     Button | null = null;
    @property(Label)  lblUpgrade3:     Label  | null = null;
    @property(Button) btnSummonGeneral: Button | null = null;
    @property(Label)  lblSummonGeneral: Label  | null = null;
    @property(Button) btnUseSkill:     Button | null = null;
    @property(Label)  lblUseSkill:     Label  | null = null;
    @property(Button) btnBuildMarket:  Button | null = null;
    @property(Label)  lblBuildMarket:  Label  | null = null;
    @property(Button) btnBuildTower:   Button | null = null;
    @property(Label)  lblBuildTower:   Label  | null = null;
    @property(Button) btnCycleRoute:   Button | null = null;
    @property(Label)  lblCycleRoute:   Label  | null = null;

    // ── 小地图 ──────────────────────────────────────────────────────
    @property(Node)  minimapRoot:   Node | null = null;

    // ── 倒计时 ──────────────────────────────────────────────────────
    @property(Label) countdownLabel: Label | null = null;

    // ── 出局提示 ─────────────────────────────────────────────────────
    @property(Label) eliminatedLabel: Label | null = null;

    // ── 将领状态显示 ─────────────────────────────────────────────────
    @property(Label) generalAltarLabel: Label | null = null;

    // ── 内部状态 ─────────────────────────────────────────────────────
    private _playerFactionId: string = '';
    private _mapBuilder: MapBuilder | null = null;
    private _barracksSlot0: Barracks | null = null;
    private _barracksSlot1: Barracks | null = null;
    private _playerEliminated: boolean = false;
    private _eliminatedTimer: number = 0;

    // Phase 2 引用
    private _generalAltar: GeneralAltar | null = null;
    private _market:        Market | null       = null;
    private _towers:        DefenseTower[]      = [];
    private _routeManager:  RouteManager | null = null;

    // 技能 CD 轮询计时器
    private _skillUiTimer: number = 0;

    onLoad(): void {
        this._playerFactionId = GameManager.inst?.playerFactionId ?? 'wei';

        // 监听事件
        EventManager.on(GameEvent.GOLD_CHANGED,        this._onGoldChanged,        this);
        EventManager.on(GameEvent.TROOP_COUNT_CHANGED, this._onTroopCountChanged,  this);
        EventManager.on(GameEvent.ALTAR_CAPTURED,      this._onAltarCaptured,      this);
        EventManager.on(GameEvent.ALTAR_NEUTRAL,       this._onAltarNeutral,       this);
        EventManager.on(GameEvent.FACTION_ELIMINATED,  this._onFactionEliminated,  this);
        EventManager.on(GameEvent.GAME_STARTED,        this._onGameStarted,        this);

        // 将领状态初始文案
        if (this.generalAltarLabel) {
            this.generalAltarLabel.string = '将坛：点击召唤将领';
        }

        // 隐藏出局提示
        if (this.eliminatedLabel) this.eliminatedLabel.node.active = false;

        this._startCountdown();
    }

    onDestroy(): void {
        EventManager.targetOff(this);
    }

    // ─── 倒计时 ─────────────────────────────────────────────────────
    private _startCountdown(): void {
        if (!this.countdownLabel) return;
        this.countdownLabel.node.active = true;
        this.countdownLabel.string      = '3';

        let n = 3;
        const tick = () => {
            n--;
            if (n <= 0) {
                this.countdownLabel!.string = 'GO!';
                this.scheduleOnce(() => {
                    if (this.countdownLabel) this.countdownLabel.node.active = false;
                }, 0.8);
                if (GameManager.inst) {
                    GameManager.inst.phase = GamePhase.PLAYING;
                }
                EventManager.emit(GameEvent.GAME_STARTED);
                return;
            }
            this.countdownLabel!.string = n.toString();
            this.scheduleOnce(tick, 1.0);
        };
        this.scheduleOnce(tick, 1.0);
    }

    // ─── 事件回调 ────────────────────────────────────────────────────
    private _onGoldChanged(factionId: string, gold: number, rate: number): void {
        if (factionId !== this._playerFactionId) return;

        if (this.goldLabel) this.goldLabel.string = `💰 ${gold}`;

        const altarBonus = GameManager.inst?.getFactionState(factionId)?.altarBonus ?? false;
        if (this.rateLabel) {
            if (altarBonus) {
                this.rateLabel.string = `+${rate.toFixed(1)}/s ×1.2`;
                this.rateLabel.color  = new Color(255, 200, 0, 255);
            } else {
                this.rateLabel.string = `+${rate.toFixed(1)}/s`;
                this.rateLabel.color  = new Color(200, 200, 200, 255);
            }
        }

        this._updateActionPanel(gold);
    }

    private _onTroopCountChanged(factionId: string, count: number): void {
        if (factionId !== this._playerFactionId) return;
        const max = GameManager.inst?.mapConfig?.maxTroopsOnField ?? 150;
        if (this.troopLabel) this.troopLabel.string = `⚔️ ${count}/${max}`;
    }

    private _onAltarCaptured(factionId: string): void {
        if (factionId !== this._playerFactionId) return;
        if (this.rateLabel) this.rateLabel.color = new Color(255, 200, 0, 255);
    }

    private _onAltarNeutral(): void {
        if (this.rateLabel) this.rateLabel.color = new Color(200, 200, 200, 255);
    }

    private _onFactionEliminated(factionId: string): void {
        if (factionId === this._playerFactionId) {
            this._playerEliminated = true;
            this._eliminatedTimer  = 5;
            // 隐藏全部操作按钮
            const btns = [
                this.btnBuild2, this.btnUpgrade, this.btnUpgrade3,
                this.btnSummonGeneral, this.btnUseSkill,
                this.btnBuildMarket, this.btnBuildTower, this.btnCycleRoute,
            ];
            btns.forEach(b => { if (b) b.node.active = false; });
            // 显示旁观提示
            if (this.eliminatedLabel) {
                this.eliminatedLabel.node.active = true;
                this.eliminatedLabel.string      = '你已出局，正在旁观…';
            }
        }
    }

    private _onGameStarted(): void {
        const gm = GameManager.inst;
        if (!gm) return;
        const gold = gm.getGold(this._playerFactionId);
        const rate = gm.getIncomeRate(this._playerFactionId);
        const cnt  = gm.getFactionState(this._playerFactionId)?.troopCount ?? 0;
        const max  = gm.mapConfig?.maxTroopsOnField ?? 150;
        if (this.goldLabel)  this.goldLabel.string  = `💰 ${gold}`;
        if (this.rateLabel)  this.rateLabel.string  = `+${rate.toFixed(1)}/s`;
        if (this.troopLabel) this.troopLabel.string = `⚔️ ${cnt}/${max}`;
    }

    // ─── 操作面板状态 ─────────────────────────────────────────────────
    private _updateActionPanel(gold: number): void {
        if (this._playerEliminated) return;
        const gm = GameManager.inst;

        // — Phase 1 按钮 —
        const buildCost    = gm?.buildingConfig?.barracks?.buildCost    ?? 50;
        const upgradeCost  = gm?.buildingConfig?.barracks?.upgradeCost  ?? 80;

        if (this.btnBuild2 && this.lblBuild2) {
            const slot1Unbuilt = this._barracksSlot1 && !this._barracksSlot1.isBuilt;
            const canBuild     = !!slot1Unbuilt && gold >= buildCost;
            this.btnBuild2.interactable = canBuild;
            this.lblBuild2.string       = slot1Unbuilt
                ? `建造第2兵营 ${buildCost}💰${canBuild ? '' : '（金币不足）'}`
                : '第2兵营已建';
        }

        if (this.btnUpgrade && this.lblUpgrade) {
            const slot0Level1 = this._barracksSlot0?.isBuilt && this._barracksSlot0.barracksLevel === 1;
            const canUpgrade  = !!slot0Level1 && gold >= upgradeCost;
            this.btnUpgrade.interactable = canUpgrade;
            this.lblUpgrade.string       = slot0Level1
                ? `升至2级兵营 ${upgradeCost}💰${canUpgrade ? '' : '（金币不足）'}`
                : '兵营已达2级+';
        }

        // — Phase 2 按钮 —
        const upgrade3Cost = gm?.buildingConfig?.barracks?.level3UpgradeCost ?? 150;
        if (this.btnUpgrade3 && this.lblUpgrade3) {
            const slot0Level2 = this._barracksSlot0?.isBuilt && this._barracksSlot0.barracksLevel === 2;
            const can3        = !!slot0Level2 && gold >= upgrade3Cost;
            this.btnUpgrade3.interactable = can3;
            this.lblUpgrade3.string       = slot0Level2
                ? `升至3级兵营 ${upgrade3Cost}💰${can3 ? '' : '（金币不足）'}`
                : '兵营未到2级';
        }

        // 召唤将领
        const generalCost = gm?.generalsConfig.find(g => g.factionId === this._playerFactionId)?.summonCost ?? 120;
        if (this.btnSummonGeneral && this.lblSummonGeneral) {
            const gs = gm?.getGeneralState(this._playerFactionId);
            const canSummon = gm?.canSummonGeneral(this._playerFactionId) && gold >= generalCost;
            this.btnSummonGeneral.interactable = !!canSummon;
            if (gs?.onField) {
                this.lblSummonGeneral.string = '将领在场中';
            } else if (gs && !gs.onField && gs.respawnTimer > 0) {
                this.lblSummonGeneral.string = `将领复活中 ${Math.ceil(gs.respawnTimer)}s`;
            } else {
                this.lblSummonGeneral.string = canSummon
                    ? `召唤将领 ${generalCost}💰`
                    : `召唤将领 ${generalCost}💰（金币不足）`;
            }
        }

        // 技能按钮（需单独在 update 中更新冷却显示）

        // 建造市集
        const marketCost = gm?.buildingConfig?.market?.buildCost ?? 80;
        if (this.btnBuildMarket && this.lblBuildMarket) {
            const built    = this._market?.isBuilt ?? false;
            const canBuild = !built && gold >= marketCost;
            this.btnBuildMarket.interactable = canBuild;
            this.lblBuildMarket.string       = built
                ? '市集已建造'
                : canBuild ? `建造市集 ${marketCost}💰` : `建造市集 ${marketCost}💰（金币不足）`;
        }

        // 建造防御塔（显示第一个未建塔的信息）
        if (this.btnBuildTower && this.lblBuildTower) {
            const nextTower = this._towers.find(t => !t.isBuilt);
            const towerCost = nextTower ? (gm?.towersConfig?.[nextTower.towerType]?.buildCost ?? 60) : 0;
            const canBuild  = !!nextTower && gold >= towerCost;
            this.btnBuildTower.interactable = canBuild;
            this.lblBuildTower.string       = nextTower
                ? (canBuild ? `建造塔 ${towerCost}💰` : `建造塔 ${towerCost}💰（金币不足）`)
                : '防御塔已全建';
        }

        // 路线切换
        if (this.btnCycleRoute && this.lblCycleRoute) {
            const name = this._routeManager?.getCurrentRouteName(this._playerFactionId) ?? '默认路线';
            this.lblCycleRoute.string = `切换路线 [${name}]`;
        }
    }

    // ─── update：轮询将领技能冷却 ─────────────────────────────────────
    update(dt: number): void {
        // 玩家出局倒计时
        if (this._playerEliminated) {
            this._eliminatedTimer -= dt;
            if (this._eliminatedTimer <= 0 && GameManager.inst?.phase !== GamePhase.GAME_OVER) {
                GameManager.inst!.phase = GamePhase.GAME_OVER;
                const { director } = require('cc');
                director.loadScene('Result');
            }
            return;
        }

        // 技能按钮 CD 显示（0.25s 刷新一次）
        this._skillUiTimer += dt;
        if (this._skillUiTimer >= 0.25) {
            this._skillUiTimer = 0;
            this._updateSkillButton();
        }
    }

    private _updateSkillButton(): void {
        if (!this.btnUseSkill || !this.lblUseSkill) return;
        const gm = GameManager.inst;
        const gs = gm?.getGeneralState(this._playerFactionId);
        const skillCfg = gm?.generalsConfig.find(g => g.factionId === this._playerFactionId)?.skill;
        if (!gs?.onField || !skillCfg) {
            this.btnUseSkill.interactable = false;
            this.lblUseSkill.string = '将领未在场';
            return;
        }
        const cdRemain = gs.skillCooldown ?? 0;
        if (cdRemain > 0) {
            this.btnUseSkill.interactable = false;
            this.lblUseSkill.string = `${skillCfg.name} CD ${Math.ceil(cdRemain)}s`;
        } else {
            this.btnUseSkill.interactable = true;
            this.lblUseSkill.string = `施放「${skillCfg.name}」`;
        }
    }

    // ─── 按钮点击回调 ────────────────────────────────────────────────
    onClickBuildBarracks2(): void {
        if (!this._barracksSlot1 || this._barracksSlot1.isBuilt) return;
        if (this._mapBuilder?.troopRoot) {
            this._barracksSlot1.buildSlot1(this._mapBuilder.troopRoot);
        }
    }

    onClickUpgradeBarracks(): void {
        this._barracksSlot0?.upgradeToLevel2();
    }

    /** Phase 2: 升级兵营至 3 级 */
    onClickUpgradeBarracks3(): void {
        this._barracksSlot0?.upgradeToLevel3();
    }

    /** Phase 2: 召唤将领 */
    onClickSummonGeneral(): void {
        if (!this._generalAltar) return;
        const gm = GameManager.inst;
        // 从 mapConfig 获取 laneKey；默认第一条路线
        const slots = gm?.mapConfig?.barracksSlots?.[this._playerFactionId] ?? [];
        const laneKey = slots[0]?.laneKey;
        this._generalAltar.summonGeneral(laneKey);
        this._updateActionPanel(gm?.getGold(this._playerFactionId) ?? 0);
    }

    /** Phase 2: 使用将领技能 */
    onClickUseSkill(): void {
        this._generalAltar?.useGeneralSkill();
    }

    /** Phase 2: 建造市集 */
    onClickBuildMarket(): void {
        if (!this._market || this._market.isBuilt) return;
        this._market.build();
        const gold = GameManager.inst?.getGold(this._playerFactionId) ?? 0;
        this._updateActionPanel(gold);
    }

    /** Phase 2: 建造防御塔（建造第一个未建的） */
    onClickBuildTower(): void {
        const nextTower = this._towers.find(t => !t.isBuilt);
        if (!nextTower) return;
        nextTower.build();
        const gold = GameManager.inst?.getGold(this._playerFactionId) ?? 0;
        this._updateActionPanel(gold);
    }

    /** Phase 2: 切换进攻路线 */
    onClickCycleRoute(): void {
        if (!this._routeManager) return;
        const barracks = [this._barracksSlot0, this._barracksSlot1]
            .filter((b): b is Barracks => b !== null);
        this._routeManager.cycleRoute(this._playerFactionId, barracks);
        // 刷新路线标签
        if (this.lblCycleRoute) {
            this.lblCycleRoute.string = `切换路线 [${this._routeManager.getCurrentRouteName(this._playerFactionId)}]`;
        }
    }

    // ─── 由外部注入引用 ──────────────────────────────────────────────
    /** Phase 1 引用注入（向后兼容） */
    injectBarracksRef(b0: Barracks | null, b1: Barracks | null, builder: MapBuilder): void {
        this._barracksSlot0 = b0;
        this._barracksSlot1 = b1;
        this._mapBuilder    = builder;
    }

    /** Phase 2 引用注入（由 BattleSceneInit 或 MapBuilder 调用） */
    injectPhase2Refs(
        generalAltar: GeneralAltar | null,
        market: Market | null,
        towers: DefenseTower[],
        routeManager: RouteManager | null,
    ): void {
        this._generalAltar = generalAltar;
        this._market       = market;
        this._towers       = towers;
        this._routeManager = routeManager;
    }

    /** 一次性注入 MapBuilder 所有资源（简化 BattleSceneInit 调用） */
    injectFromMapBuilder(builder: MapBuilder, routeManager: RouteManager | null): void {
        this._mapBuilder = builder;
        const fid = this._playerFactionId;

        const barracks = builder.barracksMap.get(fid) ?? [];
        this._barracksSlot0 = barracks[0] ?? null;
        this._barracksSlot1 = barracks[1] ?? null;

        this._generalAltar = builder.altarMap.get(fid) ?? null;
        this._market       = builder.marketMap.get(fid) ?? null;
        this._towers       = builder.towerMap.get(fid)  ?? [];
        this._routeManager = routeManager;
    }
}
