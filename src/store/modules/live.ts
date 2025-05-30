import {defineStore} from "pinia"
import store from "../index";
import {useServerStore} from "./server";
import {computed} from "vue";
import {EnumServerStatus, ServerRecord} from "../../types/Server";
import {ObjectUtil} from "../../lib/util";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";
import {LiveStatusType} from "../../types/Live";
import {StorageService} from "../../service/StorageService";
import {VideoTemplateService} from "../../service/VideoTemplateService";
import {mapError} from "../../lib/error";

const serverStore = useServerStore()

const SCENE_ID = 'live'
const EMPTY_LIVE_STATUS = {
    id: SCENE_ID,
    status: 'stopped',
    statusMsg: '',
    avatar: {
        enable: false,
        width: 0,
        height: 0,
    },
    video: {
        enable: false,
        width: 0,
        height: 0,
    },
    audio: {
        enable: false,
    },
    avatars: [] as {
        id: string,
        title: string,
        url: string,
        status: 'init',
        statusMsg: '',
    }[],
    videoTitle: '',
    talkTitle: '',
    talkContent: '',
    avatarRtmp: "",
    avatarHls: "",
    videoRtmp: "",
    videoHls: "",
    audioRtmp: "",
    audioHls: "",
    runtime: {
        avatarStatus: "",
        avatarVideoFps: 0,
        avatarAudioFps: 0,
        videoStatus: "",
        videoVideoFps: 0,
        videoAudioFps: 0,
        audioStatus: "",
        audioFps: 0,
    },
}

export const liveStore = defineStore("live", {
    state: () => ({
        server: computed(() => {
            return serverStore.records.find(item => item.functions.includes('live')) as ServerRecord | undefined
        }) as any,
        available: computed(() => {
            const server = serverStore.records.find(item => item.functions.includes('live')) as ServerRecord | undefined
            return server && server.status === EnumServerStatus.RUNNING
        }),
        serverConfig: {
            ttsProviders: [] as {
                name: string,
                title: string,
                param: {
                    name: string,
                    type: string,
                    title: string,
                    [key: string]: any
                }[],
                setting: {
                    [key: string]: any
                }
            }[]
        },
        localConfig: {
            mode: 'avatar' as 'avatar' | 'audio',
            avatar: {
                width: 640,
                height: 480,
                avatarId: 0,
            },
            audio: {},
            video: {
                width: 640,
                height: 480,
            },
            config: {
                flowVideoMode: 'order' as 'order' | 'random',
                flowTalkMode: 'order' as 'order' | 'random',
                flowTalkDelayMin: 5,
                flowTalkDelayMax: 10,
                ttsProvider: '',
                ttsProviderParam: {} as {
                    [key: string]: any
                },
                ttsProviderSetting: {} as {
                    [key: string]: any
                },
                liveMonitorType: 'douyin',
                liveMonitorUrl: '',
            }
        },
        status: 'stopped' as LiveStatusType,
        statusMsg: '',
        liveStatusTimer: undefined as any,
        liveStatus: ObjectUtil.clone(EMPTY_LIVE_STATUS),
        liveRuntime: {
            liveMonitorEvent: null as any,
        },
        liveDataUpdateTimer: undefined as any,
    }),
    actions: {
        async init() {
            const localConfig = await window.$mapi.storage.get('live', 'config', {})
            this.localConfig.mode = localConfig.mode || this.localConfig.mode
            this.localConfig.avatar.width = localConfig.avatar?.width || this.localConfig.avatar.width
            this.localConfig.avatar.height = localConfig.avatar?.height || this.localConfig.avatar.height
            this.localConfig.avatar.avatarId = localConfig.avatar?.avatarId || this.localConfig.avatar.avatarId
            this.localConfig.video.width = localConfig.video?.width || this.localConfig.video.width
            this.localConfig.video.height = localConfig.video?.height || this.localConfig.video.height
            this.localConfig.config.flowVideoMode = localConfig.config?.flowVideoMode || this.localConfig.config.flowVideoMode
            this.localConfig.config.flowTalkMode = localConfig.config?.flowTalkMode || this.localConfig.config.flowTalkMode
            this.localConfig.config.flowTalkDelayMin = localConfig.config?.flowTalkDelayMin || this.localConfig.config.flowTalkDelayMin
            this.localConfig.config.flowTalkDelayMax = localConfig.config?.flowTalkDelayMax || this.localConfig.config.flowTalkDelayMax
            this.localConfig.config.ttsProvider = localConfig.config?.ttsProvider || this.localConfig.config.ttsProvider
            this.localConfig.config.ttsProviderParam = localConfig.config?.ttsProviderParam || this.localConfig.config.ttsProviderParam
            this.localConfig.config.liveMonitorType = localConfig.config?.liveMonitorType || this.localConfig.config.liveMonitorType
            this.localConfig.config.liveMonitorUrl = localConfig.config?.liveMonitorUrl || this.localConfig.config.liveMonitorUrl
            await this.statusUpdate()
        },
        async saveLocalConfig() {
            await window.$mapi.storage.set('live', 'config', ObjectUtil.clone(this.localConfig))
        },
        async onKnowledgeUpdate() {
            if (this.status !== 'running') {
                return
            }
            Dialog.tipSuccess(t('知识库更新，直播数据将会在30秒后更新'))
            if (this.liveDataUpdateTimer) {
                clearTimeout(this.liveDataUpdateTimer)
            }
            this.liveDataUpdateTimer = setTimeout(async () => {
                await this.update()
            }, 5 * 1000)
        },
        async statusUpdate() {
            // console.log('update live', JSON.stringify(this.server))
            if (this.liveStatusTimer) {
                clearTimeout(this.liveStatusTimer)
            }
            if (!this.server) {
                if (this.status !== 'stopped') {
                    this.status = 'stopped'
                    this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS)
                }
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000)
                return
            }
            // console.log('server', {
            //     serverInfo,
            //     server: ObjectUtil.clone(this.server),
            // })
            if (this.server.status !== EnumServerStatus.RUNNING) {
                this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS)
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000)
                return
            }
            const res = await this.apiRequest('status', {})
            // console.log('res', JSON.stringify(res, null, 2))
            if (res.code) {
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000)
                return
            }
            const data = res.data.scenes[0] || null

            if (data) {
                this.liveStatus.id = data.id || SCENE_ID
                this.liveStatus.status = data.status || 'stopped'
                this.liveStatus.statusMsg = data.statusMsg || ''
                this.liveStatus.avatar.enable = data.avatar.enable
                this.liveStatus.avatar.width = data.avatar.width
                this.liveStatus.avatar.height = data.avatar.height
                this.liveStatus.video.enable = data.video.enable
                this.liveStatus.video.width = data.video.width
                this.liveStatus.video.height = data.video.height
                this.liveStatus.audio.enable = data.audio.enable
                this.liveStatus.videoTitle = data.videoTitle
                this.liveStatus.talkTitle = data.talkTitle
                this.liveStatus.talkContent = data.talkContent
                this.liveStatus.avatarRtmp = data.avatarRtmp || ''
                this.liveStatus.avatarHls = data.avatarHls || ''
                this.liveStatus.videoRtmp = data.videoRtmp || ''
                this.liveStatus.videoHls = data.videoHls || ''
                this.liveStatus.audioRtmp = data.audioRtmp || ''
                this.liveStatus.audioHls = data.audioHls || ''
                this.liveStatus.runtime.avatarStatus = data.runtime.avatarStatus || ''
                this.liveStatus.runtime.avatarVideoFps = data.runtime.avatarVideoFps || 0
                this.liveStatus.runtime.avatarAudioFps = data.runtime.avatarAudioFps || 0
                this.liveStatus.runtime.videoStatus = data.runtime.videoStatus || ''
                this.liveStatus.runtime.videoVideoFps = data.runtime.videoVideoFps || 0
                this.liveStatus.runtime.videoAudioFps = data.runtime.videoAudioFps || 0
                this.liveStatus.runtime.audioStatus = data.runtime.audioStatus || ''
                this.liveStatus.runtime.audioFps = data.runtime.audioFps || 0
            } else {
                this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS)
            }
            if (this.liveStatus.status === 'stopped') {
                this.status = 'stopped'
            } else if (this.liveStatus.status === 'running') {
                this.status = 'running'
            }
            this.liveStatusTimer = setTimeout(this.statusUpdate, 5000)
        },
        async apiRequest(
            url: string,
            param: {
                [key: string]: any
            } = {}
        ) {
            const serverInfo = await serverStore.serverInfo(this.server)
            return await window.$mapi.server.callFunctionWithException(
                serverInfo,
                'apiRequest',
                {
                    id: 'live', url, param,
                }
            )
        },
        async configUpdate() {
            const res = await this.apiRequest('config', {})
            let ttsProviders: any[] = []
            if (0 === res.code) {
                ttsProviders = res.data.ttsProviders
            }
            for (const server of serverStore.records) {
                if (server.status !== EnumServerStatus.RUNNING) {
                    continue
                }
                if (!['server-live-indextts',].includes(server.name)) {
                    continue
                }
                const res = await window.$mapi.server.config(await serverStore.serverInfo(server))
                if (res.code) {
                    Dialog.tipError(mapError(res.msg))
                    continue
                }
                const setting = {}
                if (res.data.httpUrl) {
                    setting['httpUrl'] = res.data.httpUrl
                }
                const config = res.data
                let param = []
                if ('soundTts' in config.functions) {
                    param = config.functions.soundTts.param || []
                } else if ('soundClone' in config.functions) {
                    param = config.functions.soundClone.param || []
                }
                ttsProviders.push({
                    name: server.name,
                    title: server.title,
                    param: param,
                    setting: setting,
                })
            }
            // console.log('ttsProviders', ttsProviders)
            this.serverConfig.ttsProviders = ttsProviders
        },
        async buildData() {
            const avatars: any[] = []
            if (this.localConfig.mode === 'avatar') {
                const videoTemplate = await VideoTemplateService.get(this.localConfig.avatar.avatarId)
                if (!videoTemplate) {
                    throw '没有选择播放的数字人'
                }
                avatars.push({
                    id: 'Avatar' + videoTemplate.id,
                    title: videoTemplate.name,
                    url: videoTemplate.video,
                })
            }
            const flowVideos: any[] = []
            const storageFlowVideos = (await StorageService.list('LiveKnowledge')).filter(s => {
                return s.content.type === 'flowVideo' && s.content.enable
            })
            if (!(storageFlowVideos && storageFlowVideos.length > 0)) {
                throw '没有选择循环素材'
            }
            for (const s of storageFlowVideos) {
                flowVideos.push({
                    id: 'FlowVideo' + s.id,
                    title: s.title,
                    video: s.content.url,
                })
            }
            const flowTalks: any[] = []
            const storageFlowTalks = (await StorageService.list('LiveKnowledge')).filter(s => {
                return s.content.type === 'flowTalk' && s.content.enable
            })
            if (!(storageFlowTalks && storageFlowTalks.length > 0)) {
                throw '没有选择循环素材'
            }
            for (const s of storageFlowTalks) {
                s.content.replies = s.content.replies.map(r => {
                    return {
                        value: r.value,
                        sound: r.sound || '',
                    }
                })
                flowTalks.push({
                    id: 'FlowTalk' + s.id,
                    title: s.title,
                    talks: [
                        {value: s.content.reply, sound: '',},
                        ...s.content.replies
                    ],
                    video: s.content.url,
                    durationMode: s.content.durationMode,
                })
            }
            const users: any[] = []
            const systems: any[] = []
            const storageUsers = await StorageService.list('LiveKnowledge')
            for (const s of storageUsers) {
                if (!s.content.enable) {
                    continue
                }
                s.content.replies = s.content.replies.map(r => {
                    return {
                        value: r.value,
                        sound: r.sound || '',
                    }
                })
                if (s.content.type === 'user') {
                    users.push({
                        id: 'User' + s.id,
                        title: s.title,
                        talks: [
                            {value: s.content.reply, sound: ''},
                            ...s.content.replies
                        ],
                        keywords: s.content.keywords,
                        video: s.content.url,
                        durationMode: s.content.durationMode,
                    })
                } else if (s.content.type === 'system') {
                    systems.push({
                        id: 'System' + s.id,
                        title: s.title,
                        talks: [
                            {value: s.content.reply, sound: ''},
                            ...s.content.replies
                        ],
                        systemType: s.content.systemType,
                        video: s.content.url,
                        durationMode: s.content.durationMode,
                    })
                }
            }
            return {avatars, flowVideos, flowTalks, users, systems}
        },
        async update() {
            const configPost = {
                id: SCENE_ID,
                config: {
                    flowVideoMode: this.localConfig.config.flowVideoMode,
                    flowTalkMode: this.localConfig.config.flowTalkMode,
                    flowTalkDelayMin: this.localConfig.config.flowTalkDelayMin,
                    flowTalkDelayMax: this.localConfig.config.flowTalkDelayMax,
                },
                data: await this.buildData()
            }
            const res = await this.apiRequest('scene/update', {
                scene: ObjectUtil.clone(configPost)
            })
            if (res.code) {
                Dialog.tipError(t('更新失败') + ':' + res.msg)
            } else {
                Dialog.tipSuccess(t('直播知识库已更新'))
            }
        },
        async start() {
            await this.saveLocalConfig()
            // console.log('live.start', this.localConfig)
            const configPost = {
                id: SCENE_ID,
                avatar: {
                    enable: this.localConfig.mode === 'avatar',
                    width: this.localConfig.avatar.width,
                    height: this.localConfig.avatar.height,
                },
                audio: {
                    enable: this.localConfig.mode === 'audio',
                },
                video: {
                    enable: true,
                    width: this.localConfig.video.width,
                    height: this.localConfig.video.height,
                },
                config: {
                    flowVideoMode: this.localConfig.config.flowVideoMode,
                    flowTalkMode: this.localConfig.config.flowTalkMode,
                    flowTalkDelayMin: this.localConfig.config.flowTalkDelayMin,
                    flowTalkDelayMax: this.localConfig.config.flowTalkDelayMax,
                    ttsProvider: this.localConfig.config.ttsProvider,
                    ttsProviderParam: this.localConfig.config.ttsProviderParam,
                    ttsProviderSetting: this.localConfig.config.ttsProviderSetting,
                },
                data: await this.buildData()
            }
            const configPostContent = JSON.stringify(configPost, null, 2)
            await window.$mapi.file.write('data-live-last.json', configPostContent)
            this.status = 'starting'
            this.statusMsg = ''
            const res = await this.apiRequest('scene/start', {
                scene: ObjectUtil.clone(configPost)
            })
            if (res.code) {
                this.status = 'error'
                this.statusMsg = res.msg
                Dialog.tipError(t('启动失败') + ':' + res.msg)
                return
            }
        },
        async stop() {
            this.status = 'stopping'
            const res = await this.apiRequest('scene/stop', {sceneId: SCENE_ID})
            // console.log('live.stop', res)
            if (res.code) {
                this.status = 'error'
                this.statusMsg = res.msg
                Dialog.tipError(t('停止失败') + ':' + res.msg)
                return
            }
            this.statusMsg = ''
        },
        fireEvent(type, data) {
            this.apiRequest('scene/event', {sceneId: SCENE_ID, type, data})
        },
        onMonitorBroadcast(data: any) {
            // console.log('MonitorEvent', JSON.stringify(data))
            this.liveRuntime.liveMonitorEvent = data
            // {"type":"Comment","data":{"source":"douyin","username":"老*****","content":"111"}}
            StorageService.add('LiveEvent', {
                title: data.type,
                content: data.data
            })
            if (data.type === 'Enter') {
                this.fireEvent('Enter', {
                    username: data.data.username,
                })
            } else if (data.type === 'Like') {
                this.fireEvent('Like', {
                    username: data.data.username,
                })
            } else if (data.type === 'Comment') {
                this.fireEvent('Comment', {
                    content: data.data.content,
                    username: data.data.username,
                })
            }
        },
        async startMonitor() {
            if (!this.localConfig.config.liveMonitorUrl) {
                Dialog.tipError('请先设置直播间地址')
                return
            }
            await this.saveLocalConfig()
            window.__page.offBroadcast('MonitorEvent', this.onMonitorBroadcast)
            window.__page.onBroadcast('MonitorEvent', this.onMonitorBroadcast)
            await window.$mapi.app.windowOpen('monitor', {
                title: '直播监听',
                width: 1300,
                height: 800,
                url: this.localConfig.config.liveMonitorUrl,
                script: 'server/live_monitor_script',
                openDevTools: false,
                broadcastPages: ['main'],
            })
        },
        async stopMonitor() {
            await window.$mapi.app.windowClose('monitor')
        }
    }
})

const live = liveStore(store)
live.init().then(() => {
})

export const useLiveStore = () => {
    return live
}
