/**
 * MainMenuInit.ts
 * 主菜单场景入口：显示游戏标题和「开始游戏」按钮。
 * 挂载于 MainMenu.scene 的 Canvas 根节点。
 */
import { _decorator, Component, Button, Label, director } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MainMenuInit')
export class MainMenuInit extends Component {
    @property(Button) btnStart: Button | null = null;
    @property(Label)  lblTitle: Label  | null = null;

    start(): void {
        if (this.lblTitle) {
            this.lblTitle.string = '三国争锋';
        }
        this.btnStart?.node.on(Button.EventType.CLICK, this._onStart, this);
    }

    onDestroy(): void {
        this.btnStart?.node.off(Button.EventType.CLICK, this._onStart, this);
    }

    private _onStart(): void {
        director.loadScene('FactionSelect');
    }
}
