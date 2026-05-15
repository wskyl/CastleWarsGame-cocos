/**
 * ResultUI.ts
 * 结算界面：显示获胜阵营、本局时长，提供「再来一局」和「返回主菜单」按钮。
 * 挂载于 Result.scene 的 ResultUI Canvas 节点。
 */
import { _decorator, Component, Label, Button, Color, director, sys } from 'cc';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';

const { ccclass, property } = _decorator;

// 阵营中文名（与 factions.json 保持一致）
const FACTION_NAMES: Record<string, string> = {
    wei: '魏',
    shu: '蜀',
    wu:  '吴',
};

@ccclass('ResultUI')
export class ResultUI extends Component {
    @property(Label)  winnerLabel:   Label  | null = null;
    @property(Label)  durationLabel: Label  | null = null;
    @property(Button) btnReplay:     Button | null = null;
    @property(Button) btnMainMenu:   Button | null = null;

    start(): void {
        // 从 localStorage 读取战斗结果（由 GameManager 写入）
        const winnerId  = sys.localStorage.getItem('sgzf_winner')   ?? '';
        const duration  = parseInt(sys.localStorage.getItem('sgzf_duration') ?? '0', 10);

        // 获胜阵营
        if (this.winnerLabel) {
            const displayName = FACTION_NAMES[winnerId] ?? winnerId;
            this.winnerLabel.string = `${displayName} 获胜！`;
            // 使用阵营色
            const hexCol = FACTION_COLORS[winnerId] ?? '#ffffff';
            const col    = hexToColor(hexCol);
            this.winnerLabel.color  = col;
        }

        // 本局时长（mm:ss）
        if (this.durationLabel) {
            const mm = Math.floor(duration / 60).toString().padStart(2, '0');
            const ss = (duration % 60).toString().padStart(2, '0');
            this.durationLabel.string = `本局时长：${mm}:${ss}`;
        }

        // 绑定按钮
        this.btnReplay?.node.on(Button.EventType.CLICK, this._onReplay, this);
        this.btnMainMenu?.node.on(Button.EventType.CLICK, this._onMainMenu, this);
    }

    onDestroy(): void {
        this.btnReplay?.node.off(Button.EventType.CLICK, this._onReplay, this);
        this.btnMainMenu?.node.off(Button.EventType.CLICK, this._onMainMenu, this);
    }

    private _onReplay(): void {
        director.loadScene('FactionSelect');
    }

    private _onMainMenu(): void {
        director.loadScene('MainMenu');
    }
}
