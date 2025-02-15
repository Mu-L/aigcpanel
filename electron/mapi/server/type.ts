import api from './api'

export type ServerApiType = typeof api

export type ServerInfo = {
    localPath: string,
    name: string,
    version: string,
    setting: {
        [key: string]: any,
    },
    logFile: string,
}

export type ServerContext = {
    _url: () => string,
    ServerInfo: ServerInfo | null,
}
