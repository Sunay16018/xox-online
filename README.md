# XOX Online - ELO Rating Sistemi

Premium kalitede, Socket.IO tabanli online XOX oyunu.

## Ozellikler

- Hesap sistemi (kayit/giris)
- Avatar URL ile profil resmi
- Oda olusturma (6 haneli kod)
- Odaya katilma (kod ile)
- Hizli eslesme (ELO rating bazli)
- 1-5 tur secimi
- ELO Rating sistemi (chess.com tarzi)
- Win Streak bonus sistemi
- Global ve oda ici chat
- Turkiye saati ile zaman damgasi
- Liderlik tablosu
- MongoDB Atlas entegrasyonu

## Teknolojiler

- Node.js + Express
- Socket.IO
- MongoDB Atlas (Mongoose)
- JWT Authentication
- bcryptjs

## Deploy (Render.com)

1. GitHub repo olustur ve push et
2. Render.com'da "New Web Service" sec
3. GitHub repo'yu bagla
4. Environment Variables ekle:
   - `MONGODB_URI`: mongodb+srv://xox:xoxadmin@xox.er1hgnl.mongodb.net/xox_game?retryWrites=true&w=majority
   - `JWT_SECRET`: guclu-bir-sifre-yaz
5. Deploy!

## Yerel Calistirma

```bash
npm install
npm start
```

Sunucu `http://localhost:3000` adresinde calisir.
