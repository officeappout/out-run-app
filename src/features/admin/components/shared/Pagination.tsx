'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 md:px-6 py-3 md:py-4" dir="rtl">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 md:px-3 py-2 rounded-lg border border-gray-300 text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />
        </button>
        <span className="text-xs md:text-sm text-gray-700 px-1 md:px-2">
          עמוד {currentPage} מתוך {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 md:px-3 py-2 rounded-lg border border-gray-300 text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />
        </button>
      </div>
      <div className="text-xs md:text-sm text-gray-600">
        מציג {startItem}-{endItem} מתוך {totalItems}
      </div>
    </div>
  );
}
