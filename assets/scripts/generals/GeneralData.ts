/**
 * GeneralData.ts
 * 将领系统数据接口定义（无依赖纯数据层）。
 */

/** 将领技能参数 */
export interface GeneralSkillParams {
    /** faction_buff: 攻击间隔系数（< 1 加速） */
    atkIntervalMult?: number;
    /** faction_buff: 伤害系数 */
    dmgMult?: number;
    /** invincible_aoe: AOE 伤害值 */
    aoeDamage?: number;
    /** invincible_aoe: AOE 半径 */
    aoeRadius?: number;
    /** lane_burn: 灼烧伤害/秒 */
    burnDmgPerSec?: number;
    /** lane_burn: 灼烧持续秒 */
    burnDuration?: number;
    /** lane_burn: 燃烧路线长度 */
    burnRange?: number;
    /** lane_burn: 横向宽度（判定半径） */
    burnRadius?: number;
}

export interface GeneralSkillConfig {
    name: string;
    description: string;
    /** 技能冷却时间（秒） */
    cooldown: number;
    /** 技能持续时间（秒，适用于 buff/invincible） */
    duration: number;
    /**
     * 技能类型：
     *   "faction_buff"    — 增益所有己方士兵
     *   "invincible_aoe"  — 将领无敌 + AOE 伤害
     *   "lane_burn"       — 对前方直线施加灼烧
     */
    type: 'faction_buff' | 'invincible_aoe' | 'lane_burn';
    params: GeneralSkillParams;
}

export interface GeneralConfig {
    generalId: string;
    factionId: string;
    name: string;
    hp: number;
    atk: number;
    atkInterval: number;
    moveSpeed: number;
    atkRange: number;
    summonCost: number;
    respawnCooldown: number;
    tags: string[];
    skill: GeneralSkillConfig;
}

/** 运行时将领状态（存于 GameManager） */
export interface GeneralState {
    generalId: string;
    factionId: string;
    /** 当前是否在场上（存活） */
    onField: boolean;
    /** 重生倒计时（秒），0 = 可立即召唤 */
    respawnTimer: number;
    /** 技能冷却剩余秒数 */
    skillCooldown: number;
    /** 在场 GeneralComponent 引用（用于 UI 更新） */
    generalRef: any;
}

/** 活跃中的阵营 Buff（来自将领技能） */
export interface GeneralBuff {
    factionId: string;
    /** 攻击间隔系数（< 1 则加速攻击） */
    atkIntervalMult: number;
    /** 伤害系数（> 1 则增伤） */
    dmgMult: number;
    /** 到期时刻（GameManager.elapsedSeconds 基准） */
    expiresAt: number;
}

/** 防御塔单项配置 */
export interface TowerTypeConfig {
    name: string;
    hp: number;
    atk: number;
    atkInterval: number;
    atkRange: number;
    buildCost: number;
    aoeRadius?: number;
    burnDmgPerSec?: number;
    burnDuration?: number;
}

export interface TowerConfig {
    arrowTower: TowerTypeConfig;
    fireTower:  TowerTypeConfig;
}
