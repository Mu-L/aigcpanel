export const ffprobeGetMediaDuration = async (media: string, ms: boolean = false): Promise<number> => {
    const info = await $mapi.app.spawnBinary("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        media,
    ]);
    const duration = parseFloat(info.trim());
    if (isNaN(duration)) {
        throw "Could not retrieve media duration";
    }
    return ms ? Math.ceil(duration * 1000) : duration;
};

export const ffprobeVideoInfo = async (
    video: string
): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
}> => {
    const info = await $mapi.app.spawnBinary("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate,duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        video,
    ]);
    const lines = info
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);
    if (lines.length < 4) {
        throw "Could not retrieve video info";
    }
    const width = parseInt(lines[0], 10);
    const height = parseInt(lines[1], 10);
    const fpsParts = lines[2].split("/");
    const fps = fpsParts.length === 2 ? parseFloat(fpsParts[0]) / parseFloat(fpsParts[1]) : parseFloat(lines[2]);
    const duration = parseFloat(lines[3]);
    if (isNaN(width) || isNaN(height) || isNaN(fps) || isNaN(duration)) {
        throw "Invalid video info data";
    }
    return {duration, width, height, fps};
};

export const ffprobeAudioInfo = async (audio: string): Promise<{
    duration: number;
    sampleRate: number;
    channels: number;
}> => {
    const info = await $mapi.app.spawnBinary("ffprobe", [
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels,duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio,
    ]);
    const lines = info.split("\n").map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 3) {
        throw "Could not retrieve audio info";
    }
    const sampleRate = parseInt(lines[0], 10);
    const channels = parseInt(lines[1], 10);
    const duration = parseFloat(lines[2]);
    if (isNaN(sampleRate) || isNaN(channels) || isNaN(duration)) {
        throw "Invalid audio info data";
    }
    return {duration, sampleRate, channels};
}
