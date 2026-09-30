/**
 * Kassani (POS) alohida oynada ochadi - ekran o'lchamida. Oyna allaqachon
 * ochiq bo'lsa o'sha oldinga chiqadi. To'liq ekran rejimi kassa ichida
 * birinchi bosishda yoqiladi (brauzer buni faqat foydalanuvchi harakati
 * bilan ruxsat beradi).
 */
export function openPos() {
  const width = window.screen.availWidth;
  const height = window.screen.availHeight;
  const opened = window.open("/pos", "gulbahor-pos", `popup=yes,left=0,top=0,width=${width},height=${height}`);
  // Qalqib chiquvchi oyna bloklansa - shu oynaning o'zida ochiladi
  if (!opened) window.location.assign("/pos");
  else opened.focus();
}
