# SEO Checklist (12 ข้อ) — เกณฑ์มาตรฐาน WEBSEOMAKE

site-builder-agent ต้องทำให้ครบ · site-reviewer-agent ให้คะแนน n/12 · FAIL ถ้าตกข้อ ★ (core)

| # | ข้อ | เกณฑ์ผ่าน | Core |
|---|-----|-----------|------|
| 1 | **Title** | ทุกหน้ามี `<title> `เฉพาะตัว ≤ 60 ตัวอักษร มี keyword หลัก | ★ |
| 2 | **Meta description** | ทุกหน้า ≤ 160 ตัว ชวนคลิก มี keyword | ★ |
| 3 | **Canonical** | ทุกหน้า มี canonical URL ชี้ตัวเอง (absolute) | |
| 4 | **Open Graph + Twitter** | og:title/description/image/url + twitter:card ครบ | ★ |
| 5 | **OG image** | มีรูป OG จริง 1200×630 ต่อหน้าหลัก | |
| 6 | **sitemap.xml** | app/sitemap.ts ออก URL ทุกหน้า | ★ |
| 7 | **robots.txt** | app/robots.ts allow + ชี้ sitemap | ★ |
| 8 | **JSON-LD LocalBusiness** | schema valid: name, address, telephone, openingHours, geo, priceRange | ★ |
| 9 | **Headings** | h1 เดียว/หน้า, ลำดับ h1→h2→h3 ถูก | |
| 10 | **Image alt** | ทุกรูปมี alt สื่อความหมาย (ไม่ว่าง, ไม่ใช่ชื่อไฟล์) | |
| 11 | **Performance** | next/image, font `display:swap`, ไม่มี render-blocking, LCP ok | |
| 12 | **hreflang** | ถ้าเว็บ 2 ภาษา → hreflang TH/EN + x-default | |

## Local SEO เพิ่มเติม (ธุรกิจบริการ)
- NAP (Name/Address/Phone) ตรงกันทุกจุด + ตรงกับ Google Business Profile
- ฝัง Google Maps + ปุ่มโทร/LINE ที่กดได้บนมือถือ
- keyword แบบ "บริการ + พื้นที่" (เช่น "คลินิกทันตกรรม ลาดพร้าว")
- รีวิว/rating แสดงผล + ใส่ใน JSON-LD aggregateRating