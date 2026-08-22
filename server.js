const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// خريطة الدول الشاملة
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
    'US': { name_ar: 'الولايات المتحدة', name_en: 'United States', flag: '🇺🇸' },
    'CA': { name_ar: 'كندا', name_en: 'Canada', flag: '🇨🇦' },
    'GB': { name_ar: 'المملكة المتحدة', name_en: 'United Kingdom', flag: '🇬🇧' },
    'TR': { name_ar: 'تركيا', name_en: 'Turkey', flag: '🇹🇷' },
    'FR': { name_ar: 'فرنسا', name_en: 'France', flag: '🇫🇷' },
    'DE': { name_ar: 'ألمانيا', name_en: 'Germany', flag: '🇩🇪' }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار الفحص المضمون
app.get('/api/check', async (req, res) => {
    const rawUsername = req.query.username;
    if (!rawUsername) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم.' });
    }

    const username = rawUsername.replace('@', '').trim().toLowerCase();

    try {
        // استخدام خدمة API عامة ومستقرة لجلب معلومات الحساب الحقيقية والدولة
        const apiUrl = `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
            }
        });

        const data = response.data;

        if (data && data.code === 0 && data.data) {
            const userInfo = data.data.user || {};
            const statsInfo = data.data.stats || {};

            // استخراج الدولة برمزها الصحيح
            const regCode = (userInfo.region || userInfo.storeRegion || 'SA').toUpperCase();
            const country = COUNTRY_MAP[regCode] || { name_ar: regCode, name_en: regCode, flag: '🌐' };

            return res.json({
                success: true,
                account: {
                    userId: userInfo.id || 'غير متوفر',
                    uniqueId: userInfo.uniqueId || username,
                    nickname: userInfo.nickname || username,
                    avatar: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb || '',
                    signature: userInfo.signature || '',
                    verified: Boolean(userInfo.verified),
                    region: {
                        code: regCode,
                        nameAr: country.name_ar,
                        nameEn: country.name_en,
                        flag: country.flag
                    },
                    language: (userInfo.language || 'AR').toUpperCase(),
                    joinedAt: userInfo.createTime ? new Date(userInfo.createTime * 1000).toISOString() : null,
                    nicknameUpdatedAt: userInfo.nickNameModifyTime ? new Date(userInfo.nickNameModifyTime * 1000).toISOString() : null,
                    usernameUpdatedAt: userInfo.userModifyTime ? new Date(userInfo.userModifyTime * 1000).toISOString() : null
                },
                stats: {
                    followers: statsInfo.followerCount || 0,
                    following: statsInfo.followingCount || 0,
                    hearts: statsInfo.heartCount || statsInfo.heart || 0,
                    videos: statsInfo.videoCount || 0
                }
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم نتمكن من العثور على هذا الحساب. تأكد من صحة اليوزر.'
            });
        }

    } catch (error) {
        console.error('Fetch Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'حدث ضغط على السيرفر أو أن الحساب غير متاح حالياً. حاول مجدداً.'
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
    } catch (err) {
        console.warn('TikWM Provider Failed, falling back to TikTok Web Direct...', err.message);
    }

    // 2. المحاولة الاحتياطية الثانية: القراءة المباشرة من TikTok Web
    try {
        const directUrl = `https://www.tiktok.com/@${username}`;
        const webRes = await axios.get(directUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
            },
            timeout: 8000
        });

        const $ = cheerio.load(webRes.data);
        const rawJson = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html() || $('#SIGI_STATE').html();

        if (rawJson) {
            const parsed = JSON.parse(rawJson);
            const userScope = parsed?.defaultScope?.['user-detail']?.userInfo ||
                              parsed?.ItemModule?.[username] ||
                              parsed?.UserModule?.users?.[username];

            if (userScope && userScope.user) {
                const u = userScope.user;
                const st = userScope.stats || {};
                const regCode = (u.region || 'SA').toUpperCase();
                const country = COUNTRY_MAP[regCode] || { name_ar: regCode, name_en: regCode, flag: '🌐' };

                return res.json({
                    success: true,
                    account: {
                        userId: u.id || u.uid || '---',
                        uniqueId: u.uniqueId || username,
                        nickname: u.nickname || username,
                        avatar: u.avatarLarger || u.avatarMedium || '',
                        signature: u.signature || '',
                        verified: Boolean(u.verified),
                        region: {
                            code: regCode,
                            nameAr: country.name_ar,
                            nameEn: country.name_en,
                            flag: country.flag
                        },
                        language: (u.language || 'AR').toUpperCase(),
                        joinedAt: u.createTime ? new Date(u.createTime * 1000).toISOString() : parseUserIdCreationDate(u.id),
                        nicknameUpdatedAt: null,
                        usernameUpdatedAt: null
                    },
                    stats: {
                        followers: st.followerCount || 0,
                        following: st.followingCount || 0,
                        hearts: st.heartCount || st.heart || 0,
                        videos: st.videoCount || 0
                    }
                });
            }
        }
    } catch (directErr) {
        console.error('Direct fallback failed:', directErr.message);
    }

    // إذا فشلت الطريقتان
    return res.status(404).json({
        success: false,
        message: 'لم نتمكن من جلب بيانات الحساب في الوقت الحالي. تأكد من صحة اليوزر وحاول مجدداً.'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
