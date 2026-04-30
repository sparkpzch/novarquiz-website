"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type VirtualListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Estimated height per item in px (used for initial layout; measured dynamically) */
  estimateSize?: number;
  /** Height of the scroll container in px */
  containerHeight: number;
  /** Gap between items in px (equivalent to space-y-*) */
  gap?: number;
  className?: string;
};

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 64,
  containerHeight,
  gap = 0,
  className,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
    gap,
  });

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ height: containerHeight, overflowY: "auto" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
