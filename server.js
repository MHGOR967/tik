/**
 * TikTok USA Active Session Keeper - Oxylabs Proxy Pre-Configured
 * Built for Render / Node.js Deployment
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// رابط بروكسي Oxylabs الخاص بك مدمج مسبقاً كخيار افتراضي
const OXYLABS_PROXY_URL = 'http://user-iwahm_5Kddd-country-US:pX_sp7ZhSs4hlyJ@dc.oxylabs.io:8000';

let CURRENT_SESSION_ID = process.env.TIKTOK_SESSION_ID || '78534469621c1064eae0e17393022dee';
let CURRENT_PROXY_URL = process.env.VPN_PROXY_URL || OXYLABS_PROXY_URL;

let sessionState = {
    status: 'INITIALIZING', // INITIALIZING | LOGGED_IN | REJECTED | ERROR
    lastChecked: null,
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    errorMessage: null,
    account: null,
    activeProxyIp: null,
    proxyLocation: null
};

const activityLogs = [];

function addLog(type, message) {
    const time = new Date().toLocaleTimeString('ar-SA');
    activityLogs.unshift({ id: Date.now(), time, type, message });
    if (activityLogs.length > 35) activityLogs.pop();
}

/**
 * تجهيز وكيل الاتصال الموجه عبر بروكسي Oxylabs
 */
function getProxyAgent() {
    if (!CURRENT_PROXY_URL || !CURRENT_PROXY_URL.trim()) {
        return null;
    }

    const proxyStr = CURRENT_PROXY_URL.trim();
    try {
        if (proxyStr.startsWith('socks')) {
            return new SocksProxyAgent(proxyStr);
        } else {
            return new HttpsProxyAgent(proxyStr.startsWith('http') ? proxyStr : `http://${proxyStr}`);
        }
    } catch (e) {
        addLog('error', `⚠️ خطأ في وكيل الاتصال: ${e.message}`);
        return null;
    }
}

/**
 * فحص وتأكيد عنوان الـ IP الخارج من خلال بروكسي Oxylabs
 */
async function checkEgressIp() {
    const agent = getProxyAgent();
    const axiosConfig = { timeout: 10000 };
    if (agent) {
        axiosConfig.httpsAgent = agent;
        axiosConfig.httpAgent = agent;
    }

    try {
        const res = await axios.get('http://ip-api.com/json/', axiosConfig);
        if (res.data && res.data.status === 'success') {
            sessionState.activeProxyIp = res.data.query;
            sessionState.proxyLocation = `${res.data.country} (${res.data.countryCode}) - ${res.data.isp}`;
            
            if (agent) {
                addLog('success', `🌐 الاتصال يمر عبر Oxylabs US Proxy! IP: ${res.data.query} [${res.data.country} - ${res.data.isp}]`);
            } else {
                addLog('info', `🌐 الاتصال مباشر بدون بروكسي: ${res.data.query}`);
            }
        }
    } catch (e) {
        console.error('Proxy IP check failed:', e.message);
        addLog('error', `⚠️ تعذر التحقق من IP بروكسي Oxylabs: ${e.message}`);
    }
}

/**
 * دالة إرسال نبضة الجلسة وتأكيد حيوية الحساب عبر Oxylabs Proxy
 */
async function sendSessionPing() {
    sessionState.totalPings++;
    sessionState.lastChecked = new Date().toISOString();

    const cleanSession = CURRENT_SESSION_ID ? CURRENT_SESSION_ID.trim() : '';

    if (!cleanSession) {
        sessionState.status = 'REJECTED';
        sessionState.errorMessage = 'يرجى تقديم Session ID صالح.';
        addLog('error', '❌ Session ID مفقود.');
        return;
    }

    await checkEgressIp();

    addLog('ping', `🚀 إرسال نبضة نشاط #${sessionState.totalPings} عبر Oxylabs US Proxy...`);

    const agent = getProxyAgent();
    const requestHeaders = {
        'User-Agent': 'TikTok 30.0.0 rv:300013 (iPhone; iOS 16.5; ar_SA) Cronet',
        'Accept': 'application/json',
        'Cookie': `sessionid=${cleanSession}; sessionid_ss=${cleanSession}; sid_tt=${cleanSession}; store-country-code=us;`
    };

    const mobileEndpoints = [
        'https://api16-normal-c-useast1a.tiktokv.com/passport/web/account/info/?aid=1233',
        'https://www.tiktok.com/passport/web/account/info/?aid=1459'
    ];

    let authenticated = false;

    for (const endpoint of mobileEndpoints) {
        try {
            const config = {
                headers: requestHeaders,
                timeout: 12000
            };

            if (agent) {
                config.httpsAgent = agent;
                config.httpAgent = agent;
            }

            const response = await axios.get(endpoint, config);
            const resData = response.data;

            if (resData && resData.data && (resData.data.user_id || resData.data.username)) {
                const p = resData.data;

                sessionState.status = 'LOGGED_IN';
                sessionState.successfulPings++;
                sessionState.errorMessage = null;

                let createdDateStr = 'غير محدد';
                if (p.create_time) {
                    createdDateStr = new Date(p.create_time * 1000).toLocaleString('ar-SA');
                }

                sessionState.account = {
                    userId: p.user_id || '---',
                    uniqueId: p.username || p.screen_name || '---',
                    nickname: p.screen_name || p.username || '---',
                    avatar: p.avatar_url || p.avatar_thumb?.url_list?.[0] || '',
                    email: p.email || 'غير معلن',
                    mobile: p.mobile || 'غير معلن',
                    createdAt: createdDateStr,
                    region: (p.country_code || p.region || 'US').toUpperCase(),
                    language: (p.language || 'AR').toUpperCase(),
                    verified: Boolean(p.is_verified)
                };

                addLog('success', `✅ تم تأكيد نشاط الجلسة للحساب: @${sessionState.account.uniqueId} | المنطقة: ${sessionState.account.region}`);
                authenticated = true;
                break;
            }
        } catch (e) {
            console.log(`Endpoint attempt error (${endpoint}):`, e.message);
        }
    }

    if (!authenticated) {
        sessionState.status = 'REJECTED';
        sessionState.failedPings++;
        sessionState.errorMessage = 'السيشن ايدي غير صالح أو انتهت صلاحيته.';
        addLog('error', `❌ تم رفض الجلسة (Login expired). جدد الـ sessionid من المتصفح.`);
    }
}

// التشغيل التلقائي عند إقلاع السيرفر
checkEgressIp();
setTimeout(sendSessionPing, 2500);

// تكرار النبضات المتواصلة كل 20 إلى 35 ثانية
function scheduleLoop() {
    const delay = Math.floor(Math.random() * (35000 - 20000 + 1)) + 20000;
    setTimeout(() => {
        sendSessionPing().finally(scheduleLoop);
    }, delay);
}
scheduleLoop();

// --- مسارات الـ API للواجهة ---

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        sessionIdMasked: CURRENT_SESSION_ID ? `${CURRENT_SESSION_ID.substring(0, 8)}...${CURRENT_SESSION_ID.slice(-4)}` : 'غير محدد',
        proxyUrlMasked: CURRENT_PROXY_URL ? CURRENT_PROXY_URL.replace(/:([^:@]+)@/, ':****@') : 'بدون بروكسي',
        sessionState,
        activityLogs
    });
});

app.post('/api/trigger-ping', async (req, res) => {
    await sendSessionPing();
    res.json({ success: true, sessionState, activityLogs });
});

app.post('/api/update-session', async (req, res) => {
    const { newSessionId } = req.body;
    if (!newSessionId || !newSessionId.trim()) {
        return res.status(400).json({ success: false, message: 'يرجى تقديم Session ID.' });
    }

    CURRENT_SESSION_ID = newSessionId.trim();
    addLog('info', '🔄 تم تحديث الـ Session ID واختباره عبر بروكسي Oxylabs.');
    await sendSessionPing();

    res.json({ success: true, message: 'تم التحديث بنجاح.', sessionState });
});

app.post('/api/update-proxy', async (req, res) => {
    const { proxyUrl } = req.body;
    CURRENT_PROXY_URL = proxyUrl ? proxyUrl.trim() : OXYLABS_PROXY_URL;

    addLog('info', '🔌 تم تحديث رابط البروكسي وإعادة اختباره.');
    await sendSessionPing();

    res.json({ success: true, message: 'تم تحديث إعدادات البروكسي.', sessionState });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`TikTok Oxylabs Keeper Server Active on Port ${PORT}`);
});

