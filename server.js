/**
 * TikTok Mobile API Session Keeper
 * Uses TikTok iOS Mobile Endpoints (aid=1233 / aid=1459) to work with sessionid ONLY
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// السيشن ايدي الخاص بك
let CURRENT_SESSION_ID = process.env.TIKTOK_SESSION_ID || '78534469621c1064eae0e17393022dee';

let sessionState = {
    status: 'INITIALIZING', // INITIALIZING | LOGGED_IN | REJECTED | ERROR
    lastChecked: null,
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    errorMessage: null,
    account: null,
    serverIpInfo: null
};

const activityLogs = [];

function addLog(type, message) {
    const time = new Date().toLocaleTimeString('ar-SA');
    activityLogs.unshift({ id: Date.now(), time, type, message });
    if (activityLogs.length > 30) activityLogs.pop();
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
            addLog('info', `عنوان IP السيرفر: ${res.data.query} (${res.data.country})`);
        }
    } catch (e) {
        console.error('IP fetch error:', e.message);
    }
}

/**
 * دالة جلب بيانات الحساب وتأكيد الجلسة باستخدام مسارات Mobile API
 * نفس المسار الذي تستخدمه بوتات التليجرام بـ sessionid فقط
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

    addLog('ping', `🚀 إرسال نبضة نشاط #${sessionState.totalPings} بـ IP أمريكا عبر Mobile API...`);

    // مسارات تطبيق الآيفون/الموبايل المباشرة
    const mobileEndpoints = [
        'https://api16-normal-c-useast1a.tiktokv.com/passport/web/account/info/?aid=1233',
        'https://www.tiktok.com/passport/web/account/info/?aid=1459',
        'https://api-h2.tiktokv.com/passport/web/account/info/?aid=1233'
    ];

    // بناء الكوكي المتوافق مع الموبايل بـ sessionid فقط
    const mobileCookie = `sessionid=${cleanSession}; sessionid_ss=${cleanSession}; sid_tt=${cleanSession}; store-country-code=us;`;

    let authenticated = false;

    for (const endpoint of mobileEndpoints) {
        try {
            const response = await axios.get(endpoint, {
                headers: {
                    'User-Agent': 'TikTok 30.0.0 rv:300013 (iPhone; iOS 16.5; ar_SA) Cronet',
                    'Accept': 'application/json',
                    'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8',
                    'Cookie': mobileCookie
                },
                timeout: 10000
            });

            const resData = response.data;

            // إذا أرجع السيرفر بيانات الحساب بنجاح (مثل البوت)
            if (resData && resData.data && (resData.data.user_id || resData.data.username)) {
                const p = resData.data;

                sessionState.status = 'LOGGED_IN';
                sessionState.successfulPings++;
                sessionState.errorMessage = null;

                // تحويل تاريخ الإنشاء إن وجد
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

                addLog('success', `✅ تم تسجيل الدخول بنجاح للحساب: @${sessionState.account.uniqueId} | المنطقة: ${sessionState.account.region}`);
                authenticated = true;
                break;
            } else if (resData && resData.message === 'error' && resData.data?.description) {
                sessionState.errorMessage = resData.data.description;
            }
        } catch (e) {
            console.log(`Endpoint attempt failed (${endpoint}):`, e.message);
        }
    }

    if (!authenticated) {
        sessionState.status = 'REJECTED';
        sessionState.failedPings++;

        if (!sessionState.errorMessage) {
            sessionState.errorMessage = 'السيشن ايدي منتهي الصلاحية أو تم تسجيل الخروج من الحساب.';
        }

        addLog('error', `❌ تم رفض الجلسة: ${sessionState.errorMessage}`);
    }
}

fetchServerIpInfo();
setTimeout(sendSessionPing, 2000);

// تكرار النبضات المتواصلة كل 18 إلى 28 ثانية
function scheduleLoop() {
    const delay = Math.floor(Math.random() * (28000 - 18000 + 1)) + 18000;
    setTimeout(() => {
        sendSessionPing().finally(scheduleLoop);
    }, delay);
}
scheduleLoop();

// --- مسارات ה-API ---

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        sessionIdMasked: CURRENT_SESSION_ID ? `${CURRENT_SESSION_ID.substring(0, 8)}...${CURRENT_SESSION_ID.slice(-4)}` : 'غير محدد',
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
        return res.status(400).json({ success: false, message: 'يرجى تقديم Session ID جديد.' });
    }

    CURRENT_SESSION_ID = newSessionId.trim();
    addLog('info', '🔄 تم تحديث الـ Session ID واختباره.');
    await sendSessionPing();

    res.json({ success: true, message: 'تم التحديث بنجاح.', sessionState });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`TikTok Mobile Session Keeper Active on Port ${PORT}`);
});

