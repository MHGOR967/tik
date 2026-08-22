const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// دالة تحويل رمز الدولة إلى إيموجي علم الدولة
function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

// مسار API لجلب بيانات IP السيرفر الحقيقية لحظياً
app.get('/api/server-info', async (req, res) => {
    try {
        // إضافة timestamp لتفادي الكاش وضمان جلب الـ IP الفعلي في نفس اللحظة
        const response = await axios.get(`http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query&_t=${Date.now()}`, {
            timeout: 7000
        });

        if (response.data && response.data.status === 'success') {
            const data = response.data;
            return res.json({
                success: true,
                ip: data.query,
                country: data.country,
                countryCode: data.countryCode,
                flag: getFlagEmoji(data.countryCode),
                regionName: data.regionName,
                city: data.city,
                zip: data.zip || '---',
                lat: data.lat,
                lon: data.lon,
                timezone: data.timezone,
                isp: data.isp,
                org: data.org || data.as || '---',
                checkedAt: new Date().toLocaleTimeString('ar-SA')
            });
        } else {
            return res.status(500).json({ success: false, message: 'فشل في استرداد بيانات IP السيرفر.' });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء الاتصال بخدمة تحديد الموقع الجغرافي.',
            error: error.message
        });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
