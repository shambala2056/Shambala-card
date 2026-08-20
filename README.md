# Shambala — Ажилчдын NFC контакт карт

NFC таг уншуулахад ажилчны контакт **iOS болон Android** дээр асуудалгүй хадгалагдана.

## Яаж ажилладаг вэ

```
NFC таг  ──(URL record)──▶  .../e/<slug>/  ──▶  [Контакт хадгалах]  ──▶  contact.vcf  ──▶  Contacts
```

**Чухал:** NFC тагт vCard-ыг *шууд* бичихгүй. Учир нь iPhone-ны background NFC уншилт
зөвхөн **URL record**-д хариу өгдөг — `text/vcard` MIME record бичвэл Android дээр
ажиллаад iPhone дээр огт юу ч гарч ирэхгүй. Тагт URL бичихээр хоёр систем дээр ажиллана.

## Бүтэц

| Зам | Юу вэ |
|---|---|
| `data/employees.json` | Ганц эх сурвалж — бүх ажилчны мэдээлэл энд |
| `scripts/build.mjs` | Генератор |
| `e/<slug>/index.html` | Тухайн ажилчны хуудас (NFC тагт бичих URL) |
| `e/<slug>/contact.vcf` | vCard 3.0, UTF-8, CRLF |
| `index.html` | Бүх ажилчны жагсаалт |

`e/` доторх бүх зүйл **generated** — гараар бүү засаарай. `employees.json`-оо засаад дахин build хий.

## Ашиглах

```bash
node scripts/build.mjs      # dependency шаардлагагүй
git add -A && git commit -m "Update contacts" && git push
```

Дараа нь GitHub → **Settings → Pages → Source: Deploy from a branch → main / (root)**.
1–2 минутын дараа `https://shambala2056.github.io/Shambala-card/` дээр нээгдэнэ.

## NFC тагт бичих

1. Android дээр **NFC Tools** (эсвэл NXP TagWriter) суулгана.
2. Write → Add a record → **URL / URI**.
3. Ажилчны URL-ыг оруулна: `https://shambala2056.github.io/Shambala-card/e/<slug>/`
4. Write → тагаа ойртуулна.
5. **Lock / Read-only** сонголтыг тагийг эцэслэн баталгаажуулсны дараа л дарна (буцаагдахгүй).

> NTAG213 (144 байт) хангалттай — URL ~50 байт.
> iPhone дээр туршихдаа: дэлгэц асаалттай, түгжээтэй байсан ч дээд талд banner гарч ирнэ.
> iPhone 7–XR бол Control Center-ийн NFC товчийг ашиглах шаардлагатай (iOS 14-өөс өмнөх загварууд).

## Талбарууд (`data/employees.json`)

| Талбар | Заавал | Тайлбар |
|---|---|---|
| `slug` | ✅ | URL-д орох латин нэр, давхардахгүй (`shijijbat`) |
| `lastName` / `firstName` | ✅ | Овог / Нэр |
| `displayName` | | Зөвхөн онцгой тохиолдолд — үндсэндээ `firstName` + `lastName`-ээс автоматаар үүснэ |
| `aliases` | | Хуучин slug-ууд — тэднээс шинэ хаяг руу redirect хуудас үүснэ |
| `org`, `title` | | Байгууллага, албан тушаал |
| `phoneMobile`, `phoneWork` | | `+976 91918097` хэлбэрээр |
| `email`, `website`, `address`, `note` | | |
| `websites` | | Олон вэб хаяг — жагсаалтын эхнийх нь эхэнд харагдана, `website`-г дарж бичнэ |

Хоосон талбар vCard-д огт орохгүй тул `""` орхиход асуудалгүй.

### Contacts дээр харагдах нэр

`site.displayNameSuffix` (одоо `"Shambala"`) нь ажилтан бүрийн `firstName`-ий ард залгагдаж
vCard-ын `FN` талбарыг үүсгэнэ — жишээ нь **Shijijbat Shambala**. Ганц газраас өөрчилнө.
Хөрөг зураг оруулахгүй тул хуудсан дээр нэрний эхний үсгүүд (`SS`) дугуй дотор гарна.
