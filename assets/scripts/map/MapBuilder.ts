/**
 * MapBuilder.ts
 * 程序化构建 Battle 场景所有 3D 地形、建筑节点（占位几何体）。
 * 挂载于 Battle 场景根节点，start() 时完成地图搭建。
 *
 * 场景层级（程序化创建）：
 * BattleRoot
 *   ├─ MapRoot          (地形平面、河道、祭坛)
 *   ├─ wei_faction      (主城/兵营/将坛)
 *   ├─ shu_faction
 *   ├─ wu_faction
 *   └─ TroopRoot        (士兵动态节点挂载点)
 */
import {
    _decorator, Component, Node, Vec3, Color, MeshRenderer, Material,
    primitives, utils, geometry, find,
} from 'cc';
import { GameManager, GamePhase, FactionConfig } from '../core/GameManager';
import { hexToColor, COLOR_NEUTRAL, COLOR_ROAD, COLOR_GRASS, COLOR_RIVER, FACTION_COLORS } from '../faction/FactionData';
import { Castle } from '../buildings/Castle';
import { Barracks } from '../buildings/Barracks';
import { GeneralAltar } from '../buildings/GeneralAltar';
import { TroopSpawner } from '../units/TroopSpawner';
import { AltarController } from './AltarController';
import { TerrainZone } from './TerrainZone';
import { MapManager } from './MapManager';
import { AIController } from '../ai/AIController';

const { ccclass, property } = _decorator;

@ccclass('MapBuilder')
export class MapBuilder extends Component {
    /** 暴露给外部（如 BattleUI）的 TroopRoot 节点 */
    troopRoot: Node | null = null;

    // ─── 内部辅助：创建带颜色材质的 MeshRenderer 节点 ─────────────────────
    private _createMeshNode(
        parent: Node,
        name: string,
        meshData: any,
        hexColor: string,
        alpha: number = 1.0,
    ): Node {
        const node = new Node(name);
        node.parent = parent;
        const mr = node.addComponent(MeshRenderer);
        mr.mesh = utils.createMesh(meshData);
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        const col = hexToColor(hexColor, alpha);
        mat.setProperty('mainColor', col);
        mat.setProperty('albedo',    col);
        mr.setMaterial(mat, 0);
        return node;
    }

    // ─── 创建一个简单 HP 血条（两层 Box：背景红 + 前景阵营色） ────────────
    private _createHpBar(parent: Node, factionColor: string, barWidth: number = 2): Node {
        const root = new Node('HpBarRoot');
        root.parent = parent;
        root.setPosition(0, 1.2, 0);

        // 背景（深灰）
        const bg = this._createMeshNode(root, 'HpBg',
            primitives.box({ width: barWidth, height: 0.1, length: 0.15 }),
            '#444444');
        bg.setPosition(0, 0, 0);

        // 前景（阵营色，通过 scale.x 表示 HP 百分比）
        const fg = this._createMeshNode(root, 'HpFg',
            primitives.box({ width: barWidth, height: 0.1, length: 0.2 }),
            factionColor);
        fg.setPosition(0, 0, 0);

        return root;
    }

    // ─── 主城 ────────────────────────────────────────────────────────────
    private _buildCastle(factionRoot: Node, cfg: FactionConfig): Castle {
        const pos = GameManager.inst.mapConfig.castlePositions[cfg.factionId];
        const castleNode = this._createMeshNode(
            factionRoot, `castle_${cfg.factionId}`,
            primitives.box({ width: 2, height: 1, length: 2 }),
            cfg.color,
        );
        castleNode.setPosition(pos.x, pos.y + 0.5, pos.z);

        // HP 血条
        this._createHpBar(castleNode, cfg.color, 2.5);

        const comp = castleNode.addComponent(Castle);
        comp.initCastle(cfg.factionId);
        return comp;
    }

    // ─── 兵营 ────────────────────────────────────────────────────────────
    private _buildBarracks(factionRoot: Node, cfg: FactionConfig, slotIdx: number): Barracks | null {
        const slots = GameManager.inst.mapConfig.barracksSlots[cfg.factionId];
        if (slotIdx >= slots.length) return null;
        const slot = slots[slotIdx];

        const bNode = this._createMeshNode(
            factionRoot, `barracks_${cfg.factionId}_${slotIdx}`,
            primitives.box({ width: 1, height: 0.5, length: 1 }),
            cfg.color,
        );
        bNode.setPosition(slot.x, slot.y + 0.25, slot.z);

        this._createHpBar(bNode, cfg.color, 1.2);

        const comp = bNode.addComponent(Barracks);
        comp.initBarracks(cfg.factionId, slotIdx, slot.laneKey);
        return comp;
    }

    // ─── 将坛 ────────────────────────────────────────────────────────────
    private _buildGeneralAltar(factionRoot: Node, cfg: FactionConfig): GeneralAltar {
        const pos = GameManager.inst.mapConfig.generalAltarPositions[cfg.factionId];
        const gaNode = this._createMeshNode(
            factionRoot, `generalAltar_${cfg.factionId}`,
            primitives.cylinder({ radiusTop: 0.8, radiusBottom: 0.8, height: 0.4, radialSegments: 6 }),
            cfg.color, 0.7,
        );
        gaNode.setPosition(pos.x, pos.y + 0.2, pos.z);

        const comp = gaNode.addComponent(GeneralAltar);
        comp.initAltar(cfg.factionId);
        return comp;
    }

    // ─── 祭坛 ────────────────────────────────────────────────────────────
    private _buildAltar(parent: Node): Node {
        const altPos = GameManager.inst.mapConfig.altarPosition;
        const radius = GameManager.inst.mapConfig.altarRadius;
        const altarNode = this._createMeshNode(
            parent, 'altar_dingjunshan',
            primitives.cylinder({
                radiusTop: radius, radiusBottom: radius,
                height: 0.05, radialSegments: 32,
            }),
            COLOR_NEUTRAL,
        );
        altarNode.setPosition(altPos.x, altPos.y + 0.01, altPos.z);
        altarNode.addComponent(AltarController);
        return altarNode;
    }

    // ─── 地基（草地 + 道路简化为整体大平面） ─────────────────────────────
    private _buildTerrain(mapRoot: Node): void {
        // 草地底板
        const ground = this._createMeshNode(
            mapRoot, 'ground',
            primitives.plane({ width: 50, length: 50 }),
            COLOR_GRASS,
        );
        ground.setPosition(0, -0.01, 0);

        // 三条河道（Plane 水平铺设）
        const rivers = GameManager.inst.mapConfig.rivers;
        for (const r of rivers) {
            const dx = r.end.x - r.start.x;
            const dz = r.end.z - r.start.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle  = Math.atan2(dx, dz); // 绕 Y 旋转角度

            const riverNode = this._createMeshNode(
                mapRoot, `river_${r.id}`,
                primitives.plane({ width: r.width, length }),
                COLOR_RIVER, 0.5,
            );
            const mx = (r.start.x + r.end.x) / 2;
            const mz = (r.start.z + r.end.z) / 2;
            riverNode.setPosition(mx, 0.005, mz);
            riverNode.setRotationFromEuler(0, (angle * 180) / Math.PI, 0);
        }
    }

    // ─── start：程序化构建整个地图 ──────────────────────────────────────
    start(): void {
        // 等待 GameManager 配置加载完成
        const gm = GameManager.inst;
        if (!gm) return;

        const scene = this.node;

        // 地形根
        const mapRoot = new Node('MapRoot');
        mapRoot.parent = scene;
        this._buildTerrain(mapRoot);

        // 祭坛
        this._buildAltar(mapRoot);

        // 地形区域检测
        const tzNode = new Node('TerrainZone');
        tzNode.parent = scene;
        tzNode.addComponent(TerrainZone);

        // 兵力挂载点
        this.troopRoot = new Node('TroopRoot');
        this.troopRoot.parent = scene;

        // 逐阵营构建建筑
        for (const cfg of gm.factionsConfig) {
            const factionRoot = new Node(`${cfg.factionId}_faction`);
            factionRoot.parent = scene;

            // 主城
            this._buildCastle(factionRoot, cfg);

            // 初始兵营（Slot 0）
            const b0 = this._buildBarracks(factionRoot, cfg, 0);
            if (b0) {
                const spawner = b0.node.addComponent(TroopSpawner);
                spawner.initSpawner(cfg.factionId, b0.laneKey, this.troopRoot!);
            }

            // Slot 1 预留（不建造，Barracks 组件记录 destroyed 状态）
            // 将坛
            this._buildGeneralAltar(factionRoot, cfg);

            // AI 控制器（非玩家阵营）
            if (!gm.getFactionState(cfg.factionId)?.isPlayer) {
                const aiNode = new Node(`AI_${cfg.factionId}`);
                aiNode.parent = scene;
                const ai = aiNode.addComponent(AIController);
                ai.initAI(cfg.factionId, factionRoot, this.troopRoot!);
            }
        }
    }
}
