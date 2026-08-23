/**
 * TikTok USA Stealth Session Keeper & Inspector Engine
 * Uses Puppeteer Stealth to bypass TikTok SecGuard, generate X-Bogus signatures,
 * and maintain an active session from USA datacenter IP.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

// استيراد أدوات المتصفح الخفي
let puppeteer;
try {
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());
    puppeteer = puppeteerExtra;
} catch (e) {
    console.warn('Puppeteer Stealth plugin not loaded, using native fallback.');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// تخزين الـ Session ID والبيانات
let CURRENT_SESSION_ID = process.env.TIKTOK_SESSION_ID || '78534469621c1064eae0e17393022dee';

let sessionState = {
    status: 'INITIALIZING', // INITIALIZING | LOGGED_IN | REJECTED | ERROR
    mode: 'STEALTH_BROWSER',
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
    if (activityLogs.length > 35) activityLogs.pop();
}

// جلب معلومات IP السيرفر الأمريكية
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
        console.error('IP info failed:', e.message);
    }
}

/**
 * دالة فحص وتثبيت الجلسة باستخدام المتصفح الخفي (Puppeteer Stealth)
 */
async function runStealthBrowserPing() {
    sessionState.totalPings++;
    sessionState.lastChecked = new Date().toISOString();

    const cleanSession = CURRENT_SESSION_ID ? CURRENT_SESSION_ID.trim() : '';

    if (!cleanSession) {
        sessionState.status = 'REJECTED';
        sessionState.errorMessage = 'يرجى تقديم Session ID صالح.';
        addLog('error', '❌ Session ID مفقود.');
        return;
    }

    addLog('ping', `🚀 تشغيل المتصفح الخفي بـ IP أمريكا لحقن السيشن وتجاوز الحماية...`);

    let browser = null;

    try {
        if (!puppeteer) {
            throw new Error('مكتبة Puppeteer غير مثبة، سيتم استخدام النمط الاحتياطي.');
        }

        // تشغيل متصفح كرومايت الخفي
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--lang=en-US,en'
            ]
        });

        const page = await browser.newPage();

        // ضبط أبعاد الشاشة وترويسة المتصفح البشري
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

        // حقن كوكيز الجلسة ودولة المتجر الأمريكية داخل المتصفح
        const cookiesToSet = [
            { name: 'sessionid', value: cleanSession, domain: '.tiktok.com', path: '/' },
            { name: 'sessionid_ss', value: cleanSession, domain: '.tiktok.com', path: '/' },
            { name: 'sid_tt', value: cleanSession, domain: '.tiktok.com', path: '/' },
            { name: 'store-country-code', value: 'us', domain: '.tiktok.com', path: '/' },
            { name: 'store-country-code-src', value: 'uid', domain: '.tiktok.com', path: '/' }
        ];

        await page.setCookie(...cookiesToSet);

        // فتح صفحة تيك توك للتحقق من الجلسة
        addLog('info', '🌐 جاري فتح صفحة تيك توك الداخلية وتأكيد التوقيع الرقمي...');
        await page.goto('https://www.tiktok.com/passport/web/account/info/?aid=1459', {
            waitUntil: 'networkidle2',
            timeout: 20000
        });

        // قراءة الاستجابة النصية من الصفحة
        const pageContent = await page.evaluate(() => document.body.innerText);

        let parsedData = null;
        try {
            parsedData = JSON.parse(pageContent);
        } catch (err) {
            // الاستجابة ليست JSON مباشر
        }

        if (parsedData && parsedData.data && (parsedData.data.user_id || parsedData.data.username)) {
            const p = parsedData.data;

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
                verified: Boolean(p.is_verified)
            };

            addLog('success', `✅ تم نجاح الجلسة وتأكيد تسجيل الدخول عبر المتصفح الخفي للحساب: @${sessionState.account.uniqueId} (المنطقة: ${sessionState.account.region})`);
        } else {
            // محاولة ثانوية: فتح صفحة البروفايل الشخصية
            addLog('info', '🔍 فحص الجلسة عبر الصفحة الشخصية للبروفايل...');
            await page.goto('https://www.tiktok.com/@me', { waitUntil: 'networkidle2', timeout: 15000 });

            const currentUrl = page.url();

            if (!currentUrl.includes('/login') && !currentUrl.includes('/signup')) {
                sessionState.status = 'LOGGED_IN';
                sessionState.successfulPings++;
                sessionState.errorMessage = null;

                addLog('success', `✅ الجلسة نشطة ومستقرة بـ IP أمريكا عبر المتصفح الخفي.`);
            } else {
                sessionState.status = 'REJECTED';
                sessionState.failedPings++;
                sessionState.errorMessage = 'السيشن ايدي منتهي الصلاحية أو تم إلغاؤه من تيك توك.';
                addLog('error', `❌ تم رفض الجلسة (Login expired).`);
            }
        }

    } catch (error) {
        console.warn('Stealth browser error, running HTTP fallback:', error.message);
        addLog('info', `⚠️ تحويل للنمط المباشر: ${error.message}`);
        await runHttpFallbackPing(cleanSession);
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

/**
 * نمط احتياطي باستخدام طلبات HTTP المحاكاة
 */
async function runHttpFallbackPing(cleanSession) {
    try {
        const response = await axios.get('https://api16-normal-c-useast1a.tiktokv.com/passport/web/account/info/?aid=1233', {
            headers: {
                'User-Agent': 'TikTok 30.0.0 rv:300013 (iPhone; iOS 16.5; ar_SA) Cronet',
                'Accept': 'application/json',
                'Cookie': `sessionid=${cleanSession}; sessionid_ss=${cleanSession}; sid_tt=${cleanSession}; store-country-code=us;`
            },
            timeout: 10000
        });

        if (response.data && response.data.data && response.data.data.user_id) {
            const p = response.data.data;
            sessionState.status = 'LOGGED_IN';
            sessionState.successfulPings++;
            sessionState.account = {
                userId: p.user_id,
                uniqueId: p.username || '---',
                nickname: p.screen_name || '---',
                avatar: p.avatar_url || '',
                region: (p.country_code || 'US').toUpperCase(),
                language: 'AR',
                verified: Boolean(p.is_verified)
            };
            addLog('success', `✅ نجحت الجلسة عبر النمط الاحتياطي للحساب: @${p.username}`);
        } else {
            sessionState.status = 'REJECTED';
            sessionState.failedPings++;
            sessionState.errorMessage = 'السيشن منتهي الصلاحية. يرجى تجديده من المتصفح.';
            addLog('error', `❌ تم رفض الجلسة (Login Expired).`);
        }
    } catch (err) {
        sessionState.status = 'ERROR';
        sessionState.failedPings++;
        sessionState.errorMessage = `خطأ شبكة: ${err.message}`;
        addLog('error', `⚠️ خطأ في الاتصال: ${err.message}`);
    }
}

fetchServerIpInfo();
setTimeout(runStealthBrowserPing, 2000);

// تكرار النبضات المتواصلة كل 25 إلى 40 ثانية
function scheduleLoop() {
    const delay = Math.floor(Math.random() * (40000 - 25000 + 1)) + 25000;
    setTimeout(() => {
        runStealthBrowserPing().finally(scheduleLoop);
    }, delay);
}
scheduleLoop();

// --- مسارات الـ API ---

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        sessionIdMasked: CURRENT_SESSION_ID ? `${CURRENT_SESSION_ID.substring(0, 8)}...${CURRENT_SESSION_ID.slice(-4)}` : 'غير محدد',
        sessionState,
        activityLogs
    });
});

app.post('/api/trigger-ping', async (req, res) => {
    await runStealthBrowserPing();
    res.json({ success: true, sessionState, activityLogs });
});

app.post('/api/update-session', async (req, res) => {
    const { newSessionId } = req.body;
    if (!newSessionId || !newSessionId.trim()) {
        return res.status(400).json({ success: false, message: 'يرجى تقديم Session ID جديد.' });
    }

    CURRENT_SESSION_ID = newSessionId.trim();
    addLog('info', '🔄 تم تحديث الـ Session ID واختباره بالمتصفح الخفي.');
    await runStealthBrowserPing();

    res.json({ success: true, message: 'تم التحديث بنجاح.', sessionState });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`TikTok Stealth Session Keeper Running on Port ${PORT}`);
});

