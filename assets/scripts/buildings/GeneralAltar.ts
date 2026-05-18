/**
 * GeneralAltar.ts  ── Phase 2 完整实现版
 * 将坛：召唤将领、技能触发、重生倒计时显示、HP 管理。
 * 挂载于 Battle 场景各阵营将坛节点（六棱柱 Cylinder）。
 */
import { _decorator, Component, Node, Vec3, MeshRenderer, Material, primitives, utils } from 'cc';
import { GameManager, AttackTarget, GamePhase } from '../core/GameManager';
import { GeneralComponent } from '../generals/GeneralComponent';
import { MapManager } from '../map/MapManager';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';

const { ccclass } = _decorator;

@ccclass('GeneralAltar')
export class GeneralAltar extends Component {
    factionId: string = '';

    private _hp:          number = 500;
    private _maxHp:       number = 500;
    private _target:      AttackTarget | null = null;
    private _troopRoot:   Node | null = null;
    private _generalComp: GeneralComponent | null = null;

    initAltar(factionId: string, troopRoot: Node): void {
        this.factionId   = factionId;
        this._troopRoot  = troopRoot;
        this._maxHp      = GameManager.inst?.buildingConfig?.generalAltar?.hp ?? 500;
        this._hp         = this._maxHp;

        const pos = new Vec3();
        this.node.getWorldPosition(pos);
        this._target = {
            node:       this.node,
            factionId:  factionId,
            position:   pos,
            isBuilding: true,
            tags:       ['building', 'generalAltar'],
            onHit:      this._onHit.bind(this),
        };
        GameManager.inst?.registerTarget(this._target);
    }

    update(_dt: number): void {
        if (this._target) this.node.getWorldPosition(this._target.position);
    }

    // ─── 召唤将领 ─────────────────────────────────────────────────────────
    /**
     * 召唤将领：扣款、创建 GeneralComponent、随机选取一条出兵路线出发。
     * @param laneKey 出发路线（可由 UI 选择，或默认第一条）
     */
    summonGeneral(laneKey?: string): boolean {
        const gm = GameManager.inst;
        if (!gm || !gm.canSummonGeneral(this.factionId)) return false;
        if (!gm.chargeGeneralSummon(this.factionId)) return false;

        const cfg = gm.generalsConfig.find(g => g.factionId === this.factionId);
        if (!cfg) return false;

        // 确定路线
        const slots   = gm.mapConfig?.barracksSlots?.[this.factionId] ?? [];
        const key     = laneKey ?? slots[0]?.laneKey ?? 'wei_shu';
        const mapMgr  = MapManager.inst;
        const wps     = mapMgr?.getLaneWaypoints(key) ?? [];
        if (wps.length === 0) return false;

        // 创建将领节点（大球体）
        const root = this._troopRoot ?? this.node.parent!;
        const gNode = new Node(`general_${this.factionId}`);
        gNode.parent = root;

        // 占位形状：大球（radius 0.5）
        const mr = gNode.addComponent(MeshRenderer);
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        const col = hexToColor(FACTION_COLORS[this.factionId] ?? '#ffffff');
        mat.setProperty('mainColor', col); mat.setProperty('albedo', col);
        mr.setMaterial(mat, 0);

        const { utils: ccUtils, primitives: ccPrimitives } = require('cc');
        mr.mesh = ccUtils.createMesh(ccPrimitives.sphere({ radius: 0.5, segments: 10 }));

        // 出生位置（路径第一点）
        gNode.setWorldPosition(wps[0].x, 0.5, wps[0].z);

        const comp = gNode.addComponent(GeneralComponent);
        comp.init(cfg, wps, root);
        this._generalComp = comp;

        const gs = gm.getGeneralState(this.factionId);
        if (gs) gs.generalRef = comp;
        return true;
    }

    /** 触发将领技能（由 BattleUI 调用） */
    useGeneralSkill(): void {
        const gs = GameManager.inst?.getGeneralState(this.factionId);
        const comp = gs?.generalRef as GeneralComponent | null;
        comp?.useSkill();
    }

    // ─── HP 管理 ─────────────────────────────────────────────────────────
    private _onHit(damage: number, _tags: string[], _factionId: string): void {
        if (GameManager.inst?.phase !== GamePhase.PLAYING) return;
        this._hp -= damage;
        if (this._hp <= 0) {
            this._hp = 0;
            if (this._target) {
                GameManager.inst?.unregisterTarget(this._target);
                this._target = null;
            }
            this.node.active = false;
        }
    }

    onDestroy(): void {
        if (this._target) GameManager.inst?.unregisterTarget(this._target);
    }

    get hpPercent(): number { return this._maxHp > 0 ? this._hp / this._maxHp : 0; }
    get tooltipText(): string { return '将坛 - 点击召唤将领'; }
    get isDestroyed(): boolean { return !this.node.active; }
    get generalComp(): GeneralComponent | null { return this._generalComp; }
}
