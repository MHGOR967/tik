const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// خريطة الدول لتحويل الرمز لاسم عربي وإنجليزي وعلم
const COUNTRY_MAP = {
    'SA': { name_ar: 'المملكة العربية السعودية', name_en: 'Saudi Arabia', flag: '🇸🇦' },
    'AE': { name_ar: 'الإمارات العربية المتحدة', name_en: 'United Arab Emirates', flag: '🇦🇪' },
    'KW': { name_ar: 'الكويت', name_en: 'Kuwait', flag: '🇰🇼' },
    'QA': { name_ar: 'قطر', name_en: 'Qatar', flag: '🇶🇦' },
    'BH': { name_ar: 'البحرين', name_en: 'Bahrain', flag: '🇧🇭' },
    'OM': { name_ar: 'سلطنة عُمان', name_en: 'Oman', flag: '🇴🇲' },
    'EG': { name_ar: 'مصر', name_en: 'Egypt', flag: '🇪🇬' },
    'IQ': { name_ar: 'العراق', name_en: 'Iraq', flag: '🇮🇶' },
    'JO': { name_ar: 'الأردن', name_en: 'Jordan', flag: '🇯🇴' },
    'MA': { name_ar: 'المغرب', name_en: 'Morocco', flag: '🇲🇦' },
    'DZ': { name_ar: 'الجزائر', name_en: 'Algeria', flag: '🇩🇿' },
    'YE': { name_ar: 'اليمن', name_en: 'Yemen', flag: '🇾🇪' },
    'SY': { name_ar: 'سوريا', name_en: 'Syria', flag: '🇸🇾' },
    'LB': { name_ar: 'لبنان', name_en: 'Lebanon', flag: '🇱🇧' },
    'US': { name_ar: 'الولايات المتحدة', name_en: 'United States', flag: '🇺🇸' },
    'CA': { name_ar: 'كندا', name_en: 'Canada', flag: '🇨🇦' },
    'GB': { name_ar: 'المملكة المتحدة', name_en: 'United Kingdom', flag: '🇬🇧' },
    'TR': { name_ar: 'تركيا', name_en: 'Turkey', flag: '🇹🇷' },
    'DE': { name_ar: 'ألمانيا', name_en: 'Germany', flag: '🇩🇪' },
    'FR': { name_ar: 'فرنسا', name_en: 'France', flag: '🇫🇷' }
};

// فك شفرة تاريخ إنشاء الحساب من الـ User ID
function getCreationDateFromId(userIdStr) {
    try {
        if (!userIdStr) return null;
        const bigIntId = BigInt(userIdStr);
        const timestampMs = Number(bigIntId >> 32n) * 1000;
        if (timestampMs > 1400000000000 && timestampMs < Date.now()) {
            return new Date(timestampMs).toISOString();
        }
    } catch (e) {}
    return null;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار الفحص المباشر عبر TikWM
app.get('/api/check', async (req, res) => {
    try {
        const usernameQuery = req.query.username;
        if (!usernameQuery) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم' });
        }

        const cleanUsername = usernameQuery.replace('@', '').trim().toLowerCase();

        // الاتصال المباشر بمحرك بيانات تيك توك الموثوق
        const response = await axios.get(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(cleanUsername)}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        const resData = response.data;

        if (resData && resData.code === 0 && resData.data) {
            const u = resData.data.user || {};
            const stats = resData.data.stats || {};

            const regCode = (u.region || 'SA').toUpperCase();
            const country = COUNTRY_MAP[regCode] || { name_ar: regCode, name_en: regCode, flag: '🌐' };

            const joinedDate = u.createTime 
                ? new Date(u.createTime * 1000).toISOString() 
                : getCreationDateFromId(u.id);

            return res.json({
                success: true,
                account: {
                    userId: u.id || '---',
                    secUid: u.secUid || '',
                    uniqueId: u.uniqueId || cleanUsername,
                    nickname: u.nickname || cleanUsername,
                    avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || '',
                    signature: u.signature || '',
                    verified: Boolean(u.verified),
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
                    followers: stats.followerCount || 0,
                    following: stats.followingCount || 0,
                    hearts: stats.heartCount || stats.heart || 0,
                    videos: stats.videoCount || 0
                }
            });
        } else {
            return res.status(404).json({
                success: false,
                message: resData.msg || 'الحساب غير موجود أو خاص أو تم تغييره.'
            });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء الاتصال بمحرك البحث، يرجى المحاولة بعد ثوانٍ.'
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
