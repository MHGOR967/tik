/**
 * TikTok Inspector Backend - Render Deployment Edition
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// خدمة ملف index.html مباشرة من الجذر
app.use(express.static(__dirname));

// خريطة تحويل الرموز الدولية إلى أسماء وأعلام
const COUNTRY_MAP = {
    'SA': { name_ar: 'المملكة العربية السعودية', name_en: 'Saudi Arabia', flag: '🇸🇦' },
    'AE': { name_ar: 'الإمارات العربية المتحدة', name_en: 'United Arab Emirates', flag: '🇦🇪' },
    'KW': { name_ar: 'الكويت', name_en: 'Kuwait', flag: '🇰🇼' },
    'QA': { name_ar: 'قطر', name_en: 'Qatar', flag: '🇶🇦' },
    'BH': { name_ar: 'البحرين', name_en: 'Bahrain', flag: '🇧🇭' },
    'OM': { name_ar: 'سلطنة عُمان', name_en: 'Oman', flag: '🇴🇲' },
    'EG': { name_ar: 'جمهورية مصر العربية', name_en: 'Egypt', flag: '🇪🇬' },
    'IQ': { name_ar: 'العراق', name_en: 'Iraq', flag: '🇮🇶' },
    'JO': { name_ar: 'الأردن', name_en: 'Jordan', flag: '🇯🇴' },
    'MA': { name_ar: 'المغرب', name_en: 'Morocco', flag: '🇲🇦' },
    'DZ': { name_ar: 'الجزائر', name_en: 'Algeria', flag: '🇩🇿' },
    'TN': { name_ar: 'تونس', name_en: 'Tunisia', flag: '🇹🇳' },
    'LY': { name_ar: 'ليبيا', name_en: 'Libya', flag: '🇱🇾' },
    'SD': { name_ar: 'السودان', name_en: 'Sudan', flag: '🇸🇩' },
    'YE': { name_ar: 'اليمن', name_en: 'Yemen', flag: '🇾🇪' },
    'SY': { name_ar: 'سوريا', name_en: 'Syria', flag: '🇸🇾' },
    'LB': { name_ar: 'لبنان', name_en: 'Lebanon', flag: '🇱🇧' },
    'PS': { name_ar: 'فلسطين', name_en: 'Palestine', flag: '🇵🇸' },
    'US': { name_ar: 'الولايات المتحدة', name_en: 'United States', flag: '🇺🇸' },
    'CA': { name_ar: 'كندا', name_en: 'Canada', flag: '🇨🇦' },
    'GB': { name_ar: 'المملكة المتحدة', name_en: 'United Kingdom', flag: '🇬🇧' },
    'TR': { name_ar: 'تركيا', name_en: 'Turkey', flag: '🇹🇷' },
    'DE': { name_ar: 'ألمانيا', name_en: 'Germany', flag: '🇩🇪' },
    'FR': { name_ar: 'فرنسا', name_en: 'France', flag: '🇫🇷' }
};

// حساب تاريخ إنشاء الحساب التقريبي من TikTok User ID
function parseTikTokUserIdDate(userIdStr) {
    try {
        if (!userIdStr) return null;
        const bigIntId = BigInt(userIdStr);
        const timestamp = Number(bigIntId >> 32n) * 1000;
        if (timestamp > 1300000000000 && timestamp < Date.now()) {
            return new Date(timestamp).toISOString();
        }
    } catch (e) {
        return null;
    }
    return null;
}

// عرض الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار الفحص المباشر
app.get('/api/check', async (req, res) => {
    try {
        const usernameQuery = req.query.username;
        if (!usernameQuery) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم (Username).' });
        }

        const cleanUsername = usernameQuery.replace('@', '').trim().toLowerCase();
        const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;

        // طلب صفحة البروفايل بترويسات محاكاة المتصفح
        const response = await axios.get(profileUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // استخراج كتل بيانات JSON المدمجة
        let rawData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html() || $('#SIGI_STATE').html();

        if (!rawData) {
            $('script').each((i, el) => {
                const html = $(el).html() || '';
                if (html.includes('userInfo') && html.includes('uniqueId')) {
                    rawData = html;
                }
            });
        }

        if (!rawData) {
            return res.status(404).json({ success: false, message: 'تعذر العثور على بيانات هذا الحساب.' });
        }

        const parsed = JSON.parse(rawData);
        const userScope = parsed?.defaultScope?.['user-detail']?.userInfo ||
                          parsed?.ItemModule?.[cleanUsername] ||
                          parsed?.UserModule?.users?.[cleanUsername];

        if (!userScope || !userScope.user) {
            return res.status(404).json({ success: false, message: 'الحساب غير موجود أو تم حظره.' });
        }

        const u = userScope.user;
        const s = userScope.stats || {};

        const regCode = (u.region || u.storeRegion || 'US').toUpperCase();
        const country = COUNTRY_MAP[regCode] || { name_ar: regCode, name_en: regCode, flag: '🌐' };

        const joinedDate = u.createTime 
            ? new Date(u.createTime * 1000).toISOString() 
            : parseTikTokUserIdDate(u.id);

        return res.json({
            success: true,
            account: {
                userId: u.id || u.uid || '---',
                secUid: u.secUid || '',
                uniqueId: u.uniqueId || cleanUsername,
                nickname: u.nickname || cleanUsername,
                avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || '',
                signature: u.signature || '',
                verified: Boolean(u.verified),
                privateAccount: Boolean(u.privateAccount),
                region: {
                    code: regCode,
                    nameAr: country.name_ar,
                    nameEn: country.name_en,
                    flag: country.flag
                },
                language: (u.language || 'AR').toUpperCase(),
                joinedAt: joinedDate,
                nicknameUpdatedAt: u.nickNameModifyTime ? new Date(u.nickNameModifyTime * 1000).toISOString() : null,
                usernameUpdatedAt: u.userModifyTime ? new Date(u.userModifyTime * 1000).toISOString() : null
            },
            stats: {
                followers: s.followerCount || 0,
                following: s.followingCount || 0,
                hearts: s.heartCount || s.heart || 0,
                videos: s.videoCount || 0
            }
        });

    } catch (error) {
        console.error('Inspection Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الاتصال بسيرفرات تيك توك.',
            error: error.message 
        });
    }
});

// تشغيل الخادم والربط بالمنفذ المحدد من Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 TikTok Inspector Server is active on port ${PORT}`);
});


