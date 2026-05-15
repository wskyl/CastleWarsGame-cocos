/**
 * FactionData.ts
 * 阵营相关接口与工具函数（无依赖的纯数据层）。
 */
import { Color } from 'cc';

// ─── 颜色工具 ──────────────────────────────────────────────────────────────
/**
 * 将十六进制颜色字符串（如 "#3366CC"）转换为 Cocos Creator Color 对象。
 */
export function hexToColor(hex: string, alpha: number = 1): Color {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const a = Math.round(alpha * 255);
    return new Color(r, g, b, a);
}

/** 预置阵营颜色（与 factions.json 保持一致） */
export const FACTION_COLORS: Record<string, string> = {
    wei: '#3366CC',
    shu: '#33AA44',
    wu:  '#CC3333',
};

/** 中立/无主颜色 */
export const COLOR_NEUTRAL   = '#888888';
export const COLOR_ROAD      = '#D0C8B8';
export const COLOR_GRASS     = '#A8C88A';
export const COLOR_RIVER     = '#5090CC';
export const COLOR_PROJECTILE_DEFAULT = '#FFFFFF';
