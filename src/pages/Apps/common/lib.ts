import {TaskRunResult} from "./type";
import {TaskChangeType, useTaskStore} from "../../../store/modules/task";
import {TaskRecord, TaskService} from "../../../service/TaskService";
import {t} from "../../../lang";

const taskStore = useTaskStore();

export const createTaskRunResult = async (
    taskId: string,
    successCallback: (data: Record<string, any>, task: TaskRecord) => void
) => {
    const task = await TaskService.get(taskId);
    if (!task) {
        throw t("任务不存在");
    }
    const biz = task.biz;
    return () => {
        return new Promise<TaskRunResult>(resolve => {
            const callback = (bizId: string, type: TaskChangeType) => {
                if (bizId !== taskId) {
                    return;
                }
                TaskService.get(bizId).then(task => {
                    if (!task) {
                        resolve({code: -1, msg: t("任务不存在")});
                        taskStore.offChange(biz, callback);
                        return;
                    }
                    if (task.status === 'success') {
                        const data = {status: 'success'};
                        successCallback(data, task);
                        resolve({
                            code: 0,
                            msg: 'ok',
                            data: data,
                        } as TaskRunResult);
                        taskStore.offChange(biz, callback);
                        return;
                    }
                    if (task.status === 'pause') {
                        resolve({
                            code: 0,
                            msg: '',
                            data: {status: 'pause'}
                        });
                        taskStore.offChange(biz, callback);
                        return;
                    }
                    if (task.status === 'fail') {
                        resolve({code: -1, msg: task.statusMsg || t("任务失败")});
                        taskStore.offChange(biz, callback);
                        return;
                    }
                }).catch(error => {
                    resolve({code: -1, msg: '' + error || t("任务获取失败")});
                    taskStore.offChange(biz, callback);
                })
            }
            taskStore.onChange(biz, callback);
            callback(taskId, null!);
        })
    }
}
