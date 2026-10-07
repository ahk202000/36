"use client";

/**
 * نمایش متن فارسیِ حاوی شماره سند (نامه/پیش‌فاکتور) بدون به‌هم‌ریختن ترتیب شماره.
 *
 * ایراد قبلی: شماره نامه داخل متن راست‌به‌چپ (مثلاً کامنت «ارجاع نامه 1404/0012
 * به واحد بازرگانی» یا اعداد دارای خط تیره/حرف لاتین مثل PF-1404-0012) به‌خاطر
 * الگوریتم bidi برعکس/جابه‌جا دیده می‌شد. این کامپوننت توکن‌های شبیه شماره سند
 * را پیدا کرده و داخل <bdi dir="ltr"> ایزوله می‌کند.
 */

// توکن عددی/سندی: شامل رقم + جداکننده‌های رایج شماره سند یا حروف لاتینِ چسبیده به عدد
const TOKEN_RE = /[A-Za-z]*\d[\dA-Za-z]*(?:[/\-_.\\][\dA-Za-z]+)*/g;

export default function BidiText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  const str = String(text);
  const parts: Array<{ key: number; ltr: boolean; value: string }> = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of str.matchAll(TOKEN_RE)) {
    const idx = match.index ?? 0;
    const token = match[0];
    // فقط توکن‌هایی که رقم دارند ایزوله می‌شوند (همین regex رقم را الزامی کرده)
    if (idx > lastIndex) {
      parts.push({ key: key++, ltr: false, value: str.slice(lastIndex, idx) });
    }
    parts.push({ key: key++, ltr: true, value: token });
    lastIndex = idx + token.length;
  }
  if (lastIndex < str.length) {
    parts.push({ key: key++, ltr: false, value: str.slice(lastIndex) });
  }

  return (
    <span dir="rtl" className={className} style={{ unicodeBidi: "plaintext" }}>
      {parts.map((p) =>
        p.ltr ? (
          <bdi key={p.key} dir="ltr" style={{ unicodeBidi: "isolate", direction: "ltr", display: "inline-block" }}>
            {p.value}
          </bdi>
        ) : (
          <span key={p.key}>{p.value}</span>
        )
      )}
    </span>
  );
}
