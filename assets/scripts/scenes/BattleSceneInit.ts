/**
 * BattleSceneInit.ts
 * Battle 场景启动入口：
 *   1. 从 localStorage 读取玩家阵营
 *   2. 加载所有配置（GameManager.loadConfigs）
 *   3. 初始化阵营状态 + 将领状态
 *   4. 调用 MapBuilder 构建整个地图与建筑
 *   5. 向 BattleUI 注入所有 Phase 2 建筑引用
 *   6. 启动 BattleUI 倒计时
 * 挂载于 Battle.scene 的 GameBoot 节点（同时也挂载 GameManager、MapManager、FactionManager）。
 */
import { _decorator, Component, Node, director, find, sys } from 'cc';
import { GameManager, GamePhase } from '../core/GameManager';
import { EventManager, GameEvent } from '../core/EventManager';
import { MapBuilder } from '../map/MapBuilder';
import { BattleUI } from '../ui/BattleUI';
import { RouteManager } from '../systems/RouteManager';
import { TroopComponent } from '../units/TroopComponent';

const { ccclass, property } = _decorator;

@ccclass('BattleSceneInit')
export class BattleSceneInit extends Component {
    /** 挂载 BattleUI 组件的 Canvas 节点（在编辑器中绑定） */
    @property(Node) battleUINode: Node | null = null;

    start(): void {
        // 读取玩家阵营选择
        const playerFaction = sys.localStorage.getItem('sgzf_player_faction') ?? 'wei';
        const gm = GameManager.inst;
        if (!gm) {
            console.error('[BattleSceneInit] GameManager not found!');
            return;
        }

        // 加载所有 JSON 配置（Phase 1 + Phase 2 共 8 个），完成后初始化
        gm.loadConfigs(() => {
            // 初始化阵营状态
            gm.initFactions(playerFaction);

            // Phase 2: 初始化将领状态（GeneralState Map）
            gm.initGenerals();

            // 构建地图：MapBuilder 挂载到当前活跃场景的根节点（而非持久的 GameBoot 节点），
            // 使其跟随场景销毁，避免再次进入 Battle.scene 时重复构建。
            // 使用 director.getScene() 而非 this.node.scene，异步回调中更可靠。
            const currentScene = director.getScene();
            const mapRootNode = new Node('MapBuilderRoot');
            mapRootNode.parent = currentScene ?? this.node.parent ?? this.node;
            const builder = mapRootNode.addComponent(MapBuilder);
            // 手动调用 start() 以立即填充 barracksMap/altarMap/towerMap/marketMap，
            // MapBuilder._built 防止 CC3 引擎下一帧再次自动调用导致重复创建节点。
            builder.start();

            // Phase 2: 路线管理器挂载在独立子节点
            const routeNode = new Node('RouteRoot');
            routeNode.parent = mapRootNode;
            const routeManager = routeNode.addComponent(RouteManager);

            // 向 BattleUI 注入全部建筑引用（Phase 1 + Phase 2 合并方式）
            if (this.battleUINode) {
                const ui = this.battleUINode.getComponent(BattleUI);
                if (ui) {
                    ui.injectFromMapBuilder(builder, routeManager);
                }
            }

            // 清理旧的 GAME_OVER 监听（场景重入时防止重复注册），再重新注册
            EventManager.targetOff(this);
            EventManager.on(GameEvent.GAME_OVER, this._onGameOver, this);
        });
    }

    private _onGameOver(_winnerId: string): void {
        // 延迟 1 秒后跳结算，让结束动画播完
        this.scheduleOnce(() => {
            director.loadScene('Result');
        }, 1.0);
    }

    onDestroy(): void {
        EventManager.targetOff(this);
        // 销毁 TroopComponent 静态对象池，释放所有节点引用，
        // 防止场景重新进入时旧节点引用残留造成内存泄漏。
        TroopComponent.destroyPool();
    }
}
