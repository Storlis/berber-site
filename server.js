// Berber randevu sitesi - sunucu
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// ====== AYARLAR (burayı kendine göre değiştir) ======
const ADMIN_SIFRE = process.env.ADMIN_SIFRE ||    Math.random().toString(36);          // admin panel şifresi
const ACILIS = 10, KAPANIS = 19;          // 10:00 - 19:00
const MAIL_ALICI = 'ustamakas@gmail.com';   // bildirim gidecek mail
const SMTP = { host: 'smtp.gmail.com', port: 465, secure: true,
  auth: { user: 'gonderen@gmail.com', pass: 'GMAIL_UYGULAMA_SIFRESI' } };
// =====================================================

const DB = path.join(__dirname, 'randevular.json');
const oku = () => fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : [];
const KAPALI = path.join(__dirname, 'kapali.json');
const kapaliOku = () => fs.existsSync(KAPALI) ? JSON.parse(fs.readFileSync(KAPALI, 'utf8')) : [];
const yaz = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function saatler() {
  const s = [];
  for (let h = ACILIS; h < KAPANIS; h++) { s.push(`${h}:00`.padStart(5, '0')); s.push(`${h}:30`.padStart(5, '0')); }
  return s;
}

// Bir günün dolu saatleri
app.get('/api/slots', (req, res) => {
  const tarih = req.query.tarih;
  const kapali = kapaliOku().includes(tarih);
  const dolu = oku().filter(r => r.tarih === tarih).map(r => r.saat);
  res.json(saatler().map(s => ({ saat: s, dolu: kapali || dolu.includes(s) })));
});

// Randevu al
app.post('/api/randevu', async (req, res) => {
  const { ad, telefon, tarih, saat, hizmet } = req.body;
  if (!ad || !telefon || !tarih || !saat) return res.status(400).json({ hata: 'Tüm alanları doldurun.' });
  if (!saatler().includes(saat)) return res.status(400).json({ hata: 'Geçersiz saat.' });
  if (new Date(`${tarih}T${saat}`) < new Date()) return res.status(400).json({ hata: 'Geçmiş bir zamana randevu alınamaz.' });
  if (kapaliOku().includes(tarih)) return res.status(400).json({ hata: 'Bu gün dükkan kapalı.' });
  const liste = oku();
  if (liste.some(r => r.tarih === tarih && r.saat === saat))
    return res.status(409).json({ hata: 'Bu saat az önce doldu, başka saat seçin.' });
  const yeni = { id: Date.now(), ad: ad.slice(0, 60), telefon: telefon.slice(0, 20), tarih, saat, hizmet: hizmet || 'Saç Kesimi' };
  liste.push(yeni); yaz(liste);
  res.json({ tamam: true });
  // Mail bildirimi (hata olsa bile randevu kaydedilmiş olur)
  try {
    await nodemailer.createTransport(SMTP).sendMail({
      from: SMTP.auth.user, to: MAIL_ALICI,
      subject: `Yeni randevu: ${yeni.tarih} ${yeni.saat}`,
      text: `Ad: ${yeni.ad}\nTelefon: ${yeni.telefon}\nHizmet: ${yeni.hizmet}\nTarih: ${yeni.tarih}\nSaat: ${yeni.saat}`
    });
  } catch (e) { console.log('Mail gönderilemedi:', e.message); }
});

// Admin
const yetki = (req, res, next) =>
  req.headers['x-sifre'] === ADMIN_SIFRE ? next() : res.status(401).json({ hata: 'Şifre yanlış' });
app.get('/api/admin/randevular', yetki, (req, res) =>
  res.json(oku().sort((a, b) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat))));
app.delete('/api/admin/randevu/:id', yetki, (req, res) => {
  yaz(oku().filter(r => r.id !== Number(req.params.id))); res.json({ tamam: true });
});

app.get('/api/admin/kapali', yetki, (req, res) => res.json(kapaliOku()));
app.post('/api/admin/kapali', yetki, (req, res) => {
  const l = kapaliOku(); if (!l.includes(req.body.tarih)) l.push(req.body.tarih);
  fs.writeFileSync(KAPALI, JSON.stringify(l)); res.json(l);
});
app.delete('/api/admin/kapali/:tarih', yetki, (req, res) => {
  const l = kapaliOku().filter(t => t !== req.params.tarih);
  fs.writeFileSync(KAPALI, JSON.stringify(l)); res.json(l);
});

const DUY = path.join(__dirname, 'duyuru.json');
app.get('/api/duyuru', (req, res) => res.json(fs.existsSync(DUY) ? JSON.parse(fs.readFileSync(DUY, 'utf8')) : { metin: '' }));
app.post('/api/admin/duyuru', yetki, (req, res) => {
  fs.writeFileSync(DUY, JSON.stringify({ metin: String(req.body.metin || '').slice(0, 140) })); res.json({ tamam: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Site hazır: http://localhost:' + PORT));
