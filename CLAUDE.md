## Sadelik / Overengineering yasak
- İstenen değişikliğin en küçük hâlini yap. 200 satır yazdıysan ve 50 yeterliyse, 50'ye indir.
- İstenmeyen özellik, config, "esneklik" veya soyutlama ekleme.
- Gerçekleşmesi imkansız senaryolar için error handling/validation ekleme
  (İSTİSNA: auth, ödeme, güvenlik ile ilgili yerlerde validasyonu asla kısma).
- Sormadan yeni paket/dependency ekleme; önce stdlib ve projede zaten olanı kullan.
  Gerçekten gerekiyorsa hangi paket, neden, önce sor.

## Mevcut düzene uy
- Yazmadan önce repodaki en yakın örüntüyü bul ve onu takip et (import, error handling, dosya yapısı, isimlendirme).
- Zaten var olan bir yardımcı/abstraction varken yenisini icat etme.
- Hangi örüntünün "doğru" olduğundan emin değilsen sor, üçüncü bir yol uydurma.

## Cerrahi değişiklik
- Değiştirdiğin her satır isteğe doğrudan bağlı olsun.
- İlgisiz kodu "iyileştirme", yorum/format düzeltme yapma.
- Bozuk olmayan şeyi refactor etme. İlgisiz dead code fark edersen sil, sadece belirt.

## Rapor / özet yazarken
- Sonuç en başta. Giriş paragrafı, görev tekrarı yok.
- Sadece: ne değişti, hangi komutla test edilir, varsa risk. Fazlası yok.
- Gereksiz gerekçe/bağlam cümlesi ekleme, madde işaretleri kısa olsun.