import {TaskBiz} from "../store/modules/task";
import {useServerStore} from "../store/modules/server";
import {SoundTtsService} from "../service/SoundTtsService";
import {result} from "lodash-es";

const serverStore = useServerStore()

const prepareData = async (bizId, bizParam) => {
    const record = await SoundTtsService.get(bizId as any)
    // console.log('SoundTts.runFunc.record', record)
    if (!record) {
        throw new Error('record not found')
    }
    const server = await serverStore.getByNameVersion(record.serverName, record.serverVersion)
    // console.log('SoundTts.runFunc.server', server)
    if (!server) {
        throw new Error('server not found')
    }
    return {
        record,
        server,
    }
}
export const SoundTts: TaskBiz = {

    restore: async () => {
        await SoundTtsService.restoreForTask()
    },

    runFunc: async (bizId, bizParam) => {
        // console.log('SoundTts.runFunc', {bizId, bizParam})
        const {record, server} = await prepareData(bizId, bizParam)
        const serverInfo = await serverStore.serverInfo(server)
        // console.log('SoundTts.runFunc.serverInfo', serverInfo)
        await SoundTtsService.update(bizId as any, {
            status: 'wait',
        })
        const res = await window.$mapi.server.callFunctionWithException(serverInfo, 'soundTts', {
            id: `SoundTts_${bizId}`,
            text: record.text,
            param: record.param,
            result: record.result,
        })
        // console.log('SoundTts.runFunc.res', res)
        if (res.code) {
            throw res.msg || 'SoundTts run fail'
        }
        switch (res.data.type) {
            case 'success':
                await SoundTtsService.update(bizId as any, {
                    status: 'success',
                    jobResult: res,
                })
                return 'success'
            case 'querying':
                return 'querying'
            case 'retry':
                return 'retry'
        }
        throw new Error('unknown res.data.type')
    },
    queryFunc: async (bizId, bizParam) => {
        // console.log('SoundTts.queryFunc', {bizId, bizParam})
        const {record, server} = await prepareData(bizId, bizParam)
        const serverInfo = await serverStore.serverInfo(server)
        const res = await window.$mapi.server.callFunctionWithException(serverInfo, 'query', {
            id: `SoundTts_${bizId}`,
            result: record.result,
        })
        if (res.code) {
            throw res.msg || 'SoundTts query fail'
        }
        // console.log('SoundTts.queryFunc.res', res)
        switch (res.data.type) {
            case 'success':
                await SoundTtsService.update(bizId as any, {
                    status: 'success',
                    jobResult: res,
                })
                return 'success'
            case 'running':
                return 'running'
        }
        return 'fail'
    },
    successFunc: async (bizId, bizParam) => {
        // console.log('SoundTts.successFunc', {bizId, bizParam})
        const {record, server} = await prepareData(bizId, bizParam)
        const resultWav = await SoundTtsService.saveResultWav(record, record.jobResult.data.data.filePath)
        // console.log('SoundTts.successFunc.resultWav', resultWav)
        await SoundTtsService.update(bizId as any, {
            status: 'success',
            endTime: Date.now(),
            resultWav: resultWav
        })
    },
    failFunc: async (bizId, msg, bizParam) => {
        // console.log('SoundTts.failFunc', {bizId, bizParam, msg})
        // const {record, server} = await prepareData(bizId, bizParam)
        await SoundTtsService.update(bizId as any, {
            status: 'fail',
            statusMsg: msg,
            endTime: Date.now(),
        })
    },

    update: async (bizId, update) => {
        if ('result' in update) {
            const record = await SoundTtsService.get(bizId as any)
            if (record) {
                update.result = Object.assign({}, record.result, update.result)
            }
        }
        await SoundTtsService.update(bizId as any, update)
    }
}
