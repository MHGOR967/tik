/**
 * TikTok USA Session Keeper & Inspector - Manual Field Entry Engine
 * Designed for manual key-value cookie inputs
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// تخزين خريطة الكوكيز في الذاكرة
let activeCookies = new Map([
    ['sessionid', '78534469621c1064eae0e17393022dee'],
    ['sessionid_ss', '78534469621c1064eae0e17393022dee'],
    ['sid_tt', '78534469621c1064eae0e17393022dee'],
    ['uid_tt', 'fbd7901c0a0c08059bc06472e3785ad033cf87296f0357a0c68570ff3810f533'],
    ['uid_tt_ss', 'fbd7901c0a0c08059bc06472e3785ad033cf87296f0357a0c68570ff3810f533'],
    ['store-country-code', 'us'],
    ['store-country-code-src', 'uid']
]);

let sessionState = {
    status: 'INITIALIZING', // INITIALIZING | LOGGED_IN | REJECTED | ERROR
    lastChecked: null,
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    errorMessage: null,
    account: null,
    serverIpInfo: null,
    cookieCount: activeCookies.size
};

const activityLogs = [];

function addLog(type, message) {
    const time = new Date().toLocaleTimeString('ar-SA');
    activityLogs.unshift({ id: Date.now(), time, type, message });
    if (activityLogs.length > 30) activityLogs.pop();
}

// بناء نص الهيدر من خريطة الكوكيز
function buildCookieHeader() {
    // التأكد من ضبط دولة المتجر على أمريكا لفرض الجلسة الأمريكية
    activeCookies.set('store-country-code', 'us');
    activeCookies.set('store-country-code-src', 'uid');

    const items = [];
    for (const [key, val] of activeCookies.entries()) {
        if (key && val && val.trim()) {
            items.push(`${key.trim()}=${val.trim()}`);
        }
    }
    sessionState.cookieCount = items.length;
    return items.join('; ');
}

// جلب معلومات IP السيرفر الأمريكي
async function fetchServerIpInfo() {
    try {
        const res = await axios.get('http://ip-api.com/json/', { timeout: 5000 });
        if (res.data && res.data.status === 'success') {
            sessionState.serverIpInfo = {
                ip: res.data.query,
                country: res.data.country,
                countryCode: res.data.countryCode,
                city: res.data.city,
                isp: res.data.isp
            };
            addLog('info', `عنوان IP السيرفر الحالي: ${res.data.query} (${res.data.country})`);
        }
    } catch (e) {
        console.error('IP info error:', e.message);
    }
}

// دالة إرسال النبضات وفحص تسجيل الدخول
async function sendSessionPing() {
    sessionState.totalPings++;
    sessionState.lastChecked = new Date().toISOString();

    const cookieHeader = buildCookieHeader();

    if (!activeCookies.has('sessionid') || !activeCookies.get('sessionid')) {
        sessionState.status = 'REJECTED';
        sessionState.errorMessage = 'يرجى إدخال قيمة sessionid على الأقل.';
        addLog('error', '❌ حقل sessionid مفقود.');
        return;
    }

    addLog('ping', `🚀 إرسال نبضة نشاط #${sessionState.totalPings} بـ IP أمريكا (${sessionState.cookieCount} كوكيز)...`);

    const endpoints = [
        'https://www.tiktok.com/passport/web/account/info/?aid=1459',
        'https://www.tiktok.com/api/user/detail/?aid=1988'
    ];

    let isAuthenticated = false;

    for (const url of endpoints) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.tiktok.com/',
                    'Cookie': cookieHeader
                },
                timeout: 9000
            });

            const resData = response.data;

            // مسار Passport
            if (resData && resData.data && (resData.data.user_id || resData.data.username)) {
                const p = resData.data;
                sessionState.status = 'LOGGED_IN';
                sessionState.successfulPings++;
                sessionState.errorMessage = null;

                sessionState.account = {
                    userId: p.user_id || '---',
                    uniqueId: p.username || p.screen_name || '---',
                    nickname: p.screen_name || p.username || '---',
                    avatar: p.avatar_url || p.avatar_thumb?.url_list?.[0] || '',
                    region: (p.country_code || p.region || 'US').toUpperCase(),
                    language: (p.language || 'AR').toUpperCase(),
                    verified: Boolean(p.is_verified),
                    followers: p.followers_count || 0,
                    following: p.following_count || 0,
                    hearts: p.heart_count || 0,
                    videos: p.video_count || 0
                };

                addLog('success', `✅ تم تأكيد نشاط الجلسة للحساب: @${sessionState.account.uniqueId} | المنطقة: ${sessionState.account.region}`);
                isAuthenticated = true;
                break;
            }

            // مسار User Detail
            if (resData && resData.userInfo && resData.userInfo.user) {
                const u = resData.userInfo.user;
                const st = resData.userInfo.stats || {};

                sessionState.status = 'LOGGED_IN';
                sessionState.successfulPings++;
                sessionState.errorMessage = null;

                sessionState.account = {
                    userId: u.id || u.uid,
                    uniqueId: u.uniqueId,
                    nickname: u.nickname,
                    avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || '',
                    region: (u.region || 'US').toUpperCase(),
                    language: (u.language || 'AR').toUpperCase(),
                    verified: Boolean(u.verified),
                    followers: st.followerCount || 0,
                    following: st.followingCount || 0,
                    hearts: st.heartCount || st.heart || 0,
                    videos: st.videoCount || 0
                };

                addLog('success', `✅ الجلسة نشطة ومستقرة للحساب: @${u.uniqueId} | المنطقة: ${u.region || 'US'}`);
                isAuthenticated = true;
                break;
            }

        } catch (e) {
            console.log(`Endpoint check error (${url}):`, e.message);
        }
    }

    if (!isAuthenticated) {
        sessionState.status = 'REJECTED';
        sessionState.failedPings++;
        sessionState.errorMessage = 'تيك توك يطلب قيم الكوكيز الأساسية المتبقية. يرجى إدخال ttwid و sid_tt و msToken من المتصفح.';
        addLog('error', `❌ تم رفض الجلسة (Login expired). ادخل الكوكيز الإضافية من تطبيق Cookie Editor.`);
    }
}

fetchServerIpInfo();
setTimeout(sendSessionPing, 2000);

// تكرار النبضات بشكل مستمر كل 18 إلى 28 ثانية
function scheduleLoop() {
    const delay = Math.floor(Math.random() * (28000 - 18000 + 1)) + 18000;
    setTimeout(() => {
        sendSessionPing().finally(scheduleLoop);
    }, delay);
}
scheduleLoop();

// --- مسارات الـ API ---

app.get('/api/session-status', (req, res) => {
    const cookieObject = {};
    for (const [k, v] of activeCookies.entries()) {
        cookieObject[k] = v;
    }

    res.json({
        success: true,
        cookieCount: activeCookies.size,
        cookies: cookieObject,
        sessionState,
        activityLogs
    });
});

app.post('/api/trigger-ping', async (req, res) => {
    await sendSessionPing();
    res.json({ success: true, sessionState, activityLogs });
});

// استقبال التحديث اليدوي للحقول
app.post('/api/update-manual-cookies', async (req, res) => {
    const { fields, customPairs } = req.body;

    if (!fields || typeof fields !== 'object') {
        return res.status(400).json({ success: false, message: 'بيانات غير صالحة.' });
    }

    activeCookies.clear();

    // إضافة الحقول الرئيسية
    if (fields.sessionid) {
        activeCookies.set('sessionid', fields.sessionid.trim());
        activeCookies.set('sessionid_ss', fields.sessionid.trim());
        activeCookies.set('sid_tt', fields.sid_tt ? fields.sid_tt.trim() : fields.sessionid.trim());
    }

    if (fields.ttwid) activeCookies.set('ttwid', fields.ttwid.trim());
    if (fields.uid_tt) {
        activeCookies.set('uid_tt', fields.uid_tt.trim());
        activeCookies.set('uid_tt_ss', fields.uid_tt.trim());
    }
    if (fields.msToken) activeCookies.set('msToken', fields.msToken.trim());
    if (fields.odin_tt) activeCookies.set('odin_tt', fields.odin_tt.trim());

    // إضافة الكوكيز المخصصة الإضافية التي أدخلها المستخدم
    if (Array.isArray(customPairs)) {
        customPairs.forEach(pair => {
            if (pair && pair.key && pair.value) {
                activeCookies.set(pair.key.trim(), pair.value.trim());
            }
        });
    }

    addLog('info', `🔄 تم حفظ ${activeCookies.size} كوكي يدوياً واختبارها.`);
    await sendSessionPing();

    res.json({ success: true, message: 'تم حفظ الكوكيز وإرسال نبضة فحص بنجاح.', sessionState });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Active on Port ${PORT}`);
});

