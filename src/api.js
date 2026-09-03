// src/api.js
// 统一网络请求封装 —— 超时控制 / 自动重试(指数退避) / 错误归一化
// ====================================================================
// 【设计要点】
//   - 所有业务请求走 request(),统一 8 秒超时(AbortController)
//   - 仅对"网络层失败"(断网/超时/服务器 5xx)重试,指数退避 0.8s → 1.6s
//   - HTTP 4xx 属业务错误(如验证码错误),不重试,直接抛给调用方展示
//   - 错误对象统一挂 .status(HTTP 状态码,网络错误为 0),调用方据此分流
//   - POST /api/visit 携带 uuid 幂等键,重试不会导致统计虚增
// ====================================================================

const DEFAULT_TIMEOUT = 8000;
const MAX_RETRIES = 2;

async function request(path, { method = 'GET', body = null, timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const res = await fetch(path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const err = new Error(data.detail || data.error || `请求失败 (HTTP ${res.status})`);
                err.status = res.status;
                throw err;  // 业务错误:不重试
            }
            return data;

        } catch (err) {
            lastError = err;
            const isNetworkError = err.name === 'AbortError' || err.status === undefined;
            const isServerError = err.status >= 500;

            if ((isNetworkError || isServerError) && attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 800 * 2 ** attempt)); // 0.8s, 1.6s
                continue;
            }
            if (err.status === undefined) {
                err.status = 0;  // 归一化:网络不可达
                err.message = '服务器无法连接';
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError;
}

export const api = {
    /** 统计概览 */
    getStats: () => request('/api/stats', { retries: 1 }),

    /** 获取图形验证码 {captchaId, svg} */
    getCaptcha: () => request('/api/captcha', { retries: 1 }),

    /** 进入星系上报(幂等,可安全重试) */
    submitVisit: (payload) => request('/api/visit', { method: 'POST', body: payload, retries: 1 }),

    /** 最近记录明细(管理页用) */
    getVisits: (limit = 100) => request(`/api/visits?limit=${limit}`, { retries: 1 }),
};
