/**
 * AltarController.ts
 * 定军山祭坛占领逻辑：
 *   - 检测哪个阵营的士兵在祭坛范围内
 *   - 管理 3 秒蓄力计时
 *   - 完成后向 GameManager 申请加成，60 秒后或被夺取时清除
 *   - 驱动祭坛颜色变化（通过 MaterialHelper 修改 MeshRenderer 材质颜色）
 * 挂载于 Battle 场景的 Altar 节点。
 */
import { _decorator, Component, MeshRenderer, Color, Vec3 } from 'cc';
import { GameManager, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { MapManager } from './MapManager';
import { hexToColor, FACTION_COLORS, COLOR_NEUTRAL } from '../faction/FactionData';

const { ccclass, property } = _decorator;

enum AltarState {
    NEUTRAL    = 'NEUTRAL',
    CAPTURING  = 'CAPTURING',
    CAPTURED   = 'CAPTURED',
}

@ccclass('AltarController')
export class AltarController extends Component {
    // 当前占领阵营
    private _ownerFactionId: string = '';
    // 正在蓄力的阵营
    private _capturingFactionId: string = '';
    private _captureTimer: number = 0;
    private _state: AltarState = AltarState.NEUTRAL;

    // 闪烁动画
    private _blinkTimer: number = 0;
    private _blinkPhase: number = 0;

    // 祭坛底盘的 MeshRenderer（运行时获取）
    private _mr: MeshRenderer | null = null;

    // 检测间隔
    private _detectInterval: number = 0.1;
    private _detectTimer: number = 0;

    start(): void {
        this._mr = this.node.getComponent(MeshRenderer);
        this._applyColor(hexToColor(COLOR_NEUTRAL));
    }

    update(dt: number): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;

        // 蓄力完成后持续时间由 GameManager 通过 altarBonusTimer 管理
        this._detectTimer += dt;
        if (this._detectTimer >= this._detectInterval) {
            this._detectTimer = 0;
            this._detectCapture();
        }

        // 闪烁动画
        if (this._state === AltarState.CAPTURING) {
            this._blinkTimer += dt;
            this._blinkPhase = (Math.sin(this._blinkTimer * Math.PI * 2) + 1) / 2; // 0~1
            const col = hexToColor(FACTION_COLORS[this._capturingFactionId] ?? COLOR_NEUTRAL);
            col.a = Math.round(100 + 155 * this._blinkPhase);
            this._applyColor(col);
        }
    }

    private _detectCapture(): void {
        const mapMgr = MapManager.inst;
        if (!mapMgr) return;
        const altarPos = mapMgr.getAltarPosition();
        const radius   = mapMgr.altarRadius;

        // 统计各阵营在祭坛内的兵数
        const counters: Record<string, number> = {};
        const targets = GameManager.inst!.getTargets();
        for (const t of targets) {
            if (t.isBuilding) continue;
            const dist = Vec3.distance(t.position, altarPos);
            if (dist <= radius) {
                counters[t.factionId] = (counters[t.factionId] ?? 0) + 1;
            }
        }

        // 找出在区域内有兵力的阵营
        const presentFactions = Object.keys(counters).filter(fId => counters[fId] > 0);
        const isContested = presentFactions.length > 1;

        if (isContested || presentFactions.length === 0) {
            // 争议或无人 → 蓄力中断（不清除已占领加成）
            if (this._state === AltarState.CAPTURING) {
                this._state = this._ownerFactionId
                    ? AltarState.CAPTURED
                    : AltarState.NEUTRAL;
                this._capturingFactionId = '';
                this._captureTimer = 0;
                this._updateColorForState();
            }
            return;
        }

        const challenger = presentFactions[0];

        if (this._state === AltarState.CAPTURED && challenger === this._ownerFactionId) {
            return; // 已被同一阵营占领，无事
        }

        // 新阵营开始蓄力
        if (this._capturingFactionId !== challenger) {
            this._capturingFactionId = challenger;
            this._captureTimer = 0;
            this._blinkTimer   = 0;
            this._state = AltarState.CAPTURING;
            EventManager.emit(GameEvent.ALTAR_CAPTURING, challenger);
        }

        // 累积蓄力时间
        this._captureTimer += this._detectInterval;
        if (this._captureTimer >= mapMgr.altarCaptureDuration) {
            this._completeCaptureFor(challenger);
        }
    }

    private _completeCaptureFor(factionId: string): void {
        // 清除上一个占领者的加成
        if (this._ownerFactionId && this._ownerFactionId !== factionId) {
            GameManager.inst!.clearAltarBonus(this._ownerFactionId);
        }
        this._ownerFactionId      = factionId;
        this._capturingFactionId  = '';
        this._captureTimer        = 0;
        this._state               = AltarState.CAPTURED;
        GameManager.inst!.applyAltarBonus(factionId);
        EventManager.emit(GameEvent.ALTAR_CAPTURED, factionId);
        this._updateColorForState();
    }

    private _updateColorForState(): void {
        if (this._state === AltarState.NEUTRAL) {
            this._applyColor(hexToColor(COLOR_NEUTRAL));
        } else if (this._state === AltarState.CAPTURED) {
            this._applyColor(hexToColor(FACTION_COLORS[this._ownerFactionId] ?? COLOR_NEUTRAL));
        }
    }

    private _applyColor(col: Color): void {
        if (!this._mr) return;
        const mat = this._mr.getMaterial(0);
        if (mat) {
            mat.setProperty('mainColor', col);
            mat.setProperty('albedo',    col);
        }
    }

    /** 外部查询当前占领阵营 */
    get ownerFactionId(): string { return this._ownerFactionId; }
    get altarState(): AltarState { return this._state; }
}
