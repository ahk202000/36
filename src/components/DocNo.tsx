"use client";

import { toPersianDigits } from "@/lib/utils";

/**
 * نمایش شماره نامه / پیش‌فاکتور با جهت چپ‌به‌راست ایزوله.
 * شماره‌هایی مثل «PF-1404-0012» یا «1404/0012/2e» در متن راست‌به‌چپ به‌خاطر
 * خط تیره و حروف لاتین جابه‌جا نمایش داده می‌شدند؛ <bdi dir="ltr"> ترتیب
 * اجزای شماره را حفظ می‌کند.
 */
export default function DocNo({
  v,
  persian = true,
  className,
}: {
  v: string | number | null | undefined;
  persian?: boolean;
  className?: string;
}) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <bdi dir="ltr" className={className} style={{ unicodeBidi: "isolate", direction: "ltr", display: "inline-block" }}>
      {persian ? toPersianDigits(v) : String(v)}
    </bdi>
  );
}
