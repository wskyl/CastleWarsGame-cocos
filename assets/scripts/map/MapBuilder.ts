/**
 * MapBuilder.ts  ── Phase 2 扩展版
 * 新增：为各阵营创建防御塔槽位节点（初始不激活）、市集节点（初始不激活）；
 *       创建 Slot 1 兵营节点（初始不激活，等待建造）；
 *       _buildGeneralAltar() 现传入 troopRoot 给 initAltar()。
 *
 * 场景层级（程序化创建）：
 * BattleRoot
 *   ├─ MapRoot          (地形平面、河道、祭坛)
 *   ├─ wei_faction      (主城/兵营×2/将坛/防御塔×N/市集)
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
import { DefenseTower } from '../buildings/DefenseTower';
import { Market } from '../buildings/Market';
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

    /** Phase 2: 各阵营防御塔组件列表（factionId -> DefenseTower[]） */
    readonly towerMap: Map<string, DefenseTower[]> = new Map();

    /** Phase 2: 各阵营市集组件（factionId -> Market） */
    readonly marketMap: Map<string, Market> = new Map();

    /** Phase 2: 各阵营将坛组件（factionId -> GeneralAltar） */
    readonly altarMap: Map<string, GeneralAltar> = new Map();

    /** 各阵营兵营列表（factionId -> [Slot0, Slot1]） */
    readonly barracksMap: Map<string, Barracks[]> = new Map();

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

    // ─── 创建一个简单 HP 血条（两层 Box：背景灰 + 前景阵营色） ──────────
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

    // ─── 将坛 ─────────────────────────────────────────────────────────── Phase 2
    private _buildGeneralAltar(factionRoot: Node, cfg: FactionConfig, troopRoot: Node): GeneralAltar {
        const pos = GameManager.inst.mapConfig.generalAltarPositions[cfg.factionId];
        const gaNode = this._createMeshNode(
            factionRoot, `generalAltar_${cfg.factionId}`,
            primitives.cylinder({ radiusTop: 0.8, radiusBottom: 0.8, height: 0.4, radialSegments: 6 }),
            cfg.color, 0.7,
        );
        gaNode.setPosition(pos.x, pos.y + 0.2, pos.z);

        const comp = gaNode.addComponent(GeneralAltar);
        comp.initAltar(cfg.factionId, troopRoot); // Phase 2: 传入 troopRoot
        return comp;
    }

    // ─── Phase 2: 防御塔槽位 ──────────────────────────────────────────────
    private _buildTowers(factionRoot: Node, cfg: FactionConfig, troopRoot: Node): DefenseTower[] {
        const towerSlots = (GameManager.inst.mapConfig as any).towerSlots?.[cfg.factionId] ?? [];
        const towers: DefenseTower[] = [];

        for (const slot of towerSlots) {
            const isFireTower = slot.type === 'fireTower';
            // 箭楼：四棱细柱；火油塔：粗矮圆柱
            const towerNode = this._createMeshNode(
                factionRoot,
                `tower_${cfg.factionId}_${slot.id}`,
                isFireTower
                    ? primitives.cylinder({ radiusTop: 0.5, radiusBottom: 0.6, height: 0.8, radialSegments: 6 })
                    : primitives.cylinder({ radiusTop: 0.35, radiusBottom: 0.35, height: 1.2, radialSegments: 4 }),
                isFireTower ? '#cc4400' : '#888866',
            );
            towerNode.setPosition(slot.x, (slot.y ?? 0) + 0.6, slot.z);

            this._createHpBar(towerNode, cfg.color, 1.0);

            const towerType: 'arrowTower' | 'fireTower' = isFireTower ? 'fireTower' : 'arrowTower';
            const comp = towerNode.addComponent(DefenseTower);
            comp.initTower(cfg.factionId, String(slot.id), towerType, troopRoot);
            towers.push(comp);
        }

        this.towerMap.set(cfg.factionId, towers);
        return towers;
    }

    // ─── Phase 2: 市集 ────────────────────────────────────────────────────
    private _buildMarket(factionRoot: Node, cfg: FactionConfig): Market {
        const pos = (GameManager.inst.mapConfig as any).marketPositions?.[cfg.factionId]
            ?? { x: 0, y: 0, z: 0 };

        const mNode = this._createMeshNode(
            factionRoot,
            `market_${cfg.factionId}`,
            primitives.box({ width: 1.2, height: 0.6, length: 1.2 }),
            '#ffcc44',
        );
        mNode.setPosition(pos.x, (pos.y ?? 0) + 0.3, pos.z);

        this._createHpBar(mNode, cfg.color, 1.2);

        const comp = mNode.addComponent(Market);
        comp.initMarket(cfg.factionId);

        this.marketMap.set(cfg.factionId, comp);
        return comp;
    }

    // ─── 定军山祭坛 ──────────────────────────────────────────────────────
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

    // ─── 地基（草地 + 三条河道） ──────────────────────────────────────────
    private _buildTerrain(mapRoot: Node): void {
        const ground = this._createMeshNode(
            mapRoot, 'ground',
            primitives.plane({ width: 50, length: 50 }),
            COLOR_GRASS,
        );
        ground.setPosition(0, -0.01, 0);

        const rivers = GameManager.inst.mapConfig.rivers;
        for (const r of rivers) {
            const dx = r.end.x - r.start.x;
            const dz = r.end.z - r.start.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle  = Math.atan2(dx, dz);

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
        const gm = GameManager.inst;
        if (!gm) return;

        const scene = this.node;

        // 地形根
        const mapRoot = new Node('MapRoot');
        mapRoot.parent = scene;
        this._buildTerrain(mapRoot);

        // 定军山祭坛
        this._buildAltar(mapRoot);

        // 地形区域检测（河道减速）
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

            // 兵营 Slot 0（初始建造，挂载 TroopSpawner）
            const b0 = this._buildBarracks(factionRoot, cfg, 0);
            if (b0) {
                const spawner = b0.node.addComponent(TroopSpawner);
                spawner.initSpawner(cfg.factionId, b0.laneKey, this.troopRoot!);
            }

            // 兵营 Slot 1（初始不激活，等待玩家/AI 建造）
            const b1 = this._buildBarracks(factionRoot, cfg, 1);

            // 收集兵营引用供 UI / AI 使用
            const barracks = ([b0, b1] as Array<Barracks | null>).filter((b): b is Barracks => b !== null);
            this.barracksMap.set(cfg.factionId, barracks);

            // Phase 2: 将坛（传入 troopRoot）
            const ga = this._buildGeneralAltar(factionRoot, cfg, this.troopRoot!);
            this.altarMap.set(cfg.factionId, ga);

            // Phase 2: 防御塔槽位（初始不激活）
            this._buildTowers(factionRoot, cfg, this.troopRoot!);

            // Phase 2: 市集（初始不激活）
            this._buildMarket(factionRoot, cfg);

            // AI 控制器（非玩家阵营）
            if (!gm.getFactionState(cfg.factionId)?.isPlayer) {
                const aiNode = new Node(`AI_${cfg.factionId}`);
                aiNode.parent = scene;
                const ai = aiNode.addComponent(AIController);
                ai.initAI(
                    cfg.factionId,
                    factionRoot,
                    this.troopRoot!,
                    ga,
                    this.towerMap.get(cfg.factionId) ?? [],
                    this.marketMap.get(cfg.factionId) ?? null,
                );
            }
        }
    }
}
