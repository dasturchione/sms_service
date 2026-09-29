# SMS Gateway API — tenantlar uchun qo'llanma

Bu hujjat sizning backend'ingizni SMS platformaga ulash uchun. Barcha so'rovlar JSON, barcha
javoblar JSON.

```
Base URL:  https://<platforma-manzili>/api/v1
```

Mundarija:

1. [Autentifikatsiya](#1-autentifikatsiya)
2. [Ommaviy yuborish — `POST /sms/bulk`](#2-ommaviy-yuborish--post-smsbulk) ← asosiy usul
3. [Bitta SMS — `POST /sms`](#3-bitta-sms--post-sms)
4. [Holatni tekshirish va bekor qilish](#4-holatni-tekshirish-va-bekor-qilish)
5. [SMS holatlari](#5-sms-holatlari)
6. [Webhook'lar](#6-webhooklar)
7. [Qayta urinish va `Idempotency-Key`](#7-qayta-urinish-va-idempotency-key)
8. [Xatolar](#8-xatolar)
9. [Limitlar](#9-limitlar)

---

## 1. Autentifikatsiya

Platforma administratori sizga ikkita qiymat beradi: `clientId` va `clientSecret`. Secret faqat
bir marta ko'rsatiladi, uni xavfsiz joyda saqlang va hech qachon frontend yoki mobil ilovaga
qo'ymang.

Ularni access token'ga almashtirasiz:

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "clientId": "cli_...",
  "clientSecret": "..."
}
```

```json
{
  "data": {
    "accessToken": "oat_...",
    "tokenType": "Bearer",
    "expiresAt": "2026-10-29T10:00:00.000+05:00",
    "abilities": ["sms:send", "sms:read"]
  }
}
```

Token **30 kun** amal qiladi. Uni saqlab, har bir so'rovda yuboring:

```http
Authorization: Bearer oat_...
```

Har so'rovdan oldin yangi token olmang. `401` javobi kelganda yangisini oling.

Token sizib chiqqan deb gumon qilsangiz, uni darhol bekor qiling:

```http
POST /api/v1/auth/token/revoke
Authorization: Bearer oat_...
```

**Ruxsatlar (abilities).** Token faqat sizga berilgan amallarni bajara oladi:

| Ruxsat | Nima uchun |
|---|---|
| `sms:send` | SMS yuborish |
| `sms:read` | SMS holatini o'qish, ro'yxat |
| `sms:cancel` | Navbatdagi SMS'ni bekor qilish |
| `report:read` | Kunlik hisobotlar |
| `balance:read` | O'zingizga biriktirilgan SIM balanslari |
| `webhook:manage` | Webhook manzillarini boshqarish |

Ruxsat yetishmasa `403` qaytadi. Kerakli ruxsatni administratordan so'rang.

---

## 2. Ommaviy yuborish — `POST /sms/bulk`

**Ko'p SMS yuborishning asosiy usuli.** Har bir raqam uchun alohida so'rov yubormang: bitta so'rovda
1000 tagacha xabar yuboring. Har xabarning o'z raqami va o'z matni bo'ladi.

```http
POST /api/v1/sms/bulk
Authorization: Bearer oat_...
Content-Type: application/json
Idempotency-Key: qarz-eslatma-2026-09-29

[
  { "to": "+998921324567", "message": "Sizning Test do'konidan 2000 so'm qarzingiz bor" },
  { "to": "+998911234567", "message": "Sizning Test2 do'konidan 50 000 so'm qarzingiz bor" }
]
```

Body massivning o'zi yoki `{ "messages": [ ... ] }` bo'lishi mumkin — ikkalasi bir xil ishlaydi.

**Har bir element maydonlari:**

| Maydon | Majburiy | Tavsif |
|---|---|---|
| `to` | ha | Qabul qiluvchi raqam. `+998901234567`, `998901234567`, `901234567` — hammasi qabul qilinadi |
| `message` | ha | Matn, 1600 belgigacha. Uzunligi 10 SMS qismidan oshmasligi kerak |
| `reference` | yo'q | O'zingizning ID'ingiz (masalan buyurtma yoki qarz raqami), 128 belgigacha. Webhook'da qaytadi, u bo'yicha qidirish mumkin |
| `priority` | yo'q | `high`, `normal` (standart), `low`. Navbatda `high` birinchi ketadi |
| `expiresIn` | yo'q | Soniyalarda, 30 dan 86400 gacha. Shu vaqt ichida yuborilmasa, SMS umuman yuborilmaydi. Tasdiqlash kodlari uchun foydali |
| `operator` | yo'q | Faqat shu operator SIM'i orqali yuborish: `ucell`, `beeline`, `mobiuz`, `uztelecom`, `humans` |
| `gatewayUid` | yo'q | Faqat shu qurilma orqali yuborish (administrator beradi) |

**Javob** — `202 Accepted`. Natija har bir element uchun, so'rovdagi tartibda:

```json
{
  "data": [
    {
      "index": 0,
      "to": "+998921324567",
      "accepted": true,
      "duplicate": false,
      "message": {
        "uid": "sms_01K6...",
        "status": "queued",
        "recipient": "+998921324567",
        "message": "Sizning Test do'konidan •••• so'm qarzingiz bor",
        "reference": null,
        "segments": 1,
        "encoding": "gsm7",
        "priority": "normal",
        "attempts": 0,
        "maxAttempts": 3,
        "error": null,
        "queuedAt": "2026-09-29T10:00:00.000+05:00",
        "sentAt": null,
        "deliveredAt": null,
        "failedAt": null,
        "expiresAt": null,
        "createdAt": "2026-09-29T10:00:00.000+05:00",
        "updatedAt": "2026-09-29T10:00:00.000+05:00"
      },
      "error": null
    },
    {
      "index": 1,
      "to": "12345",
      "accepted": false,
      "duplicate": false,
      "message": null,
      "error": {
        "code": "INVALID_NUMBER",
        "message": "The recipient number is not a valid phone number",
        "details": { "recipient": "12345" }
      }
    }
  ],
  "meta": { "requested": 2, "accepted": 1, "rejected": 1 }
}
```

Muhim qoidalar:

- **Har element mustaqil.** Noto'g'ri raqam yoki juda uzun matn faqat o'sha elementni rad etadi,
  qolganlari navbatga tushadi. Shuning uchun `202` kelgani hamma xabar qabul qilindi degani
  emas — har elementning `accepted` maydonini tekshiring.
- **`uid` ni saqlang.** Keyinchalik holatni so'rash va webhook'larni o'z yozuvlaringizga bog'lash uchun
  `index` orqali o'z elementingizni toping va `message.uid` ni yonida saqlang.
- **Takror.** Bir so'rovda bir xil raqamga **bir xil matn** ikki marta kelsa, faqat birinchisi
  yuboriladi, qolgani `DUPLICATE_RECIPIENT` bilan rad etiladi. Raqam qanday yozilgani ahamiyatsiz:
  `901234567` va `+998901234567` bitta abonent. Bir raqamga **har xil** matnlar esa normal yuboriladi.
- **`202` — yetkazildi degani emas.** Bu platforma xabarni qabul qilib navbatga qo'ydi degani.
  Yakuniy natijani webhook orqali oling (6-bo'lim).
- **`message` maydoni** javobda raqamlari `•` bilan yashirilgan yoki `null` bo'lishi mumkin — bu
  sizning tenant sozlamangizga bog'liq (tasdiqlash kodlari loglarda qolmasligi uchun). Matn abonentga
  baribir to'liq yuboriladi.

1000 dan ko'p xabar bo'lsa, ro'yxatni 1000 talik bo'laklarga bo'lib, ketma-ket yuboring.

> **`POST /sms/batch`** ham mavjud va `{ "messages": [...] }` ko'rinishidagi xuddi shunday body'ni
> qabul qiladi, lekin 100 tagacha va sekinroq. Yangi integratsiyalar uchun `/sms/bulk` ni ishlating.

---

## 3. Bitta SMS — `POST /sms`

Bitta xabar uchun, masalan tasdiqlash kodi:

```http
POST /api/v1/sms
Authorization: Bearer oat_...
Content-Type: application/json
Idempotency-Key: otp-user-481-attempt-1

{
  "to": "+998901234567",
  "message": "Tasdiqlash kodi: 483921",
  "priority": "high",
  "expiresIn": 300
}
```

Maydonlar ommaviy yuborishdagi element bilan bir xil. Javob — `202`, bitta xabar `data` ichida:

```json
{ "data": { "uid": "sms_01K6...", "status": "queued", "...": "..." } }
```

Bir xil `Idempotency-Key` bilan qayta yuborilsa — `200` va o'sha xabar qaytadi, yangi SMS
yaratilmaydi.

---

## 4. Holatni tekshirish va bekor qilish

**Bitta xabar** (`sms:read`):

```http
GET /api/v1/sms/sms_01K6...
```

**Ro'yxat** (`sms:read`), yangilari birinchi:

```http
GET /api/v1/sms?status=failed&reference=qarz-1042&limit=50
```

| Parametr | Tavsif |
|---|---|
| `status` | Holat bo'yicha filtr (5-bo'lim) |
| `reference` | Sizning `reference` qiymatingiz bo'yicha |
| `recipient` | Raqam bo'yicha (istalgan ko'rinishda yozish mumkin) |
| `from`, `to` | Yaratilgan vaqt oralig'i, ISO 8601 |
| `limit` | 1–200, standart 50 |
| `cursor` | Keyingi sahifa: oldingi javobdagi `meta.nextCursor` |

```json
{ "data": [ ... ], "meta": { "nextCursor": "10492" } }
```

`nextCursor` `null` bo'lsa — boshqa sahifa yo'q.

**Bekor qilish** (`sms:cancel`):

```http
POST /api/v1/sms/sms_01K6.../cancel
```

Faqat hali qurilmaga berilmagan xabarni bekor qilish mumkin (`queued` yoki `assigned`). Telefonga
yetib borgan SMS'ni qaytarib bo'lmaydi — bu holda `409` qaytadi.

**Hisobotlar** (`report:read`):

```http
GET /api/v1/reports/summary?from=2026-09-01&to=2026-09-29
GET /api/v1/reports/daily?from=2026-09-01&to=2026-09-29
```

---

## 5. SMS holatlari

| Holat | Ma'nosi | Yakuniymi |
|---|---|---|
| `queued` | Qabul qilindi, navbatda | yo'q |
| `assigned` | Qurilmaga biriktirildi | yo'q |
| `sending` | Qurilma yuborayapti | yo'q |
| `sent` | Operatorga topshirildi — **muvaffaqiyat** | amalda ha |
| `delivered` | Operator yetkazilganini tasdiqladi | ha |
| `failed` | Yuborib bo'lmadi, `error.code` sababni aytadi | ha |
| `cancelled` | Siz bekor qildingiz | ha |
| `expired` | `expiresIn` muddati navbatda o'tib ketdi | ha |

`sent` — asosiy muvaffaqiyat belgisi. Yetkazilganlik hisoboti (`delivered`) hamma operator va
qurilmada kelmaydi, shuning uchun unga tayanmang.

Vaqtinchalik xatoda (qurilma oflayn, tarmoq yo'q) platforma o'zi boshqa SIM orqali qayta urinadi,
standart bo'yicha 3 martagacha. Siz qayta yuborishingiz shart emas.

---

## 6. Webhook'lar

Holatni so'rab turish (polling) o'rniga, platforma o'zi sizga xabar beradi.

**Manzil qo'shish** (`webhook:manage`):

```http
POST /api/v1/webhooks
Content-Type: application/json

{
  "url": "https://api.sizning-domen.uz/sms/webhook",
  "events": ["sms.sent", "sms.failed"]
}
```

Faqat `https` manzil qabul qilinadi. `events` bo'sh bo'lsa — hamma hodisalar. Javobda **`secret`
faqat bir marta** ko'rsatiladi — uni saqlang, imzoni tekshirish uchun kerak.

Boshqarish: `GET /webhooks`, `GET /webhooks/:uid`, `PATCH /webhooks/:uid`, `DELETE /webhooks/:uid`.
Tenant uchun 10 tagacha manzil.

**Hodisalar:**

| Hodisa | Qachon |
|---|---|
| `sms.sent` | SMS operatorga topshirildi |
| `sms.delivered` | Yetkazilganlik tasdiqlandi |
| `sms.failed` | Barcha urinishlardan keyin yuborib bo'lmadi |
| `sms.expired` | Muddati o'tdi, yuborilmadi |
| `sms.cancelled` | Bekor qilindi |
| `gateway.offline` | Sizga biriktirilgan qurilma aloqadan chiqdi |
| `balance.low` | Sizga biriktirilgan SIM balansi chegaradan pastga tushdi |

Faqat yakuniy hodisalar yuboriladi — oraliq qayta urinishlar haqida xabar kelmaydi.

**So'rov ko'rinishi:**

```http
POST https://api.sizning-domen.uz/sms/webhook
Content-Type: application/json
X-Sms-Event: sms.sent
X-Sms-Delivery: whd_01K6...
X-Sms-Signature: t=1790668800,v1=5f2c...

{
  "id": "whd_01K6...",
  "event": "sms.sent",
  "occurredAt": "2026-09-29T10:00:03.000+05:00",
  "data": {
    "uid": "sms_01K6...",
    "status": "sent",
    "recipient": "+998921324567",
    "reference": "qarz-1042",
    "segments": 1,
    "attempts": 1,
    "error": null,
    "sentAt": "2026-09-29T10:00:03.000+05:00",
    "deliveredAt": null,
    "failedAt": null,
    "event": "sms.sent"
  }
}
```

**Javob berish.** 10 soniya ichida istalgan `2xx` javob qaytaring. Og'ir ishni fonda bajaring,
javobni kechiktirmang. `2xx` bo'lmasa yoki vaqt tugasa, platforma o'sib boruvchi oraliq bilan qayta
yuboradi. Ketma-ket 20 ta muvaffaqiyatsizlikdan keyin manzil avtomatik o'chiriladi — tuzatgandan
keyin `PATCH /webhooks/:uid` bilan `{ "isActive": true }` yuborib qayta yoqasiz.

**Bir hodisa ikki marta kelishi mumkin** (tarmoq uzilishida). `id` ni saqlang va takrorini
e'tiborsiz qoldiring.

**Imzoni albatta tekshiring.** Aks holda istalgan odam sizga soxta "yuborildi" xabarini jo'nata
oladi. Imzo: `HMAC-SHA256(secret, "<t>.<xom body>")`, hex ko'rinishida. Body'ni **o'zgartirmasdan,
xom holida** oling (JSON'ni parse qilib qayta serializatsiya qilsangiz, imzo mos kelmaydi) va
5 daqiqadan eski `t` ni rad eting.

Node.js (Express):

```js
import crypto from 'node:crypto'
import express from 'express'

const app = express()

app.post('/sms/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('x-sms-signature') ?? ''
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  const t = Number(parts.t)

  const expected = crypto
    .createHmac('sha256', process.env.SMS_WEBHOOK_SECRET)
    .update(`${t}.${req.body.toString('utf8')}`)
    .digest('hex')

  const fresh = Math.abs(Date.now() / 1000 - t) <= 300
  const valid =
    parts.v1?.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected))

  if (!fresh || !valid) return res.sendStatus(401)

  const event = JSON.parse(req.body.toString('utf8'))
  // event.id bo'yicha takrorni tekshiring, keyin navbatga qo'ying
  res.sendStatus(200)
})
```

PHP (Laravel):

```php
$raw = $request->getContent();
parse_str(str_replace(',', '&', $request->header('X-Sms-Signature', '')), $parts);
$t = (int) ($parts['t'] ?? 0);

$expected = hash_hmac('sha256', $t . '.' . $raw, config('services.sms.webhook_secret'));

if (abs(time() - $t) > 300 || !hash_equals($expected, $parts['v1'] ?? '')) {
    abort(401);
}

$event = json_decode($raw, true);
// $event['id'] bo'yicha takrorni tekshiring
return response()->noContent();
```

---

## 7. Qayta urinish va `Idempotency-Key`

Tarmoq uzilsa, so'rovingiz serverga yetib borganmi yoki yo'qmi — bilmaysiz. Qayta yuborsangiz, abonent
ikki marta SMS olishi mumkin. Buning oldini olish uchun `POST /sms`, `/sms/bulk` va `/sms/batch`
so'rovlariga `Idempotency-Key` header'ini qo'shing:

```http
Idempotency-Key: qarz-eslatma-2026-09-29
```

- Kalit — 128 belgigacha istalgan unikal satr. Bitta mantiqiy yuborish uchun bitta kalit.
- Xuddi shu kalit va xuddi shu body bilan qayta yuborsangiz — yangi SMS yaratilmaydi, oldingi
  xabarlar `duplicate: true` bilan qaytadi.
- Ommaviy so'rovda kalit har element uchun uning tartib raqami bilan kengaytiriladi. Shuning uchun
  qayta yuborganda **massiv tartibini o'zgartirmang**.
- Xuddi shu kalitni **boshqa** matn yoki raqam bilan ishlatsangiz — `IDEMPOTENCY_CONFLICT`. Yangi
  yuborish uchun yangi kalit oling.

Qachon qayta urinish kerak:

| Javob | Nima qilish kerak |
|---|---|
| Tarmoq xatosi, timeout, `5xx` | Xuddi shu kalit bilan qayta yuboring |
| `429` | `error.details.retryAfterSeconds` soniya kuting, keyin qayta yuboring |
| `401` | Yangi token oling, qayta yuboring |
| `422`, `403`, `409` | Qayta yubormang — so'rovni tuzating |

---

## 8. Xatolar

Barcha xatolar bir xil ko'rinishda:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "details": { "retryAfterSeconds": 23 }
  }
}
```

Dasturingizda `code` bo'yicha qaror qiling, `message` matni o'zgarishi mumkin.

| Kod | HTTP | Ma'nosi |
|---|---|---|
| `VALIDATION_FAILED` | 422 | So'rov noto'g'ri tuzilgan. `details` qaysi maydon ekanini aytadi |
| `UNAUTHENTICATED` | 401 | Token yo'q, noto'g'ri yoki muddati o'tgan |
| `FORBIDDEN` | 403 / 409 | Ruxsat yo'q, yoki amalni bu holatda bajarib bo'lmaydi |
| `NOT_FOUND` | 404 | Bunday `uid` yo'q (yoki u boshqa tenantniki) |
| `RATE_LIMITED` | 429 | Daqiqalik limit tugadi |
| `IDEMPOTENCY_CONFLICT` | 409 | Kalit boshqa body bilan ishlatilgan |
| `TENANT_SUSPENDED` | 403 | Hisobingiz to'xtatilgan |
| `CLIENT_DISABLED` | 403 | API klient o'chirilgan |

Element darajasidagi xatolar (ommaviy yuborishda `data[i].error` ichida) va `failed` holatidagi
SMS'lar `error.code` maydonida:

| Kod | Ma'nosi |
|---|---|
| `INVALID_NUMBER` | Raqam noto'g'ri |
| `MESSAGE_TOO_LONG` | Matn 10 SMS qismidan uzun |
| `DUPLICATE_RECIPIENT` | Shu so'rovda bu raqamga shu matn allaqachon bor |
| `OPERATOR_NOT_FOUND` | `operator` qiymati noma'lum |
| `GATEWAY_NOT_FOUND` | `gatewayUid` topilmadi |
| `MESSAGE_EXPIRED` | `expiresIn` muddati o'tdi |
| `ATTEMPTS_EXHAUSTED` | Barcha urinishlar muvaffaqiyatsiz |
| `NO_GATEWAY_AVAILABLE` | Hozir bo'sh qurilma yo'q, xabar navbatda kutadi |

---

## 9. Limitlar

| Nima | Qiymat |
|---|---|
| Bitta `/sms/bulk` so'rovida | 1000 ta xabar |
| Bitta `/sms/batch` so'rovida | 100 ta xabar |
| So'rov hajmi | 4 MB |
| Xabar uzunligi | 10 SMS qismi. Lotin: 1 qism 160 belgi, ko'p qismli 153 dan. Kirill yoki emoji bo'lsa: 70, ko'p qismli 67 dan |
| Tezlik | API klient bo'yicha daqiqasiga N ta xabar. Standart — 60, administrator oshira oladi |
| Token muddati | 30 kun |

**Tezlik limiti ommaviy so'rovni butunligicha o'lchaydi.** 500 elementli so'rov 500 ta xabar hisoblanadi
va limitdan oshsa, butun so'rov `429` bilan rad etiladi — hech narsa yozilmaydi. Ommaviy yuboradigan
bo'lsangiz, administratordan limitni kerakli hajmga oshirishni so'rang.

**Qabul qilish va yuborish tezligi — boshqa-boshqa narsalar.** API xabarlarni darhol qabul qiladi, lekin
ular SIM kartalar orqali operator cheklovlariga mos tezlikda ketadi. Katta ro'yxat navbatda bir necha
daqiqa yoki soat turishi mumkin — bu normal holat. Vaqtga sezgir xabarlarga (tasdiqlash kodlari)
`"priority": "high"` va `expiresIn` qo'ying, shunda ular ommaviy navbatdan oldin ketadi va kechiksa
umuman yuborilmaydi.

**Lotin alifbosida yozing.** Bitta kirill harfi butun xabarni UCS-2 kodlashga o'tkazadi va u 160 emas,
70 belgili qismlarga bo'linadi — ya'ni narx ikki barobar oshadi. `o'` va `g'` dagi apostrof uchun oddiy
`'` ishlating, `ʻ` yoki `’` emas: ular ham xabarni UCS-2 ga o'tkazadi.
