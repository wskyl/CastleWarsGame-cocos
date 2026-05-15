/**
 * ObjectPool.ts
 * 通用对象池 —— 管理 Cocos Creator Node 实例，供士兵、抛射物等频繁创建/销毁的对象使用。
 * 使用方式：
 *   const pool = new ObjectPool(creator, 20);  // creator 返回 Node
 *   const node = pool.get();
 *   pool.put(node);
 */
import { Node } from 'cc';

export type NodeCreator = () => Node;

export class ObjectPool {
    private _pool: Node[] = [];
    private _creator: NodeCreator;
    private _maxSize: number;

    /**
     * @param creator  无参函数，返回一个全新 Node（组件已添加，但处于非激活状态）
     * @param initSize 预热池大小
     * @param maxSize  池容量上限（超出则直接销毁归还节点）
     */
    constructor(creator: NodeCreator, initSize: number = 0, maxSize: number = 100) {
        this._creator = creator;
        this._maxSize = maxSize;
        // 预热
        for (let i = 0; i < initSize; i++) {
            const node = this._creator();
            node.active = false;
            this._pool.push(node);
        }
    }

    /** 从池中取出一个节点（激活并返回） */
    get(): Node {
        let node: Node;
        if (this._pool.length > 0) {
            node = this._pool.pop()!;
        } else {
            node = this._creator();
        }
        node.active = true;
        return node;
    }

    /** 将节点归还池中（停用节点，不销毁） */
    put(node: Node): void {
        if (!node || !node.isValid) return;
        node.active = false;
        if (this._pool.length < this._maxSize) {
            this._pool.push(node);
        } else {
            node.destroy();
        }
    }

    /** 当前池中空闲节点数量 */
    get freeCount(): number {
        return this._pool.length;
    }

    /** 清空并销毁所有池内节点 */
    clear(): void {
        for (const node of this._pool) {
            if (node && node.isValid) node.destroy();
        }
        this._pool.length = 0;
    }
}
