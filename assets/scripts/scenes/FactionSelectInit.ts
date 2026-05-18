/**
 * FactionSelectInit.ts
 * 阵营选择场景：三阵营卡牌（魏/蜀/吴），点击选择后确认进入战斗。
 * 挂载于 FactionSelect.scene 的 Canvas 节点。
 */
import { _decorator, Component, Button, Label, Node, Color, sys, director } from 'cc';
import { hexToColor, FACTION_COLORS } from '../faction/FactionData';

const { ccclass, property } = _decorator;

interface FactionCard {
    factionId: string;
    displayName: string;
    description: string;
    color: string;
}

const FACTION_CARDS: FactionCard[] = [
    {
        factionId:   'wei',
        displayName: '魏',
        description: '重甲步兵 + 霹雳车\n对建筑伤害加成，防线坚固',
        color:       '#3366CC',
    },
    {
        factionId:   'shu',
        displayName: '蜀',
        description: '轻步兵 + 弩手\n机动灵活，弩手克制近战',
        color:       '#33AA44',
    },
    {
        factionId:   'wu',
        displayName: '吴',
        description: '轻装剑士 + 火弓手\n免疫河道减速，火箭附加灼烧',
        color:       '#CC3333',
    },
];

@ccclass('FactionSelectInit')
export class FactionSelectInit extends Component {
    /** 三张阵营卡的根节点（在编辑器中绑定） */
    @property([Node]) cardNodes: Node[] = [];
    /** 「确认」按钮 */
    @property(Button) btnConfirm: Button | null = null;

    private _selectedFaction: string = 'wei';
    /** 记录 cardNode 回调引用，供 onDestroy 移除 */
    private _cardHandlers: Array<() => void> = [];

    start(): void {
        // 初始化卡牌
        FACTION_CARDS.forEach((card, idx) => {
            const cardNode = this.cardNodes[idx];
            if (!cardNode) return;

            // 设置标题/描述（需要在编辑器中将 Label 命名为 'Title' 和 'Desc'）
            const title = cardNode.getChildByName('Title')?.getComponent(Label);
            const desc  = cardNode.getChildByName('Desc')?.getComponent(Label);
            if (title) { title.string = card.displayName; title.color = hexToColor(card.color); }
            if (desc)  desc.string  = card.description;

            // 保存 handler 引用以便 onDestroy 时移除，防止内存泄漏
            const handler = () => this._selectFaction(card.factionId, idx);
            this._cardHandlers[idx] = handler;
            cardNode.on(Node.EventType.TOUCH_END, handler, this);
        });

        this.btnConfirm?.node.on(Button.EventType.CLICK, this._onConfirm, this);
        this._selectFaction('wei', 0); // 默认选魏
    }

    onDestroy(): void {
        // 移除卡牌触摸监听，防止内存泄漏
        this.cardNodes.forEach((cardNode, idx) => {
            const handler = this._cardHandlers[idx];
            if (cardNode && handler) {
                cardNode.off(Node.EventType.TOUCH_END, handler, this);
            }
        });
        this._cardHandlers = [];
        this.btnConfirm?.node.off(Button.EventType.CLICK, this._onConfirm, this);
    }

    private _selectFaction(factionId: string, idx: number): void {
        this._selectedFaction = factionId;
        // 高亮选中卡牌（简单方案：放大选中、缩小其余）
        this.cardNodes.forEach((n, i) => {
            n.setScale(i === idx ? 1.05 : 1.0, i === idx ? 1.05 : 1.0, 1.0);
        });
    }

    private _onConfirm(): void {
        sys.localStorage.setItem('sgzf_player_faction', this._selectedFaction);
        director.loadScene('Battle');
    }
}
