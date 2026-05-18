/**
 * AudioManager.ts
 * 音效/背景音乐管理器单例（第二阶段框架）。
 * 本阶段提供接口与占位实现，具体音频资源待美术/音频团队交付后接入。
 * 挂载于 Battle 场景的 AudioRoot 节点。
 */
import { _decorator, Component, AudioSource, resources, AudioClip } from 'cc';

const { ccclass, property } = _decorator;

/** 音效类型枚举 */
export enum SFX {
    SWORD_HIT    = 'sfx_sword_hit',
    ARROW_SHOOT  = 'sfx_arrow_shoot',
    TROOP_DEATH  = 'sfx_troop_death',
    BUILDING_HIT = 'sfx_building_hit',
    BUILDING_DESTORY = 'sfx_building_destroy',
    GOLD_EARN    = 'sfx_gold_earn',
    ALTAR_CAPTURE = 'sfx_altar_capture',
    GENERAL_SKILL = 'sfx_general_skill',
    VICTORY      = 'sfx_victory',
    DEFEAT       = 'sfx_defeat',
}

@ccclass('AudioManager')
export class AudioManager extends Component {
    private static _inst: AudioManager | null = null;
    static get inst(): AudioManager | null { return AudioManager._inst; }

    @property(AudioSource) bgmSource:  AudioSource | null = null;
    @property(AudioSource) sfxSource:  AudioSource | null = null;

    /** 主音量（0~1） */
    private _masterVolume: number = 1.0;
    private _bgmVolume:    number = 0.6;
    private _sfxVolume:    number = 0.8;
    private _muted:        boolean = false;

    /** 已缓存的音频资源（路径 → clip） */
    private _clips: Map<string, AudioClip> = new Map();

    onLoad(): void { AudioManager._inst = this; }
    onDestroy(): void { if (AudioManager._inst === this) AudioManager._inst = null; }

    // ─── BGM 控制 ─────────────────────────────────────────────────────
    /** 播放背景音乐（循环） */
    playBGM(clipPath: string): void {
        // TODO: 加载 assets/audio/bgm/<clipPath>.mp3 并播放
        console.log(`[AudioManager] playBGM: ${clipPath} (资源待接入)`);
    }

    stopBGM(): void {
        this.bgmSource?.stop();
    }

    // ─── SFX 控制 ─────────────────────────────────────────────────────
    /** 播放音效（非循环） */
    playSFX(sfx: SFX | string): void {
        if (this._muted) return;
        // TODO: 从 assets/audio/sfx/<sfx>.mp3 加载并播放
        console.log(`[AudioManager] playSFX: ${sfx} (资源待接入)`);
    }

    // ─── 音量控制 ─────────────────────────────────────────────────────
    setMasterVolume(v: number): void {
        this._masterVolume = Math.max(0, Math.min(1, v));
        if (this.bgmSource) this.bgmSource.volume = this._bgmVolume * this._masterVolume;
        if (this.sfxSource) this.sfxSource.volume = this._sfxVolume * this._masterVolume;
    }

    setMuted(muted: boolean): void {
        this._muted = muted;
        if (this.bgmSource) this.bgmSource.volume = muted ? 0 : this._bgmVolume * this._masterVolume;
    }

    get isMuted(): boolean { return this._muted; }
    get masterVolume(): number { return this._masterVolume; }
}
