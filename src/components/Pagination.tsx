"use client";

import { toPersianDigits } from "@/lib/utils";

interface Props {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  if (totalItems === 0) return null;

  const safePage = Math.min(currentPage, totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
      <div className="text-xs text-gray-500">
        نمایش {toPersianDigits(start)} تا {toPersianDigits(end)} از {toPersianDigits(totalItems)} مورد
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value={10}>۱۰ در صفحه</option>
          <option value={20}>۲۰ در صفحه</option>
          <option value={50}>۵۰ در صفحه</option>
          <option value={100}>۱۰۰ در صفحه</option>
        </select>

        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            «
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            قبلی
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) pageNum = i + 1;
            else if (safePage <= 3) pageNum = i + 1;
            else if (safePage >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = safePage - 2 + i;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                  pageNum === safePage ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {toPersianDigits(pageNum)}
              </button>
            );
          })}

          <button
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            بعدی
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
