/**
 * TikTok USA Session Keeper & Account Inspector Backend
 * Built for Render / Node.js Deployment
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

// السيشن ايدي الافتراضي المحدد من المستخدم
let CURRENT_SESSION_ID = process.env.TIKTOK_SESSION_ID || '78534469621c1064eae0e17393022dee';

// حالة الجلسة والسجلات المباشرة
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

// سجل أحدث 20 عملية
const activityLogs = [];

function addLog(type, message) {
    const time = new Date().toLocaleTimeString('ar-SA');
    activityLogs.unshift({ id: Date.now(), time, type, message });
    if (activityLogs.length > 25) activityLogs.pop();
}

// قائمة المسارات لتنويع النبضات وإلغاء التكشيف
const TIKTOK_ENDPOINTS = [
    'https://www.tiktok.com/api/user/detail/?aid=1988',
    'https://www.tiktok.com/api/notice/multi/?aid=1988',
    'https://www.tiktok.com/api/recommend/item_list/?aid=1988&count=2'
];

// جلب معلومات IP السيرفر
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
            addLog('info', `تم رصد IP السيرفر: ${res.data.query} (${res.data.country})`);
        }
    } catch (e) {
        console.error('Failed to fetch server IP:', e.message);
    }
}

// دالة إرسال النبضة وفحص الجلسة
async function sendSessionPing() {
    sessionState.totalPings++;
    sessionState.lastChecked = new Date().toISOString();

    if (!CURRENT_SESSION_ID || CURRENT_SESSION_ID.trim() === '') {
        sessionState.status = 'REJECTED';
        sessionState.errorMessage = 'لم يتم تقديم Session ID صالح.';
        addLog('error', '❌ فشل النبض: Session ID مفقود.');
        return;
    }

    const endpointUrl = TIKTOK_ENDPOINTS[sessionState.totalPings % TIKTOK_ENDPOINTS.length];

    try {
        addLog('ping', `🚀 إرسال نبضة نشاط #${sessionState.totalPings} بـ IP أمريكا...`);

        const response = await axios.get(endpointUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Cookie': `sessionid=${CURRENT_SESSION_ID.trim()};`
            },
            timeout: 10000
        });

        const resData = response.data;

        // التحقق من نجاح قراءة الحساب
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

            addLog('success', `✅ تسجيل دخول ناجح للحساب: @${u.uniqueId} | المنطقة المسجلة: ${u.region || 'US'}`);
        } else if (resData && resData.status_code === 0) {
            sessionState.status = 'LOGGED_IN';
            sessionState.successfulPings++;
            addLog('success', `⚡ تم تأكيد حيوية الجلسة واستجابة تيك توك بنجاح.`);
        } else {
            // تفسير سبب الرفض
            sessionState.status = 'REJECTED';
            sessionState.failedPings++;

            let reason = 'السيشن ايدي منتهي الصلاحية أو تم تسجيل الخروج من الحساب.';
            if (resData && resData.status_code === 10006) {
                reason = 'تم حظر الجلسة مؤقتاً أو طلب كابتشا من تيك توك.';
            } else if (resData && resData.status_msg) {
                reason = `رسالة النظام: ${resData.status_msg}`;
            }

            sessionState.errorMessage = reason;
            addLog('error', `❌ تم رفض الجلسة: ${reason}`);
        }

    } catch (error) {
        sessionState.status = 'ERROR';
        sessionState.failedPings++;

        let cause = error.message;
        if (error.response) {
            cause = `استجابة السيرفر (${error.response.status}): ${error.response.statusText}`;
        }

        sessionState.errorMessage = cause;
        addLog('error', `⚠️ خطأ شبكة أثناء النبض: ${cause}`);
    }
}

// جلب معلومات IP فور التشغيل
fetchServerIpInfo();

// تشغيل النبضة الأولى فوراً
setTimeout(sendSessionPing, 3000);

// تكرار النبضات بشكل مستمر كل 18 إلى 30 ثانية
function scheduleNextPing() {
    const delay = Math.floor(Math.random() * (30000 - 18000 + 1)) + 18000;
    setTimeout(() => {
        sendSessionPing().finally(scheduleNextPing);
    }, delay);
}
scheduleNextPing();

// --- مسارات الـ API للواجهة ---

// جلب الحالة الشاملة
app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        sessionIdMasked: CURRENT_SESSION_ID ? `${CURRENT_SESSION_ID.substring(0, 8)}...${CURRENT_SESSION_ID.slice(-4)}` : 'غير محدد',
        sessionState,
        activityLogs
    });
});

// تنفيذ نبضة يدوية فورية
app.post('/api/trigger-ping', async (req, res) => {
    await sendSessionPing();
    res.json({ success: true, message: 'تم إرسال النبضة بنجاح.', sessionState, activityLogs });
});

// تحديث الـ Session ID من الواجهة
app.post('/api/update-session', async (req, res) => {
    const { newSessionId } = req.body;
    if (!newSessionId || newSessionId.trim() === '') {
        return res.status(400).json({ success: false, message: 'يرجى تزويد Session ID جديد.' });
    }

    CURRENT_SESSION_ID = newSessionId.trim();
    addLog('info', '🔄 تم تحديث الـ Session ID من لوحة التحكم.');
    await sendSessionPing();

    res.json({ success: true, message: 'تم تحديث الـ Session ID وفحصه بنجاح.', sessionState });
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 TikTok USA Keeper Active on Port ${PORT}`);
    console.log(`=================================================`);
});

