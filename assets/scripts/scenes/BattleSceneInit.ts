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

            // 构建地图（MapBuilder 挂在本节点，手动调用 start 进入 loadConfigs 回调流程）
            const builder = this.node.addComponent(MapBuilder);
            builder.start();

            // Phase 2: 初始化路线管理器
            const routeNode = new Node('RouteRoot');
            routeNode.parent = this.node;
            const routeManager = routeNode.addComponent(RouteManager);

            // 向 BattleUI 注入全部建筑引用（Phase 1 + Phase 2 合并方式）
            if (this.battleUINode) {
                const ui = this.battleUINode.getComponent(BattleUI);
                if (ui) {
                    ui.injectFromMapBuilder(builder, routeManager);
                }
            }

            // 监听游戏结束，自动跳转结算
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
    }
}
