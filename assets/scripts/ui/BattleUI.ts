/**
 * BattleUI.ts
 * 战斗 HUD：顶部金币 / 速率 / 兵力、右下操作面板、左上小地图缩略图。
 * 使用前须将 UI 节点引用通过 @property 在编辑器中绑定。
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
import { MapBuilder } from '../map/MapBuilder';

const { ccclass, property } = _decorator;

@ccclass('BattleUI')
export class BattleUI extends Component {
    // ── 顶部栏 ──────────────────────────────────────────────────────
    @property(Label) goldLabel:     Label | null = null;
    @property(Label) rateLabel:     Label | null = null;
    @property(Label) troopLabel:    Label | null = null;

    // ── 操作面板 ─────────────────────────────────────────────────────
    @property(Button) btnBuild2:    Button | null = null;
    @property(Label)  lblBuild2:    Label  | null = null;
    @property(Button) btnUpgrade:   Button | null = null;
    @property(Label)  lblUpgrade:   Label  | null = null;

    // ── 小地图 ──────────────────────────────────────────────────────
    @property(Node)  minimapRoot:   Node | null = null;

    // ── 倒计时 ──────────────────────────────────────────────────────
    @property(Label) countdownLabel: Label | null = null;

    // ── 出局提示 ─────────────────────────────────────────────────────
    @property(Label) eliminatedLabel: Label | null = null;

    // ── 将坛提示 ─────────────────────────────────────────────────────
    @property(Label) generalAltarLabel: Label | null = null;

    // ── 内部状态 ─────────────────────────────────────────────────────
    private _playerFactionId: string = '';
    private _mapBuilder: MapBuilder | null = null;
    private _barracksSlot0: Barracks | null = null;
    private _barracksSlot1: Barracks | null = null;
    private _countdownVal: number = 3;
    private _playerEliminated: boolean = false;
    private _eliminatedTimer: number = 0;

    onLoad(): void {
        this._playerFactionId = GameManager.inst?.playerFactionId ?? 'wei';

        // 监听事件
        EventManager.on(GameEvent.GOLD_CHANGED,        this._onGoldChanged,        this);
        EventManager.on(GameEvent.TROOP_COUNT_CHANGED, this._onTroopCountChanged,  this);
        EventManager.on(GameEvent.ALTAR_CAPTURED,      this._onAltarCaptured,      this);
        EventManager.on(GameEvent.ALTAR_NEUTRAL,       this._onAltarNeutral,       this);
        EventManager.on(GameEvent.FACTION_ELIMINATED,  this._onFactionEliminated,  this);
        EventManager.on(GameEvent.GAME_STARTED,        this._onGameStarted,        this);

        // 将坛提示（锁定）
        if (this.generalAltarLabel) {
            this.generalAltarLabel.string = '🏯 将领系统即将上线';
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
                // 通知 GameManager 开始游戏
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

        if (this.goldLabel)  this.goldLabel.string  = `💰 ${gold}`;

        const altarBonus = GameManager.inst?.getFactionState(factionId)?.altarBonus ?? false;
        if (this.rateLabel) {
            if (altarBonus) {
                this.rateLabel.string       = `+${rate.toFixed(1)}/s ×1.2`;
                this.rateLabel.color        = new Color(255, 200, 0, 255);
            } else {
                this.rateLabel.string       = `+${rate.toFixed(1)}/s`;
                this.rateLabel.color        = new Color(200, 200, 200, 255);
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
            // 隐藏操作面板
            if (this.btnBuild2)  this.btnBuild2.node.active = false;
            if (this.btnUpgrade) this.btnUpgrade.node.active = false;
            // 显示旁观提示
            if (this.eliminatedLabel) {
                this.eliminatedLabel.node.active = true;
                this.eliminatedLabel.string      = '你已出局，正在旁观…';
            }
        }
    }

    private _onGameStarted(): void {
        // 初始化数据显示
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
        const buildCost   = GameManager.inst?.buildingConfig?.barracks?.buildCost   ?? 50;
        const upgradeCost = GameManager.inst?.buildingConfig?.barracks?.upgradeCost ?? 80;

        if (this.btnBuild2 && this.lblBuild2) {
            const canBuild = gold >= buildCost;
            this.btnBuild2.interactable   = canBuild;
            this.lblBuild2.string         = `建造第2兵营 ${buildCost}💰${canBuild ? '' : '（金币不足）'}`;
        }

        if (this.btnUpgrade && this.lblUpgrade) {
            const canUpgrade = gold >= upgradeCost;
            this.btnUpgrade.interactable  = canUpgrade;
            this.lblUpgrade.string        = `升级兵营至2级 ${upgradeCost}💰${canUpgrade ? '' : '（金币不足）'}`;
        }
    }

    // ─── 按钮点击回调（在编辑器中绑定或在 start() 中代码绑定） ──────
    onClickBuildBarracks2(): void {
        if (!this._barracksSlot1 || this._barracksSlot1.isBuilt) return;
        if (this._mapBuilder?.troopRoot) {
            this._barracksSlot1.buildSlot1(this._mapBuilder.troopRoot);
        }
    }

    onClickUpgradeBarracks(): void {
        this._barracksSlot0?.upgradeToLevel2();
    }

    /** 由外部（BattleSceneInit）注入引用 */
    injectBarracksRef(b0: Barracks | null, b1: Barracks | null, builder: MapBuilder): void {
        this._barracksSlot0 = b0;
        this._barracksSlot1 = b1;
        this._mapBuilder    = builder;
    }

    // ─── 出局倒计时 ──────────────────────────────────────────────────
    update(dt: number): void {
        if (!this._playerEliminated) return;
        this._eliminatedTimer -= dt;
        if (this._eliminatedTimer <= 0 && GameManager.inst?.phase !== GamePhase.GAME_OVER) {
            // 5 秒后跳结算（玩家出局时不等 GAME_OVER）
            GameManager.inst!.phase = GamePhase.GAME_OVER;
            const winner = [...GameManager.inst!.factions.values()].find(f => f.alive)?.factionId ?? '';
            const { director } = require('cc');
            director.loadScene('Result');
        }
    }
}
