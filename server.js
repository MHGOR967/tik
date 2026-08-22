const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
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
