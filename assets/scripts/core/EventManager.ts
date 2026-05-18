/**
 * EventManager.ts
 * 全局事件总线 —— 单例，基于 Cocos Creator 3.8 的 EventTarget 封装。
 * 使用方式：import { EventManager, GameEvent } from './EventManager';
 *            EventManager.on(GameEvent.GOLD_CHANGED, cb, target);
 *            EventManager.emit(GameEvent.GOLD_CHANGED, factionId, newGold);
 */
import { EventTarget } from 'cc';

// ─── 事件枚举 ──────────────────────────────────────────────────────────────
export enum GameEvent {
    /** 某阵营出局：payload: factionId:string */
    FACTION_ELIMINATED    = 'FACTION_ELIMINATED',
    /** 某阵营金币变化：payload: factionId:string, gold:number, rate:number */
    GOLD_CHANGED          = 'GOLD_CHANGED',
    /** 某阵营场上兵力变化：payload: factionId:string, count:number */
    TROOP_COUNT_CHANGED   = 'TROOP_COUNT_CHANGED',
    /** 祭坛开始被某阵营蓄力：payload: factionId:string */
    ALTAR_CAPTURING       = 'ALTAR_CAPTURING',
    /** 祭坛被某阵营占领：payload: factionId:string */
    ALTAR_CAPTURED        = 'ALTAR_CAPTURED',
    /** 祭坛回归中立 */
    ALTAR_NEUTRAL         = 'ALTAR_NEUTRAL',
    /** 战斗开始（倒计时结束后触发） */
    GAME_STARTED          = 'GAME_STARTED',
    /** 游戏结束：payload: winnerFactionId:string */
    GAME_OVER             = 'GAME_OVER',
    /** 建筑被摧毁：payload: buildingType:string, factionId:string, slotId?:string */
    BUILDING_DESTROYED    = 'BUILDING_DESTROYED',
    /** 建筑被重建：payload: buildingType:string, factionId:string, slotId?:string */
    BUILDING_REBUILT      = 'BUILDING_REBUILT',
    /** 士兵被击杀：payload: troopTier:number, killedFactionId:string, killerFactionId:string */
    TROOP_KILLED          = 'TROOP_KILLED',
    /** 行军指令变更，通知 UI 刷新行军路线按钮（无 payload） */
    MARCH_ORDER_CHANGED   = 'MARCH_ORDER_CHANGED',
}

// ─── 单例实现 ──────────────────────────────────────────────────────────────
class EventBus {
    private static _inst: EventBus | null = null;
    private _et: EventTarget = new EventTarget();

    static get inst(): EventBus {
        if (!EventBus._inst) {
            EventBus._inst = new EventBus();
        }
        return EventBus._inst;
    }

    on(event: GameEvent | string, cb: (...args: any[]) => void, target?: any): void {
        this._et.on(event, cb, target);
    }

    off(event: GameEvent | string, cb: (...args: any[]) => void, target?: any): void {
        this._et.off(event, cb, target);
    }

    once(event: GameEvent | string, cb: (...args: any[]) => void, target?: any): void {
        this._et.once(event, cb, target);
    }

    emit(event: GameEvent | string, ...args: any[]): void {
        this._et.emit(event, ...args);
    }

    /** 移除某 target 的所有监听（在组件 onDestroy 中调用） */
    targetOff(target: any): void {
        this._et.targetOff(target);
    }
}

export const EventManager = EventBus.inst;
